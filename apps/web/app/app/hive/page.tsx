"use client";
import { useEffect, useState, useCallback } from "react";
import { createBrowserClient } from "@supabase/ssr";

const sb = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
type Entry = { id: string; team_number: string; tier: string|null; alliance_target: boolean; dnp: boolean; dnp_reason: string|null; form_data: Record<string,unknown>; scouted_at: string; ftc_teams?: {team_name: string|null} };
type MatchEntry = { match_number: number; auto_score: number; teleop_score: number; endgame_score: number; total_score: number; profiles?: {display_name: string}|null };
const tierStyle: Record<string,string> = { OPTIMAL:"tag-tier-optimal", MID:"tag-tier-mid", BAD:"tag-tier-bad" };

export default function HiveMindPage() {
  const [orgId, setOrgId] = useState<string|null>(null);
  const [eventKey, setEventKey] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [selected, setSelected] = useState<Entry|null>(null);
  const [matchEntries, setMatchEntries] = useState<MatchEntry[]>([]);
  const [filter, setFilter] = useState<"ALL"|"OPTIMAL"|"MID"|"BAD">("ALL");
  const [search, setSearch] = useState("");
  const [liveLog, setLiveLog] = useState<string[]>([]);

  const loadEntries = useCallback(async (oid: string) => {
    const {data} = await sb.from("scouting_entries").select("*, ftc_teams(team_name)").eq("org_id",oid).eq("event_key",eventKey).order("team_number");
    setEntries((data as Entry[]) ?? []);
  }, [eventKey]);

  useEffect(() => {
    sb.auth.getUser().then(async ({data:{user}}) => {
      if (!user) return;
      const {data: m} = await sb.from("org_members").select("org_id").eq("user_id", user.id).maybeSingle();
      if (!m) return;
      setOrgId(m.org_id);
      await loadEntries(m.org_id);
      const ch = sb.channel(`hive:${m.org_id}`)
        .on("postgres_changes", {event:"*",schema:"public",table:"scouting_entries",filter:`org_id=eq.${m.org_id}`},
          (p) => { loadEntries(m.org_id); const t=(p.new as Record<string,unknown>)?.team_number; setLiveLog(l=>[`Team ${t} updated`,...l.slice(0,19)]); })
        .subscribe();
      return () => { sb.removeChannel(ch); };
    });
  }, [loadEntries]);

  async function loadMatches(tn: string) {
    if (!orgId) return;
    const {data} = await sb.from("match_scouting").select("match_number,auto_score,teleop_score,endgame_score,total_score,profiles(display_name)").eq("org_id",orgId).eq("event_key",eventKey).eq("team_number",tn).order("match_number");
    setMatchEntries((data as unknown as MatchEntry[]) ?? []);
  }

  function selectTeam(e: Entry) { setSelected(e); loadMatches(e.team_number); }
  const avg = (arr: number[]) => arr.length ? (arr.reduce((a,b)=>a+b,0)/arr.length).toFixed(1) : "—";
  const filtered = entries.filter(e => {
    if (filter !== "ALL" && e.tier !== filter) return false;
    if (search && !e.team_number.includes(search) && !(e.ftc_teams?.team_name??"").toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="p-6 h-full flex flex-col gap-4 max-w-7xl">
      <div>
        <p className="font-mono text-[10px] text-accent tracking-widest mb-1">HIVE MIND</p>
        <h1 className="font-display text-4xl font-black tracking-wide">EVERY SCOUT. ONE BRAIN.</h1>
      </div>
      <div className="flex gap-3 flex-wrap items-center">
        <input className="input w-48" placeholder="Search team # or name" value={search} onChange={e=>setSearch(e.target.value)} />
        <input className="input w-52" placeholder="Event key e.g. 2025-TXHOU" value={eventKey} onChange={e=>setEventKey(e.target.value)} />
        {(["ALL","OPTIMAL","MID","BAD"] as const).map(f=>(
          <button key={f} onClick={()=>setFilter(f)} className={`px-3 py-1.5 rounded-lg font-mono text-xs border transition-colors ${filter===f ? "bg-accent border-accent text-white" : "border-white/10 text-white/40 hover:text-white"}`}>{f}</button>
        ))}
        <span className="font-mono text-xs text-white/30 ml-auto">{filtered.length} teams</span>
      </div>
      <div className="flex gap-3 flex-1 min-h-0">
        <div className="w-52 flex-shrink-0 card overflow-y-auto">
          {filtered.length===0 && <div className="p-4 text-center text-white/20 font-mono text-xs">No entries yet.<br/>Start scouting!</div>}
          {filtered.map(e=>(
            <button key={e.id} onClick={()=>selectTeam(e)} className={`w-full flex items-center gap-2 px-3 py-2.5 border-b border-white/[0.05] text-left transition-colors hover:bg-surface2 ${selected?.id===e.id?"bg-surface2 border-l-2 border-l-accent":""}`}>
              <div className="flex-1 min-w-0">
                <div className="font-display text-base font-black">{e.team_number}</div>
                <div className="font-mono text-[10px] text-white/40 truncate">{e.ftc_teams?.team_name??"—"}</div>
              </div>
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${e.tier==="OPTIMAL"?"bg-ftc-green":e.tier==="MID"?"bg-ftc-amber":e.tier==="BAD"?"bg-ftc-red":"bg-white/20"}`} />
            </button>
          ))}
        </div>
        <div className="flex-1 card overflow-y-auto">
          {!selected ? (
            <div className="flex items-center justify-center h-full text-white/20 font-mono text-sm">← Select a team</div>
          ) : (
            <div className="p-5">
              <div className="flex items-start gap-4 mb-5">
                <div className="font-display text-6xl font-black leading-none">{selected.team_number}</div>
                <div className="flex-1">
                  <div className="text-lg font-semibold mb-2">{selected.ftc_teams?.team_name??"Unknown"}</div>
                  <div className="flex gap-2 flex-wrap">
                    {selected.tier && <span className={tierStyle[selected.tier]??""}>{selected.tier}</span>}
                    {selected.alliance_target && <span className="tag-tier-optimal">⭐ TARGET</span>}
                    {selected.dnp && <span className="tag-tier-bad">✕ DNP{selected.dnp_reason?` — ${selected.dnp_reason}`:""}</span>}
                  </div>
                </div>
              </div>
              {matchEntries.length>0 && (
                <div className="grid grid-cols-4 gap-px bg-white/[0.065] rounded-lg overflow-hidden mb-5">
                  {[{l:"AVG AUTO",v:avg(matchEntries.map(m=>m.auto_score))},{l:"AVG TELEOP",v:avg(matchEntries.map(m=>m.teleop_score))},{l:"AVG EG",v:avg(matchEntries.map(m=>m.endgame_score))},{l:"HIGH",v:String(Math.max(0,...matchEntries.map(m=>m.total_score)))}].map(({l,v})=>(
                    <div key={l} className="bg-surface p-3"><div className="font-mono text-base font-medium">{v}</div><div className="font-mono text-[9px] text-white/40 mt-0.5 tracking-wider">{l}</div></div>
                  ))}
                </div>
              )}
              <h3 className="font-mono text-[10px] text-white/40 tracking-widest mb-3">MATCH ENTRIES ({matchEntries.length})</h3>
              <div className="space-y-2">
                {matchEntries.map((m,i)=>(
                  <div key={i} className="bg-surface2 rounded-lg p-3 flex items-center gap-4">
                    <div className="font-display text-lg font-black w-12">Q{m.match_number}</div>
                    <div className="flex gap-4 flex-1 font-mono text-xs text-white/60">
                      <span>Auto <strong className="text-white">{m.auto_score}</strong></span>
                      <span>Tele <strong className="text-white">{m.teleop_score}</strong></span>
                      <span>EG <strong className="text-white">{m.endgame_score}</strong></span>
                      <span>Total <strong className="text-ftc-green">{m.total_score}</strong></span>
                    </div>
                    <div className="font-mono text-[10px] text-white/30">{m.profiles?.display_name??"—"}</div>
                  </div>
                ))}
                {matchEntries.length===0 && <div className="text-center py-6 text-white/20 font-mono text-xs">No match entries yet</div>}
              </div>
            </div>
          )}
        </div>
        <div className="w-44 flex-shrink-0 card p-3 overflow-y-auto hidden xl:block">
          <div className="flex items-center gap-1.5 font-mono text-[10px] text-white/40 tracking-widest mb-3">
            <span className="w-1.5 h-1.5 rounded-full bg-ftc-green animate-pulse" />LIVE FEED
          </div>
          {liveLog.length===0 && <div className="text-white/20 font-mono text-[10px] text-center mt-4">Waiting…</div>}
          {liveLog.map((l,i)=><div key={i} className="text-[11px] text-white/50 py-1.5 border-b border-white/[0.04]">{l}</div>)}
        </div>
      </div>
    </div>
  );
}
