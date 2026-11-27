import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../css/storyboard.css', import.meta.url), 'utf8');
const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const idx = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

const lum = hex => {
  const h = hex.slice(1);
  const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

const card = css.match(/\.panel-card,\.more-nav-btn \{ background:linear-gradient\(110deg,(#[0-9a-f]{6}),(#[0-9a-f]{6})\)/);
const inks = css.match(/\.panel-card,\.more-nav-btn \{ (--accent-gold[^}]*)\}/);

test('the accent colours inside a parchment card read at 4.5 to 1 on both ends of the parchment (Reset Map View, Force Refresh, Unpair, key and status colours)', () => {
  assert.ok(card && inks, 'found the card rule and the ink rule');
  const vars = Object.fromEntries([...inks[1].matchAll(/--accent-(\w+):(#[0-9a-f]{6})/g)].map(m => [m[1], m[2]]));
  assert.deepEqual(Object.keys(vars).sort(), ['cyan', 'gold', 'green', 'red', 'yellow']);
  for (const [name, ink] of Object.entries(vars)) {
    for (const end of [card[1], card[2]]) assert.ok(ratio(ink, end) >= 4.5, `${name} ${ink} on ${end} is ${ratio(ink, end).toFixed(2)}`);
  }
});

test('the Settings buttons take their colour from those accents, and the new stylesheet version is asked for', () => {
  for (const [label, v] of [['Force Refresh', 'accent-cyan'], ['Reset Map View', 'accent-gold'], ['Unpair Device', 'accent-red']]) {
    assert.ok(app.includes('style="color:var(--' + v) && app.includes('>' + label + '</div>'), label + ' is coloured by --' + v);
    const at = app.indexOf('>' + label + '</div>');
    assert.ok(app.slice(app.lastIndexOf('style="', at), at).startsWith('style="color:var(--' + v), label + ' carries its own colour');
  }
  assert.match(idx, /css\/storyboard\.css\?v=3/);
});
