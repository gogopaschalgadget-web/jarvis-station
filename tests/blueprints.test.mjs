import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeBlueprints, filterIdeas, blueprintView, ideasForPlace, dependsTitles, ideaArt, AREAS } from '../js/cas-blueprints.js';

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
  assert.deepEqual(ideasForPlace(list, { id: 'mint', name: 'The Mint' }).map(i => i.id), ['a']);
  assert.deepEqual(ideasForPlace(normalizeBlueprints([rec('p', { map_tile: 'mint' }), rec('q', { map_tile: '' }), rec('r')]), { id: 'mint', name: 'The Mint' }).map(i => i.id), ['p']);
  assert.deepEqual(ideasForPlace(list, null), []);
  assert.deepEqual(dependsTitles(list.find(i => i.id === 'c'), list), ['T a', 'zzz']);
});

test('the answer to a want tap is worded from the status and the tap count only', async () => {
  const { wantLine } = await import('../js/cas-blueprints.js');
  assert.equal(wantLine(200, { wants: 1 }), 'Sent to the orchestrator.');
  assert.equal(wantLine(200, { wants: 3 }), 'Sent to the orchestrator. You have asked for this on 3 days.');
  assert.equal(wantLine(200, null), 'Sent to the orchestrator.');
  assert.match(wantLine(429), /Too many taps/);
  assert.match(wantLine(422), /no longer on the list/);
  assert.equal(wantLine(0), 'Not sent. Try again.');
});

test('every idea has a drawing file in the repo: its own, else its area, else the generic one', async () => {
  const { existsSync } = await import('node:fs');
  const ids = ['artwork-reveal-gallery', 'cas-avatar-levels', 'desk-machines-animations', 'money-gauge-wall', 'theme-pack-game-vs-professional', 'customer-experience-switchboard', '3d-map-live-rooms', 'picture-bot-taste-loop', 'signal-tower-ripple', 'finishing-stretch-steps-left'];
  ids.forEach(id => assert.ok(existsSync(new URL('../' + ideaArt({ id, area: 'other' }), import.meta.url)), id));
  AREAS.forEach(([k]) => assert.ok(existsSync(new URL('../' + ideaArt({ id: 'zzz', area: k }), import.meta.url)), k));
  assert.match(ideaArt({ id: 'zzz', area: 'nowhere' }), /blueprint_tile\.jpg$/);
  assert.equal(ideaArt(null), null);
  assert.ok(existsSync(new URL('../' + ideaArt({ id: 'zzz', area: 'nowhere' }), import.meta.url)));
});

test('inherited names like "constructor" or "toString" are not states, sizes or filters', () => {
  const list = normalizeBlueprints([rec('a', { state: 'constructor' }), rec('b', { state: 'toString' }), rec('c', { size: 'constructor' }), rec('d', { size: '__proto__' })]);
  assert.deepEqual(list.map(i => i.id), ['c', 'd']);
  assert.equal(list[0].size, '');
  assert.equal(list[1].size, '');
  const order = filterIdeas(list, { size: 'constructor' });
  assert.equal(order.length, 2);
  assert.deepEqual(filterIdeas(list, {}).map(i => i.id), ['c', 'd']);
});

test('a 401 on the want tap says the sign-in has expired', async () => {
  const { wantLine } = await import('../js/cas-blueprints.js');
  assert.match(wantLine(401), /sign-in has expired/);
});
