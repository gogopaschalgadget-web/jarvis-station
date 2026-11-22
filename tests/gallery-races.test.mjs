import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const pic = (id, state, created) => ({ id, state, created, chosen: created + 5, subject: 'Subject ' + id, width: 1024, height: 768 });

function makeDom() {
  const body = { children: [], append(c) { this.children.push(c); c.parent = this; } };
  const mk = tag => ({
    tag, className: '', textContent: '', attrs: {}, dataset: {}, children: [], listeners: {}, hidden: false, inert: false, type: '', src: '', alt: '', value: '', parent: null,
    append(...cs) { cs.forEach(c => { c.parent = this; this.children.push(c); }); },
    replaceChildren(...cs) { this.children = []; cs.forEach(c => this.append(c)); },
    setAttribute(k, v) { this.attrs[k] = v; }, addEventListener(t, f) { (this.listeners[t] ||= []).push(f); },
    focus() {}, remove() { if (this.parent) this.parent.children = this.parent.children.filter(x => x !== this); this.parent = null; },
    get isConnected() { let p = this; while (p.parent) p = p.parent; return p === body; },
    click() { (this.listeners.click || []).forEach(f => f({ target: this })); },
  });
  const docListeners = {};
  globalThis.document = { body, createElement: mk, activeElement: null, documentElement: { dataset: {} }, addEventListener: (t, f) => { (docListeners[t] ||= []).push(f); }, removeEventListener: (t, f) => { docListeners[t] = (docListeners[t] || []).filter(x => x !== f); } };
  globalThis.URL.createObjectURL = () => 'blob:fake';
  globalThis.URL.revokeObjectURL = () => {};
  delete globalThis.IntersectionObserver;
  delete globalThis.createImageBitmap;
  return { body, docListeners };
}
const all = (n, out = []) => { out.push(n); n.children.forEach(c => all(c, out)); return out; };
const texts = n => all(n).map(x => x.textContent).filter(Boolean);
const fresh = () => import('../js/cas-gallery.js?t=' + Math.random() + Date.now());
const tick = (ms = 25) => new Promise(r => setTimeout(r, ms));
const overlays = body => body.children.filter(c => c.className === 'gal-overlay');
const cellsOf = grid => all(grid).filter(n => n.className === 'gal-cell');

function server(initial) {
  const calls = [];
  const f = async (url, init = {}) => {
    const path = url.split('/api/station/pictures')[1];
    calls.push({ path, method: init.method });
    if (path === '') return { ok: true, status: 200, json: async () => ({ pictures: initial }) };
    if (/\/picture$/.test(path)) return { ok: true, status: 200, blob: async () => ({ type: 'image/png' }) };
    return { ok: true, status: 200, json: async () => ({}) };
  };
  return { f, calls };
}

test('Escape closes only the top view: the picture first, the grid second; the app stays locked until the last one closes, and the key listener goes with it', async () => {
  const { body, docListeners } = makeDom();
  const app = { inert: false, className: 'app', children: [] };
  body.children.push(app);
  const g = await fresh();
  const s = server([pic('a', 'kept', 100)]);
  g.initGallery({ apiBase: '', getToken: () => 't', fetch: s.f, say: () => {} });
  const box = g.galleryEntryNode(); body.append(box);
  await g.loadGallery(true);
  all(box).find(n => n.tag === 'button').click();
  cellsOf(overlays(body)[0])[0].click();
  await tick();
  assert.equal(overlays(body).length, 2);
  assert.equal(app.inert, true);
  assert.equal(overlays(body)[0].inert, true, 'the grid is locked under the picture');
  assert.equal(docListeners.keydown.length, 1, 'one shared key listener');
  docListeners.keydown[0]({ key: 'Escape', stopImmediatePropagation() {} });
  assert.equal(overlays(body).length, 1, 'only the picture closed');
  assert.equal(overlays(body)[0].inert, false, 'the grid is live again');
  assert.equal(app.inert, true, 'the app is still locked under the grid');
  docListeners.keydown[0]({ key: 'Escape', stopImmediatePropagation() {} });
  assert.equal(overlays(body).length, 0);
  assert.equal(app.inert, false);
  assert.equal((docListeners.keydown || []).length, 0);
});

test('a picture view closed while it is still loading never makes a blob URL; the one a view made is released when everything is closed', async () => {
  const { body } = makeDom();
  let made = 0;
  let freed = 0;
  globalThis.URL.createObjectURL = () => { made++; return 'blob:' + made; };
  globalThis.URL.revokeObjectURL = () => { freed++; };
  const g = await fresh();
  let release;
  const gate = new Promise(r => { release = r; });
  const s = server([pic('a', 'kept', 100)]);
  const slow = async (url, init) => { if (/\/a\/picture$/.test(url)) await gate; return s.f(url, init); };
  g.initGallery({ apiBase: '', getToken: () => 't', fetch: slow, say: () => {} });
  const box = g.galleryEntryNode(); body.append(box);
  await g.loadGallery(true);
  all(box).find(n => n.tag === 'button').click();
  cellsOf(overlays(body)[0])[0].click();
  const view = overlays(body)[1];
  const row = all(view).find(n => n.className === 'gal-actions');
  assert.ok(row.children.length === 2 && row.children.every(b => b.disabled), 'the buttons are there but disabled until the picture has loaded');
  all(view).find(n => n.className === 'gal-close').click();
  release();
  await tick(40);
  assert.equal(made, 0, 'nothing was made for a view that was already closed');
  cellsOf(overlays(body)[0])[0].click();
  await tick();
  assert.equal(made, 1);
  g.stopGallery();
  assert.equal(freed, 1, 'the picture was released when everything was closed');
  assert.equal(overlays(body).length, 0, 'stopGallery closes every view');
});

