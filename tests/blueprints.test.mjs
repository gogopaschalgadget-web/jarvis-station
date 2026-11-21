import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeBlueprints, filterIdeas, blueprintView, ideasForPlace, dependsTitles } from '../js/cas-blueprints.js';

const rec = (id, o = {}) => ({ id, title: 'T ' + id, one_line: 'line', area: 'station', state: 'idea', size: 'medium', fun_or_work: 'work', depends_on: [], ...o });

test('records are checked: unknown keys such as file paths are dropped, bad records skipped, duplicates ignored', () => {
  const list = normalizeBlueprints([rec('a', { where: ['C:/secret/path.md'], extra: 1 }), null, { id: 'b' }, rec('a'), rec('c', { state: 'weird' }), rec('d', { area: 'nowhere', size: 'huge' })]);
  assert.deepEqual(list.map(i => i.id), ['a', 'd']);
  assert.equal(JSON.stringify(list).includes('secret'), false);
  assert.equal(list[1].area, 'other');
  assert.equal(list[1].size, '');
  assert.deepEqual(normalizeBlueprints('x'), []);
  assert.deepEqual(normalizeBlueprints(undefined), []);
});

test('only idea, designed and parked ideas are blueprints; built, being built and dropped are listed apart', () => {
  const list = normalizeBlueprints([rec('a'), rec('b', { state: 'designed' }), rec('c', { state: 'parked' }), rec('d', { state: 'live' }), rec('e', { state: 'built-not-live' }), rec('f', { state: 'building' }), rec('g', { state: 'dropped' })]);
  const v = blueprintView(list, {});
  assert.equal(v.openCount, 3);
  assert.deepEqual(v.groups[0].items.map(i => i.id), ['b', 'a', 'c']);
  assert.deepEqual(v.built.map(i => i.id), ['d', 'e', 'f']);
  assert.deepEqual(v.dropped.map(i => i.id), ['g']);
});

test('sorting: smallest first; with Fun on, fun first then both; filters by kind and size', () => {
  const list = normalizeBlueprints([rec('w', { fun_or_work: 'work', size: 'small' }), rec('f', { fun_or_work: 'fun', size: 'large' }), rec('b', { fun_or_work: 'both', size: 'small' }), rec('f2', { fun_or_work: 'fun', size: 'small' })]);
  assert.deepEqual(filterIdeas(list, {}).map(i => i.id), ['b', 'f2', 'w', 'f']);
  assert.deepEqual(filterIdeas(list, { fun: 'fun' }).map(i => i.id), ['f2', 'f', 'b']);
  assert.deepEqual(filterIdeas(list, { fun: 'work' }).map(i => i.id), ['w', 'b']);
  assert.deepEqual(filterIdeas(list, { size: 'large' }).map(i => i.id), ['f']);
  assert.deepEqual(filterIdeas(list, { fun: 'fun', size: 'small' }).map(i => i.id), ['f2', 'b']);
});

test('ideas for a place match by the place name and only open ideas; depends-on shows titles', () => {
  const list = normalizeBlueprints([rec('a', { map_tile: 'The Mint' }), rec('b', { map_tile: 'The Mint', state: 'live' }), rec('c', { map_tile: 'X', depends_on: ['a', 'zzz'] })]);
  assert.deepEqual(ideasForPlace(list, 'The Mint').map(i => i.id), ['a']);
  assert.deepEqual(dependsTitles(list.find(i => i.id === 'c'), list), ['T a', 'zzz']);
});
