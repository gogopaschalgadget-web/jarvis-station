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
async function fresh(handler) {
  body.length = 0; keyListeners.clear();
  const calls = [];
  const said = [];
  const revoked = [];
  const origRevoke = URL.revokeObjectURL;
  URL.revokeObjectURL = u => { revoked.push(u); };
  const m = await import('../js/cas-reveal.js?t=' + (++n));
  m.initReveal({
    apiBase: 'https://api.test', getToken: () => 't', say: t => said.push(t),
    fetch: async (url, o) => {
      const path = url.split('/api/station/pictures')[1];
      calls.push((o.method || 'GET') + ' ' + path);
      const r = await handler(path, o);
      if (r instanceof Error) throw r;
      return r;
    },
  });
  return { m, calls, said, revoked, restore: () => { URL.revokeObjectURL = origRevoke; } };
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
