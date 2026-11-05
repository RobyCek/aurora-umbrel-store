const CACHE_NAME = 'numerologapp-v10';
const APP_FILES = [
  './',
  './index.html',
  './css/app.css?v=1.2.0',
  './js/app.js?v=1.2.0',
  './js/license.js?v=1.2.0',
  './js/license-config.js?v=1.1.0',
  './js/license-core.js?v=1.1.0',
  './js/numerology.js?v=1.2.0',
  './data/numerologia.md',
  './data/numerologia.en.md',
  './data/numerologia.de.md',
  './data/numerologia.fr.md',
  './data/numerologia.es.md',
  './data/numerologia.pt.md',
  './data/numerologia.ar.md',
  './data/numerologia.ru.md',
  './data/numerologia.ja.md',
  './data/numerologia.zh.md',
  './data/ui.it.json',
  './data/ui.en.json',
  './data/ui.de.json',
  './data/ui.fr.json',
  './data/ui.es.json',
  './data/ui.pt.json',
  './data/ui.ar.json',
  './data/ui.ru.json',
  './data/ui.ja.json',
  './data/ui.zh.json',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-1024.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin === self.location.origin && (url.pathname.startsWith('/admin') || url.pathname.startsWith('/api/admin'))) {
    return;
  }
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('./index.html', copy));
          return response;
        })
        .catch(() => caches.match('./index.html')),
    );
    return;
  }
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
      if (response.ok && new URL(event.request.url).origin === self.location.origin) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
      }
      return response;
    })),
  );
});
