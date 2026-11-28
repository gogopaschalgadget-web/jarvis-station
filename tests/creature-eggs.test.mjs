import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import * as L from '../js/cas-creature-logic.js';

const SIX = ['lava', 'stag', 'moss', 'wolf', 'bull', 'squirrel'];
const NAMES = ['egg-0-whole', 'egg-1-wobble', 'egg-2-cracks', 'egg-3-wide', 'egg-4-burst'];
const STEPS = { null: 'egg-0-whole', wobble: 'egg-1-wobble', cracks1: 'egg-2-cracks', cracks2: 'egg-3-wide' };
const REW = { xs: { xp: 20, step: 'common' }, s: { xp: 40, step: 'common' }, m: { xp: 60, step: 'common' }, l: { xp: 100, step: 'uncommon' }, xl: { xp: 160, step: 'rare', animated: true } };
const egg = o => ({ number: 1, phase: 'egg', xp_in: 120, xp_to_next: 120, next_label: 'the next crack', egg_step: 'cracks1', traits: [], mood: 'awake', next_reward: REW, art: { still: null, loop: null }, ...o });
const mon = o => ({ number: 1, phase: 'creature', xp_in: 480, xp_to_next: 170, next_label: 'Level 3', level: 2, stage: 'hatchling', species: 'lava', rarity: 'common', name: null, suggested_name: 'Ember', traits: [], mood: 'awake', next_reward: REW, art: { still: null, loop: null }, ...o });
const read = c => L.normalizeCreatureRead({ creature: c, stable: [], epoch: 'x', professional_mode_hidden: false });
const url = p => new URL('../' + p, import.meta.url);

/** Width and height from the WebP header (lossy, lossless or extended). */
function webpSize(buf) {
  assert.equal(buf.toString('ascii', 0, 4), 'RIFF');
  assert.equal(buf.toString('ascii', 8, 12), 'WEBP');
  assert.equal(buf.readUInt32LE(4) + 8, buf.length, 'the RIFF length matches the file');
  const kind = buf.toString('ascii', 12, 16);
  if (kind === 'VP8 ') return [buf.readUInt16LE(26) & 0x3fff, buf.readUInt16LE(28) & 0x3fff];
  if (kind === 'VP8L') { const b = buf.readUInt32LE(21); return [(b & 0x3fff) + 1, ((b >> 14) & 0x3fff) + 1]; }
  if (kind === 'VP8X') return [buf.readUIntLE(24, 3) + 1, buf.readUIntLE(27, 3) + 1];
  return assert.fail('not a WebP picture: ' + kind);
}

test('the 30 species egg files are in place: six folders, five names, listed in the manifest, real WebP, sane size', () => {
  const m = JSON.parse(readFileSync(url('creatures/manifest.json'), 'utf8'));
  const listed = L.normalizeManifest(m);
  let n = 0;
  for (const sp of SIX) {
    for (const name of NAMES) {
      const rel = `egg-${sp}/${name}.webp`;
      assert.ok(listed.has(rel), rel + ' is listed in the manifest');
      assert.ok(existsSync(url('creatures/' + rel)), rel + ' is on disk');
      const buf = readFileSync(url('creatures/' + rel));
      assert.ok(buf.length > 5000 && buf.length < 200 * 1024, rel + ' is a sane size: ' + buf.length);
      const [w, h] = webpSize(buf);
      assert.ok(w >= 256 && w <= 2048 && w === h, `${rel} is square and sane: ${w}x${h}`);
      n++;
    }
  }
  assert.equal(n, 30);
  assert.equal([...listed].filter(f => f.startsWith('egg-')).length, 30, 'nothing else under egg-<species>');
});

test('every species shows its own egg at every step, and the burst for the hatch', () => {
  const files = L.normalizeManifest(JSON.parse(readFileSync(url('creatures/manifest.json'), 'utf8')));
  for (const sp of SIX) {
    for (const [step, name] of Object.entries(STEPS)) {
      const c = read(egg({ species: sp, egg_step: step === 'null' ? null : step })).creature;
      assert.equal(L.pickArt(c, files), `creatures/egg-${sp}/${name}.webp`, `${sp} ${step}`);
      assert.equal(L.neutralEggFile(c, f => files.has(f)), `egg/${name}.webp`, `${sp} ${step}: the neutral egg of the same step is the fallback`);
    }
    assert.equal(L.burstEggFile({ species: sp }, f => files.has(f)), `egg-${sp}/egg-4-burst.webp`);
  }
  assert.equal(L.pickArt(read(egg({ species: null, egg_step: null })).creature, files), 'creatures/egg/egg-0-whole.webp', 'no species: the neutral egg');
  assert.equal(L.neutralBurstFile(f => files.has(f)), 'egg/egg-4-burst.webp');
  assert.equal(L.neutralBurstFile(() => false), null);
  assert.equal(L.neutralEggFile(read(egg({ species: 'stag' })).creature, () => false), null, 'no neutral egg listed: nothing to fall back to');
});

function makeDom() {
  const mk = tag => ({
    tag, className: '', textContent: '', attrs: {}, children: [], listeners: {}, style: {}, type: '', src: '', alt: '', decoding: '', dataset: {},
    classList: { add(c) { this._o.className += ' ' + c; } },
    append(...cs) { cs.forEach(c => this.children.push(c)); },
    replaceChildren(...cs) { this.children = cs; },
    setAttribute(k, v) { this.attrs[k] = v; }, addEventListener(t, f) { (this.listeners[t] ||= []).push(f); },
  });
  const wrap = tag => { const n = mk(tag); n.classList._o = n; return n; };
  const body = { shown: [], append(n) { this.shown.push(n); } };
  globalThis.document = { createElement: wrap, documentElement: { dataset: {} }, body };
  return body;
}
const all = (n, out = []) => { out.push(n); n.children.forEach(c => all(c, out)); return out; };
const fresh = () => import('../js/cas-creature.js?t=' + Math.random());
const MANIFEST_FILES = ['egg/egg-0-whole.webp', 'egg/egg-2-cracks.webp', 'egg/egg-4-burst.webp', 'egg-stag/egg-0-whole.webp', 'egg-stag/egg-2-cracks.webp', 'egg-stag/egg-4-burst.webp', 'lava/hatchling.webp'];
const server = body => async () => ({ ok: true, status: 200, json: async () => body });

