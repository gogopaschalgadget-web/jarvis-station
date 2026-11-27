import test from 'node:test';
import assert from 'node:assert/strict';

class El {
  constructor(tag) { this.tag = tag; this.className = ''; this.children = []; this.listeners = {}; this.attrs = {}; this.hidden = false; this.textContent = ''; this.removed = false; this.maxLength = 0; this.value = ''; }
  append(...c) { this.children.push(...c); }
  setAttribute(k, v) { this.attrs[k] = v; }
  addEventListener(t, f) { (this.listeners[t] ||= []).push(f); }
  remove() { this.removed = true; const i = body.indexOf(this); if (i >= 0) body.splice(i, 1); }
  focus() {}
  click() { (this.listeners.click || []).forEach(f => f({})); }
}
const body = [];
const keyListeners = new Set();
globalThis.document = {
  createElement: tag => new El(tag),
  body: { append: o => body.push(o) },
  addEventListener: (t, f) => { if (t === 'keydown') keyListeners.add(f); },
  removeEventListener: (t, f) => { if (t === 'keydown') keyListeners.delete(f); },
};
const pressEscape = () => [...keyListeners].forEach(f => f({ key: 'Escape', preventDefault() {} }));

const walk = (e, fn) => { fn(e); e.children.forEach(c => c instanceof El && walk(c, fn)); };
const find = (root, pred) => { let hit = null; walk(root, e => { if (!hit && pred(e)) hit = e; }); return hit; };
const overlay = () => body.find(e => e.className === 'rv-overlay');

let n = 0;
const store = {};
globalThis.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
async function fresh(handler, keep = false, extra = {}) {
  body.length = 0; keyListeners.clear();
  if (!keep) Object.keys(store).forEach(k => delete store[k]);
  const calls = [];
  const said = [];
  const revoked = [];
  const origRevoke = URL.revokeObjectURL;
  URL.revokeObjectURL = u => { revoked.push(u); };
  const m = await import('../js/cas-reveal.js?t=' + (++n));
  m.initReveal({
    apiBase: 'https://api.test', getToken: () => 't', say: t => said.push(t), ...extra,
    fetch: async (url, o) => {
      const path = url.split('/api/station/pictures')[1];
      calls.push((o.method || 'GET') + ' ' + path);
      const r = await handler(path, o);
      if (r instanceof Error) throw r;
      return r;
    },
  });
  return { m, calls, said, revoked, restore: () => { m.stopReveal(); body.length = 0; URL.revokeObjectURL = origRevoke; } };
}
const json = (b, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } });
const jpg = () => new Response(new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }), { status: 200 });
const tick = (ms = 20) => new Promise(r => setTimeout(r, ms));

test('the reveal opens with Star, Keep and X; the reason box is hidden until X is tapped and nothing is rejected before', async () => {
  const t = await fresh(async path => (path === '/reveal' ? json({ status: 'ready', picture_id: 'p1' }) : path === '/p1/picture' ? jpg() : json({ ok: true })));
  await t.m.requestReveal('card1'); await tick();
  const o = overlay();
  assert.ok(o, 'overlay shown');
  const why = find(o, e => e.className === 'rv-why');
  assert.equal(why.hidden, true);
  assert.deepEqual(['Star', 'Keep', 'X'].map(l => !!find(o, e => e.textContent === l)), [true, true, true]);
  find(o, e => e.textContent === 'X').click();
  assert.equal(why.hidden, false);
  assert.equal(t.calls.some(c => c.includes('/choice')), false);
  t.restore();
});

test('a failed save (429) closes the sheet, keeps the choice to retry, and says so; the blob URL is revoked', async () => {
  const t = await fresh(async path => (path === '/reveal' ? json({ status: 'ready', picture_id: 'p1' }) : path === '/p1/picture' ? jpg() : json({ detail: 'busy' }, 429)));
  await t.m.requestReveal('card1'); await tick();
  find(overlay(), e => e.textContent === 'Star').click(); await tick();
  assert.equal(overlay(), undefined);
  assert.equal(t.said.length, 1);
  assert.equal(t.revoked.length, 1);
  assert.equal(t.calls.filter(c => c === 'POST /p1/choice').length, 1);
  t.restore();
});

