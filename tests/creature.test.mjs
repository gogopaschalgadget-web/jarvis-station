import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as L from '../js/cas-creature-logic.js';
import * as L2 from '../js/cas-creature.js';

const REW = { xs: { xp: 20, step: 'common' }, s: { xp: 40, step: 'common' }, m: { xp: 60, step: 'common' }, l: { xp: 100, step: 'uncommon' }, xl: { xp: 160, step: 'rare', animated: true } };
const egg = o => ({ number: 1, phase: 'egg', xp_in: 120, xp_to_next: 120, next_label: 'the next crack', egg_step: 'cracks1', traits: [], mood: 'awake', next_reward: REW, art: { still: null, loop: null }, ...o });
const mon = o => ({ number: 1, phase: 'creature', xp_in: 480, xp_to_next: 170, next_label: 'Level 3', level: 2, stage: 'hatchling', species: 'lava', rarity: 'common', name: null, suggested_name: 'Ember', traits: [], mood: 'awake', welcome_back: false, cards_since_hatch: 3, next_reward: REW, art: { still: 'creatures/lava/hatchling.webp', loop: null }, ...o });
const read = (c, extra = {}) => L.normalizeCreatureRead({ creature: c, stable: [], epoch: 'x', professional_mode_hidden: false, ...extra });

test('the read is checked: anything off the lists or out of range is dropped, not drawn', () => {
  assert.equal(L.normalizeCreatureRead(null), null);
  assert.equal(L.normalizeCreatureRead({}), null);
  assert.equal(read(mon({ species: 'dragon' })), null, 'unknown species: no creature');
  assert.equal(read(mon({ rarity: '__proto__' })), null);
  assert.equal(read(mon({ xp_in: -1 })), null);
  assert.equal(read(mon({ level: 11 })), null);
  assert.equal(read(egg({ phase: 'blob' })), null);
  const c = read(mon({ mood: 'angry', name: '<b>x</b>'.repeat(10), art: { still: 'https://evil/x.webp' }, traits: [{ desk: 'marketing' }, { desk: 'nope' }, null] })).creature;
  assert.equal(c.mood, 'awake');
  assert.equal(c.art.still, null, 'only a creatures/ webp path is ever used as a picture');
  assert.deepEqual(c.traits, ['marketing']);
  assert.ok(c.name.length <= 24);
  assert.equal(L.safeArt('creatures/lava/hatchling.webp'), 'creatures/lava/hatchling.webp');
  for (const bad of ['../creatures/a.webp', '/creatures/a.webp', 'creatures/a.png', 'creatures/a b.webp', 'http://x/creatures/a.webp', 'creatures/' + 'a'.repeat(200) + '.webp', 5]) assert.equal(L.safeArt(bad), null, String(bad));
  assert.equal(read(egg({ egg_step: 'wide_cracks' })).creature.eggStep, 'wide_cracks', 'both names of the egg steps are accepted');
  assert.equal(read(egg({ egg_step: 'bogus' })).creature.eggStep, null);
});

test('words: name line, bar, status, tile and Den text for egg and creature', () => {
  const e = read(egg()).creature;
  assert.equal(L.nameLine(e), 'Egg, 120 of 300 XP');
  assert.equal(L.slotWords(e), 'Egg, with first cracks (art slot)');
  assert.equal(L.slotWords(read(egg({ egg_step: null })).creature), 'Egg, whole (art slot)');
  const c = read(mon()).creature;
  assert.equal(L.nameLine(c), 'Lava tortoise, Level 2, Hatchling');
  assert.equal(L.nameLine(read(mon({ name: 'Ember' })).creature), 'Ember, Lava tortoise, Level 2, Hatchling');
  assert.equal(L.barWords(c), '170 XP to Level 3');
  assert.equal(L.slotWords(c), 'Lava tortoise, hatchling (art slot)');
  assert.equal(L.barWords(read(mon({ xp_to_next: null, level: 10, stage: 'grown', xp_in: 5100 })).creature), 'Grown');
});

