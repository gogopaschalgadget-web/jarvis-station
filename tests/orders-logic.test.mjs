import test from 'node:test';
import assert from 'node:assert/strict';
import { timeWords, quickGroup, quickTitle, rundownText, allDoneText, weekNote, normalizeOrders, normalizeDashboard, sittingGroups, sittingTitle, budgetLabel, resetText, tomorrowLocal, windowText, agoText, hoursText, weekText, streakText, carryTag, statusInfo, proofInfo, tickAction, loopAction, numbersFor, numberView } from '../js/cas-orders-logic.js';

test('ages read in words and unknown stays unknown', () => {
  assert.equal(agoText(null), 'unknown');
  assert.equal(agoText(30), 'just now');
  assert.equal(agoText(840), '14 min ago');
  assert.equal(agoText(3 * 3600), '3 h ago');
  assert.equal(agoText(3 * 86400), '3 days ago');
});

test('minutes become hours and the week line', () => {
  assert.equal(hoursText(200), '3 h 20');
  assert.equal(hoursText(60), '1 h');
  assert.equal(hoursText(45), '45 min');
  assert.equal(weekText({ minutes: 200, cap: 1200 }), 'This week: 3 h 20 of 20 h');
});

test('the working window reads 9 to 5', () => {
  assert.equal(windowText({ opens: '09:00', closes: '17:00' }), 'Open 9 to 5');
});

test('streak and carry words', () => {
  assert.equal(streakText(1), 'Streak: 1 day');
  assert.equal(streakText(4), 'Streak: 4 days');
  assert.equal(carryTag(0), '');
  assert.equal(carryTag(1), 'Carried 1 day');
  assert.equal(carryTag(2), 'Carried 2 days');
});

test('a loop with nothing known looks unknown, not broken', () => {
  assert.deepEqual(statusInfo('unknown'), { label: 'Unknown', cls: 'unk' });
  assert.deepEqual(statusInfo('nonsense'), { label: 'Unknown', cls: 'unk' });
  assert.equal(statusInfo('waiting_you').cls, 'wait');
  assert.equal(proofInfo(undefined).proven, false);
  assert.equal(proofInfo({ state: 'proven', proven_at: '2026-11-12T10:00:00Z' }).text, 'Proven from the phone, 2026-11-12');
});

test('only one-tap rows and duties are ticked from the list', () => {
  assert.equal(tickAction({ kind: 'duty', one_tap: false }), 'tick');
  assert.equal(tickAction({ kind: 'card', one_tap: true }), 'tick');
  assert.equal(tickAction({ kind: 'card', one_tap: false }), 'open');
});

test('a loop offers a test action only when it names a test card', () => {
  assert.equal(loopAction({ proof: { state: 'not_proven' } }), null);
  assert.deepEqual(loopAction({ proof: { state: 'not_proven', test_item_id: 't' } }), { type: 'add', id: 't', label: 'Add to Orders' });
  assert.deepEqual(loopAction({ proof: { state: 'proven', test_item_id: 't' } }), { type: 'open', id: 't', label: 'Run test' });
});

test('numbers group by block and show unknown without a value', () => {
  const nums = [{ label: 'a', value: null, source: null, block: 'operation' }, { label: 'b', value: '12', source: 'X tracker', age_s: 7200 }];
  assert.equal(numbersFor(nums, 'operation').length, 1);
  assert.equal(numbersFor(nums, 'analytics').length, 1);
  assert.deepEqual(numberView(nums[0]), { value: 'unknown', note: 'no source yet', unknown: true });
  assert.deepEqual(numberView(nums[1]), { value: '12', note: 'X tracker · 2 h ago', unknown: false });
});

test('tomorrow is the local date, not the UTC date', () => {
  assert.equal(tomorrowLocal(new Date(2026, 10, 16, 21, 30)), '2026-11-17');
  assert.equal(tomorrowLocal(new Date(2026, 11, 31, 8)), '2027-01-01');
});

test('reset time and labels', () => {
  assert.equal(resetText({ resets: '02:00' }), '2 am');
  assert.equal(resetText(undefined), '2 am');
  assert.equal(budgetLabel(90), '90 min');
  assert.deepEqual([90, 180, 240].map(m => budgetLabel(m, 'weekend')), ['1.5 hrs', '3 hrs', '4 hrs']);
  assert.equal(timeWords(10, 'weekend'), '0.5 hours');
  assert.deepEqual([timeWords(180, 'weekend'), timeWords(60, 'weekend'), timeWords(140, 'weekend'), timeWords(30, 'weekday')], ['3 hours', '1 hour', '2.5 hours', '30 minutes']);
  assert.equal(sittingTitle({ n: 1, minutes: 25 }), 'Sitting 1 · 25 min');
});

