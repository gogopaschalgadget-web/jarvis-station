import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { TRIMS, FX_KINDS, trimFor, fxWanted, applyTrim, buildFx, dimFor } from '../js/cas-trim.js';

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

test('every strip in the table exists in the repo, is under 100 KB and is in the offline precache; the toast is gone', () => {
  Object.values(TRIMS).forEach(t => {
    assert.ok(existsSync(new URL('../' + t.file, import.meta.url)), t.file);
    assert.ok(statSync(new URL('../' + t.file, import.meta.url)).size < 100 * 1024, t.file + ' stays under 100 KB');
    assert.ok(sw.includes(`'${t.file}'`), t.file + ' is precached');
  });
  assert.ok(existsSync(new URL('../assets/theme/sleigh.png', import.meta.url)));
  assert.ok(sw.includes("'assets/theme/sleigh.png'"));
  assert.ok(!/toast|cheers/i.test(sw + trimCss + readFileSync(new URL('../js/cas-trim.js', import.meta.url), 'utf8')), 'nothing of the toast stays in the build');
  assert.ok(!existsSync(new URL('../assets/themes/forge-and-brass/trim/november/the-toast.jpg', import.meta.url)));
});

test('effects play only in a month that lists some, in game mode, without reduced motion; a month can carry several at once', () => {
  assert.ok(fxWanted({ month: 12, mode: 'game', reduced: false }).sleigh);
  const nov = fxWanted({ month: 11, mode: 'game', reduced: false });
  assert.ok(nov.flames.length >= 3 && nov.shadow === true, 'November carries flames and shadows together');
  assert.equal(fxWanted({ month: 11, mode: 'professional', reduced: false }), null);
  assert.equal(fxWanted({ month: 11, mode: 'game', reduced: true }), null);
  assert.equal(fxWanted({ month: 12, mode: 'professional', reduced: false }), null);
  assert.equal(fxWanted({ month: 12, mode: 'game', reduced: true }), null);
  assert.ok(fxWanted({ month: 12, mode: undefined, reduced: false }));
  assert.equal(fxWanted({ month: 6, mode: 'game', reduced: false }), null);
  assert.equal(fxWanted({ month: 11, mode: 'game', reduced: false }, { 11: { file: 'n.jpg' } }), null, 'a strip with no effects');
  assert.equal(fxWanted({ month: 11, mode: 'game', reduced: false }, { 11: { file: 'n.jpg', fx: { confetti: true, flames: [] } } }), null, 'an unknown kind or an empty list draws nothing');
  assert.deepEqual(FX_KINDS, ['flames', 'shadow', 'sprites', 'sleigh']);
});

test('the overlay value: November 0.12 and December 0.15, only a number from above 0 to 1 counts', () => {
  assert.equal(dimFor(trimFor(11)), 0.12);
  assert.equal(dimFor(trimFor(12)), 0.15);
  for (const bad of [null, {}, { dim: 0 }, { dim: -1 }, { dim: 2 }, { dim: '0.4' }]) assert.equal(dimFor(bad), 0);
});

test('November draws one glow per flame and the shadow layer; December draws the sleigh; switching month swaps the layer; twice adds one', () => {
  const d = fakeDoc();
  const r = applyTrim(new Date(2026, 10, 20), d.doc);
  assert.equal(r.fx, '11');
  assert.equal(d.kids.length, 1);
  const c = classes(d.kids[0]);
  assert.equal(c.filter(x => x === 'fx-flame').length, TRIMS[11].fx.flames.length);
  assert.equal(c.filter(x => x === 'fx-shadow').length, 1);
  assert.equal(d.kids[0].attrs['aria-hidden'], 'true');
  applyTrim(new Date(2026, 10, 21), d.doc);
  assert.equal(d.kids.length, 1, 'applying twice adds one layer');
  applyTrim(new Date(2026, 11, 20), d.doc);
  assert.equal(d.kids.length, 1, 'one layer at a time');
  assert.deepEqual(classes(d.kids[0]), ['fx-sleigh']);
  assert.equal(d.kids[0].kids[0].kids[0].className, 'fx-bob');
  applyTrim(new Date(2026, 5, 20), d.doc);
  assert.equal(d.kids.length, 0, 'a month with no effects removes the layer');
  assert.equal(d.style['--trim-url'], undefined);
});

test('December applies the strip URL; professional mode keeps the strip but draws no effects', () => {
  const dec = fakeDoc();
  applyTrim(new Date(2026, 11, 5), dec.doc);
  assert.match(dec.style['--trim-url'], /^url\("https:\/\/station\.test\/app\/assets\/themes\/forge-and-brass\/trim\/december\/frost-on-iron\.jpg"\)$/);
  assert.equal(dec.style['--trim-dim'], '0.15');
  const pro = fakeDoc('professional');
  const r = applyTrim(new Date(2026, 10, 5), pro.doc);
  assert.equal(r.fx, null);
  assert.equal(pro.kids.length, 0);
  assert.match(pro.style['--trim-url'], /black-iron-hall\.jpg/);
});

