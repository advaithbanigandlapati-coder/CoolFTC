"use client";
import { useState, useEffect } from "react";

// Published Expo project URL. Set via NEXT_PUBLIC_EXPO_URL env var in Vercel.
// Fallback is the unpublished dev server URL (won't work unless eas update is run).
const EXPO_URL = process.env.NEXT_PUBLIC_EXPO_URL ?? "";
const APK_URL = process.env.NEXT_PUBLIC_APK_URL ?? "";

export default function MobilePage() {
  const [tab, setTab] = useState<"pwa" | "expo" | "apk" | "ios">("pwa");
  const [siteUrl, setSiteUrl] = useState("");

  useEffect(() => {
    setSiteUrl(window.location.origin);
  }, []);

  // Generate a QR code via a free public API
  const qrUrl = (text: string, size = 240) =>
    `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(text)}&bgcolor=0F0F17&color=FF5A1F&margin=10`;

  return (
    <div className="p-6 max-w-3xl">
      <div className="mb-6">
        <p className="font-mono text-[10px] text-accent tracking-widest mb-1">MOBILE APP</p>
        <h1 className="font-display text-4xl font-black tracking-wide">GET COOLFTC ON YOUR PHONE</h1>
        <p className="text-white/50 text-sm mt-2">
          Four ways to run CoolFTC on mobile. Each is self-serve — no admin setup needed.
        </p>
      </div>

      <div className="flex gap-1 border-b border-white/[0.065] mb-6 overflow-x-auto">
        {[
          { id: "pwa",  l: "PWA INSTALL"  },
          { id: "expo", l: "EXPO GO" },
          { id: "apk",  l: "ANDROID APK" },
          { id: "ios",  l: "iOS (CABLE)" },
        ].map((t) => (
          <button key={t.id} onClick={() => setTab(t.id as "pwa" | "expo" | "apk" | "ios")}
            className={`px-4 py-2 font-mono text-[11px] tracking-widest whitespace-nowrap transition-colors ${tab === t.id ? "text-accent border-b border-accent" : "text-white/40 hover:text-white/70"}`}>
            {t.l}
          </button>
        ))}
      </div>

      {/* PWA INSTALL — easiest, works on every phone with a browser */}
      {tab === "pwa" && (
        <div className="space-y-4">
          <div className="card p-5">
            <div className="flex items-center gap-3 mb-3">
              <h2 className="font-display text-xl font-black tracking-wide">INSTALL FROM BROWSER</h2>
              <span className="font-mono text-[9px] tracking-widest bg-ftc-green/10 text-ftc-green px-2 py-0.5 rounded">FASTEST</span>
            </div>
            <p className="text-sm text-white/70 mb-4">
              CoolFTC is a Progressive Web App (PWA). Any phone with a browser can install it to the home screen — no app store, no download, no signup. Works offline for scouting.
            </p>

            <div className="grid md:grid-cols-2 gap-6 items-start">
              {siteUrl && (
                <div className="flex flex-col items-center gap-2">
                  <div className="bg-[#0F0F17] rounded-lg p-3 border border-white/[0.065]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={qrUrl(siteUrl)} alt="QR code to scan" width={240} height={240} />
                  </div>
                  <div className="font-mono text-[10px] text-white/40">SCAN WITH YOUR PHONE</div>
                  <div className="font-mono text-xs text-white/60 break-all text-center">{siteUrl}</div>
                </div>
              )}

              <div>
                <div className="font-display text-sm font-black tracking-wide text-accent mb-3">iPHONE (Safari)</div>
                <ol className="space-y-1 text-xs text-white/70 mb-5">
                  <li>1. Scan the QR code with your camera</li>
                  <li>2. Open the link in Safari</li>
                  <li>3. Tap the <strong>Share</strong> button</li>
                  <li>4. Scroll down, tap <strong>Add to Home Screen</strong></li>
                  <li>5. Tap <strong>Add</strong></li>
                </ol>

                <div className="font-display text-sm font-black tracking-wide text-accent mb-3">ANDROID (Chrome)</div>
                <ol className="space-y-1 text-xs text-white/70">
                  <li>1. Scan the QR code</li>
                  <li>2. Open in Chrome</li>
                  <li>3. Look for &ldquo;Install app&rdquo; banner (or menu → Install app)</li>
                  <li>4. Tap <strong>Install</strong></li>
                </ol>
              </div>
            </div>
          </div>

          <div className="card p-4 bg-ftc-green/[0.04] border border-ftc-green/20">
            <div className="font-mono text-[10px] text-ftc-green tracking-widest mb-1">WHY PWA</div>
            <p className="text-xs text-white/60">
              Full-screen experience, works offline for scouting at events with bad Wi-Fi, auto-updates silently when we ship new features, no app store review delays. Same code as the website — everything you see here works there.
            </p>
          </div>
        </div>
      )}

      {/* EXPO GO — native app via Expo */}
      {tab === "expo" && (
        <div className="space-y-4">
          <div className="card p-5">
            <div className="flex items-center gap-3 mb-3">
              <h2 className="font-display text-xl font-black tracking-wide">EXPO GO</h2>
              <span className="font-mono text-[9px] tracking-widest bg-accent/10 text-accent px-2 py-0.5 rounded">NATIVE FEEL</span>
            </div>
            <p className="text-sm text-white/70 mb-4">
              Run CoolFTC as a native-like app inside Expo Go. Auto-updates when we push new builds. Works on iOS and Android.
            </p>

            {EXPO_URL ? (
              <div className="grid md:grid-cols-2 gap-6 items-start">
                <div className="flex flex-col items-center gap-2">
                  <div className="bg-[#0F0F17] rounded-lg p-3 border border-white/[0.065]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={qrUrl(EXPO_URL)} alt="Expo QR code" width={240} height={240} />
                  </div>
                  <div className="font-mono text-[10px] text-white/40">SCAN IN EXPO GO</div>
                </div>
                <div>
                  <ol className="space-y-3 text-sm text-white/80">
                    <li className="flex gap-3">
                      <span className="font-mono text-accent font-bold">1.</span>
                      <div>
                        Install Expo Go:
                        <div className="flex flex-col gap-1 mt-1.5">
                          <a href="https://apps.apple.com/app/expo-go/id982107779" target="_blank" rel="noreferrer" className="font-mono text-xs text-accent hover:underline">→ iOS App Store</a>
                          <a href="https://play.google.com/store/apps/details?id=host.exp.exponent" target="_blank" rel="noreferrer" className="font-mono text-xs text-accent hover:underline">→ Google Play</a>
                        </div>
                      </div>
                    </li>
                    <li className="flex gap-3">
                      <span className="font-mono text-accent font-bold">2.</span>
                      <div>Open Expo Go, tap <strong>Scan QR code</strong> (iOS 15+: use your camera directly).</div>
                    </li>
                    <li className="flex gap-3">
                      <span className="font-mono text-accent font-bold">3.</span>
                      <div>Scan the code to the left. CoolFTC loads.</div>
                    </li>
                    <li className="flex gap-3">
                      <span className="font-mono text-accent font-bold">4.</span>
                      <div>Sign in with your CoolFTC account.</div>
                    </li>
                  </ol>
                </div>
              </div>
            ) : (
              <div className="card p-4 bg-amber-400/[0.04] border border-amber-400/20">
                <div className="font-mono text-[10px] text-amber-400 tracking-widest mb-1">NOT YET PUBLISHED</div>
                <p className="text-xs text-white/70">
                  The Expo native app hasn&apos;t been published yet. In the meantime, install the PWA — it gives you the same experience through your browser. Ask your team admin to run <code className="font-mono text-xs bg-black/30 px-1 rounded">eas update --channel production</code> and set <code className="font-mono text-xs bg-black/30 px-1 rounded">NEXT_PUBLIC_EXPO_URL</code> in Vercel.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ANDROID APK */}
      {tab === "apk" && (
        <div className="space-y-4">
          <div className="card p-5">
            <div className="flex items-center gap-3 mb-3">
              <h2 className="font-display text-xl font-black tracking-wide">ANDROID APK</h2>
              <span className="font-mono text-[9px] tracking-widest bg-amber-400/10 text-amber-400 px-2 py-0.5 rounded">EXPERIMENTAL</span>
            </div>
            <p className="text-sm text-white/70 mb-4">
              Standalone Android app, no Expo Go required. Install with a one-click sideload.
            </p>

            {APK_URL ? (
              <div className="space-y-3">
                <a href={APK_URL} className="btn-primary inline-block px-6 py-3" download>
                  ↓ Download APK
                </a>
                <ol className="space-y-2 text-sm text-white/70 mt-4">
                  <li>1. Tap the download button above.</li>
                  <li>2. On your Android phone: Settings → Security → <strong>Install unknown apps</strong> → enable for your browser.</li>
                  <li>3. Open the downloaded APK file, tap <strong>Install</strong>.</li>
                  <li>4. Open CoolFTC, sign in.</li>
                </ol>
              </div>
            ) : (
              <div className="card p-4 bg-amber-400/[0.04] border border-amber-400/20">
                <div className="font-mono text-[10px] text-amber-400 tracking-widest mb-1">APK NOT PUBLISHED</div>
                <p className="text-xs text-white/70">
                  Admin must run <code className="font-mono text-xs bg-black/30 px-1 rounded">eas build --platform android --profile preview</code> from <code className="font-mono text-xs bg-black/30 px-1 rounded">apps/mobile</code>, host the resulting APK (GitHub Releases, S3, or direct link), then set <code className="font-mono text-xs bg-black/30 px-1 rounded">NEXT_PUBLIC_APK_URL</code> in Vercel.
                </p>
              </div>
            )}
          </div>

          <div className="card p-4 bg-amber-400/[0.04] border border-amber-400/20">
            <h3 className="font-mono text-[10px] text-amber-400 tracking-widest mb-1">HEADS UP</h3>
            <ul className="text-xs text-white/60 space-y-1 list-disc list-inside">
              <li>Not signed with Google Play — Chrome shows a warning during download</li>
              <li>No auto-update — reinstall when we push a new version</li>
              <li>May need to disable Play Protect temporarily</li>
            </ul>
          </div>
        </div>
      )}

      {/* iOS with Xcode */}
      {tab === "ios" && (
        <div className="space-y-4">
          <div className="card p-5">
            <div className="flex items-center gap-3 mb-3">
              <h2 className="font-display text-xl font-black tracking-wide">iOS — USB install</h2>
              <span className="font-mono text-[9px] tracking-widest bg-amber-400/10 text-amber-400 px-2 py-0.5 rounded">EXPERIMENTAL · NEEDS MAC</span>
            </div>
            <p className="text-sm text-white/70 mb-4">
              Apple doesn&apos;t let you download arbitrary iOS apps from the web. Two paths:
            </p>

            <div className="space-y-5">
              <div>
                <h3 className="font-display text-sm font-black tracking-wide text-accent mb-2">OPTION A — Expo Go (recommended, no Mac needed)</h3>
                <p className="text-xs text-white/60">
                  Install Expo Go from the App Store, scan the QR in the <strong>EXPO GO</strong> tab. Skip the rest of this page.
                </p>
              </div>

              <div>
                <h3 className="font-display text-sm font-black tracking-wide mb-2">OPTION B — Xcode + Lightning/USB-C cable</h3>
                <p className="text-xs text-white/60 mb-3">
                  For when an admin wants to install directly from their Mac onto an iPhone. Requires Xcode, a free Apple ID, and a cable.
                </p>
                <ol className="space-y-2 text-xs text-white/70">
                  <li className="flex gap-2">
                    <span className="font-mono text-accent font-bold">1.</span>
                    On the Mac: <code className="font-mono text-[10px] bg-black/30 px-1 rounded">cd apps/mobile && npx expo prebuild --platform ios && cd ios && pod install</code>
                  </li>
                  <li className="flex gap-2">
                    <span className="font-mono text-accent font-bold">2.</span>
                    Open the generated <code className="font-mono text-[10px] bg-black/30 px-1 rounded">.xcworkspace</code> in Xcode
                  </li>
                  <li className="flex gap-2">
                    <span className="font-mono text-accent font-bold">3.</span>
                    Plug iPhone in. Xcode → Signing &amp; Capabilities → pick your personal Apple ID team
                  </li>
                  <li className="flex gap-2">
                    <span className="font-mono text-accent font-bold">4.</span>
                    Select the phone as run target, press <strong>⌘R</strong>
                  </li>
                  <li className="flex gap-2">
                    <span className="font-mono text-accent font-bold">5.</span>
                    On the phone: Settings → General → VPN &amp; Device Management → trust the developer profile
                  </li>
                  <li className="flex gap-2">
                    <span className="font-mono text-accent font-bold">6.</span>
                    Free Apple ID builds expire after 7 days; paid Developer ($99/yr) lasts 1 year
                  </li>
                </ol>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
