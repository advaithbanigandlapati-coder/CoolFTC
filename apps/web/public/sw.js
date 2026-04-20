// CoolFTC Service Worker
// Auto-updates silently on new deploys. No hard refresh needed by users.
//
// Bump CACHE_VERSION on each deploy to force cache invalidation.
const CACHE_VERSION = "coolftc-v2";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

const APP_SHELL = [
  "/manifest.webmanifest",
  "/favicon.ico",
];

// INSTALL: precache shell, take over immediately
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      await Promise.all(
        APP_SHELL.map((url) =>
          fetch(url, { credentials: "same-origin" })
            .then((res) => res.ok && cache.put(url, res))
            .catch(() => {})
        )
      );
      // Activate this SW even if there's an old one still controlling pages
      await self.skipWaiting();
    })()
  );
});

// ACTIVATE: clear old caches, claim clients, notify them silently
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith("coolftc-") && !k.startsWith(CACHE_VERSION))
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
      // Tell every open tab/window: a new SW is in charge — reload silently
      const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of clients) {
        client.postMessage({ type: "SW_UPDATED", version: CACHE_VERSION });
      }
    })()
  );
});

// FETCH STRATEGIES
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  // Network-only for API/auth/3rd-party data
  if (
    url.pathname.startsWith("/api/") ||
    url.hostname.includes("supabase") ||
    url.hostname.includes("anthropic") ||
    url.hostname.includes("ftcscout") ||
    url.hostname.includes("firstinspires")
  ) {
    return;
  }

  // HTML pages: NETWORK FIRST so users always see the latest deploy
  // Falls back to cache only when offline.
  if (request.mode === "navigate" || request.headers.get("accept")?.includes("text/html")) {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request);
          // Cache for offline fallback
          const cache = await caches.open(RUNTIME_CACHE);
          cache.put(request, fresh.clone()).catch(() => {});
          return fresh;
        } catch {
          const cached = await caches.match(request);
          return cached ?? caches.match("/") ?? new Response("Offline", { status: 503 });
        }
      })()
    );
    return;
  }

  // Static assets (JS/CSS/fonts/images): CACHE FIRST, but if cached version
  // is from an old deploy, the bumped CACHE_VERSION cleared it on activate.
  // So in practice this only ever hits assets matching the current version.
  if (
    url.origin === self.location.origin ||
    /\.(woff2?|ttf|otf|png|jpg|svg|ico|css|js)$/.test(url.pathname)
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(RUNTIME_CACHE).then((c) => c.put(request, copy));
          }
          return res;
        });
      })
    );
  }
});

// Allow page to ask SW to skip waiting (for our PWAInstaller to trigger update)
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
