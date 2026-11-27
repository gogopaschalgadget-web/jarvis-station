// cas-creature.js - the creature tile on the Bulletin Board and the Den view. Reads GET /api/creature (a read with no side effects); server text goes in with textContent only.
import { normalizeCreatureRead, normalizeManifest, normalizeForms, stageWord, pickArt, nameLine, barFraction, barWords, statusLine, motionClasses, traitChips, rewardLine, altWords, slotWords, SPECIES, STAGES, RARITIES, GEAR, SIZES } from './cas-creature-logic.js?v=cas115';
import { nextEmote, emoteClass, cheerWords, EMOTE_MS, HATCH_MS } from './cas-creature-emotes.js?v=cas115';

const TTL_MS = 30000;
const FAIL_MS = 60000;
const NOT_FOUND_MS = 600000;
const TIMEOUT_MS = 15000;
let _notFoundAt = 0;
let _o = { apiBase: '', getToken: () => '', fetch: (...a) => fetch(...a) };
let _read = null;
let _loadedAt = 0;
let _failedAt = 0;
let _inflight = null;
let _epoch = 0;
let _lastLevel = null;
let _cheerUntil = 0;
let _emote = null;
let _lastEmote = '';
let _hatchUntil = 0;
let _overlay = null;
let _overlayTimer = 0;
let _forms = {};
let _rule = null;
/** The XP rule that is live (from the Desk read), so the Den never shows the effort table's numbers under another rule. */
export function setRule(rule) { _rule = rule === 'old' || rule === 'flat' || rule === 'effort' ? rule : null; }
let _glowUntil = 0;
let _files = new Set();
let _manifestAt = 0;
const MANIFEST_MS = 300000;

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

export function initCreature(options) { _o = { ..._o, ...options }; }
// A new service worker taking control means a new build, which may have the route: ask again.
try { if (typeof navigator !== 'undefined' && navigator.serviceWorker && navigator.serviceWorker.addEventListener) navigator.serviceWorker.addEventListener('controllerchange', () => { _notFoundAt = 0; _failedAt = 0; }); } catch { /* no service worker here */ }

