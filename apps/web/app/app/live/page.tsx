"use client";
import { useEffect, useState, useRef } from "react";
import { createBrowserClient } from "@supabase/ssr";

const sb = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

type TeamStat  = { team_number:string; rank:number|null; opr:number|null; wins:number; losses:number; high_score:number|null; ftc_teams?:{team_name:string|null} };
type MatchResult = { match_number:number; match_type:string; red_score:number|null; blue_score:number|null; red_teams:string[]; blue_teams:string[]; played:boolean; scheduled_time?:string };
type Tab = "standings" | "schedule" | "scores";

export default function LivePage() {
  const [tab,         setTab]         = useState<Tab>("standings");
  const [eventKey,    setEventKey]    = useState("");
  const [myTeam,      setMyTeam]      = useState("");
  const [stats,       setStats]       = useState<TeamStat[]>([]);
  const [matches,     setMatches]     = useState<MatchResult[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date|null>(null);
  const [loading,     setLoading]     = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const timerRef = useRef<ReturnType<typeof setInterval>|null>(null);

  async function fetchStats() {
    setLoading(true);
    const { data } = await sb
      .from("team_stats_cache")
      .select("*, ftc_teams(team_name)")
      .eq("event_key", eventKey)
      .order("rank", { nullsFirst: false })
      .limit(80);
    setStats((data as TeamStat[]) ?? []);
    setLastUpdated(new Date());
    setLoading(false);
  }

  async function fetchMatches() {
    const { data } = await sb
      .from("match_results")
      .select("*")
      .eq("event_key", eventKey)
      .order("match_number", { ascending: true })
      .limit(100);
    setMatches((data as MatchResult[]) ?? []);
  }

  useEffect(() => {
    fetchStats(); fetchMatches();
    sb.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data: m } = await sb.from("org_members").select("org_id,organizations(ftc_team_number)").eq("user_id", user.id).maybeSingle();
      if (m) setMyTeam((m.organizations as unknown as {ftc_team_number:string|null}|null)?.ftc_team_number ?? "");
    });
  }, [eventKey]);

  // Auto-refresh every 45s when enabled
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (autoRefresh) {
      timerRef.current = setInterval(() => { fetchStats(); fetchMatches(); }, 45000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [autoRefresh, eventKey]);

  // Supabase realtime for stats
  useEffect(() => {
    const ch = sb.channel(`live:${eventKey}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "team_stats_cache", filter: `event_key=eq.${eventKey}` }, () => { fetchStats(); })
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [eventKey]);

  const myRow = stats.find(s => s.team_number === myTeam);

  // Next unplayed match featuring my team
  const nextMatch = matches.find(m => !m.played && [...m.red_teams, ...m.blue_teams].includes(myTeam));
  const matchesUntilMine = nextMatch
    ? matches.filter(m => !m.played && m.match_number < nextMatch.match_number).length
    : null;

  return (
    <div className="p-6 max-w-4xl">
      <div className="mb-4">
        <p className="font-mono text-[10px] text-accent tracking-widest mb-1">LIVE INTEL</p>
        <h1 className="font-display text-4xl font-black tracking-wide">MATCH INTELLIGENCE</h1>
      </div>

      {/* Controls */}
      <div className="flex gap-3 mb-5 flex-wrap items-center">
        <input className="input w-52" placeholder="Event key" value={eventKey} onChange={e => setEventKey(e.target.value)} />
        <input className="input w-32" placeholder="My team #" value={myTeam} onChange={e => setMyTeam(e.target.value)} />
        <button className="btn-ghost" onClick={() => { fetchStats(); fetchMatches(); }} disabled={loading}>
          {loading ? "Fetching…" : "↻"}
        </button>
        <label className="flex items-center gap-1.5 font-mono text-xs text-white/40 cursor-pointer">
          <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} className="accent-accent" />
          Auto-refresh
        </label>
        {lastUpdated && <span className="font-mono text-[10px] text-white/30">{lastUpdated.toLocaleTimeString()}</span>}
        <span className="flex items-center gap-1.5 font-mono text-xs text-white/40 ml-auto">
          <span className="w-1.5 h-1.5 rounded-full bg-ftc-green animate-pulse" />LIVE
        </span>
      </div>

      {/* My team + next match banner */}
      {(myRow || nextMatch) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5">
          {myRow && (
            <div className="card p-4 border-accent/30">
              <div className="font-mono text-[10px] text-accent tracking-widest mb-2">YOUR TEAM #{myTeam}</div>
              <div className="flex gap-6">
                {[["Rank", `#${myRow.rank ?? "–"}`], ["OPR", (myRow.opr ?? 0).toFixed(1)], ["W-L", `${myRow.wins}–${myRow.losses}`], ["High", String(myRow.high_score ?? "–")]].map(([l, v]) => (
                  <div key={l}>
                    <div className="font-display text-2xl font-black text-accent">{v}</div>
                    <div className="font-mono text-[9px] text-white/40 mt-0.5">{l}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {nextMatch && (
            <div className="card p-4 border-ftc-green/30">
              <div className="font-mono text-[10px] text-ftc-green tracking-widest mb-2">NEXT MATCH</div>
              <div className="flex items-end gap-4">
                <div>
                  <div className="font-display text-2xl font-black">Q{nextMatch.match_number}</div>
                  <div className="font-mono text-[10px] text-white/40">QUAL MATCH</div>
                </div>
                {matchesUntilMine !== null && (
                  <div>
                    <div className="font-display text-2xl font-black text-amber-400">{matchesUntilMine}</div>
                    <div className="font-mono text-[10px] text-white/40">MATCHES UNTIL YOURS</div>
                  </div>
                )}
                <div className="ml-auto text-right">
                  <div className="font-mono text-xs text-red-400">{nextMatch.red_teams.join(", ")}</div>
                  <div className="font-mono text-[10px] text-white/30">vs</div>
                  <div className="font-mono text-xs text-blue-400">{nextMatch.blue_teams.join(", ")}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-white/[0.065] mb-4">
        {(["standings", "schedule", "scores"] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 font-mono text-[11px] tracking-widest transition-colors ${tab === t ? "text-accent border-b border-accent" : "text-white/40 hover:text-white/70"}`}>
            {t.toUpperCase()}
          </button>
        ))}
      </div>

      {/* ── Standings ── */}
      {tab === "standings" && (
        <div className="card overflow-hidden">
          <div className="grid grid-cols-5 bg-white/[0.04] border-b border-white/[0.065]">
            {["RANK","TEAM","OPR","W–L","HIGH"].map(h => (
              <div key={h} className="px-3 py-2 font-mono text-[9px] text-white/40 tracking-widest">{h}</div>
            ))}
          </div>
          {stats.length === 0 ? (
            <div className="text-center py-12 text-white/20 font-mono text-sm">
              No data for {eventKey}.<br/>Sync from Settings → Event.
            </div>
          ) : stats.map(s => (
            <div key={s.team_number}
              className={`grid grid-cols-5 border-b border-white/[0.03] last:border-0 ${s.team_number === myTeam ? "bg-accent/5 border-l-2 border-l-accent" : ""}`}>
              <div className="px-3 py-2.5 font-mono text-xs text-white/50">{s.rank ?? "–"}</div>
              <div className="px-3 py-2.5 font-mono text-xs text-white/80 truncate">
                {s.team_number} <span className="text-white/30">{(s.ftc_teams as unknown as {team_name:string|null}|undefined)?.team_name?.slice(0,16)}</span>
              </div>
              <div className="px-3 py-2.5 font-mono text-xs text-white/70">{(s.opr ?? 0).toFixed(1)}</div>
              <div className="px-3 py-2.5 font-mono text-xs text-white/70">{s.wins}–{s.losses}</div>
              <div className="px-3 py-2.5 font-mono text-xs text-white/50">{s.high_score ?? "–"}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Schedule ── */}
      {tab === "schedule" && (
        <div className="space-y-2">
          {matches.length === 0 ? (
            <div className="text-center py-12 text-white/20 font-mono text-sm">No schedule data. Sync from Settings.</div>
          ) : matches.map(m => {
            const isMyMatch = [...m.red_teams, ...m.blue_teams].includes(myTeam);
            return (
              <div key={m.match_number}
                className={`card p-3 flex items-center gap-4 ${isMyMatch ? "border-accent/40" : ""} ${m.played ? "opacity-50" : ""}`}>
                <div className="w-12 text-center">
                  <div className="font-display font-black text-lg">{m.match_number}</div>
                  <div className="font-mono text-[9px] text-white/30">{m.match_type?.toUpperCase()}</div>
                </div>
                <div className="flex-1 flex gap-4">
                  <div>
                    <div className="font-mono text-[9px] text-red-400/70 mb-0.5">RED</div>
                    <div className="font-mono text-xs text-white/70">{m.red_teams?.join(", ")}</div>
                  </div>
                  <div className="text-white/20 self-center font-mono text-xs">vs</div>
                  <div>
                    <div className="font-mono text-[9px] text-blue-400/70 mb-0.5">BLUE</div>
                    <div className="font-mono text-xs text-white/70">{m.blue_teams?.join(", ")}</div>
                  </div>
                </div>
                {m.played && (
                  <div className="text-right font-mono text-xs">
                    <span className="text-red-400">{m.red_score}</span>
                    <span className="text-white/20 mx-1">–</span>
                    <span className="text-blue-400">{m.blue_score}</span>
                  </div>
                )}
                {isMyMatch && !m.played && (
                  <div className="font-mono text-[9px] text-accent border border-accent/30 rounded px-2 py-1">YOUR MATCH</div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Recent Scores ── */}
      {tab === "scores" && (
        <div className="space-y-2">
          {matches.filter(m => m.played).reverse().slice(0, 20).map(m => (
            <div key={m.match_number} className="card p-3 flex items-center gap-4">
              <div className="w-12 text-center font-display font-black text-lg">{m.match_number}</div>
              <div className="flex-1 flex items-center gap-2">
                <span className="font-mono text-xs text-white/50">{m.red_teams?.join(", ")}</span>
                <span className="font-display font-black text-red-400 text-lg">{m.red_score}</span>
                <span className="text-white/20">–</span>
                <span className="font-display font-black text-blue-400 text-lg">{m.blue_score}</span>
                <span className="font-mono text-xs text-white/50">{m.blue_teams?.join(", ")}</span>
              </div>
              <div className={`font-mono text-[10px] px-2 py-0.5 rounded ${(m.red_score ?? 0) > (m.blue_score ?? 0) ? "text-red-400 bg-red-400/10" : "text-blue-400 bg-blue-400/10"}`}>
                {(m.red_score ?? 0) > (m.blue_score ?? 0) ? "RED" : "BLUE"}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
