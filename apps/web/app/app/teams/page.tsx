"use client";
import { useState, useEffect, useRef } from "react";
import { createBrowserClient } from "@supabase/ssr";

const sb = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

type Team = { team_number:string; team_name:string|null; city:string|null; state_province:string|null; country:string|null; rookie_year:number|null; website:string|null };
type SeasonStat = { event_key:string; event_name:string|null; opr:number|null; rank:number|null; wins:number; losses:number };

export default function TeamsPage() {
  const [query,    setQuery]    = useState("");
  const [results,  setResults]  = useState<Team[]>([]);
  const [selected, setSelected] = useState<Team|null>(null);
  const [history,  setHistory]  = useState<SeasonStat[]>([]);
  const [orgId,    setOrgId]    = useState("");
  const [userId,   setUserId]   = useState("");
  const [loading,  setLoading]  = useState(false);
  const [watchAdded, setWatchAdded] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>|null>(null);

  useEffect(() => {
    sb.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      setUserId(user.id);
      const { data: m } = await sb.from("org_members").select("org_id").eq("user_id", user.id).single();
      if (m) setOrgId(m.org_id);
    });
  }, []);

  async function search(q: string) {
    if (!q.trim()) { setResults([]); return; }
    setLoading(true);
    const isNum = /^\d+$/.test(q.trim());
    let dbQuery = sb.from("ftc_teams").select("*").limit(15);
    if (isNum) dbQuery = dbQuery.ilike("team_number", `${q}%`);
    else       dbQuery = dbQuery.ilike("team_name", `%${q}%`);
    const { data } = await dbQuery;
    setResults((data as Team[]) ?? []);
    setLoading(false);
  }

  function onInput(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value;
    setQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(q), 300);
  }

  async function selectTeam(t: Team) {
    setSelected(t); setResults([]);
    setWatchAdded(false);
    const { data } = await sb.from("team_season_stats").select("*").eq("team_number", t.team_number).order("event_key", { ascending: false }).limit(10);
    setHistory((data as SeasonStat[]) ?? []);
  }

  async function addToWatchlist() {
    if (!orgId || !selected) return;
    await sb.from("watchlist").upsert({ org_id: orgId, team_number: selected.team_number, added_by: userId, reason: null });
    setWatchAdded(true);
  }

  return (
    <div className="p-6 max-w-3xl">
      <div className="mb-6">
        <p className="font-mono text-[10px] text-accent tracking-widest mb-1">GLOBAL DATABASE</p>
        <h1 className="font-display text-4xl font-black tracking-wide">TEAM SEARCH</h1>
      </div>

      {/* Search */}
      <div className="relative mb-5">
        <input
          className="input w-full pr-16 text-base"
          placeholder="Search by team number or name…"
          value={query}
          onChange={onInput}
          autoFocus
        />
        {loading && <span className="absolute right-4 top-1/2 -translate-y-1/2 font-mono text-[10px] text-white/30">searching…</span>}
      </div>

      {/* Dropdown results */}
      {results.length > 0 && (
        <div className="card overflow-hidden mb-5 shadow-xl">
          {results.map(t => (
            <button key={t.team_number} onClick={() => selectTeam(t)}
              className="w-full flex items-center gap-3 px-4 py-3 border-b border-white/[0.04] last:border-0 hover:bg-white/5 transition-colors text-left">
              <span className="font-display font-black text-lg text-accent w-16 flex-shrink-0">{t.team_number}</span>
              <div>
                <div className="font-mono text-sm text-white/80">{t.team_name ?? "Unknown"}</div>
                <div className="font-mono text-[10px] text-white/30">{[t.city, t.state_province, t.country].filter(Boolean).join(", ")}</div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Team profile */}
      {selected && (
        <div className="space-y-4">
          <div className="card p-5">
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="font-display text-5xl font-black text-accent">{selected.team_number}</div>
                <div className="font-mono text-lg text-white/80 mt-1">{selected.team_name ?? "Unknown"}</div>
                <div className="font-mono text-xs text-white/40 mt-0.5">
                  {[selected.city, selected.state_province, selected.country].filter(Boolean).join(", ")}
                </div>
                {selected.rookie_year && (
                  <div className="font-mono text-[10px] text-white/25 mt-1">Rookie {selected.rookie_year}</div>
                )}
              </div>
              <div className="flex flex-col gap-2">
                {selected.website && (
                  <a href={selected.website} target="_blank" rel="noopener noreferrer"
                    className="btn-ghost text-xs">↗ Website</a>
                )}
                <button onClick={addToWatchlist} disabled={watchAdded}
                  className={`btn text-xs ${watchAdded ? "opacity-50" : ""}`}>
                  {watchAdded ? "✓ Added" : "+ Watchlist"}
                </button>
              </div>
            </div>
          </div>

          {/* Season history */}
          {history.length > 0 && (
            <div className="card overflow-hidden">
              <div className="font-mono text-[10px] text-white/40 tracking-widest px-4 py-3 border-b border-white/[0.065]">RECENT EVENT HISTORY</div>
              {history.map((s, i) => (
                <div key={i} className="grid grid-cols-4 px-4 py-2.5 border-b border-white/[0.03] last:border-0 font-mono text-xs">
                  <div className="text-white/60 col-span-2 truncate">{s.event_name ?? s.event_key}</div>
                  <div className="text-right text-white/70">{s.opr !== null ? `${s.opr.toFixed(1)} OPR` : "–"}</div>
                  <div className="text-right text-white/50">#{s.rank ?? "–"} · {s.wins}W {s.losses}L</div>
                </div>
              ))}
            </div>
          )}

          {history.length === 0 && (
            <div className="text-center py-8 text-white/20 font-mono text-sm">
              No season history cached for this team.<br/>
              <span className="text-[11px]">Sync from Settings → Event to pull data.</span>
            </div>
          )}
        </div>
      )}

      {!selected && results.length === 0 && query.length === 0 && (
        <div className="text-center py-16 text-white/15 font-mono text-sm">
          Search any of the 10,000+ active FTC teams by number or name.
        </div>
      )}
    </div>
  );
}
