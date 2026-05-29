// MafutaWatch Uganda — Service Worker v1.0
// Offline-first caching strategy for fuel price data

const CACHE_NAME = 'MafutaWatch Uganda-v1';
const STATIC_ASSETS = [
  'index.html',
  'manifest.json',
  'css/style.css',
  'js/data.js',
  'js/app.js',
];

// Install: cache shell resources
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: network-first with cache fallback for API/data,
// cache-first for static assets
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Handle only same-origin requests and CDN map tiles
  if (request.method !== 'GET') return;

  // For map tiles and static CDN resources, try cache first
  if (url.hostname === 'unpkg.com' || url.hostname === 'tile.openstreetmap.org') {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, copy);
            });
          }
          return response;
        }).catch(() => {
          // Return a placeholder for tiles when offline
          return new Response(
            '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><rect fill="#e2e8f0" width="256" height="256"/><text x="128" y="128" text-anchor="middle" fill="#94a3b8" font-size="14">Offline</text></svg>',
            { headers: { 'Content-Type': 'image/svg+xml' } }
          );
        });
      })
    );
    return;
  }

  // For the app itself: network first, fall back to cache
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.ok && response.type === 'basic') {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, copy);
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(request).then((cached) => {
          if (cached) return cached;
          // If index.html wasn't cached, return a minimal offline page
          if (request.mode === 'navigate') {
            return caches.match('index.html');
          }
          return new Response('Offline', { status: 503 });
        });
      })
  );
});

// Listen for messages to update cache
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'CACHE_UPDATED') {
    caches.open(CACHE_NAME).then((cache) => {
      if (event.data.payload) {
        cache.put(event.data.url, new Response(JSON.stringify(event.data.payload)));
      }
    });
  }
});
