import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { openIds } from '../js/cas-desk-logic.js';
import { PLACES, BENCH, tileFor, tileBuckets, loopsFor, lampFor, tileAfterJump, viewFor, tileArt } from '../js/cas-places.js';

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

test('a blueprint tile shows no loop lamp', () => {
  const q = PLACES.find(p => p.id === 'quora');
  assert.equal(q.built, false);
  assert.equal(lampFor(q, [{ id: 'quora_answers', status: 'running' }]), 'none');
});

test('a jump keeps the tile filter only when the card is on that tile, else clears it', () => {
  assert.equal(tileAfterJump('mint', { project: 'veteran-prints' }), 'mint');
  assert.equal(tileAfterJump('mint', { project: 'x-posts' }), null);
  assert.equal(tileAfterJump('mint', null), null);
  assert.equal(tileAfterJump(null, { project: 'x-posts' }), null);
});

test('tile counts: stuck cards count, held cards do not', () => {
  const data = {
    feed: { items: [{ id: 'a', project: 'veteran-prints' }, { id: 'b', project: 'veteran-prints' }, { id: 'c', project: 'veteran-prints' }] },
    order: ['a', 'b', 'c'], stuck: { b: 'why' }, held_cards: [{ id: 'c', title: 'C', hold: { until: '2026-11-25', reason: 'r' } }],
  };
  const items = new Map(data.feed.items.map(i => [i.id, i]));
  assert.deepEqual(tileBuckets(openIds(data), items).get('mint'), ['a', 'b']);
});

test('the drawn view is the tile list, so a fold over the target is judged by position in that view', () => {
  const items = new Map();
  const ids = [];
  for (let i = 0; i < 8; i++) { const id = 'm' + i; items.set(id, { id, project: i === 7 ? 'x-posts' : 'veteran-prints' }); ids.push(id); }
  assert.deepEqual(viewFor(ids, items, null), ids);
  assert.deepEqual(viewFor(ids, items, 'x'), ['m7']);
  assert.equal(viewFor(ids, items, 'x').indexOf('m7'), 0);
  assert.equal(ids.indexOf('m7'), 7);
  assert.deepEqual(viewFor(ids, items, 'quora'), []);
});

test('every tile has a picture file in the repo; unbuilt places use the blueprint picture; text never depends on it', () => {
  [...PLACES, BENCH].forEach(p => {
    const art = tileArt(p);
    assert.ok(art, p.id);
    assert.ok(existsSync(new URL('../' + art, import.meta.url)), art);
  });
  assert.equal(tileArt(PLACES.find(p => p.id === 'quora')), 'assets/themes/forge-and-brass/blueprints/tiles_blueprint/quora.jpg');
  assert.equal(tileArt(PLACES.find(p => p.id === 'mint')), 'assets/themes/forge-and-brass/tiles/mint.jpg');
  assert.equal(tileArt(null), null);
});
