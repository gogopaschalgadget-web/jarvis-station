import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { normalizeProgress, plateFor, rankUpScene, nextPlate, rankUpMode, makeRankMemory } from '../js/cas-progress.js';
import { showRankUp } from '../js/cas-rankup.js';

const prog = (index, xp = 870, extra = {}) => normalizeProgress({ xp, rank: { index, name: 'R' + index, at: 500, next_at: 1500, next_name: 'R' + (index + 1), ...extra } });
const mem = (v) => { const s = v == null ? {} : { 'cas-rank-seen': String(v) }; return { s, storage: { getItem: k => (k in s ? s[k] : null), setItem: (k, x) => { s[k] = String(x); } } }; };

test('a plate for each of the 12 ranks, from fixed names; anything else has none; the files exist, are small and precached', () => {
  const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  for (let i = 1; i <= 12; i++) {
    const f = plateFor(i);
    assert.ok(f, 'plate ' + i);
    assert.ok(existsSync(new URL('../' + f, import.meta.url)), f);
    assert.ok(statSync(new URL('../' + f, import.meta.url)).size < 100 * 1024, f);
    assert.ok(sw.includes(`'${f}'`), f + ' precached');
  }
  for (const bad of [0, 13, -1, 2.5, '3', null, undefined, NaN, '__proto__']) assert.equal(plateFor(bad), '');
  const seen = new Set();
  for (let i = 1; i <= 12; i++) {
    const sc = rankUpScene(i);
    assert.ok(sc, 'a scene for rank ' + i);
    seen.add(sc);
    assert.ok(existsSync(new URL('../' + sc, import.meta.url)) && statSync(new URL('../' + sc, import.meta.url)).size < 100 * 1024, 'a scene exists and is small: ' + sc);
    assert.ok(!sw.includes(`'${sc}'`), 'a scene is loaded on demand, never precached: ' + sc);
  }
  assert.equal(seen.size, 12, 'twelve different scenes');
  assert.equal(rankUpScene(13), '');
  assert.match(sw, /forge-and-brass\/rankup\//, 'the service worker keeps a scene after first use');
  assert.ok(!existsSync(new URL('../assets/themes/forge-and-brass/ranks/rankup_technician.jpg', import.meta.url)), 'the old Technician scene (with a plate painted in) is gone');
  assert.ok(sw.includes("'js/cas-rankup.js'"));
});

test('the next plate and the XP still needed come from the server progress; none at the top rank', () => {
  const n = nextPlate(prog(3));
  assert.equal(n.index, 4);
  assert.equal(n.name, 'R4');
  assert.equal(n.toGo, 630);
  assert.equal(n.file, plateFor(4));
  assert.equal(nextPlate(normalizeProgress({ xp: 41000, rank: { index: 12, name: 'Chair', at: 40000 } })), null);
  assert.equal(nextPlate(null), null);
});

test('rank-up mode: professional is one quiet line, reduced motion the still plate, otherwise the animation', () => {
  assert.equal(rankUpMode({ mode: 'professional', reduced: false }), 'line');
  assert.equal(rankUpMode({ mode: 'professional', reduced: true }), 'line');
  assert.equal(rankUpMode({ mode: 'game', reduced: true }), 'still');
  assert.equal(rankUpMode({ mode: 'game', reduced: false }), 'animate');
  assert.equal(rankUpMode({}), 'animate');
  assert.equal(rankUpMode(), 'animate');
});

test('a higher rank than the phone last saw plays once, then never again for that rank', () => {
  const { s, storage } = mem(3);
  const m = makeRankMemory(storage);
  assert.equal(m.check(prog(3)), null, 'same rank');
  assert.deepEqual(m.check(prog(4)), { index: 4, name: 'R4' });
  assert.equal(s['cas-rank-seen'], '4', 'remembered at once, before the animation runs');
  assert.equal(s['cas-rank-shown'], '4');
  assert.equal(m.check(prog(4)), null, 'not again');
  assert.equal(makeRankMemory(storage).check(prog(4)), null, 'not after a reload either');
  assert.equal(m.check(prog(3)), null, 'a lower rank from the server plays nothing');
  assert.equal(m.seen(), 3, 'the last seen rank follows the server down');
  assert.equal(m.shown(), 4, 'but the highest rank whose card was shown stays');
  assert.equal(m.check(prog(4)), null, 'so a transient low rank can never cause a second card for rank 4');
  assert.equal(makeRankMemory(storage).check(prog(4)), null, 'also after a reload');
  assert.deepEqual(m.check(prog(6)), { index: 6, name: 'R6' }, 'a jump of several ranks plays once for the new rank');
});

test('the first time the phone sees a rank it only records it; bad progress plays nothing', () => {
  const { s, storage } = mem(null);
  const m = makeRankMemory(storage);
  assert.equal(m.check(prog(5)), null);
  assert.equal(s['cas-rank-seen'], '5');
  assert.equal(s['cas-rank-shown'], '5');
  for (const bad of [null, undefined, {}, { rank: null }, { rank: { index: 'x' } }, { rank: { index: 0 } }, { rank: { index: 1.5 } }, { rank: { index: 500 } }]) assert.equal(m.check(bad), null);
});

test('broken storage never throws and never replays within the session; garbage in storage is ignored', () => {
  const m1 = makeRankMemory({ getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } });
  assert.equal(m1.check(prog(2)), null);
  assert.deepEqual(m1.check(prog(3)), { index: 3, name: 'R3' });
  assert.equal(m1.check(prog(3)), null, 'no replay this session');
  assert.equal(makeRankMemory(null).check(prog(2)), null);
  for (const v of ['abc', '0', '-2', '2.5', '9999', '']) assert.equal(makeRankMemory({ getItem: () => v, setItem() {} }).seen(), null);
});

