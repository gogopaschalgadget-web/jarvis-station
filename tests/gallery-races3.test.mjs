import test from 'node:test';
import assert from 'node:assert/strict';

const pic = (id, state, created) => ({ id, state, created, chosen: created + 5, subject: 'Subject ' + id, width: 10, height: 10 });

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

test('a choice answered after a sign-out changes nothing in the new session', async () => {
  const { body } = makeDom();
  const g = await fresh();
  let release;
  const gate = new Promise(r => { release = r; });
  let account = 'one';
  const calls = [];
  const f = async (url, init = {}) => {
    const path = url.split('/api/station/pictures')[1];
    calls.push(path);
    if (path === '') return { ok: true, status: 200, json: async () => ({ pictures: account === 'one' ? [pic('a', 'kept', 100)] : [pic('a', 'kept', 100), pic('z', 'kept', 90)] }) };
    if (/\/picture$/.test(path)) return { ok: true, status: 200, blob: async () => ({ type: 'image/png' }) };
    if (/\/choice$/.test(path)) { await gate; return { ok: false, status: 401 }; }
    return { ok: false, status: 404 };
  };
  g.initGallery({ apiBase: '', getToken: () => 't', fetch: f, say: () => {} });
  const box = g.galleryEntryNode(); body.append(box);
  await g.loadGallery(true);
  all(box).find(n => n.tag === 'button').click();
  cellsOf(overlays(body)[0])[0].click();
  await tick();
  const view = overlays(body)[1];
  all(view).filter(n => n.className.startsWith('gal-btn'))[0].click();
  g.stopGallery();
  account = 'two';
  g.initGallery({ getToken: () => 'new' });
  release();
  await tick(40);
  const list = g.galleryEntryNode(); body.append(list);
  await g.loadGallery(true);
  assert.ok(texts(list).includes('2 pictures kept'), 'the new account still has its gallery: the old 401 did not stop it');
});

test('a picture that leaves the list and comes back gets its actions back; a failed list can be asked again at once after a new sign-in', async () => {
  const { body } = makeDom();
  const g = await fresh();
  let pictures = [pic('a', 'kept', 100)];
  let fail = false;
  const f = async url => {
    const path = url.split('/api/station/pictures')[1];
    if (path === '') return fail ? { ok: false, status: 500 } : { ok: true, status: 200, json: async () => ({ pictures }) };
    return { ok: true, status: 200, blob: async () => ({ type: 'image/png' }) };
  };
  g.initGallery({ apiBase: '', getToken: () => 't', fetch: f });
  const box = g.galleryEntryNode(); body.append(box);
  await g.loadGallery(true);
  all(box).find(n => n.tag === 'button').click();
  cellsOf(overlays(body)[0])[0].click();
  await tick();
  const view = overlays(body)[1];
  const row = all(view).find(n => n.className === 'gal-actions');
  assert.equal(row.children.length, 2);
  pictures = [];
  await g.loadGallery(true);
  await tick();
  assert.ok(texts(view).includes('This picture is no longer in the gallery.'));
  assert.equal(row.children.length, 0);
  pictures = [pic('a', 'starred', 100)];
  await g.loadGallery(true);
  await tick();
  assert.ok(!texts(view).includes('This picture is no longer in the gallery.'), 'the message goes away');
  assert.deepEqual(row.children.map(b => b.textContent), ['Unstar', 'X'], 'the actions are back, for the new state');

  const g2 = await fresh();
  g2.initGallery({ apiBase: '', getToken: () => 't', fetch: f });
  fail = true;
  await g2.loadGallery(true);
  fail = false;
  g2.stopGallery();
  g2.initGallery({ getToken: () => 'again' });
  const b2 = g2.galleryEntryNode(); body.append(b2);
  await tick(40);
  assert.ok(texts(b2).includes('1 picture kept'), 'no leftover backoff blocks the first load after a new sign-in');
});
