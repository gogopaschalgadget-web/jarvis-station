import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeGallery, sortGallery, galleryEntry, countWords, dateWords, actionsFor, afterChoice, galleryChoiceBody } from '../js/cas-gallery-logic.js';

const pic = (id, state, created, extra = {}) => ({ id, state, created, chosen: created + 5, subject: 'Subject ' + id, width: 1024, height: 768, rarity: 'common', ...extra });

test('the gallery list keeps only well-formed starred and kept pictures: starred first, then kept, newest first; rejected, unanswered and junk never show', () => {
  const raw = { pictures: [
    pic('k1', 'kept', 100), pic('s1', 'starred', 50), pic('k2', 'kept', 300), pic('r1', 'rejected', 400), pic('n1', 'shown', 500), pic('s2', 'starred', 200),
    pic('../etc', 'kept', 9), pic('has space', 'kept', 9), pic('k1', 'kept', 999), null, 'x', { id: 5, state: 'kept' }, { id: 'u1', state: 'weird' }, { id: 'u2' }, pic('k3', 'KEPT', 1),
  ] };
  const g = normalizeGallery(raw);
  assert.deepEqual(g.map(p => p.id), ['s2', 's1', 'k2', 'k1']);
  assert.deepEqual(g.map(p => p.state), ['starred', 'starred', 'kept', 'kept']);
  for (const bad of [null, undefined, 'x', 5, {}, { pictures: 'no' }, { pictures: null }]) assert.deepEqual(normalizeGallery(bad), []);
});

test('every field from the server is type-checked and cut: text is plain, numbers are whole and non-negative, nothing else is carried', () => {
  const [p] = normalizeGallery({ pictures: [{ id: 'a1', state: 'kept', subject: '<img src=x onerror=1>' + 'z'.repeat(100), created: 'now', chosen: -4, width: '9', height: 10.4, secret: 'x', card_id: 'c' }] });
  assert.equal(p.subject.length, 60);
  assert.equal(p.created, 0);
  assert.equal(p.chosen, 0);
  assert.equal(p.width, 0);
  assert.equal(p.height, 10);
  assert.deepEqual(Object.keys(p).sort(), ['chosen', 'created', 'height', 'id', 'state', 'subject', 'width']);
  assert.equal(normalizeGallery({ pictures: Array.from({ length: 500 }, (_, i) => pic('p' + i, 'kept', i)) }).length, 400, 'at most 400');
});

test('sorting is stable by id for equal dates; the entry names the newest by date and counts', () => {
  assert.deepEqual(sortGallery([pic('b', 'kept', 5), pic('a', 'kept', 5)]).map(p => p.id), ['a', 'b']);
  assert.deepEqual(galleryEntry([]), { count: 0, newest: null });
  assert.deepEqual(galleryEntry(null), { count: 0, newest: null });
  const e = galleryEntry([pic('s', 'starred', 10), pic('k', 'kept', 99)]);
  assert.equal(e.count, 2);
  assert.equal(e.newest.id, 'k');
  assert.equal(countWords(1), '1 picture');
  assert.equal(countWords(0), '0 pictures');
  assert.equal(countWords(12), '12 pictures');
});

test('dates are the phone\'s own calendar day; no time means no date', () => {
  const t = new Date(2026, 10, 21, 12).getTime() / 1000;
  assert.equal(dateWords(t), '21 Nov 2026');
  for (const bad of [0, -1, NaN, '5', null, undefined, Infinity]) assert.equal(dateWords(bad), '');
});

test('what can be done with a picture depends on its state; a choice is built only for an allowed action, a reason only for X', () => {
  assert.deepEqual(actionsFor('starred'), ['unstar', 'reject']);
  assert.deepEqual(actionsFor('kept'), ['star', 'reject']);
  assert.deepEqual(actionsFor('rejected'), []);
  assert.deepEqual(actionsFor(undefined), []);
  assert.deepEqual(galleryChoiceBody('kept', 'star'), { choice: 'star' });
  assert.deepEqual(galleryChoiceBody('starred', 'unstar', 'ignored'), { choice: 'unstar' });
  assert.deepEqual(galleryChoiceBody('kept', 'reject', '  too dark  '), { choice: 'reject', reason: 'too dark' });
  assert.equal(galleryChoiceBody('kept', 'unstar'), null, 'a kept picture cannot be unstarred');
  assert.equal(galleryChoiceBody('starred', 'star'), null);
  assert.equal(galleryChoiceBody('kept', 'delete'), null);
  assert.equal(galleryChoiceBody('rejected', 'star'), null);
});

