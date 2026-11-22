import { failureAction, REASON_MAX } from './cas-reveal-logic.js?v=cas93';
import { normalizeGallery, galleryEntry, countWords, dateWords, actionsFor, afterChoice, galleryChoiceBody, THUMB_PARALLEL, THUMB_WIDTH } from './cas-gallery-logic.js?v=cas104';

const TTL_MS = 30000;
const FAIL_MS = 60000;
const BACKOFF_MS = 5000;
let _o = { apiBase: '', getToken: () => '', say: () => {}, fetch: (...a) => fetch(...a) };
let _list = [];
let _state = 'idle';
let _loadedAt = 0;
let _failedAt = 0;
let _inflight = null;
let _inflightToken = null;
let _stopped = false;
let _epoch = 0;
let _gen = 0;
const _entries = new Set();
const _thumbs = new Map();
const _thumbPending = new Map();
const _thumbFail = new Map();
const _thumbWait = [];
let _thumbBusy = 0;
let _thumbPause = 0;
const _stack = [];
let _held = [];

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

export function initGallery(options) {
  _o = { ..._o, ...options };
  _stopped = false;
  _failedAt = 0;
}

async function call(path, body) {
  try {
    const res = await _o.fetch(`${_o.apiBase}/api/station/pictures${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { Authorization: 'Bearer ' + _o.getToken(), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { ok: res.ok, status: res.status, res };
  } catch { return { ok: false, status: 0, res: null }; }
}

const professional = () => { try { return document.documentElement.dataset.mode === 'professional'; } catch { return false; } };

/**
 * The pictures Chris kept, from the server; asked for again after 30 seconds or after a choice, never kept beyond the page.
 * An answer that left before a choice (or a sign-out) is discarded and asked for again, so it can never undo a choice or show the last account's list.
 */
export function loadGallery(force = false) {
  if (_stopped) return Promise.resolve(_list);
  if (_inflight && !(force && _inflightToken && _inflightToken.gen !== _gen)) return _inflight;
  if (!force && _state === 'ready' && Date.now() - _loadedAt < TTL_MS) return Promise.resolve(_list);
  if (!force && _state === 'failed' && Date.now() - _failedAt < BACKOFF_MS) return Promise.resolve(_list);
  const mine = { gen: _gen, epoch: _epoch };
  _inflightToken = mine;
  _inflight = (async () => {
    try {
      const r = await call('');
      if (mine.epoch !== _epoch) return _list;
      if (mine.gen !== _gen) return await loadGallery(true);
      if (r.ok) {
        try { _list = normalizeGallery(await r.res.json()); _state = 'ready'; _loadedAt = Date.now(); } catch { if (_state !== 'ready') { _state = 'failed'; _failedAt = Date.now(); } }
      } else {
        if (failureAction(r.status) === 'stop') _stopped = true;
        if (_state !== 'ready') { _state = 'failed'; _failedAt = Date.now(); }
      }
    } catch (e) {
      if (mine.epoch === _epoch && _state !== 'ready') { _state = 'failed'; _failedAt = Date.now(); }
      if (typeof console !== 'undefined') console.warn('[gallery]', e && e.message);
    } finally {
      if (_inflightToken === mine) { _inflight = null; _inflightToken = null; }
    }
    if (mine.epoch === _epoch) paintEntries();
    return _list;
  })();
  return _inflight;
}

export function invalidateGallery() { _loadedAt = 0; _gen++; }

/** Forget everything (sign-out): the list, every thumbnail, every open view; an answer still on its way from before is ignored. */
export function stopGallery() {
  _epoch++; _gen++;
  _list = []; _state = 'idle'; _loadedAt = 0; _failedAt = 0; _stopped = false; _inflight = null; _inflightToken = null;
  for (const u of _thumbs.values()) { try { URL.revokeObjectURL(u); } catch { /* gone */ } }
  _thumbs.clear(); _thumbPending.clear(); _thumbFail.clear(); _thumbWait.length = 0; _thumbPause = 0;
  closeAll();
}

// ---- thumbnails: fetched when they come near the screen, scaled in the browser, kept in memory only

async function makeThumb(id, epoch) {
  const r = await call('/' + encodeURIComponent(id) + '/picture');
  if (!r.ok) {
    if (epoch === _epoch) {
      if (failureAction(r.status) === 'stop') _stopped = true;
      if (r.status === 429) _thumbPause = Date.now() + BACKOFF_MS;
    }
    throw new Error(r.status === 429 ? 'busy' : 'failed');
  }
  const blob = await r.res.blob();
  if (!blob || typeof blob.type !== 'string' || !blob.type.startsWith('image/')) throw new Error('not an image');
  let bmp;
  try { bmp = await createImageBitmap(blob, { resizeWidth: THUMB_WIDTH, resizeQuality: 'medium' }); } catch { bmp = await createImageBitmap(blob); }
  const w = Math.min(THUMB_WIDTH, bmp.width);
  const h = Math.max(1, Math.round(bmp.height * (w / bmp.width)));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#14100a';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bmp, 0, 0, w, h);
  if (bmp.close) bmp.close();
  const small = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.8));
  if (!small) throw new Error('no thumbnail');
  if (epoch !== _epoch) return '';
  return URL.createObjectURL(small);
}

function pump() {
  if (_stopped) { while (_thumbWait.length) { const j = _thumbWait.shift(); _thumbPending.delete(j.id); j.done(''); } return; }
  if (Date.now() < _thumbPause) { setTimeout(pump, _thumbPause - Date.now() + 20); return; }
  while (_thumbBusy < THUMB_PARALLEL && _thumbWait.length) {
    const job = _thumbWait.shift();
    const epoch = _epoch;
    _thumbBusy++;
    makeThumb(job.id, epoch)
      .then(u => { if (u && epoch === _epoch) _thumbs.set(job.id, u); job.done(epoch === _epoch ? u : ''); })
      .catch(() => { if (epoch === _epoch) _thumbFail.set(job.id, Date.now() + (Date.now() < _thumbPause ? BACKOFF_MS : FAIL_MS)); job.done(''); })
      .finally(() => { _thumbBusy--; if (epoch === _epoch) _thumbPending.delete(job.id); pump(); });
  }
}

function thumbFor(id) {
  if (_stopped) return Promise.resolve('');
  if (_thumbs.has(id)) return Promise.resolve(_thumbs.get(id));
  if (_thumbFail.has(id) && Date.now() < _thumbFail.get(id)) return Promise.resolve('');
  if (_thumbPending.has(id)) return _thumbPending.get(id);
  const p = new Promise(done => { _thumbWait.push({ id, done }); });
  _thumbPending.set(id, p);
  pump();
  return p;
}

function lazyImage(img, id) {
  const go = () => thumbFor(id).then(u => { if (u && img.isConnected !== false) img.src = u; });
  if (typeof IntersectionObserver === 'function') {
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { io.disconnect(); go(); } }, { rootMargin: '120px' });
    io.observe(img);
    img.__io = io;
  } else go();
}

function dropObservers(node) {
  for (const old of node.querySelectorAll ? node.querySelectorAll('img') : []) { if (old.__io) old.__io.disconnect(); }
}

// ---- the entry on the Bulletin Board

function fillEntry(box) {
  dropObservers(box);
  box.replaceChildren();
  const info = galleryEntry(_list);
  const btn = el('button', 'gal-entry');
  btn.type = 'button';
  const pic = el('div', 'gal-entry-pic');
  if (info.newest && !professional()) { const img = el('img'); img.alt = ''; img.decoding = 'async'; pic.append(img); lazyImage(img, info.newest.id); }
  const body = el('div', 'gal-entry-body');
  body.append(el('b', '', 'Gallery'));
  const down = (_state === 'failed' || _stopped) && !info.count;
  if (down) body.append(el('span', '', 'Not available right now.'));
  else if (_state !== 'ready' && !info.count) body.append(el('span', '', 'Loading...'));
  else if (!info.count) body.append(el('span', '', 'Finish a card to earn your first picture.'));
  else body.append(el('span', '', countWords(info.count) + ' kept'), el('small', '', 'Newest ' + dateWords(info.newest.created)));
  btn.append(pic, body);
  btn.addEventListener('click', () => openGrid());
  box.append(btn);
}

function pruneEntries() {
  for (const box of [..._entries]) if (box.isConnected === false) _entries.delete(box);
}

function paintEntries() {
  pruneEntries();
  for (const box of _entries) fillEntry(box);
  for (const e of _stack) if (e.refresh) e.refresh();
}

/** The Gallery entry for the Bulletin Board: a count and the newest thumbnail; it fills itself in when the list arrives. */
export function galleryEntryNode() {
  pruneEntries();
  const box = el('div', 'gal-wrap');
  _entries.add(box);
  fillEntry(box);
  loadGallery(false);
  return box;
}

// ---- overlays: a stack (the grid, then one picture); Escape and every other close act on the top one only

function onKey(e) {
  if (e.key !== 'Escape' || !_stack.length) return;
  if (e.stopImmediatePropagation) e.stopImmediatePropagation();
  popEntry(_stack[_stack.length - 1]);
}

function overlay(label, onClose) {
  const shell = el('div', 'gal-overlay');
  shell.setAttribute('role', 'dialog');
  shell.setAttribute('aria-modal', 'true');
  shell.setAttribute('aria-label', label);
  const entry = { shell, refresh: null, onClose, prev: _stack.length ? null : document.activeElement };
  if (!_stack.length) {
    _held = [...(document.body ? document.body.children : [])].filter(c => !c.inert);
    _held.forEach(c => { c.inert = true; });
    document.addEventListener('keydown', onKey, true);
  } else _stack[_stack.length - 1].shell.inert = true;
  _stack.push(entry);
  document.body.append(shell);
  return entry;
}

function popEntry(entry) {
  const i = _stack.indexOf(entry);
  if (i < 0) return;
  _stack.splice(i, 1);
  entry.shell.remove();
  if (_stack.length) _stack[_stack.length - 1].shell.inert = false;
  else {
    _held.forEach(c => { c.inert = false; });
    _held = [];
    document.removeEventListener('keydown', onKey, true);
    const back = (entry.prev && entry.prev.isConnected !== false ? entry.prev : null) || (document.querySelector ? document.querySelector('.gal-entry') : null);
    try { if (back && back.focus) back.focus({ preventScroll: true }); } catch { /* none */ }
  }
  dropObservers(entry.shell);
  if (entry.onClose) { try { entry.onClose(); } catch { /* nothing to release */ } }
}

function closeAll() {
  while (_stack.length) popEntry(_stack[_stack.length - 1]);
}

function openGrid() {
  closeAll();
  const entry = overlay('Gallery');
  const card = el('div', 'gal-card');
  const head = el('div', 'gal-head');
  head.append(el('b', '', 'Gallery'));
  const x = el('button', 'gal-close', 'Close');
  x.type = 'button';
  x.addEventListener('click', () => popEntry(entry));
  head.append(x);
  const body = el('div', 'gal-body');
  card.append(head, body);
  entry.shell.append(card);
  entry.shell.addEventListener('click', e => { if (e.target === entry.shell) popEntry(entry); });
  const draw = () => {
    dropObservers(body);
    body.replaceChildren();
    if (!_list.length) { body.append(el('p', 'gal-empty', _state === 'failed' || _stopped ? 'Not available right now.' : _state !== 'ready' ? 'Loading...' : 'Finish a card to earn your first picture.')); return; }
    const plain = professional();
    const grid = el('div', plain ? 'gal-list' : 'gal-grid');
    for (const p of _list) {
      const cell = el('button', plain ? 'gal-row' : 'gal-cell');
      cell.type = 'button';
      cell.dataset.state = p.state;
      if (!plain) { const img = el('img'); img.alt = ''; img.decoding = 'async'; cell.append(img); lazyImage(img, p.id); }
      const cap = el('span', 'gal-cap');
      cap.append(el('b', '', (p.state === 'starred' ? '★ ' : '') + (p.subject || 'Picture')), el('small', '', dateWords(p.created)));
      cell.append(cap);
      cell.addEventListener('click', () => openPicture(p.id));
      grid.append(cell);
    }
    body.append(grid);
  };
  entry.refresh = draw;
  draw();
  loadGallery(false);
  try { x.focus({ preventScroll: true }); } catch { /* none */ }
}

function openPicture(id) {
  if (!_list.some(q => q.id === id)) return;
  let url = '';
  let closed = false;
  let busy = false;
  let shown = false;
  let gone = false;
  let before = '';
  const entry = overlay('Picture', () => { closed = true; if (url) { try { URL.revokeObjectURL(url); } catch { /* gone */ } url = ''; } });
  const card = el('div', 'gal-card gal-view');
  const x = el('button', 'gal-close', 'Close');
  x.type = 'button';
  x.addEventListener('click', () => popEntry(entry));
  const frame = el('div', 'gal-frame');
  const img = el('img', 'gal-full');
  frame.append(img);
  const title = el('b', 'gal-title', '');
  const when = el('small', 'gal-when', '');
  const status = el('p', 'gal-status', 'Loading...');
  const row = el('div', 'gal-actions');
  const why = el('div', 'gal-why');
  why.hidden = true;
  const input = el('input', 'gal-input');
  input.type = 'text';
  input.maxLength = REASON_MAX;
  input.placeholder = 'Why? (optional, one line)';
  const send = el('button', 'gal-btn x', 'Send X');
  send.type = 'button';
  why.append(input, send);
  card.append(x, frame, title, when, status, row, why);
  entry.shell.append(card);
  entry.shell.addEventListener('click', e => { if (e.target === entry.shell) popEntry(entry); });

  img.addEventListener('error', () => { shown = false; status.textContent = 'This picture cannot be shown.'; row.replaceChildren(); why.hidden = true; });
  const current = () => _list.find(q => q.id === id) || null;
  const paint = () => {
    const p = current();
    if (!p) {
      if (!gone) before = status.textContent;
      gone = true;
      status.textContent = 'This picture is no longer in the gallery.';
      row.replaceChildren();
      why.hidden = true;
      return false;
    }
    if (gone) { gone = false; status.textContent = shown ? '' : before; }
    if (!actionsFor(p.state).includes('reject')) why.hidden = true;
    img.alt = p.subject || 'Picture';
    title.textContent = (p.state === 'starred' ? '★ ' : '') + (p.subject || 'Picture');
    when.textContent = dateWords(p.created);
    row.replaceChildren();
    if (!shown && status.textContent !== 'Loading...') return true;
    for (const a of actionsFor(p.state)) {
      const b = el('button', 'gal-btn' + (a === 'star' ? ' star' : a === 'reject' ? ' x' : ''), { star: 'Star', unstar: 'Unstar', reject: 'X' }[a]);
      b.type = 'button';
      b.disabled = !shown;
      if (a === 'reject') b.setAttribute('aria-label', 'Reject this picture and remove it from the gallery');
      b.addEventListener('click', () => { if (a === 'reject') { why.hidden = false; input.focus(); } else choose(a); });
      row.append(b);
    }
    return true;
  };
  entry.refresh = paint;

  const choose = async (choice, reason) => {
    const p = current();
    if (busy || !p || !shown) return;
    const body = galleryChoiceBody(p.state, choice, reason);
    if (!body) return;
    busy = true;
    const ep = _epoch;
    const res = await call('/' + encodeURIComponent(id) + '/choice', body);
    busy = false;
    if (ep !== _epoch) return;
    if (res.ok) {
      _list = afterChoice(_list, id, choice);
      _gen++;
      _loadedAt = 0;
      if (!closed) popEntry(entry);
      paintEntries();
      loadGallery(true);
      return;
    }
    const act = failureAction(res.status);
    if (act === 'stop') { _stopped = true; if (!closed) { _o.say('The sign-in has expired. Sign in again.'); closeAll(); } }
    else if (act === 'later') { if (!closed) status.textContent = 'Not saved. Try again.'; }
    else { if (!closed) status.textContent = 'That changed on the server. The list is refreshed.'; _gen++; loadGallery(true); }
  };
  send.addEventListener('click', () => choose('reject', input.value));
  paint();
  try { x.focus({ preventScroll: true }); } catch { /* none */ }

  (async () => {
    const r = await call('/' + encodeURIComponent(id) + '/picture');
    if (closed) return;
    let ok = false;
    if (r.ok) {
      try {
        const blob = await r.res.blob();
        if (!closed && blob && typeof blob.type === 'string' && blob.type.startsWith('image/')) { url = URL.createObjectURL(blob); img.src = url; status.textContent = ''; ok = true; }
        else if (!closed) status.textContent = 'This picture cannot be shown.';
      } catch { if (!closed) status.textContent = 'This picture cannot be shown.'; }
    } else status.textContent = r.status === 404 ? 'This picture is no longer available.' : 'Not available right now.';
    if (closed) return;
    shown = ok;
    if (ok) paint(); else row.replaceChildren();
  })();
}
