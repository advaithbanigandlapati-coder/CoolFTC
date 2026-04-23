"use client";
import { useState, useEffect, useCallback } from "react";
import { createBrowserClient } from "@supabase/ssr";

const sb = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
const FTC_GQL = "https://api.ftcscout.org/graphql";
const FTC_SEASON = 2025;

async function ftcGql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const res = await fetch(FTC_GQL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query, variables }) });
  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors[0].message);
  return json.data as T;
}

type FTCTeam = { number: number; name: string; schoolName: string | null; city: string | null; stateProv: string | null; country: string | null };
type FTCTeamDetail = FTCTeam & { events: { event: { name: string; code: string }; ranking: { rank: number; wins: number; losses: number } | null }[] };
type Watchlist = { team_number: string; reason: string | null };
type Tab = "search" | "watchlist" | "worlds";

async function searchFTC(query: string): Promise<FTCTeam[]> {
  const num = parseInt(query, 10);
  if (!isNaN(num) && String(num) === query.trim()) {
    const d = await ftcGql<{ teamByNumber: FTCTeamDetail | null }>(`query($n:Int!,$s:Int!){teamByNumber(number:$n){number name schoolName city stateProv country events(season:$s){event{name code}ranking{rank wins losses}}}}`, { n: num, s: FTC_SEASON });
    if (d.teamByNumber) return [d.teamByNumber];
  }
  const d = await ftcGql<{ teamsSearch: FTCTeam[] }>(`query($q:String!,$s:Int!){teamsSearch(query:$q,season:$s){number name schoolName city stateProv country}}`, { q: query, s: FTC_SEASON });
  return d.teamsSearch ?? [];
}

async function getTeamDetail(number: number): Promise<FTCTeamDetail | null> {
  const d = await ftcGql<{ teamByNumber: FTCTeamDetail | null }>(`query($n:Int!,$s:Int!){teamByNumber(number:$n){number name schoolName city stateProv country events(season:$s){event{name code}ranking{rank wins losses}}}}`, { n: number, s: FTC_SEASON });
  return d.teamByNumber ?? null;
}

function teamLoc(t: FTCTeam) { return [t.city, t.stateProv, t.country].filter(Boolean).join(", "); }

