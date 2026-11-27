import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const station = readFileSync(new URL('../css/station.css', import.meta.url), 'utf8');
const desk = readFileSync(new URL('../css/cas-desk.css', import.meta.url), 'utf8');
const story = readFileSync(new URL('../css/storyboard.css', import.meta.url), 'utf8');

const lum = hex => {
  const h = hex.slice(1);
  const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const esc = t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const rule = (css, sel) => { const m = css.match(new RegExp(esc(sel) + ' \{([^}]*)\}')); assert.ok(m, sel + ' exists'); return m[1]; };

test('status dots: alive and stale differ by shape and mark as well as colour, and no longer come from the dark card inks (which made them 1.05 to 1)', () => {
  const alive = rule(station, '.svc-dot.alive').match(/background:\s*(#[0-9a-f]{6})/)[1];
  const stale = rule(station, '.svc-dot.stale').match(/background:\s*(#[0-9a-f]{6})/)[1];
  assert.ok(ratio(alive, stale) >= 3, 'the two fills are clearly different in lightness: ' + ratio(alive, stale).toFixed(2));
  const aliveInk = rule(station, '.svc-dot.alive').match(/color:\s*(#[0-9a-f]{6})/)[1];
  assert.ok(ratio(aliveInk, alive) >= 4.5 && ratio('#ffffff', stale) >= 4.5, 'the mark inside reads on both');
  assert.match(rule(station, '.svc-dot.alive::after'), /content:\s*"\\2713"/);
  assert.match(rule(station, '.svc-dot.stale::after'), /content:\s*"\\2715"/);
  assert.match(rule(station, '.svc-dot.stale'), /border-radius:\s*3px/, 'a square one against a round one');
  // the old failure: the dark ink pair that the parchment cards set
  const inks = story.match(/--accent-red:(#[0-9a-f]{6}); --accent-green:(#[0-9a-f]{6})/);
  assert.ok(ratio(inks[1], inks[2]) < 1.5, 'the card inks really are too close to tell apart as dots');
});

test('flags carry a mark too: tick for good, bang for a warning, cross for a fault', () => {
  const marks = ['ok', 'warn', 'error'].map(k => rule(station, `.flag-${k}::before`).match(/content:\s*"([^"]+)"/)[1]);
  assert.equal(new Set(marks).size, 3);
});

test('the reveal card scrolls when it is taller than the screen (landscape, keyboard open) and keeps its close button reachable', () => {
  const o = rule(desk, '.rv-overlay');
  assert.match(o, /overflow-y:\s*auto/);
  assert.doesNotMatch(o, /align-items:\s*center/, 'centring with align-items would cut off the top of a tall card');
  assert.match(rule(desk, '.rv-card'), /margin:\s*auto/, 'margin auto centres a short card and lets a tall one scroll from its top');
  assert.match(o, /z-index:\s*500/);
});
