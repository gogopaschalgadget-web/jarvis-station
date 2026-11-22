import test from 'node:test';
import assert from 'node:assert/strict';

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
  globalThis.document = { body, createElement: mk, activeElement: null, documentElement: { dataset: {} }, addEventListener() {}, removeEventListener() {} };
  globalThis.URL.createObjectURL = () => 'blob:fake';
  globalThis.URL.revokeObjectURL = () => {};
  delete globalThis.IntersectionObserver;
  delete globalThis.createImageBitmap;
  return { body };
}
const all = (n, out = []) => { out.push(n); n.children.forEach(c => all(c, out)); return out; };
const texts = n => all(n).map(x => x.textContent).filter(Boolean);
const fresh = () => import('../js/cas-gallery.js?t=' + Math.random() + Date.now());
const tick = (ms = 25) => new Promise(r => setTimeout(r, ms));
const overlays = body => body.children.filter(c => c.className === 'gal-overlay');
const cellsOf = grid => all(grid).filter(n => n.className === 'gal-cell');

test('a choice the server accepted is applied even if the view was closed while it was on its way', async () => {
  const { body } = makeDom();
  const g = await fresh();
  let release;
  const gate = new Promise(r => { release = r; });
  let pictures = [pic('a', 'kept', 100), pic('b', 'kept', 90)];
  const f = async (url, init = {}) => {
    const path = url.split('/api/station/pictures')[1];
    if (path === '') { const snap = pictures; return { ok: true, status: 200, json: async () => ({ pictures: snap }) }; }
    if (/\/picture$/.test(path)) return { ok: true, status: 200, blob: async () => ({ type: 'image/png' }) };
    if (/\/choice$/.test(path)) { await gate; pictures = pictures.map(p => (p.id === 'a' ? { ...p, state: 'rejected' } : p)); return { ok: true, status: 200, json: async () => ({}) }; }
    return { ok: false, status: 404 };
  };
  g.initGallery({ apiBase: '', getToken: () => 't', fetch: f, say: () => {} });
  const box = g.galleryEntryNode(); body.append(box);
  await g.loadGallery(true);
  all(box).find(n => n.tag === 'button').click();
  cellsOf(overlays(body)[0])[0].click();
  await tick();
  const view = overlays(body)[1];
  const buttons = all(view).filter(n => n.className.startsWith('gal-btn'));
  buttons[1].click();
  all(view).filter(n => n.className.startsWith('gal-btn'))[2].click();
  all(view).find(n => n.className === 'gal-close').click();
  release();
  await tick(40);
  const names = cellsOf(overlays(body)[0]).map(c => all(c).find(n => n.tag === 'b').textContent);
  assert.deepEqual(names, ['Subject b'], 'the accepted X shows at once in the grid');
});

test('a picture that is no longer in the list says so and offers nothing, instead of closing silently', async () => {
  const { body } = makeDom();
  const g = await fresh();
  let pictures = [pic('a', 'kept', 100), pic('b', 'kept', 90)];
  const f = async url => {
    const path = url.split('/api/station/pictures')[1];
    if (path === '') return { ok: true, status: 200, json: async () => ({ pictures }) };
    return { ok: true, status: 200, blob: async () => ({ type: 'image/png' }) };
  };
  g.initGallery({ apiBase: '', getToken: () => 't', fetch: f });
  const box = g.galleryEntryNode(); body.append(box);
  await g.loadGallery(true);
  all(box).find(n => n.tag === 'button').click();
  cellsOf(overlays(body)[0])[0].click();
  await tick();
  pictures = [pic('b', 'kept', 90)];
  await g.loadGallery(true);
  await tick();
  const view = overlays(body)[1];
  assert.ok(view, 'the view stays open');
  assert.ok(texts(view).includes('This picture is no longer in the gallery.'));
  assert.equal(all(view).find(n => n.className === 'gal-actions').children.length, 0);
});

test('after a 401 on a thumbnail the queued ones are not requested; a late 401 from the old session does not stop the new one', async () => {
  const { body } = makeDom();
  const g = await fresh();
  const calls = [];
  const f = async url => {
    const path = url.split('/api/station/pictures')[1];
    calls.push(path);
    if (path === '') return { ok: true, status: 200, json: async () => ({ pictures: Array.from({ length: 6 }, (_, i) => pic('p' + i, 'kept', 100 - i)) }) };
    return { ok: false, status: 401 };
  };
  g.initGallery({ apiBase: '', getToken: () => 't', fetch: f });
  const box = g.galleryEntryNode(); body.append(box);
  await g.loadGallery(true);
  all(box).find(n => n.tag === 'button').click();
  await tick(60);
  assert.ok(calls.filter(c => /picture$/.test(c)).length <= 2 + 1, 'at most the two in flight, none of the rest');

  const g2 = await fresh();
  let late;
  const gate = new Promise(r => { late = r; });
  const calls2 = [];
  const f2 = async url => {
    const path = url.split('/api/station/pictures')[1];
    calls2.push(path);
    if (path === '') return { ok: true, status: 200, json: async () => ({ pictures: [pic('x', 'kept', 1)] }) };
    await gate;
    return { ok: false, status: 401 };
  };
  g2.initGallery({ apiBase: '', getToken: () => 't', fetch: f2 });
  const b2 = g2.galleryEntryNode(); body.append(b2);
  await g2.loadGallery(true);
  await tick(30);
  g2.stopGallery();
  g2.initGallery({ getToken: () => 'new' });
  late();
  await tick(40);
  const before = calls2.filter(c => c === '').length;
  await g2.loadGallery(true);
  assert.equal(calls2.filter(c => c === '').length, before + 1, 'the new session still asks: the old 401 did not stop it');
});