test('after a choice the list follows: star and unstar change the state and the order, X removes the picture', () => {
  const list = normalizeGallery({ pictures: [pic('a', 'starred', 10), pic('b', 'kept', 30), pic('c', 'kept', 20)] });
  assert.deepEqual(list.map(p => p.id), ['a', 'b', 'c']);
  assert.deepEqual(afterChoice(list, 'b', 'star').map(p => [p.id, p.state]), [['b', 'starred'], ['a', 'starred'], ['c', 'kept']]);
  assert.deepEqual(afterChoice(list, 'a', 'unstar').map(p => [p.id, p.state]), [['b', 'kept'], ['c', 'kept'], ['a', 'kept']]);
  assert.deepEqual(afterChoice(list, 'c', 'reject').map(p => p.id), ['a', 'b']);
  assert.deepEqual(afterChoice(list, 'zzz', 'reject').map(p => p.id), ['a', 'b', 'c'], 'an unknown id changes nothing');
  assert.equal(list.length, 3, 'the old list is not changed');
  assert.deepEqual(afterChoice(null, 'a', 'star'), []);
});

// ---- the DOM part, on a small fake document

function makeDom() {
  const body = { children: [], append(c) { this.children.push(c); c.parent = this; }, removeChild(c) { this.children = this.children.filter(x => x !== c); } };
  const mk = tag => {
    const n = { tag, className: '', textContent: '', attrs: {}, dataset: {}, children: [], listeners: {}, hidden: false, inert: false, type: '', src: '', alt: '', parent: null,
      append(...cs) { cs.forEach(c => { c.parent = this; this.children.push(c); }); },
      replaceChildren(...cs) { this.children = []; cs.forEach(c => this.append(c)); },
      setAttribute(k, v) { this.attrs[k] = v; }, addEventListener(t, f) { (this.listeners[t] ||= []).push(f); },
      focus() {}, remove() { if (this.parent) this.parent.children = this.parent.children.filter(x => x !== this); this.parent = null; },
      get isConnected() { let p = this; while (p.parent) p = p.parent; return p === body; },
      click() { (this.listeners.click || []).forEach(f => f({ target: this })); } };
    return n;
  };
  const docListeners = {};
  const doc = { body, createElement: mk, activeElement: null, documentElement: { dataset: {} }, addEventListener: (t, f) => { (docListeners[t] ||= []).push(f); }, removeEventListener: (t, f) => { docListeners[t] = (docListeners[t] || []).filter(x => x !== f); } };
  globalThis.document = doc;
  globalThis.URL.createObjectURL = () => 'blob:fake';
  globalThis.URL.revokeObjectURL = () => {};
  delete globalThis.IntersectionObserver;
  delete globalThis.createImageBitmap;
  return { doc, body, docListeners };
}
const all = (n, out = []) => { out.push(n); n.children.forEach(c => all(c, out)); return out; };
const texts = n => all(n).map(x => x.textContent).filter(Boolean);
const fresh = async () => (await import('../js/cas-gallery.js?t=' + Math.random() + Date.now()));

function server(initial, opts = {}) {
  const calls = [];
  let pictures = initial;
  const f = async (url, init = {}) => {
    const path = url.split('/api/station/pictures')[1];
    calls.push({ path, method: init.method, body: init.body ? JSON.parse(init.body) : undefined, auth: init.headers && init.headers.Authorization });
    if (path === '') return { ok: !opts.listStatus, status: opts.listStatus || 200, json: async () => ({ pictures, waiting: 0 }) };
    if (/\/picture$/.test(path)) return { ok: true, status: 200, blob: async () => ({ type: opts.mime || 'image/png' }) };
    if (/\/choice$/.test(path)) {
      if (!opts.choiceStatus) { const id = path.split('/')[1]; const c = JSON.parse(init.body).choice; pictures = pictures.map(p => (p.id === id ? { ...p, state: { star: 'starred', unstar: 'kept', reject: 'rejected' }[c] } : p)); }
      return { ok: !opts.choiceStatus, status: opts.choiceStatus || 200, json: async () => ({ ok: true }) };
    }
    return { ok: false, status: 404 };
  };
  return { f, calls, set: p => { pictures = p; } };
}

