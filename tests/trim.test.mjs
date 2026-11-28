import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { TRIMS, FX_KINDS, trimFor, fxWanted, applyTrim, buildFx, dimFor, fadeFor } from '../js/cas-trim.js';

const css = readFileSync(new URL('../css/station-theme.css', import.meta.url), 'utf8');
const trimCss = css.slice(css.indexOf('/* Monthly trim:'));
const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');

function fakeDoc(mode) {
  const kids = [];
  const nav = { append: c => kids.push(c) };
  const style = {};
  const root = { dataset: mode ? { mode } : {}, style: { setProperty: (k, v) => { style[k] = v; }, removeProperty: k => { delete style[k]; } } };
  const mk = tag => ({ tag, id: '', className: '', dataset: {}, attrs: {}, kids: [], style: { vars: {}, setProperty(k, v) { this.vars[k] = v; } }, setAttribute(k, v) { this.attrs[k] = v; }, append(c) { this.kids.push(c); }, remove() { const i = kids.indexOf(this); if (i >= 0) kids.splice(i, 1); } });
  return { kids, style, root, doc: {
    documentElement: root, baseURI: 'https://station.test/app/',
    querySelector: sel => (sel === '.station-nav' ? nav : null),
    getElementById: id => kids.find(k => k.id === id) || null,
    createElement: mk,
  } };
}
const classes = layer => layer.kids.map(k => k.className);

test('a month picks its strip; a month with no entry, or a bad month, falls back to the plain trim', () => {
  assert.equal(trimFor(12).file, TRIMS[12].file);
  assert.equal(trimFor(11).file, TRIMS[11].file);
  assert.equal(trimFor(1), null);
  for (const bad of [0, 13, NaN, '12', undefined, 1.5, -1]) assert.equal(trimFor(bad), null);
  assert.equal(trimFor(7, { 7: { file: 'x.jpg' } }).file, 'x.jpg', 'adding a month is one line in the table');
  assert.equal(trimFor('constructor', {}), null);
});

test('every file in the table exists in the repo, strips under 100 KB, sprites and glows under 150 KB, all in the offline precache; the toast is gone', () => {
  const size = f => statSync(new URL('../' + f, import.meta.url)).size;
  const files = [];
  Object.values(TRIMS).forEach(t => {
    assert.ok(existsSync(new URL('../' + t.file, import.meta.url)), t.file);
    assert.ok(size(t.file) < 100 * 1024, t.file + ' stays under 100 KB');
    assert.ok(sw.includes(`'${t.file}'`), t.file + ' is precached');
    files.push(t.file);
    for (const sp of (t.fx && t.fx.sprites) || []) {
      assert.ok(existsSync(new URL('../' + sp.file, import.meta.url)) && size(sp.file) < 150 * 1024, sp.file);
      assert.ok(sw.includes(`'${sp.file}'`), sp.file + ' is precached');
      files.push(sp.file);
    }
  });
  for (const g of ['glow-flame.png', 'glow-lamp.png']) {
    const f = 'assets/themes/forge-and-brass/trim/november/' + g;
    assert.ok(existsSync(new URL('../' + f, import.meta.url)) && size(f) < 20 * 1024 && sw.includes(`'${f}'`) && trimCss.includes(g), g);
    files.push(f);
  }
  assert.ok(existsSync(new URL('../assets/theme/sleigh.png', import.meta.url)));
  assert.ok(sw.includes("'assets/theme/sleigh.png'"));
  files.push('assets/theme/sleigh.png');
  assert.ok(files.reduce((n, f) => n + size(f), 0) < 450 * 1024, 'all trim pictures together stay small');
  assert.ok(!/toast|cheers/i.test(sw + trimCss + readFileSync(new URL('../js/cas-trim.js', import.meta.url), 'utf8')), 'nothing of the toast stays in the build');
  assert.ok(!existsSync(new URL('../assets/themes/forge-and-brass/trim/november/the-toast.jpg', import.meta.url)));
});

test('effects play only in a month that lists some, in game mode, without reduced motion; a month can carry several at once', () => {
  assert.ok(fxWanted({ month: 12, mode: 'game', reduced: false }).sleigh);
  const nov = fxWanted({ month: 11, mode: 'game', reduced: false });
  assert.ok(nov.lights.length === 8 && nov.shadows.length === 3 && nov.sprites.length === 3, 'November carries lights, shadows and three servers together');
  assert.ok(fxWanted({ month: 11, mode: 'professional', reduced: false }), 'the stylesheet hides it');
  assert.equal(fxWanted({ month: 11, mode: 'game', reduced: true }), null);
  assert.equal(fxWanted({ month: 12, mode: 'game', reduced: true }), null);
  assert.ok(fxWanted({ month: 12, mode: undefined, reduced: false }));
  assert.equal(fxWanted({ month: 6, mode: 'game', reduced: false }), null);
  assert.equal(fxWanted({ month: 11, mode: 'game', reduced: false }, { 11: { file: 'n.jpg' } }), null, 'a strip with no effects');
  assert.equal(fxWanted({ month: 11, mode: 'game', reduced: false }, { 11: { file: 'n.jpg', fx: { confetti: true, lights: [] } } }), null, 'an unknown kind or an empty list draws nothing');
  assert.deepEqual(FX_KINDS, ['lights', 'shadows', 'sprites', 'sleigh']);
});

