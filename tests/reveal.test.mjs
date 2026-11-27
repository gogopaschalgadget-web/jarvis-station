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
  const d = normalizePictures({ pictures: [null, { id: '' }, { id: 'a', state: 'shown', rarity: 'common', card_id: 'c1' }, { id: 'b', state: 'starred' }], waiting: 9 });
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
  assert.equal(rarityLabel('epic'), 'Epic');
  assert.equal(rarityLabel('legendary'), 'Legendary');
  assert.equal(rarityLabel('weird'), '');
});

import { isSafeId, failureAction, addScheduled, cancelScheduled, dueScheduled, addPending, barAnimates, UNDO_WINDOW_MS } from '../js/cas-reveal-logic.js';
import { readFileSync } from 'node:fs';

test('ids put in request paths are short and plain: no slashes, dots pairs, spaces or odd characters', () => {
  ['p1', 'abc-123', 'replace:b7', 'a.b'].forEach(id => assert.equal(isSafeId(id), true, id));
  ['', '../x', 'a/b', 'a b', 'a?b', 'a#b', '%2e', 'x'.repeat(81), 7, null].forEach(id => assert.equal(isSafeId(id), false, String(id)));
  assert.equal(normalizeReveal({ status: 'ready', picture_id: '../etc' }), null);
  assert.deepEqual(normalizePictures({ pictures: [{ id: 'a/b' }, { id: 'ok1' }] }).pictures.map(p => p.id), ['ok1']);
});

test('failures: sign-in gone stops, offline and busy retry later, other client errors are dropped', () => {
  assert.equal(failureAction(401), 'stop');
  assert.equal(failureAction(403), 'stop');
  assert.equal(failureAction(0), 'later');
  assert.equal(failureAction(429), 'later');
  assert.equal(failureAction(503), 'later');
  assert.equal(failureAction(404), 'drop');
  assert.equal(failureAction(409), 'drop');
  assert.equal(failureAction(422), 'drop');
});

test('a finished card is asked for only after the Undo window, and Undo cancels it', () => {
  let l = addScheduled([], 'c1', 1000 + UNDO_WINDOW_MS);
  assert.deepEqual(dueScheduled(l, 1000), { due: [], rest: l });
  assert.deepEqual(dueScheduled(l, 1000 + UNDO_WINDOW_MS).due, ['c1']);
  assert.deepEqual(cancelScheduled(l, 'c1'), []);
  assert.deepEqual(addScheduled([], 'bad id', 5), []);
  l = addScheduled(addScheduled(l, 'c2', 5), 'c1', 9);
  assert.deepEqual(l.map(s => s.id), ['c2', 'c1']);
});

test('unsaved choices are kept one per picture, newest ten', () => {
  let l = [];
  for (let i = 0; i < 12; i++) l = addPending(l, { id: 'p' + i, body: { choice: 'keep' } });
  assert.equal(l.length, 10);
  assert.equal(addPending(l, { id: 'p11', body: { choice: 'star' } }).filter(p => p.id === 'p11').length, 1);
});

test('a progress bar animates only when its number changed', () => {
  assert.equal(barAnimates(undefined, 40), true);
  assert.equal(barAnimates(40, 40), false);
  assert.equal(barAnimates(40, 55), true);
});

test('the reason box stays hidden until X: the stylesheet has a hidden rule for it', () => {
  const css = readFileSync(new URL('../css/cas-desk.css', import.meta.url), 'utf8');
  assert.match(css, /\.rv-why\[hidden\]\s*\{\s*display:\s*none/);
});
