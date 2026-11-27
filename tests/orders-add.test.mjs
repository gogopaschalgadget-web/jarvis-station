import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { addView, addFailText, onTodaysList, ADD_CAVEAT, ADD_NO_ANSWER, ON_LIST } from '../js/cas-orders-logic.js';

class El {
  constructor(tag) { this.tag = tag; this.className = ''; this.children = []; this.listeners = {}; this.attrs = {}; this.textContent = ''; this.disabled = false; this.type = ''; }
  append(...c) { this.children.push(...c); }
  setAttribute(k, v) { this.attrs[k] = v; }
  addEventListener(t, f) { (this.listeners[t] ||= []).push(f); }
  click() { (this.listeners.click || []).forEach(f => f({ preventDefault() {}, stopPropagation() {} })); }
}
globalThis.document = { createElement: tag => new El(tag) };
globalThis.localStorage = { getItem: () => null, setItem() {} };
const walk = (e, fn) => { fn(e); e.children.forEach(c => c instanceof El && walk(c, fn)); };
const all = root => { const out = []; walk(root, e => out.push(e)); return out; };
const texts = root => all(root).map(e => e.textContent).filter(Boolean);

const open = (id, extra = {}) => ({ id, status: 'open', title: 'Card ' + id, ...extra });
const ROW = { key: 'k1', kind: 'card', id: 'listed-card', title: 'Listed', minutes: 10, why: 'x', done: false };
const ordersJson = rows => ({ rows, day: '2026-11-27', kind: 'weekday', budget: 30, budgets: [30, 60], sittings: [], streak: 1 });
const json = (b, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } });

let n = 0;
async function fresh(handler) {
  const calls = [];
  const draws = { n: 0 };
  globalThis.fetch = async (url, o) => { calls.push({ url, method: o.method, body: o.body ? JSON.parse(o.body) : null, auth: o.headers.Authorization, signal: o.signal }); return handler(url, o, calls.length); };
  const m = await import('../js/cas-orders.js?t=' + (++n));
  m.initOrders({ apiBase: 'https://api.test', getToken: () => 'tok', redraw: () => { draws.n++; }, showOrders() {}, openCard() {}, unavailable() {} });
  return { m, calls, draws };
}
const tick = (ms = 10) => new Promise(r => setTimeout(r, ms));
const addBtn = row => all(row).find(e => e.className === 'dk-add');

test('the button shows on an open top-level card only: not on a done card, a child row, or a card already on the list', () => {
  assert.equal(addView(open('a'), false, null).show, 'button');
  assert.equal(addView(open('a', { status: 'done' }), false, null).show, 'none');
  assert.equal(addView(open('a', { status: 'answered' }), false, null).show, 'none');
  assert.equal(addView(open('a', { parent_id: 'p' }), false, null).show, 'none');
  assert.equal(addView(null, false, null).show, 'none');
  const listed = addView(open('a'), true, null);
  assert.equal(listed.show, 'mark');
  assert.equal(listed.text, "On today's Orders");
  assert.equal(ON_LIST, "On today's Orders");
});

test('a card is on today\'s list when a card row carries its id; a duty row or another id does not count', () => {
  const d = { rows: [ROW, { key: 'd1', kind: 'duty', id: 'x' }] };
  assert.equal(onTodaysList(d, 'listed-card'), true);
  assert.equal(onTodaysList(d, 'x'), false);
  assert.equal(onTodaysList(d, 'other'), false);
  assert.equal(onTodaysList(null, 'listed-card'), false);
});

test('the caveat is the plain sentence, shown with the button before the tap', () => {
  assert.equal(ADD_CAVEAT, "An added row stops the automatic updates to today's list");
  const v = addView(open('a'), false, null);
  assert.equal(v.caveat, ADD_CAVEAT);
  assert.equal(v.label, 'Add to Orders');
  assert.equal(v.busy, false);
  assert.equal(v.error, '');
});

