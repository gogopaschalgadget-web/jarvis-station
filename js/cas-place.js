// cas-place.js - where Chris was on the Desk: the open card, the scroll place and the steps he ticked, kept on this phone only.
// When the app is closed by the phone while he reads another site, it comes back to the same card, the same place, the same ticks.
// Nothing here is sent anywhere. Storage that is missing, full or blocked means no memory, never an error.
export const PLACE_KEY = 'desk-card-place';
export const PLACE_TTL_MS = 12 * 60 * 60 * 1000;   // an older place is not restored: a new day starts fresh
export const MAX_CARDS = 40;
export const MAX_STEPS = 60;
const ID_RE = /^[A-Za-z0-9_.:-]{1,80}$/;

const emptyPlace = () => ({ v: 1, tab: null, open: null, scroll: 0, rel: null, at: 0, ticks: {} });

/** Check what was stored: anything off shape is dropped, never trusted. */
export function cleanPlace(raw) {
  const out = emptyPlace();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.v !== 1) return out;
  out.tab = typeof raw.tab === 'string' && /^[a-z-]{1,24}$/.test(raw.tab) ? raw.tab : null;
  out.open = typeof raw.open === 'string' && ID_RE.test(raw.open) ? raw.open : null;
  out.scroll = Number.isFinite(raw.scroll) && raw.scroll >= 0 && raw.scroll < 1e6 ? Math.round(raw.scroll) : 0;
  out.rel = Number.isFinite(raw.rel) && Math.abs(raw.rel) < 1e6 ? Math.round(raw.rel) : null;   // how far the open card's top is above the top of the list (negative when it is below)
  out.at = Number.isFinite(raw.at) && raw.at > 0 ? raw.at : 0;
  const t = raw.ticks && typeof raw.ticks === 'object' && !Array.isArray(raw.ticks) ? raw.ticks : {};
  for (const id of Object.keys(t).slice(0, MAX_CARDS)) {
    if (!ID_RE.test(id) || !Array.isArray(t[id])) continue;
    const idx = [...new Set(t[id].filter(n => Number.isInteger(n) && n >= 0 && n < MAX_STEPS))].sort((a, b) => a - b);
    if (idx.length) out.ticks[id] = idx;
  }
  return out;
}

const fresh = (p, now) => !!p.at && now >= p.at && now - p.at <= PLACE_TTL_MS;
/** What to bring back for a place read at the start: { id, scroll } when he was on the Desk with a card open, recently, and that card is still open; else null. */
export function restoreTargetOf(place, openIds, now = Date.now()) {
  if (!place || place.tab !== 'desk' || !place.open || !fresh(place, now)) return null;
  return (openIds || []).includes(place.open) ? { id: place.open, scroll: place.scroll, rel: place.rel } : null;
}
/** Should a start go to the Desk: he left it with a card open, recently. */
export const wantsDeskOf = (place, now = Date.now()) => !!place && place.tab === 'desk' && !!place.open && fresh(place, now);

export function makePlaceStore(storage, now = Date.now) {
  let mem = emptyPlace();   // used when storage cannot be read or written: the memory then lasts only while the app stays open
  const load = () => {
    try { const s = storage && storage.getItem(PLACE_KEY); if (s) mem = cleanPlace(JSON.parse(s)); } catch { /* unreadable: keep what is in memory */ }
    return mem;
  };
  const save = () => {
    mem.at = now();
    try { if (storage) storage.setItem(PLACE_KEY, JSON.stringify(mem)); } catch { /* full or blocked: no memory */ }
  };
  const store = {
    /** The whole place, checked. */
    get: () => ({ ...load() }),
    /** The tab he is on (the Desk only matters). */
    setTab(tab) { load(); mem.tab = typeof tab === 'string' ? tab : null; save(); },
    /** The card he opened last, or null when he closed it. Closing clears the scroll too. */
    setOpen(id) {
      load();
      mem.open = typeof id === 'string' && ID_RE.test(id) ? id : null;
      if (!mem.open) { mem.scroll = 0; mem.rel = null; }
      save();
    },
    setScroll(y, rel) {
      load();
      if (Number.isFinite(y) && y >= 0 && y < 1e6) { mem.scroll = Math.round(y); mem.rel = Number.isFinite(rel) && Math.abs(rel) < 1e6 ? Math.round(rel) : null; save(); }
    },
    /** The ticked step numbers (0 based) of one card, as a Set. */
    ticked(id) { return new Set(load().ticks[id] || []); },
    /** Flip one step; returns whether it is ticked now. */
    toggle(id, index) {
      load();
      if (!ID_RE.test(String(id)) || !Number.isInteger(index) || index < 0 || index >= MAX_STEPS) return false;
      const cur = new Set(mem.ticks[id] || []);
      const on = !cur.has(index);
      if (on) cur.add(index); else cur.delete(index);
      if (cur.size) mem.ticks[id] = [...cur].sort((a, b) => a - b); else delete mem.ticks[id];
      const ids = Object.keys(mem.ticks);
      if (ids.length > MAX_CARDS) delete mem.ticks[ids.find(k => k !== id)];
      save();
      return on;
    },
    /** A card is done: forget its ticks, and the place if it was the open one. */
    clearCard(id) {
      load();
      delete mem.ticks[id];
      if (mem.open === id) { mem.open = null; mem.scroll = 0; mem.rel = null; }
      save();
    },
    /** Drop everything that belongs to cards that are not open any more (done, answered, gone). Call only with a real, complete list. */
    prune(openIds) {
      load();
      const keep = new Set(openIds || []);
      let changed = false;
      for (const id of Object.keys(mem.ticks)) if (!keep.has(id)) { delete mem.ticks[id]; changed = true; }
      if (mem.open && !keep.has(mem.open)) { mem.open = null; mem.scroll = 0; mem.rel = null; changed = true; }
      if (changed) save();
    },
    /** The same, read from the place as it is now. */
    restoreTarget(openIds) { return restoreTargetOf(load(), openIds, now()); },
    /** True when a start should go to the Desk: he left it with a card open, recently. */
    wantsDesk() { return wantsDeskOf(load(), now()); },
    /** Forget everything (signing out). */
    forget() { mem = emptyPlace(); try { if (storage) storage.removeItem(PLACE_KEY); } catch { /* nothing to forget */ } },
  };
  return store;
}