export default function SeasonPage() {
  const [tab, setTab] = useState<Tab>("search");
  const [orgId, setOrgId] = useState("");
  const [userId, setUserId] = useState("");
  const [watchlist, setWatchlist] = useState<Watchlist[]>([]);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FTCTeam[]>([]);
  const [srchLoading, setSrchLoading] = useState(false);
  const [srchErr, setSrchErr] = useState("");

  const [expanded, setExpanded] = useState<FTCTeamDetail | null>(null);
  const [expandedNum, setExpandedNum] = useState<number | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [pendingTeam, setPendingTeam] = useState<FTCTeam | null>(null);
  const [reason, setReason] = useState("");
  const [qualPath, setQualPath] = useState({ currentPoints: "0", pointsNeeded: "0", nextEvent: "", qualified: false, notes: "" });

  useEffect(() => {
    sb.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      setUserId(user.id);
      const { data: m } = await sb.from("org_members").select("org_id").eq("user_id", user.id).maybeSingle();
      if (!m) return;
      setOrgId(m.org_id);
      const { data: wl } = await sb.from("watchlist").select("team_number,reason").eq("org_id", m.org_id);
      setWatchlist((wl ?? []) as Watchlist[]);
    });
  }, []);

  const doSearch = useCallback(async () => {
    if (!query.trim()) return;
    setSrchLoading(true); setSrchErr(""); setResults([]); setExpanded(null); setExpandedNum(null); setPendingTeam(null);
    try {
      const r = await searchFTC(query.trim());
      setResults(r);
      if (r.length === 0) setSrchErr("No teams found — try a different number or name.");
    } catch { setSrchErr("FTCscout unavailable. Check your connection."); }
    finally { setSrchLoading(false); }
  }, [query]);

  const openDetail = useCallback(async (t: FTCTeam) => {
    if (expandedNum === t.number) { setExpandedNum(null); setExpanded(null); return; }
    setExpandedNum(t.number); setExpanded(null); setDetailLoading(true);
    try { setExpanded(await getTeamDetail(t.number)); } finally { setDetailLoading(false); }
  }, [expandedNum]);

  const addWatch = useCallback(async (t: FTCTeam) => {
    if (!orgId) return;
    await sb.from("watchlist").upsert({ org_id: orgId, team_number: String(t.number), added_by: userId, reason: reason || null });
    const { data: wl } = await sb.from("watchlist").select("team_number,reason").eq("org_id", orgId);
    setWatchlist((wl ?? []) as Watchlist[]);
    setPendingTeam(null); setReason("");
  }, [orgId, userId, reason]);

  const removeWatch = useCallback(async (tn: string) => {
    await sb.from("watchlist").delete().eq("org_id", orgId).eq("team_number", tn);
    setWatchlist(w => w.filter(x => x.team_number !== tn));
  }, [orgId]);

  const inWatch = (n: number) => watchlist.some(w => w.team_number === String(n));
  const qualPct = Math.min(100, Math.round((parseInt(qualPath.currentPoints) / Math.max(1, parseInt(qualPath.pointsNeeded))) * 100));

  const TABS: { id: Tab; label: string }[] = [
    { id: "search", label: "FIND TEAMS" },
    { id: "watchlist", label: `WATCHLIST (${watchlist.length})` },
    { id: "worlds", label: "WORLDS TRACKER" },
  ];

  return (
    <div className="p-6 max-w-3xl">
      <div className="mb-4">
        <p className="font-mono text-[10px] text-accent tracking-widest mb-1">SEASON HUB</p>
        <h1 className="font-display text-4xl font-black tracking-wide">DECODE 25–26</h1>
        <p className="font-mono text-xs text-white/30 mt-1">All team data sourced live from FTCscout — zero fabrication.</p>
      </div>

      <div className="flex gap-1 border-b border-white/[0.065] mb-5">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 font-mono text-[11px] tracking-widest transition-colors ${tab === t.id ? "text-accent border-b border-accent" : "text-white/40 hover:text-white/70"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── FIND TEAMS ── */}
      {tab === "search" && (
        <div className="space-y-3">
          <div className="card p-4">
            <p className="font-mono text-[10px] text-white/40 mb-3">Search by team number or name — live from FTCscout API</p>
            <div className="flex gap-2">
              <input className="input flex-1" placeholder="30439 or team name…" value={query}
                onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === "Enter" && doSearch()} />
              <button className="btn text-sm" onClick={doSearch} disabled={srchLoading}>
                {srchLoading ? "…" : "Search →"}
              </button>
            </div>
            {srchErr && <p className="text-ftc-red text-xs font-mono mt-2">{srchErr}</p>}
          </div>

          {results.slice(0, 8).map(t => (
            <div key={t.number} className="card p-4">
              <div className="flex items-start justify-between">
                <button onClick={() => openDetail(t)} className="text-left flex-1">
                  <div className="font-display text-xl font-black text-accent">#{t.number}</div>
                  <div className="font-mono text-sm text-white/80">{t.name}</div>
                  <div className="font-mono text-xs text-white/40 mt-0.5">{teamLoc(t) || "—"}</div>
                </button>
                {inWatch(t.number)
                  ? <span className="font-mono text-xs text-ftc-green">WATCHING</span>
                  : <button onClick={() => { setPendingTeam(t); setReason(""); }} className="btn-ghost text-xs">+ Watch</button>
                }
              </div>

              {pendingTeam?.number === t.number && (
                <div className="mt-3 pt-3 border-t border-white/[0.065] space-y-2">
                  <input className="input w-full text-sm" placeholder="Note (optional)" value={reason} onChange={e => setReason(e.target.value)} />
                  <div className="flex gap-2">
                    <button className="btn text-xs flex-1" onClick={() => addWatch(t)}>Add to Watchlist</button>
                    <button className="btn-ghost text-xs flex-1" onClick={() => setPendingTeam(null)}>Cancel</button>
                  </div>
                </div>
              )}

              {expandedNum === t.number && (
                <div className="mt-3 pt-3 border-t border-white/[0.065]">
                  {detailLoading
                    ? <p className="font-mono text-xs text-white/30">Loading…</p>
                    : expanded ? (
                      <>
                        {expanded.schoolName && <p className="font-mono text-xs text-white/50 mb-2">🏫 {expanded.schoolName}</p>}
                        {expanded.events.length > 0 ? (
                          <table className="w-full font-mono text-xs">
                            <thead><tr className="text-white/30"><th className="text-left pb-1">Event</th><th className="text-right">Rank</th><th className="text-right">W-L</th></tr></thead>
                            <tbody>{expanded.events.map(ev => (
                              <tr key={ev.event.code} className="border-t border-white/[0.04]">
                                <td className="py-1 text-white/60 truncate max-w-[200px]">{ev.event.name}</td>
                                <td className="text-right text-accent">{ev.ranking ? `#${ev.ranking.rank}` : "—"}</td>
                                <td className="text-right text-white/40">{ev.ranking ? `${ev.ranking.wins}-${ev.ranking.losses}` : "—"}</td>
                              </tr>
                            ))}</tbody>
                          </table>
                        ) : <p className="font-mono text-xs text-white/30">No events this season yet.</p>}
                      </>
                    ) : null}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── WATCHLIST ── */}
      {tab === "watchlist" && (
        <div className="space-y-3">
          {watchlist.length === 0
            ? <p className="text-center py-10 font-mono text-sm text-white/20">No teams on watchlist. Search above and click + Watch.</p>
            : watchlist.map(w => (
              <div key={w.team_number} className="card p-4 flex items-center justify-between gap-4">
                <div>
                  <div className="font-display text-xl font-black text-accent">#{w.team_number}</div>
                  {w.reason && <div className="font-mono text-xs text-white/40 mt-0.5">{w.reason}</div>}
                </div>
                <button onClick={() => removeWatch(w.team_number)} className="font-mono text-xs text-red-400/60 hover:text-red-400">remove</button>
              </div>
            ))
          }
        </div>
      )}

      {/* ── WORLDS TRACKER ── */}
      {tab === "worlds" && (
        <div className="space-y-4">
          <div className="card p-4 space-y-3">
            <div className="font-mono text-[10px] text-accent tracking-widest">YOUR QUALIFICATION PATH</div>
            <p className="font-mono text-[10px] text-white/30">Track your own team&apos;s path to Worlds. Enter your numbers manually — no fabricated data here.</p>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Next event</label><input className="input w-full" placeholder="State Champ, League…" value={qualPath.nextEvent} onChange={e => setQualPath(q => ({ ...q, nextEvent: e.target.value }))} /></div>
              <div><label className="label">Current qual points</label><input className="input w-full" type="number" value={qualPath.currentPoints} onChange={e => setQualPath(q => ({ ...q, currentPoints: e.target.value }))} /></div>
              <div><label className="label">Points needed</label><input className="input w-full" type="number" value={qualPath.pointsNeeded} onChange={e => setQualPath(q => ({ ...q, pointsNeeded: e.target.value }))} /></div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 font-mono text-xs text-white/70 cursor-pointer">
                  <input type="checkbox" checked={qualPath.qualified} onChange={e => setQualPath(q => ({ ...q, qualified: e.target.checked }))} className="accent-accent" />
                  Worlds qualified ✓
                </label>
              </div>
            </div>
            {parseInt(qualPath.pointsNeeded) > 0 && (
              <>
                <div className="flex justify-between font-mono text-[10px] text-white/40 mb-1"><span>Progress</span><span>{qualPct}%</span></div>
                <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${qualPath.qualified ? "bg-ftc-green" : qualPct > 60 ? "bg-amber-400" : "bg-accent"}`} style={{ width: `${qualPct}%` }} />
                </div>
              </>
            )}
            {qualPath.qualified && <div className="bg-ftc-green/10 border border-ftc-green/30 rounded px-3 py-2 font-mono text-xs text-ftc-green">✓ Worlds qualified!</div>}
            <textarea className="input w-full h-16 resize-none text-sm" placeholder="Notes on qual path…" value={qualPath.notes} onChange={e => setQualPath(q => ({ ...q, notes: e.target.value }))} />
          </div>
          <div className="card p-4">
            <div className="font-mono text-[10px] text-white/40 tracking-widest mb-2">FOR OFFICIAL STANDINGS</div>
            <p className="font-mono text-xs text-white/30 leading-relaxed">
              Real-time qualification standings are on <a href="https://ftcscout.org" target="_blank" rel="noreferrer" className="text-accent underline">ftcscout.org</a> and the official FIRST website. 
              This tracker is for your own notes — we don&apos;t show fabricated standings here.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
