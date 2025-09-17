// Enhanced service worker: offline shell, caching strategies, and update flow
const VERSION = 'v3';
const CACHE_STATIC = `wt-static-${VERSION}`;
const CACHE_PAGES = `wt-pages-${VERSION}`;
const CACHE_IMAGES = `wt-images-${VERSION}`;

const PRECACHE = [
  '/',
  '/offline',
  '/manifest.json',
];

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_STATIC);
      await cache.addAll(PRECACHE);
      self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.map((k) => {
          if (![CACHE_STATIC, CACHE_PAGES, CACHE_IMAGES].includes(k)) {
            return caches.delete(k);
          }
        })
      );
      self.clients.claim();
    })()
  );
});

function isNextStaticAsset(url) {
  return url.pathname.startsWith('/_next/static/');
}

function isImageRequest(request) {
  return (
    request.destination === 'image' ||
    /\.(?:png|jpg|jpeg|gif|webp|svg|ico)$/i.test(new URL(request.url).pathname)
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Navigation requests: network-first with offline fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(request);
          const cache = await caches.open(CACHE_PAGES);
          cache.put(request, res.clone());
          return res;
        } catch {
          const cache = await caches.open(CACHE_PAGES);
          const cached = await cache.match(request);
          return (
            cached || (await caches.match('/offline')) || Response.error()
          );
        }
      })()
    );
    return;
  }

  // Next.js static assets: cache-first
  if (isNextStaticAsset(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_STATIC);
        const cached = await cache.match(request);
        if (cached) return cached;
        const res = await fetch(request);
        cache.put(request, res.clone());
        return res;
      })()
    );
    return;
  }

  // Images: stale-while-revalidate
  if (isImageRequest(request)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_IMAGES);
        const cached = await cache.match(request);
        const fetchPromise = fetch(request)
          .then((res) => {
            cache.put(request, res.clone());
            return res;
          })
          .catch(() => undefined);
        return cached || (await fetchPromise) || (await caches.match('/offline')) || Response.error();
      })()
    );
    return;
  }

  // Default: network-first then cache
  event.respondWith(
    (async () => {
      try {
        const res = await fetch(request);
        const cache = await caches.open(CACHE_STATIC);
        // Only cache successful GETs
        if (res && res.status === 200) cache.put(request, res.clone());
        return res;
      } catch {
        const cached = await caches.match(request);
        return cached || (await caches.match('/offline')) || Response.error();
      }
    })()
  );
});
