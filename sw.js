// Service Worker: macht Parla offline-fähig und schnell.
// 040bbdda wird beim Deployment durch die Commit-ID ersetzt, damit Updates ankommen.
const CACHE = 'parla-040bbdda';
const ASSETS = [
  './', 'index.html', 'styles.css', 'manifest.webmanifest', 'data/course.json', 'data/decks.json',
  'js/app.js', 'js/ui.js', 'js/course.js', 'js/state.js', 'js/checker.js', 'js/factory.js', 'js/speech.js',
  'js/sound.js', 'js/audio.js', 'js/exercises.js', 'js/lesson.js', 'js/views.js', 'js/onboarding.js',
  'icons/apple-touch-icon.png', 'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(ASSETS.map(url => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Cache zuerst (sofortiger Start auch bei schlechtem Netz), im Hintergrund aktualisieren.
// Neue Versionen kommen über einen neuen Service Worker (andere Build-ID).
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || !request.url.startsWith(self.location.origin)) return;
  event.respondWith(caches.open(CACHE).then(async (cache) => {
    const cached = await cache.match(request, { ignoreSearch: true });
    const network = fetch(request, { cache: 'no-cache' })
      .then(response => { if (response.ok) cache.put(request, response.clone()); return response; })
      .catch(() => cached);
    if (cached) {
      event.waitUntil(network.catch(() => {}));
      return cached;
    }
    // Nicht im Cache: Netz, aber mit Zeitlimit
    return Promise.race([network, new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000))])
      .catch(() => cached || Response.error());
  }));
});
