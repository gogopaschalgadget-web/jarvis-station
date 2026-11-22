import { failureAction, REASON_MAX } from './cas-reveal-logic.js?v=cas93';
import { normalizeGallery, galleryEntry, countWords, dateWords, actionsFor, afterChoice, galleryChoiceBody, THUMB_PARALLEL, THUMB_WIDTH } from './cas-gallery-logic.js?v=cas100';

const TTL_MS = 30000;
let _o = { apiBase: '', getToken: () => '', say: () => {}, fetch: (...a) => fetch(...a) };
let _list = [];
let _state = 'idle';
let _loadedAt = 0;
let _inflight = null;
let _stopped = false;
const _entries = new Set();
const _thumbs = new Map();
const _thumbWait = [];
let _thumbBusy = 0;
let _top = null;

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

export function initGallery(options) {
  _o = { ..._o, ...options };
  _stopped = false;
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

/** The pictures Chris kept, from the server; the list is asked for again after 30 seconds or after a choice, never kept beyond the page. */
export function loadGallery(force = false) {
  if (_stopped) return Promise.resolve(_list);
  if (_inflight) return _inflight;
  if (!force && _state === 'ready' && Date.now() - _loadedAt < TTL_MS) return Promise.resolve(_list);
  _inflight = (async () => {
    try {
      const r = await call('');
      if (r.ok) {
        try { _list = normalizeGallery(await r.res.json()); _state = 'ready'; _loadedAt = Date.now(); } catch { if (_state !== 'ready') _state = 'failed'; }
      } else {
        if (failureAction(r.status) === 'stop') _stopped = true;
        if (_state !== 'ready') _state = 'failed';
      }
    } catch (e) {
      if (_state !== 'ready') _state = 'failed';
      if (typeof console !== 'undefined') console.warn('[gallery]', e && e.message);
    } finally {
      _inflight = null;
    }
    paintEntries();
    return _list;
  })();
  return _inflight;
}

export function invalidateGallery() { _loadedAt = 0; }

/** Forget everything (sign-out): the list and every thumbnail. */
export function stopGallery() {
  _list = []; _state = 'idle'; _loadedAt = 0; _stopped = false; _inflight = null;
  for (const u of _thumbs.values()) { try { URL.revokeObjectURL(u); } catch { /* gone */ } }
  _thumbs.clear(); _thumbWait.length = 0;
  closeTop();
}

// ---- thumbnails: fetched when they come near the screen, scaled in the browser, kept in memory only

async function makeThumb(id) {
  const r = await call('/' + encodeURIComponent(id) + '/picture');
  if (!r.ok) return '';
  const blob = await r.res.blob();
  if (!blob || typeof blob.type !== 'string' || !blob.type.startsWith('image/')) return '';
  try {
    const bmp = await createImageBitmap(blob);
    const w = Math.min(THUMB_WIDTH, bmp.width);
    const h = Math.max(1, Math.round(bmp.height * (w / bmp.width)));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(bmp, 0, 0, w, h);
    if (bmp.close) bmp.close();
    const small = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.8));
    return URL.createObjectURL(small || blob);
  } catch { return URL.createObjectURL(blob); }
}

function pump() {
  while (_thumbBusy < THUMB_PARALLEL && _thumbWait.length) {
    const job = _thumbWait.shift();
    if (_thumbs.has(job.id)) { job.done(_thumbs.get(job.id)); continue; }
    _thumbBusy++;
    makeThumb(job.id).then(u => { if (u) _thumbs.set(job.id, u); job.done(u); }).catch(() => job.done('')).finally(() => { _thumbBusy--; pump(); });
  }
}

function thumbFor(id) {
  if (_thumbs.has(id)) return Promise.resolve(_thumbs.get(id));
  return new Promise(done => { _thumbWait.push({ id, done }); pump(); });
}

function lazyImage(img, id) {
  const go = () => thumbFor(id).then(u => { if (u && img.isConnected !== false) img.src = u; });
  if (typeof IntersectionObserver === 'function') {
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { io.disconnect(); go(); } }, { rootMargin: '120px' });
    io.observe(img);
  } else go();
}

// ---- the entry on the Bulletin Board

function fillEntry(box) {
  box.replaceChildren();
  const info = galleryEntry(_list);
  const btn = el('button', 'gal-entry');
  btn.type = 'button';
  const pic = el('div', 'gal-entry-pic');
  if (info.newest && !professional()) { const img = el('img'); img.alt = ''; img.decoding = 'async'; pic.append(img); lazyImage(img, info.newest.id); }
  const body = el('div', 'gal-entry-body');
  body.append(el('b', '', 'Gallery'));
  if (_state === 'failed' && !info.count) body.append(el('span', '', 'Not available right now.'));
  else if (_state !== 'ready' && !info.count) body.append(el('span', '', 'Loading...'));
  else if (!info.count) body.append(el('span', '', 'Finish a card to earn your first picture.'));
  else body.append(el('span', '', countWords(info.count) + ' kept'), el('small', '', 'Newest ' + dateWords(info.newest.created)));
  btn.append(pic, body);
  btn.addEventListener('click', () => openGrid());
  box.append(btn);
}

function paintEntries() {
  for (const box of [..._entries]) { if (box.isConnected === false) _entries.delete(box); else fillEntry(box); }
  if (_top && _top.refresh) _top.refresh();
}

/** The Gallery entry for the Bulletin Board: a count and the newest thumbnail; it fills itself in when the list arrives. */
export function galleryEntryNode() {
  const box = el('div', 'gal-wrap');
  _entries.add(box);
  fillEntry(box);
  loadGallery(false);
  return box;
}

