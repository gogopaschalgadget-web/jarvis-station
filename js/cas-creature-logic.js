// The creature on the Desk: what the server's GET /api/creature says, checked, and the words and numbers the tile and the Den draw. No page code here.
export const SPECIES = { lava: 'Lava tortoise', stag: 'Storm stag', moss: 'Moss bear', wolf: 'Clockwork wolf', bull: 'Iron bull' };
export const STAGES = { hatchling: 'Hatchling', juvenile: 'Juvenile', adult: 'Adult', grown: 'Grown' };
export const RARITIES = { common: 'Common', uncommon: 'Uncommon', rare: 'Rare', epic: 'Epic', legendary: 'Legendary' };
export const MOODS = ['awake', 'drowsy', 'sleeping', 'curled'];
export const DESKS = { marketing: 'Marketing', money: 'Money', operations: 'Operations', sales: 'Sales', customer: 'Customer Experience' };
export const TRAITS = {
  marketing: ['Antennae', 'Wings', 'Ring of signal light'],
  money: ['Gold shoulder plating', 'Gold helm', 'Full gold armour'],
  operations: ['Iron plates and rivets', 'Gear arms', 'Small forge-glow back'],
  sales: ['Coin crest', 'Coin-scale tail', 'Golden mane'],
  customer: ['Big listening ears', 'Brass horn', 'Glowing lantern'],
};
export const TRAIT_UNLOCK = ['Juvenile unlocks a trait', 'Adult unlocks a trait', 'Grown unlocks a trait'];
export const GEAR = ['Collar', 'Charm', 'Back', 'Head'];
export const SIZES = ['xs', 's', 'm', 'l', 'xl'];
export const STEPS = ['common', 'uncommon', 'rare', 'epic'];
/** Total XP inside one creature at which each step starts: the egg steps, the hatch, then levels 2 to 10. */
export const THRESHOLDS = [0, 60, 120, 240, 300, 450, 650, 900, 1230, 1660, 2220, 2950, 3900, 5100];
/** The server names the egg steps two ways (its constants and its example); both are accepted. Whole is null. */
const EGG_ART = { wobble: 'egg-1-wobble', cracks1: 'egg-2-cracks', first_cracks: 'egg-2-cracks', cracks: 'egg-2-cracks', cracks2: 'egg-3-wide', wide_cracks: 'egg-3-wide', hatch: 'egg-3-wide' };
const EGG_WORDS = { wobble: 'wobbling', cracks1: 'with first cracks', first_cracks: 'with first cracks', cracks: 'with first cracks', cracks2: 'with wide cracks', wide_cracks: 'with wide cracks', hatch: 'with wide cracks' };

const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const whole = (v, max = 1e7) => (Number.isInteger(v) && v >= 0 && v <= max ? v : null);
const plain = (v, max) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const pick = (table, v) => (typeof v === 'string' && own(table, v) ? v : null);

/** The still path the server names, accepted only as a plain relative creatures/ path ending .webp. */
export function safeArt(path) {
  if (typeof path !== 'string' || path.length > 120) return null;
  return /^creatures\/[a-z0-9-]+(\/[a-z0-9-]+){0,2}\.webp$/.test(path) ? path : null;
}

function normalizeReward(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  SIZES.forEach(s => {
    const r = raw[s];
    if (!r || typeof r !== 'object') return;
    const xp = whole(r.xp, 1000);
    const step = pick(Object.fromEntries(STEPS.map(x => [x, 1])), r.step);
    if (xp == null || !step) return;
    out[s] = { xp, step, animated: r.animated === true };
  });
  return out;
}

function normalizeOne(c) {
  if (!c || typeof c !== 'object') return null;
  const phase = c.phase === 'egg' || c.phase === 'creature' ? c.phase : null;
  const xpIn = whole(c.xp_in, 100000);
  if (!phase || xpIn == null) return null;
  const toNext = whole(c.xp_to_next, 100000);
  const species = pick(SPECIES, c.species);
  const stage = pick(STAGES, c.stage);
  const rarity = pick(RARITIES, c.rarity);
  const level = whole(c.level, 10);
  if (phase === 'creature' && (!species || !stage || !rarity || level == null || level < 1)) return null;
  const traits = (Array.isArray(c.traits) ? c.traits : []).slice(0, 3).map(t => (t && typeof t === 'object' ? pick(DESKS, t.desk) : null)).filter(Boolean);
  const art = c.art && typeof c.art === 'object' ? { still: safeArt(c.art.still), loop: safeArt(c.art.loop) } : { still: null, loop: null };
  return {
    number: whole(c.number, 100000) || 1, phase, xpIn, toNext,
    nextLabel: plain(c.next_label, 40),
    eggStep: phase === 'egg' ? (typeof c.egg_step === 'string' && own(EGG_ART, c.egg_step) ? c.egg_step : null) : null,
    level: phase === 'creature' ? level : 0, stage: phase === 'creature' ? stage : null, species: phase === 'creature' ? species : null,
    rarity: phase === 'creature' ? rarity : null,
    name: plain(c.name, 24) || null, suggested: plain(c.suggested_name, 24) || null,
    traits, mood: MOODS.includes(c.mood) ? c.mood : 'awake', welcomeBack: c.welcome_back === true,
    cardsSinceHatch: whole(c.cards_since_hatch, 100000) || 0, reward: normalizeReward(c.next_reward), art,
  };
}