test('the entry says what is there: loading, the plain empty words, or the count and newest date; the request carries the device token and nothing else', async () => {
  const { body } = makeDom();
  const g = await fresh();
  const s = server([]);
  g.initGallery({ apiBase: 'https://api.test', getToken: () => 'tok', fetch: s.f });
  const box = g.galleryEntryNode(); document.body.append(box);
  assert.ok(texts(box).includes('Loading...'));
  await g.loadGallery(true);
  assert.ok(texts(box).includes('Finish a card to earn your first picture.'), 'the empty state in plain words');
  assert.equal(s.calls[0].auth, 'Bearer tok');
  assert.equal(s.calls[0].method, 'GET');
  s.set([pic('a1', 'kept', new Date(2026, 10, 21, 12).getTime() / 1000), pic('b1', 'rejected', 5)]);
  await g.loadGallery(true);
  assert.ok(texts(box).includes('1 picture kept'));
  assert.ok(texts(box).includes('Newest 21 Nov 2026'));
  assert.equal(all(box).filter(n => n.tag === 'img').length, 1, 'the newest thumbnail');
  assert.ok(body);
});

test('a failed list says so and a 401 stops asking; the entry never throws', async () => {
  makeDom();
  const g = await fresh();
  const s = server([], { listStatus: 500 });
  g.initGallery({ apiBase: '', getToken: () => 't', fetch: s.f });
  const box = g.galleryEntryNode(); document.body.append(box);
  await g.loadGallery(true);
  assert.ok(texts(box).includes('Not available right now.'));
  const s2 = server([], { listStatus: 401 });
  const g2 = await fresh();
  g2.initGallery({ apiBase: '', getToken: () => 't', fetch: s2.f });
  await g2.loadGallery(true);
  await g2.loadGallery(true);
  assert.equal(s2.calls.length, 1, 'after a 401 it asks no more');
});

test('opening the entry shows the grid: starred first, then kept, a caption per picture; tapping one shows it with its subject and date and the actions for its state; X asks for a reason and removes it', async () => {
  const { body } = makeDom();
  const g = await fresh();
  const t = d => new Date(2026, 10, d, 12).getTime() / 1000;
  const s = server([pic('k1', 'kept', t(20)), pic('s1', 'starred', t(10)), pic('k2', 'kept', t(21)), pic('x1', 'rejected', t(22))]);
  g.initGallery({ apiBase: '', getToken: () => 't', fetch: s.f, say: () => {} });
  const box = g.galleryEntryNode(); document.body.append(box);
  await g.loadGallery(true);
  all(box).find(n => n.tag === 'button').click();
  const grid = body.children.find(c => c.className === 'gal-overlay');
  assert.ok(grid, 'the grid opened');
  assert.equal(grid.attrs['aria-modal'], 'true');
  const cells = all(grid).filter(n => n.className === 'gal-cell');
  assert.deepEqual(cells.map(c => c.dataset.state), ['starred', 'kept', 'kept']);
  assert.deepEqual(cells.map(c => all(c).find(n => n.tag === 'b').textContent), ['★ Subject s1', 'Subject k2', 'Subject k1']);
  assert.ok(!all(grid).some(n => n.textContent === 'Subject x1'), 'rejected never shows');
  cells[1].click();
  await new Promise(r => setTimeout(r, 20));
  const view = body.children.filter(c => c.className === 'gal-overlay').pop();
  assert.ok(texts(view).includes('Subject k2') && texts(view).includes('21 Nov 2026'));
  const buttons = all(view).filter(n => n.className.startsWith('gal-btn')).map(n => n.textContent);
  assert.deepEqual(buttons, ['Star', 'X', 'Send X']);
  const [star, x, send] = all(view).filter(n => n.className.startsWith('gal-btn'));
  const why = all(view).find(n => n.className === 'gal-why');
  assert.equal(why.hidden, true);
  x.click();
  assert.equal(why.hidden, false, 'X asks for the reason first');
  all(view).find(n => n.tag === 'input').value = 'too dark';
  send.click();
  await new Promise(r => setTimeout(r, 20));
  const choice = s.calls.find(c => /choice$/.test(c.path));
  assert.equal(choice.method, 'POST');
  assert.deepEqual(choice.body, { choice: 'reject', reason: 'too dark' });
  assert.ok(choice.path.startsWith('/k2/'));
  assert.ok(!body.children.some(c => c.className === 'gal-overlay' && texts(c).includes('Subject k2') && c.attrs['aria-label'] === 'Picture'), 'the picture view closed');
  const gridNow = body.children.find(c => c.className === 'gal-overlay');
  assert.deepEqual(all(gridNow).filter(n => n.className === 'gal-cell').map(c => c.dataset.state), ['starred', 'kept'], 'X removed it from the grid');
});

