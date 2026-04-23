"use client";
import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";

const sb = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

const QUICK_STATS = [
  { label: "Teams Scouted", key: "scouted", icon: "▣", color: "text-ftc-green" },
  { label: "Match Entries",  key: "matches", icon: "◎", color: "text-ftc-blue" },
  { label: "Forge Sims",     key: "sims",    icon: "🔮", color: "text-accent" },
  { label: "ARIA Sessions",  key: "aria",    icon: "⚡", color: "text-ftc-amber" },
];

export default function DashboardPage() {
  const [org, setOrg] = useState<{ name: string; ftc_team_number: string | null } | null>(null);
  const [stats, setStats] = useState({ scouted: 0, matches: 0, sims: 0, aria: 0 });
  const [recentActivity, setRecentActivity] = useState<{ label: string; time: string; type: string }[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "no_org" | "error">("loading");
  const [errMsg, setErrMsg] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const { data: { user } } = await sb.auth.getUser();
        if (!user) { setLoadState("error"); setErrMsg("Not signed in"); return; }

        const { data: member, error: memberErr } = await sb
          .from("org_members")
          .select("org_id, organizations(name, ftc_team_number)")
          .eq("user_id", user.id)
          .limit(1)
          .maybeSingle();

        if (memberErr) { setLoadState("error"); setErrMsg(memberErr.message); return; }
        if (!member) { setLoadState("no_org"); return; }

        const orgId = member.org_id;
        const orgData = member.organizations as unknown as { name: string; ftc_team_number: string | null };
        setOrg(orgData);

        const [{ count: sc }, { count: mc }, { count: fc }, { count: ac }] = await Promise.all([
          sb.from("scouting_entries").select("id", { count: "exact", head: true }).eq("org_id", orgId),
          sb.from("match_scouting").select("id", { count: "exact", head: true }).eq("org_id", orgId),
          sb.from("forge_simulations").select("id", { count: "exact", head: true }).eq("org_id", orgId),
          sb.from("aria_sessions").select("id", { count: "exact", head: true }).eq("org_id", orgId),
        ]);
        setStats({ scouted: sc ?? 0, matches: mc ?? 0, sims: fc ?? 0, aria: ac ?? 0 });

        const { data: recent } = await sb.from("match_scouting")
          .select("team_number, match_number, scouted_at")
          .eq("org_id", orgId).order("scouted_at", { ascending: false }).limit(5);
        setRecentActivity((recent ?? []).map((r) => ({
          label: `Match ${r.match_number} - Team ${r.team_number}`,
          time: new Date(r.scouted_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          type: "scout",
        })));
        setLoadState("ready");
      } catch (e) {
        setLoadState("error");
        setErrMsg(e instanceof Error ? e.message : String(e));
      }
    }
    load();
  }, []);

  const statValues: Record<string, number> = stats;

  // Friendly states when user hasn't been onboarded yet
  if (loadState === "no_org") {
    return (
      <div className="p-6 max-w-2xl">
        <div className="card p-8">
          <div className="font-mono text-[10px] text-accent tracking-widest mb-2">SETUP REQUIRED</div>
          <h1 className="font-display text-2xl font-black tracking-wide mb-3">Welcome to CoolFTC</h1>
          <p className="text-sm text-white/60 mb-6 leading-relaxed">
            Your account isn&apos;t linked to a team yet. You can create your own org or ask a teammate to invite you from their Settings → Members tab.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <a href="/app/settings" className="btn-primary inline-block px-6 py-2 text-center">
              Create or Join an Org →
            </a>
            <a href="/app/settings" className="btn-ghost inline-block px-6 py-2 text-center text-sm">
              Go to Settings
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (loadState === "error") {
    return (
      <div className="p-6 max-w-2xl">
        <div className="card p-6 border border-ftc-red/30">
          <div className="font-mono text-[10px] text-ftc-red tracking-widest mb-2">SOMETHING BROKE</div>
          <p className="text-sm text-white/70 mb-2">Couldn&apos;t load your dashboard.</p>
          <p className="font-mono text-xs text-white/40 mb-4">{errMsg}</p>
          <button onClick={() => window.location.reload()} className="btn text-sm">Reload</button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl">
      <div className="mb-8">
        <p className="font-mono text-[10px] text-accent tracking-widest uppercase mb-1">Dashboard</p>
        <h1 className="font-display text-5xl font-black tracking-wide text-white">
          {org ? org.name.toUpperCase() : "LOADING…"}
        </h1>
        {org?.ftc_team_number && (
          <p className="font-mono text-sm text-white/40 mt-1">Team #{org.ftc_team_number} · 2025–26 Season</p>
        )}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        {QUICK_STATS.map(({ label, key, icon, color }) => (
          <div key={key} className="card p-4">
            <div className={`text-2xl mb-2 ${color}`}>{icon}</div>
            <div className="font-display text-4xl font-black text-white">{statValues[key]}</div>
            <div className="font-mono text-[10px] text-white/40 mt-1 tracking-wider uppercase">{label}</div>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {/* Quick actions */}
        <div className="card p-5">
          <h2 className="font-display text-xl font-black tracking-wide mb-4">QUICK ACTIONS</h2>
          <div className="space-y-2">
            {[
              { href: "/app/scout", label: "Scout a match", icon: "▣", desc: "Open match scouting form" },
              { href: "/app/aria", label: "Ask ARIA", icon: "⚡", desc: "Strategy AI — combine modules" },
              { href: "/app/forge", label: "Run simulation", icon: "🔮", desc: "Monte Carlo match sim" },
              { href: "/app/warroom", label: "War Room", icon: "🏰", desc: "Alliance selection board" },
            ].map(({ href, label, icon, desc }) => (
              <a key={href} href={href} className="flex items-center gap-3 p-3 rounded-lg bg-surface2 hover:bg-surface3 transition-colors group">
                <span className="text-xl">{icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-white group-hover:text-accent transition-colors">{label}</div>
                  <div className="text-xs text-white/40 font-mono">{desc}</div>
                </div>
                <span className="text-white/20 group-hover:text-accent transition-colors">→</span>
              </a>
            ))}
          </div>
        </div>

        {/* Recent activity */}
        <div className="card p-5">
          <h2 className="font-display text-xl font-black tracking-wide mb-4">RECENT ACTIVITY</h2>
          {recentActivity.length === 0 ? (
            <div className="text-center py-8 text-white/20 font-mono text-xs">No activity yet — start scouting!</div>
          ) : (
            <div className="space-y-2">
              {recentActivity.map((a, i) => (
                <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg bg-surface2">
                  <span className="w-2 h-2 rounded-full bg-ftc-green flex-shrink-0" />
                  <span className="text-sm text-white/70 flex-1">{a.label}</span>
                  <span className="font-mono text-[10px] text-white/30">{a.time}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
