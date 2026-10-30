// Tackleball offline cache: serves the whole game from cache once installed.
// App files (html/js/css/json) are fetched network-first with a cache fallback,
// so updates arrive on the next open; only static assets (icon) are cache-first.
const CACHE_NAME = "tackleball-v11";
const ASSETS = [
  "./index.html",
  "./data.js",
  "./engine.js",
  "./ui.js",
  "./style.css",
  "./manifest.json",
  "./icon.png",
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const path = new URL(event.request.url).pathname;
  const isAppFile = path.endsWith("/") || /\.(html|js|css|json)$/.test(path);
  if (!isAppFile) {
    event.respondWith(caches.match(event.request).then(hit => hit || fetch(event.request)));
    return;
  }
  event.respondWith(
    fetch(event.request).then(resp => {
      if (resp && resp.status === 200 && resp.url.startsWith("http")) {
        const copy = resp.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
      }
      return resp;
    }).catch(() =>
      caches.match(event.request).then(hit => hit || caches.match("./index.html"))
    )
  );
});