/** Run a request with an abort signal and a time limit; a request that hangs rejects after the limit instead of holding everything up. */
function timed(run) {
  const ctl = typeof AbortController === 'function' ? new AbortController() : { signal: undefined, abort() {} };
  let timer;
  const clock = new Promise((_, reject) => { timer = setTimeout(() => { try { ctl.abort(); } catch { /* already done */ } reject(new Error('timeout')); }, _o.timeoutMs || TIMEOUT_MS); });
  return Promise.race([run(ctl.signal), clock]).finally(() => clearTimeout(timer));
}
export const professional = () => { try { return document.documentElement.dataset.mode === 'professional'; } catch { return false; } };
export const creatureShown = () => !!_read && !_read.hidden && !professional();
/** The Station's own list of art files (creatures/manifest.json, a static file, no sign-in). A missing or bad file means no art yet: placeholders. */
async function loadManifest() {
  if (Date.now() - _manifestAt < MANIFEST_MS) return;
  _manifestAt = Date.now();
  try {
    const got = await timed(async signal => {
      const res = await _o.fetch('creatures/manifest.json', { cache: 'no-cache', signal });
      if (!res.ok) return { files: new Set(), forms: {} };
      const body = await res.json();
      return { files: normalizeManifest(body), forms: normalizeForms(body) };
    });
    _files = got.files; _forms = got.forms;
  } catch { _files = new Set(); _forms = {}; }
}
const reduced = () => { try { return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };

export function creatureRead() { return _read; }
export function creatureCard() { return creatureShown() ? _read.creature : null; }
export function forgetCreature() { _epoch++; _read = null; _loadedAt = 0; _failedAt = 0; _inflight = null; _lastLevel = null; _cheerUntil = 0; _emote = null; _lastEmote = ''; _hatchUntil = 0; dismissOverlay(); _forms = {}; _glowUntil = 0; _files = new Set(); _manifestAt = 0; _notFoundAt = 0; }
/** A card was finished: pick one of the eight celebrations (never the same twice in a row) and play it on the tile, the Den and a small overlay that shows on any Desk tab. */
export function cheer(xpGained, rnd) {
  if (!creatureShown()) return null;
  _emote = nextEmote(_lastEmote, rnd);
  _lastEmote = _emote.key;
  _cheerUntil = Date.now() + EMOTE_MS;
  showOverlay(cheerOverlay(cheerWords(xpGained)), EMOTE_MS);
  return _emote;
}
export const lastEmote = () => _lastEmote;
const cheering = () => Date.now() < _cheerUntil;
const cheerClass = () => (cheering() && _emote ? emoteClass(_emote) : '');
const hatching = () => Date.now() < _hatchUntil;
function dismissOverlay() { clearTimeout(_overlayTimer); if (_overlay && _overlay.remove) _overlay.remove(); _overlay = null; }
function showOverlay(node, ms) {
  dismissOverlay();
  if (!node || typeof document === 'undefined' || !document.body) return;
  _overlay = node;
  document.body.append(node);
  _overlayTimer = setTimeout(dismissOverlay, ms);
}
/** The small celebration that floats above the tab bar so it is seen wherever the card was finished (Work Desk, Orders, Bulletin Board). */
function cheerOverlay(words) {
  const c = _read && _read.creature;
  if (!c) return null;
  const box = el('div', ['cr-cheer', cheerClass(), c.rarity ? 'rar-' + c.rarity : ''].filter(Boolean).join(' '));
  box.setAttribute('role', 'status');
  box.setAttribute('aria-live', 'polite');
  box.append(pictureNode(c, 'small'), el('span', 'cr-spark', '✦ ✦ ✦'));
  box.append(el('b', 'cr-cheer-words', words ? `Nice work. ${words}` : 'Nice work.'));
  return box;
}
/** The 6 second hatching: the egg bursts, the creature drops in. Falls back to the creature at once under reduced motion. */
function hatchOverlay() {
  const c = _read && _read.creature;
  if (!c || c.phase !== 'creature') return null;
  const box = el('div', 'cr-hatch rar-' + (c.rarity || 'common'));
  box.setAttribute('role', 'status');
  box.setAttribute('aria-live', 'polite');
  const stage = el('div', 'cr-hatch-stage');
  const egg = _files.has('egg/egg-4-burst.webp') ? el('img', 'cr-hatch-egg') : null;
  if (egg) { egg.alt = ''; egg.src = 'creatures/egg/egg-4-burst.webp'; stage.append(egg); }
  const born = pictureNode(c, 'small');
  born.classList.add('cr-hatch-born');
  stage.append(born, el('span', 'cr-hatch-flash'));
  box.append(stage, el('b', 'cr-hatch-words', `It hatched! A ${RARITIES[c.rarity]} ${SPECIES[c.species]}.`));
  return box;
}
const glowing = () => Date.now() < _glowUntil;

/** Ask for the creature (fun mode only). Nothing is sent in professional mode. Resolves to the checked read or null. */
export function loadCreature(force) {
  if (professional()) return Promise.resolve(null);
  if (_notFoundAt && Date.now() - _notFoundAt < NOT_FOUND_MS) return Promise.resolve(null);
  if (!force && _read && Date.now() - _loadedAt < TTL_MS) return Promise.resolve(_read);
  if (!force && !_read && _failedAt && Date.now() - _failedAt < FAIL_MS) return Promise.resolve(null);
  if (_inflight) return _inflight;
  const epoch = _epoch;
  const token = _o.getToken();
  if (!token) return Promise.resolve(null);
  const mine = (async () => {
    try {
      const got = await timed(async signal => {
        const res = await _o.fetch(`${_o.apiBase}/api/station/desk/creature`, { headers: { Authorization: 'Bearer ' + token }, signal });
        return { status: res.status, ok: res.ok, body: res.ok ? await res.json() : null };
      });
      if (epoch !== _epoch) return null;
      if (!got.ok) { _failedAt = Date.now(); if (got.status === 404) _notFoundAt = Date.now(); return null; }
      await loadManifest();
      const read = normalizeCreatureRead(got.body);
      if (epoch !== _epoch) return null;
      if (!read) { _failedAt = Date.now(); return null; }
      if (_read && _read.creature.number === read.creature.number && read.creature.level > _read.creature.level) _glowUntil = Date.now() + 2000;
      const hatched = !!_read && _read.creature.phase === 'egg' && read.creature.phase === 'creature' && _read.creature.number === read.creature.number;
      _lastLevel = read.creature.level;
      _read = read; _loadedAt = Date.now(); _failedAt = 0;
      if (hatched) { _hatchUntil = Date.now() + HATCH_MS; _cheerUntil = 0; showOverlay(hatchOverlay(), HATCH_MS); }
      return read;
    } catch { if (epoch === _epoch) _failedAt = Date.now(); return null; }
    finally { if (_inflight === mine) _inflight = null; }
  })();
  _inflight = mine;
  return mine;
}

/** The picture: the server's still, or the dashed placeholder (also when the file will not load). Never a broken image. */
export function pictureNode(c, cls = '') {
  const box = el('div', ['cr-pic', 'rar-' + (c.rarity || 'common'), ...motionClasses(c, 0), cls].filter(Boolean).join(' '));
  const place = () => { box.replaceChildren(el('span', 'cr-slot', slotWords(c))); box.classList.add('placeholder'); };
  const still = pickArt(c, _files, { reducedMotion: reduced(), forms: _forms });
  if (!still) { place(); return box; }
  const img = el('img', 'cr-img');
  img.alt = altWords(c);
  img.decoding = 'async';
  img.addEventListener('error', place);
  img.src = still;
  box.append(img);
  return box;
}

const bar = c => { const b = el('div', 'cr-bar'); const f = el('i'); f.style.width = Math.round(barFraction(c) * 100) + '%'; b.append(f); b.setAttribute('role', 'img'); b.setAttribute('aria-label', barWords(c)); return b; };
const rarityChip = c => (c.rarity ? el('span', 'cr-rar rar-' + c.rarity, RARITIES[c.rarity]) : null);

/** The tile under the rank plate. flags = the Desk's own count of open cards. Tapping it calls onOpen. */
export function tileNode(flags, onOpen) {
  if (!creatureShown()) return null;
  const c = _read.creature;
  const tile = el('button', ['cr-tile', ...motionClasses(c, flags), cheering() ? 'cheer' : '', cheerClass(), hatching() ? 'hatching' : '', glowing() ? 'glow' : ''].filter(Boolean).join(' '));
  tile.type = 'button';
  tile.setAttribute('aria-label', 'Open the creature: ' + nameLine(c));
  tile.addEventListener('click', () => onOpen());
  const hero = el('span', 'cr-hero');
  hero.append(pictureNode(c, 'small'));
  if (c.mood === 'sleeping' || c.mood === 'curled') hero.append(el('span', 'cr-zz', 'zz'));
  if (cheering()) hero.append(el('span', 'cr-spark', '✦ ✦ ✦'));
  const body = el('span', 'cr-body');
  body.append(el('b', 'cr-name', nameLine(c, _forms)));
  const chip = rarityChip(c);
  if (chip) body.append(chip);
  body.append(bar(c), el('span', 'cr-xp', barWords(c)), el('span', 'cr-status', statusLine(c, flags)));
  tile.append(hero, body);
  return tile;
}

/** The Den: a full view inside the Desk panel with a back arrow. */
export function denNode(flags, onBack) {
  const c = _read.creature;
  const den = el('section', 'cr-den');
  den.setAttribute('aria-label', 'The Den');
  const top = el('div', 'cr-dentop');
  const back = el('button', 'cr-back', '← Desk');
  back.type = 'button';
  back.addEventListener('click', () => onBack());
  top.append(back, el('h3', '', 'The Den'));
  den.append(top);
  const frame = el('div', ['cr-big', ...motionClasses(c, flags), cheering() ? 'cheer' : '', cheerClass(), glowing() ? 'glow' : ''].filter(Boolean).join(' '));
  frame.append(pictureNode(c, 'big'));
  if (c.mood === 'sleeping' || c.mood === 'curled') frame.append(el('span', 'cr-zz', 'zz'));
  den.append(frame);
  const id = el('div', 'cr-id');
  const nm = c.phase === 'egg' ? 'Egg' : (c.name || SPECIES[c.species]);
  id.append(el('h4', '', nm));
  const chip = rarityChip(c);
  if (chip) id.append(chip);
  den.append(id);
  if (c.phase === 'creature' && !c.name && c.suggested) den.append(el('p', 'cr-hint', 'Not named yet. Suggested name: ' + c.suggested + '.'));
  den.append(el('p', 'cr-stage', c.phase === 'egg' ? nameLine(c) : `${stageWord(c, _forms)}, Level ${c.level}, ${SPECIES[c.species]}`));
  den.append(bar(c), el('p', 'cr-xp', barWords(c)), el('p', 'cr-status', statusLine(c, flags)));
  if (c.phase === 'creature') {
    den.append(el('h5', 'cr-h', 'Traits'));
    const row = el('div', 'cr-chips');
    traitChips(c).forEach(t => row.append(el('span', 'cr-chip' + (t.empty ? ' empty' : ''), t.text)));
    den.append(row);
    den.append(el('h5', 'cr-h', 'Gear'));
    const gear = el('div', 'cr-chips');
    GEAR.forEach(g => gear.append(el('span', 'cr-chip empty', g + ': empty')));
    den.append(gear);
  }
  den.append(el('h5', 'cr-h', 'Reward on your next card'));
  const rw = el('div', 'cr-rewards');
  SIZES.forEach(s => {
    const r = c.reward[s];
    const line = _rule === 'effort' ? rewardLine(c, s) : (r ? `${RARITIES[r.step]} picture${r.animated ? ', animated' : ''}` : '');   // XP is shown only when the effort rule is live
    if (!line) return;
    const cell = el('div', 'cr-reward');
    cell.append(el('span', 'cr-sw rar-' + r.step), el('b', '', s.toUpperCase()), el('span', '', line));
    rw.append(cell);
  });
  den.append(rw);
  den.append(el('h5', 'cr-h', 'Stable'));
  const shelf = el('div', 'cr-stable');
  if (!_read.stable.length) shelf.append(el('p', 'cr-hint', 'Finished creatures live here.'));
  _read.stable.forEach(s => {
    const t = el('div', 'cr-stall rar-' + s.rarity);
    t.append(el('span', '', s.name || SPECIES[s.species]), el('small', '', RARITIES[s.rarity]));
    shelf.append(t);
  });
  den.append(shelf);
  return den;
}
