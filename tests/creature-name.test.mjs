import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkName, nameProblem, makeNameStore, nameCard, namePrompt, needsNamePrompt, NAME_PROMPT, NAME_MAX, VISIT_NOTE } from '../js/cas-creature-name.js';

const memStorage = () => { const m = {}; return { m, getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; } }; };

test('a typed name is cleaned and checked: empty, spaces only, hidden characters, too long, emoji, markup', () => {
  assert.deepEqual(checkName('  Ember  '), { ok: true, name: 'Ember' });
  assert.deepEqual(checkName('Big   Ember'), { ok: true, name: 'Big Ember' });
  for (const bad of ['', '   ', '\n\t', '​‮', null, undefined, 5, {}]) assert.deepEqual(checkName(bad), { ok: false, reason: 'empty' }, String(bad));
  assert.equal(checkName('x'.repeat(NAME_MAX)).ok, true);
  assert.deepEqual(checkName('x'.repeat(NAME_MAX + 1)), { ok: false, reason: 'long' });
  assert.equal(checkName('\u{1F525}'.repeat(NAME_MAX)).ok, true, 'an emoji counts as one character, not two');
  assert.equal(checkName('\u{1F525}'.repeat(NAME_MAX + 1)).ok, false);
  assert.equal(checkName('\u{1F468}‍\u{1F469}‍\u{1F467}').ok, true, 'the joiner inside an emoji is kept');
  assert.equal(checkName('a‮b').name, 'a b', 'direction overrides never survive');
  assert.equal(checkName('<img onerror=x()>').ok, true, 'markup is only text: it is drawn with textContent');
  assert.equal(nameProblem('empty'), 'Type a name first.');
  assert.match(nameProblem('long'), /24 characters/);
});

test('the name book: kept per creature on the device, once; a rename must say so; a cleared device is unnamed', () => {
  const st = memStorage();
  const book = makeNameStore(() => st);
  assert.equal(book.get(1), null);
  assert.deepEqual(book.set(1, 'Ember'), { ok: true, name: 'Ember', kept: 'device' });
  assert.equal(book.get(1), 'Ember');
  assert.equal(book.get(2), null, 'another creature is not named');
  assert.deepEqual(book.set(1, 'Other'), { ok: false, reason: 'already' }, 'not changed by accident');
  assert.equal(book.get(1), 'Ember');
  assert.equal(book.set(1, 'Cinder', { replace: true }).name, 'Cinder');
  assert.equal(book.get(1), 'Cinder');
  assert.equal(book.set(3, '').reason, 'empty');
  assert.equal(book.set(-1, 'x').ok, false);
  assert.equal(book.set(1.5, 'x').ok, false);
  for (const k of Object.keys(st.m)) delete st.m[k];
  assert.equal(book.get(1), null, 'device cleared: unnamed, no error');
  st.m['cas-creature-name-7'] = '<b>x</b>'.repeat(20);
  assert.equal(book.get(7), null, 'a stored value that is not a valid name is ignored');
  st.m['cas-creature-name-8'] = 'Rex';
  assert.equal(book.get(8), 'Rex');
});

test('storage unavailable (private browsing): no error, the name lasts for the visit and says so', () => {
  const noAccess = makeNameStore(() => { throw new Error('SecurityError'); });
  assert.equal(noAccess.get(1), null);
  assert.deepEqual(noAccess.set(1, 'Ember'), { ok: true, name: 'Ember', kept: 'visit' });
  assert.equal(noAccess.get(1), 'Ember');
  assert.equal(noAccess.set(1, 'Again').reason, 'already');
  const full = makeNameStore(() => ({ getItem: () => null, setItem() { throw new Error('QuotaExceededError'); } }));
  assert.equal(full.set(2, 'Cinder').kept, 'visit');
  assert.equal(full.get(2), 'Cinder');
  const forgets = makeNameStore(() => ({ getItem: () => null, setItem() {} }));
  assert.equal(forgets.set(3, 'Rex').kept, 'visit', 'a write that does not read back is not trusted');
  const none = makeNameStore(() => null);
  assert.equal(none.set(4, 'Moss').kept, 'visit');
});

function fakeDoc() {
  const mk = tag => ({ tag, className: '', textContent: '', attrs: {}, children: [], listeners: {}, value: '', type: '', id: '', removed: false,
    append(...cs) { cs.forEach(c => this.children.push(c)); }, setAttribute(k, v) { this.attrs[k] = v; },
    addEventListener(t, f) { (this.listeners[t] ||= []).push(f); }, remove() { this.removed = true; } });
  return { createElement: mk };
}
const all = (n, out = []) => { out.push(n); n.children.forEach(c => all(c, out)); return out; };
const byClass = (n, c) => all(n).find(x => x.className.split(' ').includes(c));
const fire = (n, t, ev = { preventDefault() {} }) => (n.listeners[t] || []).forEach(f => f(ev));