test('offline or a thrown request on save also closes; Escape and the close button always work', async () => {
  const t = await fresh(async path => (path === '/reveal' ? json({ status: 'ready', picture_id: 'p1' }) : path === '/p1/picture' ? jpg() : new Error('offline')));
  await t.m.requestReveal('card1'); await tick();
  pressEscape(); await tick();
  assert.equal(overlay(), undefined);
  const t2 = await fresh(async path => (path === '/reveal' ? json({ status: 'ready', picture_id: 'p2' }) : path === '/p2/picture' ? jpg() : json({}, 401)));
  await t2.m.requestReveal('card2'); await tick();
  find(overlay(), e => e.className === 'rv-close').click(); await tick();
  assert.equal(overlay(), undefined);
  assert.match(t2.said[0], /sign-in has expired/);
  t.restore(); t2.restore();
});

test('a picture that cannot be fetched is skipped and the next reveal still shows (the queue never stalls)', async () => {
  const t = await fresh(async path => {
    if (path === '/reveal') return json({ status: 'ready', picture_id: path.length ? (t.calls.filter(c => c === 'POST /reveal').length === 1 ? 'bad1' : 'good2') : 'x' });
    if (path === '/bad1/picture') return json({}, 404);
    if (path === '/good2/picture') return jpg();
    return json({ ok: true });
  });
  await t.m.requestReveal('c1'); await tick();
  assert.equal(overlay(), undefined);
  await t.m.requestReveal('c2'); await tick();
  assert.ok(overlay(), 'the next reveal is shown');
  t.restore();
});

test('reveal and poll against 404, 429, 401 and offline: 404 drops, 429 and offline wait, 401 stops asking', async () => {
  for (const [status, waiting] of [[404, 0], [429, 1]]) {
    const t = await fresh(async () => json({}, status));
    await t.m.requestReveal('c1');
    assert.equal(t.m.revealWaiting(), waiting, 'status ' + status);
    t.restore();
  }
  const off = await fresh(async () => new Error('offline'));
  await off.m.requestReveal('c1');
  assert.equal(off.m.revealWaiting(), 1);
  off.restore();
  const gone = await fresh(async () => json({}, 401));
  await gone.m.requestReveal('c1');
  await gone.m.requestReveal('c2');
  await gone.m.pollReveals();
  assert.equal(gone.calls.length, 1, 'no more requests after the sign-in is gone');
  gone.restore();
});

test('an unsafe picture id from the server is never put in a request', async () => {
  const t = await fresh(async path => (path === '/reveal' ? json({ status: 'ready', picture_id: '../admin' }) : json({})));
  await t.m.requestReveal('c1'); await tick();
  assert.deepEqual(t.calls, ['POST /reveal']);
  t.restore();
});

const WINDOW = 9000;
const revealHandler = (calls = []) => async path => {
  if (path === '/reveal') return json({ status: 'ready', picture_id: 'p1' });
  if (path === '/p1/picture') return jpg();
  return json({ ok: true });
};

test('the reveal is scheduled on Done, asked only after the Undo window, and only once', async () => {
  const t = await fresh(revealHandler());
  const t0 = 1_000_000;
  t.m.scheduleReveal('c1', t0);
  await t.m.runScheduled(t0 + 1);
  assert.deepEqual(t.calls, [], 'nothing inside the Undo window');
  await t.m.runScheduled(t0 + WINDOW + 1);
  assert.equal(t.calls.filter(c => c === 'POST /reveal').length, 1);
  await t.m.runScheduled(t0 + WINDOW + 5000);
  assert.equal(t.calls.filter(c => c === 'POST /reveal').length, 1, 'fires once');
  await tick(60);
  t.restore();
});

test('Undo cancels the scheduled reveal', async () => {
  const t = await fresh(revealHandler());
  const t0 = 2_000_000;
  t.m.scheduleReveal('c1', t0);
  t.m.cancelReveal('c1');
  await t.m.runScheduled(t0 + WINDOW + 1);
  assert.deepEqual(t.calls, []);
  t.restore();
});

