import { plateFor, rankUpScene, rankUpMode } from './cas-progress.js?v=cas104';

const AUTO_MS = 12000;
let current = null;
const GUARD_MS = 700;

/**
 * The rank-up moment. Professional mode: one quiet line through `say`. Reduced motion: the new plate still, no movement. Otherwise a short animation
 * (CSS only) over the rank's scene if one is painted, else a dark brass backdrop. A tap, Escape or the button closes it; it also closes itself.
 * Returns the element (or null for the quiet line) so a caller can close it.
 */
export function showRankUp(doc, { name, index, mode, reduced, say }) {
  const how = rankUpMode({ mode, reduced });
  if (how === 'line') { if (say) say('Rank up: ' + name + '.'); return null; }
  if (current) current();
  const box = doc.createElement('div');
  box.id = 'rankup';
  box.className = 'rankup ' + how;
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-label', 'Rank up: ' + name);
  const scene = rankUpScene(index);
  if (scene) {
    const bg = doc.createElement('div');
    bg.className = 'ru-scene';
    bg.style.backgroundImage = `url("${scene}")`;
    box.append(bg);
  }
  const shade = doc.createElement('div');
  shade.className = 'ru-shade';
  const center = doc.createElement('div');
  center.className = 'ru-center';
  const plate = plateFor(index);
  if (plate) {
    const img = doc.createElement('img');
    img.className = 'ru-plate';
    img.alt = name + ' plate';
    img.src = plate;
    img.addEventListener('error', () => img.remove());
    center.append(img);
  }
  const small = doc.createElement('small');
  small.textContent = 'Rank up';
  const big = doc.createElement('b');
  big.textContent = name;
  const btn = doc.createElement('button');
  btn.type = 'button';
  btn.className = 'ru-close';
  btn.textContent = 'Continue';
  center.append(small, big, btn);
  box.append(shade, center);
  const opened = Date.now();
  let timer = 0;
  const prevFocus = doc.activeElement;
  const held = Array.from(doc.body && doc.body.children ? doc.body.children : []).filter(c => c !== box && !c.inert);
  const close = () => {
    clearTimeout(timer);
    doc.removeEventListener('keydown', onKey, true);
    held.forEach(c => { c.inert = false; });
    box.remove();
    if (current === close) current = null;
    try { if (prevFocus && prevFocus.focus) prevFocus.focus({ preventScroll: true }); } catch { /* no focus */ }
  };
  const onKey = e => { if (e.key === 'Escape') { if (e.stopImmediatePropagation) e.stopImmediatePropagation(); else if (e.stopPropagation) e.stopPropagation(); close(); } };
  box.addEventListener('click', () => { if (Date.now() - opened >= GUARD_MS) close(); });
  btn.addEventListener('click', e => { e.stopPropagation(); close(); });
  doc.addEventListener('keydown', onKey, true);
  if (how === 'animate') timer = setTimeout(close, AUTO_MS);
  current = close;
  held.forEach(c => { c.inert = true; });
  (doc.body || doc.documentElement).append(box);
  try { btn.focus({ preventScroll: true }); } catch { /* no focus */ }
  return box;
}
