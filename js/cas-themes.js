import { THEME_ART, DEFAULT_THEME } from './cas-theme-art.js?v=cas104';

const STORE = 'station-look';
const UNLOCKED = 'station-look-unlocked';
export const TECHNICIAN_INDEX = 4;

/** The themes the Station knows about. `ready` is true only when its art is in the Station; nothing else can be chosen. */
export const THEMES = Object.entries(THEME_ART).map(([id, art]) => ({ id, ...art.meta }));
export const DEFAULT_LOOK = { mode: THEME_ART[DEFAULT_THEME].meta.mode, theme: DEFAULT_THEME };

const readyFor = (mode, themes = THEMES) => themes.find(t => t.ready && t.mode === mode) || null;

/** A saved look, checked: a mode and a theme that exist, are ready, and belong together; otherwise the default. */
export function normalizeLook(stored, themes = THEMES) {
  const s = stored && typeof stored === 'object' ? stored : {};
  const theme = themes.find(t => t.id === s.theme && t.ready);
  if (!theme || (s.mode !== undefined && s.mode !== theme.mode)) return { ...DEFAULT_LOOK };
  return { mode: theme.mode, theme: theme.id };
}

/** Changing the look is a reward: it opens at Technician. Without a reported rank it stays closed and says why. */
export function lookLock(progress) {
  if (!progress || !progress.rank) return { open: false, why: 'Locked: your rank is not reported yet.' };
  if (progress.rank.index >= TECHNICIAN_INDEX) return { open: true, why: '' };
  return { open: false, why: 'Locked, not earned: reach Technician to change the look.' };
}

/** The mode switch: Game and Professional, each available only when a theme with its art is in the Station. */
export function modeOptions(themes = THEMES) {
  return [['game', 'Game'], ['professional', 'Professional']].map(([mode, label]) => ({ mode, label, available: !!readyFor(mode, themes) }));
}

/** The look that is really applied: the stored choice only when the rank lock is open, else the default. The stored choice is kept for later. */
export function effectiveLook(stored, progress, themes = THEMES) {
  return lookLock(progress).open ? normalizeLook(stored, themes) : { ...DEFAULT_LOOK };
}

/** Re-applies the look once the server has reported the rank. */
export function syncLook(progress, themes = THEMES) {
  if (progress && progress.rank) {
    try { if (lookLock(progress).open) localStorage.setItem(UNLOCKED, '1'); else localStorage.removeItem(UNLOCKED); } catch { /* the first paint then stays the default */ }
  }
  return applyLook(effectiveLook(rawLook(), progress, themes), themes);
}

/** The look for the first paint, before any server answer: the saved look only if the server's progress unlocked the Look card on an earlier read (that fact is written only by syncLook), else the default. The first Desk read confirms or reverts it. Cosmetic, not a lock. */
export function bootLook(themes = THEMES) {
  try { if (localStorage.getItem(UNLOCKED) === '1') return normalizeLook(rawLook(), themes); } catch { /* default */ }
  return { ...DEFAULT_LOOK };
}

function rawLook() {
  try { return JSON.parse(localStorage.getItem(STORE) || 'null'); } catch { return null; }
}

export function loadLook(themes = THEMES) {
  return normalizeLook(rawLook(), themes);
}

export function saveLook(look, themes = THEMES) {
  try { localStorage.setItem(STORE, JSON.stringify(normalizeLook(look, themes))); } catch { /* no storage: the look is not remembered */ }
}

const COLOR_VARS = { barA: '--th-bar-a', barB: '--th-bar-b', accent: '--th-accent', accentHi: '--th-accent-hi', accentLo: '--th-accent-lo', panelA: '--th-panel-a', panelB: '--th-panel-b', text: '--th-text', muted: '--th-muted' };

