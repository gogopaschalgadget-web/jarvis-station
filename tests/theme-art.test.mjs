import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { THEME_ART, DEFAULT_THEME, artFor, activeThemeId, pictureFrom } from '../js/cas-theme-art.js';
import { THEMES, applyLook, paintColors, renderThemeSettings, effectiveLook, saveLook, loadLook, bootLook, syncLook } from '../js/cas-themes.js';
import { plateFor, rankUpScene, nextPlate } from '../js/cas-progress.js';
import { stillFor, loopFor, pictureNow } from '../js/cas-machines.js';
import { tileArt, PLACES, BENCH } from '../js/cas-places.js';
import { applyTrim } from '../js/cas-trim.js';

const size = f => statSync(new URL('../' + f, import.meta.url)).size;
const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');

function fakeRoot(theme) {
  const props = {};
  const events = [];
  const root = { dataset: theme ? { theme } : {}, style: { setProperty: (k, v) => { props[k] = v; }, removeProperty: k => { delete props[k]; } } };
  globalThis.document = { documentElement: root, dispatchEvent: e => events.push(e), createElement: tag => ({ tag, kids: [], className: '', dataset: {}, style: {}, attrs: {}, listeners: {}, append(...c) { this.kids.push(...c); }, setAttribute(k, v) { this.attrs[k] = v; }, addEventListener(t, f) { this.listeners[t] = f; }, remove() {} }) };
  return { root, props, events };
}
const use = theme => { fakeRoot(theme); };

test('the default theme is the page when none is marked, and an unknown theme id is the default', () => {
  use(undefined);
  assert.equal(activeThemeId(), DEFAULT_THEME);
  use('nope');
  assert.equal(activeThemeId(), DEFAULT_THEME);
  use('counting-house');
  assert.equal(activeThemeId(), 'counting-house');
  assert.equal(artFor('__proto__'), THEME_ART[DEFAULT_THEME]);
  assert.equal(artFor('constructor'), THEME_ART[DEFAULT_THEME]);
  assert.equal(artFor('counting-house'), THEME_ART['counting-house']);
});

