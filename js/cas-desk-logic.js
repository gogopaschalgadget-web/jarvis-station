// Desk rules that need no page: order moves, what a link does, the rows the Missions tab shows.

export const SHOWN = 5;

export function rankItems(feed) {
  const order = (feed && feed.project_order) || [];
  const rank = p => { const i = order.indexOf(p); return i < 0 ? order.length : i; };
  return ((feed && feed.items) || [])
    .map((item, index) => ({ item, index }))
    .filter(x => x.item.status === 'open' && !x.item.parent_id)
    .sort((a, b) => rank(a.item.project) - rank(b.item.project) || a.index - b.index)
    .map(x => x.item);
}

export function itemsById(data) {
  const map = new Map();
  ((data && data.feed && data.feed.items) || []).forEach(i => map.set(i.id, i));
  return map;
}

/** Top-level cards in the order Chris sees: the server's order, or the feed's own when the server sent none. */
export function orderedIds(data) {
  const items = itemsById(data);
  const order = data && Array.isArray(data.order) ? data.order.filter(id => items.has(id)) : null;
  return order || rankItems(data && data.feed).map(i => i.id);
}

export function moveTo(order, id, index) {
  const from = order.indexOf(id);
  if (from < 0) return null;
  const to = Math.max(0, Math.min(index, order.length - 1));
  if (to === from) return null;
  const next = order.filter(x => x !== id);
  next.splice(to, 0, id);
  return next;
}

export function stepBy(order, id, delta) {
  const from = order.indexOf(id);
  return from < 0 ? null : moveTo(order, id, from + delta);
}

/** Where a dragged card lands: the number of other cards whose middle is above the dragged card's middle. */
export function dropIndex(middles, draggedIndex, draggedMiddle) {
  return middles.reduce((n, m, i) => n + (i !== draggedIndex && m < draggedMiddle ? 1 : 0), 0);
}

export function pinnedAfterMove(order, mine, moved) {
  const set = new Set([...(mine || []), moved]);
  return order.filter(id => set.has(id));
}

export function stepParts(step) {
  return typeof step === 'string' ? { text: step, links: [] } : { text: step.text, links: step.links || [] };
}

export function casMessage(parent, kid, why) {
  const lines = [kid.cas_prompt || `I am stuck on: ${parent.title}. ${why || ''}`.trim()];
  if (parent.summary) lines.push('What the card says: ' + parent.summary);
  const steps = (parent.steps || []).map(s => stepParts(s).text).filter(Boolean);
  if (steps.length) lines.push('Its steps:', ...steps.map((t, i) => `${i + 1}. ${t}`));
  return lines.join('\n').slice(0, 1800);
}

export function isHttps(target) {
  return typeof target === 'string' && /^https:\/\/[^\s]+$/.test(target);
}

/** What tapping a link does. A folder or data path lives on the PC, so the phone shows it and does nothing. */
export function linkAction(link) {
  if (!link) return { type: 'none' };
  if (link.kind === 'url') return isHttps(link.target) ? { type: 'open', href: link.target } : { type: 'none' };
  if (link.kind === 'card') return { type: 'card', id: link.target };
  if (link.kind === 'station') return { type: 'tab', id: link.target };
  if (link.kind === 'thread') return { type: 'thread', id: link.target };
  return { type: 'pc' };
}

/** The Desk cards as small missions for the Missions tab. */
export function deskRows(data) {
  if (!data || !data.feed) return [];
  const items = itemsById(data);
  const stuck = data.stuck || {};
  return orderedIds(data).map(id => items.get(id)).filter(Boolean).map(i => ({
    id: i.id, title: i.title, project: i.project, minutes: i.minutes, stuck: Object.prototype.hasOwnProperty.call(stuck, i.id),
  }));
}

const MARK = /\{\{([^{}]{1,60})\}\}/g;
const KEY = /^[a-z][a-z0-9_]{0,39}$/;

/** The extra lines a step opens to; [] for plain-text steps and steps without any. */
export function stepDetail(step) {
  return step && typeof step === 'object' && Array.isArray(step.detail) ? step.detail.filter(x => typeof x === 'string' && x) : [];
}

export function termMap(item) {
  const map = new Map();
  const list = item && Array.isArray(item.terms) ? item.terms : [];
  list.forEach(t => { if (t && typeof t.key === 'string' && KEY.test(t.key) && t.name) map.set(t.key, t); });
  return map;
}