test('a scheduled reveal survives a reload and still fires once after the window', async () => {
  const first = await fresh(revealHandler());
  const t0 = 3_000_000;
  first.m.scheduleReveal('c1', t0);
  assert.equal(JSON.parse(store['reveal-scheduled']).length, 1);
  first.restore();
  const second = await fresh(revealHandler(), true);
  await second.m.runScheduled(t0 + WINDOW + 1);
  assert.equal(second.calls.filter(c => c === 'POST /reveal').length, 1);
  assert.equal(JSON.parse(store['reveal-scheduled']).length, 0);
  await tick(60);
  second.restore();
});

test('a choice that could not be saved is kept and sent again at the next poll, then not sent again', async () => {
  let fail = true;
  const t = await fresh(async path => {
    if (path === '/reveal') return json({ status: 'ready', picture_id: 'p1' });
    if (path === '/p1/picture') return jpg();
    if (path === '/p1/choice') return fail ? json({ detail: 'busy' }, 429) : json({ state: 'starred', replacement: 'none' });
    return json({ pictures: [], waiting: 0 });
  });
  await t.m.requestReveal('c1'); await tick();
  find(overlay(), e => e.textContent === 'Star').click(); await tick();
  assert.equal(overlay(), undefined);
  assert.equal(t.calls.filter(c => c === 'POST /p1/choice').length, 1);
  fail = false;
  await t.m.pollReveals();
  assert.equal(t.calls.filter(c => c === 'POST /p1/choice').length, 2, 'retried');
  await t.m.pollReveals();
  assert.equal(t.calls.filter(c => c === 'POST /p1/choice').length, 2, 'not sent a third time');
  t.restore();
});

test('a choice the server refuses for good (404, 409, 422) is dropped quietly and that picture is not shown again this session', async () => {
  for (const status of [404, 409, 422]) {
    const t = await fresh(async path => {
      if (path === '/reveal') return json({ status: 'ready', picture_id: 'p1' });
      if (path === '/p1/picture') return jpg();
      if (path === '/p1/choice') return json({ detail: 'no' }, status);
      return json({ pictures: [{ id: 'p1', state: 'shown' }], waiting: 0 });
    });
    await t.m.requestReveal('c1'); await tick();
    find(overlay(), e => e.textContent === 'Keep').click(); await tick();
    assert.equal(overlay(), undefined, 'closed, status ' + status);
    assert.equal(t.said.length, 0, 'no message');
    const before = t.calls.filter(c => c === 'GET /p1/picture').length;
    await t.m.pollReveals(); await tick();
    assert.equal(overlay(), undefined, 'not shown again');
    assert.equal(t.calls.filter(c => c === 'GET /p1/picture').length, before);
    t.restore();
  }
});

test('closing with the close button or Escape counts as Keep, also after X was tapped', async () => {
  const t = await fresh(revealHandler());
  await t.m.requestReveal('c1'); await tick();
  find(overlay(), e => e.textContent === 'X').click();
  find(overlay(), e => e.className === 'rv-close').click(); await tick();
  assert.equal(overlay(), undefined);
  assert.equal(t.calls.filter(c => c === 'POST /p1/choice').length, 1);
  t.restore();
});

// ---- the card must never hold the screen: it closes at once and the choice is saved afterwards

const ready = (choice) => async (path, o) => (path === '/reveal' ? json({ status: 'ready', picture_id: 'p1' }) : path === '/p1/picture' ? jpg() : choice(path, o));
const open = async t => { await t.m.requestReveal('card1'); await tick(); assert.ok(overlay(), 'the card is open'); };

test('freeze: a server that never answers cannot hold the card: every way of closing it works at once, then the choice is kept, retried three times and said plainly', async () => {
  for (const way of ['close', 'keep', 'star', 'reject', 'escape', 'dark area']) {
    const onChoice = [];
    const t = await fresh(ready(() => new Promise(() => {})), false, { timeoutMs: 30, retryMs: [20, 20, 20], onChoice: () => onChoice.push(1) });
    await open(t);
    const o = overlay();
    if (way === 'close') find(o, e => e.className === 'rv-close').click();
    else if (way === 'keep') find(o, e => e.textContent === 'Keep').click();
    else if (way === 'star') find(o, e => e.textContent === 'Star').click();
    else if (way === 'reject') { find(o, e => e.textContent === 'X').click(); find(o, e => e.className === 'rv-input').value = 'dull'; find(o, e => e.textContent === 'Send X').click(); }
    else if (way === 'escape') pressEscape();
    else o.listeners.click.forEach(f => f({ target: o }));
    assert.equal(overlay(), undefined, way + ': closed at once, with the server still silent (no waiting)');
    assert.equal(t.revoked.length, 1, way + ': the picture URL was released');
    await tick(400);
    assert.equal(t.calls.filter(c => c === 'POST /p1/choice').length, 4, way + ': one send and exactly three retries, then it stops');
    assert.ok(t.said.some(x => /not saved yet/i.test(x)), way + ': a plain notice: ' + t.said);
    assert.equal(overlay(), undefined);
    assert.equal(onChoice.length, 0);
    t.restore();
  }
});

