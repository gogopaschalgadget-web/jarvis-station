import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { TRIMS, trimFor, sleighWanted, applyTrim, dimFor } from '../js/cas-trim.js';

test('a month picks its strip; a month with no entry, or a bad month, falls back to the plain trim', () => {
  assert.equal(trimFor(12).file, TRIMS[12].file);
  assert.equal(trimFor(11).file, TRIMS[11].file);
  assert.equal(trimFor(1), null);
  assert.equal(trimFor(0), null);
  assert.equal(trimFor(13), null);
  assert.equal(trimFor(NaN), null);
  assert.equal(trimFor('12'), null);
  assert.equal(trimFor(undefined), null);
  assert.equal(trimFor(7, { 7: { file: 'x.jpg' } }).file, 'x.jpg', 'adding a month is one line in the table');
  assert.equal(trimFor('constructor', {}), null);
});

test('every strip in the table exists in the repo', () => {
  Object.values(TRIMS).forEach(t => assert.ok(existsSync(new URL('../' + t.file, import.meta.url)), t.file));
  assert.ok(existsSync(new URL('../assets/theme/sleigh.png', import.meta.url)));
  Object.values(TRIMS).forEach(t => assert.ok(statSync(new URL('../' + t.file, import.meta.url)).size < 100 * 1024, t.file + ' stays under 100 KB'));
});

test('the sleigh shows only in a month that asks for it, in game mode, without reduced motion', () => {
  assert.equal(sleighWanted({ month: 12, mode: 'game', reduced: false }), true);
  assert.equal(sleighWanted({ month: 11, mode: 'game', reduced: false }, { 11: { file: 'n.jpg' }, 12: { file: 'd.jpg', sleigh: true } }), false, 'a month with a strip but no sleigh');
  assert.equal(sleighWanted({ month: 6, mode: 'game', reduced: false }), false);
  assert.equal(sleighWanted({ month: 12, mode: 'professional', reduced: false }), false);
  assert.equal(sleighWanted({ month: 12, mode: 'game', reduced: true }), false);
  assert.equal(sleighWanted({ month: 12, mode: undefined, reduced: false }), true);
});

function fakeDoc(mode) {
  const kids = [];
  const nav = { append: c => kids.push(c) };
  const style = {};
  const root = { dataset: mode ? { mode } : {}, style: { setProperty: (k, v) => { style[k] = v; }, removeProperty: k => { delete style[k]; } } };
  const mk = tag => ({ tag, id: '', className: '', attrs: {}, kids: [], setAttribute(k, v) { this.attrs[k] = v; }, append(c) { this.kids.push(c); }, remove() { const i = kids.indexOf(this); if (i >= 0) kids.splice(i, 1); } });
  return { kids, style, root, doc: {
    documentElement: root, baseURI: 'https://station.test/app/',
    querySelector: sel => (sel === '.station-nav' ? nav : null),
    getElementById: id => kids.find(k => k.id === id) || null,
    createElement: mk,
  } };
}

test('December applies the strip and adds the sleigh; a month with no entry leaves the plain bar and no sleigh', () => {
  const dec = fakeDoc();
  const r = applyTrim(new Date(2026, 11, 5), dec.doc);
  assert.equal(r.sleigh, true);
  assert.match(dec.style['--trim-url'], /^url\("https:\/\/station\.test\/app\/assets\/themes\/forge-and-brass\/trim\/december\/frost-on-iron\.jpg"\)$/);
  assert.equal(dec.kids.length, 1);
  assert.equal(dec.kids[0].attrs['aria-hidden'], 'true');
  applyTrim(new Date(2026, 11, 6), dec.doc);
  assert.equal(dec.kids.length, 1, 'applied twice adds one sleigh');
  const nov = fakeDoc();
  assert.equal(applyTrim(new Date(2026, 9, 5), nov.doc).sleigh, false);
  assert.equal(nov.style['--trim-url'], undefined);
  assert.equal(nov.kids.length, 0);
  applyTrim(new Date(2026, 0, 1), dec.doc);
  assert.equal(dec.style['--trim-url'], undefined, 'a later month clears the strip');
  assert.equal(dec.kids.length, 0, 'and removes the sleigh');
});

