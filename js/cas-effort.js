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

/** The rule in force from the Desk read (`progress.xp_rule`): 'old', 'flat' or 'effort'; anything else is unknown. */
export const ruleOf = data => { const r = data && data.progress && data.progress.xp_rule; return r === 'old' || r === 'flat' || r === 'effort' ? r : null; };

/** The tag text. XP is promised only when the server says the rule is effort; otherwise (old, flat, unknown, missing) it is the plain size. */
export const effortTag = (e, rule) => (e ? (rule === 'effort' ? `${e.label} · ${e.xp} XP` : e.label) : '');

const RULES = ['old', 'flat', 'effort'];
const PICTURES = { common: 'Common', uncommon: 'Uncommon', rare: 'Rare', epic: 'Epic' };

/** What the server promises for one open card under the rule that is LIVE: { xp, upTo, rule, picture } from `xp_preview[id]`, or null when it sent nothing usable. */
export function previewOf(data, id) {
  const all = data && typeof data === 'object' && data.xp_preview && typeof data.xp_preview === 'object' ? data.xp_preview : null;
  const p = all && typeof id === 'string' && own(all, id) ? all[id] : null;
  if (!p || typeof p !== 'object') return null;
  if (!Number.isInteger(p.xp) || p.xp < 0 || p.xp > 1000 || typeof p.up_to !== 'boolean' || !RULES.includes(p.rule) || !own(PICTURES, p.picture)) return null;
  return { xp: p.xp, upTo: p.up_to, rule: p.rule, picture: p.picture };
}

/** The tag on an open card. With a server promise it is exactly that: "up to 175 XP" under the old rule (a card pays for its steps and bonuses), "60 XP" under flat,
 *  "L · 100 XP" under the effort rule (the size is what pays). Without one it is the plain size, as before. */
export function promiseTag(e, p, rule) {
  if (!p) return effortTag(e, rule);
  const xp = `${p.upTo ? 'up to ' : ''}${p.xp} XP`;
  return p.rule === 'effort' && e ? `${e.label} · ${xp}` : xp;
}

/** The one line that says what the card's reveal picture will be: "Picture: Uncommon", or '' with no promise. */
export const pictureLine = p => (p ? `Picture: ${PICTURES[p.picture]}` : '');

/** What the tap on the tag explains: the card's size reason when it has one, else how the live rule pays. */
export function whyLine(e, p) {
  if (e && e.reason && (!p || p.rule === 'effort')) return e.reason;
  if (!p) return e && e.reason ? e.reason : '';
  if (p.rule === 'old') return 'Today a card pays for its steps, plus extra for a decision, for finishing it and for a revenue card. Finishing every step pays the most.' + (e && e.reason ? ' Size ' + e.label + ': ' + e.reason : '');
  if (p.rule === 'flat') return 'Every finished card pays the same.';
  return e && e.reason ? e.reason : 'No reason was given for this size.';
}

/** What a finished card paid, from a done-log row: the size and the whole number the server says was awarded, or ''. */
export function earnedTag(row) {
  const e = normalizeEffort(row);
  const n = row && Number.isInteger(row.xp_earned) && row.xp_earned >= 0 && row.xp_earned <= 1000 ? row.xp_earned : null;
  if (n == null) return '';
  return e ? `${e.label} · ${n} XP earned` : `${n} XP earned`;
}
