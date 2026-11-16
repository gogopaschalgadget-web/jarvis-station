// cas-desk.js - the Desk tab: one ranked list of what Chris must decide, confirm, review or do.
// Step 1 is read-only. It reads the feed the PC uploaded to the server (device login) and draws it.
// It sends nothing back: no answers, no edits, no re-plan. Every state is calm and nothing loops:
// one request per open of the tab at most, and a failure waits for Chris to tap "Try again". No em dashes.

const FRESH_MS = 60_000;          // opening the tab again within a minute reuses what is on screen
const OLD_FEED_S = 6 * 3600;      // a feed older than this says so
const SHOWN = 5;                  // "Top 5 shown", the rest fold (front-desk-design.md, guards)
const KIND = { decide: 'Decide', confirm: 'Confirm', review: 'Review', 'do-by-hand': 'Do by hand', update: 'Update' };

let _o = { apiBase: '', getToken: () => '' };
let _panel = null;
let _state = 'idle';              // idle | loading | ready | empty | failed
let _data = null;                 // { feed, uploaded, now } from the server
let _loadedAt = 0;
let _inflight = false;
let _refreshFailed = false;       // a refresh failed while an older list is still on screen
const TIMEOUT_MS = 15_000;        // a hung connection ends in "Not available right now", never in a stuck screen

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}

/** Open items in Chris's order: project_order first (unknown projects last), then the feed's own order. */
export function rankItems(feed) {
  const order = (feed && feed.project_order) || [];
  const rank = p => { const i = order.indexOf(p); return i < 0 ? order.length : i; };
  return ((feed && feed.items) || [])
    .map((item, index) => ({ item, index }))
    .filter(x => x.item.status === 'open')
    .sort((a, b) => rank(a.item.project) - rank(b.item.project) || a.index - b.index)
    .map(x => x.item);
}

/** Things finished since Chris last looked: the feed's list, then answered or done items. */
export function doneList(feed) {
  const out = ((feed && feed.done_since_last_look) || []).map(d => ({ title: d.title, project: d.project, note: '' }));
  ((feed && feed.items) || []).filter(i => i.status !== 'open').forEach(i => {
    out.push({ title: i.title, project: i.project, note: i.status === 'done' ? 'Done' : 'Answered' + (i.answer ? ': ' + shorten(i.answer, 110) : '') });
  });
  return out;
}

function shorten(text, max) { return text.length > max ? text.slice(0, max - 1).trimEnd() + '...' : text; }
function words(id) { return String(id || '').replace(/-/g, ' '); }

function age(data) {
  if (!data || data.uploaded == null || data.now == null) return { text: 'age unknown', old: false };
  const s = Math.max(0, Math.round(data.now - data.uploaded));
  const text = s < 90 ? 'just now' : s < 5400 ? Math.round(s / 60) + ' min old' : s < 172800 ? Math.round(s / 3600) + ' h old' : Math.round(s / 86400) + ' days old';
  return { text, old: s > OLD_FEED_S };
}

/** One card. Only the first is open; the others show number, project, kind, minutes and title, and open on tap (local only). */
function card(item, n, src, open) {
  const c = el('details', 'dk-card');
  c.open = !!open;
  const top = el('summary', 'dk-top');
  top.append(el('span', 'dk-num', String(n)), el('span', 'dk-proj', words(item.project)), el('span', 'dk-kind dk-kind-' + item.kind, KIND[item.kind] || item.kind));
  if (item.minutes != null) top.append(el('span', 'dk-min', item.minutes + ' min'));
  top.append(el('h3', 'dk-title', item.title));
  c.append(top);
  const body = el('div', 'dk-cbody');
  if (item.rank_reason) body.append(el('p', 'dk-why', item.rank_reason));
  if (item.summary) body.append(el('p', 'dk-sum', item.summary));
  if (item.steps && item.steps.length) {
    const ol = el('ol', 'dk-steps');
    item.steps.forEach(s => ol.append(el('li', '', s)));
    body.append(ol);
  }
  if (item.unblocks) { const u = el('p', 'dk-unb'); u.append(el('b', '', 'Unblocks: '), document.createTextNode(item.unblocks)); body.append(u); }
  if (item.choices && item.choices.length) {
    const opts = el('p', 'dk-opts');
    opts.append(el('b', '', 'Options: '), document.createTextNode(item.choices.map(ch => ch.label).join(' · ')));
    body.append(opts);
  }
  body.append(el('p', 'dk-src', 'Source: ' + src));
  c.append(body);
  return c;
}