test('a thin server reply reads as empty, never as undefined', () => {
  assert.equal(normalizeOrders({}), null);
  assert.equal(normalizeOrders(null), null);
  const d = normalizeOrders({ rows: [{ key: 'a', title: 'T' }, { key: 'b', title: 'U', minutes: 5, done: true }] });
  assert.deepEqual([d.total, d.done, d.minutes_left, d.streak, d.questions.length, d.budgets.length], [2, 1, 0, 0, 0, 0]);
  assert.equal(d.rows[0].why, '');
  assert.equal(d.window.resets, '02:00');
  assert.equal(normalizeDashboard({}), null);
  const b = normalizeDashboard({ loops: [{ id: 'x', name: 'X' }, { id: 'y', name: 'Y', proof: { state: 'proven' }, needs: [{ text: 'a' }] }] });
  assert.deepEqual([b.proven, b.total, b.loops[0].needs.length, b.loops[0].status, b.loops[0].proof.state, b.numbers.length], [1, 2, 0, 'unknown', 'not_proven', 0]);
});

test('rows are grouped into the server sittings, or one group for an older server', () => {
  const d = normalizeOrders({ rows: [{ key: 'a', minutes: 25, done: true }, { key: 'b', minutes: 10 }, { key: 'c', minutes: 8, done: true }], sittings: [
    { n: 1, minutes: 25, long: false, keys: ['a'] }, { n: 2, minutes: 18, long: false, keys: ['b', 'c'] }] });
  const g = sittingGroups(d);
  assert.deepEqual(g.map(x => [x.n, x.minutes, x.done, x.total]), [[1, 25, 1, 1], [2, 18, 1, 2]]);
  const old = sittingGroups(normalizeOrders({ rows: [{ key: 'a', minutes: 5 }, { key: 'b', minutes: 5 }] }));
  assert.deepEqual(old.map(x => [x.n, x.minutes, x.total]), [[1, 10, 2]]);
  assert.deepEqual(sittingGroups(normalizeOrders({ rows: [] })), []);
});

test('quick tasks are their own group and stay out of the sittings', () => {
  const d = normalizeOrders({ rows: [{ key: 'q1', minutes: 3, quick: true, done: true }, { key: 'q2', minutes: 5, quick: true }, { key: 'a', minutes: 25 }],
    sittings: [{ n: 1, minutes: 25, keys: ['a'] }] });
  const q = quickGroup(d);
  assert.deepEqual([q.minutes, q.done, q.total, quickTitle(q)], [8, 1, 2, 'Quick tasks · 8 min']);
  assert.deepEqual(sittingGroups(d).map(g => g.rows.map(r => r.key)), [['a']]);
  assert.equal(quickGroup(normalizeOrders({ rows: [{ key: 'a', minutes: 25 }] })), null);
});

test('the day in one line, and nothing is added once it is done', () => {
  const d = normalizeOrders({ budget: 60, rows: [{ key: 'q1', minutes: 3, quick: true }, { key: 'q2', minutes: 2, quick: true }, { key: 'a', minutes: 25 }, { key: 'b', minutes: 10 }], sittings: [
    { n: 1, minutes: 25, keys: ['a'] }, { n: 2, minutes: 10, keys: ['b'] }] });
  assert.equal(rundownText(d), 'Today: 2 quick tasks and 2 sittings, about 40 minutes. Your time today: 60 minutes.');
  assert.equal(rundownText(normalizeOrders({ budget: 30, rows: [{ key: 'q', minutes: 4, quick: true }] })), 'Today: 1 quick task, about 4 minutes. Your time today: 30 minutes.');
  assert.equal(rundownText(normalizeOrders({ rows: [{ key: 'q', minutes: 4, quick: true }] })), 'Today: 1 quick task, about 4 minutes.');
  assert.equal(rundownText(normalizeOrders({ kind: 'weekend', budget: 180, rows: [{ key: 'a', minutes: 25 }, { key: 'b', minutes: 65 }], sittings: [{ n: 1, minutes: 25, keys: ['a'] }, { n: 2, minutes: 65, keys: ['b'] }] })), 'Today: 2 sittings, about 1.5 hours. Your time today: 3 hours.');
  assert.equal(rundownText(normalizeOrders({ rows: [] })), 'Today: nothing planned yet.');
  assert.equal(allDoneText(d), '');
  assert.equal(allDoneText(normalizeOrders({ rows: [{ key: 'a', minutes: 5, done: true }] })), 'That is everything for today.');
  assert.equal(allDoneText(normalizeOrders({ rows: [] })), '');
});

test('the week note is calm and appears only over the cap', () => {
  assert.equal(weekNote({ minutes: 1300, cap: 1200 }), 'You are over your 20 hours for this week.');
  assert.equal(weekNote({ minutes: 1200, cap: 1200 }), '');
  assert.equal(weekNote(null), '');
  assert.equal(weekText({ minutes: undefined, cap: 1200 }), '');
});

test('rows the server left out of the sittings still show, and thin sittings do not break', () => {
  const d = normalizeOrders({ rows: [{ key: 'a', minutes: 25 }, { key: 'b', minutes: 10 }], sittings: [{ keys: ['a'] }, { n: 2 }, null] });
  assert.deepEqual(sittingGroups(d).map(g => [g.n, g.rows.map(r => r.key)]), [[1, ['a']], [2, ['b']]]);
  assert.equal(windowText({}), 'Open 9 to 5');
});
