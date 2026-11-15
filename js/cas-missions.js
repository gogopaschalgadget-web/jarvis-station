// cas-missions.js - the Missions tab. A summary that folds up, a work area like Cas chat, and a mission board
// that folds down with one tab per source. Every answer is a signed message to Cas; nothing here posts,
// publishes or spends by itself. Server text goes in with textContent only. No em dashes.

import { sendMessage, loadHistory, listThreads, createThread, createFolder, projectStatus, loadDraft, saveDraft } from './cas-chat.js';

const POLL_MS = 20_000;
const ASK_POLL_MS = 4_000;
const ASK_WAIT_MS = 15 * 60_000;
const GOAL = 8000;
const FACE = 'assets/cas/face.jpg';
const SOURCES = [['projects', 'Projects'], ['loops', 'Loops'], ['review', 'Review'], ['x', 'X posts'], ['quora', 'Quora']];
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
let _x = { items: null, posted: null, loading: false, error: false }; // queue (to post) and tracker (posted)
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
function xId(reviewId) {
  return 'x-' + String(reviewId).toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 30);
}

/** Where an X post stands: 1 check, 2 post, 3 record its link, 4 first numbers. 5 means every step is in. */
export function xStep(item) {
  if (!item.posted) return mayPublish(item.compliance, false) || (item.compliance && item.compliance.result === 'ask') ? 2 : 1;
  if (!item.post_url) return 3;
  if (item.views == null) return 4;
  return 5;
}

