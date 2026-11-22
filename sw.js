/* PiawaiLab service worker — aplikasi bisa dibuka & dipakai offline.
   File pengguna tidak pernah melewati SW ini: hanya aset aplikasi (HTML, JS, font) yang di-cache. */
const V = 'piawailab-v2.0.0';
const CORE = ['./', './index.html', './manifest.webmanifest', './assets/icon.svg', './assets/icon-192.png',
  './vendor/fonts/pjs-400.woff2', './vendor/fonts/pjs-500.woff2', './vendor/fonts/pjs-600.woff2', './vendor/fonts/pjs-700.woff2', './vendor/fonts/pjs-800.woff2',
  './vendor/pdf.min.js', './vendor/pdf.worker.min.js', './vendor/pdf-lib.min.js', './vendor/jszip.min.js'];
self.addEventListener('install', e => e.waitUntil(caches.open(V).then(c => c.addAll(CORE)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('piawailab-') && k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (req.mode === 'navigate' || url.pathname.endsWith('/index.html') || url.pathname.endsWith('/')) {
    e.respondWith(fetch(req).then(r => { const c = r.clone(); caches.open(V).then(x => x.put('./index.html', c)); return r; }).catch(() => caches.match('./index.html')));
    return;
  }
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => { if (r.ok) { const c = r.clone(); caches.open(V).then(x => x.put(req, c)); } return r; })));
});
