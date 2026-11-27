import {
  normalizeReveal, normalizePictures, isNew, choiceBody, replacementLine, addWaiting, dropWaiting, rarityLabel, REASON_MAX,
  isSafeId, failureAction, addScheduled, cancelScheduled, dueScheduled, addPending, UNDO_WINDOW_MS,
} from './cas-reveal-logic.js?v=cas93';

const STORE = 'reveal-waiting';
const SCHEDULE_STORE = 'reveal-scheduled';
const POLL_MS = 60000;
const TIMEOUT_MS = 15000;
const RETRY_MS = [10000, 30000, 90000];   // a choice that could not be saved is tried again three times, then left for the next poll
let _o = { apiBase: '', getToken: () => '', say: () => {}, fetch: (...a) => fetch(...a) };
let _waiting = [];
let _scheduled = [];
let _pending = [];
let _queue = [];
let _showing = false;
let _timer = null;
let _flushTimer = null;
let _stopped = false;
const _skip = new Set();

/** A timer that never keeps a test or a closing page waiting. */
function later(fn, ms) {
  const t = setTimeout(fn, ms);
  if (t && typeof t.unref === 'function') t.unref();
  return t;
}

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

function read(key) { try { const v = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } }
function write(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* no storage: kept in memory only */ } }
const save = () => write(STORE, _waiting);
const saveScheduled = () => write(SCHEDULE_STORE, _scheduled);

