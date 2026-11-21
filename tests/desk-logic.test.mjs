import test from 'node:test';
import assert from 'node:assert/strict';
import { DESK_SUBS, LANDING_SUB, unseenLinks, casMessage, moveTo, stepBy, dropIndex, pinnedAfterMove, stepParts, stepDetail, termMap, textParts, plainItem, cleanSources, linkAction, orderedIds, deskRows, rankItems, holdUntil, holdDates, serverDay, heldCards, dayWords, deskDay, returnDay, openIds, isHttps, linkHost } from '../js/cas-desk-logic.js';

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

test('stepDetail returns the extra lines and nothing for plain steps', () => {
  assert.deepEqual(stepDetail('x'), []);
  assert.deepEqual(stepDetail({ text: 'y', links: [] }), []);
  assert.deepEqual(stepDetail({ text: 'y', detail: ['a', '', 7, 'b'] }), ['a', 'b']);
});

test('textParts splits at term markers and reads an unknown marker as words', () => {
  const terms = termMap({ terms: [{ key: 'naics', name: 'NAICS code' }] });
  assert.deepEqual(textParts('Find your {{naics}} now', terms).map(p => p.term ? p.term.name : p.text), ['Find your ', 'NAICS code', ' now']);
  assert.deepEqual(textParts('A {{some_thing}} here', terms).map(p => p.text), ['A ', 'some thing', ' here']);
  assert.deepEqual(textParts('plain text', new Map()), [{ text: 'plain text' }]);
  assert.deepEqual(textParts('{{naics}}', terms).length, 1);
});

test('cleanSources keeps https sources once each', () => {
  const got = cleanSources([{ label: 'A', url: 'https://a.test/x' }, { label: 'A again', url: 'https://a.test/x' }, { label: 'B', url: 'http://b.test' }, { label: '', url: 'https://c.test' }, null]);
  assert.deepEqual(got.map(s => s.label), ['A']);
  assert.deepEqual(cleanSources(undefined), []);
});

test('a long valid key matches; upper-case, spaced and undefined markers read as plain words', () => {
  const long = 'a' + 'b'.repeat(39);
  const terms = termMap({ terms: [{ key: long, name: 'Long term' }] });
  assert.equal(terms.size, 1);
  assert.deepEqual(textParts(`x {{${long}}}`, terms).map(p => p.term ? p.term.name : p.text), ['x ', 'Long term']);
  assert.deepEqual(textParts('{{NAICS}} and {{two words}} and {{nope_key}}', terms).map(p => p.text).join(''), 'NAICS and two words and nope key');
  assert.ok(!JSON.stringify(textParts('{{Bad Key}}', terms)).includes('{{'));
});

test('bad shapes never throw: non-array terms, a step with no text', () => {
  assert.equal(termMap({ terms: 'oops' }).size, 0);
  assert.equal(termMap({ terms: { a: 1 } }).size, 0);
  assert.deepEqual(textParts(undefined, new Map()), [{ text: '' }]);
  assert.doesNotThrow(() => plainItem({ id: 'a', summary: 'See {{naics}}', steps: [{ links: [] }, 'Do {{x}}', { text: 'Y {{z}}', links: [{ label: 'L' }] }], terms: 5 }));
});

test('plainItem gives back the old plain form with no markers', () => {
  const p = plainItem({ id: 'a', title: 'T', summary: 'Get your {{naics}}', steps: ['Open {{esys}} now', { text: 'Then {{naics}}', links: [{ label: 'L' }], detail: ['d'] }], terms: [{ key: 'naics', name: 'N' }], sources: [{ label: 's', url: 'https://x.test' }] });
  assert.equal(p.summary, 'Get your naics');
  assert.equal(p.steps[0], 'Open esys now');
  assert.deepEqual(p.steps[1], { text: 'Then naics', links: [{ label: 'L' }] });
  assert.deepEqual(p.terms, []);
  assert.deepEqual(p.sources, []);
  assert.equal(p.title, 'T');
});

test('unseenLinks shows each link once per card or mission', () => {
  const a = { kind: 'url', target: 'https://x.test/a', label: 'A' };
  const b = { kind: 'url', target: 'https://x.test/b', label: 'B' };
  const seen = new Set();
  assert.deepEqual(unseenLinks([a, a, b], seen), [a, b]);
  assert.deepEqual(unseenLinks([a], seen), []);
  assert.deepEqual(unseenLinks([{ kind: 'card', target: 'https://x.test/a' }], seen).length, 1);
  assert.deepEqual(unseenLinks(null, seen), []);
  assert.deepEqual(unseenLinks([null, 5], new Set()), []);
});

