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
const own = (obj, key) => typeof key === 'string' && Object.prototype.hasOwnProperty.call(obj, key);
const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

const DAY = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** A list of YYYY-MM-DD days, checked, de-duplicated, oldest first, at most 60 kept (the newest). */
export function days(raw) {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter(d => typeof d === 'string' && DAY.test(d)))].sort().slice(-60);
}

/** Today's day on the phone as YYYY-MM-DD. */
export function dayKey(date = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return date.getFullYear() + '-' + p(date.getMonth() + 1) + '-' + p(date.getDate());
}

/** "Asked for on 21 Nov" (the latest day), with "and on N earlier days" when there were more; empty when never asked. */
export function askedLine(askedDays) {
  const d = days(askedDays);
  if (!d.length) return '';
  const [, m, day] = d[d.length - 1].split('-');
  const base = 'Asked for on ' + Number(day) + ' ' + MONTHS[Number(m) - 1];
  return d.length > 1 ? base + ', and on ' + (d.length - 1) + (d.length === 2 ? ' earlier day' : ' earlier days') : base;
}

/** The days Chris asked for each idea, kept on this phone (a convenience: the feed's own `asked_on`, when it has one, is merged in). Storage that fails is ignored. */
export function makeAskLog(storage, key = 'cas-bp-asked') {
  let map = Object.create(null);
  try {
    const raw = storage && JSON.parse(storage.getItem(key) || '{}');
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) Object.keys(raw).slice(0, MAX_IDEAS).forEach(id => { map[id] = days(raw[id]); });
  } catch { map = Object.create(null); }
  const save = () => { try { if (storage) storage.setItem(key, JSON.stringify(map)); } catch { /* the line is a convenience; the tap already went */ } };
  return {
    days: idea => days([...(Object.prototype.hasOwnProperty.call(map, idea.id) ? map[idea.id] : []), ...(idea.asked || [])]),
    record(id, day) { if (typeof id === 'string' && DAY.test(day) && Object.keys(map).length < MAX_IDEAS * 2) { map[id] = days([...(Object.prototype.hasOwnProperty.call(map, id) ? map[id] : []), day]); save(); } },
  };
}

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
    if (!own(STATE_WORDS, state)) return;
    seen.add(id);
    out.push({
      id, title, state,
      oneLine: text(r.one_line, 400), said: text(r.said, 400), needs: text(r.needs_from_chris, 300),
      area: AREAS.some(a => a[0] === r.area) ? r.area : 'other',
      size: own(SIZE_RANK, r.size) ? r.size : '',
      fun: FUN.includes(r.fun_or_work) ? r.fun_or_work : '',
      money: MONEY.includes(r.leads_to_money) ? r.leads_to_money : '',
      tile: text(r.map_tile, 40),
      asked: days(r.asked_on),
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
  if (own(SIZE_RANK, f.size)) list = list.filter(i => i.size === f.size);
  const kindRank = i => (f.fun === 'fun' || f.fun === 'work' ? (i.fun === f.fun ? 0 : 1) : 0);
  return list.sort((a, b) => kindRank(a) - kindRank(b)
    || (own(SIZE_RANK, a.size) ? SIZE_RANK[a.size] : 3) - (own(SIZE_RANK, b.size) ? SIZE_RANK[b.size] : 3)
    || (own(STATE_ORDER, a.state) ? STATE_ORDER[a.state] : 3) - (own(STATE_ORDER, b.state) ? STATE_ORDER[b.state] : 3)
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

/** Open ideas that belong to a map place: map_tile holds the place id (spire, mint, ...), the place name is accepted too. */
export function ideasForPlace(items, place) {
  if (!place) return [];
  return items.filter(i => OPEN_STATES.includes(i.state) && i.tile && [place.id, place.name].some(n => n.toLowerCase() === i.tile.toLowerCase()));
}

/** What an idea depends on, as titles where the idea is known, else the id as written. */
export function dependsTitles(idea, items) {
  const byId = new Map(items.map(i => [i.id, i.title]));
  return idea.dependsOn.map(id => byId.get(id) || id);
}

/** Words for the answer to an "I want to work on this" tap; from the status only, never invented. */
export function wantLine(status, json) {
  if (status === 200 || status === 201) {
    const n = json && Number.isFinite(json.wants) ? json.wants : 0;
    return n > 1 ? 'Sent to the orchestrator. You have asked for this on ' + n + ' days.' : 'Sent to the orchestrator.';
  }
  if (status === 0) return 'No connection. Try again.';
  if (status === 401) return 'The sign-in has expired. Sign in again.';
  if (status === 403) return 'This device is not allowed to send that.';
  if (status === 429) return 'Too many taps in a minute. Wait a moment.';
  if (status === 422) return 'That idea is no longer on the list.';
  return 'Not sent. Try again.';
}

const ART_DIR = 'assets/themes/forge-and-brass/blueprints/';
const IDEA_ART = ['artwork-reveal-gallery', 'cas-avatar-levels', 'desk-machines-animations', 'money-gauge-wall', 'theme-pack-game-vs-professional', 'customer-experience-switchboard', '3d-map-live-rooms', 'picture-bot-taste-loop', 'signal-tower-ripple', 'finishing-stretch-steps-left'];

/** The drawing for an idea: its own if there is one, else its area's, else the generic blueprint. Fixed names only, never taken from the feed text. */
export function ideaArt(idea) {
  if (!idea) return null;
  if (IDEA_ART.includes(idea.id)) return ART_DIR + 'idea_' + idea.id + '.jpg';
  if (AREAS.some(a => a[0] === idea.area)) return ART_DIR + 'area_' + idea.area + '.jpg';
  return ART_DIR + 'blueprint_tile.jpg';
}

/** The "I want to work on this" tap: one request at a time, remembers what was sent this session, words the button and the toast. */
export function makeWanter(postFn, sayFn, onChange, log, today = dayKey) {
  const sent = new Set();
  let busy = false;
  return {
    label: idea => (sent.has(idea.id) ? 'Sent. Tap to send again' : 'I want to work on this'),
    isBusy: () => busy,
    async tap(idea) {
      if (busy) return false;
      busy = true;
      if (onChange) onChange();
      let res;
      try { res = await postFn(idea.id); } catch { res = { ok: false, status: 0, json: {} }; }
      busy = false;
      if (res.ok) { sent.add(idea.id); if (log) log.record(idea.id, today()); }
      sayFn(wantLine(res.ok ? 200 : res.status, res.json));
      return !!res.ok;
    },
  };
}

/** What the drawer draws for each group: its tiles only when the group is open (so a closed group costs nothing), and an open group stays open across redraws. */
export function drawerPlan(view, openGroups) {
  return view.groups.map(g => {
    const open = openGroups.has(g.key);
    return { key: g.key, label: g.label, count: g.items.length, open, items: open ? g.items : [] };
  });
}