test('Star and Unstar change the state through the same choice route; a failed save keeps the picture open and says so; a changed server refreshes the list', async () => {
  const { body } = makeDom();
  const g = await fresh();
  const s = server([pic('a', 'starred', 100), pic('b', 'kept', 50)]);
  g.initGallery({ apiBase: '', getToken: () => 't', fetch: s.f, say: () => {} });
  const box = g.galleryEntryNode(); document.body.append(box);
  await g.loadGallery(true);
  all(box).find(n => n.tag === 'button').click();
  const open = i => { all(body.children.find(c => c.className === 'gal-overlay')).filter(n => n.className.startsWith('gal-cell'))[i].click(); return new Promise(r => setTimeout(r, 20)); };
  await open(0);
  let view = body.children.filter(c => c.className === 'gal-overlay').pop();
  assert.deepEqual(all(view).filter(n => n.className.startsWith('gal-btn')).map(n => n.textContent), ['Unstar', 'X', 'Send X']);
  all(view).filter(n => n.className.startsWith('gal-btn'))[0].click();
  await new Promise(r => setTimeout(r, 30));
  assert.deepEqual(s.calls.filter(c => /choice$/.test(c.path)).pop().body, { choice: 'unstar' });
  const s2 = server([pic('a', 'kept', 100)], { choiceStatus: 500 });
  const g2 = await fresh();
  makeDom();
  g2.initGallery({ apiBase: '', getToken: () => 't', fetch: s2.f, say: () => {} });
  const box2 = g2.galleryEntryNode(); document.body.append(box2);
  await g2.loadGallery(true);
  all(box2).find(n => n.tag === 'button').click();
  const b2 = document.body;
  all(b2.children.find(c => c.className === 'gal-overlay')).find(n => n.className === 'gal-cell').click();
  await new Promise(r => setTimeout(r, 20));
  view = b2.children.filter(c => c.className === 'gal-overlay').pop();
  all(view).find(n => n.className === 'gal-btn star').click();
  await new Promise(r => setTimeout(r, 20));
  assert.ok(texts(view).includes('Not saved. Try again.'));
  assert.ok(b2.children.includes(view), 'the picture stays open');
  const s3 = server([pic('a', 'kept', 100)], { choiceStatus: 409 });
  const g3 = await fresh();
  makeDom();
  g3.initGallery({ apiBase: '', getToken: () => 't', fetch: s3.f, say: () => {} });
  const box3 = g3.galleryEntryNode(); document.body.append(box3);
  await g3.loadGallery(true);
  all(box3).find(n => n.tag === 'button').click();
  all(document.body.children.find(c => c.className === 'gal-overlay')).find(n => n.className === 'gal-cell').click();
  await new Promise(r => setTimeout(r, 20));
  const v3 = document.body.children.filter(c => c.className === 'gal-overlay').pop();
  const before = s3.calls.filter(c => c.path === '').length;
  all(v3).find(n => n.className === 'gal-btn star').click();
  await new Promise(r => setTimeout(r, 30));
  assert.ok(texts(v3).includes('That changed on the server. The list is refreshed.'));
  assert.ok(s3.calls.filter(c => c.path === '').length > before, 'the list was asked for again');
});

test('professional mode keeps the entry and shows the pictures as a plain list with no thumbnails; Escape closes the top view and gives the page back', async () => {
  const { body, docListeners } = makeDom();
  document.documentElement.dataset.mode = 'professional';
  const app = { inert: false };
  body.children.push(app);
  const g = await fresh();
  const s = server([pic('a', 'kept', 100), pic('b', 'starred', 50)]);
  g.initGallery({ apiBase: '', getToken: () => 't', fetch: s.f, say: () => {} });
  const box = g.galleryEntryNode(); document.body.append(box);
  await g.loadGallery(true);
  assert.equal(all(box).filter(n => n.tag === 'img').length, 0, 'no thumbnail in the entry');
  all(box).find(n => n.tag === 'button').click();
  const grid = body.children.find(c => c.className === 'gal-overlay');
  assert.equal(all(grid).filter(n => n.tag === 'img').length, 0);
  assert.equal(all(grid).filter(n => n.className === 'gal-row').length, 2, 'a plain list');
  assert.ok(!s.calls.some(c => /picture$/.test(c.path)), 'no picture is fetched for a list');
  assert.equal(app.inert, true);
  docListeners.keydown[0]({ key: 'Escape' });
  assert.ok(!body.children.some(c => c.className === 'gal-overlay'));
  assert.equal(app.inert, false);
  assert.equal((docListeners.keydown || []).length, 0, 'the key listener is removed');
});

