"use client";
import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

// Bump this on any SW change. Recovery key stored in localStorage.
const SW_EXPECTED_VERSION = "coolftc-v3";

export default function PWAInstaller() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // ─── SELF-HEAL: kill old broken service workers ─────────────────
    // Older versions (v1, v2) incorrectly intercepted navigation requests
    // which broke auth. If we detect any old SW, unregister it + purge caches.
    (async () => {
      if (!("serviceWorker" in navigator)) return;

      try {
        // Get all caches — if any are from old versions, we have a stale SW
        const cacheKeys = await caches.keys();
        const hasOldCache = cacheKeys.some(
          (k) => k.startsWith("coolftc-") && !k.startsWith(SW_EXPECTED_VERSION)
        );

        // Get all SW registrations
        const registrations = await navigator.serviceWorker.getRegistrations();

        // If there are old caches OR any waiting workers we couldn't activate,
        // nuke everything and reload. The fresh SW registration below will
        // install the good v3.
        if (hasOldCache) {
          await Promise.all(cacheKeys.map((k) => caches.delete(k)));
          await Promise.all(registrations.map((r) => r.unregister()));
          // Mark that we did a heal so we don't loop
          const healed = sessionStorage.getItem("coolftc-sw-healed");
          if (!healed) {
            sessionStorage.setItem("coolftc-sw-healed", "1");
            window.location.reload();
            return;
          }
        }

        // Normal path: register the fresh SW
        const reg = await navigator.serviceWorker.register("/sw.js");

        // Check for updates when tab becomes visible
        const checkForUpdate = () => reg.update().catch(() => {});
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") checkForUpdate();
        });
        // Poll every 30 min for long-open tabs
        setInterval(checkForUpdate, 30 * 60 * 1000);

        // Auto-activate new waiting workers
        reg.addEventListener("updatefound", () => {
          const newWorker = reg.installing;
          if (!newWorker) return;
          newWorker.addEventListener("statechange", () => {
            if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
              newWorker.postMessage({ type: "SKIP_WAITING" });
            }
          });
        });

        // When a new SW takes over, reload once (silently) to use its caching
        let reloading = false;
        navigator.serviceWorker.addEventListener("controllerchange", () => {
          if (reloading) return;
          reloading = true;
          setTimeout(() => window.location.reload(), 100);
        });
      } catch {
        // Any SW error is silent — the site works fine without a SW
      }
    })();

    // ─── PWA install prompt ──────────────────────────────────────────
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setInstalled(true);
      return;
    }
    try {
      if (sessionStorage.getItem("coolftc-pwa-dismissed") === "1") setDismissed(true);
    } catch { /* ignore */ }

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed || dismissed || !deferred) return null;

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    if (outcome === "accepted") setInstalled(true);
    setDeferred(null);
  }

  function dismiss() {
    setDismissed(true);
    try { sessionStorage.setItem("coolftc-pwa-dismissed", "1"); } catch { /* ignore */ }
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-xs card p-4 border border-accent/30 shadow-2xl">
      <div className="font-mono text-[10px] text-accent tracking-widest mb-1">INSTALL APP</div>
      <p className="text-xs text-white/70 mb-3">
        Add CoolFTC to your home screen for full-screen scouting and offline support.
      </p>
      <div className="flex gap-2">
        <button onClick={install} className="btn-primary text-xs px-3 py-1.5 flex-1">Install</button>
        <button onClick={dismiss} className="text-xs text-white/40 hover:text-white/70 px-2">Not now</button>
      </div>
    </div>
  );
}
