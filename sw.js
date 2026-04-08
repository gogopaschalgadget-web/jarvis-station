// ============================================================
//  JARVIS STATION - Service Worker
//  Strategy: Workbox via CDN (no build step required)
//  Fallback: vanilla cache if Workbox CDN unreachable
//
//  Caching strategies:
//    - Cache-first: app shell (index.html, Phaser CDN, icons)
//    - Network-first: API calls (/api/*) with cached fallback
//    - Stale-while-revalidate: chain config JSONs
//    - Skip: WebSocket (SW cannot intercept WS connections)
//
//  ARCHITECTURE NOTE: This SW is a pure caching layer only.
//  No business logic lives here. iOS WKWebView (Capacitor)
//  does NOT support service workers, so any logic here would
//  be lost on native iOS. Keep it dumb cache, smart app.
//
//  Carries forward into Capacitor (Android WebView supports SW).
//  Indexed for Pillar 6: if superseded, commit hash + this
//  comment serve as the reference.
// ============================================================

const CACHE_VERSION = 'jarvis-v1';
const APP_SHELL_CACHE = CACHE_VERSION + '-shell';
const API_CACHE = CACHE_VERSION + '-api';
const CONFIG_CACHE = CACHE_VERSION + '-config';

// App shell URLs to precache on install
const APP_SHELL_URLS = [
  '/jarvis-station/',
  '/jarvis-station/index.html',
  '/jarvis-station/offline.html',
  '/jarvis-station/manifest.json',
  '/jarvis-station/icons/icon-192.png',
  '/jarvis-station/icons/icon-512.png',
  'https://cdnjs.cloudflare.com/ajax/libs/phaser/3.60.0/phaser.min.js'
];

// ============================================================
//  WORKBOX LOADER WITH VANILLA FALLBACK
//  Audit fix #2: try/catch around importScripts so SW installs
//  even if Workbox CDN is unreachable on first visit.
// ============================================================
let workboxLoaded = false;

try {
  importScripts('https://storage.googleapis.com/workbox-cdn/releases/7.0.0/workbox-sw.js');
  if (typeof workbox !== 'undefined') {
    workboxLoaded = true;
    console.log('[SW] Workbox loaded from CDN');
  }
} catch (e) {
  console.warn('[SW] Workbox CDN unreachable, using vanilla cache fallback:', e.message);
}