test('every theme in the themes list has an art table, and every picture a table names exists, is small and is never precached unless it is the default theme\'s plates', () => {
  for (const t of THEMES) assert.ok(THEME_ART[t.id], 'an art table for ' + t.id);
  const all = [];
  for (const [id, a] of Object.entries(THEME_ART)) {
    all.push(...Object.values(a.plates), ...Object.values(a.rankup));
    for (const m of Object.values(a.machines.stills)) all.push(...Object.values(m));
    all.push(...Object.values(a.machines.loops), ...Object.values(a.tiles.built), ...Object.values(a.tiles.blueprint));
    if (a.tiles.blueprintDefault) all.push(a.tiles.blueprintDefault);
  }
  for (const f of all) {
    assert.ok(existsSync(new URL('../' + f, import.meta.url)), 'exists: ' + f);
    assert.ok(size(f) < 160 * 1024, 'small: ' + f);
  }
  for (const f of Object.values(THEME_ART['counting-house'].plates).concat(Object.values(THEME_ART['counting-house'].rankup))) assert.ok(!sw.includes(`'${f}'`), 'the second theme is on demand, never precached: ' + f);
  assert.ok(!/'assets\/themes\/counting-house/.test(sw), 'nothing of the second theme is in the precache list');
  assert.match(sw, /url\.pathname\.includes\('\/assets\/themes\/counting-house\/'\)/, 'the service worker keeps them after first use');
  assert.ok(sw.includes("'js/cas-theme-art.js'"));
});

test('each module reads the active theme: plates, scenes, machine stills, tiles', () => {
  use('forge-and-brass');
  assert.equal(plateFor(4), 'assets/themes/forge-and-brass/ranks/rank04_technician.jpg');
  assert.equal(rankUpScene(4), 'assets/themes/forge-and-brass/rankup/rankup_04_technician.jpg');
  assert.equal(stillFor({ id: 'operations', tier: 'Basic' }), 'assets/themes/forge-and-brass/machines/forge-basic.webp');
  use('counting-house');
  assert.equal(plateFor(4), 'assets/themes/counting-house/ranks/rank04_technician.jpg');
  assert.equal(plateFor(12), 'assets/themes/counting-house/ranks/rank12_chair.jpg');
  assert.equal(rankUpScene(4), 'assets/themes/counting-house/rankup/rankup_04_technician.jpg');
  assert.equal(rankUpScene(5), 'assets/themes/forge-and-brass/rankup/rankup_05_supervisor.jpg', 'a rank the second theme has no scene for uses the default theme\'s');
  assert.equal(stillFor({ id: 'operations', tier: 'Basic' }), 'assets/themes/counting-house/machines/ops_basic.webp');
  assert.equal(stillFor({ id: 'money', tier: 'Legendary' }), 'assets/themes/counting-house/machines/money_leg.webp');
  assert.equal(stillFor({ id: 'customer_experience', tier: 'Advanced' }), 'assets/themes/counting-house/machines/customer_adv.webp');
  assert.equal(stillFor({ id: 'sales', tier: 'nonsense' }), 'assets/themes/counting-house/machines/sales_basic.webp');
  assert.equal(loopFor({ id: 'operations', xp: 900 }), '', 'the second theme has no loops, so a machine stays a still');
  assert.equal(pictureNow({ id: 'operations', tier: 'Basic', xp: 900 }, { visible: true, hidden: false, reduced: false, mode: 'game' }), 'assets/themes/counting-house/machines/ops_basic.webp');
  assert.equal(tileArt(PLACES.find(p => p.id === 'mint')), 'assets/themes/counting-house/tiles/mint.webp');
  assert.equal(tileArt(PLACES.find(p => p.id === 'quora')), 'assets/themes/counting-house/tiles/quora.webp');
  assert.equal(tileArt(BENCH), null, 'no bench tile in the second theme: none, never another theme picture');
  use('forge-and-brass');
  assert.equal(tileArt(BENCH), 'assets/themes/forge-and-brass/tiles/bench.jpg');
  use('counting-house');
  assert.equal(tileArt(null), null);
  const n = nextPlate({ rank: { index: 3, nextAt: 1500, nextName: 'Technician', toGo: 600 } });
  assert.equal(n.file, 'assets/themes/counting-house/ranks/rank04_technician.jpg');
  use('forge-and-brass');
});

test('applying a look marks the page, paints the theme colours from its table (none for a theme without), and announces the change once', () => {
  const f = fakeRoot('forge-and-brass');
  applyLook({ mode: 'professional', theme: 'counting-house' });
  assert.equal(f.root.dataset.theme, 'counting-house');
  assert.equal(f.root.dataset.mode, 'professional');
  assert.equal(f.root.dataset.themeColors, '1');
  assert.equal(f.props['--th-bar-a'], THEME_ART['counting-house'].colors.barA);
  assert.equal(f.props['--th-accent'], THEME_ART['counting-house'].colors.accent);
  assert.equal(f.events.length, 1);
  assert.equal(f.events[0].type, 'station-look');
  applyLook({ mode: 'professional', theme: 'counting-house' });
  assert.equal(f.events.length, 1, 'no change, no announcement');
  applyLook({ mode: 'game', theme: 'forge-and-brass' });
  assert.equal(f.root.dataset.themeColors, undefined);
  assert.equal(f.props['--th-bar-a'], undefined, 'a theme without colours leaves the stylesheet\'s own look');
  assert.equal(f.events.length, 2);
  const r = { dataset: {}, style: { setProperty() {}, removeProperty() {} } };
  paintColors(r, { barA: 'red; background: url(x)', accent: '#c9b27a' });
  assert.equal(r.dataset.themeColors, '1', 'only #rrggbb values are ever written');
});

test('the second theme is chosen on the Look card behind the same lock: closed below Technician, open from the server rank', () => {
  const store = {};
  globalThis.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
  const f = fakeRoot('forge-and-brass');
  assert.deepEqual(effectiveLook({ mode: 'professional', theme: 'counting-house' }, { rank: { index: 3 } }), { mode: 'game', theme: 'forge-and-brass' }, 'below Technician the saved choice is not applied');
  assert.deepEqual(effectiveLook({ mode: 'professional', theme: 'counting-house' }, null), { mode: 'game', theme: 'forge-and-brass' }, 'no reported rank: closed');
  assert.deepEqual(effectiveLook({ mode: 'professional', theme: 'counting-house' }, { rank: { index: 4 } }), { mode: 'professional', theme: 'counting-house' });
  const panel = { kids: [], querySelector: () => null, append(c) { this.kids.push(c); } };
  const dig = (n, out = []) => { out.push(n); (n.kids || []).forEach(k => dig(k, out)); return out; };
  renderThemeSettings(panel, () => ({ rank: { index: 3 } }));
  const closed = dig(panel.kids[0]).filter(n => n.className && n.className.startsWith('look-theme'));
  assert.equal(closed.length, 2);
  assert.ok(closed.every(n => n.disabled === true), 'every theme row is closed below Technician');
  const open = { kids: [], querySelector: () => null, append(c) { this.kids.push(c); } };
  renderThemeSettings(open, () => ({ rank: { index: 4 } }));
  const rows = dig(open.kids[0]).filter(n => n.className && n.className.startsWith('look-theme'));
  const ch = rows.find(n => /counting/i.test(JSON.stringify(n.kids)) || n.kids[0].kids[0].textContent === 'Counting House');
  assert.equal(ch.disabled, false);
  ch.listeners.click();
  assert.equal(f.root.dataset.theme, 'counting-house');
  assert.deepEqual(JSON.parse(store['station-look']), { mode: 'professional', theme: 'counting-house' });
  assert.deepEqual(loadLook(), { mode: 'professional', theme: 'counting-house' });
  const locked = { kids: [], querySelector: () => null, append(c) { this.kids.push(c); } };
  f.root.dataset.theme = 'forge-and-brass';
  renderThemeSettings(locked, () => ({ rank: { index: 2 } }));
  dig(locked.kids[0]).filter(n => n.className && n.className.startsWith('look-theme')).forEach(n => n.listeners.click && n.listeners.click());
  assert.equal(f.root.dataset.theme, 'forge-and-brass', 'a click on a closed row changes nothing');
  delete globalThis.localStorage;
});

test('the monthly strip and its effects belong to the Forge theme only; another theme keeps its own plain bar', () => {
  const mk = theme => {
    const kids = []; const style = {};
    const root = { dataset: { theme }, style: { setProperty: (k, v) => { style[k] = v; }, removeProperty: k => { delete style[k]; } } };
    const mkEl = tag => ({ tag, id: '', className: '', dataset: {}, style: { setProperty() {} }, attrs: {}, kids: [], setAttribute(k, v) { this.attrs[k] = v; }, append(c) { this.kids.push(c); }, remove() { const i = kids.indexOf(this); if (i >= 0) kids.splice(i, 1); } });
    return { kids, style, doc: { documentElement: root, baseURI: 'https://s.test/', querySelector: s => (s === '.station-nav' ? { append: c => kids.push(c) } : null), getElementById: id => kids.find(k => k.id === id) || null, createElement: mkEl } };
  };
  const f = mk('forge-and-brass');
  assert.equal(applyTrim(new Date(2026, 10, 20), f.doc).fx, '11');
  assert.ok(f.style['--trim-url']);
  const c = mk('counting-house');
  const r = applyTrim(new Date(2026, 10, 20), c.doc);
  assert.equal(r.fx, null);
  assert.equal(r.trim, null);
  assert.equal(c.style['--trim-url'], undefined);
  assert.equal(c.kids.length, 0);
});

test('the stylesheets repaint the Desk and the bar from the theme colours, and nothing hard-codes the second theme', () => {
  const css = readFileSync(new URL('../css/cas-desk.css', import.meta.url), 'utf8') + readFileSync(new URL('../css/station-theme.css', import.meta.url), 'utf8');
  assert.match(css, /html\[data-theme-colors\] #panel-desk \{ --dk-brass: var\(--th-accent\)/);
  assert.match(css, /@media \(max-width: 959px\) \{ html\[data-theme-colors\], html\[data-theme-colors\] body \{ background: var\(--th-bar-b\); \} \}/, 'the system strip follows the bar colour');
  assert.match(css, /html\[data-theme-colors\] \.station-nav \{ background: linear-gradient\(var\(--th-bar-a\), var\(--th-bar-b\)\) !important/);
  assert.doesNotMatch(css, /data-theme="counting-house"/, 'colours come from the table, not from a rule per theme');
  for (const f of ['cas-progress.js', 'cas-machines.js', 'cas-places.js', 'cas-rankup.js', 'cas-desk.js']) {
    assert.ok(!/counting-house|forge-and-brass/.test(readFileSync(new URL('../js/' + f, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')), f + ' names no theme');
  }
});

test('first paint: the saved look only if the server unlocked the Look card on an earlier read; the first Desk read confirms or reverts it', () => {
  const store = {};
  globalThis.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
  const CH = { mode: 'professional', theme: 'counting-house' };
  const FORGE = { mode: 'game', theme: 'forge-and-brass' };
  saveLook(CH);
  assert.deepEqual(bootLook(), FORGE, 'never unlocked by the server: Forge, whatever is saved');
  store['station-look-unlocked'] = '0';
  assert.deepEqual(bootLook(), FORGE, 'only the exact mark counts');
  delete store['station-look-unlocked'];
  const f = fakeRoot('forge-and-brass');
  syncLook({ rank: { index: 4 } });
  assert.equal(store['station-look-unlocked'], '1', 'written only when the server progress says unlocked');
  assert.equal(f.root.dataset.theme, 'counting-house');
  assert.deepEqual(bootLook(), CH, 'unlocked earlier: the saved look at first paint');
  syncLook(null);
  assert.equal(store['station-look-unlocked'], '1', 'a read with no rank reported does not forget the earlier unlock');
  assert.equal(f.root.dataset.theme, 'forge-and-brass', 'but that read does not apply the look either');
  syncLook({ rank: { index: 3 } });
  assert.equal(store['station-look-unlocked'], undefined, 'the server now says locked: forgotten');
  assert.equal(f.root.dataset.theme, 'forge-and-brass', 'and the look reverts on the read');
  assert.deepEqual(bootLook(), FORGE, 'and the next first paint is Forge again');
  assert.deepEqual(JSON.parse(store['station-look']), CH, 'the saved choice itself is kept for later');
  saveLook({ mode: 'professional', theme: 'nope' });
  store['station-look-unlocked'] = '1';
  assert.deepEqual(bootLook(), FORGE, 'a saved look naming no real theme is Forge even when unlocked');
  const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); }, removeItem: () => { throw new Error('blocked'); } };
  globalThis.localStorage = broken;
  assert.deepEqual(bootLook(), FORGE, 'blocked storage: Forge');
  assert.doesNotThrow(() => syncLook({ rank: { index: 4 } }));
  const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
  assert.match(app, /applyLook\(bootLook\(\)\);/, 'the page starts from the boot look, not a fixed default');
  delete globalThis.localStorage;
});

test('signing out forgets the unlock mark, so another account on the phone never starts from the look of the last one', () => {
  const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
  const clear = app.slice(app.indexOf('function clearAuth'));
  const body = clear.slice(0, clear.indexOf('\n}\n'));
  assert.ok(body.includes("localStorage.removeItem('station_device_id');"));
  assert.ok(body.includes("try { localStorage.removeItem('station-look-unlocked'); }"));
});