test('a thumbnail is fetched only for what is shown and never for rejected pictures; a non-image answer is never used', async () => {
  makeDom();
  const g = await fresh();
  const s = server([pic('a', 'kept', 100)], { mime: 'text/html' });
  g.initGallery({ apiBase: '', getToken: () => 't', fetch: s.f });
  const box = g.galleryEntryNode(); document.body.append(box);
  await g.loadGallery(true);
  await new Promise(r => setTimeout(r, 30));
  const img = all(box).find(n => n.tag === 'img');
  assert.equal(img.src, '', 'a page or script served as a picture is dropped');
  assert.ok(s.calls.some(c => c.path === '/a/picture'));
});

test('hardening: no HTML from the server is ever parsed (text nodes only), ids are encoded in paths, and the entry sits in the More tab behind a try', () => {
  const src = readFileSync(new URL('../js/cas-gallery.js', import.meta.url), 'utf8');
  assert.ok(!/innerHTML|insertAdjacentHTML|outerHTML|document\.write/.test(src));
  assert.ok(src.includes("encodeURIComponent(id)"));
  const desk = readFileSync(new URL('../js/cas-desk.js', import.meta.url), 'utf8');
  assert.ok(!desk.includes('galleryEntryNode'), 'the Bulletin Board no longer carries the entry');
  const appSrc = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
  assert.match(appSrc, /try \{ const card = panel\.querySelector\('\.panel-card'\); if \(card\) card\.append\(galleryEntryNode\(\)\); \} catch/);
  assert.match(appSrc, /import \{ stopGallery, galleryEntryNode \} from '\.\/cas-gallery\.js\?v=cas109'/);
  assert.match(desk, /onChoice: \(\) => invalidateGallery\(\)/);
  const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  assert.ok(sw.includes("'js/cas-gallery.js'") && sw.includes("'js/cas-gallery-logic.js'"));
  const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
  assert.ok(app.includes('stopGallery()'), 'signing out forgets the list and the thumbnails');
  const css = readFileSync(new URL('../css/cas-desk.css', import.meta.url), 'utf8');
  assert.match(css, /html\[data-mode="professional"\] \.gal-entry-pic \{ display: none; \}/);
});

test('signing out forgets the list and the thumbnails and lets a new sign-in ask again; a 401 stops asking until then', async () => {
  makeDom();
  const g = await fresh();
  const s = server([pic('a', 'kept', 100)]);
  g.initGallery({ apiBase: '', getToken: () => 't', fetch: s.f });
  await g.loadGallery(true);
  g.stopGallery();
  await g.loadGallery(true);
  assert.equal(s.calls.filter(c => c.path === '').length, 2, 'after a sign-out and a new sign-in it asks again');
  const s2 = server([], { listStatus: 401 });
  const g2 = await fresh();
  g2.initGallery({ apiBase: '', getToken: () => 't', fetch: s2.f });
  await g2.loadGallery(true);
  g2.initGallery({ getToken: () => 'new' });
  await g2.loadGallery(true);
  assert.equal(s2.calls.length, 2, 'a fresh sign-in is asked for again');
});

