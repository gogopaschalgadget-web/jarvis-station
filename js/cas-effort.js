// Card size and XP: how much of Chris's own effort a card takes. The server stores `effort` and `effort_reason` per card; the numbers below are the agreed table.
export const EFFORT = {
  xs: { label: 'XS', xp: 20 },
  s: { label: 'S', xp: 40 },
  m: { label: 'M', xp: 60 },
  l: { label: 'L', xp: 100 },
  xl: { label: 'XL', xp: 160 },
};
export const REASON_MAX = 140;

const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

/** A card's size read from a feed item: { size, label, xp, reason } or null when the size is missing or not one of the five. The reason is one plain line, cut at 140 characters. */
export function normalizeEffort(item) {
  if (!item || typeof item !== 'object') return null;
  const size = typeof item.effort === 'string' ? item.effort.trim().toLowerCase() : '';
  if (!own(EFFORT, size)) return null;
  const line = typeof item.effort_reason === 'string' ? item.effort_reason.replace(/\s+/g, ' ').trim() : '';
  const reason = line.length > REASON_MAX ? line.slice(0, REASON_MAX - 1).trimEnd() + '…' : line;
  return { size, label: EFFORT[size].label, xp: EFFORT[size].xp, reason };
}

export const effortTag = e => (e ? `${e.label} · ${e.xp} XP` : '');

/** What a finished card paid, from a done-log row: the size and the whole number the server says was awarded, or ''. */
export function earnedTag(row) {
  const e = normalizeEffort(row);
  const n = row && Number.isInteger(row.xp_earned) && row.xp_earned >= 0 && row.xp_earned <= 1000 ? row.xp_earned : null;
  if (n == null) return '';
  return e ? `${e.label} · ${n} XP earned` : `${n} XP earned`;
}
