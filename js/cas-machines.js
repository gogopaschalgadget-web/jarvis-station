import { THEME_ART, DEFAULT_THEME, artFor } from './cas-theme-art.js?v=cas104';

/** Desk id (from the server's progress) to its machine in the default theme; each theme's own table decides the real mapping. */
export const MACHINES = THEME_ART[DEFAULT_THEME].machines.desks;

/** The tiers in rising order, with the words the server uses. */
export const TIERS = ['basic', 'enhanced', 'advanced', 'legendary'];

const own = (o, k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);

/** The machine's name for a desk: the active theme's own name when its table has one (Counting House calls them boards and ledgers), else the word the server sent. */
export function machineName(desk) {
  if (!desk) return '';
  const names = artFor().machines.names;
  return names && own(names, desk.id) ? names[desk.id] : (typeof desk.machine === 'string' ? desk.machine : '');
}

/** The tier word as a key ('Enhanced' to 'enhanced'); an unknown or missing word is the first tier. */
export function tierKey(tier) {
  const k = typeof tier === 'string' ? tier.trim().toLowerCase() : '';
  return TIERS.includes(k) ? k : TIERS[0];
}

/** The still picture for a desk at its current tier, or '' when it has no machine. A tier with no picture uses the nearest lower one; a desk the active theme has no machine for uses the default theme's. `set` (tests) limits which tiers exist per machine. */
export function stillFor(desk, set = null) {
  if (!desk) return '';
  for (const art of [artFor(), THEME_ART[DEFAULT_THEME]]) {
    const m = own(art.machines.desks, desk.id) ? art.machines.desks[desk.id] : '';
    if (!m || !own(art.machines.stills, m)) continue;
    if (set && !own(set, m)) continue;
    const have = set ? set[m].stills : Object.keys(art.machines.stills[m]);
    for (let i = TIERS.indexOf(tierKey(desk.tier)); i >= 0; i--) if (have.includes(TIERS[i]) && own(art.machines.stills[m], TIERS[i])) return art.machines.stills[m][TIERS[i]];
    return '';
  }
  return '';
}

/** The loop for a desk in the active theme, only when the machine is really running: it has earned XP and is not a placeholder. Else ''. */
export function loopFor(desk, set = null) {
  if (!desk) return '';
  const art = artFor();
  const m = own(art.machines.desks, desk.id) ? art.machines.desks[desk.id] : '';
  if (!m || !own(art.machines.loops, m)) return '';
  if (set && !(own(set, m) && set[m].loop)) return '';
  if (desk.placeholder === true || !(typeof desk.xp === 'number' && desk.xp > 0)) return '';
  return art.machines.loops[m];
}

/** The desks whose loop was playing at the last look, so a redraw of the Desk starts a running machine on its loop instead of flashing the still first. */
const playing = new Set();

/** The picture a freshly drawn card starts with. */
export function startPicture(desk) {
  return desk && playing.has(desk.id) ? loopFor(desk) || stillFor(desk) : stillFor(desk);
}

/** The picture to show right now: the loop only when it should move, else the still. */
export function pictureNow(desk, { visible, hidden, reduced, mode }) {
  const still = stillFor(desk);
  if (mode === 'professional' || reduced || hidden || !visible) return still;
  return loopFor(desk) || still;
}

/**
 * Keeps the machine pictures right: each `img[data-still]` shows its loop only while it is on screen, the page is visible, motion is allowed and the
 * theme is not professional; otherwise its still. Nothing is fetched until a picture is near the screen. Returns a stop function.
 */
export function watchMachines(root, { doc = document, win = window, mode = () => doc.documentElement.dataset.mode } = {}) {
  const imgs = [...root.querySelectorAll('img[data-still]')];
  const here = new Set(imgs.map(i => i.dataset.desk));
  for (const id of [...playing]) if (!here.has(id)) playing.delete(id);
  if (!imgs.length) return () => {};
  const reducedQ = (() => { try { return win.matchMedia('(prefers-reduced-motion: reduce)'); } catch { return null; } })();
  const seen = new Map();
  const apply = img => {
    const want = pictureNow({ id: img.dataset.desk, tier: img.dataset.tier, xp: img.dataset.failed === '1' ? 0 : Number(img.dataset.xp), placeholder: img.dataset.placeholder === '1' },
      { visible: seen.get(img) === true, hidden: doc.visibilityState === 'hidden', reduced: !!(reducedQ && reducedQ.matches), mode: mode() });
    if (want && img.getAttribute('src') !== want) img.setAttribute('src', want);
    if (want && want === loopFor({ id: img.dataset.desk, xp: Number(img.dataset.xp), placeholder: img.dataset.placeholder === '1' })) playing.add(img.dataset.desk); else playing.delete(img.dataset.desk);
  };
  let io = null;
  if (typeof win.IntersectionObserver === 'function') {
    io = new win.IntersectionObserver(entries => { entries.forEach(e => { seen.set(e.target, e.isIntersecting); apply(e.target); }); }, { rootMargin: '80px' });
    imgs.forEach(i => io.observe(i));
  }
  const onVis = () => imgs.forEach(apply);
  doc.addEventListener('visibilitychange', onVis);
  if (reducedQ && reducedQ.addEventListener) reducedQ.addEventListener('change', onVis);
  return () => {
    if (io) io.disconnect();
    doc.removeEventListener('visibilitychange', onVis);
    if (reducedQ && reducedQ.removeEventListener) reducedQ.removeEventListener('change', onVis);
  };
}
