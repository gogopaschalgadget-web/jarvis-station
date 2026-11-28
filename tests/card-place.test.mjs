import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makePlaceStore, restoreTargetOf, wantsDeskOf, cleanPlace, PLACE_KEY, PLACE_TTL_MS, MAX_CARDS, MAX_STEPS } from '../js/cas-place.js';

const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const memStorage = (seed = {}) => { const m = { ...seed }; return { m, getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; } }; };
const clock = (t = 1_000_000) => { const c = { t, now: () => c.t }; return c; };

test('ticks, the open card and the scroll place are written to the phone and read back by a new store (the app was closed and reopened)', () => {
  const st = memStorage(); const c = clock();
  const a = makePlaceStore(st, c.now);
  a.setTab('desk'); a.setOpen('card-7'); a.setScroll(412.6, -35.4);
  assert.equal(a.toggle('card-7', 0), true);
  assert.equal(a.toggle('card-7', 2), true);
  assert.equal(a.toggle('card-9', 1), true);
  const b = makePlaceStore(st, c.now);   // a fresh start of the app
  assert.deepEqual([...b.ticked('card-7')], [0, 2]);
  assert.deepEqual([...b.ticked('card-9')], [1]);
  assert.deepEqual(b.get().open, 'card-7');
  assert.equal(b.get().scroll, 413);
  assert.deepEqual(b.restoreTarget(['card-1', 'card-7']), { id: 'card-7', scroll: 413, rel: -35 }, 'the scroll number and the place relative to the card');
  assert.equal(b.wantsDesk(), true);
  assert.equal(b.toggle('card-7', 0), false, 'a second tap un-ticks');
  assert.deepEqual([...makePlaceStore(st, c.now).ticked('card-7')], [2]);
});

test('the place is cleared when the card is done, and ticks of cards that are not open any more are dropped', () => {
  const st = memStorage(); const c = clock();
  const s = makePlaceStore(st, c.now);
  s.setTab('desk'); s.setOpen('a'); s.setScroll(300); s.toggle('a', 0); s.toggle('b', 3);
  s.clearCard('a');
  assert.equal(s.get().open, null); assert.equal(s.get().scroll, 0); assert.equal(s.ticked('a').size, 0);
  assert.deepEqual([...s.ticked('b')], [3], 'another card is untouched');
  s.setOpen('b'); s.toggle('c', 1);
  s.prune(['b']);
  assert.equal(s.ticked('c').size, 0, 'c is not open any more');
  assert.equal(s.get().open, 'b');
  s.prune([]);
  assert.equal(s.get().open, null); assert.equal(s.ticked('b').size, 0);
  assert.equal(s.restoreTarget(['b']), null);
});

test('closing the card he opened clears the place; opening another card moves it', () => {
  const s = makePlaceStore(memStorage(), clock().now);
  s.setTab('desk'); s.setOpen('a'); s.setScroll(90); s.setOpen('b');
  assert.equal(s.get().open, 'b');
  s.setOpen(null);
  assert.deepEqual([s.get().open, s.get().scroll], [null, 0]);
  assert.equal(s.wantsDesk(), false);
});

test('nothing is brought back when it is old, on another tab, or the card is no longer open', () => {
  const st = memStorage(); const c = clock();
  const s = makePlaceStore(st, c.now);
  s.setTab('desk'); s.setOpen('a');
  assert.ok(s.restoreTarget(['a']));
  assert.equal(s.restoreTarget(['x']), null, 'the card is done or gone');
  s.setTab('cas');
  assert.equal(s.restoreTarget(['a']), null, 'he was on another tab');
  assert.equal(s.wantsDesk(), false);
  s.setTab('desk');
  const saved = c.t;
  c.t = saved + PLACE_TTL_MS + 1;
  assert.equal(s.restoreTarget(['a']), null, 'older than 12 hours');
  assert.equal(s.wantsDesk(), false);
  c.t = saved - 5;
  assert.equal(s.restoreTarget(['a']), null, 'a clock that went backwards is not trusted');
});

test('stored data that is damaged or odd is dropped, never trusted', () => {
  assert.deepEqual(cleanPlace(null), { v: 1, tab: null, open: null, scroll: 0, rel: null, at: 0, ticks: {} });
  assert.deepEqual(cleanPlace('x'), cleanPlace(null));
  assert.deepEqual(cleanPlace({ v: 2, open: 'a' }), cleanPlace(null));
  const p = cleanPlace({ v: 1, tab: 'desk', open: '<img src=x onerror=1>', scroll: -4, at: 5, ticks: { ok: [3, 1, 1, -2, 1.5, 'x', 999], '<b>': [1], __proto__: [1], bad: 'no', empty: [] } });
  assert.equal(p.open, null, 'an id with odd characters is dropped');
  assert.equal(p.scroll, 0);
  assert.deepEqual(p.ticks, { ok: [1, 3] });
  assert.equal(Object.getPrototypeOf(p.ticks), Object.prototype);
  const many = {}; for (let i = 0; i < 80; i++) many['c' + i] = [i % MAX_STEPS];
  assert.ok(Object.keys(cleanPlace({ v: 1, ticks: many }).ticks).length <= MAX_CARDS);
  const st = memStorage({ [PLACE_KEY]: '{not json' });
  const s = makePlaceStore(st, clock().now);
  assert.equal(s.get().open, null);
  assert.equal(s.toggle('a', 0), true, 'a damaged store is simply replaced');
  assert.equal(s.toggle('a', MAX_STEPS), false, 'a step number out of range is refused');
  assert.equal(s.toggle('bad id!', 1), false);
});

