// Puts real status on the 3D map. Data comes only from the Station page that opened this frame.
// Old data never stays lit: after 10 minutes without a report every light goes back to not reported.
(function () {
  const STALE_MS = 600000;
  const LIGHT = { working: [0x3fd07f, 1.6], waiting: [0xf0b040, 1.2], idle: [0x4a8a78, 0.7], blocked: [0xd03030, 1.8], error: [0xd03030, 1.8], paused: [0x8a6a3a, 0.5], unknown: [0x6a5a3a, 0.35] };
  const ROOMS = ['content', 'traffic'];
  const CARD_LIT = 0xd8c9a0;
  const CARD_DARK = 0x2a2620;

  const shared = window.STATION_STATUS;
  const tag = document.getElementById('map3d-tag');
  const future = {};
  const cards = {};
  const rooms = {};
  let latest = null;
  let applied = '';
  let wasDemo = false;

  function clean(state) {
    return Object.prototype.hasOwnProperty.call(LIGHT, state) ? state : 'unknown';
  }

  function room(id) {
    if (rooms[id]) return rooms[id];
    const base = window.armyBaseInstance;
    const interior = base && base.interiors ? base.interiors[id] : null;
    if (interior) interior.traverse(item => { if (!rooms[id] && item.userData.live) rooms[id] = item; });
    return rooms[id] || null;
  }

  function demoRunning() {
    return !!(window.StationDemo && StationDemo.info().duration > 0);
  }

  function ageMs() {
    return latest ? Date.now() - Date.parse(latest.updated_at) : Infinity;
  }

  function agoText(ms) {
    const minutes = Math.max(0, Math.floor(ms / 60000));
    if (minutes < 1) return 'JUST NOW';
    return minutes < 120 ? `${minutes} MIN AGO` : `${Math.floor(minutes / 60)} HR AGO`;
  }

  function setTag(mode, text) {
    if (!tag || tag.textContent === text) return;
    tag.textContent = text;
    tag.dataset.mode = mode;
  }

  function showTag() {
    if (demoRunning()) setTag('demo', 'DEMO: NOT REAL ACTIVITY');
    else if (!latest) setTag('none', 'NO LIVE DATA');
    else if (ageMs() > STALE_MS) setTag('stale', `PC NOT REPORTING: LAST DATA ${agoText(ageMs())}`);
    else setTag('live', `LIVE: CONTENT, TRAFFIC (${agoText(ageMs())})`);
  }

  function light(mesh, state) {
    if (!mesh || !mesh.material) return;
    const [color, glow] = LIGHT[clean(state)];
    mesh.material.color.setHex(color);
    mesh.material.emissive.setHex(color);
    mesh.material.emissiveIntensity = Math.max(glow, 0.5);
  }

  function find(root, name) {
    let found = null;
    root.traverse(item => { if (!found && item.name === name) found = item; });
    return found;
  }

  function setCards(root, count) {
    root.traverse(item => {
      if (!item.name.startsWith('board card ')) return;
      if (!cards.lit) {
        cards.lit = item.material.clone();
        cards.lit.color.setHex(CARD_LIT);
        cards.lit.emissive.setHex(CARD_LIT);
        cards.lit.emissiveIntensity = 0.3;
        cards.dark = item.material.clone();
        cards.dark.color.setHex(CARD_DARK);
        cards.dark.emissive.setHex(0);
        cards.dark.emissiveIntensity = 0;
      }
      item.material = Number(item.name.slice('board card '.length)) < count ? cards.lit : cards.dark;
    });
  }

  function applyRoom(id, report) {
    const root = room(id);
    if (!root) return;
    const stages = root.userData.live.stages;
    future[id] = future[id] || Object.keys(stages).filter(key => stages[key].state === 'future');
    Object.keys(stages).forEach(key => {
      if (future[id].includes(key)) return;
      const reported = report.stages && report.stages[key];
      root.userData.live.setStage(key, clean(reported && reported.state));
    });
    (report.services || []).forEach(item => light(find(root, `heartbeat ${item.name}`), item.state));
    Object.entries(report.platforms || {}).forEach(([name, state]) => light(find(root, `platform lamp ${name}`), state));
    if (id === 'content') setCards(root, Number.isInteger(report.queue) ? report.queue : 0);
  }

  // "Waiting on you": only from fresh data, and the tap asks the Station to open the right screen.
  const needs = document.createElement('button');
  needs.type = 'button';
  needs.id = 'map3d-needs';
  needs.hidden = true;
  const needsTitle = document.createElement('strong');
  const needsCounts = document.createElement('span');
  needs.append(needsTitle, needsCounts);
  needs.addEventListener('click', () => {
    const waiting = latest && latest.waiting;
    if (!waiting || window.parent === window) return;
    window.parent.postMessage({ type: 'open-review', which: waiting.x > 0 ? 'x' : 'reddit' }, window.location.origin);
  });
  document.body.append(needs);

  function showNeeds(fresh) {
    const waiting = fresh && latest && latest.waiting;
    const total = waiting ? (waiting.x || 0) + (waiting.reddit || 0) : 0;
    needs.hidden = !total;
    if (!total) return;
    const parts = [];
    if (waiting.x) parts.push(`${waiting.x} X ${waiting.x === 1 ? 'post' : 'posts'}`);
    if (waiting.reddit) parts.push(`${waiting.reddit} Reddit`);
    needsTitle.textContent = waiting.xPaused ? 'Paused: waiting on you' : 'Waiting on you';
    needsCounts.textContent = parts.join(', ');
  }

  function publish(fresh) {
    if (!shared || !shared.loops) return;
    shared.feed = fresh ? 'live' : 'not reporting';
    shared.feed_note = fresh ? 'Live from the Station.' : 'The PC has not reported for over 10 minutes.';
    shared.updated_at = latest.updated_at;
    shared.updated_by = 'the PC';
    ROOMS.forEach(id => {
      if (!shared.loops[id]) return;
      Object.assign(shared.loops[id], fresh ? latest.loops[id] : { stages: {}, queue: null, platforms: null });
    });
  }

  function apply() {
    const demo = demoRunning();
    if (wasDemo && !demo) applied = '';
    wasDemo = demo;
    showTag();
    if (demo || !latest) return;
    const fresh = ageMs() <= STALE_MS;
    showNeeds(fresh);
    const signature = JSON.stringify([fresh, latest.loops, latest.waiting]);
    if (signature === applied) return;
    applied = signature;
    ROOMS.forEach(id => applyRoom(id, fresh ? (latest.loops[id] || {}) : allUnknown(id)));
    publish(fresh);
  }

  // Lamps with their own reporter need an explicit "unknown" once the data has gone old.
  function allUnknown(id) {
    const root = room(id);
    const off = { stages: {}, queue: null, services: [], platforms: {} };
    if (!root) return off;
    root.traverse(item => {
      if (item.name.startsWith('heartbeat ')) off.services.push({ name: item.name.slice('heartbeat '.length), state: 'unknown' });
      if (item.name.startsWith('platform lamp ')) off.platforms[item.name.slice('platform lamp '.length)] = 'unknown';
    });
    return off;
  }

  window.addEventListener('message', event => {
    if (event.origin !== window.location.origin || event.source !== window.parent) return;
    const data = event.data;
    if (!data || data.type !== 'station-status' || !data.status || !data.status.loops) return;
    if (!Number.isFinite(Date.parse(data.status.updated_at))) return;
    latest = data.status;
    apply();
  });

  setInterval(apply, 1000);
  showTag();
  if (window.parent !== window) window.parent.postMessage({ type: 'map3d-ready' }, window.location.origin);
})();
