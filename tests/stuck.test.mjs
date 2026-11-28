import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeStuckMeta, stuckStatus, clockNow, ageSeconds, heldLine, WAIT_SECONDS } from '../js/cas-stuck.js';

const NOW = 1_800_000_000;

test('stuck_meta is checked: unknown outcomes read as none, bad rows and non-objects are dropped', () => {
  const m = normalizeStuckMeta({ a: { at: NOW, outcome: 'left', note: ' Nothing passed ', updated_at: 0 }, b: { at: 'x', outcome: 'weird' }, c: null, d: 5 });
  assert.equal(m.a.outcome, 'left');
  assert.equal(m.a.note, 'Nothing passed');
  assert.equal(m.a.updatedAt, null);
  assert.equal(m.b.outcome, null);
  assert.equal(m.b.at, null);
  assert.equal('c' in m, false);
  assert.deepEqual(normalizeStuckMeta(null), {});
  assert.deepEqual(normalizeStuckMeta([1]), {});
});

test('no report and no missions: waiting, working, no time promise; with missions: the pill goes', () => {
  const w = stuckStatus(undefined, NOW, false);
  assert.equal(w.kind, 'waiting');
  assert.equal(w.working, true);
  assert.doesNotMatch(w.line, /minute/i);
  const k = stuckStatus(undefined, NOW, true);
  assert.equal(k.kind, 'missions');
  assert.equal(k.working, false);
});

test('after the wait with no answer the card says Cas has not answered and what happens next', () => {
  const m = normalizeStuckMeta({ a: { at: NOW - WAIT_SECONDS + 1 } }).a;
  assert.equal(stuckStatus(m, NOW, false).kind, 'waiting');
  const late = normalizeStuckMeta({ a: { at: NOW - WAIT_SECONDS } }).a;
  const s = stuckStatus(late, NOW, false);
  assert.equal(s.kind, 'timeout');
  assert.equal(s.working, false);
  assert.match(s.line, /has not answered/);
  assert.match(s.next, /orchestrator/);
});

test('the left outcome shows the server note and clears the working state', () => {
  const m = normalizeStuckMeta({ a: { at: NOW - 600, outcome: 'left', note: 'Nothing passed the checks. The card was told.' } }).a;
  const s = stuckStatus(m, NOW, false);
  assert.equal(s.kind, 'left');
  assert.equal(s.working, false);
  assert.equal(s.line, 'Nothing passed the checks. The card was told.');
  assert.equal(stuckStatus(normalizeStuckMeta({ a: { at: NOW, outcome: 'left' } }).a, NOW, false).line.length > 10, true);
});

test('a card text update after the ask is shown with its time, even before an outcome is reported', () => {
  const m = normalizeStuckMeta({ a: { at: NOW - 600, updated_at: NOW - 60 } }).a;
  const s = stuckStatus(m, NOW, false);
  assert.equal(s.kind, 'answered');
  assert.match(s.line, /^Card text updated .* after you asked\.$/);
  const before = normalizeStuckMeta({ a: { at: NOW - 60, updated_at: NOW - 600 } }).a;
  assert.notEqual(stuckStatus(before, NOW, false).kind, 'answered');
  assert.equal(stuckStatus(normalizeStuckMeta({ a: { at: NOW - 600, outcome: 'missions' } }).a, NOW, false).kind, 'missions');
});

import { readFileSync } from 'node:fs';

test('the server clock is used only when it is a real number: a string, a missing value or NaN never makes a stuck card time out', () => {
  assert.equal(clockNow({ now: 1000 }, 5000, 7000), 1002);
  assert.equal(clockNow({ now: '1000' }, 5000, 7000), null);
  assert.equal(clockNow({}, 5000, 7000), null);
  assert.equal(clockNow(null, 5000, 7000), null);
  assert.equal(clockNow({ now: NaN }, 5000, 7000), null);
  assert.equal(clockNow({ now: 1000 }, undefined, 7000), null);
  const m = normalizeStuckMeta({ a: { at: 1 } }).a;
  assert.equal(stuckStatus(m, clockNow({ now: '99999999999' }, 0, 0), false).kind, 'waiting');
  assert.equal(stuckStatus(m, clockNow({}, 0, 0), false).kind, 'waiting');
  assert.equal(stuckStatus(m, clockNow({ now: 1 + WAIT_SECONDS }, 0, 0), false).kind, 'timeout');
});