test('storage that throws (private browsing, full, blocked) means no memory and no error; the open session still remembers', () => {
  const boom = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('full'); }, removeItem() { throw new Error('blocked'); } };
  const s = makePlaceStore(boom, clock().now);
  assert.doesNotThrow(() => { s.setTab('desk'); s.setOpen('a'); s.setScroll(10); s.toggle('a', 1); s.clearCard('z'); s.prune(['a']); s.forget(); });
  const t = makePlaceStore(null, clock().now);
  assert.equal(t.toggle('a', 1), true);
  assert.deepEqual([...t.ticked('a')], [1]);
  assert.equal(makePlaceStore(boom).restoreTarget(['a']), null);
});

test('signing out forgets the place', () => {
  const st = memStorage(); const s = makePlaceStore(st, clock().now);
  s.setTab('desk'); s.setOpen('a'); s.toggle('a', 0);
  s.forget();
  assert.equal(st.getItem(PLACE_KEY), null);
  assert.equal(s.wantsDesk(), false); assert.equal(s.ticked('a').size, 0);
});

test('the Desk and the app use it: tick boxes on steps, his own tap sets the place, scroll is kept when the page hides, the start returns to the Desk, done and sign-out clear it', () => {
  const desk = read('js/cas-desk.js'); const app = read('js/app.js');
  assert.match(desk, /import \{ makePlaceStore, restoreTargetOf, wantsDeskOf \} from '\.\/cas-place\.js\?v=cas\d+'/);
  assert.match(desk, /li\.prepend\(tickBox\(cardId, i, li, ticked\.has\(i\)\)\)/);
  assert.match(desk, /stepsList\(item\.steps, terms, seen, item\.id\)/);
  assert.match(desk, /stepsList\(item\.steps, null, seen, item\.id\)/, 'the mission rows too');
  assert.match(desk, /top\.addEventListener\('click'/);
  assert.match(desk, /closest\('button, a, input, textarea'\)/, 'a tap on a button in the card top is not an open or close');
  assert.match(desk, /document\.addEventListener\('visibilitychange', \(\) => \{ if \(document\.hidden\) saveScroll\(\); \}\)/);
  assert.match(desk, /window\.addEventListener\('pagehide', saveScroll\)/);
  assert.match(desk, /if \(kind === 'done' \|\| kind === 'choice'\) _place\.clearCard\(id\)/);
  assert.match(desk, /_place\.prune\(data\.feed\.items\.filter\(i => i && i\.status === 'open'\)/);
  assert.match(desk, /restorePlace\(\)/);
  assert.match(desk, /watchPlace\(panel\)/);
  const asked = app.indexOf('resumeDesk = deskPlaceWanted()'); const first = app.indexOf("switchTab('cas');        // start on Cas");
  assert.ok(asked > 0 && first > asked, 'the place is read BEFORE the start tab is written over it');
  const init = app.indexOf('initDesk(document.getElementById'); const go = app.indexOf("if (resumeDesk) { resumeDesk = false; switchTab('desk'); }");
  assert.ok(init > 0 && go > init, 'the return to the Desk comes AFTER initDesk has given it the server address and login (before that the Desk would ask the wrong place)');
  assert.match(app, /function switchTab\(tabId\) \{\s*currentTab = tabId;\s*rememberTab\(tabId\);/);
  assert.match(app, /try \{ forgetPlace\(\); \}/);
  assert.ok(read('sw.js').includes("'js/cas-place.js'"), 'the new module is in the offline list');
});

test('links to other sites open in their own window with no opener (the most the page can ask of the phone); the step tick is a real 44 px target; ticked steps are marked by more than colour', () => {
  const desk = read('js/cas-desk.js'); const css = read('css/cas-desk.css');
  assert.match(desk, /a\.target = '_blank';\s*a\.rel = 'noopener noreferrer';/);
  assert.match(css, /\.dk-tick \{[^}]*width: 44px; height: 44px; min-height: 44px/);
  assert.match(css, /\.dk-steps li \{[^}]*min-height: 44px/, 'rows are tall enough that two tick boxes never overlap');
  assert.match(css, /\.dk-steps li\.ticked \{ text-decoration: line-through/);
  assert.match(css, /\.dk-tick\[aria-checked="true"\] \.dk-tick-m \{ display: inline; \}/, 'a check mark, not only a colour');
});

test('the start reads the place as it was when the app opened, so a later write cannot hide it', () => {
  const st = memStorage(); const c = clock();
  const s = makePlaceStore(st, c.now);
  s.setTab('desk'); s.setOpen('a'); s.setScroll(120, 15);
  const atStart = s.get();   // the place read when the app starts
  s.setTab('cas');           // the start writes the Cas tab over it
  assert.equal(wantsDeskOf(atStart, c.now()), true);
  assert.deepEqual(restoreTargetOf(atStart, ['a', 'b'], c.now()), { id: 'a', scroll: 120, rel: 15 });
  assert.equal(restoreTargetOf(atStart, ['b'], c.now()), null);
  assert.equal(restoreTargetOf(null, ['a'], c.now()), null);
  assert.equal(wantsDeskOf(atStart, c.now() + PLACE_TTL_MS + 1), false);
  assert.equal(s.wantsDesk(), false, 'the live place now says Cas');
  s.setOpen(null);
  assert.equal(s.get().rel, null);
});