/** The whole read: { creature, stable[], hidden } or null when the answer is not usable. `hidden` is the server's own professional-mode flag. */
export function normalizeCreatureRead(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const creature = normalizeOne(raw.creature);
  if (!creature) return null;
  const stable = (Array.isArray(raw.stable) ? raw.stable : []).slice(0, 60).map(s => {
    if (!s || typeof s !== 'object') return null;
    const species = pick(SPECIES, s.species), rarity = pick(RARITIES, s.rarity);
    if (!species || !rarity) return null;
    return { number: whole(s.number, 100000) || 0, species, rarity, name: plain(s.name, 24) || null, art: safeArt(s.art && s.art.still ? s.art.still : s.art) };
  }).filter(Boolean);
  return { creature, stable, hidden: raw.professional_mode_hidden === true };
}

/** Words for the placeholder box. */
export function slotWords(c) {
  if (c.phase === 'egg') return 'Egg' + (c.eggStep ? ', ' + EGG_WORDS[c.eggStep] : ', whole') + ' (art slot)';
  return `${SPECIES[c.species]}, ${STAGES[c.stage].toLowerCase()} (art slot)`;
}
export const altWords = c => (c.phase === 'egg' ? 'Egg' + (c.eggStep ? ', ' + EGG_WORDS[c.eggStep] : '') : `${c.name || SPECIES[c.species]}, ${SPECIES[c.species]}, ${STAGES[c.stage].toLowerCase()}`);

/** The plain name line of the tile: "Lava tortoise, Level 2, Hatchling" or "Egg, 120 of 300 XP". */
export function nameLine(c) {
  if (c.phase === 'egg') return `Egg, ${Math.min(c.xpIn, 300)} of 300 XP`;
  return `${c.name ? c.name + ', ' : ''}${SPECIES[c.species]}, Level ${c.level}, ${STAGES[c.stage]}`;
}

/** Fraction of the way from the step just reached to the next, from xp_in and xp_to_next alone. */
export function barFraction(c) {
  if (c.toNext == null) return 1;
  const next = c.xpIn + c.toNext;
  let prev = 0;
  THRESHOLDS.forEach(t => { if (t <= c.xpIn) prev = t; });
  const span = next - prev;
  return span > 0 ? Math.max(0, Math.min(1, (c.xpIn - prev) / span)) : 0;
}
export const barWords = c => (c.toNext == null ? 'Grown' : `${c.toNext} XP to ${c.nextLabel || 'the next step'}`);

/** The tile's one status line: flags first (they need Chris), then mood. flags is the Desk's own open-card count. */
export function statusLine(c, flags) {
  if (flags > 0) return `Needs you: ${flags} ${flags === 1 ? 'flag' : 'flags'}`;
  if (c.mood === 'sleeping') return 'Sleeping';
  if (c.mood === 'curled') return 'Curled up asleep';
  if (c.mood === 'drowsy') return 'Drowsy';
  return c.welcomeBack ? 'Welcome back.' : 'Awake';
}

/** Mood and flags as the classes that drive the motion. Sleeping and curled win over everything; pace only while not asleep. */
export function motionClasses(c, flags) {
  const asleep = c.mood === 'sleeping' || c.mood === 'curled';
  return ['mood-' + c.mood, !asleep && flags > 0 ? 'pace' : '', asleep ? 'asleep' : ''].filter(Boolean);
}

/** The three trait chips: named for the desk (the same desk again reads "larger"), the empty ones say what unlocks them. */
export function traitChips(c) {
  const seen = {};
  const out = [];
  for (let i = 0; i < 3; i++) {
    const d = c.traits[i];
    if (!d) { out.push({ empty: true, text: TRAIT_UNLOCK[i] }); continue; }
    seen[d] = (seen[d] || 0) + 1;
    out.push({ empty: false, text: `${TRAITS[d][i]} (${DESKS[d]}${seen[d] > 1 ? ', larger' : ''})` });
  }
  return out;
}

/** "+60 XP, Common picture" for a card of this size, or '' when the read has no number for it. */
export function rewardLine(c, size) {
  const r = c && size && c.reward[size];
  if (!r) return '';
  return `+${r.xp} XP, ${RARITIES[r.step]} picture${r.animated ? ', animated' : ''}`;
}

/** The manifest `{"files": ["egg/egg-0-whole.webp", ...]}` as a set of safe relative names; anything else is dropped. */
export function normalizeManifest(raw) {
  const out = new Set();
  const list = raw && typeof raw === 'object' && Array.isArray(raw.files) ? raw.files : [];
  list.slice(0, 400).forEach(f => { if (typeof f === 'string' && /^[a-z0-9-]+(\/[a-z0-9-]+){0,2}\.webp$/.test(f)) out.add(f); });
  return out;
}

/**
 * The picture for the current state, chosen from the files the manifest lists (the server sends no art). Order: the trait variant of the still, the
 * sleeping pose when asleep, the animated loop when motion is allowed, then the plain still. Returns 'creatures/...' or null (placeholder).
 */
export function pickArt(c, files, opts = {}) {
  const has = f => files && files.has(f);
  const serverStill = c.art && c.art.still;
  if (c.phase === 'egg') {
    const f = eggSlotFile(c).replace(/^creatures\//, '');
    return has(f) ? 'creatures/' + f : serverStill;
  }
  const base = `${c.species}/${c.stage}`;
  const asleep = c.mood === 'sleeping' || c.mood === 'curled';
  const desk = c.traits.length ? c.traits[c.traits.length - 1] : null;
  const order = [];
  if (asleep) order.push(base + '-sleep.webp');
  if (!asleep && !opts.reducedMotion) order.push(base + '-loop.webp');
  if (desk) order.push(`${base}--${desk}.webp`);
  order.push(base + '.webp');
  const hit = order.find(has);
  return hit ? 'creatures/' + hit : serverStill;
}
export const eggSlotFile = c => (c.phase === 'egg' ? 'creatures/egg/' + (c.eggStep ? EGG_ART[c.eggStep] : 'egg-0-whole') + '.webp' : null);
