// cas-screen.js - sends layout facts of this phone to the server so the shell can be fixed on the real screen.
// Numbers and short labels only: sizes, safe-area insets, where the bars and panels sit, the active tab, the cache version
// and the browser's user agent. One report when the Station loads, then at most one more per tab change (20 s apart, 6 per
// load). A failure is dropped: no retry, no loop. Writes with the device login; the PC reads it. No em dashes.

const MIN_GAP_MS = 20_000;
const MAX_SENDS = 6;
const TIMEOUT_MS = 10_000;
let _o = { apiBase: '', getToken: () => '', getTab: () => '' };
let _sent = 0;
let _last = 0;
let _busy = false;

const r1 = n => Math.round(n * 100) / 100;

function rect(node) {
  if (!node) return null;
  const b = node.getBoundingClientRect();
  return { t: r1(b.top), l: r1(b.left), w: r1(b.width), h: r1(b.height) };
}

/** A throw-away probe: heights in the browser's viewport units, and the four safe-area insets. */
function probe() {
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;left:0;top:0;width:1px;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
  const mk = h => { const d = document.createElement('div'); d.style.cssText = `position:fixed;left:0;top:0;width:1px;height:${h}`; box.append(d); return d; };
  const kids = { vh: mk('100vh'), dvh: mk('100dvh'), svh: mk('100svh'), lvh: mk('100lvh'), pct: mk('100%') };
  document.body.append(box);
  try {
    const cs = getComputedStyle(box);
    const insets = { top: parseFloat(cs.paddingTop) || 0, right: parseFloat(cs.paddingRight) || 0, bottom: parseFloat(cs.paddingBottom) || 0, left: parseFloat(cs.paddingLeft) || 0 };
    const probes = {};
    for (const [k, d] of Object.entries(kids)) probes[k] = r1(d.getBoundingClientRect().height);
    return { insets, probes };
  } finally {
    box.remove();
  }
}

/** iOS installed-app fault (seen on Chris's iPhone, 2026-11-16): with the translucent status bar the page is laid out as tall as
 *  the screen minus the top inset (812 on an 874 screen), so everything pinned to the bottom sits that far too high and a
 *  strip shows under the nav. When that exact pattern is seen (installed app, narrow screen, screen minus inner height equals
 *  the top inset), the strip height is put in --short, and the CSS moves the nav down by it and shortens the panels to match.
 *  Anywhere else --short stays 0 and nothing moves. Worked out once at load, on show and on rotation: never on resize, so the
 *  keyboard cannot trigger it. */
let _shortLatched = null;
let _guardTripped = 0;   // 1 when the self-check found the moved bar could not be tapped and put it back
const OFF_KEY = 'station-short-off';
function switchedOff() { try { return localStorage.getItem(OFF_KEY) === '1'; } catch { return false; } }
function measureShort() {
  if (_guardTripped || switchedOff()) return 0;
  const standalone = !!(navigator.standalone || (window.matchMedia && matchMedia('(display-mode: standalone)').matches));
  if (!standalone || window.innerWidth >= 960 || !window.CSS || !CSS.supports('top', 'env(safe-area-inset-top)')) return 0;
  const { insets } = probe();
  const gap = Math.round(screen.height - window.innerHeight);
  const top = Math.round(insets.top);
  // never more than the bar is tall minus 20px, so a wrong reading cannot push the bar off the screen
  return top >= 20 && Math.abs(gap - top) <= 2 && gap <= 70 ? gap : 0;
}
function setShort(px) {
  _shortLatched = px;
  document.documentElement.style.setProperty('--short', px + 'px');
  document.documentElement.classList.toggle('ios-short', px > 0);
}
/** Self-check: when the bar has been moved, the middle of it must be reachable by touch. If the phone cannot hit-test there
 *  (the bar is outside what iOS counts as the page), the move is undone at once and stays undone until the next load. */
function guardShift() {
  if (!_shortLatched) return;
  try {
    const nav = document.getElementById('station-nav');
    if (!nav) return;
    const b = nav.getBoundingClientRect();
    const hit = document.elementFromPoint(Math.round(b.left + b.width / 2), Math.round(b.top + Math.min(24, b.height / 2)));
    if (!hit || !nav.contains(hit)) { _guardTripped = 1; setShort(0); }
  } catch { _guardTripped = 1; setShort(0); }
}
function applyShort() {
  try {
    setShort(measureShort());
    if (_shortLatched) setTimeout(guardShift, 250);
  } catch { /* leave the layout as it is */ }
}
/** Press and hold the title for a second: turns the shift off (or back on), remembered on this phone. The way out if the
 *  moved bar ever cannot be used, since it does not need the bar. */
