"use client";
import { useState } from "react";

export default function MobilePage() {
  const [tab, setTab] = useState<"expo" | "apk" | "ios">("expo");

  return (
    <div className="p-6 max-w-3xl">
      <div className="mb-6">
        <p className="font-mono text-[10px] text-accent tracking-widest mb-1">MOBILE APP</p>
        <h1 className="font-display text-4xl font-black tracking-wide">GET COOLFTC ON YOUR PHONE</h1>
        <p className="text-white/50 text-sm mt-2">
          The web app already works on phones — just visit this site in your mobile browser and tap &ldquo;Add to Home Screen.&rdquo;
          <br />For a native app experience (faster, offline-first), install one of the options below.
        </p>
      </div>

      <div className="flex gap-1 border-b border-white/[0.065] mb-6">
        {[
          { id: "expo", l: "EXPO GO (easiest)" },
          { id: "apk", l: "ANDROID APK" },
          { id: "ios", l: "iOS (lightning cable)" },
        ].map((t) => (
          <button key={t.id} onClick={() => setTab(t.id as "expo" | "apk" | "ios")}
            className={`px-4 py-2 font-mono text-[11px] tracking-widest whitespace-nowrap transition-colors ${tab === t.id ? "text-accent border-b border-accent" : "text-white/40 hover:text-white/70"}`}>
            {t.l}
          </button>
        ))}
      </div>

      {tab === "expo" && (
        <div className="space-y-4">
          <div className="card p-5">
            <div className="flex items-center gap-3 mb-3">
              <h2 className="font-display text-xl font-black tracking-wide">EXPO GO</h2>
              <span className="font-mono text-[9px] tracking-widest bg-ftc-green/10 text-ftc-green px-2 py-0.5 rounded">RECOMMENDED</span>
            </div>
            <p className="text-sm text-white/70 mb-4">
              Install Expo Go from the app store, then scan our QR code. The app updates automatically whenever we deploy — no reinstall needed.
              Works on iOS and Android.
            </p>

            <ol className="space-y-3 text-sm text-white/80">
              <li className="flex gap-3">
                <span className="font-mono text-accent font-bold">1.</span>
                <div>
                  <div>Install <strong>Expo Go</strong>:</div>
                  <div className="flex gap-2 mt-1.5 flex-wrap">
                    <a href="https://apps.apple.com/app/expo-go/id982107779" target="_blank" rel="noreferrer" className="font-mono text-xs bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded">iOS App Store →</a>
                    <a href="https://play.google.com/store/apps/details?id=host.exp.exponent" target="_blank" rel="noreferrer" className="font-mono text-xs bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded">Google Play →</a>
                  </div>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="font-mono text-accent font-bold">2.</span>
                <div>
                  Open Expo Go, tap <strong>Scan QR code</strong> (or use your phone&apos;s camera on iOS 15+).
                </div>
              </li>
              <li className="flex gap-3">
                <span className="font-mono text-accent font-bold">3.</span>
                <div>
                  <div className="mb-2">Ask your team admin for the current development QR code — it points to the Expo development server. It looks like:</div>
                  <code className="font-mono text-[10px] text-white/50 bg-black/30 px-2 py-1 rounded">exp://u.expo.dev/&lt;project-id&gt;?channel-name=production</code>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="font-mono text-accent font-bold">4.</span>
                <div>Sign in with your CoolFTC email. You&apos;re done — real-time scouting, notifications, everything.</div>
              </li>
            </ol>
          </div>

          <div className="card p-5 bg-surface2">
            <h3 className="font-display text-sm font-black tracking-wide mb-2">HOW TO GET THE QR CODE</h3>
            <p className="text-xs text-white/60">
              Your team admin runs <code className="font-mono text-white/80 bg-black/30 px-1.5 rounded">eas update --channel production</code> from the <code className="font-mono text-white/80">apps/mobile</code> directory.
              Expo then prints a QR code and a permanent link. Share that link with your team and they can rejoin anytime.
              The admin&apos;s laptop doesn&apos;t have to stay running — EAS Update hosts the bundle on Expo&apos;s infrastructure.
            </p>
          </div>
        </div>
      )}

      {tab === "apk" && (
        <div className="space-y-4">
          <div className="card p-5">
            <div className="flex items-center gap-3 mb-3">
              <h2 className="font-display text-xl font-black tracking-wide">ANDROID APK SIDELOAD</h2>
              <span className="font-mono text-[9px] tracking-widest bg-amber-400/10 text-amber-400 px-2 py-0.5 rounded">EXPERIMENTAL</span>
            </div>
            <p className="text-sm text-white/70 mb-4">
              For Android users who don&apos;t want Expo Go, you can install a standalone APK.
              We don&apos;t ship through Google Play (yet) — install by sideloading.
            </p>

            <ol className="space-y-3 text-sm text-white/80">
              <li className="flex gap-3">
                <span className="font-mono text-accent font-bold">1.</span>
                <div>
                  Have your team admin run <code className="font-mono text-xs text-white/80 bg-black/30 px-1.5 rounded">eas build --platform android --profile preview</code> from <code className="font-mono text-xs">apps/mobile</code>. EAS produces a downloadable <code className="font-mono text-xs">.apk</code>.
                </div>
              </li>
              <li className="flex gap-3">
                <span className="font-mono text-accent font-bold">2.</span>
                <div>
                  On your Android phone, Settings → Security → <strong>Install unknown apps</strong> → enable for your browser or file manager.
                </div>
              </li>
              <li className="flex gap-3">
                <span className="font-mono text-accent font-bold">3.</span>
                <div>Download the APK from the link your admin shared (it&apos;s a normal web download). Open it from your Downloads folder and tap <strong>Install</strong>.</div>
              </li>
              <li className="flex gap-3">
                <span className="font-mono text-accent font-bold">4.</span>
                <div>The app won&apos;t auto-update — when we ship a new build, your admin shares a new APK.</div>
              </li>
            </ol>
          </div>

          <div className="card p-4 bg-amber-400/[0.04] border border-amber-400/20">
            <h3 className="font-mono text-[10px] text-amber-400 tracking-widest mb-1">KNOWN LIMITS</h3>
            <ul className="text-xs text-white/60 space-y-1 list-disc list-inside">
              <li>Not code-signed with Google Play — Chrome will warn you</li>
              <li>No auto-update; must reinstall when new version drops</li>
              <li>May need to disable Play Protect for the install</li>
            </ul>
          </div>
        </div>
      )}

      {tab === "ios" && (
        <div className="space-y-4">
          <div className="card p-5">
            <div className="flex items-center gap-3 mb-3">
              <h2 className="font-display text-xl font-black tracking-wide">iOS — Lightning / USB-C sideload</h2>
              <span className="font-mono text-[9px] tracking-widest bg-amber-400/10 text-amber-400 px-2 py-0.5 rounded">EXPERIMENTAL</span>
            </div>
            <p className="text-sm text-white/70 mb-4">
              iOS doesn&apos;t allow downloading arbitrary apps from the web. Two legal paths:
            </p>

            <div className="space-y-5">
              <div>
                <h3 className="font-display text-sm font-black tracking-wide text-accent mb-2">OPTION A — Expo Go (no cable needed)</h3>
                <p className="text-xs text-white/60">Install Expo Go from the App Store, scan your team&apos;s QR. Skip the rest — see the &ldquo;Expo Go&rdquo; tab.</p>
              </div>

              <div>
                <h3 className="font-display text-sm font-black tracking-wide mb-2">OPTION B — USB install with Xcode (cable)</h3>
                <p className="text-xs text-white/60 mb-3">Useful when an admin wants to install on an iPhone directly from their Mac. Requires a Mac, free Apple ID, and a Lightning/USB-C cable.</p>
                <ol className="space-y-2 text-xs text-white/70">
                  <li className="flex gap-2"><span className="font-mono text-accent font-bold">1.</span>Admin: on the Mac, run <code className="font-mono text-[10px] bg-black/30 px-1 rounded">cd apps/mobile && npx expo prebuild --platform ios && cd ios && pod install</code></li>
                  <li className="flex gap-2"><span className="font-mono text-accent font-bold">2.</span>Open the generated <code className="font-mono text-[10px] bg-black/30 px-1 rounded">.xcworkspace</code> in Xcode</li>
                  <li className="flex gap-2"><span className="font-mono text-accent font-bold">3.</span>Plug in the iPhone via Lightning/USB-C. In Xcode: Signing &amp; Capabilities → select your personal Apple ID team</li>
                  <li className="flex gap-2"><span className="font-mono text-accent font-bold">4.</span>Pick the phone as run target, press <strong>⌘R</strong> to build + install</li>
                  <li className="flex gap-2"><span className="font-mono text-accent font-bold">5.</span>On the phone: Settings → General → VPN &amp; Device Management → trust the developer profile</li>
                  <li className="flex gap-2"><span className="font-mono text-accent font-bold">6.</span>Apps installed with a free Apple ID expire after 7 days and must be re-installed. Paid Apple Developer accounts ($99/yr) get 1 year.</li>
                </ol>
              </div>
            </div>
          </div>

          <div className="card p-4 bg-amber-400/[0.04] border border-amber-400/20">
            <h3 className="font-mono text-[10px] text-amber-400 tracking-widest mb-1">WHY CAN&apos;T I JUST DOWNLOAD AN IPA?</h3>
            <p className="text-xs text-white/60">
              Apple locks down iOS. IPA sideloading without Xcode requires an enterprise certificate (expensive, restricted) or a paid Developer Program app. For an FTC team, Expo Go or Xcode are your realistic options.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
