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

const RANK_DIR = 'assets/themes/forge-and-brass/ranks/';
const PLATE_FILES = { 1: 'rank01_founder', 2: 'rank02_amateur', 3: 'rank03_beginner', 4: 'rank04_technician', 5: 'rank05_supervisor', 6: 'rank06_manager', 7: 'rank07_senior-manager', 8: 'rank08_general-manager', 9: 'rank09_director', 10: 'rank10_vice-president', 11: 'rank11_executive', 12: 'rank12_chair' };
/** Rank-up scenes painted so far, by rank index; a rank without one gets the plate on a dark brass backdrop. */
const RANKUP_SCENES = { 4: 'rankup_technician' };

/** The picture of a rank's plate (rank index 1 to 12), or '' when there is none. Fixed names only. */
export function plateFor(index) {
  return Number.isInteger(index) && Object.prototype.hasOwnProperty.call(PLATE_FILES, index) ? RANK_DIR + PLATE_FILES[index] + '.jpg' : '';
}

/** The painted scene for a rank-up, or '' when that rank has none yet. */
export function rankUpScene(index) {
  return Number.isInteger(index) && Object.prototype.hasOwnProperty.call(RANKUP_SCENES, index) ? RANK_DIR + RANKUP_SCENES[index] + '.jpg' : '';
}

/** The next rank's plate and what is still needed, from the server's progress only; null at the top rank. */
export function nextPlate(progress) {
  const r = progress && progress.rank;
  if (!r || r.nextAt == null) return null;
  return { index: r.index + 1, name: r.nextName, file: plateFor(r.index + 1), toGo: r.toGo };
}

/** How the rank-up is shown: professional mode is one quiet line, reduced motion is the new plate still, otherwise the animation. */
export function rankUpMode({ mode, reduced } = {}) {
  if (mode === 'professional') return 'line';
  return reduced ? 'still' : 'animate';
}

/**
 * What rank the phone last saw, kept in storage. `check` takes the server's progress and returns { index, name } once when the rank is higher than the
 * phone last saw, then never again for that rank. The first time the phone sees any rank it only records it (no animation for a rank earned before).
 * The rank comes from the server's progress alone. Storage that fails is ignored: the rank is still remembered for this session, so it cannot replay.
 */
export function makeRankMemory(storage, key = 'cas-rank-seen', shownKey = 'cas-rank-shown') {
  const read = k => { try { const v = storage && Number(storage.getItem(k)); return Number.isInteger(v) && v >= 1 && v <= 99 ? v : null; } catch { return null; } };
  const write = (k, v) => { try { if (storage) storage.setItem(k, String(v)); } catch { /* remembered for this session */ } };
  let seen = read(key);
  let shown = read(shownKey);
  if (shown == null) shown = seen;
  return {
    seen: () => seen,
    shown: () => shown,
    check(progress) {
      const r = progress && progress.rank;
      if (!r || !Number.isInteger(r.index) || r.index < 1 || r.index > 99) return null;
      if (r.index !== seen) { seen = r.index; write(key, seen); }
      if (shown == null) { shown = r.index; write(shownKey, shown); return null; }
      if (r.index <= shown) return null;
      shown = r.index;
      write(shownKey, shown);
      return { index: r.index, name: r.name };
    },
  };
}
