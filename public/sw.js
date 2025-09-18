const CACHE = 'soa-cache-v1';
const FILES = ['/', '/index.html', '/styles.css', '/script.js', '/logo.jpg', '/manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)));
});

self.addEventListener('fetch', e => {
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
