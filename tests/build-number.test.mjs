import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { cleanBuild, buildFromCaches, askWorker, currentBuild, ASK, CHECKING, UNKNOWN } from '../js/cas-build.js';

const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const swSource = read('sw.js');
const VERSION = /const VERSION = '([^']+)'/.exec(swSource)[1];

/** Run the real sw.js with a fake worker scope and give back its listeners. */
function loadWorker() {
  const listeners = {};
  const self = { location: { href: 'https://example.test/station/sw.js' }, addEventListener: (t, f) => { listeners[t] = f; }, skipWaiting() {}, clients: { claim() {} } };
  vm.runInNewContext(swSource, { self, URL, caches: {}, fetch() {}, Response: { error() {} } });
  return listeners;
}
/** A fake phone: a controller that forwards a posted message to the worker's message listener. */
function phone(listeners, { answers = true } = {}) {
  class MC { constructor() { this.port1 = {}; this.port2 = { postMessage: v => { if (this.port1.onmessage) this.port1.onmessage({ data: v }); } }; } }
  const controller = { postMessage(data, ports) { if (answers) listeners.message({ data, ports }); } };
  return { nav: { serviceWorker: { controller } }, MC };
}

test('the build name has one source: the VERSION in sw.js, in the shape jarvis-cas-v<number>', () => {
  assert.match(VERSION, /^jarvis-cas-v\d+$/);
  assert.equal(cleanBuild(VERSION), VERSION);
  assert.equal((swSource.match(/const VERSION = /g) || []).length, 1, 'VERSION is defined once');
});

test('the worker answers the ask on the port it was given with its own VERSION, and ignores anything else', () => {
  const l = loadWorker();
  assert.equal(typeof l.message, 'function');
  const got = [];
  l.message({ data: ASK, ports: [{ postMessage: v => got.push(v) }] });
  assert.deepEqual(got, [VERSION]);
  l.message({ data: 'something else', ports: [{ postMessage: v => got.push(v) }] });
  l.message({ data: ASK, ports: [] });
  l.message({ data: ASK });
  assert.deepEqual(got, [VERSION], 'no answer to other messages or to a message with no port');
});

test('the page gets the worker\'s VERSION through the real worker code', async () => {
  const { nav, MC } = phone(loadWorker());
  assert.equal(await askWorker(nav, 200, MC), VERSION);
});

test('no controlling worker, a silent worker, a throwing one: null (never a throw, never a wait past the limit)', async () => {
  assert.equal(await askWorker({}, 50, class {}), null);
  assert.equal(await askWorker({ serviceWorker: { controller: null } }, 50, class { constructor() { this.port1 = {}; this.port2 = {}; } }), null);
  const silent = phone(loadWorker(), { answers: false });
  const t0 = Date.now();
  assert.equal(await askWorker(silent.nav, 60, silent.MC), null);
  assert.ok(Date.now() - t0 < 500, 'gave up at the limit');
  const boom = { serviceWorker: { controller: { postMessage() { throw new Error('x'); } } } };
  assert.equal(await askWorker(boom, 60, silent.MC), null);
  assert.equal(await askWorker(undefined, 50, null), null);
});

test('a name that is not a build name is dropped, so nothing odd is ever shown', () => {
  for (const bad of ['', 'v120', 'jarvis-cas-v', 'jarvis-cas-v12a', '<b>jarvis-cas-v1</b>', 'jarvis-cas-v1234567', null, undefined, 5, {}]) assert.equal(cleanBuild(bad), null, String(bad));
});

test('with no answer from an older worker the newest cache name is the fallback; nothing at all gives null', async () => {
  assert.equal(buildFromCaches(['jarvis-cas-v9', 'jarvis-cas-v120', 'other', 'jarvis-cas-v118']), 'jarvis-cas-v120');
  assert.equal(buildFromCaches(['other']), null);
  assert.equal(buildFromCaches(null), null);
  const silent = phone(loadWorker(), { answers: false });
  assert.equal(await currentBuild(silent.nav, { keys: async () => ['jarvis-cas-v118'] }, 40), 'jarvis-cas-v118');
  assert.equal(await currentBuild(silent.nav, { keys: async () => { throw new Error('blocked'); } }, 40), null);
  assert.equal(await currentBuild(silent.nav, null, 40), null);
});

test('Settings shows the build and the fixed 2.5.0 is gone', () => {
  const app = read('js/app.js');
  assert.ok(!/2\.5\.0/.test(app) && !/2\.5\.0/.test(read('index.html')), 'no fixed version number');
  assert.match(app, /<span class="stat-label">Build<\/span><span class="stat-value" id="build-value">\$\{CHECKING\}<\/span>/);
  assert.match(app, /currentBuild\(navigator,/);
  assert.match(app, /v\.textContent = name \|\| UNKNOWN/);
  assert.ok(CHECKING.length && UNKNOWN.length);
  assert.ok(swSource.includes("'js/cas-build.js'"), 'the module is in the offline list');
  assert.match(app, /cas-build\.js\?v=cas\d+/);
});
