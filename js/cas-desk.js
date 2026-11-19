// cas-desk.js - the Desk tab: every open card is a mission. Server text goes in with textContent only.

import { renderBulletin, initOrders, loadOrders, loadDashboard, renderOrders, renderDashboard, ordersPill, typingInOrders } from './cas-orders.js?v=cas86';
import { LANDING_SUB, DESK_SUBS, unseenLinks, SHOWN, rankItems, itemsById, orderedIds, moveTo, stepBy, dropIndex, pinnedAfterMove, stepParts, stepDetail, termMap, textParts, plainItem, cleanSources, holdUntil, holdDates, heldCards, dayWords, HOLD_REASONS, isHttps, linkAction, deskRows, casMessage } from './cas-desk-logic.js?v=cas86';

export { rankItems };

const FRESH_MS = 60_000;
const OLD_FEED_S = 6 * 3600;
const DAY_S = 24 * 3600;
const TICK_MS = 30_000;
const TIMEOUT_MS = 15_000;
const TOAST_MS = 8_000;
const RERANK_S = 120;
const KIND = { decide: 'Decide', confirm: 'Confirm', review: 'Review', 'do-by-hand': 'Do by hand', update: 'Update' };
const SAY = { 429: 'Too many changes in a minute. Wait a moment.', 409: 'The list changed. It is reloaded.' };

let _o = { apiBase: '', getToken: () => '', openTab: () => {}, openThread: () => {}, openCas: () => {}, send: null };
let _panel = null;
let _state = 'idle';
let _data = null;
let _loadedAt = 0;
let _inflight = false;
let _doneOpen = false;
let _answeredOpen = false;
let _moreOpen = false;
let _lookBase = 0;
let _refreshFailed = false;
let _toast = null;
let _toastTimer = 0;
let _rerankTimer = 0;
let _openInit = false;
let _tick = 0;
const _open = new Set();
const _whys = new Map();
const _need = new Set();
const _busy = new Set();
const _sentKids = new Set();
let _onData = () => {};
let _sub = LANDING_SUB;
const SUBS = DESK_SUBS;

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}

function button(cls, text, fn) {
  const b = el('button', cls, text);
  b.type = 'button';
  b.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); fn(e); });
  return b;
}

export function doneList(data) {
  const log = data && data.done_log;
  if (Array.isArray(log)) return log.map(d => ({ title: d.title, project: d.project, note: [d.date, d.answer ? shorten(d.answer, 110) : ''].filter(Boolean).join(' · '), seen: d.first_seen || 0 }));
  const feed = data && data.feed;
  const out = ((feed && feed.done_since_last_look) || []).map(d => ({ title: d.title, project: d.project, note: '', seen: 0 }));
  ((feed && feed.items) || []).filter(i => i.status !== 'open').forEach(i => {
    out.push({ title: i.title, project: i.project, note: i.status === 'done' ? 'Done' : 'Answered' + (i.answer ? ': ' + shorten(i.answer, 110) : ''), seen: 0 });
  });
  return out;
}

function lastLook() { try { return Number(localStorage.getItem('desk-last-look')) || 0; } catch { return 0; } }
function setLastLook(t) { try { localStorage.setItem('desk-last-look', String(t)); } catch { /* no storage: no memory */ } }
function shorten(text, max) { return text.length > max ? text.slice(0, max - 1).trimEnd() + '...' : text; }
function words(id) { return String(id || '').replace(/-/g, ' '); }
const field = (name, fallback) => (_data && _data[name]) || fallback;

function age(data) {
  if (!data || data.uploaded == null || data.now == null) return { text: 'age unknown', old: false, day: false };
  const s = Math.max(0, Math.round(data.now - data.uploaded + (Date.now() - _loadedAt) / 1000));
  const text = s < 90 ? 'just now' : s < 5400 ? Math.round(s / 60) + ' min ago' : s < 172800 ? Math.round(s / 3600) + ' h ago' : Math.round(s / 86400) + ' days ago';
  return { text, old: s > OLD_FEED_S, day: s > DAY_S };
}
function srcText() { return 'Source: orchestrator feed, sent ' + age(_data).text; }
function oldText(a) { return a.day ? 'This list is over a day old. The PC has not sent a newer one, so it may be out of date.' : 'This list is old. The PC has not sent a newer one.'; }

function tickAges() {
  if (!_panel || _state !== 'ready' || !_data) return;
  const a = age(_data);
  _panel.querySelectorAll('.dk-src').forEach(n => { n.textContent = srcText(); });
  const warn = _panel.querySelector('.dk-old');
  if (warn) { warn.hidden = !a.old; warn.textContent = oldText(a); }
}
function startTick() {
  if (_tick) return;
  _tick = setInterval(() => { if (!document.hidden && _panel && _panel.classList.contains('visible')) tickAges(); }, TICK_MS);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tickAges(); });
}


