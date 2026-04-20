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

  useEffect(() => {
    async function load() {
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return;
      const { data: member } = await sb.from("org_members").select("org_id, organizations(name, ftc_team_number)").eq("user_id", user.id).limit(1).single();
      if (!member) return;
      const orgId = member.org_id;
      const orgData = member.organizations as unknown as { name: string; ftc_team_number: string | null };
      setOrg(orgData);

      // Load quick stats (no event scoping on dashboard)
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
        label: `Match ${r.match_number} — Team ${r.team_number}`,
        time: new Date(r.scouted_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        type: "scout",
      })));
    }
    load();
  }, []);

  const statValues: Record<string, number> = stats;

  return (
    <div className="p-6 max-w-5xl">
      <div className="mb-8">
        <p className="font-mono text-[10px] text-accent tracking-widest uppercase mb-1">Dashboard</p>
        <h1 className="font-display text-5xl font-black tracking-wide text-white">
          {org ? org.name.toUpperCase() : "LOADING…"}
        </h1>
        {org?.ftc_team_number && (
          <p className="font-mono text-sm text-white/40 mt-1">Team #{org.ftc_team_number} · DECODE 2025–26</p>
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
