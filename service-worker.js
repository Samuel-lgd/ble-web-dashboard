/**
 * Service Worker — caches the application shell for offline use.
 */

const CACHE_NAME = 'obd2-dashboard-v1';

const SHELL_FILES = [
  './',
  './index.html',
  './main.js',
  './config.js',
  './ble-adapter.js',
  './elm327.js',
  './atsh-manager.js',
  './pid-manager.js',
  './pids-standard.js',
  './pids-toyota.js',
  './store.js',
  './ui.js',
  './manifest.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => {
      // Network-first for navigation, cache-first for assets
      if (event.request.mode === 'navigate') {
        return fetch(event.request).catch(() => cached || new Response('Offline'));
      }
      return cached || fetch(event.request);
    })
  );
});
