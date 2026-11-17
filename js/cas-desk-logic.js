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