function fakeDoc() {
  const body = { kids: [], append(c) { this.kids.push(c); } };
  const listeners = {};
  const mk = tag => ({ tag, id: '', className: '', style: {}, attrs: {}, kids: [], ev: {}, textContent: '', src: '', alt: '', type: '', append(...c) { this.kids.push(...c); }, setAttribute(k, v) { this.attrs[k] = v; }, addEventListener(t, f) { this.ev[t] = f; }, remove() { const i = body.kids.indexOf(this); if (i >= 0) body.kids.splice(i, 1); }, focus() {} });
  const doc = { body, documentElement: body, createElement: mk, getElementById: id => body.kids.find(k => k.id === id) || null, addEventListener: (t, f, c) => { if (t === 'keydown') assert.equal(c, true, 'Escape is caught first, in the capture phase'); listeners[t] = f; }, removeEventListener: (t, f, c) => { assert.equal(c, true, 'removed with the same capture flag'); delete listeners[t]; } };
  return { doc, body, listeners };
}
const all = e => [e, ...e.kids.flatMap(all)];

test('animate: a dialog with the scene (when painted), the plate and the name; a tap closes it after a short guard; Escape closes it; one at a time', async () => {
  const { doc, body, listeners } = fakeDoc();
  const box = showRankUp(doc, { name: 'Technician', index: 4, mode: 'game', reduced: false, say: () => assert.fail('no toast') });
  assert.equal(body.kids.length, 1);
  assert.equal(box.className, 'rankup animate');
  assert.equal(box.attrs.role, 'dialog');
  assert.match(box.attrs['aria-label'], /Technician/);
  const parts = all(box);
  assert.ok(parts.some(p => p.className === 'ru-scene' && /rankup_04_technician\.jpg/.test(p.style.backgroundImage)));
  assert.ok(parts.some(p => p.className === 'ru-plate' && /rank04_technician\.jpg/.test(p.src)));
  assert.ok(parts.some(p => p.tag === 'b' && p.textContent === 'Technician'));
  box.ev.click();
  assert.equal(body.kids.length, 1, 'an instant second tap does not skip it');
  await new Promise(r => setTimeout(r, 750));
  box.ev.click();
  assert.equal(body.kids.length, 0, 'a tap skips it');
  const again = showRankUp(doc, { name: 'Supervisor', index: 5, mode: 'game', reduced: false });
  assert.ok(all(again).some(p => p.className === 'ru-scene' && /rankup_05_supervisor\.jpg/.test(p.style.backgroundImage)), 'every rank has its own scene now');
  showRankUp(doc, { name: 'Manager', index: 6, mode: 'game', reduced: false });
  assert.equal(body.kids.length, 1, 'a new one replaces the old');
  listeners.keydown({ key: 'Escape' });
  assert.equal(body.kids.length, 0);
});