// ============================================================
//  WORKBOX PATH: Production-grade caching strategies
// ============================================================
if (workboxLoaded) {

  // Skip waiting and claim clients immediately on update
  workbox.core.skipWaiting();
  workbox.core.clientsClaim();

  // Set cache name prefix
  workbox.core.setCacheNameDetails({ prefix: 'jarvis' });

  // --- PRECACHE: App shell on install ---
  // Revision uses CACHE_VERSION constant (top of file).
  // To bust cache on deploy: increment CACHE_VERSION (e.g., 'jarvis-v2').
  // This updates ALL revision strings, forcing Workbox to re-fetch.
  // The SW file itself changes (new CACHE_VERSION value), which triggers
  // the browser's byte-diff check on reg.update(), installing the new SW.
  workbox.precaching.precacheAndRoute([
    { url: '/jarvis-station/', revision: CACHE_VERSION },
    { url: '/jarvis-station/index.html', revision: CACHE_VERSION },
    { url: '/jarvis-station/offline.html', revision: CACHE_VERSION },
    { url: '/jarvis-station/manifest.json', revision: CACHE_VERSION },
    { url: '/jarvis-station/icons/icon-192.png', revision: CACHE_VERSION },
    { url: '/jarvis-station/icons/icon-512.png', revision: CACHE_VERSION },
    // Phaser CDN: versioned URL (3.60.0 in path), cache forever
    { url: 'https://cdnjs.cloudflare.com/ajax/libs/phaser/3.60.0/phaser.min.js', revision: null }
  ]);

  // --- CACHE-FIRST: Static assets (icons, images) ---
  workbox.routing.registerRoute(
    function(routeData) {
      return routeData.request.destination === 'image';
    },
    new workbox.strategies.CacheFirst({
      cacheName: APP_SHELL_CACHE,
      plugins: [
        new workbox.expiration.ExpirationPlugin({
          maxEntries: 30,
          maxAgeSeconds: 30 * 24 * 60 * 60  // 30 days
        })
      ]
    })
  );

  // --- NETWORK-FIRST: API calls (always want fresh, cache as fallback) ---
  workbox.routing.registerRoute(
    function(routeData) {
      return routeData.url.pathname.startsWith('/api/');
    },
    new workbox.strategies.NetworkFirst({
      cacheName: API_CACHE,
      networkTimeoutSeconds: 5,
      plugins: [
        new workbox.expiration.ExpirationPlugin({
          maxEntries: 50,
          maxAgeSeconds: 60 * 60  // 1 hour
        })
      ]
    })
  );

  // --- STALE-WHILE-REVALIDATE: Chain config JSONs ---
  workbox.routing.registerRoute(
    function(routeData) {
      return routeData.url.pathname.includes('/configs/chains/');
    },
    new workbox.strategies.StaleWhileRevalidate({
      cacheName: CONFIG_CACHE,
      plugins: [
        new workbox.expiration.ExpirationPlugin({
          maxEntries: 20,
          maxAgeSeconds: 24 * 60 * 60  // 24 hours
        })
      ]
    })
  );

  // --- OFFLINE FALLBACK: Navigation requests that miss cache ---
  workbox.routing.setCatchHandler(function(options) {
    if (options.request.destination === 'document') {
      return caches.match('/jarvis-station/offline.html');
    }
    return Response.error();
  });

// ============================================================
//  VANILLA FALLBACK PATH: Basic cache if Workbox CDN failed
//  This ensures the SW still installs and provides offline
//  support even without Workbox.
// ============================================================
} else {

  // --- INSTALL: Cache app shell ---
  self.addEventListener('install', function(event) {
    console.log('[SW] Vanilla install: caching app shell');
    event.waitUntil(
      caches.open(APP_SHELL_CACHE).then(function(cache) {
        return cache.addAll(APP_SHELL_URLS);
      })
    );
    self.skipWaiting();
  });

  // --- ACTIVATE: Clean old caches ---
  self.addEventListener('activate', function(event) {
    console.log('[SW] Vanilla activate: cleaning old caches');
    event.waitUntil(
      caches.keys().then(function(cacheNames) {
        return Promise.all(
          cacheNames
            .filter(function(name) { return name !== APP_SHELL_CACHE && name !== API_CACHE; })
            .map(function(name) { return caches.delete(name); })
        );
      })
    );
    self.clients.claim();
  });

  // --- FETCH: Cache-first for shell, network-first for API ---
  self.addEventListener('fetch', function(event) {
    var url = new URL(event.request.url);

    // Skip WebSocket upgrade requests (SW cannot handle these)
    if (event.request.headers.get('upgrade') === 'websocket') {
      return;
    }

    // Network-first for API calls
    if (url.pathname.startsWith('/api/')) {
      event.respondWith(
        fetch(event.request)
          .then(function(response) {
            // Cache successful GET responses
            if (event.request.method === 'GET' && response.status === 200) {
              var clonedResponse = response.clone();
              caches.open(API_CACHE).then(function(cache) {
                cache.put(event.request, clonedResponse);
              });
            }
            return response;
          })
          .catch(function() {
            return caches.match(event.request);
          })
      );
      return;
    }

    // Cache-first for everything else (app shell, static assets)
    event.respondWith(
      caches.match(event.request).then(function(cachedResponse) {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(event.request).then(function(response) {
          // Only cache successful same-origin or CDN responses
          if (response.status === 200) {
            var clonedResponse = response.clone();
            caches.open(APP_SHELL_CACHE).then(function(cache) {
              cache.put(event.request, clonedResponse);
            });
          }
          return response;
        });
      }).catch(function() {
        // Offline fallback for navigation requests
        if (event.request.mode === 'navigate') {
          return caches.match('/jarvis-station/offline.html');
        }
        return new Response('', { status: 503, statusText: 'Offline' });
      })
    );
  });
}
