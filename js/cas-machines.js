const DIR = 'assets/themes/forge-and-brass/machines/';

/** Desk id (from the server's progress) to its machine's picture set. A desk not listed has no machine picture. */
export const MACHINES = {
  operations: 'forge',
  sales: 'press',
  marketing: 'tower',
  money: 'gauge',
  customer_experience: 'switch',
};

/** The tiers in rising order, with the words the server uses. */
export const TIERS = ['basic', 'enhanced', 'advanced', 'legendary'];

/** Which pictures exist for each machine: all four tier stills and one loop. A missing tier falls to the nearest lower one. */
const HAS = Object.fromEntries(Object.values(MACHINES).map(m => [m, { stills: ['basic', 'enhanced', 'advanced', 'legendary'], loop: true }]));

const own = (o, k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);

/** The tier word as a key ('Enhanced' to 'enhanced'); an unknown or missing word is the first tier. */
export function tierKey(tier) {
  const k = typeof tier === 'string' ? tier.trim().toLowerCase() : '';
  return TIERS.includes(k) ? k : TIERS[0];
}

/** The still picture for a desk at its current tier, or '' when the desk has no machine. A tier with no picture uses the nearest lower one. */
export function stillFor(desk, set = HAS) {
  const m = desk && own(MACHINES, desk.id) ? MACHINES[desk.id] : '';
  if (!m || !own(set, m)) return '';
  const have = set[m].stills;
  for (let i = TIERS.indexOf(tierKey(desk.tier)); i >= 0; i--) if (have.includes(TIERS[i])) return DIR + m + '-' + TIERS[i] + '.webp';
  return '';
}

/** The loop for a desk, only when the machine is really running: it has earned XP and is not a placeholder. Else ''. */
export function loopFor(desk, set = HAS) {
  const m = desk && own(MACHINES, desk.id) ? MACHINES[desk.id] : '';
  if (!m || !own(set, m) || !set[m].loop) return '';
  if (desk.placeholder === true || !(typeof desk.xp === 'number' && desk.xp > 0)) return '';
  return DIR + m + '-loop.webp';
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
    imgs.forEach(i => playing.delete(i.dataset.desk));
  };
}