test('flames: every value is range checked, each flame gets its own rhythm', () => {
  const d = fakeDoc();
  const out = buildFx(d.doc, { flames: [{ x: 10, y: 20, r: 18, t: 2.5, d: -1 }, { x: 'bad', y: 500, r: -3, t: 0, d: 99 }] }, 'https://s.test/');
  assert.equal(out.length, 2);
  assert.deepEqual(out[0].style.vars, { '--x': '10%', '--y': '20%', '--r': '18px', '--t': '2.5s', '--d': '-1s' });
  assert.deepEqual(out[1].style.vars, { '--x': '50%', '--y': '50%', '--r': '16px', '--t': '3s', '--d': '0s' }, 'bad values fall back');
  const t = TRIMS[11].fx.flames.map(f => f.t);
  assert.ok(new Set(t).size === t.length, 'no two flames share a flicker time');
});

test('sprites: a sheet plays once every 15 to 25 seconds from a manifest-style entry; bad entries draw nothing; the table allows several', () => {
  const d = fakeDoc();
  const entry = { file: 'a.webp', x: 10, y: 20, w: 12, h: 50, frames: 8, every: 17 };
  const out = buildFx(d.doc, { sprites: [entry, { ...entry, every: 23, x: 60 }, { file: 'b.webp', frames: 1 }, { frames: 6 }] }, 'https://s.test/app/');
  assert.equal(out.length, 2, 'the entry without a valid frame count or file is skipped');
  assert.equal(out[0].className, 'fx-sprite');
  assert.equal(out[0].style.vars['--every'], '17s');
  assert.equal(out[1].style.vars['--every'], '23s');
  assert.equal(out[0].style.vars['--s'], '7', 'steps between 8 frames');
  assert.equal(out[0].style.vars['--end'], '-87.5000%');
  assert.equal(out[0].kids[0].style.vars['--wide'], '800%');
  assert.equal(out[0].kids[0].style.vars['--sheet'], 'url("https://s.test/app/a.webp")');
  const clamped = buildFx(d.doc, { sprites: [{ ...entry, every: 3 }] }, 'https://s.test/');
  assert.equal(clamped[0].style.vars['--every'], '20s', 'a period outside 15 to 25 falls back');
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

test('flicker and shadow are irregular and slow; the sleigh has three paths with easing, a bob and a tilt', () => {
  const flick = trimCss.match(/@keyframes trim-flick \{([\s\S]*?)\n\}/)[1];
  const opac = [...flick.matchAll(/opacity:\s*([\d.]+)/g)].map(m => +m[1]);
  assert.ok(opac.length >= 8 && Math.max(...opac) <= 0.95, 'glow never fully opaque');
  const steps = opac.slice(1).map((v, i) => Math.sign(v - opac[i]));
  assert.ok(steps.some((s, i) => i && s !== steps[i - 1]), 'it rises and falls unevenly, not a smooth ramp');
  assert.match(trimCss, /\.fx-shadow\s*\{[^}]*opacity:\s*\.22/);
  assert.match(trimCss, /\.fx-shadow\s*\{[^}]*animation:\s*trim-shadow 9s ease-in-out infinite alternate/);
  const y = trimCss.match(/@keyframes trim-fly-y \{([\s\S]*?)\n\}/)[1];
  assert.ok(/rotate\(-?\d+deg\)/.test(y), 'tilt');
  const ys = new Set([...y.matchAll(/translate3d\(0, (-?\d+)px/g)].map(m => m[1]));
  assert.ok(ys.size >= 7, 'a swoop, a dive and a long arc use different heights');
  assert.match(trimCss, /\.fx-sleigh\s*\{[^}]*animation:\s*trim-fly-x 45s cubic-bezier/);
  assert.match(trimCss, /\.fx-bob\s*\{[^}]*animation:\s*trim-fly-y 45s cubic-bezier/);
  assert.match(trimCss, /trim-bob 1\.3s ease-in-out infinite alternate/);
});

test('the layer is put back after the bar is drawn (the bar redraw would wipe it)', () => {
  const src = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
  const i = src.indexOf('nav.innerHTML');
  assert.ok(i > 0 && /applyTrim\(\)/.test(src.slice(i, i + 3000)), 'applyTrim runs after the nav redraw');
});

test('sw.js and the module tags are bumped for this change', () => {
  assert.match(sw, /const VERSION = 'jarvis-cas-v98'/);
  assert.ok(sw.includes("'js/cas-trim.js'"));
});