async function call(path, body) {
  const ctl = typeof AbortController === 'function' ? new AbortController() : null;
  let timer = 0;
  const late = new Promise(done => { timer = setTimeout(() => { if (ctl) { try { ctl.abort(); } catch { /* already over */ } } done({ ok: false, status: 0, res: null }); }, _o.timeoutMs || TIMEOUT_MS); });
  const go = (async () => {
    try {
      const res = await _o.fetch(`${_o.apiBase}/api/station/pictures${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { Authorization: 'Bearer ' + _o.getToken(), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        body: body === undefined ? undefined : JSON.stringify(body),
        ...(ctl ? { signal: ctl.signal } : {}),
      });
      return { ok: res.ok, status: res.status, res };
    } catch { return { ok: false, status: 0, res: null }; }
  })();
  try { return await Promise.race([go, late]); } finally { clearTimeout(timer); }
}

async function json(r) { try { return await r.res.json(); } catch { return null; } }

export function initReveal(options) {
  _o = { ..._o, ...options };
  _waiting = read(STORE).filter(isSafeId);
  _scheduled = read(SCHEDULE_STORE).filter(s => s && isSafeId(s.id) && Number.isFinite(s.due));
  armFlush();
}

export const revealWaiting = () => _waiting.length;

/** Stops every timer and forgets what is waiting or scheduled (tests, and a sign-out). */
export function stopReveal() {
  clearTimeout(_timer);
  clearTimeout(_flushTimer);
  _waiting = []; _scheduled = []; _pending = []; _queue = [];
  _stopped = true;
}

function schedulePoll() {
  clearTimeout(_timer);
  if (_waiting.length && !_stopped) _timer = later(pollReveals, POLL_MS);
}

/**
 * A finished card is remembered, and its picture asked for only after the Undo window, so an undone Done earns nothing.
 * Undo cancels it.
 */
export function scheduleReveal(cardId, now = Date.now()) {
  if (!isSafeId(cardId)) return;
  _scheduled = addScheduled(_scheduled, cardId, now + UNDO_WINDOW_MS);
  saveScheduled();
  armFlush();
}

export function cancelReveal(cardId) {
  _scheduled = cancelScheduled(_scheduled, cardId);
  saveScheduled();
}

function armFlush() {
  clearTimeout(_flushTimer);
  if (!_scheduled.length) return;
  const wait = Math.max(500, Math.min(..._scheduled.map(s => s.due)) - Date.now() + 100);
  _flushTimer = later(() => runScheduled(), wait);
}

/** Asks for the picture of every finished card whose Undo window has passed; each card is asked once. */
export async function runScheduled(now = Date.now()) {
  const { due, rest } = dueScheduled(_scheduled, now);
  _scheduled = rest;
  saveScheduled();
  for (const id of due) await requestReveal(id);
  armFlush();
}

/** One finished card asks for its picture; the answer is shown now, later, or dropped. */
export async function requestReveal(cardId) {
  if (!isSafeId(cardId) || _stopped) return;
  const r = await call('/reveal', { card_id: cardId });
  if (!r.ok) {
    const act = failureAction(r.status);
    if (act === 'stop') _stopped = true;
    else if (act === 'later') { _waiting = addWaiting(_waiting, cardId); save(); schedulePoll(); }
    return;
  }
  settle(cardId, normalizeReveal(await json(r)));
}

function settle(cardId, rv) {
  if (!rv) return;
  if (rv.status === 'waiting') { _waiting = addWaiting(_waiting, cardId); save(); schedulePoll(); return; }
  _waiting = dropWaiting(_waiting, cardId); save();
  if (rv.status === 'ready') enqueue(rv.pictureId);
}

async function flushPending() {
  for (const p of [..._pending]) {
    if (p.sending) continue;
    const r = await call('/' + encodeURIComponent(p.id) + '/choice', p.body);
    const act = r.ok ? 'drop' : failureAction(r.status);
    if (act === 'stop') { _stopped = true; return; }
    if (act !== 'later') _pending = _pending.filter(x => x !== p);
    if (act === 'drop') _skip.add(p.id);
    if (r.ok && _o.onChoice) { try { _o.onChoice(); } catch { /* the gallery list refreshes by itself */ } }
  }
}

/** A choice that could not be saved is tried again after 10 s, 30 s and 90 s (never more); after that it waits for the next poll, and the picture shows again if it was never saved. */
function retrySoon(attempt = 0) {
  const waits = _o.retryMs || RETRY_MS;
  if (_stopped || !_pending.length || attempt >= waits.length) return;
  later(async () => {
    if (_stopped || !_pending.length) return;
    await flushPending();
    if (_pending.length) retrySoon(attempt + 1);
  }, waits[attempt]);
}

/** Sends a choice after the card has closed. The answer never holds the screen: a failure says so plainly and the choice is kept and retried. */
async function sendChoice(entry) {
  const { id, body } = entry;
  const r = await call('/' + encodeURIComponent(id) + '/choice', body);
  entry.sending = false;
  if (r.ok) {
    _pending = _pending.filter(p => p !== entry);
    const line = replacementLine(await json(r));
    if (line) _o.say(line);
    if (_o.onChoice) { try { _o.onChoice(); } catch { /* the gallery list refreshes by itself */ } }
    return;
  }
  const act = failureAction(r.status);
  if (act === 'stop') { _stopped = true; _o.say('The sign-in has expired. Sign in again.'); }
  else if (act === 'later') {
    _o.say('Your choice is not saved yet. It will try again.');
    retrySoon();
  } else { _pending = _pending.filter(p => p !== entry); _skip.add(id); }
}

/** Ask again for every waiting card (the answer is repeatable), send choices that could not be saved, and pick up any picture not yet answered, also after the app was reopened. */
export async function pollReveals() {
  if (_stopped) return;
  await flushPending();
  for (const id of [..._waiting]) {
    if (_stopped) return;
    const r = await call('/reveal', { card_id: id });
    if (r.ok) settle(id, normalizeReveal(await json(r)));
    else {
      const act = failureAction(r.status);
      if (act === 'stop') { _stopped = true; return; }
      if (act === 'drop') { _waiting = dropWaiting(_waiting, id); save(); }
    }
  }
  const list = await call('');
  if (list.ok) {
    const data = normalizePictures(await json(list));
    data.pictures.filter(isNew).forEach(p => enqueue(p.id, p));
  } else if (failureAction(list.status) === 'stop') _stopped = true;
  schedulePoll();
}

function enqueue(pictureId, meta) {
  if (!isSafeId(pictureId) || _skip.has(pictureId) || _pending.some(p => p.id === pictureId) || _queue.some(q => q.id === pictureId)) return;
  _queue.push({ id: pictureId, meta: meta || null });
  next();
}

async function next() {
  if (_showing || !_queue.length) return;
  _showing = true;
  try {
    const item = _queue.shift();
    await show(item);
  } catch { /* a broken reveal never stalls the next one */ } finally {
    _showing = false;
  }
  next();
}

async function pictureUrl(id) {
  const r = await call('/' + encodeURIComponent(id) + '/picture');
  if (!r.ok) return null;
  try { return URL.createObjectURL(await r.res.blob()); } catch { return null; }
}

function reduced() { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } }

/** The reveal sheet. It closes at once on Close, Keep, Star, X, Escape or a tap on the dark area; the choice is saved afterwards, and a failed save is kept, retried and said plainly, so it never traps the screen and is never silently lost. */
function show(item) {
  return new Promise(async done => {
    let url = null;
    let overlay = null;
    let onKey = null;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      if (onKey) document.removeEventListener('keydown', onKey);
      if (overlay) overlay.remove();
      if (url) URL.revokeObjectURL(url);
      done();
    };
    try {
      url = await pictureUrl(item.id);
      if (!url) { _skip.add(item.id); finish(); return; }
      overlay = el('div', 'rv-overlay');
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
      const choose = (choice, reason) => {
        if (busy || finished) return;
        const body = choiceBody(choice, reason);
        if (!body) return;
        busy = true;
        const entry = { id: item.id, body, sending: true };
        _pending = addPending(_pending, entry);   // kept while it is sent, so the same picture is not shown again meanwhile
        finish();   // the card closes at once, whatever the connection does
        sendChoice(entry);
      };
      const closeBtn = el('button', 'rv-close', '✕');
      closeBtn.type = 'button';
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
      onKey = e => { if (e.key === 'Escape') { e.preventDefault(); choose('keep'); } };
      overlay.addEventListener('click', e => { if (e.target === overlay) choose('keep'); });
      document.addEventListener('keydown', onKey);
      document.body.append(overlay);
    } catch {
      finish();
    }
  });
}
