/* Service worker aplikasi HP Inspeksi: menyimpan berkas aplikasi agar bisa dibuka tanpa sinyal.
 * Data (permintaan ke Apps Script) TIDAK lewat sini — antrean kiriman dikelola app.js di IndexedDB. */
var VERSI = '2026-10-07.15';
var CACHE = 'motaha-inspeksi-' + VERSI;
var BERKAS = ['./', 'index.html', 'app.js', 'exif.js', 'konfigurasi.js', 'manifest.webmanifest',
  'ikon-192.png', 'ikon-512.png', 'ikon-maskable-512.png', 'ikon-apple-180.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(BERKAS); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (daftar) {
    return Promise.all(daftar.filter(function (k) { return k.indexOf('motaha-inspeksi-') === 0 && k !== CACHE; })
      .map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('message', function (e) { if (e.data === 'pasang-sekarang') self.skipWaiting(); });

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  // konfigurasi.js: utamakan versi terbaru dari server (alamat API bisa berubah), cadangan dari simpanan.
  if (/konfigurasi\.js$/.test(new URL(req.url).pathname)) {
    e.respondWith(fetch(req).then(function (r) {
      var salinan = r.clone(); caches.open(CACHE).then(function (c) { c.put(req, salinan); }); return r;
    }).catch(function () { return caches.match(req); }));
    return;
  }
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(function (ada) {
    return ada || fetch(req).catch(function () { return req.mode === 'navigate' ? caches.match('index.html') : undefined; });
  }));
});
