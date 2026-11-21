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
  const states = loopsFor(place, loops).map(l => l.status);
  if (states.includes('blocked')) return 'blocked';
  if (states.includes('waiting_you')) return 'waiting';
  if (states.includes('running')) return 'running';
  return 'none';
}
