// renderer.js - Core Canvas 2D engine with isometric transforms and touch gestures
// ES Module. No em-dashes. No credentials.

import { ROOM_COLORS, ROOMS } from './rooms.js';

// --- CONSTANTS ---
const TILE_W = 180;   // base tile width in iso space
const TILE_H = 100;   // base tile height in iso space
const GAP = 8;         // gap between tiles
const MIN_ZOOM = 0.4;
const MAX_ZOOM = 4.0;
const ZOOM_THRESHOLD_MID = 1.5;
const ZOOM_THRESHOLD_MICRO = 3.0;

// --- STATE ---
const state = {
  canvas: null,
  ctx: null,
  dpr: 1,
  width: 0,
  height: 0,
  panX: 0,
  panY: 0,
  zoom: 0.85,
  selectedRoom: null,
  apiData: null,
  needsRedraw: true,
  // touch tracking
  touches: [],
  lastPinchDist: 0,
  isPanning: false,
  panStartX: 0,
  panStartY: 0,
  panOffsetStartX: 0,
  panOffsetStartY: 0,
  tapStartTime: 0,
  tapStartPos: { x: 0, y: 0 },
};

// --- INIT ---
export function initRenderer(canvasEl) {
  state.canvas = canvasEl;
  state.ctx = canvasEl.getContext('2d');
  state.dpr = window.devicePixelRatio || 1;

  resize();
  window.addEventListener('resize', resize);
  centerView();

  // iOS Safari settles the viewport (toolbar, safe-area) after init, so the
  // initial parent height can be wrong. Re-sync the canvas whenever the map
  // container actually changes size, not just on window resize.
  if (window.ResizeObserver) {
    const ro = new ResizeObserver(function () { resize(); centerView(); });
    ro.observe(state.canvas.parentElement);
  }
  window.addEventListener('orientationchange', function () { resize(); centerView(); });

  setupTouchHandlers(canvasEl);
  setupMouseHandlers(canvasEl);
  requestAnimationFrame(drawLoop);
}

function resize() {
  const rect = state.canvas.parentElement.getBoundingClientRect();
  state.width = rect.width;
  state.height = rect.height;
  state.canvas.width = rect.width * state.dpr;
  state.canvas.height = rect.height * state.dpr;
  state.canvas.style.width = rect.width + 'px';
  state.canvas.style.height = rect.height + 'px';
  state.needsRedraw = true;
}

function centerView() {
  // Center the 3x3 grid in the viewport
  state.panX = state.width / 2;
  state.panY = state.height * 0.38;
  state.needsRedraw = true;
}

// --- COORDINATE TRANSFORMS ---
export function gridToIso(row, col) {
  const tw = TILE_W + GAP;
  const th = TILE_H + GAP;
  const x = (col - row) * tw * 0.5;
  const y = (col + row) * th * 0.5;
  return { x, y };
}

function screenToWorld(sx, sy) {
  const wx = (sx - state.panX) / state.zoom;
  const wy = (sy - state.panY) / state.zoom;
  return { x: wx, y: wy };
}

// --- HIT TESTING ---
export function hitTestRoom(screenX, screenY) {
  const world = screenToWorld(screenX, screenY);
  for (const room of ROOMS) {
    const iso = gridToIso(room.row, room.col);
    // Diamond hit test
    const dx = (world.x - iso.x) / (TILE_W * 0.5);
    const dy = (world.y - iso.y) / (TILE_H * 0.5);
    if (Math.abs(dx) + Math.abs(dy) <= 1.0) {
      return room;
    }
  }
  return null;
}

// --- TOUCH HANDLERS ---
function setupTouchHandlers(el) {
  el.addEventListener('touchstart', onTouchStart, { passive: false });
  el.addEventListener('touchmove', onTouchMove, { passive: false });
  el.addEventListener('touchend', onTouchEnd, { passive: false });
  el.addEventListener('touchcancel', onTouchEnd, { passive: false });
}

function onTouchStart(e) {
  e.preventDefault();
  const touches = Array.from(e.touches);
  state.touches = touches;

  if (touches.length === 1) {
    state.isPanning = true;
    state.panStartX = touches[0].clientX;
    state.panStartY = touches[0].clientY;
    state.panOffsetStartX = state.panX;
    state.panOffsetStartY = state.panY;
    state.tapStartTime = Date.now();
    state.tapStartPos = { x: touches[0].clientX, y: touches[0].clientY };
  } else if (touches.length === 2) {
    state.isPanning = false;
    state.lastPinchDist = pinchDistance(touches);
  }
}

