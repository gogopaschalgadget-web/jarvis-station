import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync, readdirSync } from 'node:fs';
import { MACHINES, TIERS, tierKey, stillFor, loopFor, pictureNow, watchMachines, startPicture } from '../js/cas-machines.js';

const DIR = 'assets/themes/forge-and-brass/machines/';
const size = f => statSync(new URL('../' + f, import.meta.url)).size;

test('the five desks map to their machines; a desk with no machine has no picture', () => {
  assert.deepEqual(MACHINES, { operations: 'forge', sales: 'press', marketing: 'tower', money: 'gauge', customer_experience: 'switch' });
  assert.equal(stillFor({ id: 'nothing', tier: 'Basic' }), '');
  assert.equal(stillFor(null), '');
  assert.equal(stillFor({ id: '__proto__' }), '');
  assert.equal(loopFor({ id: 'constructor', xp: 5 }), '');
});

test('tier words map to tier keys; unknown or missing is the first tier', () => {
  assert.deepEqual(TIERS, ['basic', 'enhanced', 'advanced', 'legendary']);
  assert.equal(tierKey('Enhanced'), 'enhanced');
  assert.equal(tierKey(' LEGENDARY '), 'legendary');
  for (const bad of [undefined, null, 5, '', 'platinum', {}]) assert.equal(tierKey(bad), 'basic');
});

test('the still is the machine at its current tier; a tier with no picture uses the nearest lower one', () => {
  assert.equal(stillFor({ id: 'operations', tier: 'Basic' }), DIR + 'forge-basic.webp');
  assert.equal(stillFor({ id: 'sales', tier: 'Enhanced' }), DIR + 'press-enhanced.webp');
  assert.equal(stillFor({ id: 'money', tier: 'Legendary' }), DIR + 'gauge-legendary.webp');
  assert.equal(stillFor({ id: 'marketing', tier: 'nonsense' }), DIR + 'tower-basic.webp');
  const gaps = { forge: { stills: ['basic', 'enhanced'], loop: true }, press: { stills: ['advanced'], loop: false } };
  assert.equal(stillFor({ id: 'operations', tier: 'Legendary' }, gaps), DIR + 'forge-enhanced.webp', 'nearest lower');
  assert.equal(stillFor({ id: 'operations', tier: 'Advanced' }, gaps), DIR + 'forge-enhanced.webp');
  assert.equal(stillFor({ id: 'sales', tier: 'Basic' }, gaps), '', 'nothing lower than the first picture: no picture rather than a higher tier');
  assert.equal(stillFor({ id: 'sales', tier: 'Legendary' }, gaps), DIR + 'press-advanced.webp');
});

test('the loop is only for a machine that is really running: it has earned XP and is not a placeholder', () => {
  assert.equal(loopFor({ id: 'operations', xp: 560 }), DIR + 'forge-loop.webp');
  assert.equal(loopFor({ id: 'operations', xp: 0 }), '');
  assert.equal(loopFor({ id: 'operations', xp: null }), '');
  assert.equal(loopFor({ id: 'customer_experience', xp: 300, placeholder: true }), '', 'a placeholder desk does not run');
  assert.equal(loopFor({ id: 'sales', xp: 10 }, { press: { stills: ['basic'], loop: false } }), '');
});

test('the picture now: the loop only on screen, visible, with motion allowed and not professional; else the still', () => {
  const d = { id: 'sales', tier: 'Enhanced', xp: 700 };
  const on = { visible: true, hidden: false, reduced: false, mode: 'game' };
  assert.equal(pictureNow(d, on), DIR + 'press-loop.webp');
  assert.equal(pictureNow(d, { ...on, visible: false }), DIR + 'press-enhanced.webp', 'off screen');
  assert.equal(pictureNow(d, { ...on, hidden: true }), DIR + 'press-enhanced.webp', 'page hidden');
  assert.equal(pictureNow(d, { ...on, reduced: true }), DIR + 'press-enhanced.webp', 'reduced motion');
  assert.equal(pictureNow(d, { ...on, mode: 'professional' }), DIR + 'press-enhanced.webp', 'professional mode');
  assert.equal(pictureNow({ ...d, xp: 0 }, on), DIR + 'press-enhanced.webp', 'not running');
});