test('freeze: a slow answer (the card is already gone) still saves, tells the gallery, and does not warn', async () => {
  const onChoice = [];
  const t = await fresh(ready(async () => { await tick(60); return json({ ok: true }); }), false, { timeoutMs: 500, onChoice: () => onChoice.push(1) });
  await open(t);
  find(overlay(), e => e.textContent === 'Keep').click();
  assert.equal(overlay(), undefined, 'closed before the server answered');
  assert.equal(t.calls.filter(c => c === 'POST /p1/choice').length, 1);
  await tick(150);
  assert.equal(onChoice.length, 1, 'the gallery list refreshes once it is saved');
  assert.equal(t.said.length, 0);
  t.restore();
});

test('freeze: a dropped connection and a failed save close at once and are retried; a retry that works clears it and never sends again', async () => {
  let n = 0;
  const onChoice = [];
  const t = await fresh(ready(async () => { n++; if (n < 3) throw new TypeError('Load failed'); return json({ ok: true }); }), false, { retryMs: [15, 15, 15], onChoice: () => onChoice.push(1) });
  await open(t);
  find(overlay(), e => e.textContent === 'Star').click();
  assert.equal(overlay(), undefined);
  await tick(300);
  assert.equal(t.calls.filter(c => c === 'POST /p1/choice').length, 3, 'two failures then one success, and nothing more');
  assert.equal(onChoice.length, 1);
  assert.equal(t.said.filter(x => /not saved yet/i.test(x)).length, 1, 'one notice, not one per try');
  t.restore();
  const bad = await fresh(ready(async () => json({ detail: 'down' }, 503)), false, { retryMs: [15, 15, 15] });
  await open(bad);
  find(overlay(), e => e.textContent === 'Keep').click();
  assert.equal(overlay(), undefined);
  await tick(300);
  assert.equal(bad.calls.filter(c => c === 'POST /p1/choice').length, 4);
  assert.ok(bad.said.some(x => /not saved yet/i.test(x)));
  bad.restore();
});

test('freeze: while a choice is being sent the same picture is not shown again by a poll', async () => {
  const t = await fresh(async (path, o) => {
    if (path === '/reveal') return json({ status: 'ready', picture_id: 'p1' });
    if (path === '/p1/picture') return jpg();
    if (path === '/p1/choice') return new Promise(() => {});
    if (path === '') return json({ pictures: [{ id: 'p1', state: 'shown', rarity: 'common' }] });
    return json({ ok: true });
  }, false, { timeoutMs: 500, retryMs: [1000] });
  await t.m.requestReveal('card1'); await tick();
  find(overlay(), e => e.textContent === 'Keep').click();
  await t.m.pollReveals(); await tick();
  assert.equal(overlay(), undefined, 'not shown again while its choice is on its way');
  t.restore();
});

test('freeze: a request for a picture that never answers ends by itself, so the next reveal is not stuck behind it', async () => {
  const t = await fresh(async (path, o) => {
    if (path === '/reveal') return json({ status: 'ready', picture_id: JSON.parse(o.body).card_id === 'card1' ? 'p1' : 'p2' });
    if (path === '/p1/picture') return new Promise(() => {});
    if (path === '/p2/picture') return jpg();
    return json({ ok: true });
  }, false, { timeoutMs: 40 });
  t.m.requestReveal('card1'); await tick(5);
  await t.m.requestReveal('card2');
  assert.equal(overlay(), undefined, 'the second one waits its turn behind the silent one');
  await tick(150);
  assert.ok(overlay(), 'then the silent one gave up and the second one is shown');
  t.restore();
});