test('every module changed in this stack carries the one new tag in every importer, and signing out forgets the rank memory (run, not matched)', async () => {
  const { makeRankMemory } = await import('../js/cas-progress.js?t=' + Math.random());
  const store = {};
  const storage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
  const prog = i => ({ rank: { index: i, name: 'R' + i } });
  const mem = makeRankMemory(storage);
  assert.equal(mem.check(prog(2)), null, 'a first read is only a baseline');
  mem.forget();
  assert.deepEqual(store, {}, 'both keys are gone from storage');
  assert.equal(mem.seen(), null);
  assert.equal(mem.shown(), null);
  assert.equal(mem.check(prog(6)), null, 'the next account, first read: a baseline, no card');
  assert.equal(store['cas-rank-shown'], '6');
  assert.deepEqual(mem.check(prog(7)), { index: 7, name: 'R7' }, 'a real later gain still plays');
  assert.doesNotThrow(() => makeRankMemory({ getItem: () => null, setItem() {}, removeItem() { throw new Error('blocked'); } }).forget());

  const changed = ['cas-gallery-logic', 'cas-gallery', 'cas-machines', 'cas-places', 'cas-progress', 'cas-rankup', 'cas-reveal', 'cas-theme-art', 'cas-themes', 'cas-trim', 'cas-desk'];
  const files = ['app', ...changed, 'cas-places'].map(n => readFileSync(new URL('../js/' + n + '.js', import.meta.url), 'utf8')).join('\n') + readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  for (const m of changed) {
    const tags = [...files.matchAll(new RegExp('\\./' + m + '\\.js\\?v=(cas\\d+)', 'g'))].map(x => x[1]);
    assert.ok(tags.length, m + ' is imported');
    const want = m === 'cas-desk' ? 'cas114' : m === 'cas-reveal' ? 'cas112' : m === 'cas-themes' ? 'cas111' : m === 'cas-gallery' ? 'cas109' : 'cas104';   // changed again: cas-gallery (overlay fix) cas109; cas-desk and cas-themes (Appearance directions) cas111; the rest are unchanged
    assert.ok(tags.every(t => t === want), m + ' carries ' + want + ' everywhere: ' + tags);
  }
  assert.match(files, /js\/app\.js\?v=cas114/);
  const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
  assert.ok(/forgetRank\(\)/.test(app));
});

// ---- the empty gallery froze the app on the phone: the overlay sat under the header and the bottom bar, so its Close button could not be seen or reached while the app behind it was switched off

