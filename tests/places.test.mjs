import test from 'node:test';
import assert from 'node:assert/strict';
import { PLACES, BENCH, tileFor, tileBuckets, loopsFor, lampFor } from '../js/cas-places.js';

const ids = PLACES.map(p => p.id);

test('place ids are unique and every blueprint tile is a channel', () => {
  assert.equal(new Set([...ids, BENCH.id]).size, ids.length + 1);
  PLACES.filter(p => !p.built).forEach(p => assert.equal(p.row, 'channels'));
});

test('a card finds its tile from its project; no match goes to the bench', () => {
  assert.equal(tileFor({ project: 'veteran-prints' }), 'mint');
  assert.equal(tileFor({ project: 'x-posts' }), 'x');
  assert.equal(tileFor({ project: 'station' }), 'spire');
  assert.equal(tileFor({ project: 'nothing-like-it' }), 'bench');
  assert.equal(tileFor({}), 'bench');
  assert.equal(tileFor(null), 'bench');
  assert.equal(tileFor({ project: 7 }), 'bench');
});

test('every project is claimed by one place only', () => {
  const all = PLACES.flatMap(p => p.projects);
  assert.equal(new Set(all).size, all.length);
});

test('tileBuckets keeps order, skips unknown ids and covers every tile', () => {
  const items = new Map([['a', { project: 'veteran-prints' }], ['b', { project: 'x-posts' }], ['c', { project: 'zzz' }], ['d', { project: 'veteran-prints' }]]);
  const b = tileBuckets(['a', 'b', 'c', 'd', 'ghost'], items);
  assert.deepEqual(b.get('mint'), ['a', 'd']);
  assert.deepEqual(b.get('x'), ['b']);
  assert.deepEqual(b.get('bench'), ['c']);
  assert.deepEqual(b.get('quora'), []);
  assert.equal(b.size, PLACES.length + 1);
});

test('lamp comes only from the tile\'s own loops: blocked, then waiting, then running, else not reported', () => {
  const x = PLACES.find(p => p.id === 'x');
  assert.equal(lampFor(x, []), 'none');
  assert.equal(lampFor(x, null), 'none');
  assert.equal(lampFor(x, [{ id: 'x_posts', status: 'running' }]), 'running');
  assert.equal(lampFor(x, [{ id: 'x_posts', status: 'waiting_you' }]), 'waiting');
  assert.equal(lampFor(x, [{ id: 'x_posts', status: 'idle' }]), 'none');
  assert.equal(lampFor(x, [{ id: 'reddit_posts', status: 'blocked' }]), 'none');
  const two = { ...x, loops: ['a', 'b'] };
  assert.equal(lampFor(two, [{ id: 'a', status: 'running' }, { id: 'b', status: 'blocked' }]), 'blocked');
  assert.equal(loopsFor(two, [{ id: 'a' }, { id: 'c' }, null]).length, 1);
});
