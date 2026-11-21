import { normalizeReveal, normalizePictures, isNew, choiceBody, replacementLine, addWaiting, dropWaiting, rarityLabel, REASON_MAX } from './cas-reveal-logic.js?v=cas91';

const STORE = 'reveal-waiting';
const POLL_MS = 60000;
let _o = { apiBase: '', getToken: () => '', say: () => {}, fetch: (...a) => fetch(...a) };
let _waiting = [];
let _queue = [];
let _showing = false;
let _timer = null;
let _failed = false;

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

function load() { try { const v = JSON.parse(localStorage.getItem(STORE) || '[]'); return Array.isArray(v) ? v.filter(x => typeof x === 'string') : []; } catch { return []; } }
function save() { try { localStorage.setItem(STORE, JSON.stringify(_waiting)); } catch { /* no storage: waits in memory only */ } }

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

async function json(r) { try { return await r.res.json(); } catch { return null; } }

export function initReveal(options) {
  _o = { ..._o, ...options };
  _waiting = load();
}

export const revealWaiting = () => _waiting.length;

function schedule() {
  clearTimeout(_timer);
  if (_waiting.length) _timer = setTimeout(pollReveals, POLL_MS);
}

/** One finished card asks for its picture; the answer is shown now, later, or dropped. */
export async function requestReveal(cardId) {
  if (typeof cardId !== 'string' || !cardId) return;
  const r = await call('/reveal', { card_id: cardId });
  if (!r.ok) { if (r.status === 0 || r.status >= 500) { _waiting = addWaiting(_waiting, cardId); save(); schedule(); } return; }
  settle(cardId, normalizeReveal(await json(r)));
}

function settle(cardId, rv) {
  if (!rv) return;
  if (rv.status === 'waiting') { _waiting = addWaiting(_waiting, cardId); save(); schedule(); return; }
  _waiting = dropWaiting(_waiting, cardId); save();
  if (rv.status === 'ready') enqueue(rv.pictureId);
}

/** Ask again for every waiting card (the answer is repeatable) and pick up any picture not yet answered, also after the app was reopened. */
export async function pollReveals() {
  if (_failed) return;
  for (const id of [..._waiting]) {
    const r = await call('/reveal', { card_id: id });
    if (r.ok) settle(id, normalizeReveal(await json(r)));
  }
  const list = await call('');
  if (list.ok) {
    const data = normalizePictures(await json(list));
    data.pictures.filter(isNew).forEach(p => enqueue(p.id, p));
  }
  schedule();
}

function enqueue(pictureId, meta) {
  if (_queue.some(q => q.id === pictureId)) return;
  _queue.push({ id: pictureId, meta: meta || null });
  next();
}

async function next() {
  if (_showing || !_queue.length) return;
  _showing = true;
  const item = _queue.shift();
  await show(item);
  _showing = false;
  next();
}

async function pictureUrl(id) {
  const r = await call('/' + encodeURIComponent(id) + '/picture');
  if (!r.ok) return null;
  try { return URL.createObjectURL(await r.res.blob()); } catch { return null; }
}

function reduced() { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } }

function show(item) {
  return new Promise(async done => {
    const url = await pictureUrl(item.id);
    if (!url) { done(); return; }
    const overlay = el('div', 'rv-overlay');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-label', 'Artwork unlocked');
    const card = el('div', 'rv-card');
    const label = rarityLabel(item.meta && item.meta.rarity);
    const kindLabel = item.meta && item.meta.kind === 'replacement' ? 'Replacement' : '';
    card.append(el('p', 'rv-head', 'Artwork unlocked' + [label, kindLabel].filter(Boolean).map(x => ' · ' + x).join('')));
    const frame = el('div', 'rv-frame');
    const img = el('img', 'rv-img');
    img.alt = 'Unlocked artwork';
    img.src = url;
    frame.append(img);
    if (!reduced()) {
      const cover = el('div', 'rv-cover', 'ARTWORK UNLOCKED');
      cover.addEventListener('animationend', () => cover.remove());
      cover.addEventListener('click', () => cover.remove());
      frame.append(cover);
    }
    card.append(frame);
    const status = el('p', 'rv-status', '');
    let busy = false;
    const close = () => { overlay.remove(); URL.revokeObjectURL(url); done(); };
    const choose = async (choice, reason) => {
      if (busy) return;
      const body = choiceBody(choice, reason);
      if (!body) return;
      busy = true;
      const r = await call('/' + encodeURIComponent(item.id) + '/choice', body);
      if (!r.ok) { busy = false; status.textContent = 'Not saved. Try again.'; return; }
      const line = replacementLine(await json(r));
      if (line) _o.say(line);
      close();
    };
    const closeBtn = el('button', 'rv-close', '✕');
    closeBtn.setAttribute('aria-label', 'Close (keeps the picture)');
    closeBtn.addEventListener('click', () => choose('keep'));
    card.append(closeBtn);
    const row = el('div', 'rv-row');
    const star = el('button', 'rv-btn star', 'Star');
    star.addEventListener('click', () => choose('star'));
    const reject = el('button', 'rv-btn x', 'X');
    reject.setAttribute('aria-label', 'Reject this picture');
    const keep = el('button', 'rv-btn', 'Keep');
    keep.addEventListener('click', () => choose('keep'));
    row.append(star, keep, reject);
    const why = el('div', 'rv-why');
    why.hidden = true;
    const input = el('input', 'rv-input');
    input.type = 'text';
    input.maxLength = REASON_MAX;
    input.placeholder = 'Why? (optional, one line)';
    const send = el('button', 'rv-btn x', 'Send X');
    send.addEventListener('click', () => choose('reject', input.value));
    why.append(input, send);
    reject.addEventListener('click', () => { why.hidden = false; input.focus(); });
    card.append(row, why, status);
    overlay.append(card);
    document.body.append(overlay);
  });
}