test('while waiting the button says it is working; after a refusal the server reason shows; after no answer it offers Try again', () => {
  const busy = addView(open('a'), false, { state: 'busy', text: '' });
  assert.equal(busy.busy, true);
  assert.equal(busy.label, 'Adding...');
  const refused = addView(open('a'), false, { state: 'refused', text: 'The list is full.' });
  assert.equal(refused.label, 'Add to Orders');
  assert.equal(refused.error, 'The list is full.');
  const none = addView(open('a'), false, { state: 'noanswer', text: ADD_NO_ANSWER });
  assert.equal(none.label, 'Try again');
  assert.equal(none.error, ADD_NO_ANSWER);
  assert.equal(addView(open('a'), false, { state: 'ok', text: '' }).show, 'mark');
});

test('the server\'s own reason is shown for a 422, with a capital and a full stop; no answer and other failures read plainly', () => {
  assert.equal(addFailText({ status: 422, json: { detail: "today's list is full (32 rows)" } }), "Today's list is full (32 rows).");
  assert.equal(addFailText({ status: 422, json: { detail: "Today's sittings are full." } }), "Today's sittings are full.");
  assert.equal(addFailText({ status: 0, json: {} }), ADD_NO_ANSWER);
  assert.equal(addFailText({ status: 429, json: {} }), 'Too many changes in a minute. Wait a moment.');
  assert.equal(addFailText({ status: 500, json: { detail: 'boom' } }), 'Not added. Try again.');
  assert.equal(addFailText({ status: 422, json: {} }), 'Not added. Try again.');
});

test('a tap sends one POST to /orders/add with {key: card id}, the device login and a time limit signal', async () => {
  const t = await fresh(async () => json(ordersJson([{ ...ROW, id: 'c1', key: 'kc1' }])));
  const row = t.m.addRow(open('c1'));
  assert.ok(row, 'a row for an open card');
  assert.deepEqual(texts(row), ['Add to Orders', ADD_CAVEAT]);
  addBtn(row).click();
  await tick();
  assert.equal(t.calls.length, 1);
  assert.equal(t.calls[0].url, 'https://api.test/api/station/desk/orders/add');
  assert.equal(t.calls[0].method, 'POST');
  assert.deepEqual(t.calls[0].body, { key: 'c1' });
  assert.equal(t.calls[0].auth, 'Bearer tok');
  assert.ok(t.calls[0].signal && typeof t.calls[0].signal.aborted === 'boolean', 'a time limit signal is attached');
});

test('success: the card shows "On today\'s Orders" with no button, the screen redraws, a second tap does nothing', async () => {
  const t = await fresh(async () => json(ordersJson([{ ...ROW, id: 'c1', key: 'kc1' }])));
  const ok = await t.m.addToOrders('c1');
  assert.equal(ok, true);
  assert.ok(t.draws.n >= 2, 'redrawn when it started and when it finished');
  const row = t.m.addRow(open('c1'));
  assert.deepEqual(texts(row), ["On today's Orders"]);
  assert.equal(addBtn(row), undefined);
  assert.equal(await t.m.addToOrders('c1'), true);
  assert.equal(t.calls.length, 1, 'a card already added is not sent again');
});

test('success with a reply the Station cannot read still shows the mark and asks for the list again', async () => {
  const t = await fresh(async (url, o, i) => (url.endsWith('/orders/add') ? json({ ok: true }) : json(ordersJson([{ ...ROW, id: 'c2', key: 'kc2' }]))));
  assert.equal(await t.m.addToOrders('c2'), true);
  await tick();
  assert.ok(t.calls.some(c => c.url.endsWith('/orders') && c.method === 'GET'), 'the list is read again');
  assert.deepEqual(texts(t.m.addRow(open('c2'))), ["On today's Orders"]);
});

test('refusal: the server\'s own reason (list full, sittings full) shows under the button, which stays ready', async () => {
  for (const detail of ['the list is full at 32 rows', 'the sittings for today are full']) {
    const t = await fresh(async () => json({ detail }, 422));
    assert.equal(await t.m.addToOrders('c3'), false);
    const row = t.m.addRow(open('c3'));
    const want = detail.replace(/^./, c => c.toUpperCase()) + '.';
    assert.deepEqual(texts(row), ['Add to Orders', ADD_CAVEAT, want]);
    assert.equal(addBtn(row).disabled, false);
    assert.equal(all(row).find(e => e.className.includes('dk-adderr')).attrs.role, 'alert');
  }
});

