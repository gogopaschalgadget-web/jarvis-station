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