function fakeImg(desk, tier, xp, placeholder = '0') {
  const attrs = { src: stillFor({ id: desk, tier }) };
  return { dataset: { still: attrs.src, desk, tier, xp: String(xp), placeholder }, getAttribute: k => attrs[k] ?? null, setAttribute: (k, v) => { attrs[k] = v; }, attrs };
}

test('watching: the loop is set when a picture scrolls into view and the still comes back when it leaves, when the page hides, and under reduced motion or professional mode', () => {
  const a = fakeImg('operations', 'Enhanced', 600), b = fakeImg('customer_experience', 'Basic', 0, '1');
  const root = { querySelectorAll: () => [a, b] };
  let cb = null; const observed = [];
  class IO { constructor(f, o) { cb = f; this.o = o; } observe(t) { observed.push(t); } disconnect() { observed.length = 0; } }
  let reduced = false; let mode = 'game';
  const listeners = {};
  const doc = { visibilityState: 'visible', documentElement: { dataset: {} }, addEventListener: (t, f) => { listeners[t] = f; }, removeEventListener: t => { delete listeners[t]; } };
  const win = { IntersectionObserver: IO, matchMedia: () => ({ get matches() { return reduced; } }) };
  const stop = watchMachines(root, { doc, win, mode: () => mode });
  assert.equal(observed.length, 2);
  assert.equal(a.attrs.src, DIR + 'forge-enhanced.webp', 'a still until it is on screen: no loop is fetched');
  cb([{ target: a, isIntersecting: true }, { target: b, isIntersecting: true }]);
  assert.equal(a.attrs.src, DIR + 'forge-loop.webp');
  assert.equal(b.attrs.src, DIR + 'switch-basic.webp', 'a placeholder desk never moves');
  cb([{ target: a, isIntersecting: false }]);
  assert.equal(a.attrs.src, DIR + 'forge-enhanced.webp');
  cb([{ target: a, isIntersecting: true }]);
  assert.equal(a.attrs.src, DIR + 'forge-loop.webp');
  doc.visibilityState = 'hidden'; listeners.visibilitychange();
  assert.equal(a.attrs.src, DIR + 'forge-enhanced.webp', 'hidden page');
  doc.visibilityState = 'visible'; listeners.visibilitychange();
  assert.equal(a.attrs.src, DIR + 'forge-loop.webp', 'back');
  reduced = true; cb([{ target: a, isIntersecting: true }]);
  assert.equal(a.attrs.src, DIR + 'forge-enhanced.webp', 'reduced motion');
  reduced = false; mode = 'professional'; cb([{ target: a, isIntersecting: true }]);
  assert.equal(a.attrs.src, DIR + 'forge-enhanced.webp', 'professional mode');
  stop();
  assert.equal(listeners.visibilitychange, undefined);
  assert.equal(watchMachines({ querySelectorAll: () => [] }, { doc, win })(), undefined, 'no pictures: nothing to watch');
  const noIO = fakeImg('sales', 'Basic', 5);
  watchMachines({ querySelectorAll: () => [noIO] }, { doc, win: { matchMedia: () => ({ matches: false }) } });
  assert.equal(noIO.attrs.src, DIR + 'press-basic.webp', 'without IntersectionObserver the picture stays a still');
});

test('every picture exists; each loop is under 250 KB, all five under 1.3 MB; none of it is precached; the service worker keeps them after first use', () => {
  const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  let loops = 0;
  for (const m of Object.values(MACHINES)) {
    const loop = DIR + m + '-loop.webp';
    assert.ok(existsSync(new URL('../' + loop, import.meta.url)), loop);
    assert.ok(size(loop) < 250 * 1024, loop + ' under 250 KB');
    loops += size(loop);
    for (const t of TIERS) {
      const f = DIR + m + '-' + t + '.webp';
      assert.ok(existsSync(new URL('../' + f, import.meta.url)) && size(f) < 30 * 1024, f);
    }
  }
  assert.ok(loops < 1.3 * 1024 * 1024, 'loops total ' + loops);
  assert.equal(readdirSync(new URL('../' + DIR, import.meta.url)).length, 25, '5 loops and 20 stills, nothing else');
  assert.ok(!sw.includes("'" + DIR), 'not in the precache list');
  assert.match(sw, /url\.pathname\.includes\('\/assets\/themes\/forge-and-brass\/machines\/'\)/);
  assert.match(sw, /event\.waitUntil\(cache\.put\(canonical, response\.clone\(\)\)\.catch\(\(\) => \{\}\)\)/, 'the write is waited for and can never become an unhandled rejection');
  assert.ok(sw.includes("'js/cas-machines.js'"));
});