test('the bar fraction runs between the step just reached and the next, from xp_in and xp_to_next alone', () => {
  const f = o => L.barFraction(read(mon(o)).creature);
  assert.equal(f({ xp_in: 450, xp_to_next: 200 }), 0, 'just reached level 2');
  assert.ok(Math.abs(f({ xp_in: 550, xp_to_next: 100 }) - 0.5) < 1e-9, 'half way from 450 to 650');
  assert.equal(f({ xp_in: 5100, xp_to_next: null }), 1);
  assert.ok(Math.abs(L.barFraction(read(egg({ xp_in: 30, xp_to_next: 30, egg_step: null })).creature) - 0.5) < 1e-9, 'egg: 30 of the first 60');
  for (const o of [{ xp_in: 0, xp_to_next: 0 }, { xp_in: 700, xp_to_next: 1 }]) { const v = f(o); assert.ok(v >= 0 && v <= 1); }
});

test('status and motion: flags first, then mood; asleep wins over pace; nothing says guilt', () => {
  const c = m => read(mon({ mood: m })).creature;
  assert.equal(L.statusLine(c('awake'), 0), 'Awake');
  assert.equal(L.statusLine(c('awake'), 1), 'Needs you: 1 flag');
  assert.equal(L.statusLine(c('awake'), 3), 'Needs you: 3 flags');
  assert.equal(L.statusLine(c('sleeping'), 0), 'Sleeping');
  assert.equal(L.statusLine(c('curled'), 0), 'Curled up asleep');
  assert.equal(L.statusLine(c('drowsy'), 0), 'Drowsy');
  assert.equal(L.statusLine(read(mon({ welcome_back: true })).creature, 0), 'Welcome back.');
  assert.deepEqual(L.motionClasses(c('awake'), 2), ['mood-awake', 'pace']);
  assert.deepEqual(L.motionClasses(c('sleeping'), 2), ['mood-sleeping', 'asleep'], 'a sleeping creature does not pace');
  assert.deepEqual(L.motionClasses(c('drowsy'), 0), ['mood-drowsy']);
  const src = readFileSync(new URL('../js/cas-creature-logic.js', import.meta.url), 'utf8');
  assert.ok(!/died|dead|lost|miss(ed)? you|guilt|neglect/i.test(src), 'no death or guilt words');
});

test('trait chips name the desk, repeat desks read larger, empty ones say what unlocks them', () => {
  const chips = d => L.traitChips(read(mon({ traits: d.map(x => ({ desk: x })) })).creature).map(x => x.text);
  assert.deepEqual(chips([]), ['Juvenile unlocks a trait', 'Adult unlocks a trait', 'Grown unlocks a trait']);
  assert.deepEqual(chips(['marketing', 'money']), ['Antennae (Marketing)', 'Gold helm (Money)', 'Grown unlocks a trait']);
  assert.deepEqual(chips(['marketing', 'marketing']).slice(0, 2), ['Antennae (Marketing)', 'Wings (Marketing, larger)']);
});

