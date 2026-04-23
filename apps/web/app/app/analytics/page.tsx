"use client";
import { useEffect, useState, useMemo } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { EventPicker } from "../../components/EventPicker";
import {
  RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, LineChart, Line, Legend,
} from "recharts";

const sb = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

type MatchRow = { match_number: number; auto_score: number; teleop_score: number; endgame_score: number; total_score: number; field_positions?: { x: number; y: number; phase?: string }[] | null };
type StatRow = { team_number: string; opr: number | null; rank: number | null; wins: number; losses: number };
type ScoutEntry = { team_number: string; tier: string | null; form_data: Record<string, unknown>; field_positions: { x: number; y: number; phase?: string }[] | null };
type Tab = "radar" | "timeline" | "compat" | "heatmap" | "rankings" | "h2h";

const HEATMAP_W = 360; const HEATMAP_H = 360; const GRID = 16;

function heatColor(d: number, max: number) {
  const t = max > 0 ? d / max : 0;
  return `rgba(${Math.round(255 * Math.min(1, t * 2))},${Math.round(90 * (1 - t))},31,${0.15 + t * 0.75})`;
}

type Compat = {
  teamA: number; teamB: number; matchesTogether: number;
  avgCombinedScore: number | null; avgExpectedFromOpr: number | null;
  synergyDelta: number | null; sampleTooSmall: boolean; dataAvailable: boolean;
};

type H2H = {
  teamA: number; teamB: number;
  matches: { matchId: number; eventCode: string; matchNum: number; aAlliance: "Red" | "Blue"; aScore: number; bScore: number; aWon: boolean; }[];
  teamARecord: { wins: number; losses: number; ties: number };
  dataAvailable: boolean;
};

