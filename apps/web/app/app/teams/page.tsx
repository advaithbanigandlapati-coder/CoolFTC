"use client";
import { useState, useEffect, useRef } from "react";
import { createBrowserClient } from "@supabase/ssr";

const sb = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type FTCTeam = {
  number: number;
  name: string;
  city: string | null;
  state: string | null;
  country: string | null;
  rookieYear: number | null;
};

type QuickStats = {
  totalOpr:  { value: number; rank: number };
  autoOpr:   { value: number; rank: number };
  teleopOpr: { value: number; rank: number };
  endgameOpr:{ value: number; rank: number };
} | null;

type LocalStat = {
  event_key: string;
  rank: number | null;
  wins: number;
  losses: number;
  opr: number | null;
};

export default function TeamsPage() {
  const [query,        setQuery]        = useState("");
  const [results,      setResults]      = useState<FTCTeam[]>([]);
  const [selected,     setSelected]     = useState<FTCTeam | null>(null);
  const [quickStats,   setQuickStats]   = useState<QuickStats>(null);
  const [localHistory, setLocalHistory] = useState<LocalStat[]>([]);
  const [orgId,        setOrgId]        = useState("");
  const [userId,       setUserId]       = useState("");
  const [loading,      setLoading]      = useState(false);
  const [statsLoading, setStatsLoading] = useState(false);
  const [watchAdded,   setWatchAdded]   = useState(false);
  const [searchErr,    setSearchErr]    = useState("");
  const [activeSeason, setActiveSeason] = useState(2025);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    sb.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      setUserId(user.id);
      const { data: m } = await sb
        .from("org_members")
        .select("org_id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!m) return;
      setOrgId(m.org_id);

      // Infer season from org's active event key
      const { data: orgRow } = await sb
        .from("organizations")
        .select("active_event_key")
        .eq("id", m.org_id)
        .maybeSingle();
      if (orgRow?.active_event_key) {
        const match = String(orgRow.active_event_key).match(/^(\d{4})-/);
        if (match) setActiveSeason(Number(match[1]));
      }
    });
  }, []);

  async function search(q: string) {
    if (!q.trim()) { setResults([]); setSearchErr(""); return; }
    setLoading(true); setSearchErr("");
    try {
      const r = await fetch(`/api/teams-search?q=${encodeURIComponent(q.trim())}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Search failed");
      const teams: FTCTeam[] = j.teams ?? [];
      setResults(teams);
      if (teams.length === 0) setSearchErr("No teams found — try a different name or number.");
    } catch (e) {
      setSearchErr(e instanceof Error ? e.message : "Search failed — check connection.");
    } finally {
      setLoading(false);
    }
  }

  function onInput(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value;
    setQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(q), 300);
  }

  async function selectTeam(t: FTCTeam) {
    setSelected(t);
    setResults([]);
    setWatchAdded(false);
    setQuickStats(null);
    setLocalHistory([]);
    setStatsLoading(true);

    // FTCScout OPR / quick stats
    try {
      const r = await fetch(`/api/analytics?action=quickStats&team=${t.number}&season=${activeSeason}`);
      const j = await r.json();
      if (r.ok && j.stats) setQuickStats(j.stats);
    } catch { /* non-fatal */ }

    // Local synced history
    const { data: localStats } = await sb
      .from("team_stats_cache")
      .select("event_key, rank, wins, losses, opr")
      .eq("team_number", String(t.number))
      .order("event_key", { ascending: false })
      .limit(10);
    setLocalHistory((localStats ?? []) as LocalStat[]);

    setStatsLoading(false);
  }

  async function addToWatchlist() {
    if (!orgId || !selected) return;
    await sb
      .from("watchlist")
      .upsert({ org_id: orgId, team_number: String(selected.number), added_by: userId, reason: null });
    setWatchAdded(true);
  }

  function oprColor(rank: number) {
    if (rank <= 50)  return "text-ftc-green";
    if (rank <= 200) return "text-accent";
    if (rank <= 500) return "text-amber-400";
    return "text-white/60";
  }

  return (
    <div className="p-6 max-w-3xl">
      <div className="mb-6">
        <p className="font-mono text-[10px] text-accent tracking-widest mb-1">GLOBAL DATABASE</p>
        <h1 className="font-display text-4xl font-black tracking-wide">TEAM SEARCH</h1>
        <p className="font-mono text-[11px] text-white/30 mt-1">
          Live search across all 10,000+ active FTC teams — powered by FTCScout.
        </p>
      </div>

      <div className="relative mb-5">
        <input
          className="input w-full pr-28 text-base"
          placeholder="Team number or name (e.g. 30439 or Cool Name Pending)…"
          value={query}
          onChange={onInput}
          autoFocus
        />
        {loading && (
          <span className="absolute right-4 top-1/2 -translate-y-1/2 font-mono text-[10px] text-white/30">
            searching…
          </span>
        )}
        {!loading && results.length > 0 && (
          <span className="absolute right-4 top-1/2 -translate-y-1/2 font-mono text-[9px] text-accent/60">
            FTCScout ●
          </span>
        )}
      </div>

      {searchErr && !loading && (
        <div className="font-mono text-xs text-white/40 mb-4">{searchErr}</div>
      )}

      {results.length > 0 && (
        <div className="card overflow-hidden mb-5 shadow-xl">
          {results.map((t) => (
            <button
              key={t.number}
              onClick={() => selectTeam(t)}
              className="w-full flex items-center gap-3 px-4 py-3 border-b border-white/[0.04] last:border-0 hover:bg-white/5 transition-colors text-left"
            >
              <span className="font-display font-black text-lg text-accent w-16 flex-shrink-0">
                {t.number}
              </span>
              <div>
                <div className="font-mono text-sm text-white/80">{t.name}</div>
                <div className="font-mono text-[10px] text-white/30">
                  {[t.city, t.state, t.country].filter(Boolean).join(", ")}
                  {t.rookieYear && (
                    <span className="ml-2 text-white/20">· Rookie {t.rookieYear}</span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div className="space-y-4">
          <div className="card p-5">
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="font-display text-5xl font-black text-accent">{selected.number}</div>
                <div className="font-mono text-lg text-white/80 mt-1">{selected.name}</div>
                <div className="font-mono text-xs text-white/40 mt-0.5">
                  {[selected.city, selected.state, selected.country].filter(Boolean).join(", ")}
                </div>
                {selected.rookieYear && (
                  <div className="font-mono text-[10px] text-white/25 mt-1">
                    Rookie Year {selected.rookieYear}
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <a
                  href={`https://ftcscout.org/teams/${selected.number}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-ghost text-xs"
                >
                  ↗ FTCScout
                </a>
                <button
                  onClick={addToWatchlist}
                  disabled={watchAdded}
                  className={`btn text-xs ${watchAdded ? "opacity-50" : ""}`}
                >
                  {watchAdded ? "✓ Watchlisted" : "+ Watchlist"}
                </button>
              </div>
            </div>
          </div>

          {/* OPR from FTCScout */}
          <div className="card p-5">
            <div className="font-mono text-[10px] text-white/40 tracking-widest mb-3">
              {activeSeason} SEASON OPR — FTCScout Live
            </div>
            {statsLoading ? (
              <div className="text-white/30 font-mono text-xs">Loading stats…</div>
            ) : quickStats ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {([
                  ["TOTAL OPR",  quickStats.totalOpr],
                  ["AUTO OPR",   quickStats.autoOpr],
                  ["TELEOP OPR", quickStats.teleopOpr],
                  ["EG OPR",     quickStats.endgameOpr],
                ] as [string, { value: number; rank: number }][]).map(([label, val]) => (
                  <div key={label} className="text-center">
                    <div className={`font-display text-3xl font-black ${oprColor(val.rank)}`}>
                      {val.value.toFixed(1)}
                    </div>
                    <div className="font-mono text-[9px] text-white/40 mt-0.5">{label}</div>
                    <div className="font-mono text-[9px] text-white/25">
                      Rank #{val.rank.toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-white/30 font-mono text-xs">
                No OPR data on FTCScout for this team in the {activeSeason} season yet.
                They may not have competed, or the event hasn&apos;t been indexed yet.
              </div>
            )}
          </div>

          {/* Local synced event history */}
          {localHistory.length > 0 && (
            <div className="card overflow-hidden">
              <div className="font-mono text-[10px] text-white/40 tracking-widest px-4 py-3 border-b border-white/[0.065]">
                LOCALLY SYNCED EVENT HISTORY
              </div>
              {localHistory.map((s, i) => (
                <div
                  key={i}
                  className="grid grid-cols-4 px-4 py-2.5 border-b border-white/[0.03] last:border-0 font-mono text-xs"
                >
                  <div className="text-white/60 col-span-2 truncate">{s.event_key}</div>
                  <div className="text-right text-white/70">
                    {s.opr !== null ? `${s.opr.toFixed(1)} OPR` : "–"}
                  </div>
                  <div className="text-right text-white/50">
                    #{s.rank ?? "–"} · {s.wins}W {s.losses}L
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="text-center py-2">
            <a
              href={`https://ftcscout.org/teams/${selected.number}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-[11px] text-accent/70 hover:text-accent transition-colors"
            >
              View full season history on FTCScout →
            </a>
          </div>
        </div>
      )}

      {!selected && results.length === 0 && !query && (
        <div className="text-center py-16 text-white/15 font-mono text-sm">
          Search any active FTC team by number or name.
          <br />
          <span className="text-[11px] text-white/10">Powered by FTCScout — no sync required.</span>
        </div>
      )}
    </div>
  );
}