test('the Desk draws a lazy picture in each desk card from the server progress, drops it if it fails, hides it in professional mode, and watches it only on the Bulletin Board', () => {
  const src = readFileSync(new URL('../js/cas-desk.js', import.meta.url), 'utf8');
  assert.match(src, /const still = stillFor\(d\);/);
  assert.match(src, /pic\.loading = 'lazy'/);
  assert.match(src, /pic\.addEventListener\('error', \(\) => \{ if \(pic\.getAttribute\('src'\) !== still\) \{ pic\.dataset\.failed = '1'; pic\.setAttribute\('src', still\); \} else pic\.remove\(\); \}\);/, 'a failed loop falls back to the still; only a failed still removes the picture');
  assert.match(src, /pic\.src = startPicture\(d\)/);
  assert.match(src, /try \{ _stopMachines = watchMachines\(wrap\); \} catch/);
  assert.match(src, /panel\.replaceChildren\(\);\s*\n\s*_stopMachines\(\);/);
  const css = readFileSync(new URL('../css/cas-desk.css', import.meta.url), 'utf8');
  assert.match(css, /html\[data-mode="professional"\] \.bb-machine \{ display: none; \}/);
});

test('a redraw starts a running machine on its loop instead of flashing the still; a change of the reduced-motion setting stops a playing loop', () => {
  const d = { id: 'money', tier: 'Legendary', xp: 5200 };
  assert.equal(startPicture(d), DIR + 'gauge-legendary.webp', 'nothing was playing yet');
  const img = fakeImg('money', 'Legendary', 5200);
  const root = { querySelectorAll: () => [img] };
  let cb = null;
  class IO { constructor(f) { cb = f; } observe() {} disconnect() {} }
  const handlers = {};
  let reduced = false;
  const mq = { get matches() { return reduced; }, addEventListener: (t, f) => { handlers[t] = f; }, removeEventListener: t => { delete handlers[t]; } };
  const doc = { visibilityState: 'visible', documentElement: { dataset: {} }, addEventListener() {}, removeEventListener() {} };
  const stop = watchMachines(root, { doc, win: { IntersectionObserver: IO, matchMedia: () => mq }, mode: () => 'game' });
  cb([{ target: img, isIntersecting: true }]);
  assert.equal(img.attrs.src, DIR + 'gauge-loop.webp');
  assert.equal(startPicture(d), DIR + 'gauge-loop.webp', 'the next draw starts on the loop');
  reduced = true; handlers.change();
  assert.equal(img.attrs.src, DIR + 'gauge-legendary.webp', 'switching on reduced motion stops it at once');
  assert.equal(startPicture(d), DIR + 'gauge-legendary.webp');
  stop();
  assert.equal(handlers.change, undefined, 'the listener is removed');
  assert.equal(startPicture({ id: 'customer_experience', tier: 'Basic', xp: 0, placeholder: true }), DIR + 'switch-basic.webp');
});

test('a loop that failed to load is not requested again on every scroll or refocus', () => {
  const img = fakeImg('operations', 'Advanced', 900);
  let cb = null;
  class IO { constructor(f) { cb = f; } observe() {} disconnect() {} }
  const doc = { visibilityState: 'visible', documentElement: { dataset: {} }, addEventListener() {}, removeEventListener() {} };
  watchMachines({ querySelectorAll: () => [img] }, { doc, win: { IntersectionObserver: IO, matchMedia: () => ({ matches: false }) }, mode: () => 'game' });
  cb([{ target: img, isIntersecting: true }]);
  assert.equal(img.attrs.src, DIR + 'forge-loop.webp');
  img.dataset.failed = '1'; img.setAttribute('src', DIR + 'forge-advanced.webp');
  cb([{ target: img, isIntersecting: false }]); cb([{ target: img, isIntersecting: true }]);
  assert.equal(img.attrs.src, DIR + 'forge-advanced.webp', 'stays on the still');
});