test('the overlay values: November 0.2, December 0.45 with a 0.6 fade under the labels; only a number from above 0 to 1 counts', () => {
  assert.equal(dimFor(trimFor(11)), 0.2);
  assert.equal(dimFor(trimFor(12)), 0.45);
  assert.equal(fadeFor(trimFor(12)), 0.6);
  assert.equal(fadeFor(trimFor(11)), 0);
  for (const bad of [null, {}, { dim: 0 }, { dim: -1 }, { dim: 2 }, { dim: '0.4' }]) assert.equal(dimFor(bad), 0);
  for (const bad of [null, {}, { fade: 0 }, { fade: 1.5 }, { fade: '1' }]) assert.equal(fadeFor(bad), 0);
});

test('November draws a glow per light, the shadows and both servers; December draws the sleigh; switching month swaps the layer; twice adds one', () => {
  const d = fakeDoc();
  const r = applyTrim(new Date(2026, 10, 20), d.doc);
  assert.equal(r.fx, '11');
  assert.equal(d.kids.length, 1);
  const c = classes(d.kids[0]);
  assert.equal(c.filter(x => x === 'fx-light flame').length, 6);
  assert.equal(c.filter(x => x === 'fx-light lamp').length, 2);
  assert.equal(c.filter(x => x === 'fx-shadow').length, 3);
  assert.equal(c.filter(x => x === 'fx-sprite').length, 3);
  assert.equal(d.kids[0].attrs['aria-hidden'], 'true');
  assert.equal(d.style['--trim-fade'], '0');
  applyTrim(new Date(2026, 10, 21), d.doc);
  assert.equal(d.kids.length, 1, 'applying twice adds one layer');
  applyTrim(new Date(2026, 11, 20), d.doc);
  assert.equal(d.kids.length, 1, 'one layer at a time');
  assert.deepEqual(classes(d.kids[0]), ['fx-sleigh']);
  assert.equal(d.kids[0].kids[0].kids[0].className, 'fx-bob');
  assert.equal(d.style['--trim-fade'], '0.6');
  applyTrim(new Date(2026, 5, 20), d.doc);
  assert.equal(d.kids.length, 0, 'a month with no effects removes the layer');
  assert.equal(d.style['--trim-url'], undefined);
  assert.equal(d.style['--trim-fade'], undefined);
});

test('December applies the strip URL; professional mode keeps the strip and the layer, which the stylesheet hides (so switching to game mode needs no redraw)', () => {
  const dec = fakeDoc();
  applyTrim(new Date(2026, 11, 5), dec.doc);
  assert.match(dec.style['--trim-url'], /^url\("https:\/\/station\.test\/app\/assets\/themes\/forge-and-brass\/trim\/december\/frost-on-iron\.jpg"\)$/);
  assert.equal(dec.style['--trim-dim'], '0.45');
  const pro = fakeDoc('professional');
  const r = applyTrim(new Date(2026, 10, 5), pro.doc);
  assert.equal(r.fx, '11');
  assert.equal(pro.kids.length, 1);
  assert.match(pro.style['--trim-url'], /black-iron-hall\.jpg/);
});

test('lights and shadows: every value is range checked; the table follows the Round 5 art manifest (2 lamps and 6 flames, glow boxes in percent, flames faster than lamps)', () => {
  const d = fakeDoc();
  const out = buildFx(d.doc, { lights: [{ kind: 'lamp', x: 10, y: 20, w: 8, h: 40, t: 9, lo: 0.7, hi: 1 }, { kind: 'x', x: 'bad', y: 500, w: -3, h: 0, t: 0, lo: 2, hi: -1 }], shadows: [{ x: 0, y: 5, w: 20, h: 95, t: 9, d: 0 }, { t: 1 }] }, 'https://s.test/');
  assert.equal(out.length, 4);
  assert.equal(out[0].className, 'fx-light lamp');
  assert.deepEqual(out[0].style.vars, { '--x': '10%', '--y': '20%', '--w': '8%', '--h': '40%', '--t': '9s', '--lo': '0.7', '--span': '0.3' });
  assert.equal(out[1].className, 'fx-light flame', 'an unknown kind is a flame');
  assert.deepEqual(out[1].style.vars, { '--x': '0%', '--y': '0%', '--w': '10%', '--h': '30%', '--t': '3s', '--lo': '0.5', '--span': '0.5' }, 'bad values fall back');
  assert.equal(out[3].style.vars['--t'], '9s');
  const lights = TRIMS[11].fx.lights;
  const flames = lights.filter(l => l.kind === 'flame'), lamps = lights.filter(l => l.kind === 'lamp');
  assert.ok(flames.every(f => f.t <= 4) && lamps.every(l => l.t >= 8), 'flames flicker fast, lamps slowly');
  assert.ok(new Set(flames.map(f => f.t)).size === flames.length, 'no two flames share a rhythm');
  assert.ok(flames.every(f => f.lo === 0.35 && f.hi === 1) && lamps.every(l => l.lo === 0.7 && l.hi === 1), 'ranges from the art manifest');
  assert.deepEqual(TRIMS[11].fx.shadows.map(s => [s.x, s.w]), [[0, 20], [80, 20], [38, 24]], 'the three wall zones from the manifest');
  assert.equal(lamps.length, 2);
  assert.equal(flames.length, 6);
});

