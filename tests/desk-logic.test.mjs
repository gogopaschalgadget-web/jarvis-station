import test from 'node:test';
import assert from 'node:assert/strict';
import { casMessage, moveTo, stepBy, dropIndex, pinnedAfterMove, stepParts, linkAction, orderedIds, deskRows, rankItems } from '../js/cas-desk-logic.js';

const item = (id, extra = {}) => ({ id, project: 'p', title: 'T' + id, kind: 'review', status: 'open', minutes: 3, ...extra });
const data = { feed: { project_order: ['p'], items: [item('a'), item('b'), item('c'), item('a1', { parent_id: 'a' })] } };

test('moveTo puts a card at a slot and ignores no-ops', () => {
  assert.deepEqual(moveTo(['a', 'b', 'c'], 'c', 0), ['c', 'a', 'b']);
  assert.deepEqual(moveTo(['a', 'b', 'c'], 'a', 99), ['b', 'c', 'a']);
  assert.equal(moveTo(['a', 'b'], 'a', 0), null);
  assert.equal(moveTo(['a', 'b'], 'zz', 0), null);
});

test('stepBy moves one slot and stops at the ends', () => {
  assert.deepEqual(stepBy(['a', 'b', 'c'], 'b', -1), ['b', 'a', 'c']);
  assert.equal(stepBy(['a', 'b', 'c'], 'a', -1), null);
  assert.equal(stepBy(['a', 'b', 'c'], 'c', 1), null);
});

test('dropIndex counts the other cards above the dragged middle', () => {
  assert.equal(dropIndex([50, 150, 250], 0, 180), 1);
  assert.equal(dropIndex([50, 150, 250], 2, 10), 0);
  assert.equal(dropIndex([50, 150, 250], 1, 400), 2);
});

test('pinnedAfterMove keeps the list order and adds the moved card', () => {
  assert.deepEqual(pinnedAfterMove(['c', 'a', 'b'], ['b'], 'c'), ['c', 'b']);
});

test('steps are text or text with links', () => {
  assert.deepEqual(stepParts('x'), { text: 'x', links: [] });
  assert.deepEqual(stepParts({ text: 'y', links: [{ label: 'L' }] }).links.length, 1);
});

test('links: https opens, anything else on the web does nothing, card and tab act, PC paths are shown only', () => {
  assert.equal(linkAction({ kind: 'url', target: 'https://a.gov/x' }).href, 'https://a.gov/x');
  for (const t of ['http://a.gov', 'javascript:alert(1)', 'https://a b', '']) assert.equal(linkAction({ kind: 'url', target: t }).type, 'none');
  assert.deepEqual(linkAction({ kind: 'card', target: 'b' }), { type: 'card', id: 'b' });
  assert.deepEqual(linkAction({ kind: 'station', target: 'missions' }), { type: 'tab', id: 'missions' });
  assert.equal(linkAction({ kind: 'folder', target: 'C:/x' }).type, 'pc');
  assert.equal(linkAction(null).type, 'none');
});

test('the order falls back to the feed when the server sent none, and drops children', () => {
  assert.deepEqual(orderedIds(data), ['a', 'b', 'c']);
  assert.deepEqual(orderedIds({ ...data, order: ['c', 'a', 'gone', 'b'] }), ['c', 'a', 'b']);
  assert.deepEqual(rankItems(data.feed).map(i => i.id), ['a', 'b', 'c']);
});

test('desk rows for the Missions tab carry the stuck flag', () => {
  const rows = deskRows({ ...data, order: ['b', 'a', 'c'], stuck: { a: 'x' } });
  assert.deepEqual(rows.map(r => [r.id, r.stuck]), [['b', false], ['a', true], ['c', false]]);
  assert.deepEqual(deskRows(null), []);
});

test('the Cas message carries the line, the card summary and its steps in one go', () => {
  const parent = { title: 'Get the permit', summary: 'File the form.', steps: ['Open the site', { text: 'Pay the fee', links: [] }] };
  const text = casMessage(parent, { cas_prompt: 'I am stuck on: Get the permit. no login' }, 'no login');
  assert.equal(text, ['I am stuck on: Get the permit. no login', 'What the card says: File the form.', 'Its steps:', '1. Open the site', '2. Pay the fee'].join('\n'));
  assert.match(casMessage({ title: 'T' }, {}, 'why'), /^I am stuck on: T\. why$/);
  assert.ok(casMessage({ title: 'T', summary: 'x'.repeat(5000) }, {}, 'w').length <= 1800);
});
