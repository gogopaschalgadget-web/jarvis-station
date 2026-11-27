// The eight celebrations a creature plays when a card is finished (sheet 9.3). All are run by code on the existing still; none needs new art.
// The same one plays for a small card and a big card (the XP chip is the only difference). Never the same twice in a row.
export const EMOTES = [
  { key: 'spin', name: 'Spin and pose' },
  { key: 'thump', name: 'Chest thump' },
  { key: 'shuffle', name: 'Cog shuffle' },
  { key: 'hop3', name: 'Triple hop' },
  { key: 'slide', name: 'Backslide' },
  { key: 'shimmy', name: 'Big shimmy' },
  { key: 'drum', name: 'Ground drum' },
  { key: 'landing', name: 'Hero landing' },
];
export const EMOTE_MS = 3000;
export const HATCH_MS = 6000;

/** A random celebration that is not `previousKey`. `rnd` gives a number in [0, 1). */
export function nextEmote(previousKey, rnd = Math.random) {
  const pool = EMOTES.filter(e => e.key !== previousKey);
  const n = Number(rnd());
  const i = Number.isFinite(n) ? Math.min(pool.length - 1, Math.max(0, Math.floor(n * pool.length))) : 0;
  return pool[i];
}

export const emoteClass = e => (e && EMOTES.some(x => x.key === e.key) ? 'emote-' + e.key : '');

/** The words for the celebration's overlay, from the XP the server says was paid: "+100 XP" or '' when none. */
export function cheerWords(xpGained) {
  return Number.isInteger(xpGained) && xpGained > 0 && xpGained < 100000 ? `+${xpGained} XP` : '';
}
