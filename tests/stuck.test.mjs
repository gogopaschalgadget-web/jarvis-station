import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeStuckMeta, stuckStatus, WAIT_SECONDS } from '../js/cas-stuck.js';

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
