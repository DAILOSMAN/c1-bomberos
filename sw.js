/* Service worker: la app entera cacheada para funcionar sin conexion. */

var CACHE = 'c1bomberos-v1';
var FICHEROS = [
  './',
  './index.html',
  './css/app.css',
  './js/temario.js',
  './js/store.js',
  './js/importer.js',
  './js/engine.js',
  './js/stats.js',
  './js/ui.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      return Promise.all(FICHEROS.map(function (f) {
        return c.add(f).catch(function () { return null; });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (ks) {
      return Promise.all(ks.map(function (k) {
        return k === CACHE ? null : caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(function (r) {
      if (r) {
        // refresca en segundo plano
        fetch(e.request).then(function (resp) {
          if (resp && resp.status === 200) {
            caches.open(CACHE).then(function (c) { c.put(e.request, resp.clone()); });
          }
        }).catch(function () {});
        return r;
      }
      return fetch(e.request).then(function (resp) {
        if (resp && resp.status === 200 && e.request.url.indexOf('http') === 0) {
          var clon = resp.clone();
          caches.open(CACHE).then(function (c) { c.put(e.request, clon); });
        }
        return resp;
      }).catch(function () {
        return caches.match('./index.html');
      });
    })
  );
});