function initShortSwitch() {
  const title = document.querySelector('.station-title');
  if (!title) return;
  let timer = 0;
  const cancel = () => { clearTimeout(timer); timer = 0; };
  title.addEventListener('pointerdown', () => {
    cancel();
    timer = setTimeout(() => {
      timer = 0;
      try { if (switchedOff()) localStorage.removeItem(OFF_KEY); else localStorage.setItem(OFF_KEY, '1'); } catch { /* no memory: still switches for this load */ }
      _guardTripped = switchedOff() ? 0 : _guardTripped;
      applyShort();
      title.style.opacity = '.55'; setTimeout(() => { title.style.opacity = ''; }, 350);
    }, 1000);
  });
  ['pointerup', 'pointercancel', 'pointerleave', 'pointermove'].forEach(ev => title.addEventListener(ev, cancel));
}
export function initShortFix() {
  applyShort();
  initShortSwitch();
  window.addEventListener('pageshow', applyShort);
  // iOS can report a transient height at cold launch: measure again shortly after, and when the app comes back to the front
  setTimeout(applyShort, 300); setTimeout(applyShort, 1500);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) setTimeout(applyShort, 200); });
  window.addEventListener('orientationchange', () => setTimeout(applyShort, 350));
}

async function swVersion() {
  try {
    const keys = await caches.keys();
    // while a new service worker installs, two caches exist: report the highest version
    const mine = keys.filter(k => k.startsWith('jarvis-cas')).sort((a, b) => (parseInt(a.replace(/\D/g, ''), 10) || 0) - (parseInt(b.replace(/\D/g, ''), 10) || 0));
    return (mine[mine.length - 1] || '').slice(0, 40);
  } catch { return ''; }
}

async function build() {
  const vv = window.visualViewport;
  const { insets, probes } = probe();
  const rects = {};
  const add = (name, node) => { const r = rect(node); if (r) rects[name] = r; };
  add('nav', document.getElementById('station-nav'));
  add('header', document.querySelector('.station-header'));
  add('metrics', document.getElementById('metrics-bar'));
  add('main', document.getElementById('station-main'));
  add('body', document.body);
  add('html', document.documentElement);
  // fix probe: t = strip height the fix applied, l = 1 if the very bottom row of the real screen is hit-testable, w = 1 if Chris switched the shift off, h = 1 if the self-check put the bar back
  try {
    const low = document.elementFromPoint(Math.round(window.innerWidth / 2), Math.max(0, Math.round(screen.height) - 6));
    rects.fix = { t: _shortLatched == null ? -1 : _shortLatched, l: low ? 1 : 0, w: switchedOff() ? 1 : 0, h: _guardTripped };
  } catch { /* no probe */ }
  document.querySelectorAll('.tab-panel.visible').forEach(p => { if (p.id && Object.keys(rects).length < 14) add(p.id, p); });
  return {
    inner: [window.innerWidth, window.innerHeight], screen: [screen.width, screen.height], avail: [screen.availWidth, screen.availHeight],
    dpr: window.devicePixelRatio, standalone: !!(navigator.standalone || (window.matchMedia && matchMedia('(display-mode: standalone)').matches)),
    vv: vv ? { w: r1(vv.width), h: r1(vv.height), scale: r1(vv.scale), offTop: r1(vv.offsetTop), offLeft: r1(vv.offsetLeft) } : undefined,
    insets, probes, docH: document.documentElement.scrollHeight, docW: document.documentElement.scrollWidth, scrollY: r1(window.scrollY || 0),
    rects, tab: String(_o.getTab() || '').slice(0, 24), sw: await swVersion(), ua: navigator.userAgent.slice(0, 220),
  };
}

/** Send one report now (or skip: too soon, too many, no login, one already going). */
export async function sendScreenReport() {
  const token = _o.getToken();
  if (!token || _busy || _sent >= MAX_SENDS || Date.now() - _last < MIN_GAP_MS) return;
  _busy = true;
  _last = Date.now();
  _sent += 1;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    await fetch(`${_o.apiBase}/api/station/screen`, {
      method: 'POST', signal: ctl.signal,
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify(await build()),
    });
  } catch { /* dropped on purpose: no retry */ } finally {
    clearTimeout(timer);
    _busy = false;
  }
}

export function initScreenReport(options) {
  _o = { ..._o, ...options };
  setTimeout(sendScreenReport, 2500);     // after the first layout has settled
}