function xMissions() {
  const out = [];
  const seen = new Set();
  for (const item of _x.items || []) {
    seen.add(item.review_id);
    const blocked = !mayPublish(item.compliance, local(xId(item.review_id)).allowed) && !(item.compliance && item.compliance.result === 'ask');
    out.push({ id: xId(item.review_id), kind: 'x', source: 'x', title: item.content.split('\n')[0].slice(0, 120),
      item: { ...item, posted: false }, blocked });
  }
  for (const post of _x.posted || []) {
    if (post.status !== 'posted' || seen.has(post.review_id)) continue;
    const item = { ...post, posted: true, content: post.content_preview || '' };
    const step = xStep(item);
    if (step === 5) continue; // link and first numbers are in: done
    // Step 4 is Claude's (it reads the post in Chrome at 4 AM and 4 PM), so it waits without counting as on Chris.
    out.push({ id: xId(post.review_id), kind: 'x', source: 'x', title: item.content.split('\n')[0].slice(0, 120), item, info: step === 4 });
  }
  // Retired posts are a record, never something waiting on Chris: info rows stay out of every count and badge.
  const expired = _status && _status.x_expired;
  if (expired && (expired.retired_count > 0 || expired.full_count > 0)) {
    const parts = [];
    if (expired.retired_count) parts.push(`${expired.retired_count} retired`);
    if (expired.full_count) parts.push(`${expired.full_count} waiting for room`);
    out.push({ id: 'x-expired', kind: 'x_expired', source: 'x', expired, info: true, title: `Retired X posts (record): ${parts.join(', ')}` });
  }
  return out;
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
  if (source === 'quora') return quoraMissions();
  if (source === 'loops') return [...server, ...loopRows()];
  if (!source) return [...server, ...reviewMissions(), ...xMissions(), ...quoraMissions()];
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

async function xPost(path, body) {
  const res = await fetch(`${_o.apiBase}/api/station/x-review/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + _o.getToken() },
    body: JSON.stringify(body),
  });
  return res;
}

async function xDecision(mission, decision) {
  const state = local(mission.id);
  state.busy = true; render();
  try {
    const res = await xPost('decision', { review_id: mission.item.review_id, decision });
    if (!res.ok && res.status !== 404 && res.status !== 409) throw new Error(String(res.status));
    if (decision === 'posted') {
      state.opened = false; // the mission stays open: next it needs its X link
      toast('Step 2 done. Now record its X link.');
    } else {
      state.sent = 'Declined. It will not be offered again.';
    }
    await loadX();
  } catch { toast('Not saved. Try again.'); }
  state.busy = false; render();
}

/** Step 3: the post's own X link, pasted from X's Share button. Railway checks it is an x.com post link. */
async function xSaveLink(mission) {
  const state = local(mission.id);
  const url = (state.link || '').trim();
  if (!url) return;
  state.busy = true; render();
  try {
    const res = await xPost('link', { review_id: mission.item.review_id, url });
    if (res.status === 422) { toast('That is not an X post link. On X tap Share, then Copy link.'); }
    else if (!res.ok) { throw new Error(String(res.status)); }
    else { state.link = ''; toast('Step 3 done. Claude reads its numbers at 4 AM or 4 PM.'); await loadX(); }
  } catch { toast('Not saved. Try again.'); }
  state.busy = false; render();
}

/** Step 4 fallback: Chris types the two numbers himself. The server stamps the time. */
async function xSaveNumbers(mission) {
  const state = local(mission.id);
  const likes = Number(state.likes), views = Number(state.views);
  if (!Number.isInteger(likes) || !Number.isInteger(views) || likes < 0 || views < 0 || state.likes === '' || state.views === '') {
    toast('Type both numbers, 0 or more.');
    return;
  }
  state.busy = true; render();
  try {
    const res = await xPost('metrics-from-phone', { review_id: mission.item.review_id, likes, views });
    if (!res.ok) throw new Error(String(res.status));
    state.sent = 'All 4 steps recorded.';
    await loadX();
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
  if (mission.expired) (mission.expired.posts || []).forEach(p => lines.push(`- ${p.content} (made ${p.age_days} days ago)`));
  if (mission.q) {
    lines.push(`Quora question: ${mission.q.question.url}`, `Step ${Math.min(mission.q.step, 7)} of 7 (${mission.q.status})`);
    const text = mission.q.final || (mission.q.sharpened && mission.q.sharpened.text) || mission.q.answer;
    if (text) lines.push('Answer so far:', text);
  }
  return lines.join('\n');
}

async function copy(text, label) {
  try { await navigator.clipboard.writeText(text); toast(label || 'Copied'); return true; }
  catch { toast('Copy did not work on this phone.'); return false; }
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
    // only missions the PC itself sent are known there by id; for everything else the text goes with the question
    const known = !mission.info && ((_status && _status.missions) || []).some(m => m.id === mission.id);
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

/** Publishing is offered only on a pass, or on an "ask" that Chris has allowed himself. */
export function mayPublish(check, allowed) {
  return !!check && (check.result === 'pass' || (check.result === 'ask' && !!allowed));
}

/** The compliance box shown on every card that would go public. A missing answer counts as not checked. */
export function gateBox(check, allowed) {
  const result = (check && check.result) || 'not_connected';
  const box = el('div', 'mx-gate ' + result, result === 'ask' && allowed ? 'Compliance check: left to you, and you allowed it.' : (GATE[result] || GATE.error));
  ((check && check.notes) || []).forEach(n => { if (!/not connected yet/i.test(n)) box.append(el('small', '', ' ' + n)); });
  return box;
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
  card.append(gateBox(check, mission.allowed));
  const state = local(mission.id);
  if (state.sent) return card;
  const b = el('div', 'mx-btns');
  b.append(btn('mx-btn brass', 'Copy text', () => copy(item.text || '', 'Text copied')));
  if (check.result === 'ask' && !mission.allowed) {
    b.append(btn('mx-btn red', 'Allow it (your call)', () => {
      if (confirm('The compliance check left this one to you. Allow it to be published?')) command(mission, `mission allow ${mission.id}`, 'Allowed. Its Publish button turns on in a moment.');
    }));
  }
  if (mayPublish(check, mission.allowed)) {
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

function xStepRow(n, label, note, who, cls) {
  const li = el('li', 'mx-xstep ' + cls);
  const words = el('span');
  words.append(el('b', '', label), el('small', '', note));
  li.append(el('i', '', cls === 'done' ? '✓' : cls === 'bad' ? '!' : String(n)), words, el('em', '', who));
  return li;
}

function when(iso) {
  const d = iso ? new Date(iso) : null;
  return d && !isNaN(d) ? d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
}

function cardX(mission) {
  const item = mission.item;
  const state = local(mission.id);
  const step = state.sent ? 5 : xStep(item);
  const check = item.compliance;
  const card = el('div', 'mx-card');
  card.append(head('X POST · MISSION', step >= 5 ? 'ALL 4 STEPS RECORDED' : mission.blocked ? 'BLOCKED' : `STEP ${step} OF 4`));
  card.append(el('div', 'mx-text', item.content));

  const list = el('ol', 'mx-xsteps');
  const firstNote = item.posted ? 'Checked when it was offered' : (check && check.result === 'pass' ? 'Rules passed, and every link loads' : '');
  list.append(xStepRow(1, 'Checked by Cas', firstNote || (GATE[(check || {}).result] || GATE.not_connected),
    'CAS', item.posted || mayPublish(check, state.allowed) ? 'done' : mission.blocked ? 'bad' : 'now'));
  list.append(xStepRow(2, 'Post it on X', item.posted ? 'Posted ' + when(item.decided_at) : 'Opens X with the text ready', 'YOU',
    item.posted ? 'done' : step === 2 && !mission.blocked ? 'now' : ''));
  list.append(xStepRow(3, 'Record its X link', item.post_url ? 'Saved · ' + item.post_url.replace('https://', '') : "From X's Share button: Copy link", 'YOU',
    item.post_url ? 'done' : step === 3 ? 'now' : ''));
  list.append(xStepRow(4, 'First numbers', item.views != null ? `${item.views} views · ${item.likes} likes · read ${when(item.metrics_checked_at)}`
    : 'Claude reads them in your Chrome at 4 AM or 4 PM', 'CLAUDE', item.views != null || step >= 5 ? 'done' : step === 4 ? 'wait' : ''));
  card.append(list);
  if (!item.posted) card.append(gateBox(check, state.allowed));
  if (step >= 5) {
    card.append(el('div', 'mx-done', 'Mission done: link and first numbers are in.'));
    return card;
  }

  const b = el('div', 'mx-btns');
  if (step <= 2) {
    if (!mayPublish(check, state.allowed)) {
      if (check && check.result === 'ask') {
        b.append(btn('mx-btn red', 'Allow it (your call)', () => {
          if (confirm('The compliance check left this post to you. Allow it?')) { state.allowed = true; render(); }
        }));
      }
      b.append(btn('mx-btn brass', 'Copy text', () => copy(item.content, 'Text copied')));
    } else if (state.opened) {
      card.append(el('div', 'mx-note', 'Did it go out on X?'));
      b.append(btn('mx-btn red', "Yes, it's posted", () => xDecision(mission, 'posted')));
      b.append(btn('mx-btn brass', 'Not yet', () => { state.opened = false; render(); }));
    } else {
      const a = el('a', 'mx-btn red', 'Open X to post');
      a.href = 'https://x.com/intent/tweet?text=' + encodeURIComponent(item.content);
      a.target = '_blank'; a.rel = 'noopener';
      a.addEventListener('click', () => setTimeout(() => { state.opened = true; render(); }, 300));
      b.append(a);
    }
    if (!state.opened) b.append(btn('mx-btn brass', 'Decline', () => { if (confirm('Decline this post? It will not be offered again.')) xDecision(mission, 'declined'); }));
  } else if (step === 3) {
    const row = el('div', 'mx-linkrow');
    const input = el('input');
    input.type = 'url'; input.inputMode = 'url'; input.placeholder = 'Paste the post’s X link';
    input.value = state.link || '';
    input.addEventListener('input', () => { state.link = input.value; });
    row.append(input, btn('mx-btn brass', 'Paste', async () => {
      try { state.link = (await navigator.clipboard.readText()).trim(); render(); }
      catch { toast('Paste did not work here. Long-press the box and paste.'); }
    }));
    card.append(row);
    b.append(btn('mx-btn red', 'Save link', () => xSaveLink(mission)));
  } else if (step === 4) {
    card.append(el('div', 'mx-note', 'Not done yet: it waits for its first numbers. Nothing for you to do unless Chrome is not connected.'));
    if (state.typing) {
      const nums = el('div', 'mx-nums');
      for (const [key, label] of [['likes', 'Likes'], ['views', 'Views']]) {
        const field = el('label', '', label);
        const input = el('input');
        input.type = 'number'; input.min = '0'; input.inputMode = 'numeric'; input.value = state[key] ?? '';
        input.addEventListener('input', () => { state[key] = input.value; });
        field.append(input);
        nums.append(field);
      }
      card.append(nums);
      b.append(btn('mx-btn red', 'Save numbers', () => xSaveNumbers(mission)));
    } else {
      b.append(btn('mx-btn brass', 'Type them yourself', () => { state.typing = true; render(); }));
    }
  }
  if (b.childElementCount) card.append(b);
  return card;
}

// ---- Quora missions: 7 steps, done only when every one is recorded ----------------------------------
// The PC keeps the records; every tap here is a signed command. Nothing on this phone posts to Quora.
const Q_STEPS = [['Pick a question', 'YOU'], ['Answer it', 'YOU'], ['Sharpen', 'CAS → YOU'], ['Compliance check', 'CAS'],
  ['Post it on Quora', 'YOU'], ['Answer link', 'AUTO'], ['First numbers', 'CLAUDE']];
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const Q_WAIT_MS = 45_000;
let _qSubject = '';   // the subject chip chosen on the Pick card ('' means all)
let _sheet = null;    // the + Subject form while it is open

function quora() { return (_status && _status.quora) || null; }

/** The same 12 characters the PC checks: Chris's Post tap covers exactly the text on his screen. */
export async function textFingerprint(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(text)));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 12);
}

function quoraMissions() {
  const q = quora();
  if (!q) return [];
  const t = q.today || {};
  const left = Math.max(0, (t.limit || 0) - (t.picked || 0));
  const out = [{ id: 'quora-pick', kind: 'quora_pick', source: 'quora', title: 'Pick a question to answer', info: !(left && (q.candidates || []).length) }];
  for (const m of q.missions || []) {
    if (!m || !m.question) continue;
    out.push({ id: 'quora-' + m.id, kind: 'quora', source: 'quora', title: m.question.title, q: m, info: !m.on_chris, created: m.created });
  }
  return out;
}

function subjectName(id) {
  const s = ((quora() || {}).subjects || []).find(x => x.id === id);
  return s ? s.name : 'Your own link';
}

/** A Quora tap: signed like every command. The card waits for the PC to move the mission on. */
async function qsend(mission, text, said) {
  const state = mission ? local(mission.id) : {};
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  state.busy = true; render();
  try {
    await keepDraft(() => _o.send(text));
    if (mission && mission.q) state.pending = { status: mission.q.status, at: Date.now() };
    toast(said || 'Sent. Cas updates the card in a moment.');
    [3000, 9000, 20000].forEach(ms => setTimeout(refresh, ms));
    state.busy = false; render();
    return true;
  } catch {
    toast('Not sent. Check the connection and try again.');
    state.busy = false; render();
    return false;
  }
}

function waitingOnPc(mission) {
  const state = local(mission.id);
  const p = state.pending;
  if (!p) return false;
  if (p.status !== mission.q.status || Date.now() - p.at > Q_WAIT_MS) { state.pending = null; return false; }
  return true;
}

function link(cls, text, href) {
  const a = el('a', cls, text);
  a.href = /^https:\/\/[^\s]+$/.test(String(href || '')) ? href : '#';
  a.target = '_blank'; a.rel = 'noopener noreferrer';
  return a;
}

function chip(text, on, onClick, cls = '') {
  const c = btn('mx-chip' + (on ? ' on' : '') + (cls ? ' ' + cls : ''), text, onClick);
  c.setAttribute('aria-pressed', String(!!on));
  return c;
}

function cardQuoraPick(mission) {
  const q = quora();
  const t = q.today || {};
  const left = Math.max(0, (t.limit || 0) - (t.picked || 0));
  const card = el('div', 'mx-card');
  card.append(head('QUORA · PICK', `${t.picked || 0} OF ${t.limit || 0} TODAY`));
  const subjects = q.subjects || [];
  if (_qSubject && !subjects.some(s => s.id === _qSubject)) _qSubject = '';

  const chips = el('div', 'mx-chips');
  chips.append(chip('All', !_qSubject, () => { _qSubject = ''; render(); }));
  subjects.forEach(s => {
    const c = chip(s.name, _qSubject === s.id, () => { _qSubject = s.id; render(); }, s.on ? '' : 'off');
    if (!s.on) c.append(el('small', '', ' off'));
    chips.append(c);
  });
  chips.append(chip('+ Subject', false, () => openSheet(null), 'add'));
  card.append(chips);
  const chosen = subjects.find(s => s.id === _qSubject);
  if (chosen) {
    const r = el('div', 'mx-subjline');
    r.append(el('span', '', `${chosen.words.join(', ')} · ${repeatText(chosen.repeat)} · ${chosen.per_day} a day${chosen.on ? '' : ' · OFF'}`),
      btn('mx-mini', 'Edit subject', () => openSheet(chosen)));
    card.append(r);
  }

  if (!left) card.append(el('div', 'mx-note', `That is today's pace (${t.limit} a day). More open up tomorrow.`));
  const found = (q.candidates || []).filter(c => !_qSubject || c.subject === _qSubject);
  if (!found.length) {
    card.append(el('div', 'mx-note', subjects.length ? 'No questions waiting here. Ask Cas to find more, or paste one you found.'
      : 'Add a subject first: what kind of questions Cas should look for each morning.'));
  }
  found.slice(0, 8).forEach(c => {
    const row = el('div', 'mx-qcand');
    const words = el('span');
    words.append(el('b', '', c.title), el('small', '', subjectName(c.subject) + (c.why ? ' · ' + c.why : '')));
    words.append(link('mx-qread', 'Read it on Quora ›', c.url));
    const acts = el('span', 'mx-qacts');
    const pick = btn('mx-mini hot', 'Pick', () => qsend(null, `quora pick ${c.id}`, 'Picked. Its mission opens on the board in a moment.'));
    pick.disabled = !left;
    acts.append(pick, btn('mx-mini', 'Skip', () => qsend(null, `quora skip ${c.id}`, 'Skipped.')));
    row.append(words, acts);
    card.append(row);
  });

  const finding = (q.settings || {}).finding || [];
  if (finding.length) card.append(el('div', 'mx-note', 'Cas is searching Quora for more: ' + finding.map(subjectName).join(', ') + '.'));
  const b = el('div', 'mx-btns');
  b.append(btn('mx-btn red', 'Find 8 more', () => {
    if (!chosen) { toast('Pick a subject chip first.'); return; }
    qsend(null, `quora find ${chosen.id}`, `Looking for more ${chosen.name} questions.`);
  }));
  const words = chosen ? chosen.words.join(' ') : 'home repair DIY';
  b.append(link('mx-btn brass', 'Open Quora', chosen && chosen.topic_url ? chosen.topic_url : 'https://www.quora.com/search?q=' + encodeURIComponent(words)));
  card.append(b);

  const state = local(mission.id);
  const row = el('div', 'mx-linkrow');
  const input = el('input');
  input.type = 'url'; input.inputMode = 'url'; input.placeholder = 'Or paste a question you found';
  input.value = state.link || '';
  input.addEventListener('input', () => { state.link = input.value; });
  row.append(input, btn('mx-btn brass', 'Start', async () => {
    const url = (state.link || '').trim();
    if (!/^https:\/\/(www\.)?quora\.com\/[A-Za-z0-9]/.test(url)) { toast('Paste a Quora question link.'); return; }
    if (!left) { toast('That is today\'s pace already.'); return; }
    if (await qsend(null, `quora paste ${url}`, 'Started from your link.')) { state.link = ''; render(); }
  }));
  card.append(row);
  return card;
}

function repeatText(r) {
  r = r || {};
  if (r.kind === 'weekdays') return 'weekdays';
  if (r.kind === 'days') return (r.days || []).map(d => DAYS[d]).join(' ');
  if (r.kind === 'yearly') return `each year ${r.from} to ${r.to}`;
  return 'every day';
}

/** Sharpened text with Cas's additions marked; an addition without a published source is marked red. */
function marked(text, adds) {
  const box = el('div', 'mx-text');
  let rest = String(text || '');
  const list = (adds || []).filter(a => a && a.text && rest.includes(a.text));
  while (rest) {
    let first = null;
    for (const a of list) { const i = rest.indexOf(a.text); if (i >= 0 && (!first || i < first.i)) first = { i, a }; }
    if (!first) { box.append(document.createTextNode(rest)); break; }
    if (first.i) box.append(document.createTextNode(rest.slice(0, first.i)));
    box.append(el('mark', first.a.sourced ? '' : 'bad', first.a.text));
    rest = rest.slice(first.i + first.a.text.length);
  }
  return box;
}

function words(text) { return String(text || '').trim().split(/\s+/).filter(Boolean).length; }

function answerBox(mission, prefill) {
  const state = local(mission.id);
  const box = el('div', 'mx-answer');
  const area = el('textarea');
  area.placeholder = 'Your answer, in your own words. Tap the microphone on the keyboard to talk instead of typing.';
  area.value = state.words ?? prefill ?? '';
  const count = el('small', '', words(area.value) + ' words');
  area.addEventListener('input', () => { state.words = area.value; count.textContent = words(area.value) + ' words'; });
  const send = btn('mx-btn red', 'Send to Cas to sharpen', () => {
    const text = (state.words ?? prefill ?? '').trim();
    if (words(text) < 15) { toast('Add a few more sentences first.'); return; }
    if (text.length > 4000) { toast('Keep it under 4,000 characters.'); return; }
    qsend(mission, `quora answer ${mission.q.id}: ${text}`, 'Sent. Cas is sharpening it.').then(ok => { if (ok) { state.words = undefined; state.rewrite = false; render(); } });
  });
  box.append(area, count, send);
  return box;
}

function qWhen(seconds) { return seconds ? when(new Date(seconds * 1000).toISOString()) : ''; }

function cardQuora(mission) {
  const m = mission.q;
  const state = local(mission.id);
  const card = el('div', 'mx-card');
  card.append(head('QUORA · ' + String(m.id || '').toUpperCase(), m.status === 'done' ? 'ALL 7 STEPS RECORDED' : `STEP ${Math.min(m.step, 7)} OF 7`));
  const qline = el('p', 'mx-qtitle');
  qline.append(el('b', '', m.question.title), document.createTextNode(' '), link('mx-qread', 'Open the question ›', m.question.url));
  card.append(qline);
  if (m.subject) card.append(el('div', 'mx-note', 'Subject: ' + subjectName(m.subject)));

  const list = el('ol', 'mx-xsteps');
  const at = m.status === 'done' ? 8 : m.step;
  const notes = ['Picked ' + qWhen(m.created), m.answer ? 'In your words' : 'Type it, or tap the keyboard microphone',
    m.kept ? (m.kept === 'mine' ? 'You kept your own words' : 'You kept the sharpened version') : m.status === 'sharpening' ? 'Cas is sharpening it now' : 'Facts you published, a clear next step, your credential',
    m.compliance ? (GATE[m.compliance.result] || '') : 'Runs on the exact final text',
    m.posted_at ? 'Posted ' + qWhen(m.posted_at) : 'You post it; nothing posts by itself',
    m.answer_url ? (m.link_source === 'auto' ? 'Recorded automatically · ' : 'Saved · ') + m.answer_url.replace('https://www.', '') : 'Recorded automatically when you post',
    m.numbers ? `${m.numbers.views} views · ${m.numbers.upvotes} upvotes` : 'Claude reads them in your Chrome at 4 AM or 4 PM'];
  Q_STEPS.forEach(([label, who], i) => {
    const n = i + 1;
    const cls = n < at ? 'done' : n === at ? (m.status === 'fix' ? 'bad' : m.on_chris ? 'now' : 'wait') : '';
    list.append(xStepRow(n, label, notes[i], who, cls));
  });
  card.append(list);
  if (m.note) card.append(el('div', 'mx-note warn', m.note));

  if (m.status === 'done') { card.append(el('div', 'mx-done', 'Mission done: link and first numbers are in.')); return card; }
  if (waitingOnPc(mission)) {
    card.append(el('div', 'mx-note', 'Sent. Cas moves this card on in a moment. If nothing changes, the reply is in the main Cas chat.'));
    return card;
  }
  const b = el('div', 'mx-btns');
  if (m.text_later && ['keep', 'fix', 'post'].includes(m.status) && !state.rewrite) {
    card.append(el('div', 'mx-note', 'This card is waiting for its text: the status was full. It arrives with the next update.'));
    return card;
  }

  if (m.status === 'answer' || state.rewrite) {
    card.append(answerBox(mission, state.rewrite ? m.answer : ''));
    if (state.rewrite) b.append(btn('mx-btn brass', 'Cancel', () => { state.rewrite = false; state.words = undefined; render(); }));
    else b.append(btn('mx-btn brass', 'Drop this question', () => { if (confirm('Drop this question? It will not come back.')) qsend(mission, `quora drop ${m.id}`, 'Dropped.'); }));
  } else if (m.status === 'sharpening' || m.status === 'checking') {
    card.append(el('div', 'mx-note', m.status === 'sharpening' ? 'Cas is sharpening your answer. Both versions will be here.' : 'The compliance check is reading the final text.'));
  } else if (m.status === 'keep') {
    const sh = m.sharpened;
    if (sh) {
      card.append(el('div', 'mx-label', 'SHARPENED BY CAS · ADDITIONS MARKED'));
      card.append(marked(sh.text, sh.additions));
      if ((sh.additions || []).length) {
        const src = el('div', 'mx-srcl');
        src.append(el('b', '', 'WHERE EACH ADDITION COMES FROM'));
        sh.additions.forEach(a => {
          const line = el('span', a.sourced ? '' : 'bad');
          line.append(el('mark', a.sourced ? '' : 'bad', a.sourced ? '✓' : '!'), document.createTextNode(' ' + a.text + ' · '),
            el('i', '', a.sourced ? a.source : 'no source you published: keep your own words, or change it'));
          src.append(line);
        });
        card.append(src);
      }
      card.append(el('div', 'mx-cred', 'Credential line: ' + ((quora().settings || {}).credential || '')));
      b.append(btn('mx-btn red', 'Use sharpened', () => qsend(mission, `quora keep ${m.id} sharpened`, 'Kept. The compliance check runs now.')));
    }
    const mine = el('details', 'mx-mine');
    mine.append(el('summary', '', 'Your own words'), el('div', 'mx-text', m.answer));
    if (!sh) mine.open = true;
    card.append(mine);
    b.append(btn('mx-btn brass', 'Use mine', () => qsend(mission, `quora keep ${m.id} mine`, 'Kept your words. The compliance check runs now.')));
    b.append(btn('mx-btn brass', 'Change my answer', () => { state.rewrite = true; render(); }));
  } else if (m.status === 'fix') {
    card.append(el('div', 'mx-text', m.final));
    card.append(gateBox(m.compliance, false));
    if (m.compliance && ['error', 'not_connected'].includes(m.compliance.result)) {
      b.append(btn('mx-btn red', 'Check again', () => qsend(mission, `quora recheck ${m.id}`, 'Checking it again.')));
    }
    b.append(btn('mx-btn red', 'Change my answer', () => { state.rewrite = true; render(); }));
    b.append(btn('mx-btn brass', 'Drop it', () => { if (confirm('Drop this question?')) qsend(mission, `quora drop ${m.id}`, 'Dropped.'); }));
  } else if (m.status === 'post') {
    card.append(el('div', 'mx-label', 'THE ANSWER YOU ARE AGREEING TO POST'));
    card.append(el('div', 'mx-text mx-final', m.final));
    card.append(gateBox(m.compliance, m.allowed));
    if (!mayPublish(m.compliance, m.allowed)) {
      if (m.compliance && m.compliance.result === 'ask') {
        b.append(btn('mx-btn red', 'Allow it (your call)', () => { if (confirm('The check left this answer to you. Allow it?')) qsend(mission, `quora allow ${m.id}`, 'Allowed.'); }));
      }
      b.append(btn('mx-btn brass', 'Change my answer', () => { state.rewrite = true; render(); }));
    } else if (state.opened && state.openedFp === m.fp) {
      card.append(el('div', 'mx-note', 'Did it go out on Quora?'));
      b.append(btn('mx-btn red', "Yes, it's posted", async () => {
        const fp = await textFingerprint(m.final);
        if (fp !== m.fp) { toast('This is not the checked version. Wait a moment, then check it again.'); refresh(); return; }
        qsend(mission, `quora posted ${m.id} ${fp}`, 'Step 5 done. Its link records itself.');
      }));
      b.append(btn('mx-btn brass', 'Not yet', () => { state.opened = false; render(); }));
    } else {
      const a = link('mx-btn red', 'Copy and open Quora', m.question.url);
      a.addEventListener('click', async () => {
        if (await copy(m.final, 'Answer copied. Paste it on Quora.')) { state.opened = true; state.openedFp = m.fp; render(); }
        else toast('The answer was not copied. Tap Copy and open Quora again before you paste.');
      });
      b.append(a, btn('mx-btn brass', 'Change my answer', () => { state.rewrite = true; render(); }));
    }
  } else if (m.status === 'link') {
    const settings = quora().settings || {};
    card.append(el('div', 'mx-note', settings.profile ? 'The automatic link did not open your answer. Paste it once from Quora: on your answer tap Share, then Copy link.'
      : 'Add your Quora profile name once and every answer link records itself. Or paste this one.'));
    const row = el('div', 'mx-linkrow');
    const input = el('input');
    input.type = 'url'; input.inputMode = 'url'; input.placeholder = 'Paste your answer link';
    input.value = state.link || '';
    input.addEventListener('input', () => { state.link = input.value; });
    row.append(input, btn('mx-btn brass', 'Save', () => { const u = (state.link || '').trim(); if (u) qsend(mission, `quora link ${m.id} ${u}`, 'Link sent.'); }));
    card.append(row);
    if (!settings.profile) {
      const prow = el('div', 'mx-linkrow');
      const p = el('input');
      p.placeholder = 'Quora profile name, e.g. Chris-Smith-12';
      p.value = state.profile || '';
      p.addEventListener('input', () => { state.profile = p.value; });
      prow.append(p, btn('mx-btn brass', 'Save name', () => {
        const name = (state.profile || '').trim().replace(/^.*quora\.com\/profile\//, '').replace(/\/.*$/, '');
        if (/^[A-Za-z0-9][A-Za-z0-9-]{2,80}$/.test(name)) qsend(mission, `quora profile ${name}`, 'Saved. Links record themselves now.');
        else toast('It is the part after quora.com/profile/ in your profile link.');
      }));
      card.append(prow);
    }
  } else if (m.status === 'numbers') {
    card.append(el('div', 'mx-note', 'Not done yet: it waits for its first numbers. Nothing for you to do unless Chrome reading is off.'));
    if (m.answer_url) card.append(link('mx-qread', 'Open your answer ›', m.answer_url));
    if (state.typing) {
      const nums = el('div', 'mx-nums');
      for (const [key, label] of [['views', 'Views'], ['upvotes', 'Upvotes']]) {
        const f = el('label', '', label);
        const input = el('input');
        input.type = 'number'; input.min = '0'; input.inputMode = 'numeric'; input.value = state[key] ?? '';
        input.addEventListener('input', () => { state[key] = input.value; });
        f.append(input);
        nums.append(f);
      }
      card.append(nums);
      b.append(btn('mx-btn red', 'Save numbers', () => {
        const v = Number(state.views), u = Number(state.upvotes);
        if (state.views === '' || state.upvotes === '' || state.views == null || state.upvotes == null
            || !Number.isInteger(v) || !Number.isInteger(u) || v < 0 || u < 0) { toast('Type both numbers, 0 or more.'); return; }
        qsend(mission, `quora numbers ${m.id} ${v} ${u}`, 'All 7 steps recorded.');
      }));
    } else {
      b.append(btn('mx-btn brass', 'Type them yourself', () => { state.typing = true; render(); }));
    }
  }
  if (m.posted_at && m.status !== 'done') {
    b.append(btn('mx-btn brass', 'Quora removed it', () => {
      if (confirm('Did Quora remove this answer? Pace drops to 1 a day and links pause until you reset them.')) qsend(mission, `quora removed ${m.id}`, 'Noted. The brake is on.');
    }));
  }
  if (b.childElementCount) card.append(b);
  return card;
}

// ---- + Subject: every field the morning finder reads, saved without code -------------------------------
function openSheet(subject) {
  const s = subject || {};
  _sheet = { id: s.id || '', name: s.name || '', words: (s.words || []).join(', '), leave_out: (s.leave_out || []).join(', '),
    topic_url: s.topic_url || '', repeat: { kind: 'daily', days: [], from: '', to: '', ...(s.repeat || {}) }, per_day: s.per_day ?? 2,
    support: { mode: 'cas', link: '', idea: '', options: [], ...(s.support || {}) }, sales: { url: '', ...(s.sales || {}) },
    label: s.label || '', amazon_tag: s.amazon_tag || '', on: s.on !== false, editing: !!subject, labelTouched: !!subject };
  drawSheet();
}

function closeSheet() { _sheet = null; document.getElementById('mx-sheet')?.remove(); }

function field(label, input, hint) {
  const f = el('label', 'mx-field');
  f.append(el('b', '', label), input);
  if (hint) f.append(el('small', '', hint));
  return f;
}

function textInput(key, placeholder, obj) {
  const target = obj || _sheet;
  const input = el('input');
  input.value = target[key] || '';
  input.placeholder = placeholder;
  input.addEventListener('input', () => { target[key] = input.value; });
  return input;
}

function slugify(text) { return String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30); }

function drawSheet() {
  const old = document.getElementById('mx-sheet');
  const scroll = old ? old.querySelector('.mx-sheet-in').scrollTop : 0;
  old?.remove();
  if (!_sheet) return;
  const d = _sheet;
  const wrap = el('div', 'mx-sheet');
  wrap.id = 'mx-sheet';
  wrap.setAttribute('role', 'dialog');
  wrap.setAttribute('aria-modal', 'true');
  wrap.setAttribute('aria-label', d.editing ? 'Edit subject' : 'Add a subject');
  const panel = el('div', 'mx-sheet-in');
  const top = el('div', 'mx-sheet-top');
  top.append(el('b', '', d.editing ? 'Edit subject' : '+ Subject'), btn('mx-mini', 'Close', closeSheet));
  panel.append(top);

  panel.append(el('h5', '', 'WHAT TO FIND'));
  const labelBox = textInput('label', 'water-heaters');
  const name = textInput('name', 'e.g. Water heaters');
  name.addEventListener('input', () => { if (!d.labelTouched) { d.label = slugify(d.name); labelBox.value = d.label; } });
  panel.append(field('Name', name));
  panel.append(field('Search words', textInput('words', 'water heater, pilot light, tank flush'), 'Separate with commas.'));
  panel.append(field('Leave out', textInput('leave_out', 'tankless, commercial'), 'Questions with these words are skipped.'));
  panel.append(field('Quora topic link', textInput('topic_url', 'https://www.quora.com/topic/Plumbing'), 'Optional. Cas starts its search there.'));

  panel.append(el('h5', '', 'WHEN'));
  const kind = el('select');
  [['daily', 'Every day'], ['weekdays', 'Weekdays'], ['days', 'Certain days'], ['yearly', 'Each year between dates']].forEach(([v, t]) => {
    const o = el('option', '', t); o.value = v; o.selected = d.repeat.kind === v; kind.append(o);
  });
  kind.addEventListener('change', () => { d.repeat.kind = kind.value; drawSheet(); });
  panel.append(field('Repeat', kind));
  if (d.repeat.kind === 'days') {
    const days = el('div', 'mx-chips');
    DAYS.forEach((label, i) => days.append(chip(label, d.repeat.days.includes(i), () => {
      d.repeat.days = d.repeat.days.includes(i) ? d.repeat.days.filter(x => x !== i) : [...d.repeat.days, i].sort();
      drawSheet();
    })));
    panel.append(days);
  }
  if (d.repeat.kind === 'yearly') {
    const two = el('div', 'mx-two');
    two.append(field('From (month-day)', textInput('from', '11-01', d.repeat)), field('To', textInput('to', '12-24', d.repeat)));
    panel.append(two);
  }
  const qty = el('input');
  qty.type = 'number'; qty.min = '0'; qty.max = '5'; qty.inputMode = 'numeric'; qty.value = String(d.per_day);
  qty.addEventListener('input', () => { d.per_day = qty.value; });
  panel.append(field('Questions a day', qty, 'Up to 5. Your overall pace still applies.'));

  panel.append(el('h5', '', 'SUPPORTING PAGE'));
  const modes = el('div', 'mx-chips');
  [['cas', 'Cas ideas'], ['own', 'My own link'], ['idea', 'My idea'], ['none', 'None']].forEach(([v, t]) =>
    modes.append(chip(t, d.support.mode === v, () => { d.support.mode = v; drawSheet(); })));
  panel.append(modes);
  if (d.support.mode === 'cas') {
    const opts = d.support.options || [];
    opts.forEach(o => {
      const r = el('div', 'mx-opt');
      r.append(el('i', '', '•'));
      const t = el('span'); t.append(el('b', '', o.title), el('small', '', o.why || '')); r.append(t);
      panel.append(r);
    });
    if (!opts.length) panel.append(el('div', 'mx-note', d.editing ? 'No ideas yet.' : 'Save the subject first, then ask for ideas.'));
    if (d.editing) panel.append(btn('mx-mini', opts.length ? 'New ideas' : 'Get 3 ideas', () => qsend(null, `quora support ideas ${d.id}`, 'Cas is thinking up 3 ideas.')));
  } else if (d.support.mode === 'own') {
    panel.append(field('Page link', textInput('link', 'https://tradesprotools.com/blog/...', d.support), 'A page on tradesprotools.com.'));
  } else if (d.support.mode === 'idea') {
    const idea = el('textarea');
    idea.value = d.support.idea || ''; idea.placeholder = 'What the page should cover';
    idea.addEventListener('input', () => { d.support.idea = idea.value; });
    panel.append(field('My idea', idea, 'Cas drafts it for the TradesPro Guide; it goes live only with your yes.'));
  }

  panel.append(el('h5', '', 'SALES PAGE'));
  panel.append(field('Your store page', textInput('url', 'https://store.tradesprotools.com/l/...', d.sales), 'Where the supporting page leads. Never linked from Quora itself.'));
  panel.append(btn('mx-mini', '+ New sales page from my idea', () => {
    const idea = prompt('Your idea for a new sales page:');
    if (idea && idea.trim()) qsend(null, `loop start: New sales page for ${d.name || 'a Quora subject'}: ${idea.trim().slice(0, 500)}`, 'Cas drafts a loop card for it in Missions, under Loops.');
  }));

  panel.append(el('h5', '', 'TRACKING · WHICH SUBJECTS PAY'));
  panel.append(el('div', 'mx-note', 'The link label goes on links from your supporting page, so page visits, store clicks and sales can be counted per subject.'));
  labelBox.addEventListener('input', () => { d.labelTouched = true; });
  panel.append(field('Link label', labelBox, 'Made from the name. Change it if you like.'));
  panel.append(field('Amazon tracking ID', textInput('amazon_tag', 'optional'), 'The same idea inside your Associates report.'));
  const amz = btn('mx-mini', 'Set it up on Amazon ›', () => {});
  amz.disabled = true;
  panel.append(amz, el('small', 'mx-hint2', ' Turns on once your new Associates account is approved.'));

  panel.append(el('h5', '', 'SUBJECT'));
  panel.append(chip(d.on ? 'On' : 'Off', d.on, () => { d.on = !d.on; drawSheet(); }, 'switch'),
    el('small', 'mx-hint2', ' Off pauses it, whatever Repeat says, until you turn it back on.'));

  panel.append(el('div', 'mx-who-reads', 'Who reads this: Cas, each morning after 6 AM, to find questions for this subject. Nothing here posts anything.'));
  const foot = el('div', 'mx-btns');
  foot.append(btn('mx-btn red', 'Save subject', async () => {
    const payload = { name: d.name.trim(), words: d.words.split(',').map(w => w.trim()).filter(Boolean),
      leave_out: d.leave_out.split(',').map(w => w.trim()).filter(Boolean), topic_url: d.topic_url.trim(),
      repeat: { kind: d.repeat.kind, days: d.repeat.days, from: (d.repeat.from || '').trim(), to: (d.repeat.to || '').trim() },
      per_day: Math.max(0, Math.min(5, parseInt(d.per_day, 10) || 0)),
      support: { mode: d.support.mode, link: (d.support.link || '').trim(), idea: (d.support.idea || '').trim() },
      sales: { url: (d.sales.url || '').trim() }, label: (d.label || '').trim(), amazon_tag: (d.amazon_tag || '').trim(), on: d.on };
    if (d.id) payload.id = d.id;
    if (payload.name.length < 2) { toast('Give the subject a name.'); return; }
    if (!payload.words.length) { toast('Add at least one search word.'); return; }
    const text = 'quora subject save ' + JSON.stringify(payload);
    if (text.length > 5800) { toast('That is too long. Shorten the idea or the words.'); return; }
    if (await qsend(null, text, 'Saved. Cas confirms in a moment.')) closeSheet();
  }));
  if (d.editing) {
    foot.append(btn('mx-btn brass', d.on ? 'Pause subject' : 'Turn it on',
      () => qsend(null, `quora subject ${d.on ? 'off' : 'on'} ${d.id}`, d.on ? 'Paused.' : 'On.').then(ok => { if (ok) closeSheet(); })));
  }
  panel.append(foot);
  wrap.append(panel);
  wrap.addEventListener('click', e => { if (e.target === wrap) closeSheet(); });
  document.body.append(wrap); // above the bottom bar, which sits over the Missions panel
  panel.scrollTop = scroll;
}


/** The record of retired X posts (Chris, 2026-11-15): approved posts not posted within the offer window leave the list
 *  quietly. Retired is not a judgment of the post and gives no feedback to anything that learns. Read only, with a quiet
 *  Offer again (a signed command; not approval feedback either) and Copy. */
function fmtDay(iso) {
  const d = iso ? new Date(iso) : null;
  return d && !isNaN(d) ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '';
}

function cardXExpired(mission) {
  const data = mission.expired;
  const card = el('div', 'mx-card');
  card.append(head('RETIRED X POSTS · RECORD', `${data.retired_count} RETIRED`));
  card.append(el('p', '', `An approved post that is not posted within ${data.window_days} days is retired: it leaves the list ` +
    'quietly and is kept here for the record. Retired says nothing about the post. It is not a decline, and nothing ' +
    'learns from it; it only means there was no time to post it.'));
  if (data.full_count) {
    card.append(el('div', 'mx-note', `${data.full_count} fresh post${data.full_count === 1 ? '' : 's'} also ${data.full_count === 1 ? 'waits' : 'wait'} ` +
      `for room: the Station offers at most ${data.max_offered} at a time, so ${data.full_count === 1 ? 'it shows' : 'they show'} when others are posted or retire.`));
  }
  const total = data.retired_count + (data.full_count || 0);
  if (total > data.posts.length) card.append(el('div', 'mx-note', `Showing ${data.posts.length} of ${total}.`));
  data.posts.forEach(post => {
    // one state per post and per round, so a post offered again that retires again gets its button back
    const state = local(`x-ret-${post.review_id}-${post.retired_on || 'fresh'}`);
    if (state.sentAt && Date.now() - state.sentAt > 60_000) { state.sent = ''; state.sentAt = 0; state.retry = true; }
    const row = el('div', 'mx-xexp');
    row.append(el('div', 'mx-text', post.content));
    const when = post.reason === 'full' ? `Made ${fmtDay(post.made_on)} · fresh, waiting for room`
      : `Made ${fmtDay(post.made_on)} · retired ${fmtDay(post.retired_on)}`;
    row.append(el('small', '', `${when}${post.product ? ' · ' + post.product : ''}${post.offered_again ? ' · offered again before' : ''}`));
    if (state.retry) row.append(el('div', 'mx-note', 'Not changed yet. The reply is in the main Cas chat; you can tap again.'));
    if (state.sent) {
      row.append(el('div', 'mx-note', state.sent));
    } else {
      const b = el('div', 'mx-btns quiet');
      if (post.reason !== 'full') {
        const again = btn('mx-mini', 'Offer again', async () => {
          state.busy = true; render();
          try {
            await keepDraft(() => _o.send(`x retired offer ${post.review_id}`));
            state.sent = `Sent: offer again for ${data.window_days} days. Cas confirms in a moment.`;
            state.sentAt = Date.now(); state.retry = false;
            setTimeout(render, 61_000);
            [3000, 9000].forEach(ms => setTimeout(refresh, ms));
            setTimeout(loadX, 9000);
          } catch { toast('Not sent. Check the connection and try again.'); }
          state.busy = false; render();
        });
        again.disabled = !!state.busy;
        b.append(again);
      }
      b.append(btn('mx-mini', 'Copy', () => copy(post.content, 'Text copied')));
      row.append(b);
    }
    card.append(row);
  });
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
  loop: cardLoopInfo, x: cardX, review: cardReview, quora_pick: cardQuoraPick, quora: cardQuora, x_expired: cardXExpired };

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
  const scenes = _panel.querySelector('#st-scenes'); // the background layer (cas-scenes.js) stays
  _panel.textContent = '';
  if (scenes) _panel.append(scenes);
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
  if (work.contains(document.activeElement) && ['TEXTAREA', 'INPUT', 'SELECT'].includes(document.activeElement.tagName)) return; // do not wipe what is being typed
  work.textContent = '';
  if (_dashOpen && _boardOpen) {
    const gap = btn('mx-gapzone', '', () => { _dashOpen = false; _boardOpen = false; saveUi(); render(); });
    gap.append(el('b', '', 'Tap here to fold both'), el('small', '', 'The summary and the board never cover the work.'));
    work.append(gap);
  }
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
  who.append(head, document.createTextNode(mission.kind === 'loop' ? 'Here is where this loop stands.' : 'Here is the mission. Tap to answer, or ask me about it first.'));
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
  if (rows.length) {
    const legend = el('div', 'mx-legend');
    const q = _tab === 'quora' && quora();
    legend.append(el('span', 'brass', 'Brass: on you or working'), el('span', 'rust', 'Rust: waiting or idle'));
    if (q) legend.append(el('em', '', `${(q.today || {}).posted || 0} posted today · pace ${(q.today || {}).limit || 0} a day`));
    list.append(legend);
  }
  if (_tab === 'quora' && !quora()) list.append(el('div', 'mx-hint', 'Quora missions appear once the PC reports them.'));
  if (_tab === 'x' && _x.loading) list.append(el('div', 'mx-hint', 'Loading X posts...'));
  else if (_tab === 'x' && _x.error) list.append(el('div', 'mx-hint', 'Could not load X posts. Tap X posts to try again.'));
  else if (!rows.length) list.append(el('div', 'mx-hint', _tab === 'loops' ? 'No loops yet. Tap Start loop on an idea in a Brainstorm thread.' : 'Nothing waiting here.'));
  rows.forEach(m => {
    const r = btn('mx-mrow' + (m.info ? ' rust' : ' live') + (_selected === m.id ? ' on' : ''), '', () => pick(m));
    const icon = (m.kind === 'x' || m.kind === 'quora') && m.info ? (m.q && m.q.status === 'done' ? '✓' : '⏱')
      : m.number ? String(m.number) : m.q ? String(Math.min(m.q.step, 7))
      : ({ loop_card: 'L', publish: 'P', push: '↑', standing: '★', loop: '↻', x: 'X', review: 'R', quora_pick: 'Q', x_expired: '▤' }[m.kind] || '•');
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
  if (m.info && m.kind === 'loop') return m.loop.headline;
  if (m.kind === 'publish') return (GATE[(m.compliance || {}).result] || '').replace(/\.$/, '');
  if (m.kind === 'loop_card') return 'Loop card to approve';
  if (m.kind === 'ask' || m.kind === 'change' || m.kind === 'go_live') return `Question ${m.number}` + (m.created ? ` · ${ago(m.created)} ago` : '');
  if (m.kind === 'push') return 'Push for review';
  if (m.kind === 'quora_pick') {
    const q = quora() || {};
    const t = q.today || {};
    return `${(q.candidates || []).length} found · ${t.picked || 0} of ${t.limit || 0} picked today`;
  }
  if (m.kind === 'quora') return quoraSubtitle(m.q);
  if (m.kind === 'x_expired') return 'Kept for the record · not waiting on you · not feedback';
  if (m.kind === 'x') {
    const step = xStep(m.item);
    if (step === 3) return `Step 3 of 4 · posted ${when(m.item.decided_at)} · X link missing`;
    if (step === 4) return 'Waiting · Claude reads it at 4 AM or 4 PM · not on you';
    if (m.blocked) return (GATE[(m.item.compliance || {}).result] || GATE.not_connected).replace(/\.$/, '');
    return 'Step 2 of 4 · ready to post';
  }
  return '';
}

function quoraSubtitle(q) {
  return ({ answer: 'Step 2 of 7 · your answer', sharpening: 'Step 3 of 7 · Cas is sharpening it', keep: 'Step 3 of 7 · pick a version',
    checking: 'Step 4 of 7 · the check is running', fix: 'Step 4 of 7 · needs a change', post: 'Step 5 of 7 · ready to post',
    link: 'Step 6 of 7 · paste its link once', numbers: 'Waiting · Claude reads it at 4 AM or 4 PM · not on you',
    done: q.numbers ? `Done · ${q.numbers.views} views · ${q.numbers.upvotes} upvotes` : 'Done' })[q.status] || '';
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
  const get = path => fetch(`${_o.apiBase}/api/station/x-review/${path}`, { headers: { Authorization: 'Bearer ' + _o.getToken() } })
    .then(res => { if (!res.ok) throw new Error(String(res.status)); return res.json(); });
  try {
    const [queue, tracker] = await Promise.all([get('queue'), get('tracker')]);
    _x.items = (queue.items || []).filter(i => i && typeof i.content === 'string');
    _x.posted = (tracker.posts || []).filter(p => p && typeof p.review_id === 'string');
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
