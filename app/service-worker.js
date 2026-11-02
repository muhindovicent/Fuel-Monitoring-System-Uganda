const CACHE_NAME = 'MafutaWatch Uganda-v3-api-network-only';
const STATIC_ASSETS = [
  'index.html',
  'manifest.json',
  'css/style.css',
  'js/data.js',
  'js/app.js',
  'js/api-config.js',
  'js/production.js',
];


self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});


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


self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  
  if (request.method !== 'GET') return;

  // Private and authoritative API responses must NEVER enter the offline Cache API.
  // Also covers API requests to another origin whose path still begins with /api/v1/.
  if (url.pathname === '/api/v1' || url.pathname.startsWith('/api/v1/')) {
    event.respondWith(fetch(request).catch(() => new Response(
      JSON.stringify({ message: 'API unavailable — cannot serve stale prices or private data' }),
      { status: 503, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
    )));
    return;
  }

  
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

// Cache injection via arbitrary postMessage URLs is intentionally unsupported.