test('a species egg that fails to load shows the neutral egg of the same step once, then the placeholder; never a broken picture', async () => {
  makeDom();
  const v = await fresh();
  v.initCreature({ apiBase: 'https://x', getToken: () => 't', fetch: server({ creature: egg({ species: 'stag', egg_step: 'cracks1' }), files: MANIFEST_FILES, stable: [] }) });
  assert.ok(await v.loadCreature(true));
  const pic = v.pictureNode(v.creatureRead().creature);
  const img = all(pic).find(n => n.tag === 'img');
  assert.equal(img.src, 'creatures/egg-stag/egg-2-cracks.webp', 'first the species egg');
  img.listeners.error[0]();
  assert.equal(img.src, 'creatures/egg/egg-2-cracks.webp', 'the species egg failed: the neutral egg of the same step');
  assert.ok(all(pic).some(n => n.tag === 'img') && !/placeholder/.test(pic.className));
  img.listeners.error[0]();
  assert.ok(!all(pic).some(n => n.tag === 'img') && /placeholder/.test(pic.className), 'the neutral egg failed too: the dashed placeholder');
  v.forgetCreature();
});

test('an egg with no species egg listed starts on the neutral egg, and a failure there goes straight to the placeholder', async () => {
  makeDom();
  const v = await fresh();
  v.initCreature({ apiBase: 'https://x', getToken: () => 't', fetch: server({ creature: egg({ species: 'wolf', egg_step: null }), files: MANIFEST_FILES, stable: [] }) });
  await v.loadCreature(true);
  const pic = v.pictureNode(v.creatureRead().creature);
  const img = all(pic).find(n => n.tag === 'img');
  assert.equal(img.src, 'creatures/egg/egg-0-whole.webp');
  img.listeners.error[0]();
  assert.ok(!all(pic).some(n => n.tag === 'img') && /placeholder/.test(pic.className));
  v.forgetCreature();
});

test('a creature picture that fails still goes to the placeholder (no egg fallback for a creature)', async () => {
  makeDom();
  const v = await fresh();
  v.initCreature({ apiBase: 'https://x', getToken: () => 't', fetch: server({ creature: mon(), files: MANIFEST_FILES, stable: [] }) });
  await v.loadCreature(true);
  const pic = v.pictureNode(v.creatureRead().creature);
  all(pic).find(n => n.tag === 'img').listeners.error[0]();
  assert.ok(!all(pic).some(n => n.tag === 'img') && /placeholder/.test(pic.className));
  v.forgetCreature();
});

test('the hatch egg picture has an error handler: the neutral burst egg once, then it is hidden', async () => {
  const body = makeDom();
  const v = await fresh();
  let current = { creature: egg({ number: 7, species: 'stag', egg_step: 'cracks2' }), files: MANIFEST_FILES, stable: [] };
  v.initCreature({ apiBase: 'https://x', getToken: () => 't', fetch: async () => ({ ok: true, status: 200, json: async () => current }) });
  await v.loadCreature(true);
  current = { creature: mon({ number: 7, species: 'stag' }), files: MANIFEST_FILES, stable: [] };
  await v.loadCreature(true);
  assert.equal(body.shown.length, 1, 'the hatching overlay is up');
  const hatchImg = all(body.shown[0]).find(n => n.className === 'cr-hatch-egg');
  assert.equal(hatchImg.src, 'creatures/egg-stag/egg-4-burst.webp', 'the species burst egg');
  assert.equal(hatchImg.listeners.error.length, 1, 'it has an error handler');
  hatchImg.listeners.error[0]();
  assert.equal(hatchImg.src, 'creatures/egg/egg-4-burst.webp', 'the neutral burst egg');
  assert.notEqual(hatchImg.style.display, 'none');
  hatchImg.listeners.error[0]();
  assert.equal(hatchImg.style.display, 'none', 'the neutral one failed too: hidden, never a broken picture');
  v.forgetCreature();
});

test('a hatch with no species egg listed starts on the neutral burst egg; a failure there hides it', async () => {
  const body = makeDom();
  const v = await fresh();
  let current = { creature: egg({ number: 8, species: 'wolf' }), files: MANIFEST_FILES, stable: [] };
  v.initCreature({ apiBase: 'https://x', getToken: () => 't', fetch: async () => ({ ok: true, status: 200, json: async () => current }) });
  await v.loadCreature(true);
  current = { creature: mon({ number: 8, species: 'wolf' }), files: MANIFEST_FILES, stable: [] };
  await v.loadCreature(true);
  const hatchImg = all(body.shown[0]).find(n => n.className === 'cr-hatch-egg');
  assert.equal(hatchImg.src, 'creatures/egg/egg-4-burst.webp');
  hatchImg.listeners.error[0]();
  assert.equal(hatchImg.style.display, 'none');
  v.forgetCreature();
});

test('the source has the fallbacks and still builds no markup from text', () => {
  const src = readFileSync(url('js/cas-creature.js'), 'utf8');
  assert.match(src, /neutralEggFile/);
  assert.match(src, /neutralBurstFile/);
  assert.ok(!/innerHTML|insertAdjacentHTML|outerHTML|document\.write/.test(src));
});
