import { artFor } from './cas-theme-art.js?v=cas98';

const DIR = 'assets/themes/forge-and-brass/trim/';

/**
 * Monthly trim for the bottom bar: month number (1 to 12) to a strip file. No entry means today's plain trim.
 * To add a month: put the picture in the folder above and add one line here. `dim` (0 to 1) lays a dark overlay over a busy strip so the
 * icons and labels keep their contrast; `fade` (0 to 1) darkens the lower part of the bar, under the labels, only where a strip is bright there. `fx` lists the small CSS-only effects drawn over the strip; every x, y, w, h is a percent of the bar:
 *   lights:  [{ kind, x, y, w, h, t, lo, hi }]  a soft glow picture in the box (kind 'flame' or 'lamp'); it flickers between lo and hi opacity in an
 *            uneven pattern that repeats every t seconds
 *   shadows: [{ x, y, w, h, t, d }]             a soft dark patch that drifts sideways (t seconds a swing, d start offset)
 *   sprites: [{ file, x, y, w, h, frames, every, delay }]  a one-row sheet of `frames` frames played in the first tenth of every `every` seconds
 *            (15 to 25; 20 gives a 2 second play), first run after `delay` seconds, hidden between plays
 *   sleigh:  true                                the December sleigh flight (three different paths in turn)
 */
export const TRIMS = {
  11: {
    file: DIR + 'november/black-iron-hall.jpg', dim: 0.2,
    fx: {
      lights: [
        { kind: 'lamp', x: 25.37, y: 6.94, w: 8.93, h: 41.67, t: 9, lo: 0.7, hi: 1 },
        { kind: 'lamp', x: 65.4, y: 10.07, w: 8.18, h: 38.19, t: 13, lo: 0.7, hi: 1 },
        { kind: 'flame', x: 43.68, y: 59.72, w: 3.87, h: 18.06, t: 2.2, lo: 0.35, hi: 1 },
        { kind: 'flame', x: 47.99, y: 57.29, w: 4.46, h: 20.83, t: 2.9, lo: 0.35, hi: 1 },
        { kind: 'flame', x: 50.67, y: 63.54, w: 4.46, h: 20.83, t: 1.7, lo: 0.35, hi: 1 },
        { kind: 'flame', x: 53.27, y: 62.85, w: 4.46, h: 20.83, t: 3.4, lo: 0.35, hi: 1 },
        { kind: 'flame', x: 57.59, y: 61.46, w: 4.17, h: 19.44, t: 2.5, lo: 0.35, hi: 1 },
        { kind: 'flame', x: 69.64, y: 62.15, w: 3.87, h: 18.06, t: 1.9, lo: 0.35, hi: 1 },
      ],
      shadows: [
        { x: 0, y: 5, w: 20, h: 95, t: 9, d: 0 },
        { x: 80, y: 5, w: 20, h: 95, t: 13, d: -4 },
        { x: 38, y: 5, w: 24, h: 50, t: 7, d: -2 },
      ],
      sprites: [
        { file: DIR + 'november/serve-roast-row.webp', x: 41.67, y: 34.72, w: 9.67, h: 52.08, frames: 24, every: 20, delay: 4 },
        { file: DIR + 'november/set-plate-row.webp', x: 48.36, y: 41.67, w: 10.42, h: 55.56, frames: 24, every: 20, delay: 11 },
        { file: DIR + 'november/pour-drink-row.webp', x: 73.29, y: 17.36, w: 7.81, h: 74.65, frames: 24, every: 20, delay: 16 },
      ],
    },
  },
  12: { file: DIR + 'december/frost-on-iron.jpg', dim: 0.45, fade: 0.6, fx: { sleigh: true } },
};

/** The effect kinds the stylesheet knows. Anything else in a table entry is ignored. */
export const FX_KINDS = ['lights', 'shadows', 'sprites', 'sleigh'];

/** The overlay strength for a trim: 0 to 1, else none. */
export function dimFor(trim) {
  return trim && typeof trim.dim === 'number' && trim.dim > 0 && trim.dim <= 1 ? trim.dim : 0;
}

/** The dark fade under the labels for a trim: 0 to 1, else none. Used where a strip is bright right behind the labels. */
export function fadeFor(trim) {
  return trim && typeof trim.fade === 'number' && trim.fade > 0 && trim.fade <= 1 ? trim.fade : 0;
}

/** The trim for a month, or null (plain trim) when none is listed or the month is not 1 to 12. */
export function trimFor(month, table = TRIMS) {
  if (!Number.isInteger(month) || month < 1 || month > 12) return null;
  return Object.prototype.hasOwnProperty.call(table, month) ? table[month] : null;
}

/** The effects for a month: its `fx` entry only when the month has one and never under reduced motion; else null. Professional mode keeps the layer but the stylesheet hides it, so switching mode needs no redraw. */
export function fxWanted({ month, reduced }, table = TRIMS) {
  const t = trimFor(month, table);
  if (!t || reduced || !t.fx || typeof t.fx !== 'object') return null;
  const has = FX_KINDS.some(k => (Array.isArray(t.fx[k]) ? t.fx[k].length : t.fx[k] === true));
  return has ? t.fx : null;
}