export default function AnalyticsPage() {
  const [tab, setTab] = useState<Tab>("radar");
  const [orgId, setOrgId] = useState("");
  const [eventKey, setEventKey] = useState("");
  const [season, setSeason] = useState(2025);
  const [team, setTeam] = useState(""); const [cmp, setCmp] = useState("");
  const [tsA, setTsA] = useState<MatchRow[]>([]); const [tsB, setTsB] = useState<MatchRow[]>([]);
  const [allStats, setAllStats] = useState<StatRow[]>([]);
  const [entries, setEntries] = useState<ScoutEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [compat, setCompat] = useState<Compat | null>(null);
  const [h2h, setH2h] = useState<H2H | null>(null);
  const [analyticsErr, setAnalyticsErr] = useState("");

  useEffect(() => {
    sb.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data: m } = await sb.from("org_members").select("org_id").eq("user_id", user.id).maybeSingle();
      if (!m) return;
      setOrgId(m.org_id);
      // Auto-load active event key from org
      const { data: orgRow } = await sb
        .from("organizations")
        .select("active_event_key")
        .eq("id", m.org_id)
        .maybeSingle();
      if (orgRow?.active_event_key) {
        const key = String(orgRow.active_event_key);
        setEventKey(key);
        const match = key.match(/^(\d{4})-/);
        if (match) setSeason(Number(match[1]));
      }
    });
  }, []);

  useEffect(() => {
    if (!orgId) return;
    sb.from("team_stats_cache").select("team_number,opr,rank,wins,losses").eq("event_key", eventKey)
      .then(({ data }) => setAllStats((data ?? []) as unknown as StatRow[]));
    sb.from("scouting_entries").select("team_number,tier,form_data,field_positions").eq("org_id", orgId).eq("event_key", eventKey)
      .then(({ data }) => setEntries((data ?? []) as unknown as ScoutEntry[]));
  }, [orgId, eventKey]);

  // Infer season from event key (e.g. "2025-USCAFFFAQ" -> 2025)
  useEffect(() => {
    const m = eventKey.match(/^(\d{4})-/);
    if (m) setSeason(Number(m[1]));
  }, [eventKey]);

  async function loadT(tn: string, s: (r: MatchRow[]) => void) {
    if (!orgId || !tn) return;
    setLoading(true);
    const { data } = await sb.from("match_scouting").select("match_number,auto_score,teleop_score,endgame_score,total_score,field_positions").eq("org_id", orgId).eq("event_key", eventKey).eq("team_number", tn).order("match_number");
    s((data ?? []) as unknown as MatchRow[]);
    setLoading(false);
  }

  async function analyze() {
    setAnalyticsErr("");
    await loadT(team, setTsA);
    if (cmp) await loadT(cmp, setTsB);

    // Real compat + h2h from FTCScout if both teams provided and numeric
    if (team && cmp && !isNaN(Number(team)) && !isNaN(Number(cmp))) {
      try {
        const compatRes = await fetch(`/api/analytics?action=compat&teamA=${team}&teamB=${cmp}&season=${season}`);
        const cj = await compatRes.json();
        if (compatRes.ok) setCompat(cj.compat);
        const h2hRes = await fetch(`/api/analytics?action=h2h&teamA=${team}&teamB=${cmp}&season=${season}`);
        const hj = await h2hRes.json();
        if (h2hRes.ok) setH2h(hj.h2h);
      } catch (e) {
        setAnalyticsErr(e instanceof Error ? e.message : String(e));
      }
    } else {
      setCompat(null);
      setH2h(null);
    }
  }

  const radar = tsA.length ? [
    { subject: "Auto", A: tsA.reduce((a, b) => a + b.auto_score, 0) / tsA.length, B: tsB.length ? tsB.reduce((a, b) => a + b.auto_score, 0) / tsB.length : undefined },
    { subject: "Teleop", A: tsA.reduce((a, b) => a + b.teleop_score, 0) / tsA.length, B: tsB.length ? tsB.reduce((a, b) => a + b.teleop_score, 0) / tsB.length : undefined },
    { subject: "Endgame", A: tsA.reduce((a, b) => a + b.endgame_score, 0) / tsA.length, B: tsB.length ? tsB.reduce((a, b) => a + b.endgame_score, 0) / tsB.length : undefined },
    {
      subject: "Consist", A: tsA.length > 1 ? Math.max(0, 30 - Math.sqrt(tsA.reduce((a, b) => a + (b.total_score - tsA.reduce((x, y) => x + y.total_score, 0) / tsA.length) ** 2, 0) / tsA.length)) : 0,
      B: tsB.length > 1 ? Math.max(0, 30 - Math.sqrt(tsB.reduce((a, b) => a + (b.total_score - tsB.reduce((x, y) => x + y.total_score, 0) / tsB.length) ** 2, 0) / tsB.length)) : undefined
    },
    { subject: "Peak", A: Math.max(...tsA.map(m => m.total_score)), B: tsB.length ? Math.max(...tsB.map(m => m.total_score)) : undefined },
  ] : [];

  const timelineData = useMemo(() => {
    if (!tsA.length) return [];
    const teams = [{ key: team, rows: tsA }, ...(cmp && tsB.length ? [{ key: cmp, rows: tsB }] : [])];
    const byMatch: Record<number, Record<string, number>> = {};
    teams.forEach(({ key, rows }) => rows.forEach((r, i) => { const roll = rows.slice(0, i + 1).reduce((a, b) => a + b.total_score, 0) / (i + 1); (byMatch[r.match_number] = byMatch[r.match_number] ?? {})[key] = Math.round(roll * 10) / 10; }));
    return Object.entries(byMatch).sort(([a], [b]) => Number(a) - Number(b)).map(([m, vals]) => ({ match: Number(m), ...vals }));
  }, [tsA, tsB, team, cmp]);

  // Real heatmap from tap-coordinates aggregated across all match_scouting rows.
  // Empty at first — fills as scouts tap during matches.
  const heatPts = useMemo(() => {
    const out: { x: number; y: number; phase?: string }[] = [];
    for (const m of tsA) {
      if (Array.isArray(m.field_positions)) out.push(...m.field_positions);
    }
    return out;
  }, [tsA]);

  const grid = useMemo(() => {
    const g = Array.from({ length: GRID }, () => Array(GRID).fill(0) as number[]);
    heatPts.forEach(({ x, y }) => { g[Math.min(GRID - 1, Math.floor(y * GRID))][Math.min(GRID - 1, Math.floor(x * GRID))]++; });
    return g;
  }, [heatPts]);
  const maxD = useMemo(() => Math.max(1, ...grid.flat()), [grid]);

  const TABS = [
    { id: "radar", l: "RADAR" },
    { id: "timeline", l: "TIMELINE" },
    { id: "compat", l: "SYNERGY" },
    { id: "h2h", l: "HEAD TO HEAD" },
    { id: "heatmap", l: "HEATMAP" },
    { id: "rankings", l: "RANKINGS" },
  ] as { id: Tab; l: string }[];

  const Placeholder = ({ msg }: { msg: string }) => <div className="flex items-center justify-center h-48 text-white/20 font-mono text-sm">{msg}</div>;

  return (
    <div className="p-6 max-w-5xl">
      <div className="mb-4"><p className="font-mono text-[10px] text-accent tracking-widest mb-1">ANALYTICS HUB</p><h1 className="font-display text-4xl font-black tracking-wide">PERFORMANCE ANALYSIS</h1></div>
      <div className="flex gap-3 mb-5 flex-wrap items-end">
        <div className="flex-1 min-w-[220px]"><div className="label mb-1 font-mono text-[10px] text-white/40">EVENT</div><EventPicker value={eventKey} onChange={k => { setEventKey(k); const m = k.match(/^(\d{4})-/); if (m) setSeason(Number(m[1])); }} /></div>
        <div><div className="label mb-1 font-mono text-[10px] text-white/40">TEAM A</div><input className="input w-28" value={team} onChange={e => setTeam(e.target.value)} placeholder="Team #" inputMode="numeric" /></div>
        <div><div className="label mb-1 font-mono text-[10px] text-white/40">TEAM B (compare)</div><input className="input w-28" value={cmp} onChange={e => setCmp(e.target.value)} placeholder="Optional" inputMode="numeric" /></div>
        <button className="btn px-5 text-sm" onClick={analyze} disabled={loading || !team}>{loading ? "Loading…" : "Analyze →"}</button>
      </div>
      {analyticsErr && <div className="mb-3 text-xs text-ftc-red font-mono">{analyticsErr}</div>}
      <div className="flex gap-1 border-b border-white/[0.065] mb-5 overflow-x-auto">
        {TABS.map(t => <button key={t.id} onClick={() => setTab(t.id)} className={`px-4 py-2 font-mono text-[11px] tracking-widest whitespace-nowrap transition-colors ${tab === t.id ? "text-accent border-b border-accent" : "text-white/40 hover:text-white/70"}`}>{t.l}</button>)}
      </div>

      {tab === "radar" && <div className="grid md:grid-cols-2 gap-4">
        <div className="card p-5">
          <h2 className="font-display text-lg font-black tracking-wide mb-4">TEAM {team || "?"}{cmp && <span className="text-white/40"> vs {cmp}</span>}</h2>
          <p className="font-mono text-[10px] text-white/30 mb-3">From your team&apos;s match scouting entries</p>
          {radar.length > 0 ? <ResponsiveContainer width="100%" height={280}><RadarChart data={radar}><PolarGrid stroke="rgba(255,255,255,0.08)" /><PolarAngleAxis dataKey="subject" tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11, fontFamily: "DM Mono" }} /><Radar name={`Team ${team}`} dataKey="A" stroke="#FF5A1F" fill="#FF5A1F" fillOpacity={0.25} strokeWidth={2} />{cmp && tsB.length > 0 && <Radar name={`Team ${cmp}`} dataKey="B" stroke="#5B9CF4" fill="#5B9CF4" fillOpacity={0.15} strokeWidth={2} />}{cmp && tsB.length > 0 && <Legend />}</RadarChart></ResponsiveContainer> : <Placeholder msg="Enter a team and click Analyze" />}
        </div>
        <div className="card p-5">
          <h2 className="font-display text-lg font-black tracking-wide mb-4">SCORE BY MATCH</h2>
          {tsA.length > 0 ? <ResponsiveContainer width="100%" height={280}><BarChart data={tsA} barCategoryGap="30%"><CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" /><XAxis dataKey="match_number" tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }} tickFormatter={v => `Q${v}`} /><YAxis tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }} /><Tooltip contentStyle={{ background: "#18181F", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#EAE8DE", fontFamily: "DM Mono", fontSize: 12 }} /><Bar dataKey="auto_score" stackId="a" fill="#5B9CF4" name="Auto" /><Bar dataKey="teleop_score" stackId="a" fill="#2DD88A" name="Teleop" /><Bar dataKey="endgame_score" stackId="a" fill="#FF5A1F" name="Endgame" radius={[4, 4, 0, 0]} /><Legend /></BarChart></ResponsiveContainer> : <Placeholder msg="No match data" />}
        </div>
      </div>}

      {tab === "timeline" && <div className="card p-5">
        <h2 className="font-display text-lg font-black tracking-wide mb-1">ROLLING SCORE TRAJECTORY</h2>
        <p className="font-mono text-[10px] text-white/30 mb-4">Average score across matches. Tighter = more consistent.</p>
        {timelineData.length > 0 ? <ResponsiveContainer width="100%" height={300}><LineChart data={timelineData}><CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" /><XAxis dataKey="match" tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }} tickFormatter={v => `Q${v}`} /><YAxis tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }} /><Tooltip contentStyle={{ background: "#18181F", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#EAE8DE", fontFamily: "DM Mono", fontSize: 12 }} /><Legend />{team && <Line type="monotone" dataKey={team} stroke="#FF5A1F" strokeWidth={2} dot={{ r: 3, fill: "#FF5A1F" }} name={`Team ${team}`} connectNulls />}{cmp && tsB.length > 0 && <Line type="monotone" dataKey={cmp} stroke="#5B9CF4" strokeWidth={2} dot={{ r: 3, fill: "#5B9CF4" }} name={`Team ${cmp}`} connectNulls />}</LineChart></ResponsiveContainer> : <Placeholder msg="Analyze a team to see their trajectory" />}
      </div>}

      {tab === "compat" && <div className="card p-5">
        <h2 className="font-display text-lg font-black tracking-wide mb-1">ALLIANCE SYNERGY</h2>
        <p className="font-mono text-[10px] text-white/30 mb-4">
          Real synergy: how much their actual combined score differs from what their OPRs predict.<br />
          <span className="text-white/40">Powered by FTCScout historical matches.</span>
        </p>
        {!compat ? <Placeholder msg="Enter both teams and click Analyze" /> :
         !compat.dataAvailable ? <div className="font-mono text-xs text-white/40">Not enough data for these teams on FTCScout yet.</div> :
         compat.matchesTogether === 0 ? (
          <div>
            <div className="font-mono text-[10px] text-amber-400 tracking-widest mb-2">NEVER PLAYED TOGETHER</div>
            <p className="text-sm text-white/70">Teams {compat.teamA} and {compat.teamB} haven&apos;t been on the same alliance in the {season} season. No synergy to measure.</p>
            {compat.avgExpectedFromOpr !== null && <p className="text-xs text-white/40 mt-2">Combined OPR: <span className="text-white/70">{compat.avgExpectedFromOpr}</span></p>}
          </div>
         ) : (
          <div className="grid grid-cols-3 gap-4 mt-2">
            <div className="text-center">
              <div className="font-display text-3xl font-black">{compat.matchesTogether}</div>
              <div className="font-mono text-[10px] text-white/40 mt-1">MATCHES TOGETHER</div>
            </div>
            <div className="text-center border-x border-white/[0.065]">
              <div className="font-display text-3xl font-black text-accent">{compat.avgCombinedScore}</div>
              <div className="font-mono text-[10px] text-white/40 mt-1">AVG ALLIANCE SCORE</div>
              <div className="font-mono text-[9px] text-white/30">vs OPR-expected {compat.avgExpectedFromOpr}</div>
            </div>
            <div className="text-center">
              <div className={`font-display text-3xl font-black ${(compat.synergyDelta ?? 0) > 0 ? "text-ftc-green" : (compat.synergyDelta ?? 0) < 0 ? "text-ftc-red" : "text-white/60"}`}>
                {compat.synergyDelta !== null && compat.synergyDelta > 0 ? "+" : ""}{compat.synergyDelta ?? "—"}
              </div>
              <div className="font-mono text-[10px] text-white/40 mt-1">SYNERGY DELTA</div>
              {compat.sampleTooSmall && <div className="font-mono text-[9px] text-amber-400 mt-1">SMALL SAMPLE</div>}
            </div>
          </div>
         )
        }
      </div>}

      {tab === "h2h" && <div className="card p-5">
        <h2 className="font-display text-lg font-black tracking-wide mb-1">HEAD TO HEAD</h2>
        <p className="font-mono text-[10px] text-white/30 mb-4">All times these teams have faced each other this season. <span className="text-white/40">Powered by FTCScout.</span></p>
        {!h2h ? <Placeholder msg="Enter both teams and click Analyze" /> :
         h2h.matches.length === 0 ? <div className="font-mono text-xs text-white/40">These teams haven&apos;t faced each other in the {season} season.</div> : (
          <>
            <div className="mb-4 font-mono text-sm">
              <span className="text-white/40">Team {h2h.teamA} record:</span>{" "}
              <span className="text-ftc-green font-bold">{h2h.teamARecord.wins}W</span> –{" "}
              <span className="text-ftc-red font-bold">{h2h.teamARecord.losses}L</span>
              {h2h.teamARecord.ties > 0 && <> – <span className="text-white/60">{h2h.teamARecord.ties}T</span></>}
            </div>
            <div className="space-y-1">
              {h2h.matches.map(m => (
                <div key={m.matchId} className="flex items-center gap-3 px-3 py-2 bg-white/[0.02] rounded">
                  <span className="font-mono text-[10px] text-white/30 w-20">{m.eventCode}</span>
                  <span className="font-mono text-xs text-white/50 w-12">Q{m.matchNum}</span>
                  <span className={`font-mono text-xs ${m.aWon ? "text-ftc-green" : "text-ftc-red"}`}>
                    {m.aScore} – {m.bScore}
                  </span>
                  <span className="font-mono text-[10px] text-white/30 ml-auto">{m.aAlliance} alliance</span>
                </div>
              ))}
            </div>
          </>
         )
        }
      </div>}

      {tab === "heatmap" && <div className="card p-5">
        <h2 className="font-display text-lg font-black tracking-wide mb-1">FIELD SCORING HEATMAP — Team {team || "?"}</h2>
        <p className="font-mono text-[10px] text-white/30 mb-4">
          Only populated from tap-coordinates captured during match scouting (experimental feature).<br />
          This will fill in over time as scouts tap field positions. Currently empty means no positional data has been recorded yet.
        </p>
        <div className="flex gap-6 flex-wrap items-start">
          <div className="relative rounded overflow-hidden border border-white/[0.065]" style={{ width: HEATMAP_W, height: HEATMAP_H }}>
            {/* Real field image as background */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/field.jpg" alt="FTC field" className="absolute inset-0 w-full h-full object-cover opacity-70" />
            <div className="absolute inset-0 bg-black/30" />
            {heatPts.length > 0 ? (
              <svg width={HEATMAP_W} height={HEATMAP_H} className="absolute inset-0">
                {grid.map((row, gy) => row.map((d, gx) => d > 0 ? <rect key={`${gy}-${gx}`} x={(gx / GRID) * HEATMAP_W} y={(gy / GRID) * HEATMAP_H} width={HEATMAP_W / GRID} height={HEATMAP_H / GRID} fill={heatColor(d, maxD)} rx={2} /> : null))}
              </svg>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center px-4">
                  <div className="font-mono text-[10px] text-white/50 tracking-widest mb-1">WAITING FOR TAP DATA</div>
                  <p className="font-mono text-[9px] text-white/30">Fills in as scouts tap field positions during match scouting on mobile.</p>
                </div>
              </div>
            )}
          </div>
          <div className="font-mono text-xs text-white/40 max-w-xs space-y-2">
            <div>Data points: <span className="text-white/80">{heatPts.length}</span></div>
            <div className="flex gap-3 flex-wrap">
              {[["Auto", "#5B9CF4"], ["Teleop", "#2DD88A"], ["Endgame", "#FF5A1F"]].map(([l, c]) => (
                <span key={l} style={{ color: c }} className="font-mono text-[10px]">● {l}</span>
              ))}
            </div>
            <p className="text-[10px] leading-relaxed">Overlay shows where this team scored. Brighter = more activity in that zone.</p>
          </div>
        </div>
      </div>}

      {tab === "rankings" && allStats.length > 0 && <div>
        <h2 className="font-display text-lg font-black tracking-wide mb-3">OPR RANKINGS — {eventKey}</h2>
        <div className="card overflow-hidden">{allStats.sort((a, b) => (b.opr ?? 0) - (a.opr ?? 0)).slice(0, 24).map((s, i) => (
          <div key={s.team_number} className={`flex items-center gap-4 px-4 py-2.5 border-b border-white/[0.04] last:border-0 ${s.team_number === team ? "bg-accent/5 border-l-2 border-l-accent" : ""}`}>
            <span className="font-mono text-xs text-white/30 w-5">{i + 1}</span>
            <span className="font-display text-sm font-black w-20">{s.team_number}</span>
            <div className="flex-1 h-1 bg-white/5 rounded-full overflow-hidden"><div className="h-full bg-accent rounded-full" style={{ width: `${((s.opr ?? 0) / Math.max(...allStats.map(x => x.opr ?? 0))) * 100}%` }} /></div>
            <span className="font-mono text-xs text-white/60 w-16 text-right">{(s.opr ?? 0).toFixed(1)} OPR</span>
            <span className="font-mono text-xs text-white/30 w-10 text-right">{s.wins}–{s.losses}</span>
          </div>
        ))}</div>
      </div>}
    </div>
  );
}
