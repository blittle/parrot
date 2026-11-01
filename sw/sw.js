// Parrot service worker. Built by the `serviceWorker` plugin in vite.config.ts,
// which fills in the version and the list of files to precache.
// Audio clips are not cached here: the app keeps them in IndexedDB.

const VERSION = "__VERSION__";
const PRECACHE = __PRECACHE__;
const CACHE = `parrot-shell-${VERSION}`;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // `credentials: same-origin` so the requests carry the Cloudflare Access cookie.
      .then((cache) => cache.addAll(PRECACHE.map((url) => new Request(url, { credentials: "same-origin" }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("parrot-shell-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  // Only handle our own GET requests; the API and Google always go to the network.
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    // Network first so updates arrive. Offline, or a connection too slow to answer
    // within a few seconds (a weak signal), opens the cached app instead of hanging.
    event.respondWith(navigate(request));
    return;
  }

  // Hashed assets and icons: cache first.
  event.respondWith(
    caches.match(request, { cacheName: CACHE }).then(
      (cached) =>
        cached ||
        fetch(request).then((response) => {
          if (response.ok && response.type === "basic" && url.pathname.startsWith("/assets/")) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        }),
    ),
  );
});

const NAVIGATION_TIMEOUT_MS = 3500;

async function navigate(request) {
  const network = fetch(request);
  network.catch(() => {}); // A late failure after we've fallen back is fine.
  const timeout = new Promise((resolve) => setTimeout(resolve, NAVIGATION_TIMEOUT_MS, "timeout"));
  try {
    const first = await Promise.race([network, timeout]);
    if (first !== "timeout") return first;
    const cached = await caches.match("/", { cacheName: CACHE });
    return cached || (await network);
  } catch {
    const cached = await caches.match("/", { cacheName: CACHE });
    return cached || Response.error();
  }
}
