const DIR = 'assets/themes/forge-and-brass/trim/';

/**
 * Monthly trim for the bottom bar: month number (1 to 12) to a strip file. No entry means today's plain trim.
 * To add a month: put the picture in the folder above and add one line here. `sleigh: true` adds the December sleigh shadow.
 */
export const TRIMS = {
  12: { file: DIR + 'december/frost-on-iron.jpg', sleigh: true },
};

/** The trim for a month, or null (plain trim) when none is listed or the month is not 1 to 12. */
export function trimFor(month, table = TRIMS) {
  if (!Number.isInteger(month) || month < 1 || month > 12) return null;
  return Object.prototype.hasOwnProperty.call(table, month) ? table[month] : null;
}

/** The sleigh shows only in a month that asks for it, in game mode, and never under reduced motion. */
export function sleighWanted({ month, mode, reduced }, table = TRIMS) {
  const t = trimFor(month, table);
  return !!(t && t.sleigh === true && mode !== 'professional' && !reduced);
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
    root.dataset.trim = String(month);
  } else {
    root.style.removeProperty('--trim-url');
    delete root.dataset.trim;
  }
  const fx = doc.getElementById ? doc.getElementById(FX_ID) : null;
  const want = sleighWanted({ month, mode: root.dataset.mode, reduced: reducedMotion() });
  if (want && nav && !fx) {
    const box = doc.createElement('div');
    box.id = FX_ID;
    box.className = 'trim-fx';
    box.setAttribute('aria-hidden', 'true');
    box.append(doc.createElement('i'));
    nav.append(box);
  } else if (!want && fx) {
    fx.remove();
  }
  return { month, trim, sleigh: want };
}

/** Starts the trim and keeps it right: re-applied when the page comes back (the month may have changed) and the sleigh rests while the page is hidden. */
export function startTrim(doc = document) {
  applyTrim(new Date(), doc);
  doc.addEventListener('visibilitychange', () => {
    doc.documentElement.dataset.hidden = doc.visibilityState === 'hidden' ? '1' : '';
    if (doc.visibilityState !== 'hidden') applyTrim(new Date(), doc);
  });
}
