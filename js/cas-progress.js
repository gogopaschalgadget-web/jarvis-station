const num = v => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);
const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const pctOf = (xp, from, to) => (to > from ? Math.max(0, Math.min(100, Math.round(((xp - from) / (to - from)) * 100))) : 100);

/** The server's progress block, checked: unknown or malformed pieces are dropped, never guessed. Null when there is no usable rank. */
export function normalizeProgress(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const xp = num(raw.xp);
  const r = raw.rank && typeof raw.rank === 'object' ? raw.rank : null;
  if (xp == null || !r || num(r.index) == null || !text(r.name, 40)) return null;
  const at = num(r.at) == null ? 0 : r.at;
  const nextAt = num(r.next_at);
  const rank = { index: r.index, name: text(r.name, 40), nextName: text(r.next_name, 40), at, nextAt, pct: nextAt == null ? 100 : pctOf(xp, at, nextAt), toGo: nextAt == null ? 0 : Math.max(0, nextAt - xp) };
  const desks = (Array.isArray(raw.desks) ? raw.desks : []).filter(d => d && typeof d === 'object' && text(d.id, 40) && text(d.name, 40)).slice(0, 8).map(d => {
    const dxp = num(d.xp);
    const dNext = num(d.next_at);
    const dFrom = num(d.from) == null ? 0 : d.from;
    return { id: text(d.id, 40), name: text(d.name, 40), machine: text(d.machine, 40), tier: text(d.tier, 30), xp: dxp, nextAt: dNext, pct: dxp == null ? null : dNext == null ? 100 : pctOf(dxp, dFrom, dNext), legendary: text(d.legendary, 120), placeholder: d.placeholder === true };
  });
  const today = raw.today && typeof raw.today === 'object' ? { xp: num(raw.today.xp), cards: num(raw.today.cards) } : null;
  return { xp, rank, desks, today, structure: text(raw.structure, 30), days: num(raw.days_at_desk) };
}

/** "+15 XP" for the toast after a Done, only when the server reported a number. */
export function xpLine(res) {
  const n = res && num(res.xp_gained);
  return n ? '+' + n + ' XP' : '';
}

/** The rank-up the server reported in a done response, or null. */
export function rankUpOf(res) {
  const r = res && res.rank_up && typeof res.rank_up === 'object' ? res.rank_up : null;
  const name = r ? text(r.to, 40) || text(r.name, 40) : '';
  return name ? { name, index: num(r.index) } : null;
}
