import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { EMOTES, EMOTE_MS, HATCH_MS, nextEmote, emoteClass, cheerWords } from '../js/cas-creature-emotes.js';
import { normalizeForms, formFor, stageWord, pickArt, normalizeManifest } from '../js/cas-creature-logic.js';

const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('there are eight celebrations, 3 s each, and the hatching is 6 s', () => {
  assert.equal(EMOTES.length, 8);
  assert.equal(new Set(EMOTES.map(e => e.key)).size, 8);
  assert.equal(EMOTE_MS, 3000);
  assert.equal(HATCH_MS, 6000);
});

test('a celebration is never the same twice in a row, for any roll', () => {
  for (const e of EMOTES) {
    for (const r of [0, 0.01, 0.5, 0.99, 0.999999]) assert.notEqual(nextEmote(e.key, () => r).key, e.key);
  }
  const seen = new Set();
  let prev = '';
  for (let n = 0; n < 400; n++) { const e = nextEmote(prev); assert.notEqual(e.key, prev); seen.add(e.key); prev = e.key; }
  assert.equal(seen.size, 8, 'all eight come up');
  assert.ok(nextEmote('', () => NaN) && nextEmote('x', () => 'oops'), 'a bad roll still gives one');
});

test('the words come only from a plain whole XP number', () => {
  assert.equal(cheerWords(100), '+100 XP');
  for (const bad of [0, -5, 1.5, '60', null, undefined, 1e9]) assert.equal(cheerWords(bad), '');
  assert.equal(emoteClass({ key: 'spin' }), 'emote-spin');
  assert.equal(emoteClass({ key: 'evil" onclick' }), '');
});

test('the stylesheet has one 3 s animation per celebration, a hatching, and stills under reduced motion', () => {
  const css = read('css/cas-desk.css');
  for (const e of EMOTES) {
    assert.match(css, new RegExp('\.emote-' + e.key + ' \.cr-pic \{ animation-name: cr-e-' + e.key + ' !important'), e.key);
    assert.match(css, new RegExp('@keyframes cr-e-' + e.key + ' '), e.key);
  }
  assert.match(css, /animation-duration: 3s; animation-iteration-count: 1/);
  assert.match(css, /@keyframes cr-hatch-egg/);
  assert.match(css, /@keyframes cr-hatch-born/);
  assert.match(css, /prefers-reduced-motion: reduce\) \{ \.cr-cheer \.cr-pic, \.cr-hatch/);
  const only = [...css.matchAll(/@keyframes cr-e-[a-z0-9]+ \{([^@]*?)\n/g)].map(m => m[1]).join('\n');
  assert.ok(!/(width|height|top|left|margin|opacity):/.test(only), 'celebrations move transforms only');
});

const FORMS = { forms: { wolf: [{ from_level: 5, file: 'wolf/form-3.webp', name: 'Gear Hunter' }, { from_level: 1, file: 'wolf/form-1.webp', name: 'Cog Pup' }, { from_level: 3, file: 'wolf/form-2.webp', name: 'Spring Runner' },
  { from_level: 99, file: 'wolf/form-9.webp', name: 'No' }, { from_level: 4, file: '../evil.webp', name: 'No' }], hippo: [{ from_level: 1, file: 'hippo/form-1.webp' }] } };

test('a species with forms picks the picture and the name by level (the wolf: seven), junk is dropped', () => {
  const forms = normalizeForms(FORMS);
  assert.deepEqual(Object.keys(forms), ['wolf']);
  assert.deepEqual(forms.wolf.map(f => f.from), [1, 3, 5]);
  assert.equal(formFor(forms, 'wolf', 1).name, 'Cog Pup');
  assert.equal(formFor(forms, 'wolf', 2).name, 'Cog Pup');
  assert.equal(formFor(forms, 'wolf', 4).name, 'Spring Runner');
  assert.equal(formFor(forms, 'wolf', 10).name, 'Gear Hunter');
  assert.equal(formFor(forms, 'stag', 3), null);
  assert.equal(stageWord({ phase: 'creature', species: 'wolf', level: 3, stage: 'juvenile' }, forms), 'Spring Runner');
  assert.equal(stageWord({ phase: 'creature', species: 'stag', level: 3, stage: 'hatchling' }, forms), 'Hatchling');
  assert.deepEqual(normalizeForms(null), {});
  assert.deepEqual(normalizeForms({ forms: 'x' }), {});
});

test('the picture follows the form when its file is listed, else the plain still, else the server still', () => {
  const forms = normalizeForms(FORMS);
  const c = { phase: 'creature', species: 'wolf', stage: 'juvenile', level: 4, traits: [], mood: 'awake', art: { still: null, loop: null } };
  const files = new Set(['wolf/form-2.webp', 'wolf/juvenile.webp']);
  assert.equal(pickArt(c, files, { forms }), 'creatures/wolf/form-2.webp');
  assert.equal(pickArt(c, new Set(['wolf/juvenile.webp']), { forms }), 'creatures/wolf/juvenile.webp');
  assert.equal(pickArt(c, new Set(), { forms }), null);
  assert.equal(pickArt({ ...c, species: 'stag' }, new Set(['stag/juvenile.webp']), { forms }), 'creatures/stag/juvenile.webp');
});

test('the art shipped is exactly what the manifest lists, all small, with the wolf forms table', () => {
  const m = JSON.parse(read('creatures/manifest.json'));
  const listed = normalizeManifest(m);
  assert.equal(listed.size, m.files.length, 'every name is safe');
  const onDisk = [];
  for (const d of readdirSync(new URL('../creatures/', import.meta.url))) {
    const full = new URL('../creatures/' + d, import.meta.url);
    if (statSync(full).isDirectory()) for (const f of readdirSync(full)) onDisk.push(d + '/' + f);
  }
  assert.deepEqual([...listed].sort(), onDisk.sort());
  for (const f of listed) assert.ok(statSync(new URL('../creatures/' + f, import.meta.url)).size < 200 * 1024, f + ' is under 200 KB');
  for (const sp of ['lava', 'stag', 'moss', 'bull', 'squirrel']) for (const st of ['hatchling', 'juvenile', 'adult', 'grown']) assert.ok(listed.has(`${sp}/${st}.webp`), `${sp}/${st}`);
  for (const egg of ['egg-0-whole', 'egg-1-wobble', 'egg-2-cracks', 'egg-3-wide', 'egg-4-burst']) assert.ok(listed.has(`egg/${egg}.webp`), egg);
  const forms = normalizeForms(m);
  assert.deepEqual(forms.wolf.map(f => [f.from, f.name]), [[1, 'Cog Pup'], [3, 'Spring Runner'], [5, 'Gear Hunter'], [7, 'Steel Alpha'], [8, 'Brass Veteran'], [9, 'Iron Warden'], [10, 'Clockwork Legend']]);
  for (const f of forms.wolf) assert.ok(listed.has(f.file) && existsSync(new URL('../creatures/' + f.file, import.meta.url)), f.file);
  assert.deepEqual([...new Set([...listed].map(f => f.split('/')[0]))].sort(), ['bull', 'egg', 'lava', 'moss', 'squirrel', 'stag', 'wolf'], 'the six approved species and the neutral egg, nothing else');
  assert.match(m.note, /awaiting approval/, 'the egg is marked as not yet approved');
});

test('the service worker keeps the creature pictures on the device and knows the new module', () => {
  const sw = read('sw.js');
  assert.match(sw, /'js\/cas-creature-emotes\.js'/);
  assert.match(sw, /url\.pathname\.includes\('\/creatures\/'\) && url\.pathname\.endsWith\('\.webp'\)/);
});
