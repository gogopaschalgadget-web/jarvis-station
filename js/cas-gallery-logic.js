import { isSafeId, choiceBody } from './cas-reveal-logic.js?v=cas117';

/** The states a picture the gallery shows can be in: starred first, then kept. Anything else (rejected, not yet answered, unknown) is never shown. */
export const SHOWN_STATES = ['starred', 'kept'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MAX_PICTURES = 400;
const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const whole = v => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);

/** The server's picture list, checked: only well-formed rows in a shown state, each with safe text; starred first, then kept, newest first. Types are strict, nothing is trusted. */
export function normalizeGallery(raw) {
  const list = raw && typeof raw === 'object' && Array.isArray(raw.pictures) ? raw.pictures : [];
  const out = [];
  const seen = new Set();
  for (const p of list) {
    if (out.length >= MAX_PICTURES || !p || typeof p !== 'object') continue;
    const id = typeof p.id === 'string' ? p.id : '';
    if (!isSafeId(id) || seen.has(id) || typeof p.state !== 'string' || !SHOWN_STATES.includes(p.state)) continue;
    seen.add(id);
    out.push({ id, state: p.state, subject: text(p.subject, 60), created: whole(p.created), chosen: whole(p.chosen), width: Math.round(whole(p.width)), height: Math.round(whole(p.height)) });
  }
  return sortGallery(out);
}

/** Starred first, then kept; within each, newest first (by when it was made, then by id so the order never jumps). */
export function sortGallery(list) {
  const rank = p => (p.state === 'starred' ? 0 : 1);
  return [...list].sort((a, b) => rank(a) - rank(b) || b.created - a.created || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** The entry on the Bulletin Board: how many pictures and which is the newest by date (not by star), or none. */
export function galleryEntry(list) {
  const pics = Array.isArray(list) ? list : [];
  if (!pics.length) return { count: 0, newest: null };
  const newest = pics.reduce((a, b) => (b.created > a.created ? b : a));
  return { count: pics.length, newest };
}

export function countWords(n) {
  return n === 1 ? '1 picture' : n + ' pictures';
}

/** A server time in seconds as "21 Nov 2026" (the phone's own calendar), or '' when there is no time. */
export function dateWords(seconds) {
  if (!(typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0)) return '';
  const d = new Date(seconds * 1000);
  return d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear();
}

/** What Chris can do with an open picture: a starred one can be unstarred or rejected, a kept one starred or rejected. */
export function actionsFor(state) {
  if (state === 'starred') return ['unstar', 'reject'];
  if (state === 'kept') return ['star', 'reject'];
  return [];
}

/** The list after a choice the server accepted: rejected is removed, star and unstar change the state, the order is rebuilt. */
export function afterChoice(list, id, choice) {
  const next = { star: 'starred', unstar: 'kept' }[choice];
  const rest = (Array.isArray(list) ? list : []).flatMap(p => (p.id !== id ? [p] : choice === 'reject' ? [] : next ? [{ ...p, state: next }] : [p]));
  return sortGallery(rest);
}

/** The body of a choice from the gallery: only a choice allowed for the picture's state, a reason only for a reject. Null otherwise. */
export function galleryChoiceBody(state, choice, reason) {
  return actionsFor(state).includes(choice) ? choiceBody(choice, reason) : null;
}

/** Thumbnails are fetched a few at a time. */
export const THUMB_PARALLEL = 2;
export const THUMB_WIDTH = 240;
