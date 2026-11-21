export const ROWS = [['command', 'Command'], ['production', 'Production'], ['channels', 'Channels']];

/** One list of places, names as on the 3D map. `built` is false for blueprint tiles (not on the 3D map yet). Moves to the server when the 3D map reads it too. */
export const PLACES = [
  { id: 'spire', name: 'Spire', row: 'command', built: true, projects: ['cas', 'station'], loops: [] },
  { id: 'library', name: 'Library', row: 'command', built: true, projects: [], loops: [] },
  { id: 'workshop', name: 'Workshop', row: 'command', built: true, projects: ['station-3d'], loops: [] },
  { id: 'mint', name: 'The Mint', row: 'production', built: true, projects: ['veteran-prints'], loops: ['veteran_prints'] },
  { id: 'content-engine', name: 'Content Engine', row: 'production', built: true, projects: [], loops: ['x_drafts'] },
  { id: 'traffic-control', name: 'Traffic Control', row: 'production', built: true, projects: [], loops: [] },
  { id: 'x', name: 'X', row: 'channels', built: true, projects: ['x-posts'], loops: ['x_posts'] },
  { id: 'gumroad', name: 'Gumroad', row: 'channels', built: false, projects: ['tradespro'], loops: ['tradespro_store'] },
  { id: 'github-pages', name: 'GitHub Pages', row: 'channels', built: false, projects: ['tradespro-site'], loops: ['tradespro_site'] },
  { id: 'reddit', name: 'Reddit', row: 'channels', built: false, projects: ['reddit', 'reddit-posts'], loops: ['reddit_posts'] },
  { id: 'quora', name: 'Quora', row: 'channels', built: false, projects: ['quora'], loops: ['quora_answers'] },
];
export const BENCH = { id: 'bench', name: 'General Bench', row: 'bench', built: true, projects: [], loops: [] };

/** The tile a card sits on: its project's place, else the general bench. */
export function tileFor(item) {
  const project = item && typeof item.project === 'string' ? item.project : '';
  const place = PLACES.find(p => p.projects.includes(project));
  return place ? place.id : BENCH.id;
}

/** Card ids per tile, in the given order. */
export function tileBuckets(ids, items) {
  const map = new Map([...PLACES, BENCH].map(p => [p.id, []]));
  ids.forEach(id => { const item = items.get(id); if (item) map.get(tileFor(item)).push(id); });
  return map;
}

/** Real loops that belong to a place, matched by loop id. */
export function loopsFor(place, loops) {
  return (Array.isArray(loops) ? loops : []).filter(l => l && place.loops.includes(l.id));
}

/** One state lamp for a tile, from its loops only; 'none' means not reported. Blocked beats waiting beats running. */
export function lampFor(place, loops) {
  if (!place.built) return 'none';
  const states = loopsFor(place, loops).map(l => l.status);
  if (states.includes('blocked')) return 'blocked';
  if (states.includes('waiting_you')) return 'waiting';
  if (states.includes('running')) return 'running';
  return 'none';
}

/** The tile filter after a jump to a card: kept only if the card sits on that tile, else cleared so the card is drawn. */
export function tileAfterJump(tile, item) {
  return tile && tileFor(item) === tile ? tile : null;
}

/** The card ids actually drawn: all of them, or only those on the open tile. */
export function viewFor(ids, items, tile) {
  return tile ? (tileBuckets(ids, items).get(tile) || []) : ids;
}

const ART = { spire: 'spire', library: 'library', workshop: 'workshop', mint: 'mint', 'content-engine': 'content', 'traffic-control': 'traffic', x: 'x', bench: 'bench' };
export const THEME_DIR = 'assets/themes/forge-and-brass/tiles/';

/** The painted picture for a tile: its own when built, the blueprint picture when not; null when none is listed. */
export function tileArt(place) {
  if (!place) return null;
  const name = place.built ? ART[place.id] : 'blueprint';
  return name ? THEME_DIR + name + '.jpg' : null;
}
