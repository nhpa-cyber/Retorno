const CACHE_NAME = 'pau-brasil-guarabira-cache-v2.3.0';

const PRECACHE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable.png',
  './logistics_truck.jpg',
  './pau_brasil_logo.jpg'
];

// Install event: cache pre-defined core assets safely
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[Service Worker] Pre-caching Core App Shell');
        return Promise.allSettled(
          PRECACHE_ASSETS.map(url => cache.add(url).catch(err => console.warn(`Failed to precache ${url}:`, err)))
        );
      })
      .then(() => self.skipWaiting())
  );
});

// Activate event: clean up outdated caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[Service Worker] Removing old cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event with precise caching strategies
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip chrome-extensions, firebase APIs, firestore real-time sockets
  if (
    url.origin.includes('chrome-extension') ||
    url.origin.includes('firestore.googleapis.com') ||
    url.origin.includes('identitytoolkit.googleapis.com') ||
    url.origin.includes('firebase')
  ) {
    return;
  }

  // Strategy 1: Cache First for Static Assets (JS, CSS, images, fonts)
  const isStaticAsset = 
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.jpg') ||
    url.pathname.endsWith('.jpeg') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.ico') ||
    url.pathname.endsWith('.woff2');

  if (isStaticAsset) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(request).then((networkResponse) => {
          if (!networkResponse || networkResponse.status !== 200) {
            return networkResponse;
          }
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          }).catch(() => {});
          return networkResponse;
        }).catch(() => {
          return fetch(request);
        });
      })
    );
  } else {
    // Strategy 2: Network First, Fallback to Cache for document, manifest, and routes
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseToCache);
            }).catch(() => {});
          }
          return networkResponse;
        })
        .catch(() => {
          console.log('[Service Worker] Serving from cache fallback for:', request.url);
          return caches.match(request).then((cachedResponse) => {
            if (cachedResponse) {
              return cachedResponse;
            }
            return caches.match('./index.html').then(idx => idx || fetch(request));
          });
        })
    );
  }
});

