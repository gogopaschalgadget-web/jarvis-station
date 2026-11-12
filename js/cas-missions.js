// cas-missions.js - the Missions tab. A summary that folds up, a work area like Cas chat, and a mission board
// that folds down with one tab per source. Every answer is a signed message to Cas; nothing here posts,
// publishes or spends by itself. Server text goes in with textContent only. No em dashes.

import { sendMessage, loadHistory, listThreads, createThread, createFolder, projectStatus, loadDraft, saveDraft } from './cas-chat.js';

const POLL_MS = 20_000;
const ASK_POLL_MS = 4_000;
const ASK_WAIT_MS = 15 * 60_000;
const GOAL = 8000;
const FACE = 'assets/cas/face.jpg';
const SOURCES = [['projects', 'Projects'], ['loops', 'Loops'], ['review', 'Review'], ['x', 'X posts']];
const KEY_THREADS = 'mx-threads';
const KEY_UI = 'mx-ui';
const DONE_EVENTS = new Set(['mission_done', 'project_answered', 'loop_approved', 'loop_answered', 'loop_standing', 'loop_changed', 'loop_stopped']);
const GATE = {
  pass: 'Compliance check: passed.',
  fix: 'Compliance check: needs a fix before it can go out.',
  ask: 'Compliance check: needs your call.',
  not_connected: 'Compliance check: not connected yet. Publishing stays off.',
  error: 'Compliance check: did not run. Publishing stays off.',
};
const COPY_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>';
const ASK_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16v12H9l-5 4V4Z"/><path d="M9.5 8.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5M12 14.5v.01"/></svg>';

let _o = { apiBase: '', getToken: () => '', send: async () => {}, openThread: () => {}, openReview: () => {}, getHealth: () => null };
let _panel = null;
let _timer = null;
let _status = null;
let _x = { items: null, loading: false, error: false };
let _tab = 'projects';
let _selected = null;            // the mission in the work area
let _dashOpen = true;
let _boardOpen = true;
let _local = {};                 // per mission: { sent, chosen, editing, asking, draft, opened }
let _talk = {};                  // per mission: [{ q, reply, error, thread, title, id }]
let _built = false;

const store = {
  json(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} },
};

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}

function btn(cls, text, onClick) {
  const node = el('button', cls, text);
  node.type = 'button';
  node.addEventListener('click', onClick);
  return node;
}

/** Sending saves the text as the Cas chat draft for retries. Keep whatever Chris had half typed there. */
async function keepDraft(work) {
  const kept = loadDraft();
  try { return await work(); } finally { if (kept) saveDraft(kept); }
}

/** The same line the PC fingerprints: what Chris sees on the card is what his approval covers. */
async function cardFingerprint(card) {
  const line = [card.goal, card.success_target, card.rounds, card.round_days, Number(card.budget_monthly || 0).toFixed(2)].map(String).join('|');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(line));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 12);
}

async function approveLoop(mission) {
  const seen = await cardFingerprint(mission.card || {});
  if (mission.card_fp && seen !== mission.card_fp) {
    toast('This card does not match what Cas drafted. Wait a moment for it to update, then check it again.');
    return;
  }
  command(mission, `approve loop ${mission.loop} card ${seen}`, 'Approved on this phone. Round 1 gets built next.');
}

function local(id) { return (_local[id] = _local[id] || {}); }

function toast(text) {
  const node = el('div', 'mx-toast', text);
  node.setAttribute('role', 'status');
  document.body.append(node);
  setTimeout(() => node.remove(), 2200);
}

function ago(seconds) {
  if (!seconds) return 'none';
  const s = Math.max(0, Date.now() / 1000 - seconds);
  if (s < 3600) return Math.max(1, Math.round(s / 60)) + ' min';
  if (s < 86400) return Math.round(s / 3600) + ' h';
  return Math.round(s / 86400) + ' d';
}

function money(value) { return '$' + Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 }); }

// ---- what is waiting, by source ---------------------------------------------------
function xMissions() {
  return (_x.items || []).map(item => ({
    id: 'x-' + String(item.review_id).toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 30), kind: 'x', source: 'x',
    title: item.content.split('\n')[0].slice(0, 120), item,
  }));
}

function reviewMissions() {
  const pending = (((_o.getHealth() || {}).queue || {}).by_status || {}).pending || 0;
  return pending ? [{ id: 'review-drafts', kind: 'review', source: 'review', title: pending + ' content draft(s) wait for review', count: pending }] : [];
}

