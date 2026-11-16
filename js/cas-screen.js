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