const FX_ID = 'trim-fx';
const num = (v, lo, hi, dflt) => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : dflt);

function reducedMotion() { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } }

function el(doc, cls, vars) {
  const e = doc.createElement('i');
  e.className = cls;
  for (const [k, v] of Object.entries(vars || {})) e.style.setProperty(k, String(v));
  return e;
}

const area = o => ({ '--x': num(o.x, -50, 150, 0) + '%', '--y': num(o.y, -50, 150, 0) + '%', '--w': num(o.w, 0.5, 100, 10) + '%', '--h': num(o.h, 0.5, 100, 30) + '%' });

/** Builds the effect elements for one month's `fx` entry. Every value is range-checked, so a bad table line draws nothing odd. */
export function buildFx(doc, fx, baseHref) {
  const out = [];
  if (Array.isArray(fx.lights)) for (const l of fx.lights) {
    const lo = num(l.lo, 0, 1, 0.5);
    const hi = Math.max(lo, num(l.hi, 0, 1, 1));
    out.push(el(doc, 'fx-light ' + (l.kind === 'lamp' ? 'lamp' : 'flame'), { ...area(l), '--t': num(l.t, 0.5, 30, 3) + 's', '--lo': lo, '--span': +(hi - lo).toFixed(3) }));
  }
  if (Array.isArray(fx.shadows)) for (const s of fx.shadows) out.push(el(doc, 'fx-shadow', { ...area(s), '--t': num(s.t, 4, 20, 9) + 's', '--d': num(s.d, -20, 20, 0) + 's' }));
  if (Array.isArray(fx.sprites)) for (const s of fx.sprites) {
    const frames = Math.round(num(s.frames, 2, 60, 0));
    if (!frames || typeof s.file !== 'string') continue;
    let href = s.file;
    try { href = new URL(s.file, baseHref).href; } catch { /* keep the relative path */ }
    const sprite = el(doc, 'fx-sprite', {
      ...area(s), '--xn': num(s.x, -50, 150, 0), '--yn': num(s.y, -50, 150, 0), '--wn': num(s.w, 0.5, 100, 10), '--hn': num(s.h, 0.5, 100, 30), '--s': frames - 1, '--end': (-100 * (frames - 1) / frames).toFixed(4) + '%', '--every': num(s.every, 15, 25, 20) + 's', '--delay': num(s.delay, 0, 30, 0) + 's',
    });
    sprite.append(el(doc, 'fx-sheet', { '--sheet': `url("${href}")`, '--wide': frames * 100 + '%' }));
    out.push(sprite);
  }
  if (fx.sleigh === true) {
    const sleigh = el(doc, 'fx-sleigh');
    sleigh.append(el(doc, 'fx-bob'));
    out.push(sleigh);
  }
  return out;
}

/** Applies the trim for the date on the phone: sets the strip as the bar's background and adds, swaps or removes the effects layer. */
export function applyTrim(date = new Date(), doc = typeof document === 'undefined' ? null : document) {
  if (!doc || !doc.documentElement) return null;
  const month = date.getMonth() + 1;
  const root = doc.documentElement;
  const themed = artFor(root.dataset.theme).trim !== false;
  const trim = themed ? trimFor(month) : null;
  const nav = doc.querySelector ? doc.querySelector('.station-nav') : null;
  if (trim) {
    let href = trim.file;
    try { href = new URL(trim.file, doc.baseURI).href; } catch { /* keep the relative path */ }
    root.style.setProperty('--trim-url', `url("${href}")`);
    root.style.setProperty('--trim-dim', String(dimFor(trim)));
    root.style.setProperty('--trim-fade', String(fadeFor(trim)));
    root.dataset.trim = String(month);
  } else {
    root.style.removeProperty('--trim-url');
    root.style.removeProperty('--trim-dim');
    root.style.removeProperty('--trim-fade');
    delete root.dataset.trim;
  }
  const layer = doc.getElementById ? doc.getElementById(FX_ID) : null;
  const fx = themed ? fxWanted({ month, reduced: reducedMotion() }) : null;
  const sig = fx ? String(month) : '';
  if (layer && layer.dataset.fx !== sig) layer.remove();
  if (fx && nav && (!layer || layer.dataset.fx !== sig)) {
    const holder = doc.createElement('div');
    holder.id = FX_ID;
    holder.className = 'trim-fx';
    holder.dataset.fx = sig;
    holder.setAttribute('aria-hidden', 'true');
    for (const c of buildFx(doc, fx, doc.baseURI)) holder.append(c);
    nav.append(holder);
  }
  return { month, trim, fx: fx ? sig : null };
}

/** Starts the trim and keeps it right: re-applied when the page comes back (the month may have changed) and the effects rest while the page is hidden. */
export function startTrim(doc = document) {
  doc.documentElement.dataset.hidden = doc.visibilityState === 'hidden' ? '1' : '';
  applyTrim(new Date(), doc);
  doc.addEventListener('visibilitychange', () => {
    doc.documentElement.dataset.hidden = doc.visibilityState === 'hidden' ? '1' : '';
    if (doc.visibilityState !== 'hidden') applyTrim(new Date(), doc);
  });
  doc.addEventListener('station-look', () => applyTrim(new Date(), doc));
}