test('freeze: the gallery and reveal overlays sit above every piece of the Station frame and take their margins from the phone, not from a variable nothing sets', () => {
  const css = ['station.css', 'cas-identity.css', 'cas-chat.css', 'cas-threads.css', 'cas-missions.css', 'features.css', 'station-theme.css', 'cas-desk.css']
    .map(n => readFileSync(new URL('../css/' + n, import.meta.url), 'utf8')).join('\n');
  const frame = [];
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const z = m[2].match(/z-index:\s*(\d+)/);
    if (z && !/\.gal-|\.rv-|\.rankup|\.dk-sheetwrap/.test(m[1])) frame.push(Number(z[1]));
  }
  assert.ok(frame.length > 10 && Math.max(...frame) >= 200, 'found the frame layers');
  for (const sel of ['gal-overlay', 'rv-overlay']) {
    const rule = css.match(new RegExp('\.' + sel + ' \{([^}]*)\}'))[1];
    assert.ok(Number(rule.match(/z-index:\s*(\d+)/)[1]) > Math.max(...frame), sel + ' is above the header, the bottom bar and the Cas sheets');
    assert.ok(/env\(safe-area-inset-top/.test(rule) && /env\(safe-area-inset-bottom/.test(rule), sel + ' keeps clear of the notch and the home bar');
    assert.ok(!/var\(--top|var\(--bot/.test(rule), sel + ' does not rely on --top and --bot, which the app never sets');
  }
  assert.ok(!/--top\s*:|--bot\s*:/.test(readFileSync(new URL('../js/app.js', import.meta.url), 'utf8') + css), 'nothing in the app sets --top or --bot');
});

test('freeze: an empty gallery opens as a short friendly card, and Close, the dark area and Escape each give the whole app back', async () => {
  for (const way of ['close', 'backdrop', 'escape']) {
    const { body, docListeners } = makeDom();
    const g = await fresh();
    const s = server([]);
    g.initGallery({ apiBase: '', getToken: () => 't', fetch: s.f, say: () => {} });
    const frame = document.createElement('div'); body.append(frame);
    const box = g.galleryEntryNode(); frame.append(box);
    await g.loadGallery(true);
    all(box).find(n => n.tag === 'button').click();
    const shell = body.children.find(c => c.className === 'gal-overlay');
    assert.ok(shell, 'it opened');
    const card = shell.children[0];
    assert.equal(card.className, 'gal-card gal-short', 'a short card, so the dark area below it can be tapped');
    assert.ok(texts(shell).includes('Finish a card to earn your first picture.'));
    assert.equal(frame.inert, true, 'the app behind is switched off while it is open');
    if (way === 'close') all(shell).find(n => n.className === 'gal-close').click();
    else if (way === 'backdrop') shell.listeners.click.forEach(f => f({ target: shell }));
    else docListeners.keydown.forEach(f => f({ key: 'Escape' }));
    assert.ok(!body.children.includes(shell), way + ' closed it');
    assert.equal(frame.inert, false, way + ' switched the app back on');
  }
});

test('freeze: a failed, slow-to-fail, empty or odd list never leaves the overlay without a way out and never throws', async () => {
  const bodies = [
    { name: 'server error', opts: { listStatus: 500 } },
    { name: 'signed out', opts: { listStatus: 401 } },
    { name: 'not found', opts: { listStatus: 404 } },
    { name: 'no list at all', raw: () => null },
    { name: 'a list that is not a list', raw: () => ({ pictures: 'none' }) },
    { name: 'a bare array', raw: () => [] },
    { name: 'rows that are not pictures', raw: () => ({ pictures: [null, 5, 'x', {}, { id: '../x', state: 'kept' }, { id: 'ok', state: 'pending' }] }) },
    { name: 'the answer cannot be read', raw: () => { throw new Error('bad json'); } },
    { name: 'the network drops', fail: true },
  ];
  for (const b of bodies) {
    const { body } = makeDom();
    const g = await fresh();
    const base = server([], b.opts || {});
    const f = b.fail ? async () => { throw new TypeError('Load failed'); }
      : b.raw ? async (u, i) => (/pictures$/.test(u) ? { ok: true, status: 200, json: async () => b.raw() } : base.f(u, i)) : base.f;
    g.initGallery({ apiBase: '', getToken: () => 't', fetch: f, say: () => {} });
    const frame = document.createElement('div'); body.append(frame);
    const box = g.galleryEntryNode(); frame.append(box);
    await g.loadGallery(true);
    all(box).find(n => n.tag === 'button').click();
    const shell = body.children.find(c => c.className === 'gal-overlay');
    assert.ok(shell, b.name + ': it opened');
    assert.ok(texts(shell).some(t => /Finish a card|Not available right now|Loading/.test(t)), b.name + ': it says something plain');
    assert.equal(shell.children[0].className, 'gal-card gal-short', b.name + ': a short card');
    all(shell).find(n => n.className === 'gal-close').click();
    assert.ok(!body.children.includes(shell) && frame.inert === false, b.name + ': Close gives the app back');
  }
});

test('freeze: a slow server and a server that never answers leave the Gallery closable the whole time; the wait ends by itself', async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  for (const kind of ['slow', 'never']) {
    const { body } = makeDom();
    const g = await fresh();
    const base = server([]);
    const f = (u, i) => (/pictures$/.test(u) ? (kind === 'slow' ? wait(150).then(() => base.f(u, i)) : new Promise(() => {})) : base.f(u, i));
    g.initGallery({ apiBase: '', getToken: () => 't', fetch: f, say: () => {}, timeoutMs: 60 });
    const frame = document.createElement('div'); body.append(frame);
    const box = g.galleryEntryNode(); frame.append(box);
    assert.ok(texts(box).includes('Loading...'), kind + ': it says it is loading');
    all(box).find(n => n.tag === 'button').click();
    const shell = body.children.find(c => c.className === 'gal-overlay');
    assert.ok(texts(shell).includes('Loading...'), kind + ': the card says loading, it does not hang');
    all(shell).find(n => n.className === 'gal-close').click();
    assert.ok(!body.children.includes(shell) && frame.inert === false, kind + ': Close works at once, while the server is still silent');
    all(box).find(n => n.tag === 'button').click();
    const again = body.children.find(c => c.className === 'gal-overlay');
    assert.ok(again, kind + ': it can be opened again while waiting');
    await wait(260);
    assert.ok(texts(box).some(t => /Not available right now|Finish a card/.test(t)), kind + ': the wait ended and the entry says something plain: ' + texts(box));
    assert.ok(texts(again).some(t => /Not available right now|Finish a card/.test(t)), kind + ': the open card followed');
    all(again).find(n => n.className === 'gal-close').click();
    assert.ok(!body.children.some(c => c.className === 'gal-overlay') && frame.inert === false, kind + ': and it still closes');
  }
});
