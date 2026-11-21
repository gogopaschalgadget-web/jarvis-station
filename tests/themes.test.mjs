import test from 'node:test';
import assert from 'node:assert/strict';
import { THEMES, DEFAULT_LOOK, normalizeLook, lookLock, modeOptions, loadLook, applyLook } from '../js/cas-themes.js';

test('a saved look must name a theme that exists and has its art; anything else is the default', () => {
  assert.deepEqual(normalizeLook({ mode: 'game', theme: 'forge-and-brass' }), DEFAULT_LOOK);
  assert.deepEqual(normalizeLook({ mode: 'professional', theme: 'counting-house' }), DEFAULT_LOOK);
  assert.deepEqual(normalizeLook({ mode: 'professional', theme: 'forge-and-brass' }), DEFAULT_LOOK);
  assert.deepEqual(normalizeLook({ theme: 'nope' }), DEFAULT_LOOK);
  assert.deepEqual(normalizeLook(null), DEFAULT_LOOK);
  assert.deepEqual(normalizeLook('x'), DEFAULT_LOOK);
  assert.deepEqual(normalizeLook({ theme: 'forge-and-brass' }), DEFAULT_LOOK);
});

test('a theme without art is listed but never selectable; its mode is not offered', () => {
  assert.equal(THEMES.find(t => t.id === 'counting-house').ready, false);
  assert.deepEqual(modeOptions().map(m => [m.mode, m.available]), [['game', true], ['professional', false]]);
});

test('changing the look opens at Technician; no reported rank keeps it closed with a reason', () => {
  assert.equal(lookLock(null).open, false);
  assert.match(lookLock(null).why, /not reported/);
  assert.equal(lookLock({ rank: { index: 3 } }).open, false);
  assert.match(lookLock({ rank: { index: 3 } }).why, /Locked, not earned/);
  assert.equal(lookLock({ rank: { index: 4 } }).open, true);
  assert.equal(lookLock({ rank: { index: 9 } }).why, '');
});

test('without storage or a document the look still loads and applies without throwing', () => {
  assert.deepEqual(loadLook(), DEFAULT_LOOK);
  assert.deepEqual(applyLook({ theme: 'forge-and-brass' }), DEFAULT_LOOK);
});

import { effectiveLook, renderThemeSettings, renderThemeSettingsSafe, saveLook, syncLook } from '../js/cas-themes.js';
import { readFileSync } from 'node:fs';

const ALT = [
  { id: 'forge-and-brass', name: 'Forge and Brass', mode: 'game', ready: true, tagline: 'a' },
  { id: 'counting-house', name: 'Counting House', mode: 'professional', ready: true, tagline: 'b' },
];

class El {
  constructor(tag) { this.tag = tag; this.className = ''; this.children = []; this.listeners = {}; this.textContent = ''; this.disabled = false; this.id = ''; this.attrs = {}; this.type = ''; this.parent = null; }
  append(...c) { c.forEach(x => { x.parent = this; }); this.children.push(...c); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(c => c !== this); }
  setAttribute(k, v) { this.attrs[k] = v; }
  addEventListener(t, f) { (this.listeners[t] ||= []).push(f); }
  click() { if (!this.disabled) (this.listeners.click || []).forEach(f => f({})); }
  querySelector(sel) { const id = sel.replace('#', ''); let hit = null; const walk = e => { if (!hit && e.id === id) hit = e; e.children.forEach(walk); }; this.children.forEach(walk); return hit; }
}
const findAll = (root, pred, out = []) => { if (pred(root)) out.push(root); root.children.forEach(c => findAll(c, pred, out)); return out; };
const store = {};
function setup() {
  Object.keys(store).forEach(k => delete store[k]);
  globalThis.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
  globalThis.document = { createElement: t => new El(t), documentElement: { dataset: {} } };
  return new El('div');
}
const modeButtons = panel => findAll(panel.querySelector('#look-card'), e => /^look-mode( on)?$/.test(e.className));

test('the rank lock is real: a stored look is applied only at rank 4 or higher, else the default; the stored choice is kept', () => {
  const stored = { mode: 'professional', theme: 'counting-house' };
  assert.deepEqual(effectiveLook(stored, { rank: { index: 3 } }, ALT), DEFAULT_LOOK);
  assert.deepEqual(effectiveLook(stored, null, ALT), DEFAULT_LOOK);
  assert.deepEqual(effectiveLook(stored, { rank: { index: 4 } }, ALT), stored);
  setup();
  saveLook(stored, ALT);
  assert.equal(JSON.parse(store['station-look']).theme, 'counting-house');
  syncLook({ rank: { index: 3 } }, ALT);
  assert.equal(document.documentElement.dataset.theme, 'forge-and-brass');
  assert.equal(JSON.parse(store['station-look']).theme, 'counting-house', 'kept for later');
  syncLook({ rank: { index: 4 } }, ALT);
  assert.equal(document.documentElement.dataset.theme, 'counting-house');
});

test('the Look card renders locked (modes disabled, a reason shown) and unlocked (the other mode usable, no lock note)', () => {
  let panel = setup();
  renderThemeSettings(panel, () => ({ rank: { index: 3 } }), ALT);
  assert.ok(panel.querySelector('#look-card'));
  assert.equal(modeButtons(panel).every(b => b.disabled), true);
  assert.equal(findAll(panel, e => e.className === 'look-note' && /Locked, not earned/.test(e.textContent)).length, 1);
  panel = setup();
  renderThemeSettings(panel, () => ({ rank: { index: 4 } }), ALT);
  assert.deepEqual(modeButtons(panel).map(b => b.disabled), [true, false]);
  assert.equal(findAll(panel, e => e.className === 'look-note' && /Locked/.test(e.textContent)).length, 0);
});

test('tapping a mode saves and applies it and redraws the card; a locked card ignores the tap', () => {
  const panel = setup();
  renderThemeSettings(panel, () => ({ rank: { index: 4 } }), ALT);
  modeButtons(panel)[1].click();
  assert.equal(JSON.parse(store['station-look']).theme, 'counting-house');
  assert.equal(document.documentElement.dataset.mode, 'professional');
  assert.deepEqual(modeButtons(panel).map(b => b.className.includes(' on')), [false, true]);
  const locked = setup();
  renderThemeSettings(locked, () => ({ rank: { index: 3 } }), ALT);
  const btn = modeButtons(locked)[1];
  btn.disabled = false;
  btn.click();
  assert.equal(store['station-look'], undefined);
});

test('a throwing Look card never stops the rest of Settings: the safe call swallows it, and app.js uses only the safe call before the listeners', () => {
  assert.equal(renderThemeSettingsSafe(setup(), () => { throw new Error('boom'); }, ALT), false);
  assert.equal(renderThemeSettingsSafe(setup(), () => ({ rank: { index: 4 } }), ALT), true);
  const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
  assert.match(app, /renderThemeSettingsSafe\(panel, deskProgress\)/);
  assert.doesNotMatch(app, /[^e]renderThemeSettings\(panel/);
  assert.ok(app.indexOf('renderThemeSettingsSafe(panel') < app.indexOf("getElementById('reload-card')?.addEventListener"));
  assert.ok(app.indexOf("getElementById('unpair-btn')?.addEventListener") > 0);
});
