const DIR = 'assets/themes/forge-and-brass/trim/';

/**
 * Monthly trim for the bottom bar: month number (1 to 12) to a strip file. No entry means today's plain trim.
 * To add a month: put the picture in the folder above and add one line here. `dim` (0 to 1) lays a dark overlay over a busy strip so the
 * icons and labels keep their contrast; `anim` names a small animation from ANIMS that plays over the strip (CSS only).
 */
export const TRIMS = {
  11: { file: DIR + 'november/the-toast.jpg', dim: 0.1, anim: 'cheers' },
  12: { file: DIR + 'december/frost-on-iron.jpg', dim: 0.15, anim: 'sleigh' },
};

/** The animations the stylesheet knows (rules `.trim-fx[data-anim="<name>"]`). A name not listed here never plays. */
export const ANIMS = ['sleigh', 'cheers'];

/** The element each animation draws: the sleigh is an <i>, the toast a <b> (the stylesheet keys on the tag and the data-anim name). */
const ANIM_TAG = { sleigh: 'i', cheers: 'b' };

/** The overlay strength for a trim: 0 to 1, else none. */
export function dimFor(trim) {
  return trim && typeof trim.dim === 'number' && trim.dim > 0 && trim.dim <= 1 ? trim.dim : 0;
}

/** The trim for a month, or null (plain trim) when none is listed or the month is not 1 to 12. */
export function trimFor(month, table = TRIMS) {
  if (!Number.isInteger(month) || month < 1 || month > 12) return null;
  return Object.prototype.hasOwnProperty.call(table, month) ? table[month] : null;
}

/** The animation for a month: its name only when the month asks for a known one, in game mode, and never under reduced motion. */
export function animWanted({ month, mode, reduced }, table = TRIMS, anims = ANIMS) {
  const t = trimFor(month, table);
  if (!t || mode === 'professional' || reduced) return null;
  return typeof t.anim === 'string' && anims.includes(t.anim) ? t.anim : null;
}

const FX_ID = 'trim-fx';

function reducedMotion() { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } }

/** Applies the trim for the date on the phone: sets the strip as the bar's background and adds or removes the sleigh. */
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
  const fx = doc.getElementById ? doc.getElementById(FX_ID) : null;
  const want = animWanted({ month, mode: root.dataset.mode, reduced: reducedMotion() });
  if (fx && (!want || fx.dataset.anim !== want)) fx.remove();
  if (want && nav && (!fx || fx.dataset.anim !== want)) {
    const box = doc.createElement('div');
    box.id = FX_ID;
    box.className = 'trim-fx';
    box.dataset.anim = want;
    box.setAttribute('aria-hidden', 'true');
    box.append(doc.createElement(ANIM_TAG[want] || 'i'));
    nav.append(box);
  }
  return { month, trim, anim: want };
}

/** Starts the trim and keeps it right: re-applied when the page comes back (the month may have changed) and the sleigh rests while the page is hidden. */
export function startTrim(doc = document) {
  doc.documentElement.dataset.hidden = doc.visibilityState === 'hidden' ? '1' : '';
  applyTrim(new Date(), doc);
  doc.addEventListener('visibilitychange', () => {
    doc.documentElement.dataset.hidden = doc.visibilityState === 'hidden' ? '1' : '';
    if (doc.visibilityState !== 'hidden') applyTrim(new Date(), doc);
  });
}
