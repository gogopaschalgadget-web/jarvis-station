import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EFFORT, REASON_MAX, normalizeEffort, effortTag, earnedTag, ruleOf, previewOf, promiseTag, pictureLine, whyLine } from '../js/cas-effort.js';
import { doneList } from '../js/cas-desk.js';

test('the table is the agreed one: xs 20, s 40, m 60, l 100, xl 160', () => {
  assert.deepEqual(Object.fromEntries(Object.entries(EFFORT).map(([k, v]) => [k, v.xp])), { xs: 20, s: 40, m: 60, l: 100, xl: 160 });
});

test('a card size is read only when valid; the tag, the one-line reason and its cut', () => {
  assert.equal(effortTag(normalizeEffort({ effort: 'm', effort_reason: 'Ordinary work' }), 'effort'), 'M · 60 XP');
  assert.equal(effortTag(normalizeEffort({ effort: 'XL' }), 'effort'), 'XL · 160 XP', 'case does not matter');
  assert.equal(effortTag(normalizeEffort({ effort: 'xs' }), 'effort'), 'XS · 20 XP');
  for (const bad of [null, undefined, {}, { effort: '' }, { effort: 'huge' }, { effort: 60 }, { effort: '__proto__' }, { effort: 'toString' }, 'm']) assert.equal(normalizeEffort(bad), null, JSON.stringify(bad));
  const long = normalizeEffort({ effort: 's', effort_reason: 'x'.repeat(400) });
  assert.ok(long.reason.length <= REASON_MAX);
  assert.equal(normalizeEffort({ effort: 's', effort_reason: 'two\n lines\t here' }).reason, 'two lines here', 'one line');
  assert.equal(normalizeEffort({ effort: 's', effort_reason: 7 }).reason, '', 'a non-text reason is dropped');
  assert.equal(normalizeEffort({ effort: 'm', effort_reason: '<img src=x onerror=1>' }).reason, '<img src=x onerror=1>', 'kept as plain text; the card draws text nodes only');
});

test('the finished tag shows what was awarded, only for a whole number the server sent', () => {
  assert.equal(earnedTag({ effort: 'm', xp_earned: 60 }), 'M · 60 XP earned');
  assert.equal(earnedTag({ effort: 'l', xp_earned: 40 }), 'L · 40 XP earned', 'a gap payment is shown as paid, not the table number');
  assert.equal(earnedTag({ xp_earned: 20 }), '20 XP earned');
  for (const bad of [{ effort: 'm' }, { effort: 'm', xp_earned: '60' }, { effort: 'm', xp_earned: -1 }, { effort: 'm', xp_earned: 2.5 }, { effort: 'm', xp_earned: 5000 }, null]) assert.equal(earnedTag(bad), '', JSON.stringify(bad));
});

test('the done log carries the earned tag through', () => {
  const rows = doneList({ done_log: [{ title: 'A', project: 'station', date: '2026-11-24', effort: 'm', xp_earned: 60 }, { title: 'B', project: 'station' }] });
  assert.equal(rows[0].earned, 'M · 60 XP earned');
  assert.equal(rows[1].earned, '');
});