function loopRows() {
  return ((_status && _status.loops) || []).map(loop => ({
    id: 'loopinfo-' + loop.number, kind: 'loop', source: 'loops', title: loop.number + ' · ' + loop.title, loop, info: true,
  }));
}

function missions(source) {
  const server = ((_status && _status.missions) || []).filter(m => !source || m.source === source);
  if (source === 'x') return xMissions();
  if (source === 'review') return reviewMissions();
  if (source === 'loops') return [...server, ...loopRows()];
  if (!source) return [...server, ...reviewMissions(), ...xMissions()];
  return server;
}

function waiting(source) { return missions(source).filter(m => !m.info && !local(m.id).sent); }

function find(id) {
  return [...missions(), ...loopRows()].find(m => m.id === id) || null;
}

// ---- sending -----------------------------------------------------------------------
async function command(mission, text, doneText) {
  const state = local(mission.id);
  state.busy = true; render();
  try {
    await keepDraft(() => _o.send(text));
    state.sent = doneText || 'Sent. Cas confirms in a moment.';
    setTimeout(refresh, 3000);
  } catch {
    toast('Not sent. Check the connection and try again.');
  }
  state.busy = false; render();
}

async function xDecision(mission, decision) {
  const state = local(mission.id);
  state.busy = true; render();
  try {
    const res = await fetch(`${_o.apiBase}/api/station/x-review/decision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + _o.getToken() },
      body: JSON.stringify({ review_id: mission.item.review_id, decision }),
    });
    if (!res.ok && res.status !== 404 && res.status !== 409) throw new Error(String(res.status));
    state.sent = decision === 'posted' ? 'Marked as posted by you.' : 'Declined. It will not be offered again.';
    setTimeout(loadX, 1500);
  } catch { toast('Not saved. Try again.'); }
  state.busy = false; render();
}

function summaryText(mission) {
  const lines = [`Mission ${mission.id}: ${mission.title}`];
  if (mission.card) lines.push(`Goal: ${mission.card.goal}`, `Success test: ${mission.card.success_target} paid orders in one round`);
  if (mission.options && mission.options.length) lines.push('Options: ' + mission.options.join(' / '));
  if (mission.item && mission.item.text) lines.push(mission.item.text);
  if (mission.item && mission.item.content) lines.push(mission.item.content);
  if (mission.loop && mission.info) lines.push(mission.loop.headline);
  return lines.join('\n');
}

async function copy(text, label) {
  try { await navigator.clipboard.writeText(text); toast(label || 'Copied'); }
  catch { toast('Copy did not work on this phone.'); }
}

// ---- asking Cas about a mission: one thread per mission, in a folder per source ----------
async function threadFor(mission) {
  const saved = store.json(KEY_THREADS, {});
  const label = (SOURCES.find(s => s[0] === mission.source) || ['', 'Other'])[1] + ' missions';
  const title = mission.title.slice(0, 80) || 'Mission';
  const data = await listThreads();
  const threads = data.threads || [];
  if (saved[mission.id] && threads.some(t => t.id === saved[mission.id])) return { id: saved[mission.id], folder: label, title };
  let folder = (data.folders || []).find(f => f.name === label);
  if (!folder) folder = await createFolder(label);
  let thread = threads.find(t => t.folder_id === folder.id && t.title === title);
  if (!thread) thread = await createThread({ title, folder_id: folder.id, parent_id: null, model: 'sonnet' });
  saved[mission.id] = thread.id;
  store.set(KEY_THREADS, saved);
  return { id: thread.id, folder: label, title };
}

async function ask(mission, question) {
  const talk = (_talk[mission.id] = _talk[mission.id] || []);
  const entry = { q: question };
  talk.push(entry);
  local(mission.id).draft = '';
  render();
  try {
    const thread = await threadFor(mission);
    Object.assign(entry, { thread: thread.id, folder: thread.folder, title: thread.title });
    // PC missions are found by id; posts and drafts only exist on this phone, so their text goes with the question.
    const known = mission.kind !== 'x' && mission.kind !== 'review' && !mission.info;
    const body = known ? `Mission: ${mission.id}\n${question}` : `About this mission:\n${summaryText(mission)}\n\n${question}`;
    const item = await keepDraft(() => sendMessage(body, [], { threadId: thread.id, header: '@sonnet ask' }));
    entry.id = item.id;
    render();
    waitForReply(entry, Date.now());
  } catch {
    entry.error = 'Not sent. Check the connection, then ask again.';
    render();
  }
}

async function waitForReply(entry, started) {
  if (Date.now() - started > ASK_WAIT_MS) { entry.error = 'No answer yet. It will still arrive in the thread.'; render(); return; }
  try {
    const items = await loadHistory(10, entry.thread);
    const found = items.find(i => i.id === entry.id);
    if (found && (found.reply || found.error)) {
      if (found.reply) entry.reply = found.reply; else entry.error = found.error;
      render();
      return;
    }
  } catch { /* try again shortly */ }
  setTimeout(() => waitForReply(entry, started), ASK_POLL_MS);
}

// ---- the cards ----------------------------------------------------------------------
function row(label, value, small) {
  const r = el('div', 'mx-row');
  const v = el('span', '', value);
  if (small) v.append(el('small', '', small));
  r.append(el('b', '', label), v);
  return r;
}

function head(left, right) {
  const h = el('h4');
  const l = el('span');
  if (left instanceof Node) l.append(left); else l.textContent = left;
  h.append(l);
  if (right) h.append(el('em', '', right));
  return h;
}

function numbered(number, label) {
  const span = el('span');
  span.append(el('span', 'mx-n', String(number)), document.createTextNode(label));
  return span;
}

function ownWords(mission, prefix, placeholder) {
  const state = local(mission.id);
  if (!state.editing) return btn('mx-btn brass', 'Your own words', () => { state.editing = true; render(); });
  const box = el('div', 'mx-askbox');
  const area = el('textarea');
  area.placeholder = placeholder;
  area.value = state.words || '';
  area.addEventListener('input', () => { state.words = area.value; });
  const go = btn('', 'Send', () => {
    const text = (state.words || '').trim();
    if (text) { state.editing = false; command(mission, prefix + text); }
  });
  box.append(area, go);
  setTimeout(() => area.focus(), 0);
  return box;
}

function cardLoop(mission) {
  const c = mission.card || {};
  const card = el('div', 'mx-card');
  card.append(head(`LOOP ${mission.loop} · TRIAL`, 'YOUR CALL (R42)'));
  card.append(row('Goal', c.goal || ''));
  card.append(row('Success test', `${c.success_target} genuine paid orders in one round.`, 'Counted from Gumroad sales. Never views or likes.'));
  card.append(row('Stop rule', `Ends after ${c.rounds} rounds of ${c.round_days} days, or when you tap Stop.`));
  card.append(row('Budget', `${money(c.budget_monthly)} a month of your $50 cap.`));
  if (c.needs && c.needs.length) card.append(row('Needs from you', c.needs.join('. ')));
  if (c.first_round) card.append(row('Round 1 makes', c.first_round));
  if (c.can_see && c.can_see.length) {
    const r = el('div', 'mx-row');
    const v = el('span');
    c.can_see.forEach(item => {
      const line = el('div');
      line.append(el('span', item.ok === true ? 'mx-ok' : item.ok === false ? 'mx-no' : 'mx-unk', item.ok === true ? '✓ ' : item.ok === false ? '✗ ' : '? '),
        document.createTextNode(item.what + ': '), el('small', '', item.how));
      v.append(line);
    });
    r.append(el('b', '', 'Can Cas see it?'), v);
    card.append(r);
  }
  const state = local(mission.id);
  if (!state.sent) {
    const b = el('div', 'mx-btns');
    b.append(btn('mx-btn red', 'Approve', () => approveLoop(mission)));
    if (!state.editing) b.append(btn('mx-btn brass', 'Change', () => { state.editing = true; render(); }));
    card.append(b);
    if (state.editing) card.append(ownWords(mission, `change loop ${mission.loop}: `, 'What should change? For example: success test 5 orders'));
  }
  return card;
}

function cardAsk(mission) {
  const card = el('div', 'mx-card');
  card.append(head(numbered(mission.number, mission.kind === 'change' ? ' NEXT ROUND' : mission.kind === 'go_live' ? ' START THE CLOCK' : ' QUESTION'), mission.source === 'loops' ? `LOOP ${mission.loop || ''}`.trim() : `PROJECT ${mission.project || ''}`.trim()));
  card.append(el('p', '', mission.title));
  if (mission.why) card.append(el('div', 'mx-note', 'Why: ' + mission.why));
  const state = local(mission.id);
  (mission.options || []).forEach((option, index) => {
    const o = btn('mx-opt' + (state.chosen === index ? ' chosen' : ''), '', () => {
      if (state.sent || state.busy) return;
      state.chosen = index;
      command(mission, `answer ${mission.number}: ${index + 1}`, 'Answered on this phone.');
    });
    o.append(el('i', '', String(index + 1)), document.createTextNode(option));
    if (option === mission.recommendation) o.append(el('span', 'mx-pick', ' · my pick'));
    o.disabled = !!state.sent || !!state.busy;
    card.append(o);
  });
  if (!state.sent) card.append(ownWords(mission, `answer ${mission.number}: `, 'Your answer'));
  return card;
}

function cardPush(mission) {
  const card = el('div', 'mx-card');
  card.append(head(`PUSH · PROJECT ${mission.project}`, 'FOR REVIEW'), el('p', '', mission.title));
  card.append(el('div', 'mx-note', 'It goes to its own branch for review. It does not go on main and nothing deploys. The signed push button arrives in Cas chat.'));
  if (!local(mission.id).sent) {
    const b = el('div', 'mx-btns');
    b.append(btn('mx-btn red', 'Get the push button', () => command(mission, `ship ${mission.project}`, 'Asked. The push button is in Cas chat.')));
    card.append(b);
  }
  return card;
}

function publishLink(item) {
  if (item.kind === 'x_post') return 'https://x.com/intent/tweet?text=' + encodeURIComponent(item.text);
  if (item.kind === 'gumroad_listing') return 'https://app.gumroad.com/products';
  return null;
}

function cardPublish(mission) {
  const item = mission.item || {};
  const check = mission.compliance || { result: 'not_connected', notes: [] };
  const card = el('div', 'mx-card');
  card.append(head('PUBLISH · ' + String(item.kind || '').replace('_', ' ').toUpperCase(), `LOOP ${mission.loop} · ROUND ${mission.round}`));
  if (item.title) card.append(el('p', '', item.title));
  if (item.price != null) card.append(el('div', 'mx-note', `Price: ${money(item.price)}. Prices are your call (R26).`));
  card.append(el('div', 'mx-text', item.text || ''));
  const gate = el('div', 'mx-gate ' + check.result, GATE[check.result] || GATE.error);
  (check.notes || []).forEach(n => { if (!/not connected yet/i.test(n)) gate.append(el('small', '', ' ' + n)); });
  card.append(gate);
  const state = local(mission.id);
  if (state.sent) return card;
  const b = el('div', 'mx-btns');
  b.append(btn('mx-btn brass', 'Copy text', () => copy(item.text || '', 'Text copied')));
  if (check.result === 'pass') {
    if (state.opened) {
      b.append(btn('mx-btn red', 'Yes, it is out', () => command(mission, `mission done ${mission.id}`, 'Marked as published by you.')));
      b.append(btn('mx-btn brass', 'Not yet', () => { state.opened = false; render(); }));
    } else {
      const link = publishLink(item);
      const a = el('a', 'mx-btn red', item.kind === 'x_post' ? 'Post on X' : 'Publish');
      if (link) { a.href = link; a.target = '_blank'; a.rel = 'noopener'; }
      a.addEventListener('click', () => { if (!link) copy(item.text || ''); setTimeout(() => { state.opened = true; render(); }, 300); });
      b.append(a);
    }
  }
  b.append(btn('mx-btn brass', 'Turn down', () => {
    if (confirm('Turn this down? It will not be offered again.')) command(mission, `mission decline ${mission.id}`, 'Turned down.');
  }));
  card.append(b);
  return card;
}

function cardStanding(mission) {
  const card = el('div', 'mx-card');
  card.append(head('MAKE IT STANDING?', `LOOP ${mission.loop}`));
  card.append(el('p', '', 'It passed its success test. Standing means it runs a round on its schedule by itself, with the same rules and budget. Posts and listings still wait for your tap.'));
  if (!local(mission.id).sent) {
    const b = el('div', 'mx-btns');
    b.append(btn('mx-btn red', 'Make it standing', () => command(mission, `standing loop ${mission.loop}`, 'Standing. Signed on this phone.')));
    b.append(btn('mx-btn brass', 'Not yet', () => { _selected = null; render(); }));
    card.append(b);
  }
  return card;
}

function cardLoopInfo(mission) {
  const loop = mission.loop;
  const card = el('div', 'mx-card');
  card.append(head(`LOOP ${loop.number} · ${loop.trial ? 'TRIAL' : 'STANDING'}`, String(loop.status).replace('_', ' ').toUpperCase()));
  card.append(el('p', '', loop.headline));
  const target = (loop.card || {}).success_target;
  (loop.rounds || []).forEach(r => {
    const orders = r.orders == null ? (r.scored_at ? 'unknown' : 'not scored yet') : `${r.orders} of ${target}`;
    card.append(row(`Round ${r.n}`, `Paid orders ${orders}` + (r.money != null ? `, ${money(r.money)}` : ''), r.change ? 'Changed: ' + r.change : 'First round'));
  });
  if (!(loop.rounds || []).length) card.append(el('div', 'mx-note', 'No rounds yet.'));
  const state = local(mission.id);
  if (state.sent) return card;
  const b = el('div', 'mx-btns');
  if (loop.status === 'running' || loop.status === 'standing') b.append(btn('mx-btn brass', 'Score now', () => command(mission, `score loop ${loop.number}`, 'Scoring now. The scorecard comes to Cas chat.')));
  if (loop.thread) b.append(btn('mx-btn brass', 'Open its thread', () => _o.openThread(loop.thread)));
  if (!['stopped', 'blocked'].includes(loop.status)) {
    b.append(btn('mx-btn brass', 'Stop loop', () => { if (confirm(`Stop loop ${loop.number}? Cas records what it learned.`)) command(mission, `stop loop ${loop.number}`, 'Stopped.'); }));
  }
  if (b.childElementCount) card.append(b);
  return card;
}

function cardX(mission) {
  const card = el('div', 'mx-card');
  card.append(head('X POST', `${mission.item.content.length}/280`));
  card.append(el('div', 'mx-text', mission.item.content));
  const state = local(mission.id);
  if (state.sent) return card;
  const b = el('div', 'mx-btns');
  if (state.opened) {
    b.append(btn('mx-btn red', "Yes, it's posted", () => xDecision(mission, 'posted')));
    b.append(btn('mx-btn brass', 'Not yet', () => { state.opened = false; render(); }));
  } else {
    const a = el('a', 'mx-btn red', 'Open X to post');
    a.href = 'https://x.com/intent/tweet?text=' + encodeURIComponent(mission.item.content);
    a.target = '_blank'; a.rel = 'noopener';
    a.addEventListener('click', () => setTimeout(() => { state.opened = true; render(); }, 300));
    b.append(a, btn('mx-btn brass', 'Decline', () => { if (confirm('Decline this post? It will not be offered again.')) xDecision(mission, 'declined'); }));
  }
  card.append(b);
  return card;
}

function cardReview(mission) {
  const card = el('div', 'mx-card');
  card.append(head('REVIEW · CONTENT ENGINE', `${mission.count} WAITING`));
  card.append(el('p', '', 'Drafts from the Content Engine wait for your verdict. They open in the review screen you already use.'));
  const b = el('div', 'mx-btns');
  b.append(btn('mx-btn red', 'Open the review', () => _o.openReview()));
  card.append(b);
  return card;
}

const CARDS = { loop_card: cardLoop, ask: cardAsk, change: cardAsk, go_live: cardAsk, push: cardPush, publish: cardPublish, standing: cardStanding,
  loop: cardLoopInfo, x: cardX, review: cardReview };

function askRow(mission) {
  const r = el('div', 'mx-askrow');
  const label = btn('mx-asklabel', '', () => { const s = local(mission.id); s.asking = !s.asking; render(); });
  label.innerHTML = ASK_SVG;
  const words = el('span');
  words.append(document.createTextNode('Ask Cas about this mission '), el('small', '', '· saved as its own thread'));
  label.append(words);
  const cp = btn('mx-cp', '', () => copy(summaryText(mission), 'Mission copied. Paste it in any Cas thread.'));
  cp.innerHTML = COPY_SVG;
  cp.setAttribute('aria-label', 'Copy this mission');
  r.append(label, cp);
  return r;
}

function talkBlock(mission) {
  const wrap = el('div');
  (_talk[mission.id] || []).forEach(entry => {
    wrap.append(el('div', 'mx-m me', entry.q));
    if (entry.thread) {
      const chip = el('div', 'mx-thchip');
      const t = el('span');
      t.append(document.createTextNode('Saved as a thread: '), el('b', '', `${entry.folder} › ${entry.title}`));
      chip.append(t, btn('mx-mini', 'Open in Cas', () => _o.openThread(entry.thread)));
      wrap.append(chip);
    }
    if (entry.reply || entry.error || entry.id) {
      const m = el('div', 'mx-m cas');
      const who = el('div', 'mx-who');
      const img = el('img'); img.src = FACE; img.alt = '';
      who.append(img, document.createTextNode('Cas'));
      m.append(who, document.createTextNode(entry.reply || entry.error || 'Thinking about it...'));
      wrap.append(m);
    }
  });
  const state = local(mission.id);
  if (state.asking) {
    const box = el('div', 'mx-askbox');
    const area = el('textarea');
    area.placeholder = 'Ask Cas about this mission';
    area.value = state.draft || '';
    area.addEventListener('input', () => { state.draft = area.value; });
    box.append(area, btn('', 'Ask', () => { const q = (state.draft || '').trim(); if (q) ask(mission, q); }));
    wrap.append(box);
  }
  return wrap;
}

// ---- building the screen --------------------------------------------------------------
function build() {
  _panel.textContent = '';
  const root = el('div', 'mx');
  root.style.cssText = 'display:flex;flex-direction:column;height:100%;min-height:0';

  const dash = el('section', 'mx-dash' + (_dashOpen ? '' : ' closed'));
  dash.id = 'mx-dash';
  const dhandle = btn('mx-handle', '', () => { _dashOpen = !_dashOpen; saveUi(); render(); });
  dhandle.append(el('span', '', 'Summary'), el('small', '', ''), el('b', '', '▲'));
  dhandle.setAttribute('aria-expanded', String(_dashOpen));
  dash.append(el('div', 'mx-dash-in'), dhandle);

  const work = el('section', 'mx-work');
  work.id = 'mx-work';

  const board = el('section', 'mx-board' + (_boardOpen ? '' : ' closed'));
  board.id = 'mx-board';
  const bhandle = btn('mx-handle', '', () => { _boardOpen = !_boardOpen; saveUi(); render(); });
  bhandle.append(el('span', '', 'Mission board'), el('small', '', ''), el('b', '', '▼'));
  board.append(bhandle, el('div', 'mx-board-in'));

  root.append(dash, work, board);
  _panel.append(root);
  _built = true;
}

function renderDash() {
  const dash = document.getElementById('mx-dash');
  if (!dash) return;
  dash.classList.toggle('closed', !_dashOpen);
  const all = waiting();
  const oldest = all.reduce((min, m) => (m.created && (!min || m.created < min) ? m.created : min), 0);
  const today = new Date().toDateString();
  const doneToday = (((_status && _status.log) || {}).recent || [])
    .filter(e => DONE_EVENTS.has(e.event) && e.actor === 'phone' && new Date(e.utc).toDateString() === today).length;
  dash.querySelector('.mx-handle small').textContent = `${all.length} waiting · ${doneToday} done today`;
  const inner = dash.querySelector('.mx-dash-in');
  inner.textContent = '';

  const giver = el('div', 'mx-giver');
  const face = el('div', 'mx-face');
  const img = el('img'); img.src = FACE; img.alt = 'Cas';
  face.append(img);
  const words = el('div');
  words.append(el('b', '', 'Missions'), el('span', '', 'Given by Cas, your orchestrator'),
    el('q', '', all.length ? `${all.length} thing${all.length === 1 ? '' : 's'} need${all.length === 1 ? 's' : ''} you. Pick one from the board.` : 'Nothing needs you right now.'));
  giver.append(face, words);

  const tiles = el('div', 'mx-tiles');
  [[all.length, 'Waiting on you'], [doneToday, 'Done today'], [oldest ? ago(oldest) : 'none', 'Oldest waiting']].forEach(([v, l]) => {
    const t = el('div', 'mx-tile'); t.append(el('b', '', String(v)), document.createTextNode(l)); tiles.append(t);
  });

  const goal = el('div', 'mx-goal');
  const sales = _status && _status.sales;
  const top = el('div', 'mx-goal-top');
  if (sales && typeof sales.count === 'number') {
    top.append(el('span', '', 'Paid orders so far'), el('b', '', `${sales.count} · ${money(sales.total)} of ${money(GOAL)}`));
    const bar = el('div', 'mx-gbar'); const fill = el('i'); fill.style.width = Math.min(100, (Number(sales.total) || 0) / GOAL * 100) + '%'; bar.append(fill);
    goal.append(top, bar, el('small', '', 'Goal: $8,000 a month by April 10, 2027. Gumroad, all time; a this-month count is not tracked yet.'));
  } else {
    top.append(el('span', '', 'Paid orders'), el('b', '', 'unknown'));
    goal.append(top, el('small', '', 'Goal: $8,000 a month by April 10, 2027. The PC has not sent the Gumroad count yet.'));
  }

  const next = el('div', 'mx-next');
  const first = all[0];
  const label = el('span');
  if (first) { label.append(document.createTextNode('Next up: '), el('em', '', first.title)); next.append(label, btn('mx-mini hot', 'Work it', () => pick(first))); }
  else { label.textContent = 'Next up: nothing waiting.'; next.append(label); }

  const xp = el('div', 'mx-xp', 'Rewards and XP: built later. Each mission keeps a slot for them.');

  const { text: logText, bad } = missionLogStatus();
  inner.append(giver, tiles, goal, next, xp, el('div', 'mx-log' + (bad ? ' bad' : ''), logText));
}

/** One line about the master mission log, for the Missions summary and the Log screen. */
export function missionLogStatus() {
  const log = (_status && _status.log) || null;
  const watch = (_status && _status.log_watch) || null;
  if (watch && watch.problem) return { text: 'Mission log warning: ' + watch.problem, bad: true };
  if (log && log.check && log.check.ok === false) return { text: 'Mission log warning: the daily check found ' + (log.check.problem || 'a break in the chain') + '.', bad: true };
  if (!log) return { text: 'Mission log: waiting for the PC to report.', bad: false };
  const now = Date.now() / 1000;
  // The PC sends its newest link with every status; Railway notes when it last matched. Silence is a warning too.
  if (watch && watch.waiting_since && now - watch.waiting_since > 3600) {
    return { text: 'Mission log warning: the PC has not let Railway check its log for over an hour.', bad: true };
  }
  if (watch && watch.anchored_seq && watch.confirmed_at && now - watch.confirmed_at > 86400) {
    return { text: 'Mission log warning: the copy held off the PC has not been confirmed for over a day.', bad: true };
  }
  let text = `Mission log: ${log.check && log.check.ok ? 'intact at the last daily check' : 'not checked yet today'} · ${log.head_seq} entries`
    + (watch && watch.anchored_seq ? ` · copy held off the PC to entry ${watch.anchored_seq}` : ' · not yet held off the PC');
  if (log.failures) text += ` · ${log.failures} write(s) failed`;
  return { text, bad: !!log.failures };
}

/** The newest mission log entries, for the Log screen. Events and outcomes only, never message text. */
export function missionLogRecent() { return (((_status && _status.log) || {}).recent || []).slice(-12).reverse(); }

function renderWork() {
  const work = document.getElementById('mx-work');
  if (!work) return;
  if (work.contains(document.activeElement) && document.activeElement.tagName === 'TEXTAREA') return; // do not wipe what is being typed
  work.textContent = '';
  const mission = _selected ? find(_selected) : null;
  if (!mission) {
    if (_selected && local(_selected).sent) {
      work.append(el('div', 'mx-done', local(_selected).sent));
    }
    work.append(el('div', 'mx-empty', _selected ? 'That mission is finished.' : 'Pick a mission from the board below. It opens here.'));
    return;
  }
  const who = el('div', 'mx-m cas');
  const head = el('div', 'mx-who');
  const img = el('img'); img.src = FACE; img.alt = '';
  head.append(img, document.createTextNode('Cas'));
  who.append(head, document.createTextNode(mission.info ? 'Here is where this loop stands.' : 'Here is the mission. Tap to answer, or ask me about it first.'));
  work.append(who);
  const card = (CARDS[mission.kind] || cardAsk)(mission);
  const state = local(mission.id);
  if (state.sent) {
    const done = el('div', 'mx-done');
    done.append(el('span', '', state.sent), el('em', '', 'Reward and XP: later'));
    card.append(done);
  }
  card.append(askRow(mission));
  work.append(card, talkBlock(mission));
}

function renderBoard() {
  const board = document.getElementById('mx-board');
  if (!board) return;
  board.classList.toggle('closed', !_boardOpen);
  const total = waiting().length;
  board.querySelector('.mx-handle small').textContent = total ? `${total} waiting` : 'all clear';
  const inner = board.querySelector('.mx-board-in');
  inner.textContent = '';
  const srcs = el('div', 'mx-srcs');
  SOURCES.forEach(([key, label]) => {
    const tab = btn('mx-src' + (_tab === key ? ' on' : ''), label, () => { _tab = key; saveUi(); if (key === 'x' && _x.items === null) loadX(); render(); });
    const count = waiting(key).length;
    const badge = el('span', 'mx-badge' + (count ? '' : ' clear'), count ? String(count) : '✓');
    tab.append(badge);
    tab.setAttribute('aria-label', `${label}, ${count} waiting`);
    srcs.append(tab);
  });
  const list = el('div', 'mx-list');
  const rows = missions(_tab);
  if (_tab === 'x' && _x.loading) list.append(el('div', 'mx-hint', 'Loading X posts...'));
  else if (_tab === 'x' && _x.error) list.append(el('div', 'mx-hint', 'Could not load X posts. Tap X posts to try again.'));
  else if (!rows.length) list.append(el('div', 'mx-hint', _tab === 'loops' ? 'No loops yet. Tap Start loop on an idea in a Brainstorm thread.' : 'Nothing waiting here.'));
  rows.forEach(m => {
    const r = btn('mx-mrow' + (_selected === m.id ? ' on' : ''), '', () => pick(m));
    const icon = m.number ? String(m.number) : ({ loop_card: 'L', publish: 'P', push: '↑', standing: '★', loop: '↻', x: 'X', review: 'R' }[m.kind] || '•');
    const t = el('span', 'mx-mt');
    t.append(el('b', '', m.title), el('small', '', subtitle(m)));
    r.append(el('span', 'mx-mi' + (m.info ? ' info' : ''), icon), t);
    if (!m.info) r.append(el('span', 'mx-xpc', 'XP later'));
    r.append(el('span', 'mx-chev', '›'));
    list.append(r);
  });
  inner.append(srcs, list);
}

function subtitle(m) {
  if (local(m.id).sent) return 'Done on this phone';
  if (m.info) return m.loop.headline;
  if (m.kind === 'publish') return (GATE[(m.compliance || {}).result] || '').replace(/\.$/, '');
  if (m.kind === 'loop_card') return 'Loop card to approve';
  if (m.kind === 'ask' || m.kind === 'change' || m.kind === 'go_live') return `Question ${m.number}` + (m.created ? ` · ${ago(m.created)} ago` : '');
  if (m.kind === 'push') return 'Push for review';
  if (m.kind === 'x') return 'Tap to post on X yourself';
  return '';
}

function pick(mission) {
  _selected = mission.id;
  _dashOpen = false;
  _boardOpen = false;
  saveUi();
  render();
  document.getElementById('mx-work')?.scrollTo({ top: 0 });
}

function navBadge() {
  const item = document.querySelector('.nav-item[data-tab="missions"]');
  if (!item) return;
  let badge = item.querySelector('.mx-nav-badge');
  const count = waiting().length;
  if (!count) { badge?.remove(); return; }
  if (!badge) { badge = el('span', 'mx-nav-badge'); item.append(badge); }
  badge.textContent = count > 99 ? '99+' : String(count);
}

function saveUi() { store.set(KEY_UI, { tab: _tab, dash: _dashOpen, board: _boardOpen }); }

function render() {
  navBadge();
  if (!_panel || !_panel.classList.contains('visible')) return;
  if (!_built || !_panel.querySelector('.mx')) build();
  renderDash();
  renderWork();
  renderBoard();
}

// ---- data ------------------------------------------------------------------------------
async function refresh() {
  if (document.hidden) return;
  try {
    const data = await projectStatus();
    if (data && (data.status === null || typeof data.status === 'object')) _status = data.status;
  } catch { /* the next refresh tries again */ }
  render();
}

async function loadX() {
  _x.loading = true; _x.error = false; render();
  try {
    const res = await fetch(`${_o.apiBase}/api/station/x-review/queue`, { headers: { Authorization: 'Bearer ' + _o.getToken() } });
    if (!res.ok) throw new Error(String(res.status));
    _x.items = ((await res.json()).items || []).filter(i => i && typeof i.content === 'string');
  } catch { _x.error = true; }
  _x.loading = false;
  render();
}

/** The Missions tab was opened: draw it now and fetch fresh data. */
export function showMissions() {
  render();
  refresh();
  if (_x.items === null && !_x.loading) loadX();
}

/** Set up once. options: apiBase, getToken, send(text), openThread(id), openReview(), getHealth(). */
export function initMissions(panel, options) {
  if (_timer || !panel) return;
  _panel = panel;
  _o = { ..._o, ...options };
  const ui = store.json(KEY_UI, {});
  if (SOURCES.some(s => s[0] === ui.tab)) _tab = ui.tab;
  if (typeof ui.dash === 'boolean') _dashOpen = ui.dash;
  if (typeof ui.board === 'boolean') _boardOpen = ui.board;
  refresh();
  loadX();
  _timer = setInterval(() => { refresh(); }, POLL_MS);
  document.addEventListener('visibilitychange', refresh);
}