/** A theme's bar and accent colours go onto the page as custom properties; a theme with none leaves the stylesheet's own look. */
export function paintColors(root, colors) {
  const style = root.style;
  if (colors && typeof colors === 'object') {
    for (const [k, v] of Object.entries(COLOR_VARS)) if (/^#[0-9a-f]{6}$/i.test(String(colors[k]))) style.setProperty(v, colors[k]);
    root.dataset.themeColors = '1';
  } else {
    for (const v of Object.values(COLOR_VARS)) style.removeProperty(v);
    delete root.dataset.themeColors;
  }
}

/** Marks the page with the chosen look so styles and art can follow it. */
export function applyLook(look, themes = THEMES) {
  const l = normalizeLook(look, themes);
  try {
    const root = document.documentElement;
    const changed = root.dataset.theme !== l.theme || root.dataset.mode !== l.mode;
    root.dataset.theme = l.theme;
    root.dataset.mode = l.mode;
    paintColors(root, Object.prototype.hasOwnProperty.call(THEME_ART, l.theme) ? THEME_ART[l.theme].colors : null);
    if (changed && typeof document.dispatchEvent === 'function' && typeof CustomEvent === 'function') document.dispatchEvent(new CustomEvent('station-look', { detail: l }));
  } catch { /* no document */ }
  return l;
}

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

/** The Look card for Settings: mode, theme, and why a choice is closed. Built with text nodes only. */
export function renderThemeSettings(panel, getProgress, themes = THEMES) {
  const old = panel.querySelector('#look-card');
  if (old) old.remove();
  const progress = getProgress ? getProgress() : null;
  const lock = lookLock(progress);
  const look = effectiveLook(rawLook(), progress, themes);
  const card = el('div', 'panel-card');
  card.id = 'look-card';
  card.append(el('div', 'panel-card-title', 'Look'));

  const modes = el('div', 'look-modes');
  modeOptions(themes).forEach(m => {
    const b = el('button', 'look-mode' + (look.mode === m.mode ? ' on' : ''), m.label);
    b.type = 'button';
    b.setAttribute('aria-pressed', String(look.mode === m.mode));
    b.disabled = !m.available || !lock.open || look.mode === m.mode;
    b.addEventListener('click', () => {
      if (!lookLock(getProgress ? getProgress() : null).open) return;
      const t = readyFor(m.mode, themes);
      if (t) { saveLook({ mode: t.mode, theme: t.id }, themes); applyLook({ mode: t.mode, theme: t.id }, themes); renderThemeSettings(panel, getProgress, themes); }
    });
    modes.append(b);
  });
  card.append(modes);

  themes.forEach(t => {
    const row = el('button', 'look-theme' + (look.theme === t.id ? ' on' : ''));
    row.type = 'button';
    row.setAttribute('aria-pressed', String(look.theme === t.id));
    row.disabled = !t.ready || !lock.open;
    if (look.theme === t.id) row.setAttribute('aria-current', 'true');
    const head = el('div', 'look-name');
    head.append(el('b', '', t.name), el('span', '', look.theme === t.id ? 'Active' : t.ready ? (lock.open ? 'Tap to use' : 'Locked') : 'Art not here yet'));
    row.append(head, el('small', '', t.tagline));
    row.addEventListener('click', () => {
      if (!t.ready || look.theme === t.id || !lookLock(getProgress ? getProgress() : null).open) return;
      saveLook({ mode: t.mode, theme: t.id }, themes);
      applyLook({ mode: t.mode, theme: t.id }, themes);
      renderThemeSettings(panel, getProgress, themes);
    });
    card.append(row);
  });
  if (!lock.open) card.append(el('p', 'look-note', lock.why));
  card.append(el('p', 'look-note', 'A theme changes names and pictures only, never the rules, XP or what is locked.'));
  panel.append(card);
}

/** The Look card for Settings that can never take the rest of Settings down with it: any failure draws nothing and is reported as false. */
export function renderThemeSettingsSafe(panel, getProgress, themes = THEMES) {
  try { renderThemeSettings(panel, getProgress, themes); return true; } catch { return false; }
}
