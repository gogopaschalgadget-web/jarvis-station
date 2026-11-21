// cas-orders.js - Orders of the Day and the Dashboard, the two other sub-tabs of the Desk. Server text goes in with textContent only.

import {
  BLOCKS, agoText, hoursText, weekText, windowText, streakText, carryTag, statusInfo, proofInfo, tickAction, loopAction, numbersFor, numberView, bulletinSections,
  tomorrowLocal, resetText, budgetLabel, timeWords, sittingTitle, normalizeOrders, normalizeDashboard, sittingGroups, quickGroup, quickTitle, rundownText, allDoneText, weekNote,
} from './cas-orders-logic.js?v=cas88';

const TIMEOUT_MS = 15_000;
const TOAST_MS = 8_000;
const FRESH_MS = 30_000;
const HINT_KEY = 'orders-time-hint';
const SAY = { 429: 'Too many changes in a minute. Wait a moment.' };

let _o = { apiBase: '', getToken: () => '', openCard: () => {}, showOrders: () => {}, redraw: () => {}, unavailable: () => {} };
const _orders = { state: 'idle', data: null, at: 0, busy: false, again: false };
let _seq = 0;
let _applied = 0;
const _dash = { state: 'idle', data: null, at: 0, busy: false, block: 'operation' };
let _toast = null;
let _toastTimer = 0;
let _ask = null;
const _why = new Map();

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

function hintSeen() { try { return localStorage.getItem(HINT_KEY) === '1'; } catch { return false; } }
function markHintSeen() { try { localStorage.setItem(HINT_KEY, '1'); } catch { /* no storage: the hint shows again */ } }

export function initOrders(options) { _o = { ..._o, ...options }; }

