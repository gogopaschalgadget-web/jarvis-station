/**
 * The art and colours of each theme, as data. Modules ask for the active theme's picture and fall back to the default theme's when a theme has none,
 * so a theme can be added by adding a table here and its pictures under assets/themes/<id>/. Nothing about a theme lives anywhere else.
 */
export const DEFAULT_THEME = 'forge-and-brass';

const RANK_KEYS = ['founder', 'amateur', 'beginner', 'technician', 'supervisor', 'manager', 'senior-manager', 'general-manager', 'director', 'vice-president', 'executive', 'chair'];
const pad = n => String(n).padStart(2, '0');
const byRank = (dir, make) => Object.fromEntries(RANK_KEYS.map((k, i) => [i + 1, dir + make(pad(i + 1), k)]));
const TIERS = ['basic', 'enhanced', 'advanced', 'legendary'];

const FORGE = 'assets/themes/forge-and-brass/';
const CH = 'assets/themes/counting-house/';

export const THEME_ART = {
  'forge-and-brass': {
    meta: { name: 'Forge and Brass', mode: 'game', ready: true, tagline: 'Blackened iron, brass and furnace light.' },
    plates: byRank(FORGE + 'ranks/', (n, k) => `rank${n}_${k}.jpg`),
    rankup: byRank(FORGE + 'rankup/', (n, k) => `rankup_${n}_${k}.jpg`),
    machines: {
      desks: { operations: 'forge', sales: 'press', marketing: 'tower', money: 'gauge', customer_experience: 'switch' },
      stills: Object.fromEntries(['forge', 'press', 'tower', 'gauge', 'switch'].map(m => [m, Object.fromEntries(TIERS.map(t => [t, `${FORGE}machines/${m}-${t}.webp`]))])),
      loops: Object.fromEntries(['forge', 'press', 'tower', 'gauge', 'switch'].map(m => [m, `${FORGE}machines/${m}-loop.webp`])),
    },
    tiles: {
      built: Object.fromEntries(Object.entries({ spire: 'spire', library: 'library', workshop: 'workshop', mint: 'mint', 'content-engine': 'content', 'traffic-control': 'traffic', x: 'x', bench: 'bench' }).map(([k, v]) => [k, `${FORGE}tiles/${v}.jpg`])),
      blueprint: Object.fromEntries(Object.entries({ gumroad: 'gumroad', 'github-pages': 'ghpages', reddit: 'reddit', quora: 'quora' }).map(([k, v]) => [k, `${FORGE}blueprints/tiles_blueprint/${v}.jpg`])),
      blueprintDefault: `${FORGE}tiles/blueprint.jpg`,
    },
    trim: true,
    colors: null,
  },
  'counting-house': {
    meta: { name: 'Counting House', mode: 'professional', ready: true, tagline: 'Oak, green lamps and ledgers.' },
    plates: byRank(CH + 'ranks/', (n, k) => `rank${n}_${k}.jpg`),
    rankup: { 4: `${CH}rankup/rankup_04_technician.jpg` },
    machines: {
      desks: { operations: 'ops', sales: 'sales', marketing: 'marketing', money: 'money', customer_experience: 'customer' },
      names: { operations: 'Operations Board', sales: 'Order Book', marketing: 'Notice Press', money: 'Accounts Ledger', customer_experience: 'Enquiries Desk' },
      stills: Object.fromEntries(['ops', 'sales', 'marketing', 'money', 'customer'].map(m => [m, Object.fromEntries(TIERS.map((t, i) => [t, `${CH}machines/${m}_${['basic', 'enh', 'adv', 'leg'][i]}.webp`]))])),
      loops: {},
    },
    tiles: {
      built: Object.fromEntries(Object.entries({ spire: 'spire', library: 'library', workshop: 'workshop', mint: 'mint', 'content-engine': 'content', 'traffic-control': 'traffic', x: 'x' }).map(([k, v]) => [k, `${CH}tiles/${v}.webp`])),
      blueprint: Object.fromEntries(Object.entries({ gumroad: 'gumroad', 'github-pages': 'ghpages', reddit: 'reddit', quora: 'quora' }).map(([k, v]) => [k, `${CH}tiles/${v}.webp`])),
    },
    trim: false,
    colors: { barA: '#24402f', barB: '#101d15', accent: '#c9b27a', accentHi: '#f1e6c2', accentLo: '#5d4f2c', panelA: '#14241b', panelB: '#07100b', text: '#e6e2cf', muted: '#a9b09a' },
  },
};

const own = (o, k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);

/** The id of the theme on the page now (the default when none is marked or the mark is unknown). */
export function activeThemeId(doc = typeof document === 'undefined' ? null : document) {
  try { const id = doc && doc.documentElement && doc.documentElement.dataset.theme; return own(THEME_ART, id) ? id : DEFAULT_THEME; } catch { return DEFAULT_THEME; }
}

/** The art table of a theme (the active one when none is named); an unknown id is the default theme. */
export function artFor(id) {
  return own(THEME_ART, id) ? THEME_ART[id] : THEME_ART[id === undefined ? activeThemeId() : DEFAULT_THEME];
}

/** One picture from the active theme's table, else the default theme's, else ''. `pick` reads a table and returns a path or undefined. */
export function pictureFrom(pick, id) {
  const a = pick(artFor(id));
  if (a) return a;
  return pick(THEME_ART[DEFAULT_THEME]) || '';
}