function onTouchMove(e) {
  e.preventDefault();
  const touches = Array.from(e.touches);

  if (touches.length === 1 && state.isPanning) {
    const dx = touches[0].clientX - state.panStartX;
    const dy = touches[0].clientY - state.panStartY;
    state.panX = state.panOffsetStartX + dx;
    state.panY = state.panOffsetStartY + dy;
    state.needsRedraw = true;
  } else if (touches.length === 2) {
    const dist = pinchDistance(touches);
    if (state.lastPinchDist > 0) {
      const scale = dist / state.lastPinchDist;
      const mid = pinchMidpoint(touches);
      zoomAt(mid.x, mid.y, state.zoom * scale);
    }
    state.lastPinchDist = dist;
  }
}

function onTouchEnd(e) {
  e.preventDefault();
  if (state.touches.length === 1 && e.touches.length === 0) {
    const dt = Date.now() - state.tapStartTime;
    const dx = Math.abs(state.tapStartPos.x - state.touches[0].clientX);
    const dy = Math.abs(state.tapStartPos.y - state.touches[0].clientY);
    if (dt < 300 && dx < 15 && dy < 15) {
      handleTap(state.tapStartPos.x, state.tapStartPos.y);
    }
  }
  state.touches = Array.from(e.touches);
  state.isPanning = false;
  state.lastPinchDist = 0;
}

function pinchDistance(touches) {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

function pinchMidpoint(touches) {
  return {
    x: (touches[0].clientX + touches[1].clientX) / 2,
    y: (touches[0].clientY + touches[1].clientY) / 2,
  };
}

// --- MOUSE HANDLERS (desktop fallback) ---
function setupMouseHandlers(el) {
  let mouseDown = false;
  let mx = 0, my = 0, osx = 0, osy = 0;

  el.addEventListener('mousedown', (e) => {
    mouseDown = true;
    mx = e.clientX; my = e.clientY;
    osx = state.panX; osy = state.panY;
    state.tapStartTime = Date.now();
    state.tapStartPos = { x: e.clientX, y: e.clientY };
  });

  el.addEventListener('mousemove', (e) => {
    if (!mouseDown) return;
    state.panX = osx + (e.clientX - mx);
    state.panY = osy + (e.clientY - my);
    state.needsRedraw = true;
  });

  el.addEventListener('mouseup', (e) => {
    if (mouseDown) {
      const dt = Date.now() - state.tapStartTime;
      const dx = Math.abs(e.clientX - state.tapStartPos.x);
      const dy = Math.abs(e.clientY - state.tapStartPos.y);
      if (dt < 300 && dx < 10 && dy < 10) {
        handleTap(e.clientX, e.clientY);
      }
    }
    mouseDown = false;
  });

  el.addEventListener('wheel', (e) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    zoomAt(e.clientX, e.clientY, state.zoom * factor);
  }, { passive: false });
}

// --- ZOOM ---
function zoomAt(sx, sy, newZoom) {
  newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoom));
  const worldBefore = screenToWorld(sx, sy);
  state.zoom = newZoom;
  const worldAfter = screenToWorld(sx, sy);
  state.panX += (worldAfter.x - worldBefore.x) * state.zoom;
  state.panY += (worldAfter.y - worldBefore.y) * state.zoom;
  state.needsRedraw = true;
}

// --- TAP HANDLER ---
let onRoomTap = null;
export function setRoomTapHandler(fn) { onRoomTap = fn; }

function handleTap(sx, sy) {
  const headerH = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--header-height')) || 44;
  const room = hitTestRoom(sx, sy - headerH);
  if (room && onRoomTap) {
    onRoomTap(room);
  }
}

// --- DRAW LOOP ---
let drawCallback = null;
export function setDrawCallback(fn) { drawCallback = fn; }

function drawLoop() {
  if (state.needsRedraw) {
    const ctx = state.ctx;
    ctx.save();
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    ctx.clearRect(0, 0, state.width, state.height);

    // Apply pan and zoom
    ctx.translate(state.panX, state.panY);
    ctx.scale(state.zoom, state.zoom);

    if (drawCallback) {
      drawCallback(ctx, state.zoom);
    }

    ctx.restore();
    state.needsRedraw = false;
  }
  requestAnimationFrame(drawLoop);
}

// --- PUBLIC STATE ACCESS ---
export function getZoom() { return state.zoom; }
export function setApiData(data) { state.apiData = data; state.needsRedraw = true; }
export function getApiData() { return state.apiData; }
export function requestRedraw() { state.needsRedraw = true; }
export function resetView() { centerView(); state.zoom = 0.85; state.needsRedraw = true; }

export { TILE_W, TILE_H, ZOOM_THRESHOLD_MID, ZOOM_THRESHOLD_MICRO };