async function call(path, body) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${_o.apiBase}/api/station/desk${path}`, {
      method: body === undefined ? 'GET' : 'POST', signal: ctl.signal,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + _o.getToken() }, body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, json };
  } catch { return { ok: false, status: 0, json: {} }; } finally { clearTimeout(timer); }
}

function say(text, undo) {
  clearTimeout(_toastTimer);
  _toast = { text, undo };
  _o.redraw();
  _toastTimer = setTimeout(() => { _toast = null; _o.redraw(); }, TOAST_MS);
}

function failText(res) {
  if (SAY[res.status]) return SAY[res.status];
  return typeof res.json.detail === 'string' && res.status === 422 ? res.json.detail.replace(/^./, c => c.toUpperCase()) + '.' : 'Not saved. Try again.';
}

/** A reply replaces the screen only if it was asked for after the one already shown. */
function apply(json, seq) {
  const data = normalizeOrders(json);
  if (!data) return false;
  if (seq >= _applied) { _applied = seq; _orders.data = data; _orders.state = 'ready'; _orders.at = Date.now(); }
  return true;
}

export async function loadOrders(force) {
  if (_orders.busy) { if (force) _orders.again = true; return; }
  if (!force && _orders.state === 'ready' && Date.now() - _orders.at < FRESH_MS) return;
  _orders.busy = true;
  if (_orders.state !== 'ready') { _orders.state = 'loading'; _o.redraw(); }
  const seq = ++_seq;
  const res = await call('/orders');
  _orders.busy = false;
  const again = _orders.again;
  _orders.again = false;
  if (!(res.ok && apply(res.json, seq)) && _orders.state !== 'ready') _orders.state = 'failed';
  if (res.status === 404) { _o.unavailable(); return; }
  _o.redraw();
  if (again) loadOrders(true);
}

export async function loadDashboard(force) {
  if (_dash.busy || (!force && _dash.state === 'ready' && Date.now() - _dash.at < FRESH_MS)) return;
  _dash.busy = true;
  if (_dash.state !== 'ready') { _dash.state = 'loading'; _o.redraw(); }
  const res = await call('/dashboard');
  _dash.busy = false;
  const data = res.ok ? normalizeDashboard(res.json) : null;
  if (data) { _dash.data = data; _dash.state = 'ready'; _dash.at = Date.now(); } else if (_dash.state !== 'ready') _dash.state = 'failed';
  _o.redraw();
}

export function dashLoops() { return _dash.state === 'ready' && _dash.data && Array.isArray(_dash.data.loops) ? _dash.data.loops : []; }

export function ordersPill() {
  const d = _orders.data;
  return d && d.total ? `${d.done} of ${d.total}` : 'Orders';
}

async function change(path, body, okText, undo) {
  const seq = ++_seq;
  const res = await call(path, body);
  if (!res.ok) { say(failText(res)); if (res.status === 422) loadOrders(true); return false; }
  if (!apply(res.json, seq) || seq < _applied) loadOrders(true);
  say(okText, undo);
  return true;
}

function tick(row, done) {
  return change('/orders/tick', { key: row.key, done }, done ? 'Done: ' + row.title + '. Logged as a mission.' : 'Back on the list.', done ? () => tick(row, false) : null);
}

// Orders

function header(d) {
  const box = el('div', 'or-hd');
  const big = el('div', 'big');
  big.append(el('h3', '', 'Orders of the Day'), el('strong', '', `${d.done} of ${d.total}`));
  const bar = el('div', 'or-bar');
  const fill = el('i');
  fill.style.width = d.total ? Math.round((d.done / d.total) * 100) + '%' : '0%';
  bar.append(fill);
  const meta = el('div', 'or-meta');
  meta.append(el('span', '', `${hoursText(d.minutes_left)} left`), el('span', '', streakText(d.streak)), el('span', '', windowText(d.window)));
  box.append(big, el('p', 'or-run', rundownText(d)), bar, meta);
  const done = allDoneText(d);
  if (done) box.append(el('p', 'or-alldone', done));
  return box;
}

function timeRow(d) {
  const box = el('div', 'or-timebox');
  const row = el('div', 'or-time');
  row.append(el('span', '', 'Your time today'));
  d.budgets.forEach(m => {
    const b = button('or-chip' + (m === d.budget ? ' on' : ''), budgetLabel(m, d.kind), () => { markHintSeen(); if (m !== d.budget) change('/orders/budget', { minutes: m }, `Your time today is ${timeWords(m, d.kind)}.`); else _o.redraw(); });
    b.setAttribute('aria-pressed', String(m === d.budget));
    row.append(b);
  });
  box.append(row);
  if (!hintSeen()) {
    const hint = el('p', 'or-hint', "How much of your own time today's list may ask for. ");
    hint.append(button('or-hintx', 'Got it', () => { markHintSeen(); _o.redraw(); }));
    box.append(hint);
  }
  return box;
}

function rowNode(r) {
  const li = el('div', 'or-row' + (r.done ? ' done' : ''));
  const act = tickAction(r);
  const box = button('or-tick', r.done ? '✓' : '', () => (act === 'tick' ? tick(r, !r.done) : _o.openCard(r.id)));
  box.setAttribute('aria-label', act === 'tick' ? (r.done ? 'Mark not done' : 'Mark done') : 'Open to finish');
  const main = el('div', 'or-main');
  main.append(el('div', 'or-t', r.title));
  const s = el('div', 'or-s');
  s.append(document.createTextNode(`takes ${r.minutes} min · `), el('em', '', 'Why today:'), document.createTextNode(' ' + (r.why || 'best value for the time')));
  main.append(s);
  const tags = el('div', 'or-tags');
  if (r.carried > 0) tags.append(el('span', 'or-tag car', carryTag(r.carried)));
  if (r.test) tags.append(el('span', 'or-tag tst', 'Test mission'));
  if (act === 'open' && !r.done) tags.append(el('span', 'or-tag open', 'Open to finish'));
  if (tags.childNodes.length) main.append(tags);
  li.append(box, main);
  if (r.kind === 'card') {
    const chev = button('or-chev', '›', () => _o.openCard(r.id));
    chev.setAttribute('aria-label', 'Open the card');
    li.append(chev);
    main.addEventListener('click', () => _o.openCard(r.id));
  }
  return li;
}

function sittingNode(g, quick) {
  const box = el('section', 'or-sit');
  const head = el('div', 'or-sithd');
  head.append(el('b', '', quick ? quickTitle(g) : sittingTitle(g)));
  if (g.long) head.append(el('span', 'or-tag long', 'Long'));
  head.append(el('span', 'or-sitn', `${g.done} of ${g.total}`));
  const list = el('div', 'or-list');
  g.rows.forEach(r => list.append(rowNode(r)));
  box.append(head, list);
  return box;
}

function questionNode(q, dropNeedsWhy) {
  const box = el('div', 'or-q');
  box.append(el('h4', '', carryTag(q.carried)), el('div', 't', q.title), el('p', '', 'This has come back six days running. One question, so it stops coming back for no reason.'));
  const mode = _ask && _ask.key === q.key ? _ask.mode : null;
  const opts = el('div', 'or-opts');
  const choose = m => button('or-opt' + (mode === m ? ' on' : ''), { split: 'Split it smaller', schedule: 'Schedule it', drop: 'Drop it' }[m], () => {
    if (m === 'split') { change('/orders/resolve', { key: q.key, choice: 'split' }, 'Split noted. It leaves the list for a couple of days.'); return; }
    _ask = { key: q.key, mode: m, date: '' };
    _o.redraw();
  });
  opts.append(choose('split'), choose('schedule'), choose('drop'));
  box.append(opts);
  if (mode === 'schedule') {
    const input = el('input', 'or-in');
    input.type = 'date';
    input.min = tomorrowLocal();
    input.value = _ask.date || '';
    input.addEventListener('input', () => { _ask.date = input.value; });
    input.addEventListener('blur', () => setTimeout(_o.redraw, 0));
    box.append(input, button('or-go', 'Schedule', () => { if (input.value) change('/orders/resolve', { key: q.key, choice: 'schedule', until: input.value }, 'Scheduled for ' + input.value + '.'); }));
  } else if (mode === 'drop') {
    const input = el('input', 'or-in');
    input.type = 'text';
    input.maxLength = 300;
    input.placeholder = dropNeedsWhy ? 'Why (one line)' : 'Why (optional)';
    input.value = _why.get(q.key) || '';
    input.addEventListener('input', () => { _why.set(q.key, input.value); input.classList.remove('need'); });
    input.addEventListener('blur', () => setTimeout(_o.redraw, 0));
    box.append(input, button('or-go', 'Drop it', () => {
      const why = input.value.trim();
      if (dropNeedsWhy && !why) { input.classList.add('need'); input.focus(); return; }
      change('/orders/resolve', { key: q.key, choice: 'drop', why }, 'Dropped. It is kept in the record.');
    }));
  }
  return box;
}

const q0 = d => d.rows.some(r => r.quick);

function toastNode() {
  if (!_toast) return null;
  const t = el('div', 'or-toast');
  t.append(el('span', '', _toast.text));
  if (_toast.undo) t.append(button('dk-link', 'Undo', () => { const fn = _toast.undo; _toast = null; fn(); }));
  return t;
}

export function typingInOrders() {
  const a = document.activeElement;
  return !!(a && a.classList && a.classList.contains('or-in'));
}

export function renderOrders(wrap) {
  if (_orders.state === 'idle' || _orders.state === 'loading') { wrap.append(el('p', 'dk-note', 'Loading...')); return; }
  if (_orders.state === 'failed') { wrap.append(el('p', 'dk-note', 'Not available right now.'), button('dk-btn', 'Try again', () => loadOrders(true))); return; }
  const d = _orders.data;
  const t = toastNode();
  if (t) wrap.append(t);
  wrap.append(header(d));
  if (d.budgets.length) wrap.append(timeRow(d));
  d.questions.forEach(q => wrap.append(questionNode(q, d.drop_needs_why)));
  const groups = sittingGroups(d);
  if (!groups.length && !q0(d) && !d.questions.length) wrap.append(el('p', 'dk-note', 'No orders today. The plan appears once the PC has sent a list.'));
  const q = quickGroup(d);
  if (q) wrap.append(sittingNode(q, true));
  groups.forEach(g => wrap.append(sittingNode(g, false)));
  wrap.append(el('p', 'or-foot', `Closes at ${resetText(d.window)}, then a new list is built. Anything left goes back into the plan.`));
  if (weekText(d.week)) wrap.append(el('p', 'or-foot', weekText(d.week)));
  if (weekNote(d.week)) wrap.append(el('p', 'or-foot or-over', weekNote(d.week)));
}

// Dashboard

export function renderBulletin(wrap, top) {
  const row = el('div', 'db-nums');
  top.forEach(t => row.append(tile(t.label, t.value, t.note, false)));
  wrap.append(row);
  if (_dash.state === 'idle' || _dash.state === 'loading') { wrap.append(el('p', 'dk-note', 'Loading...')); return; }
  if (_dash.state === 'failed') { wrap.append(el('p', 'dk-note', 'Reports are not available right now.'), button('dk-btn', 'Try again', () => loadDashboard(true))); return; }
  const sections = bulletinSections(_dash.data);
  if (!sections.length) wrap.append(el('p', 'dk-note', 'No reports yet. Each number appears here once the PC sends it, with its source.'));
  sections.forEach(s => {
    wrap.append(el('h3', 'bb-h', s.label));
    const grid = el('div', 'db-nums');
    s.tiles.forEach(t => grid.append(tile(t.label, t.value, t.note, t.unknown)));
    if (grid.childNodes.length) wrap.append(grid);
    s.loops.forEach(l => {
      const line = el('div', 'bb-loop');
      const st = statusInfo(l.status);
      line.append(el('span', '', l.name), el('span', 'db-st ' + st.cls, st.label));
      wrap.append(line);
    });
  });
}

function tile(label, value, note, unknown) {
  const t = el('div', 'db-n');
  t.append(el('small', '', label), el('strong', unknown ? 'unk' : '', value), el('em', '', note));
  return t;
}

async function runLoopAction(a) {
  if (a.type === 'open') { _o.openCard(a.id); return; }
  const seq = ++_seq;
  const res = await call('/orders/add', { key: a.id });
  if (!res.ok) { say(failText(res)); return; }
  if (!apply(res.json, seq)) await loadOrders(true);
  _o.showOrders();
  say("Added to today's orders.");
}

function loopNode(l) {
  const box = el('div', 'db-loop');
  const st = statusInfo(l.status);
  const h = el('h4');
  h.append(document.createTextNode(l.name), el('span', 'db-st ' + st.cls, st.label));
  box.append(h);
  if (l.status_note) box.append(el('p', 'db-l', l.status_note));
  const last = el('p', 'db-l');
  last.append(el('b', '', 'Last run: '), document.createTextNode(l.last_run_age_s == null ? 'unknown' : agoText(l.last_run_age_s)));
  const needs = el('p', 'db-l');
  needs.append(el('b', '', 'Needs you: '), document.createTextNode(l.needs.length ? l.needs.map(n => String(n.text || '') + (Number.isFinite(n.minutes) ? ` (${n.minutes} min)` : '')).join('; ') : 'nothing reported'));
  box.append(last, needs);
  const proof = proofInfo(l.proof);
  const row = el('div', 'db-proof');
  row.append(el('span', proof.proven ? 'y' : 'n', (proof.proven ? '✓ ' : '') + proof.text));
  const a = loopAction(l);
  if (a) row.append(button('db-act', a.label, () => runLoopAction(a)));
  box.append(row);
  return box;
}

export function renderDashboard(wrap) {
  if (_dash.state === 'idle' || _dash.state === 'loading') { wrap.append(el('p', 'dk-note', 'Loading...')); return; }
  if (_dash.state === 'failed') { wrap.append(el('p', 'dk-note', 'Not available right now.'), button('dk-btn', 'Try again', () => loadDashboard(true))); return; }
  const d = _dash.data;
  const t = toastNode();
  if (t) wrap.append(t);
  const chips = el('div', 'db-blocks');
  BLOCKS.forEach(([key, label]) => chips.append(button('db-chip' + (_dash.block === key ? ' on' : ''), label, () => { _dash.block = key; _o.redraw(); })));
  wrap.append(chips);
  const nums = numbersFor(d.numbers, _dash.block);
  const grid = el('div', 'db-nums');
  if (_dash.block === 'operation') grid.append(tile('Loops proven', d.total ? `${d.proven} of ${d.total}` : 'unknown', d.total ? 'end-to-end test passed' : 'no loops reported yet', !d.total));
  nums.forEach(n => { const v = numberView(n); grid.append(tile(n.label, v.value, v.note, v.unknown)); });
  if (grid.childNodes.length) wrap.append(grid);
  if (_dash.block === 'operation') {
    if (!d.loops.length) wrap.append(el('p', 'dk-note', 'No loops reported yet. Each loop appears here with its real status once the PC sends it.'));
    d.loops.forEach(l => wrap.append(loopNode(l)));
  } else if (!nums.length) {
    wrap.append(el('p', 'dk-note', 'Nothing reported here yet. This block shows only real numbers, with their source and age. Until then it says unknown.'));
  }
}
