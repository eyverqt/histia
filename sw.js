/* Histia — sin conexion: guarda la app (nunca datos del usuario) y la sirve desde aqui. */
const CACHE = 'histia-1';
const APP = ['./', 'index.html', 'app.css', 'eyverqt.css', 'cripto.js', 'oculto.js', 'boveda.js', 'app.js', 'icono.svg', 'manifest.webmanifest', 'fonts/archivo-800.woff2', 'fonts/chivo-mono.woff2'];

self.addEventListener('install', (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(APP)).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (u.origin !== location.origin || e.request.method !== 'GET') return;
  // Rutas limpias (/histia/nota...): siempre la misma pagina
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).then((r) => (r.ok ? r : caches.match('index.html'))).catch(() => caches.match('index.html')));
    return;
  }
  e.respondWith(caches.match(e.request).then((c) => c || fetch(e.request)));
});
