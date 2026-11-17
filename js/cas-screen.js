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

/** iOS installed-app fault (WebKit bug 301994, seen on Chris's iPhone 2026-11-16): with the translucent status bar the page is
 *  laid out as tall as the screen minus the top inset (812 on an 874 screen). The bottom 62pt belong to the system: web content
 *  cannot be drawn there, and a frosted system layer covers the top 62 plus a little. When that exact pattern is seen (installed
 *  app, narrow screen, screen minus inner height equals the top inset), html gets the class ios-short and the CSS drops the
 *  bottom inset from the bar (the home indicator lives in the system strip) and moves the title below the frost (read from the phone's ruler, v77: sharp from about 100pt). Class only: nothing here changes any size, so
 *  re-measuring cannot feed back into the measurement. */
let _fault = null;
function detectFault() {
  const standalone = !!(navigator.standalone || (window.matchMedia && matchMedia('(display-mode: standalone)').matches));
  if (!standalone || window.innerWidth >= 960 || !window.CSS || !CSS.supports('top', 'env(safe-area-inset-top)')) return false;
  const { insets } = probe();
  const gap = Math.round(screen.height - window.innerHeight);
  const top = Math.round(insets.top);
  return top >= 20 && Math.abs(gap - top) <= 2 && gap <= 70;
}
function applyFault() {
  try {
    _fault = detectFault();
    document.documentElement.classList.toggle('ios-short', _fault);
  } catch { /* leave the layout as it is */ }
}

export function initShortFix() {
  applyFault();
  window.addEventListener('pageshow', applyFault);
  setTimeout(applyFault, 300); setTimeout(applyFault, 1500);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) setTimeout(applyFault, 200); });
  window.addEventListener('orientationchange', () => setTimeout(applyFault, 350));
}

/** Which way the phone is showing the page, so reports can tell an old install from a re-added one:
 *  translucent-fault = installed with the translucent status bar and the short-layout fault (top inset 62, bottom strip),
 *  solid-bar = installed with a solid status bar (top inset 0, page reaches the screen bottom), standalone-other, browser. */
function displayMode(insets) {
  const standalone = !!(navigator.standalone || (window.matchMedia && matchMedia('(display-mode: standalone)').matches));
  if (!standalone) return 'browser';
  if (_fault) return 'translucent-fault';
  return Math.round(insets.top || 0) < 20 ? 'solid-bar' : 'standalone-other';
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
  // fix probe: t = 1 if the short-layout fault is seen and the bar is sized for it, 0 if not, -1 if never run; l, w, h unused (0)
  rects.fix = { t: _fault == null ? -1 : (_fault ? 1 : 0), l: 0, w: 0, h: 0 };
  document.querySelectorAll('.tab-panel.visible').forEach(p => { if (p.id && Object.keys(rects).length < 14) add(p.id, p); });
  return {
    inner: [window.innerWidth, window.innerHeight], screen: [screen.width, screen.height], avail: [screen.availWidth, screen.availHeight],
    dpr: window.devicePixelRatio, standalone: !!(navigator.standalone || (window.matchMedia && matchMedia('(display-mode: standalone)').matches)),
    vv: vv ? { w: r1(vv.width), h: r1(vv.height), scale: r1(vv.scale), offTop: r1(vv.offsetTop), offLeft: r1(vv.offsetLeft) } : undefined,
    insets, probes, docH: document.documentElement.scrollHeight, docW: document.documentElement.scrollWidth, scrollY: r1(window.scrollY || 0),
    mode: displayMode(insets), rects, tab: String(_o.getTab() || '').slice(0, 24), sw: await swVersion(), ua: navigator.userAgent.slice(0, 220),
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
