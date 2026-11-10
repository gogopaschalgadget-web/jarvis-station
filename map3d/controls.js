// Phone controls for the 3D map: two fingers move and zoom, and there is always a visible way out of a room.
(function () {
  const base = window.armyBaseInstance;
  const canvas = document.querySelector('[data-ab="view"]');
  const status = document.querySelector('[data-ab="status"]');
  if (!base || !base.getView || !canvas) return;

  const HOME_TARGET = [0, 3, 6];
  const HOME_DISTANCE = 58;
  const LEAVE_ROOM_AT = 22;
  const ROOM_CLOSEST = 5;
  const STREET_CLOSEST = 9;
  const STREET_FARTHEST = 100;
  const STREET_REACH = 70;
  const ROOM_REACH = 9;
  const NOTE_MS = 2600;

  const WORDS = [
    [/^Move mode/, 'Drag it until its sidewalk meets another building'],
    [/^Valid sidewalk/, 'Lined up. Let go to place it here'],
    [/^No valid sidewalk/, 'Not lined up yet. Letting go puts it back'],
    [/connection saved/, 'Moved and saved'],
    [/previous position restored/, 'It did not line up, so it went back'],
    [/^Touch move cancelled/, 'Move cancelled. It went back'],
    [/^Hold released/, 'Not moved'],
  ];

  const fingers = new Map();
  let pair = null;

  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const demoRunning = () => !!(window.StationDemo && StationDemo.info().duration > 0);

  function measure() {
    const [a, b] = [...fingers.values()];
    return { span: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  function holdInReach(view, x, z) {
    if (!view.inside) return [clamp(x, -STREET_REACH, STREET_REACH), clamp(z, -STREET_REACH, STREET_REACH)];
    const room = base.buildingPos(view.inside);
    return [clamp(x, room[0] - ROOM_REACH, room[0] + ROOM_REACH), clamp(z, room[1] - ROOM_REACH, room[1] + ROOM_REACH)];
  }

  function moveCamera(now) {
    const view = base.getView();
    const distance = view.distance * pair.span / now.span;
    if (view.inside && distance > LEAVE_ROOM_AT) {
      base.home();
      pair.finished = true;
      return;
    }
    const closest = view.inside ? ROOM_CLOSEST : STREET_CLOSEST;
    const nextDistance = clamp(distance, closest, STREET_FARTHEST);
    const metres = 2 * view.distance * Math.tan(Math.PI / 8) / Math.max(1, canvas.clientHeight);
    const depth = metres / Math.max(Math.sin(view.pitch), 0.35);
    const dx = now.x - pair.x;
    const dy = now.y - pair.y;
    const sin = Math.sin(view.yaw);
    const cos = Math.cos(view.yaw);
    const [x, z] = holdInReach(view, view.target[0] - cos * dx * metres - sin * dy * depth, view.target[2] + sin * dx * metres - cos * dy * depth);
    base.view(view.yaw, view.pitch, nextDistance, [x, view.target[1], z]);
  }

  // These run before the map's own touch handling, which only understands one finger.
  function onDown(event) {
    if (event.pointerType !== 'touch' || event.target !== canvas) return;
    fingers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (fingers.size < 2) return;
    event.stopImmediatePropagation();
    if (pair || demoRunning()) return;
    base.touchStop('two-fingers');
    pair = { ...measure(), finished: false };
  }

  function onMove(event) {
    if (!fingers.has(event.pointerId)) return;
    fingers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (!pair) return;
    event.stopImmediatePropagation();
    if (pair.finished || fingers.size < 2) return;
    const now = measure();
    moveCamera(now);
    Object.assign(pair, now);
  }

  function onUp(event) {
    if (!fingers.has(event.pointerId)) return;
    fingers.delete(event.pointerId);
    if (!pair) return;
    event.stopImmediatePropagation();
    if (fingers.size === 0) pair = null;
    else pair.finished = true;
  }

  document.addEventListener('pointerdown', onDown, true);
  document.addEventListener('pointermove', onMove, true);
  document.addEventListener('pointerup', onUp, true);
  document.addEventListener('pointercancel', onUp, true);
  ['gesturestart', 'gesturechange'].forEach(name => document.addEventListener(name, event => event.preventDefault()));

  canvas.addEventListener('wheel', () => {
    const view = base.getView();
    if (view.inside && view.distance > LEAVE_ROOM_AT && !demoRunning()) base.home();
  }, { passive: true });

  const back = document.createElement('button');
  back.type = 'button';
  back.id = 'map3d-back';
  back.hidden = true;
  back.addEventListener('click', () => base.home());
  document.body.append(back);

  const note = document.createElement('div');
  note.id = 'map3d-note-line';
  note.setAttribute('role', 'status');
  note.hidden = true;
  document.body.append(note);

  // The map's own Cancel button sits in a strip the phone layout hides.
  const cancelMove = document.querySelector('.touch-cancel');
  if (cancelMove) document.body.append(cancelMove);

  let noteTimer = null;
  function showNote(text) {
    note.textContent = text;
    note.hidden = false;
    clearTimeout(noteTimer);
    noteTimer = setTimeout(() => { note.hidden = true; }, NOTE_MS);
  }

  if (status) {
    new MutationObserver(() => {
      const match = WORDS.find(([pattern]) => pattern.test(status.textContent));
      if (match) showNote(match[1]);
    }).observe(status, { childList: true, characterData: true, subtree: true });
  }

  function refresh() {
    const view = base.getView();
    document.body.dataset.inside = view.inside ? 'yes' : 'no';
    document.body.dataset.moving = view.touch === 'moving' ? 'yes' : 'no';
    const away = view.distance !== HOME_DISTANCE || view.target.some((value, index) => value !== HOME_TARGET[index]);
    const label = view.inside ? 'Back to street' : 'Center map';
    if (back.textContent !== label) back.textContent = label;
    back.hidden = !view.inside && !away;
  }

  setInterval(refresh, 150);
  refresh();
})();
