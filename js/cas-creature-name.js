// cas-creature-name.js - the creature's name: chosen once, kept on this device only (never sent anywhere), drawn as plain text.
export const NAME_MAX = 24;
const KEY = 'cas-creature-name-';
// Control characters, zero-width marks and the direction overrides that can reorder text. The joiner (200D) stays: emoji need it.
const HIDDEN = /[\u0000-\u001f\u007f-\u009f​‌‎‏‪-‮⁦-⁩﻿]/g;
const valid = n => Number.isInteger(n) && n >= 0 && n <= 1e6;

/** What was typed, checked: { ok, name } or { ok:false, reason: 'empty' | 'long' }. Length counts whole characters, so an emoji is one. */
export function checkName(raw) {
  const name = typeof raw === 'string' ? raw.replace(HIDDEN, ' ').replace(/\s+/g, ' ').trim() : '';
  if (!name) return { ok: false, reason: 'empty' };
  if (Array.from(name).length > NAME_MAX) return { ok: false, reason: 'long' };
  return { ok: true, name };
}

/** The plain-words reply for a failed check. */
export function nameProblem(reason) {
  if (reason === 'empty') return 'Type a name first.';
  if (reason === 'long') return `Please use ${NAME_MAX} characters or fewer.`;
  if (reason === 'already') return 'This creature already has a name.';
  return 'That name could not be used.';
}

/**
 * The name book for this device: one name per creature number. `getStorage` may throw or return nothing (private browsing):
 * the name is then kept for this visit only and `kept` says 'visit' instead of 'device'.
 */
export function makeNameStore(getStorage) {
  const memory = new Map();
  const box = () => { try { return getStorage() || null; } catch { return null; } };
  const get = number => {
    if (!valid(number)) return null;
    let v = null;
    try { const s = box(); v = s ? s.getItem(KEY + number) : null; } catch { v = null; }
    if (v == null) v = memory.get(number) || null;
    const c = checkName(v);
    return c.ok ? c.name : null;
  };
  /** A first name needs none yet; a deliberate rename passes { replace: true }. */
  const set = (number, raw, opts = {}) => {
    if (!valid(number)) return { ok: false, reason: 'bad' };
    const c = checkName(raw);
    if (!c.ok) return c;
    if (!opts.replace && get(number)) return { ok: false, reason: 'already' };
    try {
      const s = box();
      if (s) { s.setItem(KEY + number, c.name); if (s.getItem(KEY + number) === c.name) { memory.delete(number); return { ok: true, name: c.name, kept: 'device' }; } }
    } catch { /* no storage: kept for this visit */ }
    memory.set(number, c.name);
    return { ok: true, name: c.name, kept: 'visit' };
  };
  return { get, set, forgetVisit: () => memory.clear() };
}

const el = (doc, tag, cls, text) => {
  const n = doc.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

/** True when the Den should show the "Name your creature" prompt at the top: a hatched creature with no name yet. */
export const needsNamePrompt = c => !!c && c.phase === 'creature' && !(typeof c.name === 'string' && c.name.trim());
export const NAME_PROMPT = 'Name your creature';
/** The prompt at the top of the Den, where it shows without scrolling. A tap runs onTap (the Den takes Chris to the name field). Text only. */
export function namePrompt(doc, onTap) {
  const b = el(doc, 'button', 'cr-nameprompt', NAME_PROMPT);
  b.type = 'button';
  b.setAttribute('aria-label', NAME_PROMPT + ': go to the name box');
  b.addEventListener('click', () => { if (onTap) onTap(); });
  return b;
}

/**
 * The naming card for the Den. Text goes in with textContent only. `current` is the name now (or null), `suggested` the offered one.
 * onSaved(result) runs after a name is kept. Naming needs a deliberate tap on a button; a name already set is only replaced
 * through "Rename", then a second confirm button.
 */
export const VISIT_NOTE = 'Named, but this browser will not keep it: it may be forgotten when you close the app.';
export function nameCard(doc, { number, current, suggested, store, onSaved, note }) {
  const card = el(doc, 'div', 'cr-name-card');
  const say = el(doc, 'p', 'cr-name-say');
  say.textContent = note || '';
  say.setAttribute('role', 'status');
  say.setAttribute('aria-live', 'polite');
  let renaming = false;

  const keep = (raw, replace) => {
    const r = store.set(number, raw, { replace });
    if (!r.ok) { say.textContent = nameProblem(r.reason); return r; }
    say.textContent = r.kept === 'visit' ? VISIT_NOTE : '';
    if (onSaved) onSaved(r);
    return r;
  };

  const form = (title, confirmWords, replace) => {
    const f = el(doc, 'form', 'cr-name-form');
    f.setAttribute('novalidate', '');
    const label = el(doc, 'label', 'cr-name-label', title);
    const input = el(doc, 'input', 'cr-name-input');
    input.type = 'text';
    input.id = 'cr-name-input';
    label.setAttribute('for', 'cr-name-input');
    input.setAttribute('maxlength', String(NAME_MAX * 4));
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('autocapitalize', 'words');
    input.setAttribute('enterkeyhint', 'done');
    input.setAttribute('aria-label', title);
    const go = el(doc, 'button', 'cr-name-go', confirmWords);
    go.type = 'submit';
    const lift = () => { try { setTimeout(() => { if (f.scrollIntoView) f.scrollIntoView({ block: 'start', behavior: 'smooth' }); }, 300); } catch { /* the page stays where it is */ } };
    input.addEventListener('focus', () => {
      lift();
      try { if (typeof visualViewport !== 'undefined' && visualViewport && visualViewport.addEventListener) visualViewport.addEventListener('resize', lift, { once: true }); } catch { /* no viewport events */ }
    });
    f.addEventListener('submit', ev => { if (ev && ev.preventDefault) ev.preventDefault(); keep(input.value, replace); });
    f.append(label, input, go);
    return f;
  };

  if (!current) {
    card.append(el(doc, 'h5', 'cr-h', 'Name your creature'));
    card.append(el(doc, 'p', 'cr-hint', 'Not named yet. The name stays on this phone.'));
    if (suggested && checkName(suggested).ok) {
      const use = el(doc, 'button', 'cr-name-use', `Use ${suggested}`);
      use.type = 'button';
      use.addEventListener('click', () => keep(suggested, false));
      card.append(use);
    }
    card.append(form(suggested ? 'Or type your own name' : 'Type a name', 'Name it', false), say);
    return card;
  }

  const row = el(doc, 'div', 'cr-name-row');
  const rename = el(doc, 'button', 'cr-name-rename', 'Rename');
  rename.type = 'button';
  rename.addEventListener('click', () => {
    if (renaming) return;
    renaming = true;
    rename.remove && rename.remove();
    const keepIt = el(doc, 'button', 'cr-name-cancel', `Keep ${current}`);
    keepIt.type = 'button';
    keepIt.addEventListener('click', () => { if (onSaved) onSaved({ ok: true, name: current, kept: 'device', unchanged: true }); });
    card.append(el(doc, 'p', 'cr-hint', `Renaming replaces ${current} for good.`), form('New name', 'Yes, rename it', true), keepIt);
  });
  row.append(rename);
  card.append(row, say);
  return card;
}
