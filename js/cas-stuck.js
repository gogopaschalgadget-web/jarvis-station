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

const clock = epoch => new Date(epoch * 1000).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/**
 * What the stuck line says, from the server's report only.
 * `working` is true only while Cas may still be answering; `line` never promises a time.
 */
export function stuckStatus(meta, now, hasKids) {
  const m = meta && typeof meta === 'object' ? meta : null;
  if (!m) return { kind: hasKids ? 'missions' : 'waiting', working: !hasKids, line: hasKids ? '' : 'Cas has been asked. Nothing has come back yet.' };
  if (m.outcome === 'left') {
    return { kind: 'left', working: false, line: m.note || 'Cas answered, but nothing passed the checks, so there are no repair missions.', next: 'Your question also went to the orchestrator. Unstuck puts the card back to normal.' };
  }
  if (m.outcome === 'answered') {
    const when = m.updatedAt && (!m.at || m.updatedAt >= m.at) ? 'Card text updated ' + clock(m.updatedAt) + (m.at ? ' after you asked.' : '.') : 'Cas answered.';
    return { kind: 'answered', working: false, line: when, next: m.note || '' };
  }
  if (m.outcome === 'missions' || hasKids) return { kind: 'missions', working: false, line: '' };
  if (m.updatedAt && m.at && m.updatedAt >= m.at) return { kind: 'answered', working: false, line: 'Card text updated ' + clock(m.updatedAt) + ' after you asked.', next: '' };
  if (m.at && now != null && now - m.at >= WAIT_SECONDS) {
    return { kind: 'timeout', working: false, line: 'Cas has not answered yet.', next: 'Your question also went to the orchestrator.' };
  }
  return { kind: 'waiting', working: true, line: 'Cas has been asked. Nothing has come back yet.' };
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
