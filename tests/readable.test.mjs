import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');

const lum = hex => {
  let h = hex.slice(1); if (h.length === 3) h = [...h].map(c => c + c).join('');
  const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

/** The boxes on the More screens (not the pairing card at the top of the file) that paint a dark background: each must set its own colour. Every inline style in app.js that paints a background must also set its own text colour (the cards around it set dark ink on parchment), and the pair must read at 4.5 to 1. */
test('every inline-painted box sets a text colour that reads on its own background', () => {
  const bad = [];
  let n = 0;
  for (const m of app.matchAll(/style="([^"]*?)"/g)) {
    const st = m[1];
    const bg = st.match(/(?:^|;)\s*background(?:-color)?:\s*(#[0-9a-f]{3,6})\b/i);
    if (!bg) continue;
    n++;
    if (app.slice(0, m.index).split('\n').length < 300) continue;   // the pairing screen is not part of this change
    const fg = st.match(/(?:^|;)\s*color:\s*(#[0-9a-f]{3,6})\b/i);
    const line = app.slice(0, m.index).split('\n').length;
    if (!fg) { bad.push(`line ${line}: background ${bg[1]} with no colour`); continue; }
    const r = ratio(bg[1], fg[1]);
    if (r < 4.5) bad.push(`line ${line}: ${fg[1]} on ${bg[1]} is ${r.toFixed(2)}`);
  }
  assert.ok(n > 20, 'found the painted boxes');
  assert.deepEqual(bad, []);
});

test('the generated reply box and the example box read light on dark', () => {
  for (const key of ['max-height:300px', 'max-height:50vh']) {
    const i = app.indexOf(key);
    const st = app.slice(app.lastIndexOf('style="', i), i);
    assert.match(st, /background:#0a0e14;color:#e6edf3/);
  }
  assert.ok(ratio('#0a0e14', '#e6edf3') > 12);
});

test('a tracker preview is shown whole, not cut by the Station', () => {
  assert.match(app, /xEl\('div', text, 'background:#0a0e14/);
  assert.doesNotMatch(app, /text\.slice\(0, 140\)/);
});
