"use client";
import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";

const NAV = [
  { href: "/app",            icon: "⬡", label: "Dashboard" },
  { href: "/app/scout",      icon: "▣", label: "Scout Suite" },
  { href: "/app/hive",       icon: "🧠", label: "Hive Mind" },
  { href: "/app/aria",       icon: "⚡", label: "ARIA" },
  { href: "/app/forge",      icon: "🔮", label: "Forge" },
  { href: "/app/warroom",    icon: "🏰", label: "War Room" },
  { href: "/app/live",       icon: "◎", label: "Live Intel" },
  { href: "/app/analytics",  icon: "◈", label: "Analytics" },
  { href: "/app/season",     icon: "◐", label: "Season Hub" },
  { href: "/app/notes",      icon: "▤", label: "Notes" },
  { href: "/app/teams",      icon: "◉", label: "Teams" },
  { href: "/app/courier",    icon: "◪", label: "Courier" },
  { href: "/app/changelog",  icon: "📋", label: "Changelog" },
  { href: "/app/settings",   icon: "⚙", label: "Settings" },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<{ display_name?: string } | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const supabase = useMemo(() => createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  ), []);

  useEffect(() => {
    // getSession() reads the cookie locally — no network call, never silently fails.
    // Middleware already guards this route so no redirect needed here.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser({ display_name: session.user.user_metadata?.display_name ?? session.user.email });
      }
      setAuthReady(true);
    });
  }, [supabase]);

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  // Don't render anything until auth is confirmed — prevents hydration mismatch
  if (!authReady) return null;

  const Sidebar = ({ mobile = false }: { mobile?: boolean }) => (
    <aside className={`${mobile ? "w-full" : collapsed ? "w-16" : "w-56"} bg-bg2 border-r border-white/[0.065] flex flex-col transition-all duration-200 h-full`}>
      <div className={`h-14 flex items-center ${collapsed ? "justify-center px-0" : "px-4"} border-b border-white/[0.065] flex-shrink-0`}>
        {!collapsed && (
          <span className="font-display text-xl font-black tracking-wider">
            COOL<span className="text-accent">FTC</span>
          </span>
        )}
        {collapsed && <span className="font-display text-xl font-black text-accent">C</span>}
        {!mobile && (
          <button onClick={() => setCollapsed(!collapsed)} className="ml-auto text-white/30 hover:text-white text-xs">
            {collapsed ? "→" : "←"}
          </button>
        )}
      </div>
      <nav className="flex-1 overflow-y-auto py-2">
        {NAV.map(({ href, icon, label }) => {
          const active = path === href || (href !== "/app" && path.startsWith(href));
          return (
            <Link key={href} href={href}
              onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-3 px-4 py-2.5 text-sm transition-colors
                ${active ? "text-accent bg-accent/10 border-r-2 border-accent" : "text-white/40 hover:text-white hover:bg-white/[0.04]"}`}
            >
              <span className="text-base flex-shrink-0">{icon}</span>
              {(!collapsed || mobile) && <span className="font-medium truncate">{label}</span>}
            </Link>
          );
        })}
      </nav>
      <div className={`p-3 border-t border-white/[0.065] flex-shrink-0 ${collapsed ? "items-center" : ""}`}>
        {!collapsed && user && (
          <div className="text-xs text-white/40 font-mono mb-2 truncate">{user.display_name}</div>
        )}
        <button onClick={signOut} className="text-xs text-white/30 hover:text-ftc-red transition-colors font-mono">
          {collapsed ? "→" : "Sign out"}
        </button>
      </div>
    </aside>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-bg">
      {/* Desktop sidebar */}
      <div className="hidden md:flex flex-col flex-shrink-0">
        <Sidebar />
      </div>

      {/* Mobile header */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 h-14 bg-bg2 border-b border-white/[0.065] flex items-center px-4 gap-3">
        <button onClick={() => setMobileOpen(!mobileOpen)} className="text-white/60 hover:text-white">
          <span className="font-display text-lg">{mobileOpen ? "✕" : "☰"}</span>
        </button>
        <span className="font-display text-xl font-black tracking-wider">COOL<span className="text-accent">FTC</span></span>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-black/50" onClick={() => setMobileOpen(false)}>
          <div className="w-64 h-full" onClick={(e) => e.stopPropagation()}>
            <Sidebar mobile />
          </div>
        </div>
      )}

      {/* Main content */}
      <main className="flex-1 overflow-y-auto mt-14 md:mt-0">
        {children}
      </main>
    </div>
  );
}
