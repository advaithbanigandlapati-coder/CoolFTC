"use client";
import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export default function PWAInstaller() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // ─── Service worker: register + handle silent updates ─────────────
    if ("serviceWorker" in navigator) {
      let reloading = false;

      // When the controller changes (new SW took over), reload silently
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (reloading) return;
        reloading = true;
        // Defer so any in-flight API calls have a chance to complete
        setTimeout(() => window.location.reload(), 100);
      });

      // SW broadcasts SW_UPDATED after activate — same effect, redundant safety
      navigator.serviceWorker.addEventListener("message", (event) => {
        if (event.data?.type === "SW_UPDATED" && !reloading) {
          reloading = true;
          setTimeout(() => window.location.reload(), 100);
        }
      });

      navigator.serviceWorker.register("/sw.js").then((reg) => {
        // Check for updates whenever the page becomes visible
        const checkForUpdate = () => reg.update().catch(() => { /* ignore */ });
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") checkForUpdate();
        });
        // Also poll every 30 min for long-open tabs
        setInterval(checkForUpdate, 30 * 60 * 1000);

        // If a waiting worker exists right now, activate it
        reg.addEventListener("updatefound", () => {
          const newWorker = reg.installing;
          if (!newWorker) return;
          newWorker.addEventListener("statechange", () => {
            if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
              // New SW ready → tell it to skip waiting; controllerchange handler reloads
              newWorker.postMessage({ type: "SKIP_WAITING" });
            }
          });
        });
      }).catch(() => { /* ignore registration errors */ });
    }

    // ─── PWA install prompt ───────────────────────────────────────────
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
