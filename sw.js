/* Qpanell Service Worker – يخزّن التطبيق ليعمل دون إنترنت */
const CACHE = 'qpanell-v7';
const ASSETS = [
  './', './index.html', './styles.css', './app.js',
  './logo.jpeg', './icon-192.png', './icon-512.png',
  './manifest.json', './jspdf.umd.min.js', './html2canvas.min.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((cache) => {
      return cache.addAll(ASSETS).catch((err) => {
        console.warn('فشل تخزين بعض الملفات:', err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const clone = res.clone();
        caches.open(CACHE).then((cache) => cache.put(e.request, clone));
        return res;
      })
      .catch(() => {
        return caches.match(e.request).then((cached) => {
          return cached || caches.match('./index.html');
        });
      })
  );
});