test('no answer: a dropped connection says so and the same button tries again', async () => {
  let fail = true;
  const t = await fresh(async () => { if (fail) throw new TypeError('network'); return json(ordersJson([{ ...ROW, id: 'c4', key: 'kc4' }])); });
  assert.equal(await t.m.addToOrders('c4'), false);
  let row = t.m.addRow(open('c4'));
  assert.deepEqual(texts(row), ['Try again', ADD_CAVEAT, ADD_NO_ANSWER]);
  fail = false;
  addBtn(row).click();
  await tick();
  assert.equal(t.calls.length, 2);
  assert.deepEqual(texts(t.m.addRow(open('c4'))), ["On today's Orders"]);
});

test('time limit: a server that never answers is given up on at 15 seconds, the card is not frozen, and Try again works', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    let hang = true;
    const t = await fresh((url, o) => (hang ? new Promise((_, rej) => { o.signal.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError'))); }) : json(ordersJson([{ ...ROW, id: 'c5', key: 'kc5' }]))));
    const pending = t.m.addToOrders('c5');
    await Promise.resolve();
    const busy = t.m.addRow(open('c5'));
    assert.equal(addBtn(busy).textContent, 'Adding...');
    assert.equal(addBtn(busy).disabled, true);
    mock.timers.tick(14_999);
    assert.equal(t.calls[0].signal.aborted, false, 'still waiting just before 15 seconds');
    mock.timers.tick(1);
    assert.equal(await pending, false);
    assert.equal(t.calls[0].signal.aborted, true, 'given up at 15 seconds');
    const row = t.m.addRow(open('c5'));
    assert.deepEqual(texts(row), ['Try again', ADD_CAVEAT, ADD_NO_ANSWER]);
    assert.equal(addBtn(row).disabled, false);
    hang = false;
    assert.equal(await t.m.addToOrders('c5'), true);
  } finally { mock.timers.reset(); }
});

test('a second tap while the first is still waiting sends nothing more', async () => {
  let release;
  const t = await fresh(() => new Promise(r => { release = () => r(json(ordersJson([{ ...ROW, id: 'c6', key: 'kc6' }]))); }));
  const first = t.m.addToOrders('c6');
  await tick();
  assert.equal(await t.m.addToOrders('c6'), false);
  assert.equal(t.calls.length, 1);
  release();
  assert.equal(await first, true);
});

test('no row at all for a done card or a child row', async () => {
  const t = await fresh(async () => json(ordersJson([])));
  assert.equal(t.m.addRow(open('x', { status: 'done' })), null);
  assert.equal(t.m.addRow(open('x', { parent_id: 'p' })), null);
  const listed = await fresh(async () => json(ordersJson([ROW])));
  await listed.m.loadOrders(true);
  assert.deepEqual(texts(listed.m.addRow(open('listed-card'))), ["On today's Orders"]);
});

test('a later list that no longer holds the card brings the button back', async () => {
  const t = await fresh(async (url) => (url.endsWith('/orders/add') ? json(ordersJson([{ ...ROW, id: 'c7', key: 'kc7' }])) : json(ordersJson([]))));
  await t.m.addToOrders('c7');
  assert.deepEqual(texts(t.m.addRow(open('c7'))), ["On today's Orders"]);
  await tick(5);
  await t.m.loadOrders(true);
  assert.equal(addBtn(t.m.addRow(open('c7'))).textContent, 'Add to Orders');
});

test('the Desk draws the row on its open cards only, loads the list with the Desk, and the touch target is 44 px or more', () => {
  const desk = readFileSync(new URL('../js/cas-desk.js', import.meta.url), 'utf8');
  const card = desk.slice(desk.indexOf('function card('), desk.indexOf('function grip('));
  assert.match(card, /addRow\(item\)/);
  assert.equal((desk.match(/addRow\(/g) || []).length, 1, 'only the open card calls it, never kidCard');
  assert.match(desk, /_sub === 'desk'\) \{ load\(force\); loadDashboard\(force\); loadOrders\(force\); \}/);
  const css = readFileSync(new URL('../css/cas-desk.css', import.meta.url), 'utf8');
  const px = re => Number((css.match(re) || [])[1]);
  assert.ok(px(/\.dk-add \{[^}]*min-height: (\d+)px/) >= 44);
  assert.ok(px(/\.dk-onlist \{[^}]*min-height: (\d+)px/) >= 44);
});