/** Splits text at {{key}} markers: [{text}] and [{term}] parts. Any marker that is not a defined term reads as plain words, never braces. */
export function textParts(text, terms) {
  const s = String(text == null ? '' : text);
  const out = [];
  let last = 0;
  s.replace(MARK, (m, raw, at) => {
    if (at > last) out.push({ text: s.slice(last, at) });
    const key = raw.trim();
    const t = terms && KEY.test(key) ? terms.get(key) : null;
    out.push(t ? { term: t } : { text: key.replace(/_/g, ' ') });
    last = at + m.length;
    return m;
  });
  if (last < s.length || !out.length) out.push({ text: s.slice(last) });
  return out;
}

export const plainText = text => textParts(text, null).map(p => p.text).join('');

/** The card as it was before terms, details and sources: used when the rich form of a card cannot be drawn. */
export function plainItem(item) {
  const steps = Array.isArray(item.steps) ? item.steps.map(s => {
    const p = s && typeof s === 'object' ? { text: plainText(s.text), links: Array.isArray(s.links) ? s.links : [] } : plainText(s);
    return p;
  }) : [];
  return { ...item, summary: item.summary == null ? item.summary : plainText(item.summary), steps, terms: [], sources: [] };
}

/** Sources the phone will show: https addresses only, each source once. */
export function cleanSources(list) {
  const seen = new Set();
  return (Array.isArray(list) ? list : []).filter(s => s && s.label && isHttps(s.url) && !seen.has(s.url) && seen.add(s.url));
}

/** The links not yet shown on this card or mission; each is remembered in `seen` so it appears once. */
export function unseenLinks(links, seen) {
  return (Array.isArray(links) ? links : []).filter(l => {
    if (!l || typeof l !== 'object') return false;
    const key = String(l.kind) + '|' + String(l.target);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const DAY_MS = 86400000;
const pad = n => String(n).padStart(2, '0');
const dayKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const HOLD_MAX_DAYS = 90;
export const HOLD_REASONS = ['Not at a PC', 'Waiting on someone', 'Not today'];

/** The Desk day starts at 2 am: before that it is still yesterday. */
export function deskDay(now = new Date()) {
  const d = new Date(now.getTime() - 2 * 3600000);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12);
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The server's day key from the desk response; the phone's own 2 am day only when the server sent none. */
export function serverDay(data, now = new Date()) {
  const d = data && [data.day, data.today, data.day_key].find(v => typeof v === 'string' && ISO_DAY.test(v));
  return d || dayKey(deskDay(now));
}

/** Dates a hold may use: the server day (returns at the next flip), the coming Saturday, the 90-day limit. */
export function holdDates(day) {
  const today = new Date(day + 'T12:00:00');
  const toSat = (6 - today.getDay() + 7) % 7;
  return { today: day, weekend: dayKey(new Date(today.getTime() + toSat * DAY_MS)), max: dayKey(new Date(today.getTime() + HOLD_MAX_DAYS * DAY_MS)) };
}

/** until = the day the card comes back. On Sunday the coming Saturday is 6 days off, so Sunday means back tomorrow too. */
export function holdUntil(kind, day, picked = '') {
  const d = holdDates(day);
  if (kind === 'tomorrow') return d.today;
  if (kind === 'weekend') return new Date(d.today + 'T12:00:00').getDay() === 0 ? d.today : d.weekend;
  if (kind === 'date' && ISO_DAY.test(picked) && picked >= d.today && picked <= d.max) return picked;
  return null;
}

export function dayWords(iso) {
  const d = new Date(String(iso) + 'T12:00:00');
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

/** Cards on hold, from the server's held_cards list; anything malformed is ignored. */
export function heldCards(data) {
  const list = data && Array.isArray(data.held_cards) ? data.held_cards : [];
  return list.filter(h => h && typeof h.id === 'string').map(h => {
    const hold = h.hold && typeof h.hold === 'object' ? h.hold : h;
    return { id: h.id, title: String(h.title || ''), until: String(hold.until || ''), back: String(h.return_day || hold.until || ''), reason: String(hold.reason || '') };
  });
}

/** Desk sub tabs in order; the first one is also the tab that opens with the Desk. */
export const DESK_SUBS = [['bulletin', 'Bulletin Board'], ['desk', 'Work Desk'], ['orders', 'Orders'], ['dashboard', 'Dashboard']];
export const LANDING_SUB = DESK_SUBS[0][0];