test('the feed age uses the same guard: unknown unless both times are numbers', () => {
  assert.equal(ageSeconds({ now: 1000, uploaded: 400 }, 0, 0), 600);
  assert.equal(ageSeconds({ now: '1000', uploaded: 400 }, 0, 0), null);
  assert.equal(ageSeconds({ now: 1000, uploaded: '400' }, 0, 0), null);
  assert.equal(ageSeconds({ now: 1000 }, 0, 0), null);
});

test('the held line is text only and at most 300 characters', () => {
  assert.equal(heldLine({ line: '  Waiting on you  ' }), 'Waiting on you');
  assert.equal(heldLine({ line: 'x'.repeat(500) }).length, 300);
  assert.equal(heldLine({ line: { html: '<b>x</b>' } }), '');
  assert.equal(heldLine({ line: 7 }), '');
  assert.equal(heldLine('text'), '');
  assert.equal(heldLine(null), '');
  assert.equal(heldLine({ count: 2, unavailable: true }), '');
});

test('the desk draw path uses the guards, not raw arithmetic on the server clock or the held text', () => {
  const src = readFileSync(new URL('../js/cas-desk.js', import.meta.url), 'utf8');
  assert.match(src, /clockNow\(_data, _loadedAt, Date\.now\(\)\)/);
  assert.match(src, /ageSeconds\(data, _loadedAt, Date\.now\(\)\)/);
  assert.match(src, /heldLine\(field\('held', \{\}\)\[id\]\)/);
  assert.doesNotMatch(src, /_data\.now \+ \(Date\.now\(\)/);
  assert.doesNotMatch(src, /data\.now - data\.uploaded/);
});

test('each desk read re-applies the look from its rank, so a later read with a lower rank or none falls back', async () => {
  const src = readFileSync(new URL('../js/cas-desk.js', import.meta.url), 'utf8');
  const load = src.slice(src.indexOf('async function doLoad'));
  assert.match(load.slice(0, load.indexOf('\n}\n')), /_data = data;\s*\n\s*const prog = normalizeProgress\(data\.progress\);\s*\n\s*syncLook\(prog\);/);
  const { syncLook, saveLook, DEFAULT_LOOK } = await import('../js/cas-themes.js');
  const alt = [{ id: 'forge-and-brass', name: 'F', mode: 'game', ready: true, tagline: '' }, { id: 'counting-house', name: 'C', mode: 'professional', ready: true, tagline: '' }];
  const store = {};
  globalThis.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
  globalThis.document = { documentElement: { dataset: {} } };
  saveLook({ mode: 'professional', theme: 'counting-house' }, alt);
  syncLook({ rank: { index: 4 } }, alt);
  assert.equal(document.documentElement.dataset.theme, 'counting-house');
  syncLook({ rank: { index: 3 } }, alt);
  assert.equal(document.documentElement.dataset.theme, DEFAULT_LOOK.theme);
  syncLook({ rank: { index: 4 } }, alt);
  syncLook(null, alt);
  assert.equal(document.documentElement.dataset.theme, DEFAULT_LOOK.theme);
});

import { noteBox } from '../js/cas-stuck.js';

test('the What Cas did box: the note, when Stuck was tapped and when the words last changed, only for a reported outcome with a note', () => {
  const m = normalizeStuckMeta({ a: { at: NOW, outcome: 'missions', note: '2 repair missions added, 1 done.', updated_at: NOW + 60 } }).a;
  const b = noteBox(m);
  assert.equal(b.label, 'What Cas did');
  assert.equal(b.note, '2 repair missions added, 1 done.');
  assert.match(b.tapped, /\d/);
  assert.match(b.changed, /\d/);
  assert.notEqual(b.tapped, b.changed);
  const unknown = noteBox(normalizeStuckMeta({ a: { at: NOW, outcome: 'left', note: 'Held.', updated_at: null } }).a);
  assert.equal(unknown.changed, '');
  assert.equal(noteBox(normalizeStuckMeta({ a: { at: NOW, outcome: null, note: null } }).a), null);
  assert.equal(noteBox(normalizeStuckMeta({ a: { at: NOW, outcome: 'left', note: '' } }).a), null);
  assert.equal(noteBox(undefined), null);
  assert.equal(noteBox('x'), null);
});

test('the status carries the box for missions, left and answered, never while waiting or after a timeout', () => {
  const meta = o => normalizeStuckMeta({ a: { at: NOW, note: 'Note.', ...o } }).a;
  assert.equal(stuckStatus(meta({ outcome: 'missions' }), NOW, true).box.note, 'Note.');
  assert.equal(stuckStatus(meta({ outcome: 'left' }), NOW, false).box.note, 'Note.');
  assert.equal(stuckStatus(meta({ outcome: 'answered' }), NOW, true).box.note, 'Note.');
  assert.equal(stuckStatus(meta({ outcome: null, note: null }), NOW, false).box, undefined);
  assert.equal(stuckStatus(meta({ outcome: null, note: null }), NOW + WAIT_SECONDS + 1, false).box, undefined);
  assert.equal(stuckStatus(undefined, NOW, true).box, undefined);
});

test('every changed module carries the new tag and the service worker the new version', () => {
  const idx = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
  const desk = readFileSync(new URL('../js/cas-desk.js', import.meta.url), 'utf8');
  assert.match(idx, /js\/app\.js\?v=cas120/);
  assert.match(idx, /cas-desk\.css\?v=29/);
  assert.match(app, /cas-desk\.js\?v=cas120/);
  assert.match(desk, /cas-stuck\.js\?v=cas107/);
});

const fakeNode = tag => {
  const node = { tag, classList: { set: new Set(), toggle(c, on) { on ? this.set.add(c) : this.set.delete(c); }, contains(c) { return this.set.has(c); }, remove(c) { this.set.delete(c); } }, className: '', textContent: '', children: [], type: '', attrs: {}, style: {}, listeners: {}, tabIndex: -1,
    addEventListener(name, fn) { (node.listeners[name] = node.listeners[name] || []).push(fn); },
    setAttribute(k, v) { node.attrs[k] = v; }, append(...kids) { kids.forEach(k => node.children.push(k)); }, remove() { node.removed = true; },
    fire(name, event = {}) { (node.listeners[name] || []).forEach(fn => fn({ preventDefault() {}, stopPropagation() {}, ...event })); }, clientWidth: 300 };
  return node;
};
const fakeDocument = () => ({
  body: fakeNode('body'),
  documentElement: { dataset: {} },
  createElement: tag => fakeNode(tag),
});
const fakeDocumentOld = () => ({
  documentElement: { dataset: {} },
  createElement: tag => {
    const node = { tag, className: '', textContent: '', children: [], type: '', addEventListener() {}, append(...kids) { kids.forEach(k => node.children.push(k)); } };
    return node;
  },
});
globalThis.document = fakeDocument();
globalThis.localStorage = { getItem: () => null, setItem() {} };
const { actions } = await import('../js/cas-desk.js');
const { heldRepeated } = await import('../js/cas-stuck.js');
const EVIL = '<img src=x onerror=alert(1)> Cas did it';
const render = (meta, { hasKids = false, held = '', now = NOW } = {}) => {
  globalThis.document = fakeDocument();
  const normalized = normalizeStuckMeta(meta === undefined ? undefined : { c: meta }).c;
  const status = stuckStatus(normalized, now, hasKids);
  return actions({ id: 'c', choices: [] }, { why: 'W', held, status, hasKids });
};
const classes = box => box.children.map(c => c.className);
const stuckLine = box => (box.children.find(c => c.className.startsWith('dk-stuckline')) || {}).textContent;

for (const outcome of ['left', 'answered', 'missions']) {
  test(`the real card for outcome ${outcome} shows one box with the note as plain text and none of the old lines`, () => {
    const box = render({ at: NOW - 600, outcome, note: EVIL, updated_at: NOW - 60 }, { hasKids: outcome !== 'left' });
    const boxes = box.children.filter(c => c.className === 'dk-casdid');
    assert.equal(boxes.length, 1);
    const note = boxes[0].children.find(c => c.className === 'dk-cdnote');
    assert.equal(note.textContent, EVIL);
    assert.equal(note.children.length, 0);
    assert.equal(boxes[0].children.filter(c => c.className === 'dk-cdtime').length, 2);
    const line = stuckLine(box) || '';
    assert.doesNotMatch(line, /Card text updated|Cas answered|Repair missions are listed above|nothing passed the checks/);
    assert.match(line, /You said: W/);
  });
}

const SAID = 'You said: W';
const OLD = [
  ['key absent', undefined, {}, 'Cas has been asked. Nothing has come back yet.', 'dk-stuckline waiting'],
  ['empty meta entry', {}, {}, 'Cas has been asked. Nothing has come back yet.', 'dk-stuckline waiting'],
  ['all-null entry', { at: null, outcome: null, note: null, updated_at: null }, {}, 'Cas has been asked. Nothing has come back yet.', 'dk-stuckline waiting'],
  ['outcome without a note (left)', { at: NOW - 600, outcome: 'left', note: '' }, {}, 'Cas answered, but nothing passed the checks, so there are no repair missions. Your question also went to the orchestrator. Unstuck puts the card back to normal.', 'dk-stuckline left'],
  ['outcome without a note (missions)', { at: NOW - 600, outcome: 'missions', note: '' }, { hasKids: true }, 'Repair missions are below.', 'dk-stuckline missions'],
  ['note without an outcome', { at: NOW - 10, outcome: null, note: 'A note' }, {}, 'Cas has been asked. Nothing has come back yet.', 'dk-stuckline waiting'],
  ['waiting', { at: NOW - 10 }, {}, 'Cas has been asked. Nothing has come back yet.', 'dk-stuckline waiting'],
  ['timeout', { at: NOW - WAIT_SECONDS - 5 }, {}, 'Cas has not answered yet. Your question also went to the orchestrator.', 'dk-stuckline timeout'],
];
for (const [name, meta, opts, line, cls] of OLD) {
  test(`card without a box: ${name}: what you said first, then the status, then Unstuck`, () => {
    const box = render(meta, opts);
    assert.deepEqual(classes(box), ['dk-stuckline said', cls, 'dk-act', 'dk-note dk-actnote']);
    assert.equal(box.children[0].textContent, SAID);
    assert.equal(box.children[1].textContent, line);
    assert.equal(box.children.some(c => c.className === 'dk-casdid'), false);
  });
}

test('a huge or odd time never prints Invalid Date: the row is left out', () => {
  for (const bad of [0, -5, '1800000000', Infinity, 1e20]) {
    for (const outcome of ['left', 'answered', 'missions']) {
      const meta = normalizeStuckMeta({ a: { at: bad, outcome, note: 'Note.', updated_at: bad } }).a;
      const everything = JSON.stringify([noteBox(meta), stuckStatus(meta, NOW, false)]);
      assert.doesNotMatch(everything, /Invalid/);
    }
  }
  const m = normalizeStuckMeta({ a: { at: 1e20, outcome: 'missions', note: 'Note.', updated_at: 1e20 } }).a;
  assert.equal(noteBox(m).tapped, '');
  assert.equal(noteBox(m).changed, '');
  const answered = stuckStatus(normalizeStuckMeta({ a: { at: NOW, outcome: 'answered', updated_at: 1e20 } }).a, NOW, false);
  assert.equal(answered.line, 'Cas answered.');
  const noOutcome = stuckStatus(normalizeStuckMeta({ a: { at: NOW, updated_at: 1e20 } }).a, NOW, false);
  assert.equal(noOutcome.kind, 'waiting');
});

test('a held line is hidden only when the box already says it: equal text, or a long held line the note ends with', () => {
  const held = 'Cas held back 1 step (it involved money or a payment). The orchestrator is finishing it.';
  assert.equal(heldRepeated(held, '  ' + held + ' '), true);
  assert.equal(heldRepeated('2 repair missions added, 1 done. ' + held, held), true);
  assert.equal(heldRepeated('Done.', held), false);
  assert.equal(heldRepeated('A very short note', 'short'), false);
  assert.equal(heldRepeated('Held. Held.', 'Held.'), false);
  assert.equal(heldRepeated('note', ''), false);
  assert.equal(heldRepeated(null, held), false);
  const box = render({ at: NOW - 600, outcome: 'left', note: held }, { held });
  assert.equal(box.children.some(c => c.className === 'dk-heldline'), false);
  const other = render({ at: NOW - 600, outcome: 'left', note: 'Short.' }, { held });
  assert.equal(other.children.some(c => c.className === 'dk-heldline'), true);
});


import { slideFraction, slideDone, SLIDE_CONFIRM, normalizeRepairXp, repairChip } from '../js/cas-stuck.js';
const { stuckSheet } = await import('../js/cas-desk.js');

const walk = (node, out = []) => { out.push(node); (node.children || []).forEach(c => walk(c, out)); return out; };

test('a stuck card reads in the order it happened: what you said, what Cas did, the missions, then Unstuck', () => {
  globalThis.document = fakeDocument();
  const kids = globalThis.document.createElement('div');
  kids.className = 'dk-kids';
  const meta = { at: NOW - 600, outcome: 'missions', note: '2 repair missions added, 0 done.', updated_at: NOW - 60 };
  const normalized = normalizeStuckMeta({ c: meta }).c;
  const box = actions({ id: 'c', choices: [] }, { why: 'W', held: '', status: stuckStatus(normalized, NOW, true), hasKids: true }, kids);
  assert.deepEqual(classes(box), ['dk-stuckline said', 'dk-casdid', 'dk-kids', 'dk-act', 'dk-note dk-actnote']);
});

test('without a box the order is what you said, the status line, the missions, then Unstuck', () => {
  globalThis.document = fakeDocument();
  const kids = globalThis.document.createElement('div');
  kids.className = 'dk-kids';
  const box = actions({ id: 'c', choices: [] }, { why: 'W', held: '', status: stuckStatus(undefined, NOW, true), hasKids: true }, kids);
  assert.deepEqual(classes(box), ['dk-stuckline said', 'dk-stuckline missions', 'dk-kids', 'dk-act', 'dk-note dk-actnote']);
  assert.equal(box.children[1].textContent, 'Repair missions are below.');
});

test('the slide: a fraction is clamped, a bad number is zero, and only 90 percent or more confirms', () => {
  assert.equal(slideFraction(150, 300), 0.5);
  assert.equal(slideFraction(-40, 300), 0);
  assert.equal(slideFraction(900, 300), 1);
  for (const bad of [NaN, Infinity, '5', null, undefined]) assert.equal(slideFraction(bad, 300), 0);
  for (const bad of [0, -1, NaN, '300']) assert.equal(slideFraction(100, bad), 0);
  assert.equal(SLIDE_CONFIRM, 0.9);
  assert.equal(slideDone(0.89), false);
  assert.equal(slideDone(0.9), true);
  assert.equal(slideDone(1), true);
  assert.equal(slideDone(NaN), false);
  assert.equal(slideDone('1'), false);
});

test('the sheet quotes the question as plain text, Cancel sends nothing, and a short drag springs back', () => {
  globalThis.document = fakeDocument();
  const calls = [];
  const sheet = stuckSheet('<img src=x onerror=alert(1)> I need examples', () => calls.push('confirm'), () => calls.push('cancel'));
  const nodes = walk(sheet);
  const quote = nodes.find(n => n.className === 'dk-sheetq');
  assert.equal(quote.textContent, '\u201c<img src=x onerror=alert(1)> I need examples\u201d');
  assert.equal(quote.children.length, 0);
  const sliderNode = nodes.find(n => n.className === 'dk-slide');
  const knob = nodes.find(n => n.className === 'dk-knob');
  knob.clientWidth = 46;
  assert.equal(sliderNode.attrs.role, 'slider');
  knob.fire('pointerdown', { clientX: 10, pointerId: 1 });
  knob.fire('pointermove', { clientX: 100 });
  knob.fire('pointerup', { clientX: 100 });
  assert.deepEqual(calls, []);
  assert.equal(sliderNode.attrs['aria-valuenow'], '0');
  nodes.find(n => n.className === 'dk-link dk-sheetcancel').fire('click');
  nodes.find(n => n.className === 'dk-scrim').fire('click');
  assert.deepEqual(calls, ['cancel', 'cancel']);
});

test('a full slide confirms exactly once, by pointer or by keyboard', () => {
  globalThis.document = fakeDocument();
  const calls = [];
  const sheet = stuckSheet('q', () => calls.push('confirm'), () => calls.push('cancel'));
  const nodes = walk(sheet);
  const knob = nodes.find(n => n.className === 'dk-knob');
  knob.clientWidth = 46;
  knob.fire('pointerdown', { clientX: 0, pointerId: 1 });
  knob.fire('pointermove', { clientX: 400 });
  knob.fire('pointerup', { clientX: 400 });
  knob.fire('pointerdown', { clientX: 0, pointerId: 2 });
  knob.fire('pointerup', { clientX: 400 });
  nodes.find(n => n.className === 'dk-slide').fire('keydown', { key: 'Enter' });
  assert.deepEqual(calls, ['confirm']);
  globalThis.document = fakeDocument();
  const again = [];
  const second = walk(stuckSheet('q', () => again.push('confirm'), () => {})).find(n => n.className === 'dk-slide');
  second.fire('keydown', { key: 'ArrowRight' });
  assert.deepEqual(again, ['confirm']);
  second.fire('keydown', { key: 'a' });
  assert.deepEqual(again, ['confirm']);
});

test('repair XP rows are checked and the chip says the size, then what it earned', () => {
  const ok = normalizeRepairXp({ m1: { size: 'small', xp: 5, earned: null }, m2: { size: 'large', xp: 20, earned: 20 }, bad1: { size: 'huge', xp: 5 }, bad2: { size: 'small', xp: -1 },
    bad3: { size: 'small', xp: 5.5 }, bad4: null, bad5: 'x', m3: { size: 'medium', xp: 10, earned: 'lots' } });
  assert.deepEqual(Object.keys(ok), ['m1', 'm2', 'm3']);
  assert.equal(ok.m3.earned, null);
  assert.equal(repairChip(ok.m1), 'Small, 5 XP');
  assert.equal(repairChip(ok.m2), 'Large, 20 XP earned');
  assert.equal(repairChip(null), '');
  assert.equal(repairChip({ size: 'nope', xp: 1 }), '');
  for (const raw of [null, undefined, [], 'x', 5]) assert.deepEqual(normalizeRepairXp(raw), {});
});

test('the desk source draws the stamp from the stuck state, scrolls to the missions and sends nothing until the slide is done', () => {
  const src = readFileSync(new URL('../js/cas-desk.js', import.meta.url), 'utf8');
  assert.match(src, /if \(ctx\.stuckNow\) marks\.append\(button\('dk-stamp', 'STUCK', \(\) => goToMissions\(c, item\.id\)\)\);/);
  assert.match(src, /openStuckSheet\(item, text\(\)\);/);
  const stuckClick = src.slice(src.indexOf("row.append(button('dk-act', 'Stuck'"), src.indexOf('box.append(row);'));
  assert.doesNotMatch(stuckClick, /answer\(item\.id, 'stuck'/);
  assert.match(src, /const sheet = stuckSheet\(why, \(\) => \{ sheet\.remove\(\); answer\(item\.id, 'stuck', \{ why \}\); \}/);
});

import { STUCK_MAX, STUCK_NEAR, countLine, countNear, oneLine } from '../js/cas-stuck.js';
const { whyInput } = await import('../js/cas-desk.js');

test('the stuck line allows 1000 characters, counts them, warns near the end and sends one clean line', () => {
  assert.equal(STUCK_MAX, 1000);
  assert.equal(STUCK_NEAR, 900);
  assert.equal(countLine(0), '0 / 1000');
  assert.equal(countLine(123), '123 / 1000');
  assert.equal(countLine(5000), '1000 / 1000');
  for (const bad of [NaN, -3, 2.5, '7', null, undefined]) assert.equal(countLine(bad), '0 / 1000');
  assert.equal(countNear(899), false);
  assert.equal(countNear(900), true);
  assert.equal(countNear(NaN), false);
  assert.equal(oneLine('  first\r\nsecond \n\n third  '), 'first second third');
  assert.equal(oneLine('a\tb\u0000c\u0007d\u001be\u007ff'), 'a b c d e f');
  assert.equal(oneLine('tab\t\tseparated\tline'), 'tab separated line');
  assert.equal(oneLine('plain text, kept: as is (1/2).'), 'plain text, kept: as is (1/2).');
  for (const text of ['a\tb', 'x\u0001y\nz', '\u001f\u001e']) assert.equal([...oneLine(text)].some(ch => ch.charCodeAt(0) < 32), false);
  assert.equal(oneLine(null), '');
});

test('the stuck line is a roomy box with a visible counter that follows the typing and turns red near the limit', () => {
  globalThis.document = fakeDocument();
  const wrap = whyInput('c', 'If stuck: what is in the way?');
  const box = wrap.children[0];
  const counter = wrap.children[1];
  assert.equal(box.tag, 'textarea');
  assert.equal(box.maxLength, 1000);
  assert.equal(box.rows, 3);
  assert.equal(counter.className, 'dk-count');
  assert.equal(counter.textContent, '0 / 1000');
  box.value = 'x'.repeat(950);
  box.fire('input');
  assert.equal(counter.textContent, '950 / 1000');
  assert.equal(counter.classList.contains('near'), true);
  box.value = 'x'.repeat(10);
  box.fire('input');
  assert.equal(counter.textContent, '10 / 1000');
  assert.equal(counter.classList.contains('near'), false);
  let prevented = false;
  box.fire('keydown', { key: 'Enter', preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
});
