export const CHOICES = ['star', 'keep', 'reject', 'unstar'];
export const REASON_MAX = 200;
export const MAX_WAITING = 5;
const STATUSES = ['waiting', 'ready', 'gone'];
const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** The answer to a reveal request: waiting, ready with a picture id, or gone. Null for anything else. */
export function normalizeReveal(raw) {
  if (!raw || typeof raw !== 'object' || !STATUSES.includes(raw.status)) return null;
  const pictureId = raw.picture_id == null ? '' : String(raw.picture_id);
  if (raw.status === 'ready' && !isSafeId(pictureId)) return null;
  return { requestId: text(String(raw.request_id == null ? '' : raw.request_id), 80), status: raw.status, pictureId };
}

/** The picture list: only well-formed rows; `isNew` marks a picture Chris has not answered yet. */
export function normalizePictures(raw) {
  const list = raw && Array.isArray(raw.pictures) ? raw.pictures : [];
  const pictures = list.filter(p => p && typeof p === 'object' && isSafeId(String(p.id == null ? '' : p.id))).map(p => ({
    id: text(String(p.id), 80), state: text(p.state, 20), rarity: text(p.rarity, 20), kind: text(p.kind, 20), source: text(p.source, 10), subject: text(p.subject, 40), cardId: text(p.card_id, 80),
  }));
  const waiting = raw && Number.isFinite(raw.waiting) && raw.waiting >= 0 ? Math.min(raw.waiting, MAX_WAITING) : 0;
  return { pictures, waiting };
}

/** A picture revealed but not yet answered: the server calls it "shown". */
export const isNew = p => p.state === 'shown';

/** The body of a choice: a known choice, and a trimmed reason only for a reject. Null when the choice is unknown. */
export function choiceBody(choice, reason) {
  if (!CHOICES.includes(choice)) return null;
  const body = { choice };
  const why = text(reason, REASON_MAX);
  if (choice === 'reject' && why) body.reason = why;
  return body;
}

/** What Chris is told after a choice, from the server's replacement word only. */
export function replacementLine(raw) {
  const r = raw && typeof raw === 'object' ? raw.replacement : '';
  if (r === 'queued') return 'A replacement is on its way.';
  if (r === 'no_more_retries') return 'Taste updated, no more retries.';
  return '';
}

/** Card ids still waiting for their picture: unique, at most five, newest kept. */
export function addWaiting(list, cardId) {
  const id = text(cardId, 80);
  const base = (Array.isArray(list) ? list : []).filter(x => typeof x === 'string' && x !== id);
  if (id) base.push(id);
  return base.slice(-MAX_WAITING);
}

export const dropWaiting = (list, cardId) => (Array.isArray(list) ? list : []).filter(x => x !== cardId);

/** Rarity words for the reveal, only for rarities the server names. */
export function rarityLabel(r) {
  return { common: 'Common', uncommon: 'Uncommon', rare: 'Rare', legendary: 'Legendary' }[r] || '';
}

/** An id the Station will put in a request path: short, plain characters only (no slashes, no "..", no spaces). */
export function isSafeId(v) {
  return typeof v === 'string' && /^[A-Za-z0-9_.:-]{1,80}$/.test(v) && !v.includes('..');
}

export const UNDO_WINDOW_MS = 9000;

/** What to do after a failed request: stop (the sign-in is gone), try again later (offline, busy, server trouble) or drop it. */
export function failureAction(status) {
  if (status === 401 || status === 403) return 'stop';
  if (status === 0 || status === 429 || status >= 500) return 'later';
  return 'drop';
}

/** Cards whose picture is asked for after the Undo window: added with a due time, cancelled by Undo. */
export function addScheduled(list, id, due) {
  const base = (Array.isArray(list) ? list : []).filter(s => s && s.id !== id);
  if (isSafeId(id) && Number.isFinite(due)) base.push({ id, due });
  return base.slice(-20);
}
export const cancelScheduled = (list, id) => (Array.isArray(list) ? list : []).filter(s => s && s.id !== id);
export function dueScheduled(list, now) {
  const all = Array.isArray(list) ? list : [];
  return { due: all.filter(s => s.due <= now).map(s => s.id), rest: all.filter(s => s.due > now) };
}

/** Choices that could not be saved yet: kept (newest ten), one per picture. */
export function addPending(list, entry) {
  const base = (Array.isArray(list) ? list : []).filter(p => p && p.id !== entry.id);
  return [...base, entry].slice(-10);
}

/** A progress bar animates only when its number changed since it was last drawn. */
export const barAnimates = (prev, next) => prev !== next;