test('reduced motion shows the plate still; professional mode shows one quiet line and no dialog', () => {
  const a = fakeDoc();
  const still = showRankUp(a.doc, { name: 'Technician', index: 4, mode: 'game', reduced: true });
  assert.equal(still.className, 'rankup still');
  assert.ok(all(still).some(p => p.className === 'ru-plate'));
  const b = fakeDoc(); const said = [];
  assert.equal(showRankUp(b.doc, { name: 'Technician', index: 4, mode: 'professional', reduced: false, say: t => said.push(t) }), null);
  assert.equal(b.body.kids.length, 0);
  assert.deepEqual(said, ['Rank up: Technician.']);
  const css = readFileSync(new URL('../css/cas-desk.css', import.meta.url), 'utf8');
  assert.match(css, /\.rankup\.still, \.rankup\.still \* \{ animation: none !important; \}/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{ \.rankup, \.rankup \* \{ animation: none !important; \} \}/);
});

test('the Desk plays the moment only from the server progress, caught so it can never stop the Desk loading, and shows both plates on the Bulletin Board', () => {
  const src = readFileSync(new URL('../js/cas-desk.js', import.meta.url), 'utf8');
  const load = src.slice(src.indexOf('async function doLoad'));
  const body = load.slice(0, load.indexOf('\n}\n'));
  assert.match(body, /_rankMemory\.check\(prog\)/);
  assert.match(body, /try \{[\s\S]*showRankUp[\s\S]*\} catch/);
  assert.ok(!/rankUpOf[\s\S]{0,80}showRankUp/.test(src), 'the done response never starts the animation');
  assert.match(src, /plateFor\(p\.rank\.index\)/);
  assert.match(src, /nextPlate\(p\)/);
});

test('the card makes the app behind it inert while open, gives focus back on close, Escape stops there, a second card closes the first, the still card never times out', () => {
  const { doc, body, listeners } = fakeDoc();
  const app = { inert: false, focused: 0 };
  const prev = { focus() { app.focused++; } };
  body.children = [app];
  doc.activeElement = prev;
  const box = showRankUp(doc, { name: 'Technician', index: 4, mode: 'game', reduced: false });
  assert.equal(app.inert, true);
  let stopped = false;
  listeners.keydown({ key: 'Escape', stopImmediatePropagation() { stopped = true; } });
  assert.equal(stopped, true);
  assert.equal(app.inert, false, 'the app is live again');
  assert.equal(app.focused, 1, 'focus went back where it was');
  assert.equal(body.kids.length, 0);
  const first = showRankUp(doc, { name: 'Technician', index: 4, mode: 'game', reduced: true });
  const second = showRankUp(doc, { name: 'Manager', index: 6, mode: 'game', reduced: true });
  assert.equal(body.kids.length, 1);
  assert.equal(body.kids[0], second);
  assert.notEqual(first, second);
  assert.equal(app.inert, true);
  second.ev.click();
});

test('shown rank is kept apart from the last seen rank: a drop and a return never replay; only a new high plays; an old phone with only a seen value keeps it as shown', () => {
  const { s, storage } = mem(5);
  const m = makeRankMemory(storage);
  assert.equal(m.shown(), 5, 'a phone with only the old key');
  for (const i of [2, 5, 1, 5, 4, 5]) assert.equal(m.check(prog(i)), null);
  assert.deepEqual(m.check(prog(6)), { index: 6, name: 'R6' });
  assert.equal(m.check(prog(5)), null);
  assert.equal(m.check(prog(6)), null);
  assert.equal(s['cas-rank-shown'], '6');
  assert.equal(makeRankMemory({ getItem: k => (k === 'cas-rank-shown' ? '9' : '2'), setItem() {} }).check(prog(7)), null, 'shown wins over seen');
});
