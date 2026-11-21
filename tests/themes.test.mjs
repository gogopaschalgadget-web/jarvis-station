import test from 'node:test';
import assert from 'node:assert/strict';
import { THEMES, DEFAULT_LOOK, normalizeLook, lookLock, modeOptions, loadLook, applyLook } from '../js/cas-themes.js';

test('a saved look must name a theme that exists and has its art; anything else is the default', () => {
  assert.deepEqual(normalizeLook({ mode: 'game', theme: 'forge-and-brass' }), DEFAULT_LOOK);
  assert.deepEqual(normalizeLook({ mode: 'professional', theme: 'counting-house' }), DEFAULT_LOOK);
  assert.deepEqual(normalizeLook({ mode: 'professional', theme: 'forge-and-brass' }), DEFAULT_LOOK);
  assert.deepEqual(normalizeLook({ theme: 'nope' }), DEFAULT_LOOK);
  assert.deepEqual(normalizeLook(null), DEFAULT_LOOK);
  assert.deepEqual(normalizeLook('x'), DEFAULT_LOOK);
  assert.deepEqual(normalizeLook({ theme: 'forge-and-brass' }), DEFAULT_LOOK);
});

test('a theme without art is listed but never selectable; its mode is not offered', () => {
  assert.equal(THEMES.find(t => t.id === 'counting-house').ready, false);
  assert.deepEqual(modeOptions().map(m => [m.mode, m.available]), [['game', true], ['professional', false]]);
});

test('changing the look opens at Technician; no reported rank keeps it closed with a reason', () => {
  assert.equal(lookLock(null).open, false);
  assert.match(lookLock(null).why, /not reported/);
  assert.equal(lookLock({ rank: { index: 3 } }).open, false);
  assert.match(lookLock({ rank: { index: 3 } }).why, /Locked, not earned/);
  assert.equal(lookLock({ rank: { index: 4 } }).open, true);
  assert.equal(lookLock({ rank: { index: 9 } }).why, '');
});

test('without storage or a document the look still loads and applies without throwing', () => {
  assert.deepEqual(loadLook(), DEFAULT_LOOK);
  assert.deepEqual(applyLook({ theme: 'forge-and-brass' }), DEFAULT_LOOK);
});
