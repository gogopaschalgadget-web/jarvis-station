export const AREAS = [
  ['station', 'Station'], ['cas', 'Cas'], ['rewards', 'Rewards and XP'], ['revenue', 'Revenue'], ['money', 'Money'],
  ['security', 'Security'], ['3d-map', '3D map'], ['business-builder', 'Business builder'], ['veteran-shop', 'Veteran shop'], ['other', 'Other'],
];
export const OPEN_STATES = ['designed', 'idea', 'parked'];
export const BUILT_STATES = ['live', 'built-not-live', 'building'];
export const STATE_WORDS = { designed: 'Designed', idea: 'Idea', parked: 'Parked', live: 'Live', 'built-not-live': 'Built, not live', building: 'Being built', dropped: 'Dropped' };
const SIZE_RANK = { small: 0, medium: 1, large: 2 };
const FUN = ['fun', 'work', 'both'];
const MONEY = ['direct', 'indirect', 'no'];
const MAX_IDEAS = 150;
const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** The feed's blueprint records, checked. Unknown keys (such as file paths) are dropped; a record without an id and a title is skipped. */
export function normalizeBlueprints(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  raw.forEach(r => {
    if (!r || typeof r !== 'object' || out.length >= MAX_IDEAS) return;
    const id = text(r.id, 60);
    const title = text(r.title, 120);
    if (!id || !title || seen.has(id)) return;
    const state = text(r.state, 20);
    if (!STATE_WORDS[state]) return;
    seen.add(id);
    out.push({
      id, title, state,
      oneLine: text(r.one_line, 400), said: text(r.said, 400), needs: text(r.needs_from_chris, 300),
      area: AREAS.some(a => a[0] === r.area) ? r.area : 'other',
      size: SIZE_RANK[r.size] == null ? '' : r.size,
      fun: FUN.includes(r.fun_or_work) ? r.fun_or_work : '',
      money: MONEY.includes(r.leads_to_money) ? r.leads_to_money : '',
      tile: text(r.map_tile, 40),
      dependsOn: (Array.isArray(r.depends_on) ? r.depends_on : []).filter(x => typeof x === 'string').map(x => x.slice(0, 60)).slice(0, 8),
    });
  });
  return out;
}

const STATE_ORDER = { designed: 0, idea: 1, parked: 2 };

/** Filter and order the open ideas: Fun or Work keeps that kind and "both", the chosen kind first; otherwise smallest first. */
export function filterIdeas(items, filter) {
  const f = filter || {};
  let list = items.filter(i => OPEN_STATES.includes(i.state));
  if (f.fun === 'fun' || f.fun === 'work') list = list.filter(i => i.fun === f.fun || i.fun === 'both');
  if (SIZE_RANK[f.size] != null) list = list.filter(i => i.size === f.size);
  const kindRank = i => (f.fun === 'fun' || f.fun === 'work' ? (i.fun === f.fun ? 0 : 1) : 0);
  return list.sort((a, b) => kindRank(a) - kindRank(b)
    || (SIZE_RANK[a.size] ?? 3) - (SIZE_RANK[b.size] ?? 3)
    || STATE_ORDER[a.state] - STATE_ORDER[b.state]
    || a.title.localeCompare(b.title));
}

/** The whole page: open ideas by area, then what is built or being built, then dropped. */
export function blueprintView(items, filter) {
  const open = filterIdeas(items, filter);
  const groups = AREAS.map(([key, label]) => ({ key, label, items: open.filter(i => i.area === key) })).filter(g => g.items.length);
  return {
    groups,
    openCount: items.filter(i => OPEN_STATES.includes(i.state)).length,
    built: items.filter(i => BUILT_STATES.includes(i.state)),
    dropped: items.filter(i => i.state === 'dropped'),
  };
}

/** Open ideas that belong to a map place, by the place's name. */
export function ideasForPlace(items, placeName) {
  return items.filter(i => OPEN_STATES.includes(i.state) && i.tile === placeName);
}

/** What an idea depends on, as titles where the idea is known, else the id as written. */
export function dependsTitles(idea, items) {
  const byId = new Map(items.map(i => [i.id, i.title]));
  return idea.dependsOn.map(id => byId.get(id) || id);
}
