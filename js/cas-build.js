// cas-build.js - which build of the Station this phone is running. One source of truth: the service worker's own VERSION name in sw.js.
// The page asks the service worker that controls it; if it cannot answer (an older worker, no worker yet), the name of its cache is the fallback.
export const BUILD_PREFIX = 'jarvis-cas-v';
export const ASK = 'jarvis-version';
export const CHECKING = 'checking...';
export const UNKNOWN = 'not known yet (close the Station and open it again)';

/** A build name is safe to show only if it has the shape jarvis-cas-v<number>. Anything else is dropped. */
export const cleanBuild = name => (typeof name === 'string' && /^jarvis-cas-v\d{1,6}$/.test(name) ? name : null);

/** The highest build name among the cache names, or null. */
export function buildFromCaches(names) {
  const ok = (Array.isArray(names) ? names : []).map(cleanBuild).filter(Boolean);
  if (!ok.length) return null;
  return ok.sort((a, b) => Number(b.slice(BUILD_PREFIX.length)) - Number(a.slice(BUILD_PREFIX.length)))[0];
}

/** Ask the controlling service worker for its VERSION (it answers on a message port); resolves to a build name or null. Never rejects, never waits past timeoutMs. */
export function askWorker(nav, timeoutMs = 1500, MC = typeof MessageChannel === 'function' ? MessageChannel : null) {
  return new Promise(resolve => {
    let done = false;
    let ch = null;
    const finish = v => { if (!done) { done = true; clearTimeout(timer); try { if (ch) ch.port1.close(); } catch { /* already closed */ } resolve(v); } };
    const timer = setTimeout(() => finish(null), timeoutMs);
    try {
      const ctl = nav && nav.serviceWorker && nav.serviceWorker.controller;
      if (!ctl || !MC) return finish(null);
      ch = new MC();
      ch.port1.onmessage = e => finish(cleanBuild(e && e.data));
      ctl.postMessage(ASK, [ch.port2]);
    } catch { finish(null); }
  });
}

/** The build name for the Settings line: the worker's answer, else the newest cache name, else null. */
export async function currentBuild(nav, cacheStore, timeoutMs) {
  const fromWorker = await askWorker(nav, timeoutMs);
  if (fromWorker) return fromWorker;
  try { return buildFromCaches(cacheStore && (await cacheStore.keys())); } catch { return null; }
}
