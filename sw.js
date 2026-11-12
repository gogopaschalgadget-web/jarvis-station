// Static shell only: no authenticated API, cross-origin or user-upload caching.
const VERSION = 'jarvis-cas-v56';
const BASE = new URL('./', self.location.href);
const PATHS = ['./', 'index.html', 'manifest.json', 'offline.html', 'js/app.js', 'js/station-work-view.js', 'js/cas-animation.js', 'js/cas-chat.js', 'js/cas-keys.js', 'js/cas-projects.js', 'js/map3d.js', 'js/map3d-status.js', 'js/cas-card.js', 'js/cas-threads.js', 'js/cas-images.js', 'js/renderer.js', 'js/fortress.js', 'js/rooms.js', 'js/room-views.js', 'js/cas-identity.js', 'js/pwa.js', 'css/station.css', 'css/cas-chat.css', 'css/cas-identity.css', 'css/storyboard.css', 'css/features.css', 'css/cas-threads.css', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'assets/cas/current.png', 'assets/brass-frame.svg', 'assets/cas/console.jpg', 'assets/cas/work-animation.jpg', 'assets/cas/face.jpg', 'assets/cas/scene-current.jpg', 'assets/cas/scene-map.jpg', 'assets/cas/scene-standing.jpg', 'assets/cas/scene-console.jpg', 'assets/cas/map-scene.png', 'assets/fortress-map.png', 'assets/cas/identity.json'];
const SHELL = PATHS.map(path => new URL(path, BASE).href);
self.addEventListener('install', event => {
  event.waitUntil(caches.open(VERSION).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(names => Promise.all(names.filter(name => name.startsWith('jarvis') && name !== VERSION).map(name => caches.delete(name)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== BASE.origin || request.headers.has('authorization')) return;
  const canonical = new URL(url.pathname, url.origin).href;
  if (!SHELL.includes(canonical)) return;
  event.respondWith(fetch(request).then(response => {
    if (response.ok) {
      const copy = response.clone();
      event.waitUntil(caches.open(VERSION).then(cache => cache.put(canonical, copy)));
    }
    return response;
  }).catch(async () => {
    const cached = await caches.match(canonical);
    if (cached) return cached;
    if (request.mode === 'navigate') return caches.match(new URL('offline.html', BASE).href);
    return Response.error();
  }));
});