test('a list answer that left before a choice is discarded and asked for again, so it cannot bring back a rejected picture', async () => {
  const { body } = makeDom();
  const g = await fresh();
  let hold = false;
  let release;
  const gate = new Promise(r => { release = r; });
  let pictures = [pic('a', 'kept', 100), pic('b', 'kept', 90)];
  const f = async (url, init = {}) => {
    const path = url.split('/api/station/pictures')[1];
    if (path === '') { const snapshot = pictures; if (hold) await gate; return { ok: true, status: 200, json: async () => ({ pictures: snapshot }) }; }
    if (/\/picture$/.test(path)) return { ok: true, status: 200, blob: async () => ({ type: 'image/png' }) };
    if (/\/choice$/.test(path)) { pictures = pictures.map(p => (p.id === 'a' ? { ...p, state: 'rejected' } : p)); return { ok: true, status: 200, json: async () => ({}) }; }
    return { ok: false, status: 404 };
  };
  g.initGallery({ apiBase: '', getToken: () => 't', fetch: f, say: () => {} });
  const box = g.galleryEntryNode(); body.append(box);
  await g.loadGallery(true);
  hold = true;
  const stale = g.loadGallery(true);
  all(box).find(n => n.tag === 'button').click();
  cellsOf(overlays(body)[0])[0].click();
  await tick();
  hold = false;
  const view = overlays(body)[1];
  all(view).filter(n => n.className.startsWith('gal-btn'))[1].click();
  all(view).filter(n => n.className.startsWith('gal-btn'))[2].click();
  await tick();
  release();
  await stale;
  await tick(40);
  const names = cellsOf(overlays(body)[0]).map(c => all(c).find(n => n.tag === 'b').textContent);
  assert.deepEqual(names, ['Subject b'], 'the rejected picture stays gone');
});

test('after a sign-out an answer still on its way from the old account is ignored', async () => {
  makeDom();
  const g = await fresh();
  let release;
  const gate = new Promise(r => { release = r; });
  const f = async () => { await gate; return { ok: true, status: 200, json: async () => ({ pictures: [pic('old', 'kept', 1)] }) }; };
  g.initGallery({ apiBase: '', getToken: () => 't', fetch: f });
  const p = g.loadGallery(true);
  g.stopGallery();
  release();
  await p;
  const box = g.galleryEntryNode();
  assert.ok(!texts(box).includes('1 picture kept'), 'the old account list never shows');
});

test('a thumbnail that failed is not asked for again on every redraw; a 401 on a thumbnail stops the gallery', async () => {
  const { body } = makeDom();
  const g = await fresh();
  const s = server([pic('a', 'kept', 100), pic('b', 'kept', 90)]);
  g.initGallery({ apiBase: '', getToken: () => 't', fetch: s.f });
  const box = g.galleryEntryNode(); body.append(box);
  await g.loadGallery(true);
  await tick(40);
  all(box).find(n => n.tag === 'button').click();
  await tick(40);
  for (let i = 0; i < 3; i++) { await g.loadGallery(true); await tick(30); }
  const n = id => s.calls.filter(c => c.path === `/${id}/picture`).length;
  assert.equal(n('a'), 1, 'scaling is not possible here, so it failed once and is not retried');
  assert.equal(n('b'), 1);
  const s2 = server([pic('a', 'kept', 100)]);
  const f401 = async (url, init) => (/\/picture$/.test(url) ? { ok: false, status: 401 } : s2.f(url, init));
  const g2 = await fresh();
  g2.initGallery({ apiBase: '', getToken: () => 't', fetch: f401 });
  const b2 = g2.galleryEntryNode(); body.append(b2);
  await g2.loadGallery(true);
  await tick(40);
  const asked = s2.calls.length;
  await g2.loadGallery(true);
  assert.equal(s2.calls.length, asked, 'after a 401 it asks nothing more');
});

test('entries from redrawn Bulletin Boards do not pile up', async () => {
  const { body } = makeDom();
  const g = await fresh();
  const s = server([pic('a', 'kept', 100)]);
  g.initGallery({ apiBase: '', getToken: () => 't', fetch: s.f });
  let live = null;
  for (let i = 0; i < 20; i++) { live = g.galleryEntryNode(); body.children = []; body.append(live); }
  await g.loadGallery(true);
  assert.ok(texts(live).includes('1 picture kept'));
  const src = readFileSync(new URL('../js/cas-gallery.js', import.meta.url), 'utf8');
  assert.match(src, /export function galleryEntryNode\(\) \{\s*pruneEntries\(\);/, 'old entries are dropped as each new one is made');
});
