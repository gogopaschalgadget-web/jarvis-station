export const OUTCOMES = ['missions', 'left', 'answered'];
export const WAIT_SECONDS = 180;
const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const secs = v => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);

/** The server's `stuck_meta` {card id: {at, outcome, note, updated_at}}, checked; unknown outcomes read as none. */
export function normalizeStuckMeta(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  Object.keys(raw).slice(0, 200).forEach(id => {
    const m = raw[id];
    if (!m || typeof m !== 'object') return;
    out[id] = { at: secs(m.at), outcome: OUTCOMES.includes(m.outcome) ? m.outcome : null, note: text(m.note, 300), updatedAt: secs(m.updated_at) };
  });
  return out;
}

const clock = epoch => {
  const date = new Date(epoch * 1000);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

const HELD_MIN_MATCH = 20;

/** True when the box note already says the held line: the same text, or ending with it when it is long enough not to match by accident. */
export function heldRepeated(note, held) {
  const n = typeof note === 'string' ? note.trim() : '';
  const h = typeof held === 'string' ? held.trim() : '';
  return !!h && (n === h || (h.length >= HELD_MIN_MATCH && n.endsWith(h)));
}

/** The "What Cas did" box for a stuck card: the server's note, when Stuck was tapped and when the card's words last changed. Null unless the server reported an outcome with a note. */
export function noteBox(meta) {
  const m = meta && typeof meta === 'object' ? meta : null;
  if (!m || !OUTCOMES.includes(m.outcome) || !m.note) return null;
  return { label: 'What Cas did', note: m.note, tapped: m.at ? clock(m.at) : '', changed: m.updatedAt ? clock(m.updatedAt) : '' };
}

/**
 * What the stuck line says, from the server's report only.
 * `working` is true only while Cas may still be answering; `line` never promises a time.
 */
export function stuckStatus(meta, now, hasKids) {
  const m = meta && typeof meta === 'object' ? meta : null;
  if (!m) return { kind: hasKids ? 'missions' : 'waiting', working: !hasKids, line: hasKids ? '' : 'Cas has been asked. Nothing has come back yet.' };
  if (m.outcome === 'left') {
    return { kind: 'left', box: noteBox(m), working: false, line: m.note || 'Cas answered, but nothing passed the checks, so there are no repair missions.', next: 'Your question also went to the orchestrator. Unstuck puts the card back to normal.' };
  }
  if (m.outcome === 'answered') {
    const updated = m.updatedAt && (!m.at || m.updatedAt >= m.at) ? clock(m.updatedAt) : '';
    const when = updated ? 'Card text updated ' + updated + (m.at ? ' after you asked.' : '.') : 'Cas answered.';
    return { kind: 'answered', box: noteBox(m), working: false, line: when, next: m.note || '' };
  }
  if (m.outcome === 'missions' || hasKids) return { kind: 'missions', box: noteBox(m), working: false, line: '' };
  if (m.updatedAt && m.at && m.updatedAt >= m.at && clock(m.updatedAt)) return { kind: 'answered', working: false, line: 'Card text updated ' + clock(m.updatedAt) + ' after you asked.', next: '' };
  if (m.at && now != null && now - m.at >= WAIT_SECONDS) {
    return { kind: 'timeout', working: false, line: 'Cas has not answered yet.', next: 'Your question also went to the orchestrator.' };
  }
  return { kind: 'waiting', working: true, line: 'Cas has been asked. Nothing has come back yet.' };
}

export const SLIDE_CONFIRM = 0.9;

/** How far a drag has gone, from 0 to 1: a bad number or a zero travel is 0. */
export function slideFraction(dx, travel) {
  if (!finite(dx) || !finite(travel) || travel <= 0) return 0;
  return Math.max(0, Math.min(1, dx / travel));
}

export const slideDone = fraction => finite(fraction) && fraction >= SLIDE_CONFIRM;

const SIZES = ['small', 'medium', 'large'];

/** The server's `repair_xp` {mission id: {size, xp, earned}}, checked: a known size and whole numbers, else the row is dropped. */
export function normalizeRepairXp(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  Object.keys(raw).slice(0, 200).forEach(id => {
    const r = raw[id];
    if (!r || typeof r !== 'object' || !SIZES.includes(r.size) || !Number.isInteger(r.xp) || r.xp < 0 || r.xp > 1000) return;
    out[id] = { size: r.size, xp: r.xp, earned: Number.isInteger(r.earned) && r.earned >= 0 && r.earned <= 1000 ? r.earned : null };
  });
  return out;
}

/** The small line on a repair mission: its size and what it is worth, then what it paid once done. */
export function repairChip(info) {
  if (!info || !SIZES.includes(info.size)) return '';
  const size = info.size[0].toUpperCase() + info.size.slice(1);
  return info.earned == null ? `${size}, ${info.xp} XP` : `${size}, ${info.earned} XP earned`;
}

export const UNSTUCK_NOTE = 'Unstuck takes the card off Stuck. Cas stops working on it.';
export const SEND_NOTE = 'Send to Cas adds your words on top of what Cas already has.';

const finite = v => typeof v === 'number' && Number.isFinite(v);

/** The server's clock moved on by the time since the read; null unless `now` is a real number (a string must never be added to). */
export function clockNow(data, loadedAt, nowMs) {
  const n = data && data.now;
  return finite(n) && finite(loadedAt) && finite(nowMs) ? n + (nowMs - loadedAt) / 1000 : null;
}

/** Seconds since the feed was uploaded, or null when either time is not a real number. */
export function ageSeconds(data, loadedAt, nowMs) {
  const now = clockNow(data, loadedAt, nowMs);
  const up = data && data.uploaded;
  return now == null || !finite(up) ? null : now - up;
}

/** The held line from the server: text only, at most 300 characters, else nothing. */
export function heldLine(entry) {
  return entry && typeof entry === 'object' && typeof entry.line === 'string' ? entry.line.trim().slice(0, 300) : '';
}