test('professional mode keeps the strip but never adds the sleigh', () => {
  const pro = fakeDoc('professional');
  const r = applyTrim(new Date(2026, 11, 5), pro.doc);
  assert.equal(r.sleigh, false);
  assert.equal(pro.kids.length, 0);
  assert.ok(pro.style['--trim-url']);
});

test('the stylesheet makes the sleigh harmless: no taps, nothing in professional mode, nothing under reduced motion, paused when hidden, not on the side rail', () => {
  const css = readFileSync(new URL('../css/station-theme.css', import.meta.url), 'utf8');
  assert.match(css, /\.trim-fx\s*\{[^}]*pointer-events:\s*none/);
  assert.match(css, /\.trim-fx i\s*\{[^}]*pointer-events:\s*none/);
  assert.match(css, /html\[data-mode="professional"\] \.trim-fx\s*\{\s*display:\s*none/);
  assert.match(css, /prefers-reduced-motion: reduce\)\s*\{\s*\.trim-fx\s*\{\s*display:\s*none/);
  assert.match(css, /html\[data-hidden="1"\] \.trim-fx i\s*\{\s*animation-play-state:\s*paused/);
  assert.match(css, /min-width: 960px\)\s*\{\s*\.trim-fx\s*\{\s*display:\s*none/);
  assert.match(css, /animation:\s*trim-sleigh 15s linear infinite/);
  const trimBlock = css.slice(css.indexOf('Monthly trim'));
  assert.doesNotMatch(trimBlock, /\.station-nav/, 'the trim block never restyles the bar, so it cannot change its height');
  assert.doesNotMatch(trimBlock, /(^|[;{\s])(height|width|padding|margin)\s*:[^;]*(%|vh)[^;]*;[^}]*\}\s*html\[data-hidden/, 'no layout-affecting rule on the bar');
  assert.match(trimBlock, /position:\s*absolute;\s*inset:\s*0/, 'the sleigh layer is absolutely positioned inside the bar and takes no space');
});

test('the sleigh layer is put back after the bar is drawn (the bar redraw would wipe it)', () => {
  const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
  const nav = app.slice(app.indexOf('function setupNav'));
  const html = nav.indexOf("nav.innerHTML = CAS_NAV");
  const apply = nav.indexOf('applyTrim()');
  assert.ok(html > 0 && apply > html, 'applyTrim runs after the bar content is written');
  assert.ok(apply < nav.indexOf("nav.addEventListener('click'"));
});

test('November has a strip with a 40 percent dark overlay and no sleigh; December has the sleigh and a light 15 percent overlay', () => {
  assert.equal(dimFor(trimFor(11)), 0.4);
  assert.equal(dimFor(trimFor(12)), 0.15);
  assert.equal(sleighWanted({ month: 11, mode: 'game', reduced: false }), false);
  assert.equal(dimFor(null), 0);
  assert.equal(dimFor({ dim: 5 }), 0);
  assert.equal(dimFor({ dim: '0.4' }), 0);
  const nov = fakeDoc();
  applyTrim(new Date(2026, 10, 20), nov.doc);
  assert.equal(nov.style['--trim-dim'], '0.4');
  assert.match(nov.style['--trim-url'], /november\/candle-hall\.jpg/);
  applyTrim(new Date(2026, 11, 20), nov.doc);
  assert.equal(nov.style['--trim-dim'], '0.15');
  applyTrim(new Date(2026, 5, 20), nov.doc);
  assert.equal(nov.style['--trim-dim'], undefined);
});

test('the strips and the sleigh are in the offline precache list, so the trim also shows offline', () => {
  const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  Object.values(TRIMS).forEach(t => assert.ok(sw.includes("'" + t.file + "'"), t.file));
  assert.ok(sw.includes("'assets/theme/sleigh.png'"));
  assert.ok(sw.includes("'js/cas-trim.js'"));
});
