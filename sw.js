const CACHE = "pg-split-v2";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
});
self.addEventListener("activate", e => {
  e.waitUntil(self.clients.claim());
});
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (ASSETS.includes(url.pathname.replace(self.registration.scope.replace(location.origin, ""), "."))) {
    e.respondWith(caches.match(e.request));
  }
});