test('the card: one tap takes the suggestion; typing replaces it; empty and long are refused with words', () => {
  const st = memStorage();
  const store = makeNameStore(() => st);
  const saved = [];
  const card = nameCard(fakeDoc(), { number: 1, current: null, suggested: 'Ember', store, onSaved: r => saved.push(r) });
  const texts = all(card).map(n => n.textContent);
  assert.ok(texts.includes('Use Ember') && texts.includes('Name it') && texts.includes('Not named yet. The name stays on this phone.'));
  const say = byClass(card, 'cr-name-say'), input = byClass(card, 'cr-name-input'), form = byClass(card, 'cr-name-form');
  input.value = '   '; fire(form, 'submit');
  assert.equal(say.textContent, 'Type a name first.'); assert.equal(saved.length, 0);
  input.value = 'y'.repeat(30); fire(form, 'submit');
  assert.match(say.textContent, /24 characters/); assert.equal(saved.length, 0);
  assert.equal(store.get(1), null, 'nothing was kept by the refusals');
  input.value = '<b>Rex</b>'; fire(form, 'submit');
  assert.equal(store.get(1), '<b>Rex</b>', 'kept as plain text');
  assert.equal(saved.length, 1);
  const again = nameCard(fakeDoc(), { number: 2, current: null, suggested: 'Ember', store, onSaved: r => saved.push(r) });
  fire(byClass(again, 'cr-name-use'), 'click');
  assert.equal(store.get(2), 'Ember');
  assert.equal(saved[1].kept, 'device');
});

test('the card: no suggestion means no suggestion button; the field is set up for a phone', () => {
  const store = makeNameStore(() => memStorage());
  const card = nameCard(fakeDoc(), { number: 1, current: null, suggested: null, store });
  assert.equal(byClass(card, 'cr-name-use'), undefined);
  const input = byClass(card, 'cr-name-input');
  assert.equal(input.attrs.autocomplete, 'off'); assert.equal(input.attrs.enterkeyhint, 'done');
  assert.ok(input.attrs.maxlength);
  assert.equal(byClass(card, 'cr-name-go').type, 'submit');
});

test('the card: a named creature shows only Rename; renaming needs the second, explicit confirm; Keep leaves the name', () => {
  const st = memStorage();
  const store = makeNameStore(() => st);
  store.set(1, 'Ember');
  const saved = [];
  const card = nameCard(fakeDoc(), { number: 1, current: 'Ember', suggested: 'Ember', store, onSaved: r => saved.push(r) });
  assert.equal(byClass(card, 'cr-name-use'), undefined, 'no suggestion button once named');
  assert.equal(byClass(card, 'cr-name-input'), undefined, 'no field until Rename is tapped');
  fire(byClass(card, 'cr-name-rename'), 'click');
  const texts = all(card).map(n => n.textContent);
  assert.ok(texts.includes('Yes, rename it') && texts.includes('Keep Ember'));
  fire(byClass(card, 'cr-name-cancel'), 'click');
  assert.equal(store.get(1), 'Ember'); assert.equal(saved[0].unchanged, true);
  byClass(card, 'cr-name-input').value = 'Cinder'; fire(byClass(card, 'cr-name-form'), 'submit');
  assert.equal(store.get(1), 'Cinder');
  const visit = nameCard(fakeDoc(), { number: 5, current: null, store: makeNameStore(() => null), onSaved: r => saved.push(r) });
  byClass(visit, 'cr-name-input').value = 'Rex'; fire(byClass(visit, 'cr-name-form'), 'submit');
  assert.equal(byClass(visit, 'cr-name-say').textContent, VISIT_NOTE);
});

test('the name never leaves the device and is never drawn as markup', () => {
  const mod = readFileSync(new URL('../js/cas-creature-name.js', import.meta.url), 'utf8');
  assert.ok(!/fetch|XMLHttpRequest|sendBeacon|WebSocket|innerHTML|insertAdjacentHTML|outerHTML|document\.write/.test(mod));
  const cr = readFileSync(new URL('../js/cas-creature.js', import.meta.url), 'utf8');
  assert.ok(!/innerHTML|insertAdjacentHTML|outerHTML/.test(cr));
  assert.ok(!/method:\s*'(POST|PUT|PATCH)'/.test(cr), 'the creature module only reads');
  const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  assert.ok(sw.includes("'js/cas-creature-name.js'"));
  const css = readFileSync(new URL('../css/cas-desk.css', import.meta.url), 'utf8');
  assert.match(css, /\.cr-name-input \{[^}]*font: 16px/, 'a 16 px field so iPhone does not zoom in');
});

