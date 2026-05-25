// 100 Weeks VSLA — Service Worker
// Caches the app shell so coaches can open and fill the form with no internet.
// Reports are saved to localStorage and synced when back online (handled in app).

const CACHE_NAME = "100weeks-v1";

const urlsToCache = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-512.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

// ── Activate: clean up old caches ─────────────────────────────────────────
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(key) { return key !== CACHE_NAME; })
            .map(function(key) { return caches.delete(key); })
      );
    }).then(function() {
      return self.clients.claim(); // take control of all tabs immediately
    })
  );
});

// ── Fetch: serve from cache, fall back to network, cache CDN resources ────
self.addEventListener('fetch', function(event) {
  const url = new URL(event.request.url);

  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  // Skip Firebase API calls — let them go to network / fail gracefully
  if (url.hostname.includes('firebaseio.com') ||
      url.hostname.includes('googleapis.com') && url.pathname.includes('firestore') ||
      url.hostname.includes('firebaseapp.com')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then(function(cached) {
      if (cached) {
        // Serve from cache; also update cache in background (stale-while-revalidate)
        const fetchPromise = fetch(event.request).then(function(response) {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(function(cache) {
              cache.put(event.request, clone);
            });
          }
          return response;
        }).catch(function() { /* offline, already served from cache */ });

        return cached;
      }

      // Not in cache — fetch from network
      return fetch(event.request).then(function(response) {
        if (!response || response.status !== 200) return response;

        // Cache CDN resources (Chart.js, Firebase SDK) for offline use
        const isCDN = CDN_HOSTS.some(function(h) { return url.hostname.includes(h); });
        const isLocal = url.origin === self.location.origin;

        if (isCDN || isLocal) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(event.request, clone);
          });
        }

        return response;
      }).catch(function() {
        // Offline and not in cache — for HTML navigation, return cached index.html
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
        // For other resources just fail silently
        return new Response('', { status: 503, statusText: 'Offline' });
      });
    })
  );
});