test('the reward line: size by size, animated named, and nothing when the read has no number', () => {
  const c = read(mon()).creature;
  assert.equal(L.rewardLine(c, 'm'), '+60 XP, Common picture');
  assert.equal(L.rewardLine(c, 'l'), '+100 XP, Uncommon picture');
  assert.equal(L.rewardLine(c, 'xl'), '+160 XP, Rare picture, animated');
  assert.equal(L.rewardLine(c, null), '');
  assert.equal(L.rewardLine(c, 'huge'), '');
  assert.equal(L.rewardLine(read(mon({ next_reward: { m: { xp: 'x', step: 'common' } } })).creature, 'm'), '');
  assert.equal(L.rewardLine(null, 'm'), '');
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
  const docEl = { dataset: {} };
  globalThis.document = { createElement: wrap, documentElement: docEl };
  return docEl;
}
const all = (n, out = []) => { out.push(n); n.children.forEach(c => all(c, out)); return out; };
const texts = n => all(n).map(x => x.textContent).filter(Boolean);
const fresh = () => import('../js/cas-creature.js?t=' + Math.random());
const tick = (ms = 15) => new Promise(r => setTimeout(r, ms));

test('the view: tile and Den from a read, placeholder without art or on a 404, nothing in professional mode, no request without a token', async () => {
  const docEl = makeDom();
  const v = await fresh();
  const calls = [];
  const answer = body => async (url, init) => { calls.push({ url, auth: init && init.headers && init.headers.Authorization }); return { ok: true, status: 200, json: async () => body }; };
  v.initCreature({ apiBase: 'https://x', getToken: () => '', fetch: answer({ creature: mon() }) });
  assert.equal(await v.loadCreature(true), null);
  assert.equal(calls.length, 0, 'no token, no request');
  v.initCreature({ getToken: () => 'tok', fetch: answer({ creature: mon({ art: { still: null } }), stable: [{ number: 0, species: 'bull', rarity: 'rare', name: 'Rusty' }] }) });
  assert.ok(await v.loadCreature(true));
  assert.deepEqual(calls.map(c => [c.url, c.auth]), [['https://x/api/station/desk/creature', 'Bearer tok'], ['creatures/manifest.json', undefined]], 'the signed read, then the static manifest with no token');
  const tile = v.tileNode(2, () => {});
  const tt = texts(tile);
  assert.ok(tt.includes('Lava tortoise, Level 2, Hatchling') && tt.includes('170 XP to Level 3') && tt.includes('Needs you: 2 flags') && tt.includes('Lava tortoise, hatchling (art slot)'));
  assert.ok(!all(tile).some(n => n.tag === 'img'), 'no art file, so a placeholder and no image');
  const den = texts(v.denNode(0, () => {}));
  for (const want of ['The Den', 'Not named yet. Suggested name: Ember.', 'Juvenile unlocks a trait', 'Collar: empty', 'Reward on your next card', 'Rusty']) assert.ok(den.includes(want), want);
  assert.ok(den.join(' ').includes('Common picture') && !den.join(' ').includes('+60 XP'), 'the Den shows pictures only unless the effort rule is live');
  v.setRule('effort');
  assert.ok(texts(v.denNode(0, () => {})).join(' ').includes('+60 XP, Common picture'), 'XP shows under the effort rule');
  v.setRule(null);
  const nodes = all(v.denNode(0, () => {}));
  assert.equal(nodes.filter(n => n.listeners.click).length, 1, 'one button in the Den: the way back');
  // an image that fails to load becomes the placeholder
  v.initCreature({ fetch: answer({ creature: mon() }) });
  await v.loadCreature(true);
  const pic = v.pictureNode(v.creatureRead().creature);
  const img = all(pic).find(n => n.tag === 'img');
  assert.equal(img.src, 'creatures/lava/hatchling.webp');
  img.listeners.error[0]();
  assert.ok(texts(pic).includes('Lava tortoise, hatchling (art slot)') && !all(pic).some(n => n.tag === 'img'), 'never a broken image');
  // professional mode: no tile, no Den card, no request
  docEl.dataset.mode = 'professional';
  assert.equal(v.tileNode(0, () => {}), null);
  assert.equal(v.creatureCard(), null);
  const before = calls.length;
  assert.equal(await v.loadCreature(true), null);
  assert.equal(calls.length, before, 'nothing is requested in professional mode');
  docEl.dataset.mode = 'game';
  assert.ok(v.tileNode(0, () => {}));
});

test('failures and sign-out: a bad or failed answer shows nothing and is not retried at once; an answer from before a sign-out is dropped', async () => {
  makeDom();
  const v = await fresh();
  let n = 0;
  v.initCreature({ apiBase: '', getToken: () => 't', fetch: async () => { n++; return { ok: false, status: 500 }; } });
  assert.equal(await v.loadCreature(true), null);
  assert.equal(await v.loadCreature(false), null);
  assert.equal(n, 1, 'a failed read is not asked again straight away');
  assert.equal(v.tileNode(0, () => {}), null);
  v.initCreature({ fetch: async () => ({ ok: true, status: 200, json: async () => ({ creature: { phase: 'creature', xp_in: 1 } }) }) });
  assert.equal(await v.loadCreature(true), null, 'a read that does not check out is dropped');
  let release;
  const gate = new Promise(r => { release = r; });
  v.forgetCreature();
  v.initCreature({ fetch: async () => { await gate; return { ok: true, status: 200, json: async () => ({ creature: mon() }) }; } });
  const p = v.loadCreature(true);
  v.forgetCreature();
  release();
  assert.equal(await p, null);
  assert.equal(v.creatureRead(), null, 'the old account\'s creature does not come back');
  await tick();
});

test('wiring: the tile sits under the rank plate on the Bulletin Board behind a try, the Den is inside the panel, sign-out forgets, the precache lists both modules, text nodes only', () => {
  const desk = readFileSync(new URL('../js/cas-desk.js', import.meta.url), 'utf8');
  assert.match(desk, /if \(prog\) wrap\.append\(progressBlock\(prog\)\);[\s\S]{0,400}tileNode\(need/);
  assert.match(desk, /try \{ const tile = tileNode\(need[\s\S]*catch/);
  assert.match(desk, /denNode\(need/);
  assert.match(desk, /pictureLine\(promise\)/);
  assert.ok(!/rewardLine\(creatureCard/.test(desk), 'the card line comes from the server promise, not the creature table');
  assert.match(desk, /setRule\(ruleOf\(_data\)\)/);
  const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
  assert.match(app, /forgetCreature\(\)/);
  const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  assert.ok(sw.includes("'js/cas-creature.js'") && sw.includes("'js/cas-creature-logic.js'"));
  const mod = readFileSync(new URL('../js/cas-creature.js', import.meta.url), 'utf8') + readFileSync(new URL('../js/cas-creature-logic.js', import.meta.url), 'utf8');
  assert.ok(!/innerHTML|insertAdjacentHTML|outerHTML|document\.write/.test(mod));
  const css = readFileSync(new URL('../css/cas-desk.css', import.meta.url), 'utf8');
  assert.match(css, /prefers-reduced-motion: reduce\) \{ \.cr-tile/);
  assert.match(css, /html\[data-mode="professional"\] \.cr-tile/);
});

test('art comes from the manifest: the still, the trait variant, the sleeping pose, the loop only with motion allowed; nothing listed means a placeholder', () => {
  const files = L.normalizeManifest({ files: ['egg/egg-0-whole.webp', 'egg/egg-2-cracks.webp', 'lava/hatchling.webp', 'lava/hatchling-loop.webp', 'lava/hatchling-sleep.webp', 'lava/adult.webp', 'lava/adult--money.webp', '../evil.webp', 'a b.webp', 'x.png', 5, 'lava/hatchling.webp.exe'] });
  assert.deepEqual([...files].sort(), ['egg/egg-0-whole.webp', 'egg/egg-2-cracks.webp', 'lava/adult--money.webp', 'lava/adult.webp', 'lava/hatchling-loop.webp', 'lava/hatchling-sleep.webp', 'lava/hatchling.webp']);
  const c = o => read(mon({ art: null, ...o })).creature;
  assert.equal(L.pickArt(c({}), files, { reducedMotion: false }), 'creatures/lava/hatchling-loop.webp');
  assert.equal(L.pickArt(c({}), files, { reducedMotion: true }), 'creatures/lava/hatchling.webp', 'reduce-motion: the still');
  assert.equal(L.pickArt(c({ mood: 'sleeping' }), files), 'creatures/lava/hatchling-sleep.webp');
  assert.equal(L.pickArt(c({ mood: 'curled' }), files), 'creatures/lava/hatchling-sleep.webp');
  assert.equal(L.pickArt(c({ stage: 'adult', level: 8, traits: [{ desk: 'marketing' }, { desk: 'money' }] }), files, { reducedMotion: true }), 'creatures/lava/adult--money.webp', 'the latest trait desk');
  assert.equal(L.pickArt(c({ stage: 'adult', level: 8, traits: [{ desk: 'sales' }] }), files, { reducedMotion: true }), 'creatures/lava/adult.webp', 'no variant file: the plain still');
  assert.equal(L.pickArt(c({ species: 'wolf' }), files), null, 'not listed: placeholder');
  assert.equal(L.pickArt(c({}), new Set()), null);
  assert.equal(L.pickArt(read(egg({ egg_step: null, art: null })).creature, files), 'creatures/egg/egg-0-whole.webp');
  assert.equal(L.pickArt(read(egg({ egg_step: 'cracks1', art: null })).creature, files), 'creatures/egg/egg-2-cracks.webp');
  assert.equal(L.pickArt(read(egg({ egg_step: 'wobble', art: null })).creature, files), null, 'that egg picture is not listed yet');
  assert.equal(L.normalizeManifest(null).size, 0);
  assert.equal(L.normalizeManifest({ files: 'x' }).size, 0);
});

test('a hung request times out, frees the next call, and does not write late; the manifest hang is bounded too', async () => {
  makeDom();
  const v = await fresh();
  let calls = 0;
  let late;
  const never = new Promise(r => { late = r; });
  v.initCreature({ apiBase: '', getToken: () => 't', timeoutMs: 40, fetch: async (url, init) => { calls++; if (calls === 1) { await never; return { ok: true, status: 200, json: async () => ({ creature: mon() }) }; } return { ok: true, status: 200, json: async () => ({ creature: mon() }) }; } });
  const t0 = Date.now();
  assert.equal(await v.loadCreature(true), null, 'a hung read resolves to nothing');
  assert.ok(Date.now() - t0 < 500, 'and does so at the limit, not never');
  late();
  await tick(30);
  assert.equal(v.creatureRead(), null, 'the late answer wrote nothing');
  v.forgetCreature();
  v.initCreature({ fetch: async url => { if (url === 'creatures/manifest.json') { await new Promise(() => {}); } return { ok: true, status: 200, json: async () => ({ creature: mon() }) }; } });
  assert.ok(await v.loadCreature(true), 'a hung manifest is cut off and the creature still shows (placeholders)');
  let signalSeen = null;
  v.forgetCreature();
  v.initCreature({ fetch: async (url, init) => { signalSeen = init && init.signal; return { ok: true, status: 200, json: async () => ({ creature: mon() }) }; } });
  await v.loadCreature(true);
  assert.ok(signalSeen && typeof signalSeen.aborted === 'boolean', 'requests carry an abort signal');
});

test('a 404 (route not on the server yet) backs off ten minutes, a 500 sixty seconds; forgetting or a new service worker resets it', async () => {
  makeDom();
  const v = await fresh();
  let n = 0, status = 404;
  v.initCreature({ apiBase: '', getToken: () => 't', fetch: async () => { n++; return { ok: false, status }; } });
  assert.equal(await v.loadCreature(true), null);
  assert.equal(await v.loadCreature(true), null, 'even a forced read does not hammer a missing route');
  assert.equal(await v.loadCreature(false), null);
  assert.equal(n, 1);
  const realNow = Date.now;
  try {
    Date.now = () => realNow() + 9 * 60000;
    await v.loadCreature(true); assert.equal(n, 1, 'still quiet after 9 minutes');
    Date.now = () => realNow() + 11 * 60000;
    await v.loadCreature(true); assert.equal(n, 2, 'asks again after ten minutes');
  } finally { Date.now = realNow; }
  v.forgetCreature();
  status = 500;
  const before = n;
  await v.loadCreature(true); assert.equal(n, before + 1);
  await v.loadCreature(false); assert.equal(n, before + 1, 'a 500 is retried after the shorter wait, not at once');
  const src = readFileSync(new URL('../js/cas-creature.js', import.meta.url), 'utf8');
  assert.match(src, /NOT_FOUND_MS = 600000/);
  assert.match(src, /controllerchange/);
});

test('a server that has not started the creature (epoch null) shows "not started yet", never a stuck 0 of 300', async () => {
  const off = L.normalizeCreatureRead({ creature: egg({ xp_in: 0, xp_to_next: 60 }), stable: [], epoch: null });
  assert.equal(off.creature.notStarted, true);
  assert.equal(L.nameLine(off.creature), 'Egg, not started yet');
  assert.equal(L.barWords(off.creature), 'Not started yet');
  assert.ok(!/of 300/.test(L.nameLine(off.creature) + L.barWords(off.creature)));
  const on = L.normalizeCreatureRead({ creature: egg({ xp_in: 0, xp_to_next: 60 }), stable: [], epoch: 1764000000 });
  assert.equal(on.creature.notStarted, false);
  assert.equal(L.nameLine(on.creature), 'Egg, 0 of 300 XP', 'a started creature at zero still shows its count');
  assert.equal(read(egg()).creature.notStarted, false, 'no epoch key at all: treated as started');
  const docEl = makeDom();
  const v = await fresh();
  const answer = body => async () => ({ ok: true, status: 200, json: async () => body });
  v.initCreature({ apiBase: 'https://x', getToken: () => 't', fetch: answer({ creature: egg({ xp_in: 0, xp_to_next: 60 }), stable: [], epoch: null }) });
  await v.loadCreature(true);
  const tile = all(v.tileNode(0, () => {}));
  assert.ok(texts(tile[0]).includes('Egg, not started yet') && !texts(tile[0]).includes('Not started yet'), 'said once, not twice');
  assert.ok(!tile.some(n => (n.className || '').split(' ').includes('cr-bar')), 'no bar to sit at zero');
  assert.ok(!texts(tile[0]).some(t => /of 300/.test(t)));
  const den = all(v.denNode(0, () => {}));
  assert.ok(!den.some(n => (n.className || '').split(' ').includes('cr-bar')));
  assert.ok(!texts(den[0]).some(t => /of 300/.test(t)));
  assert.equal(docEl.dataset.mode, undefined);
});

test('the loops pause while the page is hidden, stop under reduced motion, and the manifest is in the offline list', () => {
  const classes = new Set();
  const doc = { hidden: false, listeners: {}, addEventListener(t, f) { this.listeners[t] = f; }, documentElement: { classList: { toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)) } } };
  const set = L2.pauseWhenHidden(doc);
  assert.equal(classes.has('cr-paused'), false);
  doc.hidden = true; doc.listeners.visibilitychange();
  assert.equal(classes.has('cr-paused'), true);
  doc.hidden = false; doc.listeners.visibilitychange();
  assert.equal(classes.has('cr-paused'), false);
  assert.doesNotThrow(() => L2.pauseWhenHidden({}));
  const css = readFileSync(new URL('../css/cas-desk.css', import.meta.url), 'utf8');
  assert.match(css, /html\.cr-paused \.cr-tile \*[^{]*\{ animation-play-state: paused/);
  assert.match(css, /prefers-reduced-motion: reduce\) \{ \.cr-tile/);
  const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  assert.ok(sw.includes("'creatures/manifest.json'"));
  assert.match(css, /\.cr-body \{[^}]*padding-bottom: 22px/, 'room under the status line for "Tap to open the Den"');
});

test('each species can have its own egg: chosen by species, step by step, the neutral egg when the species egg file is missing', () => {
  const both = new Set(['egg/egg-0-whole.webp', 'egg/egg-2-cracks.webp', 'egg/egg-4-burst.webp', 'egg-stag/egg-0-whole.webp', 'egg-stag/egg-4-burst.webp']);
  const e = o => read(egg({ art: null, ...o })).creature;
  assert.equal(e({ species: 'stag', egg_step: null }).species, 'stag', 'an egg may carry its species');
  assert.equal(e({}).species, null, 'an egg with no species still works');
  assert.equal(L.pickArt(e({ species: 'stag', egg_step: null }), both), 'creatures/egg-stag/egg-0-whole.webp', 'the species egg');
  assert.equal(L.pickArt(e({ species: 'stag', egg_step: 'cracks1' }), both), 'creatures/egg/egg-2-cracks.webp', 'that step is missing for the species: the neutral egg');
  assert.equal(L.pickArt(e({ species: 'wolf', egg_step: null }), both), 'creatures/egg/egg-0-whole.webp', 'no wolf egg listed: neutral');
  assert.equal(L.pickArt(e({ egg_step: null }), both), 'creatures/egg/egg-0-whole.webp', 'species unknown: neutral');
  assert.equal(L.pickArt(e({ species: 'stag' }), new Set()), null, 'nothing listed: placeholder');
  assert.equal(L.pickArt(e({ species: 'dragon', egg_step: null }), both), 'creatures/egg/egg-0-whole.webp', 'an unknown species is ignored');
  assert.equal(L.burstEggFile({ species: 'stag' }, f => both.has(f)), 'egg-stag/egg-4-burst.webp');
  assert.equal(L.burstEggFile({ species: 'wolf' }, f => both.has(f)), 'egg/egg-4-burst.webp');
  assert.equal(L.burstEggFile({ species: null }, f => both.has(f)), 'egg/egg-4-burst.webp');
  assert.equal(L.burstEggFile({ species: 'stag' }, () => false), null);
  assert.ok(L.normalizeManifest({ files: ['egg-stag/egg-0-whole.webp'] }).has('egg-stag/egg-0-whole.webp'), 'the manifest accepts the species egg folders');
});

// ---- the egg picture follows the species in the server's read (server: the species is fixed when the creature starts)
const SERVER_SPECIES = ['lava', 'stag', 'moss', 'wolf', 'bull', 'squirrel'];
const STEP_FILES = { null: 'egg-0-whole', wobble: 'egg-1-wobble', cracks1: 'egg-2-cracks', cracks2: 'egg-3-wide', hatch: 'egg-3-wide' };
const allEggs = () => new Set(['egg', ...SERVER_SPECIES.map(sp => 'egg-' + sp)].flatMap(d => ['egg-0-whole', 'egg-1-wobble', 'egg-2-cracks', 'egg-3-wide', 'egg-4-burst'].map(n => `${d}/${n}.webp`)));

test('the species keys are the server keys, the same six', () => {
  assert.deepEqual(Object.keys(L.SPECIES).sort(), [...SERVER_SPECIES].sort());
});

test('every species egg: the server read of an egg names the species and each step shows creatures/egg-<species>/ when that file exists', () => {
  const files = allEggs();
  for (const sp of SERVER_SPECIES) {
    for (const [step, name] of Object.entries(STEP_FILES)) {
      const c = read(egg({ species: sp, species_name: 'x', egg_step: step === 'null' ? null : step, art: null })).creature;
      assert.equal(c.species, sp);
      assert.equal(L.pickArt(c, files), `creatures/egg-${sp}/${name}.webp`, `${sp} ${step}`);
    }
    assert.equal(L.burstEggFile({ species: sp }, f => files.has(f)), `egg-${sp}/egg-4-burst.webp`);
  }
});

test('the neutral egg stays the fallback: a read with no species, a species with no egg folder yet, or one missing step', () => {
  const neutralOnly = allEggs();
  for (const f of [...neutralOnly]) if (f.startsWith('egg-')) neutralOnly.delete(f);
  for (const sp of SERVER_SPECIES) assert.equal(L.pickArt(read(egg({ species: sp, egg_step: null, art: null })).creature, neutralOnly), 'creatures/egg/egg-0-whole.webp', sp + ' has no egg folder yet');
  assert.equal(L.pickArt(read(egg({ egg_step: null, art: null })).creature, allEggs()), 'creatures/egg/egg-0-whole.webp', 'no species in the read (today live server)');
  assert.equal(L.pickArt(read(egg({ species: null, egg_step: 'wobble', art: null })).creature, allEggs()), 'creatures/egg/egg-1-wobble.webp');
  const partial = allEggs(); partial.delete('egg-lava/egg-2-cracks.webp');
  assert.equal(L.pickArt(read(egg({ species: 'lava', egg_step: 'cracks1', art: null })).creature, partial), 'creatures/egg/egg-2-cracks.webp', 'only the missing step falls back');
  assert.equal(L.pickArt(read(egg({ species: 'lava', egg_step: 'wobble', art: null })).creature, partial), 'creatures/egg-lava/egg-1-wobble.webp', 'the other steps keep the species egg');
  assert.equal(L.burstEggFile({ species: 'lava' }, f => neutralOnly.has(f)), 'egg/egg-4-burst.webp');
});

test('a species that is not one of the six, or is a path trick, never builds a path', () => {
  for (const bad of ['dragon', '../egg', 'lava/../..', '__proto__', 'constructor', 'Lava', '', 5, {}, []]) {
    const c = read(egg({ species: bad, egg_step: null, art: null })).creature;
    assert.equal(c.species, null, String(bad));
    assert.equal(L.pickArt(c, allEggs()), 'creatures/egg/egg-0-whole.webp');
  }
});

test('the egg that hatches keeps the species it showed: the same species egg, then the same species creature', () => {
  const sp = 'moss';
  const eggRead = read(egg({ species: sp, egg_step: 'hatch', art: null })).creature;
  assert.equal(L.pickArt(eggRead, allEggs()), 'creatures/egg-moss/egg-3-wide.webp');
  const born = read(mon({ species: sp, stage: 'hatchling', level: 1 })).creature;
  assert.equal(born.species, eggRead.species);
});
