const DIR = 'assets/themes/forge-and-brass/trim/';

/**
 * Monthly trim for the bottom bar: month number (1 to 12) to a strip file. No entry means today's plain trim.
 * To add a month: put the picture in the folder above and add one line here. `dim` (0 to 1) lays a dark overlay over a busy strip so the
 * icons and labels keep their contrast. `fx` lists the small CSS-only effects drawn over the strip (all positions are percent of the bar):
 *   flames:  [{ x, y, r, t, d }]  a soft glow over a flame at x,y (r = glow size in px, t = flicker seconds, d = start offset seconds)
 *   shadow:  true                 one slow, low-contrast shadow layer that drifts
 *   sprites: [{ file, x, y, w, h, frames, every }]  a one-row sheet of `frames` frames played once every `every` seconds (15 to 25), hidden between
 *   sleigh:  true                 the December sleigh flight (three different paths in turn)
 */
export const TRIMS = {
  11: {
    file: DIR + 'november/black-iron-hall.jpg', dim: 0.12,
    fx: {
      flames: [
        { x: 39.3, y: 53, r: 26, t: 2.7, d: 0 }, { x: 43.3, y: 55, r: 16, t: 3.3, d: -1.1 }, { x: 45, y: 55, r: 16, t: 2.3, d: -0.4 },
        { x: 46.1, y: 56, r: 16, t: 3.7, d: -2.2 }, { x: 54.4, y: 56, r: 18, t: 3.1, d: -1.7 }, { x: 57, y: 57, r: 18, t: 2.5, d: -0.8 },
      ],
      shadow: true,
      sprites: [],
    },
  },
  12: { file: DIR + 'december/frost-on-iron.jpg', dim: 0.15, fx: { sleigh: true } },
};

/** The effect kinds the stylesheet knows. Anything else in a table entry is ignored. */
export const FX_KINDS = ['flames', 'shadow', 'sprites', 'sleigh'];

/** The overlay strength for a trim: 0 to 1, else none. */
export function dimFor(trim) {
  return trim && typeof trim.dim === 'number' && trim.dim > 0 && trim.dim <= 1 ? trim.dim : 0;
}

/** The trim for a month, or null (plain trim) when none is listed or the month is not 1 to 12. */
export function trimFor(month, table = TRIMS) {
  if (!Number.isInteger(month) || month < 1 || month > 12) return null;
  return Object.prototype.hasOwnProperty.call(table, month) ? table[month] : null;
}

/** The effects for a month: its `fx` entry only when the month has one, in game mode, and never under reduced motion; else null. */
export function fxWanted({ month, mode, reduced }, table = TRIMS) {
  const t = trimFor(month, table);
  if (!t || mode === 'professional' || reduced || !t.fx || typeof t.fx !== 'object') return null;
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

/** Builds the effect elements for one month's `fx` entry. Every value is range-checked, so a bad table line draws nothing odd. */
export function buildFx(doc, fx, baseHref) {
  const out = [];
  if (Array.isArray(fx.flames)) for (const f of fx.flames) {
    out.push(el(doc, 'fx-flame', { '--x': num(f.x, 0, 100, 50) + '%', '--y': num(f.y, 0, 100, 50) + '%', '--r': num(f.r, 4, 80, 16) + 'px', '--t': num(f.t, 1, 10, 3) + 's', '--d': num(f.d, -20, 20, 0) + 's' }));
  }
  if (fx.shadow === true) out.push(el(doc, 'fx-shadow'));
  if (Array.isArray(fx.sprites)) for (const s of fx.sprites) {
    const frames = Math.round(num(s.frames, 2, 60, 0));
    if (!frames || typeof s.file !== 'string') continue;
    let href = s.file;
    try { href = new URL(s.file, baseHref).href; } catch { /* keep the relative path */ }
    const box = el(doc, 'fx-sprite', {
      '--x': num(s.x, 0, 100, 0) + '%', '--y': num(s.y, 0, 100, 0) + '%', '--w': num(s.w, 1, 100, 10) + '%', '--h': num(s.h, 1, 100, 30) + '%',
      '--s': frames - 1, '--end': (-100 * (frames - 1) / frames).toFixed(4) + '%', '--every': num(s.every, 15, 25, 20) + 's',
    });
    const sheet = el(doc, 'fx-sheet', { '--sheet': `url("${href}")`, '--wide': frames * 100 + '%' });
    box.append(sheet);
    out.push(box);
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
  const trim = trimFor(month);
  const root = doc.documentElement;
  const nav = doc.querySelector ? doc.querySelector('.station-nav') : null;
  if (trim) {
    let href = trim.file;
    try { href = new URL(trim.file, doc.baseURI).href; } catch { /* keep the relative path */ }
    root.style.setProperty('--trim-url', `url("${href}")`);
    root.style.setProperty('--trim-dim', String(dimFor(trim)));
    root.dataset.trim = String(month);
  } else {
    root.style.removeProperty('--trim-url');
    root.style.removeProperty('--trim-dim');
    delete root.dataset.trim;
  }
  const layer = doc.getElementById ? doc.getElementById(FX_ID) : null;
  const fx = fxWanted({ month, mode: root.dataset.mode, reduced: reducedMotion() });
  const sig = fx ? String(month) : '';
  if (layer && layer.dataset.fx !== sig) layer.remove();
  if (fx && nav && (!layer || layer.dataset.fx !== sig)) {
    const box = doc.createElement('div');
    box.id = FX_ID;
    box.className = 'trim-fx';
    box.dataset.fx = sig;
    box.setAttribute('aria-hidden', 'true');
    for (const c of buildFx(doc, fx, doc.baseURI)) box.append(c);
    nav.append(box);
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
}