test('Bulletin Board is first in the list and is the tab the Desk opens on', () => {
  assert.deepEqual(DESK_SUBS.map(x => x[0]), ['bulletin', 'desk', 'orders', 'dashboard']);
  assert.equal(LANDING_SUB, 'bulletin');
});
test('hold dates: Wednesday server day', () => {
  assert.equal(holdUntil('tomorrow', '2026-11-18'), '2026-11-18');
  assert.equal(holdUntil('weekend', '2026-11-18'), '2026-11-21');
  assert.equal(holdUntil('date', '2026-11-18', '2026-12-01'), '2026-12-01');
});
test('hold dates: Saturday and Sunday mean back tomorrow', () => {
  assert.equal(holdUntil('weekend', '2026-11-21'), '2026-11-21');
  assert.equal(holdUntil('weekend', '2026-11-22'), '2026-11-22');
});
test('server day wins over the phone clock; phone 2 am day is the fallback', () => {
  const now = new Date(2026, 10, 19, 1);
  assert.equal(serverDay({ day: '2026-11-17' }, now), '2026-11-17');
  assert.equal(serverDay({ day: 'bad' }, now), '2026-11-18');
  assert.equal(serverDay(null, now), '2026-11-18');
});
test('hold dates: picked day must be the server day to 90 days ahead', () => {
  assert.equal(holdUntil('date', '2026-11-18', '2026-11-17'), null);
  assert.equal(holdUntil('date', '2026-11-18', '2027-02-16'), '2027-02-16');
  assert.equal(holdUntil('date', '2026-11-18', '2027-02-17'), null);
  assert.equal(holdUntil('date', '2026-11-18', 'soon'), null);
});
test('heldCards ignores malformed rows and reads both shapes', () => {
  const got = heldCards({ held_cards: [null, { id: 3 }, { id: 'a', title: 'A', hold: { until: '2026-11-20', reason: 'r' } }, { id: 'b', until: '2026-11-21', return_day: '2026-11-22', reason: 'q' }] });
  assert.deepEqual(got.map(h => [h.id, h.back, h.reason]), [['a', '2026-11-20', 'r'], ['b', '2026-11-22', 'q']]);
  assert.deepEqual(heldCards({ held_cards: 'x' }), []);
  assert.equal(dayWords('nope'), '');
});

test('a hold never returns the day it was held', () => {
  assert.equal(returnDay('2026-11-18', '2026-11-18'), '2026-11-19');
  assert.equal(returnDay('2026-11-21', '2026-11-18'), '2026-11-21');
  assert.equal(returnDay('2026-11-10', '2026-11-18'), '2026-11-19');
});

test('cards on hold are not counted as needing Chris, in the list or the Missions rows', () => {
  const data = { feed: { items: [{ id: 'a', project: 'p', title: 'A', kind: 'do-by-hand' }, { id: 'b', project: 'p', title: 'B', kind: 'do-by-hand' }] }, order: ['a', 'b'], held_cards: [{ id: 'b', title: 'B', hold: { until: '2026-11-20', reason: 'r' } }] };
  assert.deepEqual(openIds(data), ['a']);
  assert.deepEqual(deskRows(data).map(r => r.id), ['a']);
  assert.deepEqual(openIds({ ...data, held_cards: undefined }), ['a', 'b']);
});

test('a link must be a real https address: no user name or password, a host, no spaces, no other scheme', () => {
  assert.equal(isHttps('https://comptroller.texas.gov/taxes/permit/'), true);
  assert.equal(isHttps('https://name@evil.tld/'), false);
  assert.equal(isHttps('https://user:pw@evil.tld/'), false);
  assert.equal(isHttps('https://'), false);
  assert.equal(isHttps('http://example.com'), false);
  assert.equal(isHttps('javascript:alert(1)'), false);
  assert.equal(isHttps('data:text/html,x'), false);
  assert.equal(isHttps('https://exa mple.com'), false);
  assert.equal(isHttps('https://example.com/' + 'a'.repeat(2100)), false);
  assert.equal(isHttps(null), false);
  assert.equal(linkAction({ kind: 'url', target: 'https://name@evil.tld/' }).type, 'none');
  assert.equal(linkHost('https://www.printify.com/app/login'), 'printify.com');
  assert.equal(linkHost('https://name@evil.tld/'), '');
});