// ---- overlays: the grid, then one picture

function closeTop() {
  if (_top) { const t = _top; _top = null; t.close(); }
}

function overlay(label, onClose) {
  const prev = document.activeElement;
  const shell = el('div', 'gal-overlay');
  shell.setAttribute('role', 'dialog');
  shell.setAttribute('aria-modal', 'true');
  shell.setAttribute('aria-label', label);
  const held = [...(document.body ? document.body.children : [])].filter(c => c !== shell && !c.inert);
  const close = () => {
    document.removeEventListener('keydown', onKey, true);
    held.forEach(c => { c.inert = false; });
    shell.remove();
    try { if (prev && prev.focus) prev.focus({ preventScroll: true }); } catch { /* none */ }
    if (onClose) onClose();
  };
  const onKey = e => { if (e.key === 'Escape') { if (e.stopImmediatePropagation) e.stopImmediatePropagation(); close(); } };
  document.addEventListener('keydown', onKey, true);
  held.forEach(c => { c.inert = true; });
  document.body.append(shell);
  return { shell, close };
}

function openGrid() {
  closeTop();
  const { shell, close } = overlay('Gallery', () => { if (_top && _top.shell === shell) _top = null; });
  const card = el('div', 'gal-card');
  const head = el('div', 'gal-head');
  head.append(el('b', '', 'Gallery'));
  const x = el('button', 'gal-close', 'Close');
  x.type = 'button';
  x.addEventListener('click', close);
  head.append(x);
  const body = el('div', 'gal-body');
  card.append(head, body);
  shell.append(card);
  shell.addEventListener('click', e => { if (e.target === shell) close(); });
  const draw = () => {
    body.replaceChildren();
    if (!_list.length) { body.append(el('p', 'gal-empty', _state === 'failed' ? 'Not available right now.' : _state !== 'ready' ? 'Loading...' : 'Finish a card to earn your first picture.')); return; }
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
  draw();
  _top = { shell, close, refresh: draw };
  loadGallery(false);
  try { x.focus({ preventScroll: true }); } catch { /* none */ }
}

async function openPicture(id) {
  const p = _list.find(q => q.id === id);
  if (!p) return;
  const grid = _top;
  const { shell, close } = overlay('Picture', () => { _top = grid; });
  _top = { shell, close, refresh: null };
  const card = el('div', 'gal-card gal-view');
  const x = el('button', 'gal-close', 'Close');
  x.type = 'button';
  x.addEventListener('click', close);
  const frame = el('div', 'gal-frame');
  const img = el('img', 'gal-full');
  img.alt = p.subject || 'Picture';
  frame.append(img);
  const title = el('b', 'gal-title', (p.state === 'starred' ? '★ ' : '') + (p.subject || 'Picture'));
  const when = el('small', 'gal-when', dateWords(p.created));
  const status = el('p', 'gal-status', 'Loading...');
  const row = el('div', 'gal-actions');
  card.append(x, frame, title, when, status, row);
  shell.append(card);
  let url = '';
  let busy = false;
  const revoke = () => { if (url) { try { URL.revokeObjectURL(url); } catch { /* gone */ } url = ''; } };
  const closeAll = () => { revoke(); close(); };
  x.addEventListener('click', revoke);
  shell.addEventListener('click', e => { if (e.target === shell) closeAll(); });
  const r = await call('/' + encodeURIComponent(id) + '/picture');
  if (r.ok) {
    try { const blob = await r.res.blob(); if (blob.type.startsWith('image/')) { url = URL.createObjectURL(blob); img.src = url; status.textContent = ''; } else status.textContent = 'This picture cannot be shown.'; } catch { status.textContent = 'This picture cannot be shown.'; }
  } else status.textContent = r.status === 404 ? 'This picture is no longer available.' : 'Not available right now.';

  const choose = async (choice, reason) => {
    if (busy) return;
    const body = galleryChoiceBody(p.state, choice, reason);
    if (!body) return;
    busy = true;
    const res = await call('/' + encodeURIComponent(id) + '/choice', body);
    busy = false;
    if (res.ok) {
      _list = afterChoice(_list, id, choice);
      invalidateGallery();
      closeAll();
      paintEntries();
      loadGallery(true);
      return;
    }
    const act = failureAction(res.status);
    if (act === 'stop') { _stopped = true; _o.say('The sign-in has expired. Sign in again.'); closeAll(); }
    else if (act === 'later') status.textContent = 'Not saved. Try again.';
    else { status.textContent = 'That changed on the server. The list is refreshed.'; loadGallery(true); }
  };
  for (const a of actionsFor(p.state)) {
    const b = el('button', 'gal-btn' + (a === 'star' ? ' star' : a === 'reject' ? ' x' : ''), { star: 'Star', unstar: 'Unstar', reject: 'X' }[a]);
    b.type = 'button';
    if (a === 'reject') b.setAttribute('aria-label', 'Reject this picture and remove it from the gallery');
    b.addEventListener('click', () => { if (a === 'reject') { why.hidden = false; input.focus(); } else choose(a); });
    row.append(b);
  }
  const why = el('div', 'gal-why');
  why.hidden = true;
  const input = el('input', 'gal-input');
  input.type = 'text';
  input.maxLength = REASON_MAX;
  input.placeholder = 'Why? (optional, one line)';
  const send = el('button', 'gal-btn x', 'Send X');
  send.type = 'button';
  send.addEventListener('click', () => choose('reject', input.value));
  why.append(input, send);
  card.append(why);
  try { x.focus({ preventScroll: true }); } catch { /* none */ }
}