test('sprites: a one-row sheet plays once every 15 to 25 seconds; bad entries draw nothing; the three servers never play at the same moment', () => {
  const d = fakeDoc();
  const entry = { file: 'a.webp', x: 10, y: 20, w: 12, h: 50, frames: 8, every: 17, delay: 3 };
  const out = buildFx(d.doc, { sprites: [entry, { ...entry, every: 23, x: 60 }, { file: 'b.webp', frames: 1 }, { frames: 6 }] }, 'https://s.test/app/');
  assert.equal(out.length, 2, 'the entry without a valid frame count or file is skipped');
  assert.equal(out[0].className, 'fx-sprite');
  assert.equal(out[0].style.vars['--every'], '17s');
  assert.equal(out[0].style.vars['--delay'], '3s');
  assert.equal(out[1].style.vars['--every'], '23s');
  assert.equal(out[0].style.vars['--s'], '7', 'steps between 8 frames');
  assert.equal(out[0].style.vars['--end'], '-87.5000%');
  assert.equal(out[0].kids[0].style.vars['--wide'], '800%');
  assert.equal(out[0].kids[0].style.vars['--sheet'], 'url("https://s.test/app/a.webp")');
  assert.equal(buildFx(d.doc, { sprites: [{ ...entry, every: 3, delay: 99 }] }, 'https://s.test/')[0].style.vars['--every'], '20s', 'a period outside 15 to 25 falls back');
  assert.equal(buildFx(d.doc, { sprites: [{ ...entry, delay: 99 }] }, 'https://s.test/')[0].style.vars['--delay'], '0s');
  const sp = TRIMS[11].fx.sprites;
  assert.deepEqual(sp.map(x => x.file.split('/').pop()), ['serve-roast-row.webp', 'set-plate-row.webp', 'pour-drink-row.webp']);
  assert.ok(sp.every(x => x.frames === 24));
  const plays = x => Array.from({ length: 40 }, (_, k) => [x.delay + k * x.every, x.delay + k * x.every + x.every / 10]);
  for (let i = 0; i < sp.length; i++) for (let j = i + 1; j < sp.length; j++) {
    for (const [s1, e1] of plays(sp[i])) for (const [s2, e2] of plays(sp[j])) assert.ok(e1 <= s2 || e2 <= s1, `plays of ${i} and ${j} never overlap`);
  }
  assert.ok(sp.every(x => x.every >= 15 && x.every <= 25 && x.every / 10 === 2), 'each play is the 2 seconds the art was made for');
  assert.deepEqual(sp.map(x => [x.x, x.y, x.w, x.h]), [[41.67, 34.72, 9.67, 52.08], [48.36, 41.67, 10.42, 55.56], [73.29, 17.36, 7.81, 74.65]], 'boxes from the Round 5 manifest');
  const box = x => [x.x, x.x + x.w];
  const overlap = (p, q) => box(p)[0] < box(q)[1] && box(q)[0] < box(p)[1];
  assert.ok(overlap(sp[0], sp[1]) && !overlap(sp[0], sp[2]) && !overlap(sp[1], sp[2]), 'the serve and the set-plate boxes overlap on the strip, which is why they are scheduled apart');
});