async function post(path, body) {
  try {
    const res = await fetch(`${_o.apiBase}/api/station/desk${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + _o.getToken() }, body: JSON.stringify(body || {}),
    });
    const json = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, json };
  } catch { return { ok: false, status: 0, json: {} }; }
}

function say(text, undo) {
  clearTimeout(_toastTimer);
  _toast = { text, undo };
  draw();
  _toastTimer = setTimeout(() => { _toast = null; const n = _panel && _panel.querySelector('.dk-toast'); if (n) n.remove(); }, TOAST_MS);
}

async function answer(id, kind, extra = {}) {
  if (_busy.has(id)) return;
  _busy.add(id);
  const res = await post('/answer', { id, kind, ...extra });
  _busy.delete(id);
  if (!res.ok) {
    say(SAY[res.status] || (typeof res.json.detail === 'string' && res.status === 422 ? res.json.detail.replace(/^./, c => c.toUpperCase()) + '.' : 'Not saved. Try again.'));
    if (res.status === 422 || res.status === 409) load(true);
    return;
  }
  _whys.delete(id);
  _need.delete(id);
  const undoable = kind === 'choice' || kind === 'done' || kind === 'notnow';
  say(kind === 'undo' ? 'Undone.' : res.json.line || 'Saved.', undoable ? () => answer(id, 'undo') : null);
  await load(true);
}

const _holdWhy = new Map();
let _holdFor = null;
let _holdPick = false;
let _heldOpen = false;

async function holdCard(id, until) {
  const reason = (_holdWhy.get(id) || '').trim();
  if (!reason) { _need.add('hold:' + id); draw(); return; }
  if (_busy.has(id)) return;
  _busy.add(id);
  const res = await post('/hold', { item_id: id, until, reason });
  _busy.delete(id);
  if (!res.ok) {
    say(SAY[res.status] || (typeof res.json.detail === 'string' && res.status === 422 ? res.json.detail.replace(/^./, c => c.toUpperCase()) + '.' : 'Not saved. Try again.'));
    if (res.status === 422 || res.status === 409) load(true);
    return;
  }
  _holdWhy.delete(id); _need.delete('hold:' + id); _holdFor = null; _holdPick = false;
  say(res.json.line || 'Held. It comes back ' + (dayWords(until) || 'on the day you chose') + '.', () => unhold(id));
  await load(true);
}

async function unhold(id) {
  const res = await post('/unhold', { item_id: id });
  say(res.ok ? 'Back on your list.' : (SAY[res.status] || 'Not saved. Try again.'));
  await load(true);
}

async function commitOrder(next, moved) {
  const mine = pinnedAfterMove(next, field('mine', []), moved);
  _data = { ..._data, order: next, mine, rerank: null, rerank_in: RERANK_S };
  draw();
  const res = await post('/order', { order: next, moved });
  if (!res.ok) say(SAY[res.status] || 'Not saved. Try again.');
  await load(true);
}

async function release(id) {
  const res = await post('/release', { id });
  if (!res.ok) say(SAY[res.status] || 'Not saved. Try again.');
  await load(true);
}

async function undoRerank() {
  const res = await post('/rerank/undo');
  if (!res.ok) say(SAY[res.status] || 'Not saved. Try again.');
  await load(true);
}


function openCard(id) {
  const ids = orderedIds(_data);
  if (!ids.includes(id)) { say('That one is already done.'); return; }
  _open.add(id);
  if (ids.indexOf(id) >= SHOWN) _moreOpen = true;
  draw();
  const node = _panel && _panel.querySelector(`[data-id="${CSS.escape(id)}"]`);
  if (node) node.scrollIntoView({ block: 'start', behavior: 'smooth' });
}

function linkNode(link, text, cls) {
  const act = linkAction(link);
  const label = text || link.label;
  if (act.type === 'open') {
    const a = el('a', cls || 'dk-chip', label + (cls ? '' : ' ↗'));
    a.href = act.href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.addEventListener('click', e => e.stopPropagation());
    return a;
  }
  if (act.type === 'card') return button(cls || 'dk-chip', label, () => openCard(act.id));
  if (act.type === 'tab') return button(cls || 'dk-chip', label, () => _o.openTab(act.id));
  if (act.type === 'thread') return button(cls || 'dk-chip', label, () => _o.openThread(act.id));
  if (act.type === 'pc') return el('span', 'dk-chip pc', 'On the PC: ' + link.label);
  return null;
}

function chips(links, seen) {
  const nodes = (seen ? unseenLinks(links, seen) : links || []).map(l => linkNode(l)).filter(Boolean);
  if (!nodes.length) return null;
  const row = el('div', 'dk-chips');
  row.append(...nodes);
  return row;
}

function titleNode(item) {
  const h = el('h3', 'dk-title');
  const link = item.primary_link && linkAction(item.primary_link).type !== 'pc' ? linkNode(item.primary_link, item.title, 'dk-tlink') : null;
  if (link) h.append(link); else h.textContent = item.title;
  return h;
}

function richText(tag, cls, text, terms) {
  const node = el(tag, cls);
  textParts(text, terms).forEach(p => {
    if (p.term) node.append(button('dk-term', p.term.name, () => toggleTerm(node, p.term)));
    else node.append(document.createTextNode(p.text));
  });
  return node;
}

function toggleTerm(host, term) {
  const next = host.nextElementSibling;
  if (next && next.classList.contains('dk-termbox') && next.dataset.key === term.key) { next.remove(); return; }
  if (next && next.classList.contains('dk-termbox')) next.remove();
  const box = el('div', 'dk-termbox');
  box.dataset.key = term.key;
  box.append(el('b', '', term.name));
  [['What it is', term.what], ['Why the form wants it', term.why], ['How to find yours', term.find]].forEach(([h, v]) => {
    if (v) { box.append(el('span', 'dk-termh', h)); box.append(el('span', '', v)); }
  });
  if (term.source && isHttps(term.source.url)) box.append(linkNode({ kind: 'url', label: 'Source: ' + term.source.label, target: term.source.url }));
  box.append(button('dk-link', 'Close', () => box.remove()));
  host.after(box);
}

function stepsList(steps, terms, seen) {
  const ol = el('ol', 'dk-steps');
  steps.forEach(s => {
    const p = stepParts(s);
    const detail = stepDetail(s);
    const li = terms && terms.size ? richText('li', '', p.text, terms) : el('li', '', p.text);
    if (detail.length) {
      const d = el('details', 'dk-sd');
      d.append(el('summary', '', 'Details'));
      const list = el('ol', '');
      detail.forEach(x => list.append(terms && terms.size ? richText('li', '', x, terms) : el('li', '', x)));
      d.append(list);
      li.append(d);
    }
    const row = chips(p.links, seen);
    if (row) li.append(row);
    ol.append(li);
  });
  return ol;
}

function sourcesBlock(item) {
  const list = cleanSources(item.sources);
  if (!list.length) return null;
  const d = el('details', 'dk-sources');
  d.append(el('summary', '', `Sources (${list.length})`));
  const ul = el('ul', '');
  list.forEach(s => {
    const li = el('li', '');
    li.append(linkNode({ kind: 'url', label: s.label, target: s.url }, s.label + ' ↗', 'dk-inline'));
    if (s.used_for) li.append(el('span', '', 'Used for: ' + s.used_for));
    ul.append(li);
  });
  d.append(ul);
  return d;
}

function valuesBlock(values, items) {
  const box = el('div', 'dk-vals');
  values.forEach(v => {
    const row = el('div', 'dk-val');
    row.append(el('b', '', v.label + ': '));
    if (v.value != null) {
      row.append(el('span', 'dk-valtext', v.value));
      const copy = button('dk-copy', 'Copy', async () => {
        try { await navigator.clipboard.writeText(v.value); copy.textContent = 'Copied'; } catch { copy.textContent = 'Press and hold to copy'; }
      });
      row.append(copy);
    } else if (v.from && items.has(v.from)) {
      row.append(button('dk-chip', 'Made by: ' + items.get(v.from).title, () => openCard(v.from)));
    }
    box.append(row);
  });
  return box;
}

function whyInput(id, placeholder) {
  const input = el('input', 'dk-whyin' + (_need.has(id) ? ' need' : ''));
  input.type = 'text';
  input.maxLength = 300;
  input.placeholder = placeholder;
  input.value = _whys.get(id) || '';
  input.addEventListener('input', () => { _whys.set(id, input.value); _need.delete(id); input.classList.remove('need'); });
  input.addEventListener('click', e => e.stopPropagation());
  return input;
}

function actions(item, stuckNow) {
  const box = el('div', 'dk-acts');
  const text = () => (_whys.get(item.id) || '').trim();
  if (stuckNow) {
    box.append(el('p', 'dk-stuckline', stuckNow.hasKids
      ? (stuckNow.why ? 'You said: ' + stuckNow.why : 'Repair missions are listed above.')
      : 'Cas is working on it. Repair missions appear under this card when they are ready.' + (stuckNow.why ? ' You said: ' + stuckNow.why : '')));
    if (stuckNow.held) box.append(el('p', 'dk-heldline', stuckNow.held));
    box.append(button('dk-act', 'Unstuck', () => answer(item.id, 'unstuck')));
    return box;
  }
  const hasChoices = item.choices && item.choices.length;
  if (hasChoices) {
    const list = el('div', 'dk-choices');
    item.choices.forEach((c, i) => list.append(button('dk-choice', c.label, () => answer(item.id, 'choice', { choice: i, why: text() }))));
    box.append(list);
  }
  box.append(whyInput(item.id, hasChoices ? 'Why, or what is in the way (one line)' : 'If stuck: what is in the way? (one line)'));
  if (_need.has(item.id)) box.append(el('p', 'dk-needline', 'Say in a line what is in the way, then press Stuck.'));
  const row = el('div', 'dk-row2');
  if (!hasChoices) row.append(button('dk-act done', 'Done', () => answer(item.id, 'done', { why: text() })));
  row.append(button('dk-act', 'Stuck', () => {
    if (!text()) { _need.add(item.id); draw(); const n = _panel.querySelector(`[data-id="${CSS.escape(item.id)}"] .dk-whyin`); if (n) n.focus(); return; }
    answer(item.id, 'stuck', { why: text() });
  }));
  box.append(row);
  return box;
}

async function sendToCas(kid, parent, why) {
  if (_busy.has(kid.id)) return;
  if (!_o.send) { _o.openCas(casMessage(parent, kid, why)); return; }
  _busy.add(kid.id);
  if (!_sentKids.has(kid.id)) {
    try { await _o.send(casMessage(parent, kid, why)); } catch { _busy.delete(kid.id); say('Not sent. Try again.'); return; }
    _sentKids.add(kid.id);
  }
  _busy.delete(kid.id);
  await answer(kid.id, 'done');
  say('Sent to Cas.');
}

let _kidOpen = null;

function kidCard(item, done, stuckNow, parent, why) {
  const k = el('details', 'dk-kid' + (done ? ' finished' : ''));
  k.dataset.id = item.id;
  const head = el('summary', 'dk-kidhead');
  head.append(titleNode(item));
  if (item.minutes != null) head.append(el('span', 'dk-min', item.minutes + ' min'));
  k.append(head);
  if (done) { k.append(el('p', 'dk-sum', 'Done.')); return k; }
  k.open = _kidOpen === item.id;
  k.addEventListener('toggle', () => {
    if (k.open) {
      _kidOpen = item.id;
      k.parentElement.querySelectorAll('details.dk-kid').forEach(o => { if (o !== k) o.open = false; });
    } else if (_kidOpen === item.id) _kidOpen = null;
  });
  if (item.summary) k.append(el('p', 'dk-sum', item.summary));
  if (item.cas_prompt) {
    k.append(button('dk-act cas', 'Send to Cas', () => sendToCas(item, parent, why)));
    return k;
  }
  const seen = new Set();
  if (item.steps && item.steps.length) k.append(stepsList(item.steps, null, seen));
  const row = chips(item.links, seen);
  if (row) k.append(row);
  k.append(actions(item, stuckNow));
  return k;
}

const visibleKids = (kids, stuck) => (stuck || kids.some(k => !k.done) ? kids : []);

function holdSheet(item) {
  const id = item.id;
  const box = el('div', 'dk-holdbox');
  box.append(el('p', 'dk-holdh', 'Hold this card. Why?'));
  const chipRow = el('div', 'dk-holdchips');
  HOLD_REASONS.forEach(r => chipRow.append(button('dk-chip' + ((_holdWhy.get(id) || '') === r ? ' on' : ''), r, () => { _holdWhy.set(id, r); _need.delete('hold:' + id); draw(); })));
  box.append(chipRow);
  const input = el('input', 'dk-whyin dk-holdin' + (_need.has('hold:' + id) ? ' need' : ''));
  input.type = 'text'; input.maxLength = 200; input.placeholder = 'Or say why in a line';
  input.value = _holdWhy.get(id) || '';
  input.addEventListener('input', () => { _holdWhy.set(id, input.value); _need.delete('hold:' + id); input.classList.remove('need'); });
  input.addEventListener('click', e => e.stopPropagation());
  box.append(input);
  if (_need.has('hold:' + id)) box.append(el('p', 'dk-needline', 'Pick a reason or write one, then choose when.'));
  const dates = holdDates();
  const row = el('div', 'dk-row2');
  row.append(button('dk-act', 'Back tomorrow', () => holdCard(id, holdUntil('tomorrow'))));
  row.append(button('dk-act', 'This weekend', () => holdCard(id, holdUntil('weekend'))));
  row.append(button('dk-act', 'Pick a date', () => { _holdPick = !_holdPick; draw(); }));
  box.append(row);
  if (holdUntil('weekend') === dates.today) box.append(el('p', 'dk-hold', 'It is the weekend, so This weekend means back tomorrow.'));
  if (_holdPick) {
    const pick = el('div', 'dk-holdpick');
    const d = el('input', 'dk-whyin'); d.type = 'date'; d.min = dates.today; d.max = dates.max; d.value = dates.today;
    d.addEventListener('click', e => e.stopPropagation());
    pick.append(d, button('dk-act', 'Hold until this day', () => { const u = holdUntil('date', new Date(), d.value); if (u) holdCard(id, u); else say('Pick a day from today to 90 days ahead.'); }));
    box.append(pick);
  }
  box.append(button('dk-notoday', 'Cancel', () => { _holdFor = null; _holdPick = false; draw(); }));
  return box;
}

function heldStrip(list) {
  const box = el('details', 'dk-fold dk-heldstrip');
  box.open = _heldOpen;
  box.addEventListener('toggle', () => { _heldOpen = box.open; });
  box.append(el('summary', '', `Held (${list.length})`));
  list.forEach(h => {
    const row = el('div', 'dk-donerow');
    row.append(el('span', '', h.title || words(h.id)));
    row.append(el('small', '', [h.until ? 'Back ' + dayWords(h.until) : '', h.reason].filter(Boolean).join(' · ')));
    row.append(button('dk-link', 'Unhold', () => unhold(h.id)));
    box.append(row);
  });
  return box;
}

function card(item, n, ctx) {
  const c = el('details', 'dk-card' + (ctx.mine ? ' mine' : '') + (ctx.stuckNow ? ' stuck' : '') + (ctx.snoozed ? ' snoozed' : ''));
  c.dataset.id = item.id;
  c.open = _open.has(item.id);
  c.addEventListener('toggle', () => { if (c.open) _open.add(item.id); else _open.delete(item.id); });
  const top = el('summary', 'dk-top');
  top.append(el('span', 'dk-num', String(n)), el('span', 'dk-proj', words(item.project)), el('span', 'dk-kind dk-kind-' + item.kind, KIND[item.kind] || item.kind));
  if (item.minutes != null) top.append(el('span', 'dk-min', 'takes ' + item.minutes + ' min'));
  top.append(titleNode(item));
  const marks = el('div', 'dk-marks');
  if (ctx.mine) { marks.append(el('span', 'dk-mark', 'Your order')); marks.append(button('dk-rel', 'Release', () => release(item.id))); }
  if (ctx.stuckNow && !ctx.kids.length) marks.append(el('span', 'dk-mark warn', 'Cas is working on it'));
  if (ctx.snoozed) marks.append(el('span', 'dk-mark', 'Not today'), button('dk-rel', 'Bring back', () => answer(item.id, 'undo')));
  if (marks.childNodes.length) top.append(marks);
  top.append(grip(item, ctx));
  c.append(top);

  const body = el('div', 'dk-cbody');
  const back = item.returned_from_hold;
  if (back && typeof back === 'object' && back.reason) body.append(el('p', 'dk-backhold', `Back from hold: ${back.reason}, held on ${dayWords(back.held_on) || 'an earlier day'}.`));
  if (item.rank_reason) body.append(el('p', 'dk-why', item.rank_reason));
  const terms = termMap(item);
  if (item.summary) body.append(terms.size ? richText('p', 'dk-sum', item.summary, terms) : el('p', 'dk-sum', item.summary));
  if (ctx.waiting.length) {
    const w = el('p', 'dk-unl wait');
    w.append(el('b', '', 'Needs first: '));
    ctx.waiting.forEach((x, i) => { if (i) w.append(', '); w.append(button('dk-inline', x.title, () => openCard(x.id))); });
    body.append(w);
  }
  const seen = new Set();
  if (item.steps && item.steps.length) body.append(stepsList(item.steps, terms, seen));
  if (item.values && item.values.length) body.append(valuesBlock(item.values, ctx.items));
  const row = chips(item.links, seen);
  if (row) body.append(row);
  if (ctx.hint) { const u = el('p', 'dk-unl'); u.append(el('b', '', 'Doing this unlocks: '), document.createTextNode(ctx.hint)); body.append(u); }
  if (item.unblocks) { const u = el('p', 'dk-unb'); u.append(el('b', '', 'Unblocks: '), document.createTextNode(item.unblocks)); body.append(u); }
  if (ctx.kids.length) {
    const kids = el('div', 'dk-kids');
    kids.append(el('p', 'dk-kidsh', 'Missions to get you unstuck'));
    ctx.kids.forEach(k => { if (ctx.items.has(k.id)) kids.append(kidCard(ctx.items.get(k.id), k.done, ctx.stuckMap[k.id] !== undefined ? { why: ctx.stuckMap[k.id] } : null, item, ctx.stuckNow && ctx.stuckNow.why)); });
    body.append(kids);
  }
  body.append(actions(item, ctx.stuckNow && { ...ctx.stuckNow, hasKids: ctx.kids.length > 0 }));
  if (!ctx.snoozed && !ctx.stuckNow) body.append(button('dk-notoday', 'Not today', () => answer(item.id, 'notnow')));
  if (!ctx.snoozed) body.append(_holdFor === item.id ? holdSheet(item) : button('dk-notoday', 'Hold this card', () => { _holdFor = item.id; _holdPick = false; draw(); }));
  const sources = sourcesBlock(item);
  if (sources) body.append(sources);
  body.append(el('p', 'dk-src', srcText()));
  c.append(body);
  return c;
}


function grip(item, ctx) {
  const box = el('div', 'dk-grip');
  const order = orderedIds(_data);
  const pos = order.indexOf(item.id);
  const handle = el('div', 'dk-handle');
  handle.setAttribute('role', 'button');
  handle.setAttribute('aria-label', 'Drag to reorder');
  handle.append(el('i'), el('i'), el('i'));
  handle.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); });
  if (ctx.drag) handle.addEventListener('pointerdown', e => startDrag(e, handle, item.id));
  else handle.classList.add('still');
  const ud = el('div', 'dk-ud');
  const up = button('dk-step', '▲', () => { const n = stepBy(orderedIds(_data), item.id, -1); if (n) commitOrder(n, item.id); });
  const down = button('dk-step', '▼', () => { const n = stepBy(orderedIds(_data), item.id, 1); if (n) commitOrder(n, item.id); });
  up.setAttribute('aria-label', 'Move up');
  down.setAttribute('aria-label', 'Move down');
  up.disabled = pos <= 0;
  down.disabled = pos < 0 || pos >= order.length - 1;
  ud.append(up, down);
  box.append(handle, ud);
  return box;
}

function startDrag(e, handle, id) {
  if (e.button !== undefined && e.button > 0) return;
  e.preventDefault();
  const cards = [...(_panel.querySelectorAll('.dk-main > .dk-card'))];
  const idx = cards.findIndex(c => c.dataset.id === id);
  if (idx < 0) return;
  const rects = cards.map(c => c.getBoundingClientRect());
  const mids = rects.map(r => r.top + r.height / 2);
  const lift = cards[idx];
  const step = rects[idx].height + 12;
  const startY = e.clientY;
  let target = idx;
  lift.classList.add('lifted');
  try { handle.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
  const move = ev => {
    const dy = ev.clientY - startY;
    lift.style.transform = `translateY(${dy}px) scale(1.02)`;
    target = dropIndex(mids, idx, mids[idx] + dy);
    cards.forEach((c, j) => {
      if (j === idx) return;
      c.style.transform = idx < target && j > idx && j <= target ? `translateY(${-step}px)` : idx > target && j >= target && j < idx ? `translateY(${step}px)` : '';
    });
  };
  const end = ev => {
    handle.removeEventListener('pointermove', move);
    handle.removeEventListener('pointerup', end);
    handle.removeEventListener('pointercancel', end);
    cards.forEach(c => { c.style.transform = ''; c.classList.remove('lifted'); });
    const shown = cards.map(c => c.dataset.id);
    const order = orderedIds(_data);
    const next = ev.type === 'pointerup' && target !== idx ? moveTo(order, id, order.indexOf(shown[target])) : null;
    if (next) commitOrder(next, id);
  };
  handle.addEventListener('pointermove', move);
  handle.addEventListener('pointerup', end);
  handle.addEventListener('pointercancel', end);
}


function subTabs() {
  const row = el('div', 'or-tabs');
  SUBS.forEach(([key, label]) => {
    const b = button('or-tab' + (_sub === key ? ' on' : ''), label, () => { _sub = key; loadSub(); draw(); });
    b.setAttribute('aria-pressed', String(_sub === key));
    row.append(b);
  });
  return row;
}

function loadSub(force) {
  if (_sub === 'orders') loadOrders(force); else if (_sub === 'dashboard') loadDashboard(force); else if (_sub === 'bulletin') { load(force); loadDashboard(force); } else load(force);
}

async function jumpToCard(id) {
  _sub = 'desk';
  _open.add(id);
  draw();
  if (_state !== 'ready') await load(true);
  if (_state !== 'ready') { say('The Desk is not available right now.'); return; }
  if (!orderedIds(_data || {}).includes(id)) { say('That card is not on the Desk right now.'); return; }
  draw();
  openCard(id);
}

function draw() {
  const panel = _panel;
  if (!panel) return;
  if ((_sub === 'orders' || _sub === 'dashboard') && typingInOrders()) return;
  const scroll = panel.scrollTop;
  const typing = document.activeElement && document.activeElement.classList.contains('dk-whyin') ? document.activeElement.closest('[data-id]') : null;
  const typingId = typing && typing.dataset.id;
  panel.replaceChildren();
  const head = el('div', 'dk-head');
  head.append(el('h2', 'dk-h', 'Desk'));
  const wrap = el('div', 'dk-body');
  panel.append(head, subTabs(), wrap);

  if (_sub === 'orders' || _sub === 'dashboard') {
    clearTimeout(_rerankTimer);
    head.append(el('span', 'dk-pill', _sub === 'orders' ? ordersPill() : 'Dashboard'));
    if (_sub === 'orders') renderOrders(wrap); else renderDashboard(wrap);
    panel.scrollTop = scroll;
    return;
  }

  if (_state === 'idle' || _state === 'loading') { wrap.append(el('p', 'dk-note', 'Loading...')); return; }
  if (_state === 'failed') {
    wrap.append(el('p', 'dk-note', 'Not available right now.'), button('dk-btn', 'Try again', () => load(true)));
    return;
  }
  if (_state === 'empty') { wrap.append(el('p', 'dk-note', 'Nothing here yet. The list appears once the PC sends it.')); return; }
  if (_sub === 'bulletin') {
    clearTimeout(_rerankTimer);
    const need = orderedIds(_data).length;
    const logged = Math.max(doneList(_data).length, Number(_data.done_total) || 0);
    head.append(el('span', 'dk-pill' + (need ? '' : ' none'), need ? need + ' need you' : 'All clear'));
    renderBulletin(wrap, [{ label: 'Cards that need you', value: String(need), note: 'on the Work Desk' }, { label: 'Done log', value: String(logged), note: 'cards finished' }]);
    panel.scrollTop = scroll;
    return;
  }

  const items = itemsById(_data);
  const heldList = heldCards(_data);
  const heldIds = new Set(heldList.map(h => h.id));
  const ids = orderedIds(_data).filter(id => !heldIds.has(id));
  if (!_openInit && ids.length) { _open.add(ids[0]); _openInit = true; }
  const mine = new Set(field('mine', []));
  const snoozed = new Set(field('snoozed', []));
  const stuckMap = field('stuck', {});
  const kidsMap = field('children', {});
  const waitMap = field('waiting', {});
  const hints = field('hints', {});
  const a = age(_data);
  head.append(el('span', 'dk-pill' + (ids.length ? '' : ' none'), ids.length ? ids.length + ' need you' : 'All clear'));
  if (_refreshFailed) wrap.append(el('p', 'dk-stale', 'Could not refresh just now. This is the last list received.'));
  const oldNote = el('p', 'dk-stale dk-old', oldText(a));
  oldNote.hidden = !a.old;
  wrap.append(oldNote);

  if (_toast) {
    const t = el('div', 'dk-toast');
    t.append(el('span', '', _toast.text));
    if (_toast.undo) t.append(button('dk-link', 'Undo', () => { const fn = _toast.undo; _toast = null; fn(); }));
    wrap.append(t);
  }
  const rr = _data.rerank;
  if (rr && rr.line) {
    const n = el('div', 'dk-note2');
    n.append(el('span', '', rr.line), button('dk-link', 'Undo', undoRerank));
    wrap.append(n);
  }
  if (_data.rerank_in != null) wrap.append(el('p', 'dk-hold', `Your order holds. The rest re-ranks in about ${Math.max(1, Math.ceil(_data.rerank_in / 60))} min.`));
  const strip = _data.strip;
  if (strip && items.has(strip.id)) {
    const s = el('div', 'dk-strip');
    const t = el('div');
    t.append(el('b', '', 'Biggest unlock right now'), el('span', '', strip.text));
    s.append(t, button('dk-show', 'Show me', () => openCard(strip.id)));
    wrap.append(s);
  }
  if (!ids.length) wrap.append(el('p', 'dk-note', 'Nothing needs you right now.'));

  const make = (id, n, drag) => {
    const item = items.get(id);
    const ctx = {
      drag, items, stuckMap, mine: mine.has(id), snoozed: snoozed.has(id), stuckNow: id in stuckMap ? { why: stuckMap[id], held: (field('held', {})[id] || {}).line || '' } : null,
      hint: hints[id], waiting: waitMap[id] || [], kids: visibleKids(kidsMap[id] || [], id in stuckMap),
    };
    try { return card(item, n, ctx); } catch (e) {
      console.warn('Desk card fell back to plain form:', id, e && e.message);
      try { return card(plainItem(item), n, ctx); } catch { return el('p', 'dk-note', 'This card could not be shown.'); }
    }
  };
  const main = el('div', 'dk-main');
  ids.slice(0, SHOWN).forEach((id, i) => main.append(make(id, i + 1, true)));
  wrap.append(main);
  if (ids.length > SHOWN) {
    const more = el('details', 'dk-fold');
    more.open = _moreOpen;
    more.addEventListener('toggle', () => { _moreOpen = more.open; });
    more.append(el('summary', '', `Top ${SHOWN} shown, ${ids.length - SHOWN} more folded`));
    ids.slice(SHOWN).forEach((id, i) => more.append(make(id, SHOWN + i + 1, false)));
    wrap.append(more);
  }

  if (heldList.length) wrap.append(heldStrip(heldList));

  const answered = field('answered', []);
  if (answered.length) {
    const box = el('details', 'dk-fold dk-ans');
    box.open = _answeredOpen;
    box.addEventListener('toggle', () => { _answeredOpen = box.open; });
    box.append(el('summary', '', `Answered (${answered.length})`));
    answered.forEach(x => {
      const row = el('div', 'dk-donerow');
      row.append(el('span', '', x.title));
      row.append(el('small', '', [words(x.project), x.kind === 'done' ? 'Done' : x.choice, x.why].filter(Boolean).join(' · ')));
      row.append(button('dk-link', 'Change answer', () => answer(x.id, 'undo')));
      box.append(row);
    });
    wrap.append(box);
  }

  const done = doneList(_data);
  if (done.length) {
    const box = el('details', 'dk-fold dk-done');
    const fresh = _lookBase ? done.filter(d => d.seen > _lookBase).length : 0;
    const total = Math.max(done.length, Number(_data.done_total) || 0);
    box.open = _doneOpen;
    box.append(el('summary', '', fresh ? `Done since you last looked (${fresh} new, ${total} logged)` : `Done log (${total})`));
    box.addEventListener('toggle', () => { _doneOpen = box.open; if (box.open && _data && _data.now) setLastLook(_data.now); });
    done.forEach(d => {
      const row = el('div', 'dk-donerow');
      row.append(el('span', '', d.title));
      if (d.project || d.note) row.append(el('small', '', [d.project ? words(d.project) : '', d.note].filter(Boolean).join(' · ')));
      box.append(row);
    });
    wrap.append(box);
  }
  panel.scrollTop = scroll;
  const again = typingId && panel.querySelector(`[data-id="${CSS.escape(typingId)}"] .dk-whyin`);
  if (again) again.focus();
  clearTimeout(_rerankTimer);
  if (_data.rerank_in != null) _rerankTimer = setTimeout(() => load(true), (Math.min(_data.rerank_in, RERANK_S) + 3) * 1000);
}

let _inflightP = Promise.resolve();

function load(force) {
  if (_inflight) {
    if (force) _inflightP = _inflightP.then(() => doLoad(true));
    return _inflightP;
  }
  _inflightP = doLoad(force);
  return _inflightP;
}

async function doLoad(force) {
  if (_inflight) return;
  if (!force && _state === 'ready' && Date.now() - _loadedAt < FRESH_MS) return;
  _inflight = true;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  if (_state !== 'ready') { _state = 'loading'; draw(); }
  try {
    const res = await fetch(`${_o.apiBase}/api/station/desk`, { headers: { Authorization: 'Bearer ' + _o.getToken() }, signal: ctl.signal });
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    if (!data || typeof data !== 'object') throw new Error('shape');
    _data = data;
    if (!_doneOpen) _lookBase = lastLook();
    _state = data.feed && Array.isArray(data.feed.items) ? 'ready' : 'empty';
    _loadedAt = Date.now();
    _refreshFailed = false;
  } catch {
    if (_state !== 'ready') _state = 'failed';
    else _refreshFailed = true;
  } finally {
    clearTimeout(timer);
    _inflight = false;
  }
  draw();
  _onData();
}

/** The Desk cards as small missions, for the Missions tab. */
export function deskMissions() { return _state === 'ready' ? deskRows(_data) : []; }

/** Load the list without drawing it on screen first (the Missions tab asks). */
export function preloadDesk(done) { _onData = done || (() => {}); load(false); }

export function showDesk() {
  if (!_panel) _panel = document.getElementById('panel-desk');
  if (_state === 'ready' || _state === 'empty' || _sub === 'orders' || _sub === 'dashboard') draw();
  startTick();
  loadSub(false);
}

export function initDesk(panel, options) {
  _panel = panel;
  _o = { ..._o, ...options };
  initOrders({ apiBase: _o.apiBase, getToken: _o.getToken, openCard: jumpToCard, showOrders: () => { _sub = 'orders'; draw(); }, redraw: draw, unavailable: () => { if (_sub === 'orders') { _sub = 'desk'; load(true); draw(); } } });
  draw();
}