test('the view: a name from this device wins (tile, Den, shelf); no storage means unnamed with a hint; naming in the Den updates it', async () => {
  const mk = tag => { const n = { tag, className: '', textContent: '', attrs: {}, children: [], listeners: {}, style: {}, type: '', src: '', alt: '', dataset: {}, value: '',
    classList: { add(c) { n.className += ' ' + c; } }, append(...cs) { cs.forEach(c => n.children.push(c)); }, replaceChildren(...cs) { n.children = cs; }, setAttribute(k, v) { n.attrs[k] = v; }, addEventListener(t, f) { (n.listeners[t] ||= []).push(f); },
    replaceWith(x) { n.replacedBy = x; } }; return n; };
  globalThis.document = { createElement: mk, documentElement: { dataset: {} } };
  const st = memStorage();
  globalThis.localStorage = st;
  st.m['cas-creature-name-1'] = 'Cinder'; st.m['cas-creature-name-3'] = 'Old Rusty';
  const body = () => ({ creature: { number: 1, phase: 'creature', xp_in: 480, xp_to_next: 170, next_label: 'Level 3', level: 2, stage: 'hatchling', species: 'lava', rarity: 'common', name: null, suggested_name: 'Ember', traits: [], mood: 'awake', next_reward: {}, art: { still: null } }, stable: [{ number: 3, species: 'bull', rarity: 'rare', name: null }] });
  const v = await import('../js/cas-creature.js?t=' + Math.random());
  v.initCreature({ apiBase: 'https://x', getToken: () => 't', fetch: async () => ({ ok: true, status: 200, json: async () => body() }) });
  await v.loadCreature(true);
  assert.equal(v.creatureRead().creature.name, 'Cinder');
  assert.equal(v.creatureRead().stable[0].name, 'Old Rusty');
  const tt = all(v.tileNode(0, () => {})).map(n => n.textContent);
  assert.ok(tt.includes('Cinder, Lava tortoise, Level 2, Hatchling'));
  assert.ok(!tt.includes('Tap to give it a name'));
  delete globalThis.localStorage;
  const w = await import('../js/cas-creature.js?t=' + Math.random());
  w.initCreature({ apiBase: 'https://x', getToken: () => 't', fetch: async () => ({ ok: true, status: 200, json: async () => body() }) });
  await w.loadCreature(true);
  assert.equal(w.creatureRead().creature.name, null, 'no storage at all: unnamed, no error');
  assert.ok(all(w.tileNode(0, () => {})).map(n => n.textContent).includes('Tap to give it a name'));
  const den = w.denNode(0, () => {});
  assert.ok(all(den).some(n => n.className === 'cr-name-card'));
  all(den).find(n => n.className === 'cr-name-input').value = 'Rex';
  all(den).find(n => n.className === 'cr-name-form').listeners.submit[0]({ preventDefault() {} });
  assert.equal(w.creatureRead().creature.name, 'Rex', 'named for this visit');
  assert.equal(all(den).find(n => n.tag === 'h4').textContent, 'Rex');
});

// ---- the prompt at the top of the Den: the naming card sits under the 700 px picture, so a short prompt shows without scrolling
test('the prompt shows for a hatched creature with no name, and for nothing else', () => {
  assert.equal(needsNamePrompt({ phase: 'creature', name: null }), true);
  assert.equal(needsNamePrompt({ phase: 'creature', name: '' }), true);
  assert.equal(needsNamePrompt({ phase: 'creature', name: '   ' }), true);
  assert.equal(needsNamePrompt({ phase: 'creature' }), true);
  assert.equal(needsNamePrompt({ phase: 'creature', name: 'Ember' }), false);
  assert.equal(needsNamePrompt({ phase: 'egg', name: null }), false, 'an egg cannot be named yet');
  assert.equal(needsNamePrompt(null), false);
  assert.equal(needsNamePrompt(undefined), false);
});

test('the prompt is one button with the words Name your creature; a tap calls the handler; the text is plain', () => {
  const taps = [];
  const b = namePrompt(fakeDoc(), () => taps.push(1));
  assert.equal(b.tag, 'button');
  assert.equal(b.type, 'button');
  assert.equal(b.textContent, 'Name your creature');
  assert.equal(NAME_PROMPT, 'Name your creature');
  assert.match(b.attrs['aria-label'], /Name your creature/);
  fire(b, 'click');
  assert.deepEqual(taps, [1]);
  assert.doesNotThrow(() => fire(namePrompt(fakeDoc()), 'click'), 'no handler: a tap does nothing and does not throw');
});

test('the Den wiring: the prompt sits right under the Desk bar, above the picture; a tap goes to the name box; it goes once a name is saved', () => {
  const src = readFileSync(new URL('../js/cas-creature.js', import.meta.url), 'utf8');
  const den = src.slice(src.indexOf('export function denNode'));
  const iPrompt = den.indexOf('namePrompt(document');
  assert.ok(iPrompt > den.indexOf("den.append(top)") && iPrompt < den.indexOf("el('div', ['cr-big'"), 'the prompt is before the big picture');
  assert.match(den, /needsNamePrompt\(c\)/);
  assert.match(den, /card\.querySelector\('input'\)/, 'a tap lands on the name box');
  assert.match(den, /box\.focus\(\{ preventScroll: true \}\)/);
  assert.match(den, /if \(prompt && r\.ok && r\.name\) \{ if \(prompt\.remove\) prompt\.remove\(\); prompt = null; \}/, 'the prompt goes once a name is kept');
  const css = readFileSync(new URL('../css/cas-desk.css', import.meta.url), 'utf8');
  assert.match(css, /\.cr-nameprompt \{[^}]*min-height: 48px/, 'a big enough target');
  const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  assert.match(sw, /'js\/cas-creature-name\.js'/);
});
