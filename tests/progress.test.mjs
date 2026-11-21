import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeProgress, xpLine, rankUpOf } from '../js/cas-progress.js';

const good = { xp: 870, rank: { index: 3, name: 'Beginner', at: 500, next_at: 1500, next_name: 'Technician' }, desks: [{ id: 'ops', name: 'Operations', machine: 'Forge', tier: 'Enhanced', xp: 560, next_at: 3000 }, { id: 'cx', name: 'Customer Experience', placeholder: true }], today: { xp: 20, cards: 2 }, days_at_desk: 12 };

test('a good progress block is read with bars computed from real numbers', () => {
  const p = normalizeProgress(good);
  assert.equal(p.rank.name, 'Beginner');
  assert.equal(p.rank.pct, 37);
  assert.equal(p.rank.toGo, 630);
  assert.equal(p.desks.length, 2);
  assert.equal(p.desks[0].pct, 19);
  assert.equal(p.desks[1].placeholder, true);
  assert.equal(p.days, 12);
});

test('no usable rank means no block at all, nothing guessed', () => {
  assert.equal(normalizeProgress(null), null);
  assert.equal(normalizeProgress({}), null);
  assert.equal(normalizeProgress({ xp: 5 }), null);
  assert.equal(normalizeProgress({ xp: 'many', rank: { index: 1, name: 'A' } }), null);
  assert.equal(normalizeProgress({ xp: 5, rank: { index: -1, name: 'A' } }), null);
  assert.equal(normalizeProgress({ xp: 5, rank: { index: 1, name: '  ' } }), null);
});

test('bars are clamped and the top rank is full', () => {
  assert.equal(normalizeProgress({ xp: 9999, rank: { index: 3, name: 'A', at: 0, next_at: 100 } }).rank.pct, 100);
  const top = normalizeProgress({ xp: 9999, rank: { index: 12, name: 'Chair', at: 9000 } });
  assert.equal(top.rank.pct, 100);
  assert.equal(top.rank.toGo, 0);
  assert.equal(normalizeProgress({ xp: 10, rank: { index: 1, name: 'A', at: 50, next_at: 100 } }).rank.pct, 0);
});

test('malformed desks are dropped and capped', () => {
  const many = Array.from({ length: 12 }, (_, i) => ({ id: 'd' + i, name: 'D' + i, xp: 1 }));
  const p = normalizeProgress({ ...good, desks: [null, 5, { id: '', name: 'x' }, ...many] });
  assert.equal(p.desks.length, 8);
  assert.equal(normalizeProgress({ ...good, desks: 'nope' }).desks.length, 0);
});

test('xp line and rank-up read only what the server reported', () => {
  assert.equal(xpLine({ xp_gained: 15 }), '+15 XP');
  assert.equal(xpLine({ xp_gained: 0 }), '');
  assert.equal(xpLine({ xp_gained: 'x' }), '');
  assert.equal(xpLine(null), '');
  assert.deepEqual(rankUpOf({ rank_up: { name: 'Technician', index: 4 } }), { name: 'Technician', index: 4 });
  assert.equal(rankUpOf({ rank_up: {} }), null);
  assert.equal(rankUpOf({}), null);
});
