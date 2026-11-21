import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeReveal, normalizePictures, isNew, choiceBody, replacementLine, addWaiting, dropWaiting, rarityLabel, MAX_WAITING } from '../js/cas-reveal-logic.js';

test('a reveal answer is waiting, ready with a picture, or gone; anything else is ignored', () => {
  assert.deepEqual(normalizeReveal({ request_id: 7, status: 'ready', picture_id: 'p1' }), { requestId: '7', status: 'ready', pictureId: 'p1' });
  assert.equal(normalizeReveal({ status: 'waiting' }).status, 'waiting');
  assert.equal(normalizeReveal({ status: 'gone' }).status, 'gone');
  assert.equal(normalizeReveal({ status: 'ready' }), null);
  assert.equal(normalizeReveal({ status: 'maybe' }), null);
  assert.equal(normalizeReveal(null), null);
});

test('the picture list keeps only well-formed rows and caps waiting at five', () => {
  const d = normalizePictures({ pictures: [null, { id: '' }, { id: 'a', state: 'new', rarity: 'common', card_id: 'c1' }, { id: 'b', state: 'starred' }], waiting: 9 });
  assert.deepEqual(d.pictures.map(p => p.id), ['a', 'b']);
  assert.equal(d.waiting, MAX_WAITING);
  assert.deepEqual(d.pictures.filter(isNew).map(p => p.id), ['a']);
  assert.deepEqual(normalizePictures('x'), { pictures: [], waiting: 0 });
});

test('a choice is one of star, keep, reject, unstar; only a reject carries a trimmed reason of at most 200 characters', () => {
  assert.deepEqual(choiceBody('star', 'ignored'), { choice: 'star' });
  assert.deepEqual(choiceBody('reject', '  too dark  '), { choice: 'reject', reason: 'too dark' });
  assert.deepEqual(choiceBody('reject', '   '), { choice: 'reject' });
  assert.equal(choiceBody('reject', 'x'.repeat(500)).reason.length, 200);
  assert.equal(choiceBody('delete'), null);
  assert.equal(choiceBody(undefined), null);
});

test('the replacement line comes only from the server word', () => {
  assert.equal(replacementLine({ replacement: 'queued' }), 'A replacement is on its way.');
  assert.equal(replacementLine({ replacement: 'no_more_retries' }), 'Taste updated, no more retries.');
  assert.equal(replacementLine({ replacement: 'none' }), '');
  assert.equal(replacementLine(null), '');
});

test('waiting cards: unique, newest five kept, droppable', () => {
  let l = [];
  ['a', 'b', 'c', 'd', 'e', 'f'].forEach(x => { l = addWaiting(l, x); });
  assert.deepEqual(l, ['b', 'c', 'd', 'e', 'f']);
  assert.deepEqual(addWaiting(l, 'c').slice(-1), ['c']);
  assert.equal(addWaiting(l, 'c').length, 5);
  assert.deepEqual(dropWaiting(l, 'b'), ['c', 'd', 'e', 'f']);
  assert.deepEqual(addWaiting(null, ''), []);
  assert.equal(rarityLabel('rare'), 'Rare');
  assert.equal(rarityLabel('weird'), '');
});
