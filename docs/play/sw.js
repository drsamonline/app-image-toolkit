/* sw.js — the offline worker, with the one rule that matters.
 *
 * HTML is served NETWORK FIRST and only falls back to the cache. Everything
 * else is cache-first with a background refresh. This is not fussiness: a
 * cache-first worker answering the HTML kept a shipped, green-deployed release
 * invisible on this estate once, because the cache name had not changed and a
 * returning reader kept the old page with no way to know. The cache name below
 * is bumped by scripts/version.py on every release, and app.js calls
 * registration.update() on load. The footer prints the version, so "am I on the
 * new one?" is answerable from the page itself.
 *
 * PolyForm Noncommercial 1.0.0. (c) 2026 Dr Sohil Momin.
 */
var CACHE = "image-toolkit-v1.3.1";     // bumped from VERSION by scripts/version.py

var ASSETS = [
  "./",
  "index.html",
  "app.js",
  "imgtool.js",
  "i18n.js",
  "sample.js",
  "version.js",
  "web-kit.js",
  "export-kit.js",
  "manifest.webmanifest",
  "icons/icon-192.png",
  "icons/icon-512.png"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      return cache.addAll(ASSETS);
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(names.map(function (name) {
        return name === CACHE ? null : caches.delete(name);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (event) {
  var request = event.request;
  if (request.method !== "GET") return;

  var url = new URL(request.url);
  if (url.origin !== self.location.origin) return;   // never in the middle of anything else

  function fromCache() {
    return caches.match(request).then(function (hit) {
      return hit || caches.match("index.html");
    });
  }

  // A page: try the network, fall back to what we have. Never the other way.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).then(function (response) {
        // Only a good page is worth keeping, and only under its plain address:
        // ?sample=1 and ?demo=webp are the same page, not two of them.
        if (response.ok && !url.search) {
          var copy = response.clone();
          caches.open(CACHE).then(function (cache) { cache.put(request, copy); });
        }
        return response.ok ? response : fromCache();
      }).catch(fromCache)
    );
    return;
  }

  // An asset: serve the copy, and refresh it in the background for next time.
  // A 404 or a 500 is never cached — otherwise one bad deploy is pinned in the
  // cache until the next release changes its name.
  event.respondWith(
    caches.match(request).then(function (hit) {
      if (hit) {
        fetch(request).then(function (response) {
          if (response.ok) caches.open(CACHE).then(function (cache) { cache.put(request, response); });
        }).catch(function () { /* offline is what the cache is for */ });
        return hit;
      }
      return fetch(request).then(function (response) {
        if (response.ok) {
          var copy = response.clone();
          caches.open(CACHE).then(function (cache) { cache.put(request, copy); });
        }
        return response;
      });
    })
  );
});
