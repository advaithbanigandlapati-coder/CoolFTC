"use client";
import { useState, useEffect } from "react";
import { createBrowserClient } from "@supabase/ssr";

const sb = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

type WatchTeam   = { team_number:string; reason:string|null; ftc_teams:{team_name:string|null}|null };
type SeasonStat  = { event_key:string; event_name:string|null; opr:number|null; rank:number|null; wins:number; losses:number };
type Tab = "worlds" | "rivals" | "season";

const WORLDS_QUALS: { region: string; spots: number }[] = [
  { region: "FIRST Championship (Houston)", spots: 4 },
  { region: "Super-Regionals", spots: 2 },
  { region: "State / Province Championship", spots: 3 },
  { region: "League Tournament", spots: 1 },
];

export default function SeasonPage() {
  const [tab,        setTab]       = useState<Tab>("worlds");
  const [myTeam,     setMyTeam]    = useState("");
  const [orgId,      setOrgId]     = useState("");
  const [userId,     setUserId]    = useState("");
  const [watchlist,  setWatchlist] = useState<WatchTeam[]>([]);
  const [addInput,   setAddInput]  = useState({ team: "", reason: "" });
  const [seasonStats,setSeasonStats]=useState<Record<string, SeasonStat[]>>({});
  const [loading,    setLoading]   = useState(false);

  // Worlds qualification state (editable — track your own path)
  const [qualPath, setQualPath] = useState({
    nextEvent: "", currentPoints: "0", pointsNeeded: "0", eventsLeft: "2",
    qualified: false, notes: "",
  });

  useEffect(() => {
    sb.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      setUserId(user.id);
      const { data: m } = await sb.from("org_members").select("org_id,organizations(ftc_team_number)").eq("user_id", user.id).maybeSingle();
      if (!m) return;
      setOrgId(m.org_id);
      const tn = (m.organizations as unknown as {ftc_team_number:string|null}|null)?.ftc_team_number ?? "";
      setMyTeam(tn);
      const { data: wl } = await sb.from("watchlist").select("team_number,reason,ftc_teams(team_name)").eq("org_id", m.org_id);
      setWatchlist((wl ?? []) as unknown as WatchTeam[]);
    });
  }, []);

  async function loadSeasonStats(teamNumber: string) {
    if (!teamNumber || seasonStats[teamNumber]) return;
    setLoading(true);
    const { data } = await sb.from("team_season_stats").select("*").eq("team_number", teamNumber).order("event_key", { ascending: true });
    if (data) setSeasonStats(s => ({ ...s, [teamNumber]: data as SeasonStat[] }));
    setLoading(false);
  }

  async function addWatch() {
    if (!addInput.team || !orgId) return;
    await sb.from("watchlist").upsert({ org_id: orgId, team_number: addInput.team, added_by: userId, reason: addInput.reason || null });
    const { data: wl } = await sb.from("watchlist").select("team_number,reason,ftc_teams(team_name)").eq("org_id", orgId);
    setWatchlist((wl ?? []) as unknown as WatchTeam[]);
    setAddInput({ team: "", reason: "" });
    loadSeasonStats(addInput.team);
  }

  async function removeWatch(tn: string) {
    await sb.from("watchlist").delete().eq("org_id", orgId).eq("team_number", tn);
    setWatchlist(w => w.filter(x => x.team_number !== tn));
  }

  const qualPct = Math.min(100, Math.round((parseInt(qualPath.currentPoints) / Math.max(1, parseInt(qualPath.pointsNeeded))) * 100));

  return (
    <div className="p-6 max-w-3xl">
      <div className="mb-4">
        <p className="font-mono text-[10px] text-accent tracking-widest mb-1">SEASON-WIDE</p>
        <h1 className="font-display text-4xl font-black tracking-wide">SEASON HUB</h1>
      </div>

      <div className="flex gap-1 border-b border-white/[0.065] mb-5">
        {(["worlds", "rivals", "season"] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 font-mono text-[11px] tracking-widest transition-colors ${tab === t ? "text-accent border-b border-accent" : "text-white/40 hover:text-white/70"}`}>
            {t === "worlds" ? "WORLDS TRACKER" : t === "rivals" ? "RIVAL WATCHLIST" : "SEASON STATS"}
          </button>
        ))}
      </div>

      {/* ── WORLDS TRACKER ── */}
      {tab === "worlds" && (
        <div className="space-y-4">
          <div className="card p-4">
            <div className="font-mono text-[10px] text-accent tracking-widest mb-3">YOUR QUALIFICATION PATH</div>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div><label className="label">My team #</label><input className="input w-full" value={myTeam} onChange={e => setMyTeam(e.target.value)} /></div>
              <div><label className="label">Next event</label><input className="input w-full" placeholder="State Champ, League Tourn…" value={qualPath.nextEvent} onChange={e => setQualPath(q => ({ ...q, nextEvent: e.target.value }))} /></div>
              <div><label className="label">Current qual points</label><input className="input w-full" type="number" value={qualPath.currentPoints} onChange={e => setQualPath(q => ({ ...q, currentPoints: e.target.value }))} /></div>
              <div><label className="label">Points needed</label><input className="input w-full" type="number" value={qualPath.pointsNeeded} onChange={e => setQualPath(q => ({ ...q, pointsNeeded: e.target.value }))} /></div>
              <div><label className="label">Events remaining</label><input className="input w-full" type="number" value={qualPath.eventsLeft} onChange={e => setQualPath(q => ({ ...q, eventsLeft: e.target.value }))} /></div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 font-mono text-xs text-white/70 cursor-pointer">
                  <input type="checkbox" checked={qualPath.qualified} onChange={e => setQualPath(q => ({ ...q, qualified: e.target.checked }))} className="accent-accent" />
                  Worlds qualified ✓
                </label>
              </div>
            </div>

            {parseInt(qualPath.pointsNeeded) > 0 && (
              <>
                <div className="flex justify-between font-mono text-[10px] text-white/40 mb-1">
                  <span>Qualification progress</span><span>{qualPct}%</span>
                </div>
                <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${qualPath.qualified ? "bg-ftc-green" : qualPct > 60 ? "bg-amber-400" : "bg-accent"}`}
                    style={{ width: `${qualPct}%` }} />
                </div>
              </>
            )}

            {qualPath.qualified && (
              <div className="mt-3 bg-ftc-green/10 border border-ftc-green/30 rounded px-3 py-2 font-mono text-xs text-ftc-green">
                ✓ Worlds qualified! See you in Houston.
              </div>
            )}

            <textarea className="input w-full h-16 resize-none text-sm mt-3" placeholder="Notes on qualification path…"
              value={qualPath.notes} onChange={e => setQualPath(q => ({ ...q, notes: e.target.value }))} />
          </div>

          {/* Worlds qualification routes */}
          <div className="card overflow-hidden">
            <div className="font-mono text-[10px] text-white/40 tracking-widest px-4 py-3 border-b border-white/[0.065]">QUALIFICATION ROUTES</div>
            {WORLDS_QUALS.map(q => (
              <div key={q.region} className="flex items-center justify-between px-4 py-3 border-b border-white/[0.03] last:border-0">
                <span className="font-mono text-xs text-white/70">{q.region}</span>
                <span className="font-mono text-xs text-accent">{q.spots} spot{q.spots !== 1 ? "s" : ""}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── RIVAL WATCHLIST ── */}
      {tab === "rivals" && (
        <div className="space-y-4">
          <div className="card p-4 space-y-3">
            <div className="font-mono text-[10px] text-white/40 tracking-widest">ADD TO WATCHLIST</div>
            <div className="grid grid-cols-3 gap-2">
              <input className="input" placeholder="Team #" value={addInput.team} onChange={e => setAddInput(a => ({ ...a, team: e.target.value }))} />
              <input className="input col-span-2" placeholder="Reason (rival, worlds threat…)" value={addInput.reason} onChange={e => setAddInput(a => ({ ...a, reason: e.target.value }))} onKeyDown={e => e.key === "Enter" && addWatch()} />
            </div>
            <button onClick={addWatch} disabled={!addInput.team} className="btn text-sm">Add →</button>
          </div>

          {watchlist.length === 0 ? (
            <p className="text-center py-10 text-white/20 font-mono text-sm">No teams on watchlist yet.</p>
          ) : watchlist.map(w => (
            <div key={w.team_number} className="card p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-display font-black text-xl">Team {w.team_number}</span>
                    {w.ftc_teams?.team_name && <span className="font-mono text-xs text-white/40">{w.ftc_teams.team_name}</span>}
                  </div>
                  {w.reason && <p className="font-mono text-xs text-white/40">{w.reason}</p>}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => loadSeasonStats(w.team_number)} className="btn-ghost text-xs">Load history</button>
                  <button onClick={() => removeWatch(w.team_number)} className="font-mono text-xs text-red-400/60 hover:text-red-400">remove</button>
                </div>
              </div>

              {/* Season history mini chart */}
              {seasonStats[w.team_number] && seasonStats[w.team_number].length > 0 && (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full font-mono text-[10px]">
                    <thead><tr className="text-white/30">
                      <th className="text-left py-1">Event</th><th className="text-right">OPR</th><th className="text-right">Rank</th><th className="text-right">W-L</th>
                    </tr></thead>
                    <tbody>{seasonStats[w.team_number].map((s, i) => (
                      <tr key={i} className="border-t border-white/[0.04]">
                        <td className="py-1 text-white/60 truncate max-w-[160px]">{s.event_name ?? s.event_key}</td>
                        <td className="text-right text-white/70">{s.opr !== null ? s.opr.toFixed(1) : "–"}</td>
                        <td className="text-right text-white/50">#{s.rank ?? "–"}</td>
                        <td className="text-right text-white/50">{s.wins}–{s.losses}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── SEASON STATS ── */}
      {tab === "season" && (
        <div className="space-y-4">
          <p className="font-mono text-xs text-white/40">Track your own team's performance across the season.</p>
          <div className="flex gap-2">
            <input className="input w-40" placeholder="Team #" value={myTeam} onChange={e => setMyTeam(e.target.value)} />
            <button onClick={() => loadSeasonStats(myTeam)} disabled={loading || !myTeam} className="btn text-sm">
              {loading ? "Loading…" : "Load season →"}
            </button>
          </div>

          {seasonStats[myTeam]?.length > 0 && (
            <>
              <div className="grid grid-cols-3 gap-3">
                {[
                  ["Events", seasonStats[myTeam].length],
                  ["Best OPR", Math.max(...seasonStats[myTeam].map(s => s.opr ?? 0)).toFixed(1)],
                  ["Best Rank", `#${Math.min(...seasonStats[myTeam].map(s => s.rank ?? 999))}`],
                ].map(([l, v]) => (
                  <div key={l as string} className="card p-3 text-center">
                    <div className="font-display text-2xl font-black text-accent">{v}</div>
                    <div className="font-mono text-[9px] text-white/40 mt-1">{l as string}</div>
                  </div>
                ))}
              </div>

              <div className="card overflow-hidden">
                <div className="font-mono text-[10px] text-white/40 tracking-widest px-4 py-2 border-b border-white/[0.065]">EVENT HISTORY</div>
                {seasonStats[myTeam].map((s, i) => (
                  <div key={i} className="grid grid-cols-4 px-4 py-2.5 border-b border-white/[0.03] last:border-0">
                    <div className="font-mono text-xs text-white/60 col-span-2 truncate">{s.event_name ?? s.event_key}</div>
                    <div className="font-mono text-xs text-white/70 text-right">{s.opr !== null ? s.opr.toFixed(1) : "–"} OPR</div>
                    <div className="font-mono text-xs text-white/50 text-right">#{s.rank ?? "–"} · {s.wins}W</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
