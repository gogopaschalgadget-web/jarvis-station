import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderThemeSettings } from '../js/cas-themes.js';

const idx = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const src = n => readFileSync(new URL('../js/' + n, import.meta.url), 'utf8');

test('Settings: every Cas appearance control has a plain direction beside it, named exactly as the button is', () => {
  const buttons = [...idx.matchAll(/<button type="button" id="(cas-(?:appearance-btn|appearance-reset|motion-btn|rotate-btn))"[^>]*>([^<]*)<\/button>/g)].map(m => [m[1], m[2]]);
  assert.deepEqual(buttons.map(b => b[0]), ['cas-appearance-btn', 'cas-appearance-reset', 'cas-motion-btn', 'cas-rotate-btn']);
  const help = idx.match(/<ul class="how-list" id="cas-pref-help">([\s\S]*?)<\/ul>/);
  assert.ok(help, 'the directions are there');
  const items = [...help[1].matchAll(/<li><b>([^<]*)<\/b> ([^<]*)<\/li>/g)].map(m => [m[1], m[2]]);
  assert.equal(items.length, 4);
  for (const [, label] of buttons) assert.ok(items.some(([name]) => name.split(' / ').some(n => label.startsWith(n.split(':')[0].trim()))), label + ' has a direction');
  for (const [, text] of items) assert.ok(text.length > 30 && text.length < 220, 'one or two lines: ' + text.length);
  // the directions describe what the code really does
  const app = src('app.js');
  assert.ok(app.includes("'Play scene'") && app.includes("'Pause scene'"), 'the pause button has both names the directions use');
  assert.ok(src('cas-threads.js').includes("'Scenes: keep one'") && src('cas-threads.js').includes("'Scenes: rotate'"));
  assert.ok(app.includes("file.size > 8 * 1024 * 1024") && app.includes("'image/png', 'image/jpeg', 'image/webp'"), 'the picture limits quoted are the real ones');
  assert.match(help[1], /8 MB/);
});

test('Settings: the Look card says what it is, what Game and Professional do and when it opens, and the Background scenes card explains a night, Pin and Ban', async () => {
  class El {
    constructor(tag) { this.tag = tag; this.className = ''; this.children = []; this.listeners = {}; this.textContent = ''; this.id = ''; this.attrs = {}; this.parent = null; }
    append(...c) { c.forEach(x => { x.parent = this; }); this.children.push(...c); }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(c => c !== this); }
    setAttribute(k, v) { this.attrs[k] = v; }
    addEventListener() {}
    querySelector() { return null; }
  }
  globalThis.localStorage = { getItem: () => null, setItem() {} };
  globalThis.document = { createElement: t => new El(t), documentElement: { dataset: {} }, getElementById: () => null };
  const panel = new El('div');
  renderThemeSettings(panel, () => ({ rank: { index: 4 } }));
  const all = (n, out = []) => { out.push(n); n.children.forEach(c => all(c, out)); return out; };
  const help = all(panel).filter(n => n.className === 'look-help').map(n => n.textContent);
  assert.equal(help.length, 2);
  assert.match(help[0], /Technician/);
  assert.match(help[1], /Game/);
  assert.match(help[1], /Professional/);
  // true to the code: the lock opens at Technician (index 4) and Professional is the plainer theme
  const { TECHNICIAN_INDEX } = await import('../js/cas-themes.js');
  assert.equal(TECHNICIAN_INDEX, 4);
  const scenes = src('cas-scenes.js');
  assert.ok(scenes.includes("'st-scenes-help'") && /\[0, 2, 4, 6, 8, 10, 12\]/.test(scenes) && scenes.includes("'Pin'") && scenes.includes("'Ban'") && scenes.includes('Banned ('), 'the controls it explains exist');
  assert.match(scenes, /40-picture limit/);
});

test('the directions read on the parchment (the card ink, 4.5 to 1 or better) and the stylesheet version is asked for', () => {
  const css = readFileSync(new URL('../css/cas-desk.css', import.meta.url), 'utf8');
  assert.match(css, /\.how-list li \{[^}]*color: #2b1a0b/);
  assert.match(css, /#look-card \.look-help, \.st-scenes-help \{[^}]*color: #2b1a0b/);
  assert.match(idx, /css\/cas-desk\.css\?v=25/);
});