test('the card draws the tag as a button with text nodes only, keeps its open state across redraws, and the module is in the precache', () => {
  const desk = readFileSync(new URL('../js/cas-desk.js', import.meta.url), 'utf8');
  assert.match(desk, /normalizeEffort\(item\)/);
  assert.match(desk, /_effOpen/);
  assert.match(desk, /el\('p', 'dk-effwhy'/);
  const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  assert.ok(sw.includes("'js/cas-effort.js'"));
  const mod = readFileSync(new URL('../js/cas-effort.js', import.meta.url), 'utf8');
  assert.ok(!/innerHTML|insertAdjacentHTML/.test(mod + desk.match(/dk-eff[^\n]*/g).join('\n')));
});

test('XP is promised only when the server says the rule is effort; otherwise the plain size', () => {
  const m = normalizeEffort({ effort: 'm' });
  for (const rule of ['old', 'flat', null, undefined, 'maybe', 7]) assert.equal(effortTag(m, rule), 'M', String(rule));
  assert.equal(effortTag(m), 'M', 'no rule given: plain size');
  assert.equal(effortTag(m, 'effort'), 'M · 60 XP');
  assert.equal(effortTag(null, 'effort'), '');
  assert.equal(ruleOf({ progress: { xp_rule: 'effort' } }), 'effort');
  assert.equal(ruleOf({ progress: { xp_rule: 'flat' } }), 'flat');
  for (const bad of [null, {}, { progress: {} }, { progress: { xp_rule: 'EFFORT' } }, { progress: { xp_rule: 1 } }]) assert.equal(ruleOf(bad), null);
  const desk = readFileSync(new URL('../js/cas-desk.js', import.meta.url), 'utf8');
  assert.match(desk, /promiseTag\(eff, promise, ruleOf\(_data\)\)/);
});

test('the earned chip also reads rows of done_since_last_look', () => {
  const rows = doneList({ feed: { items: [], done_since_last_look: [{ title: 'A', project: 'station', effort: 'l', xp_earned: 100 }, { title: 'B', effort: null, xp_earned: null }] } });
  assert.equal(rows[0].earned, 'L · 100 XP earned');
  assert.equal(rows[1].earned, '');
});


const P = (rule, xp, upTo, picture = 'common') => ({ xp_preview: { c1: { xp, up_to: upTo, rule, picture, size: 'l' } } });

test('the tag shows what the LIVE rule will really pay, from the server promise, never the size table under another rule', () => {
  const l = normalizeEffort({ effort: 'l', effort_reason: 'Long job' });
  assert.equal(promiseTag(l, previewOf(P('old', 175, true), 'c1'), 'old'), 'up to 175 XP', 'the old rule: steps and bonuses, up to');
  assert.equal(promiseTag(null, previewOf(P('old', 55, true), 'c1'), 'old'), 'up to 55 XP', 'a card with no size still has a promise');
  assert.equal(promiseTag(l, previewOf(P('flat', 60, false), 'c1'), 'flat'), '60 XP');
  assert.equal(promiseTag(l, previewOf(P('effort', 100, false), 'c1'), 'effort'), 'L · 100 XP', 'the effort rule: the size pays');
  assert.equal(promiseTag(l, null, 'old'), 'L', 'no promise from the server: the plain size, nothing promised');
  assert.equal(promiseTag(l, null, 'effort'), 'L · 100 XP', 'unchanged behaviour with no preview');
});

test('a promise is read only when whole and from a known rule and picture step', () => {
  assert.deepEqual(previewOf(P('old', 175, true, 'rare'), 'c1'), { xp: 175, upTo: true, rule: 'old', picture: 'rare' });
  for (const bad of [null, {}, { xp_preview: null }, { xp_preview: { c1: { xp: '9', up_to: true, rule: 'old', picture: 'common' } } }, { xp_preview: { c1: { xp: 9, up_to: 1, rule: 'old', picture: 'common' } } },
    { xp_preview: { c1: { xp: 9, up_to: true, rule: 'weird', picture: 'common' } } }, { xp_preview: { c1: { xp: 9, up_to: true, rule: 'old', picture: 'mythic' } } }, { xp_preview: { c1: { xp: -1, up_to: true, rule: 'old', picture: 'common' } } },
    { xp_preview: { c1: { xp: 5000, up_to: true, rule: 'old', picture: 'common' } } }]) assert.equal(previewOf(bad, 'c1'), null);
  assert.equal(previewOf(P('old', 1, true), '__proto__'), null);
  assert.equal(previewOf(P('old', 1, true), 'other'), null);
});

test('the picture line and the tap text say only what the server promised', () => {
  assert.equal(pictureLine(previewOf(P('old', 55, true, 'uncommon'), 'c1')), 'Picture: Uncommon');
  assert.equal(pictureLine(null), '');
  const l = normalizeEffort({ effort: 'l', effort_reason: 'Long job' });
  assert.match(whyLine(l, previewOf(P('old', 175, true), 'c1')), /pays for its steps.*Size L: Long job/);
  assert.equal(whyLine(l, previewOf(P('effort', 100, false), 'c1')), 'Long job');
  assert.equal(whyLine(l, null), 'Long job');
  assert.match(whyLine(null, previewOf(P('flat', 60, false), 'c1')), /same/);
  const desk = readFileSync(new URL('../js/cas-desk.js', import.meta.url), 'utf8');
  assert.match(desk, /previewOf\(_data, item\.id\)/);
  assert.match(desk, /pictureLine\(promise\)/);
});