test('the stylesheet: no taps, behind the labels, only opacity and transform move, nothing in professional mode, reduced motion or on the rail, paused when hidden', () => {
  assert.match(trimCss, /\.trim-fx\s*\{[^}]*pointer-events:\s*none[^}]*z-index:\s*-1/);
  assert.match(trimCss, /\.trim-fx i\s*\{[^}]*pointer-events:\s*none/);
  assert.match(trimCss, /html\[data-hidden="1"\] \.trim-fx i[^{]*\{\s*animation-play-state:\s*paused/);
  assert.match(trimCss, /html\[data-mode="professional"\] \.trim-fx\s*\{\s*display:\s*none/);
  assert.match(trimCss, /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.trim-fx\s*\{\s*display:\s*none/);
  assert.match(trimCss, /@media \(min-width: 960px\)\s*\{\s*\.trim-fx\s*\{\s*display:\s*none/);
  assert.doesNotMatch(trimCss, /\.station-nav/, 'the bar itself is never restyled, so its height cannot change');
  const kf = [...trimCss.matchAll(/@keyframes [\w-]+ \{((?:[^{}]|\{[^{}]*\})*)\}/g)].map(m => m[1]);
  assert.equal(kf.length, 7, 'flick, shadow, sprite show and play, fly x and y, bob');
  for (const body of kf) {
    const props = new Set([...body.matchAll(/([a-z-]+):\s*[^;]+;/g)].map(m => m[1]));
    for (const p of props) assert.ok(p === 'opacity' || p === 'transform', `keyframes animate only opacity and transform, not ${p}`);
  }
});

test('flicker is irregular and never brighter than the gain allows; shadows are slow and faint; the sleigh has three paths with easing, a bob and a tilt', () => {
  const flick = trimCss.match(/@keyframes trim-flick \{([\s\S]*?)\n\}/)[1];
  const mult = [...flick.matchAll(/--span\) \* (\.?\d+(?:\.\d+)?)\)/g)].map(m => +m[1]);
  assert.ok(mult.length >= 9 && Math.max(...mult) <= 1 && Math.min(...mult) >= 0, 'a pattern of at least 8 steps within lo to hi');
  const steps = mult.slice(1).map((v, i) => Math.sign(v - mult[i]));
  assert.ok(steps.some((s, i) => i && s !== steps[i - 1]) && new Set(mult).size >= 7, 'it rises and falls unevenly, not a smooth ramp');
  assert.match(trimCss, /\.fx-light\.flame \{[^}]*--gain: \.75/);
  assert.match(trimCss, /\.fx-light\.lamp \{[^}]*--gain: \.85/);
  assert.doesNotMatch(trimCss, /mix-blend-mode/, 'no blend mode: inside the layer it blends with nothing and only costs');
  const sh = trimCss.match(/@keyframes trim-shadow \{([\s\S]*?)\n\}/)[1];
  assert.ok(Math.max(...[...sh.matchAll(/opacity:\s*([\d.]+)/g)].map(m => +m[1])) <= 0.22, 'shadows stay at 0.22 or less');
  assert.match(trimCss, /\.fx-shadow \{[^}]*animation: trim-shadow var\(--t\) ease-in-out var\(--d\) infinite alternate/);
  const y = trimCss.match(/@keyframes trim-fly-y \{([\s\S]*?)\n\}/)[1];
  assert.ok(/rotate\(-?\d+deg\)/.test(y), 'tilt');
  const ys = new Set([...y.matchAll(/translate3d\(0, calc\((-?\d+)px/g)].map(m => m[1]));
  assert.ok(ys.size >= 7, 'a swoop, a dive and a long arc use different heights');
  assert.match(trimCss, /\.fx-sleigh\s*\{[^}]*animation:\s*trim-fly-x 45s cubic-bezier/);
  assert.match(trimCss, /html\.ios-short \.trim-fx\s*\{\s*--k:/, 'shallower flight on the short bar');
  assert.match(trimCss, /\.fx-bob\s*\{[^}]*animation:\s*trim-fly-y 45s cubic-bezier/);
  assert.match(trimCss, /trim-bob 1\.3s ease-in-out infinite alternate/);
  assert.match(trimCss, /@keyframes trim-sprite-play \{ 0% \{ transform: translateX\(0\); \} 9\.5% \{ transform: translateX\(var\(--end\)\); \}/, 'the last frame, equal to the strip, shows before the sprite hides');
  assert.match(trimCss, /\.fx-sprite::after \{[^}]*rgb\(0 0 0 \/ var\(--trim-dim, 0\)\)[^}]*#00000018, #00000050/, 'a sprite carries the same dark layers as the bar, so there is no seam');
  assert.match(trimCss, /html\.ios-short \.fx-sprite::after \{[^}]*#3a281200 52%/, 'and the grain fade on the short bar');
});

test('the layer is put back after the bar is drawn (the bar redraw would wipe it)', () => {
  const src = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
  const i = src.indexOf('nav.innerHTML');
  assert.ok(i > 0 && /applyTrim\(\)/.test(src.slice(i, i + 3000)), 'applyTrim runs after the nav redraw');
});

test('sw.js and the module tags are bumped for this change', () => {
  assert.match(sw, /const VERSION = 'jarvis-cas-v120'/);
  assert.ok(sw.includes("'js/cas-trim.js'"));
});
