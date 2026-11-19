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
