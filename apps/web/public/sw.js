// CoolFTC Service Worker v3
// Safe caching that never breaks auth flows.
//
// Key design principles:
//   1. NEVER intercept navigation (HTML) requests — let the browser handle them
//      natively with cookies. Intercepting was breaking auth redirects.
//   2. NEVER intercept requests that might carry auth cookies.
//   3. Only cache clearly-static assets (fonts, icons, images). That's it.
//   4. Self-heal: activate immediately, claim clients, clear old caches.
//
// Bump CACHE_VERSION whenever this file changes meaningfully.
const CACHE_VERSION = "coolftc-v3";
const ASSETS_CACHE = `${CACHE_VERSION}-assets`;

// INSTALL: take over immediately, no aggressive pre-caching
self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

// ACTIVATE: purge ALL old caches (including v1, v2), claim every client
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      // Delete any cache we don't currently use
      await Promise.all(
        keys
          .filter((k) => k !== ASSETS_CACHE)
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

// FETCH: only intercept static assets. Everything else passes through untouched.
self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only GET requests
  if (request.method !== "GET") return;

  // Let ALL navigation requests go to the network natively.
  // This is the critical fix — navigation needs cookies for middleware auth.
  if (request.mode === "navigate") return;

  // Let anything that accepts HTML go through natively too.
  const accept = request.headers.get("accept") || "";
  if (accept.includes("text/html")) return;

  // Same-origin only for caching; never cache 3rd party.
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Only cache clearly-static assets — fonts, icons, images.
  // Deliberately DO NOT cache /_next/static/... JS/CSS because Next.js hashes
  // those filenames per build; they're already cached perfectly by HTTP headers.
  const staticAssetPattern = /\.(woff2?|ttf|otf|eot|png|jpg|jpeg|gif|svg|ico|webp)$/i;
  if (!staticAssetPattern.test(url.pathname)) return;

  // Cache-first for static assets
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((res) => {
        // Only cache successful responses
        if (res.ok && res.status === 200) {
          const copy = res.clone();
          caches.open(ASSETS_CACHE).then((c) => c.put(request, copy));
        }
        return res;
      }).catch(() => {
        // Offline and nothing cached — return a simple 503
        return new Response("", { status: 503 });
      });
    })
  );
});

// Allow page to request immediate takeover
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
