// Cache only this public fallback. Authenticated pages and API responses stay on the network.
const CACHE = "print-it-phone-v2";
const ASSETS = ["/pwa/offline.html", "/pwa/offline.css", "/pwa/offline.js", "/print-it-wordmark-arched.png"];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith("print-it-phone-") && key !== CACHE).map(key => caches.delete(key))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (ASSETS.includes(url.pathname)) {
    event.respondWith(caches.open(CACHE).then(async cache => (await cache.match(url.pathname)) || fetch(request)));
  } else if (request.mode === "navigate" && !url.pathname.startsWith("/api/")) {
    event.respondWith(fetch(request).catch(() => caches.open(CACHE).then(cache => cache.match("/pwa/offline.html"))));
  }
});
