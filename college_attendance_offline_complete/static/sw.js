const CACHE_NAME = 'attendance-v7';
const STATIC_ASSETS = [
  '/static/css/app.css',
  '/static/js/quagga.min.js',
  '/static/js/barcode-scanner.js',
  '/static/js/attendance.js',
  '/static/js/faculty-dashboard.js',
  '/static/js/timetable.js',
  '/static/js/register-sw.js',
  '/static/data/timetable.json',
  '/static/manifest.json',
];

const NET_TIMEOUT = 3000;

/* ── Install: pre-cache all static assets ── */
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(STATIC_ASSETS)));
  self.skipWaiting();
});

/* ── Activate: delete old caches, claim clients ── */
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(names => Promise.all(names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

/* ── Fetch: strategy depends on request type ── */
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);

  // Static assets → cache-first (fast, already pre-cached)
  if (url.pathname.startsWith('/static/')) {
    e.respondWith(cacheFirst(e.request));
    return;
  }

  // API calls → network-first, longer timeout, cache fallback
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(networkFirst(e.request, 5000));
    return;
  }

  // Page navigations → network-first, short timeout, cache or offline page
  if (e.request.mode === 'navigate') {
    e.respondWith(networkFirst(e.request, NET_TIMEOUT));
    return;
  }

  // Everything else → network-first
  e.respondWith(networkFirst(e.request, NET_TIMEOUT));
});

/* ── Cache-first: serve from cache, fallback to network ── */
function cacheFirst(req) {
  return caches.match(req).then(hit => {
    if (hit) return hit;
    return fetch(req).then(res => {
      if (res.ok) {
        const c = res.clone();
        caches.open(CACHE_NAME).then(ca => ca.put(req, c));
      }
      return res;
    });
  }).catch(() => caches.match(req));
}

/* ── Network-first with timeout: try network, fall back to cache after timeout ── */
function networkFirst(req, timeout) {
  return new Promise(resolve => {
    let done = false;

    const timer = setTimeout(() => {
      if (done) return;
      caches.match(req).then(hit => {
        if (hit && !done) { done = true; resolve(hit); }
      });
    }, timeout);

    fetch(req).then(res => {
      clearTimeout(timer);
      if (!done) {
        done = true;
        if (res.ok) {
          const c = res.clone();
          caches.open(CACHE_NAME).then(ca => ca.put(req, c));
        }
        resolve(res);
      }
    }).catch(() => {
      clearTimeout(timer);
      if (!done) {
        done = true;
        caches.match(req).then(hit => resolve(hit || offlinePage()));
      }
    });
  });
}

/* ── Inline offline fallback page ── */
function offlinePage() {
  return new Response(
    '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline</title>' +
    '<style>body{font-family:Arial,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#f3f5f8}' +
    '.box{text-align:center;padding:40px}h1{color:#172033}p{color:#687487}button{background:#E7000B;color:#fff;border:0;padding:12px 24px;border-radius:8px;cursor:pointer;font-size:16px}</style>' +
    '</head><body><div class="box"><h1>You\'re Offline</h1><p>This page hasn\'t been cached yet. Connect to the internet and try again.</p>' +
    '<button onclick="location.reload()">Retry</button></div></body></html>',
    { status: 503, headers: { 'Content-Type': 'text/html' } }
  );
}
