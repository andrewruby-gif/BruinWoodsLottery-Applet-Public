const APP_VERSION = "1.0.5";
const CACHE_NAME = `bruin-woods-shell-v${APP_VERSION}`;
const APP_SHELL = [
  "./",
  "./index.html",
  "./assets/tailwind.css",
  "./assets/app-icon.svg",
  "./manifest.webmanifest",
  "./pwa.js"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(names => Promise.all(names.filter(name => name.startsWith("bruin-woods-shell-v") && name !== CACHE_NAME).map(name => caches.delete(name))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", event => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;

  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  if (event.request.mode === "navigate") {
    const indexUrl = new URL("index.html", self.registration.scope).href;
    const rootUrl = self.registration.scope;
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(async () => {
          const cache = await caches.open(CACHE_NAME);
          return (await cache.match(event.request)) || (await cache.match(rootUrl)) || cache.match(indexUrl);
        })
    );
    return;
  }

  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
});