function draw() {
  const panel = _panel;
  if (!panel) return;
  panel.replaceChildren();
  const head = el('div', 'dk-head');
  head.append(el('h2', 'dk-h', 'Desk'));
  const wrap = el('div', 'dk-body');
  panel.append(head, wrap);

  if (_state === 'idle' || _state === 'loading') { wrap.append(el('p', 'dk-note', 'Loading...')); return; }
  if (_state === 'failed') {
    wrap.append(el('p', 'dk-note', 'Not available right now.'));
    const again = el('button', 'dk-btn', 'Try again');
    again.type = 'button';
    again.addEventListener('click', () => load(true));
    wrap.append(again);
    return;
  }
  if (_state === 'empty') {
    wrap.append(el('p', 'dk-note', 'Nothing here yet. The list appears once the PC sends it.'));
    return;
  }
  const feed = _data.feed;
  const open = rankItems(feed);
  const a = age(_data);
  const pill = el('span', 'dk-pill' + (open.length ? '' : ' none'), open.length ? open.length + ' need you' : 'All clear');
  head.append(pill);
  const src = 'orchestrator feed, ' + a.text;
  if (_refreshFailed) wrap.append(el('p', 'dk-stale', 'Could not refresh just now. This is the last list received.'));
  if (a.old) wrap.append(el('p', 'dk-stale', 'This list is old. The PC has not sent a newer one.'));
  if (!open.length) wrap.append(el('p', 'dk-note', 'Nothing needs you right now.'));
  open.slice(0, SHOWN).forEach((item, i) => wrap.append(card(item, i + 1, src, i === 0)));
  if (open.length > SHOWN) {
    const more = el('details', 'dk-fold');
    more.append(el('summary', '', `Top ${SHOWN} shown, ${open.length - SHOWN} more folded`));
    open.slice(SHOWN).forEach((item, i) => more.append(card(item, SHOWN + i + 1, src)));
    wrap.append(more);
  }
  wrap.append(el('p', 'dk-later', 'Answering from the Desk comes in a later step. For now, answer in the thread each card names.'));
  const done = doneList(feed);
  if (done.length) {
    const box = el('details', 'dk-fold dk-done');
    box.append(el('summary', '', `Done since you last looked (${done.length})`));
    done.forEach(d => {
      const row = el('div', 'dk-donerow');
      row.append(el('span', '', d.title));
      if (d.project || d.note) row.append(el('small', '', [d.project ? words(d.project) : '', d.note].filter(Boolean).join(' · ')));
      box.append(row);
    });
    wrap.append(box);
  }
}

async function load(force) {
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
    _state = data.feed && Array.isArray(data.feed.items) ? 'ready' : 'empty';
    _loadedAt = Date.now();
    _refreshFailed = false;
  } catch {
    if (_state !== 'ready') _state = 'failed'; // a good list already on screen stays rather than being replaced by an error
    else _refreshFailed = true;
  } finally {
    clearTimeout(timer);
    _inflight = false;
  }
  draw();
}

/** Called each time the Desk tab opens: draws what it has now, then asks the server once. */
export function showDesk() {
  if (!_panel) _panel = document.getElementById('panel-desk');
  if (_state === 'ready' || _state === 'empty') draw();
  load(false);
}

export function initDesk(panel, options) {
  _panel = panel;
  _o = { ..._o, ...options };
  draw();
}
