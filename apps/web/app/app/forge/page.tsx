"use client";
import { useState, useEffect } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, ReferenceLine, Cell } from "recharts";

const sb = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

type Prediction = {
  redOprSum: number | null;
  blueOprSum: number | null;
  predictedRedScore: number | null;
  predictedBlueScore: number | null;
  redWinProbability: number | null;
  confidence: "low" | "medium" | "high";
  basis: string;
  dataAvailable: boolean;
};

type AllianceMcStats = {
  teams: number[];
  meanScore: number;
  stdDev: number;
  median: number;
  p10: number; p25: number; p75: number; p90: number;
  perTeam: { team: number; mean: number; stdDev: number; matchesUsed: number }[];
};

type MonteCarlo = {
  iterations: number;
  red: AllianceMcStats;
  blue: AllianceMcStats;
  redWinPct: number;
  blueWinPct: number;
  tieWinPct: number;
  redScoreHistogram: { bucket: number; count: number }[];
  blueScoreHistogram: { bucket: number; count: number }[];
  rpProbs: {
    red:  { winRp: number; bonusRp_high: number; bonusRp_high_threshold: number };
    blue: { winRp: number; bonusRp_high: number; bonusRp_high_threshold: number };
  };
  basis: string;
  dataAvailable: boolean;
  teamsWithoutData: number[];
};

type HistoryRow = {
  id: string;
  red_alliance: string[];
  blue_alliance: string[];
  results: Prediction | MonteCarlo;
  created_at: string;
};

type Mode = "fast" | "monte";

export default function ForgePage() {
  const [orgId, setOrgId] = useState("");
  const [userId, setUserId] = useState("");
  const [season, setSeason] = useState(2025);
  const [eventKey] = useState("2025-DECODE-TEST");
  const [red, setRed] = useState(["", "", ""]);
  const [blue, setBlue] = useState(["", "", ""]);
  const [mode, setMode] = useState<Mode>("fast");
  const [iters, setIters] = useState(2000);
  const [running, setRunning] = useState(false);
  const [pred, setPred] = useState<Prediction | null>(null);
  const [mc, setMc] = useState<MonteCarlo | null>(null);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<HistoryRow[]>([]);

  useEffect(() => {
    sb.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      setUserId(user.id);
      const { data: m } = await sb.from("org_members").select("org_id").eq("user_id", user.id).maybeSingle();
      if (!m) return;
      setOrgId(m.org_id);
      const { data: h } = await sb
        .from("forge_simulations")
        .select("id,red_alliance,blue_alliance,results,created_at")
        .eq("org_id", m.org_id).order("created_at", { ascending: false }).limit(5);
      setHistory((h as unknown as HistoryRow[]) ?? []);
    });
  }, []);

  async function run() {
    setError("");
    const redTeams = red.filter(Boolean).map((t) => t.trim());
    const blueTeams = blue.filter(Boolean).map((t) => t.trim());
    if (redTeams.length < 2 || blueTeams.length < 2) {
      setError("Need at least 2 teams per alliance");
      return;
    }
    setRunning(true);
    setPred(null); setMc(null);
    try {
      const action = mode === "fast" ? "predict" : "monteCarlo";
      const qs = new URLSearchParams({
        action, red: redTeams.join(","), blue: blueTeams.join(","), season: String(season),
      });
      if (mode === "monte") qs.set("iters", String(iters));
      const r = await fetch(`/api/analytics?${qs.toString()}`);
      const j = await r.json();
      if (!r.ok) { setError(j.error ?? "Failed"); setRunning(false); return; }

      let result: Prediction | MonteCarlo | null = null;
      if (mode === "fast" && j.prediction) { setPred(j.prediction); result = j.prediction; }
      if (mode === "monte" && j.monteCarlo) { setMc(j.monteCarlo); result = j.monteCarlo; }

      if (result && result.dataAvailable && orgId) {
        await sb.from("forge_simulations").insert({
          org_id: orgId, event_key: eventKey,
          red_alliance: redTeams, blue_alliance: blueTeams,
          iterations: mode === "monte" ? iters : 1,
          results: result, created_by: userId,
        });
        const { data: h } = await sb
          .from("forge_simulations")
          .select("id,red_alliance,blue_alliance,results,created_at")
          .eq("org_id", orgId).order("created_at", { ascending: false }).limit(5);
        setHistory((h as unknown as HistoryRow[]) ?? []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }

  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

  const AllianceInput = ({ teams, setTeams, color }: { teams: string[]; setTeams: (t: string[]) => void; color: "red" | "blue" }) => (
    <div className={`card p-4 border-t-2 ${color === "red" ? "border-t-ftc-red" : "border-t-ftc-blue"}`}>
      <h3 className={`font-display text-lg font-black tracking-wide mb-3 ${color === "red" ? "text-ftc-red" : "text-ftc-blue"}`}>{color.toUpperCase()} ALLIANCE</h3>
      <div className="space-y-2">
        {teams.map((t, i) => (
          <input key={i} className="input" placeholder={`Team ${i + 1} number`} inputMode="numeric" value={t}
            onChange={(e) => { const n = [...teams]; n[i] = e.target.value; setTeams(n); }} />
        ))}
      </div>
    </div>
  );

  // Combine red/blue histograms into one chart with both alliances
  const histogramData = (() => {
    if (!mc) return [];
    const allBuckets = new Set<number>();
    for (const b of mc.redScoreHistogram) allBuckets.add(b.bucket);
    for (const b of mc.blueScoreHistogram) allBuckets.add(b.bucket);
    const sorted = [...allBuckets].sort((a, b) => a - b);
    return sorted.map((bucket) => ({
      bucket,
      red:  mc.redScoreHistogram.find((x) => x.bucket === bucket)?.count ?? 0,
      blue: mc.blueScoreHistogram.find((x) => x.bucket === bucket)?.count ?? 0,
    }));
  })();

  return (
    <div className="p-6 max-w-4xl">
      <div className="mb-6">
        <p className="font-mono text-[10px] text-accent tracking-widest mb-1">THE FORGE</p>
        <h1 className="font-display text-4xl font-black tracking-wide">MATCH PREDICTOR</h1>
        <p className="text-white/40 text-sm mt-1">
          OPR-based prediction or full Monte Carlo simulation, both backed by real FTCScout data.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-4 mb-4">
        <AllianceInput teams={red} setTeams={setRed} color="red" />
        <AllianceInput teams={blue} setTeams={setBlue} color="blue" />
      </div>

      <div className="flex gap-3 items-center mb-3 flex-wrap">
        <div className="card p-2 flex">
          {(["fast", "monte"] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)}
              className={`px-3 py-1.5 font-mono text-[10px] tracking-widest rounded ${mode === m ? "bg-accent text-white" : "text-white/50 hover:text-white/80"}`}>
              {m === "fast" ? "FAST PREDICT" : "MONTE CARLO"}
            </button>
          ))}
        </div>
        <div className="card p-3 flex items-center gap-3">
          <label className="font-mono text-[10px] text-white/40 tracking-widest">SEASON</label>
          <input className="input w-20" type="number" value={season} onChange={(e) => setSeason(parseInt(e.target.value) || 2025)} />
        </div>
        {mode === "monte" && (
          <div className="card p-3 flex items-center gap-3">
            <label className="font-mono text-[10px] text-white/40 tracking-widest">ITERATIONS</label>
            <input className="input w-24" type="number" min={100} max={10000} step={100} value={iters} onChange={(e) => setIters(parseInt(e.target.value) || 2000)} />
          </div>
        )}
        <button className="btn-primary px-8 py-3" onClick={run} disabled={running}>
          {running ? (mode === "monte" ? `Simulating ${iters}×…` : "Predicting…") : (mode === "monte" ? `Run Monte Carlo →` : "Predict →")}
        </button>
      </div>
      {error && <div className="mb-4 font-mono text-xs text-ftc-red">{error}</div>}

      {/* FAST PREDICT result */}
      {pred && !pred.dataAvailable && (
        <div className="card p-5 border border-amber-400/30">
          <div className="font-mono text-[10px] text-amber-400 tracking-widest mb-2">WAITING FOR DATA</div>
          <p className="text-sm text-white/70">{pred.basis}</p>
        </div>
      )}
      {pred && pred.dataAvailable && (
        <div className="space-y-4">
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-xl font-black tracking-wide">PREDICTION</h2>
              <span className={`font-mono text-[10px] tracking-widest px-2 py-1 rounded ${
                pred.confidence === "high" ? "bg-ftc-green/10 text-ftc-green" :
                pred.confidence === "medium" ? "bg-amber-400/10 text-amber-400" : "bg-white/10 text-white/40"
              }`}>{pred.confidence.toUpperCase()} CONFIDENCE</span>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center">
                <div className="font-display text-5xl font-black text-ftc-red">{pred.predictedRedScore}</div>
                <div className="font-mono text-[10px] text-white/40 mt-1">RED PREDICTED</div>
                <div className="font-mono text-xs text-white/30">Σ OPR = {pred.redOprSum}</div>
              </div>
              <div className="text-center border-x border-white/[0.065]">
                <div className="font-display text-3xl font-black">{pct(pred.redWinProbability ?? 0)}</div>
                <div className="font-mono text-[10px] text-white/40 mt-1">RED WIN PROB</div>
                <div className="mt-2 h-2 rounded-full bg-surface3 overflow-hidden flex">
                  <div className="bg-ftc-red" style={{ width: pct(pred.redWinProbability ?? 0) }} />
                  <div className="bg-ftc-blue" style={{ width: pct(1 - (pred.redWinProbability ?? 0)) }} />
                </div>
              </div>
              <div className="text-center">
                <div className="font-display text-5xl font-black text-ftc-blue">{pred.predictedBlueScore}</div>
                <div className="font-mono text-[10px] text-white/40 mt-1">BLUE PREDICTED</div>
                <div className="font-mono text-xs text-white/30">Σ OPR = {pred.blueOprSum}</div>
              </div>
            </div>
          </div>
          <div className="card p-4 bg-surface2">
            <div className="font-mono text-[10px] text-white/40 tracking-widest mb-1">MODEL</div>
            <p className="text-xs text-white/60">{pred.basis}</p>
          </div>
        </div>
      )}

      {/* MONTE CARLO result */}
      {mc && !mc.dataAvailable && (
        <div className="card p-5 border border-amber-400/30">
          <div className="font-mono text-[10px] text-amber-400 tracking-widest mb-2">WAITING FOR DATA</div>
          <p className="text-sm text-white/70">{mc.basis}</p>
        </div>
      )}
      {mc && mc.dataAvailable && (
        <div className="space-y-4">
          {mc.teamsWithoutData.length > 0 && (
            <div className="card p-3 border border-amber-400/30 text-xs text-amber-300 font-mono">
              ⚠ No FTCScout data for: {mc.teamsWithoutData.join(", ")} — they contributed 0 to simulated scores.
            </div>
          )}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-xl font-black tracking-wide">MONTE CARLO • {mc.iterations.toLocaleString()} matches</h2>
            </div>
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="text-center">
                <div className="font-display text-5xl font-black text-ftc-red">{mc.red.meanScore}</div>
                <div className="font-mono text-[10px] text-white/40 mt-1">RED MEAN</div>
                <div className="font-mono text-[10px] text-white/30">±{mc.red.stdDev}</div>
              </div>
              <div className="text-center border-x border-white/[0.065]">
                <div className="font-display text-3xl font-black">{pct(mc.redWinPct)}</div>
                <div className="font-mono text-[10px] text-white/40 mt-1">RED WIN PROB</div>
                <div className="mt-2 h-2 rounded-full bg-surface3 overflow-hidden flex">
                  <div className="bg-ftc-red" style={{ width: pct(mc.redWinPct) }} />
                  <div className="bg-white/20" style={{ width: pct(mc.tieWinPct) }} />
                  <div className="bg-ftc-blue" style={{ width: pct(mc.blueWinPct) }} />
                </div>
                {mc.tieWinPct > 0 && <div className="font-mono text-[9px] text-white/40 mt-1">{pct(mc.tieWinPct)} tie</div>}
              </div>
              <div className="text-center">
                <div className="font-display text-5xl font-black text-ftc-blue">{mc.blue.meanScore}</div>
                <div className="font-mono text-[10px] text-white/40 mt-1">BLUE MEAN</div>
                <div className="font-mono text-[10px] text-white/30">±{mc.blue.stdDev}</div>
              </div>
            </div>

            {/* Score distribution chart */}
            <div className="mt-6">
              <h3 className="font-display text-sm font-black tracking-wide mb-2">SCORE DISTRIBUTION</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={histogramData} barCategoryGap={0}>
                  <XAxis dataKey="bucket" tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }} />
                  <YAxis tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }} />
                  <Tooltip contentStyle={{ background: "#18181F", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#EAE8DE", fontFamily: "DM Mono", fontSize: 12 }} />
                  <Bar dataKey="red" fill="#FF5A1F" fillOpacity={0.6} />
                  <Bar dataKey="blue" fill="#5B9CF4" fillOpacity={0.6} />
                  <ReferenceLine x={Math.round(mc.red.meanScore / 10) * 10} stroke="#FF5A1F" strokeDasharray="3 3" />
                  <ReferenceLine x={Math.round(mc.blue.meanScore / 10) * 10} stroke="#5B9CF4" strokeDasharray="3 3" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Percentiles */}
            <div className="grid grid-cols-2 gap-4 mt-4">
              {(["red", "blue"] as const).map((color) => {
                const a = color === "red" ? mc.red : mc.blue;
                return (
                  <div key={color} className="card p-4 bg-surface2">
                    <h4 className={`font-mono text-[10px] tracking-widest mb-3 ${color === "red" ? "text-ftc-red" : "text-ftc-blue"}`}>{color.toUpperCase()} PERCENTILES</h4>
                    <div className="grid grid-cols-5 gap-1 text-center">
                      {[
                        { l: "P10", v: a.p10 },
                        { l: "P25", v: a.p25 },
                        { l: "P50", v: a.median },
                        { l: "P75", v: a.p75 },
                        { l: "P90", v: a.p90 },
                      ].map(({ l, v }) => (
                        <div key={l}>
                          <div className="font-mono text-[9px] text-white/40">{l}</div>
                          <div className="font-display text-lg font-black">{v}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* RP probabilities */}
            <div className="grid grid-cols-2 gap-4 mt-4">
              {(["red", "blue"] as const).map((color) => {
                const rp = color === "red" ? mc.rpProbs.red : mc.rpProbs.blue;
                return (
                  <div key={color} className="card p-4 bg-surface2">
                    <h4 className={`font-mono text-[10px] tracking-widest mb-3 ${color === "red" ? "text-ftc-red" : "text-ftc-blue"}`}>{color.toUpperCase()} RP PROBABILITIES</h4>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] text-white/40 w-32">Win RP</span>
                        <div className="flex-1 h-1.5 bg-surface3 rounded-full overflow-hidden">
                          <div className={`h-full ${color === "red" ? "bg-ftc-red" : "bg-ftc-blue"}`} style={{ width: pct(rp.winRp) }} />
                        </div>
                        <span className="font-mono text-xs text-white/60 w-10 text-right">{pct(rp.winRp)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] text-white/40 w-32">Score ≥ {rp.bonusRp_high_threshold}</span>
                        <div className="flex-1 h-1.5 bg-surface3 rounded-full overflow-hidden">
                          <div className={`h-full ${color === "red" ? "bg-ftc-red" : "bg-ftc-blue"}`} style={{ width: pct(rp.bonusRp_high) }} />
                        </div>
                        <span className="font-mono text-xs text-white/60 w-10 text-right">{pct(rp.bonusRp_high)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Per-team distributions */}
            <div className="mt-4">
              <h3 className="font-display text-sm font-black tracking-wide mb-2">PER-TEAM CONTRIBUTION ESTIMATES</h3>
              <div className="grid grid-cols-2 gap-2">
                {[...mc.red.perTeam.map((t) => ({ ...t, color: "red" as const })), ...mc.blue.perTeam.map((t) => ({ ...t, color: "blue" as const }))].map((t) => (
                  <div key={t.team} className="flex items-center gap-3 px-3 py-2 bg-white/[0.02] rounded">
                    <span className={`font-display text-sm font-black ${t.color === "red" ? "text-ftc-red" : "text-ftc-blue"}`}>{t.team}</span>
                    <span className="font-mono text-xs text-white/60">{t.mean} <span className="text-white/30">±{t.stdDev}</span></span>
                    <span className="font-mono text-[10px] text-white/30 ml-auto">{t.matchesUsed} matches</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="card p-4 bg-surface2">
            <div className="font-mono text-[10px] text-white/40 tracking-widest mb-1">MODEL</div>
            <p className="text-xs text-white/60 leading-relaxed">{mc.basis}</p>
          </div>
        </div>
      )}

      {history.length > 0 && (
        <div className="mt-6">
          <h2 className="font-display text-xl font-black tracking-wide mb-3">RECENT</h2>
          <div className="space-y-2">
            {history.map((h) => {
              const r = h.results as unknown as Record<string, unknown>;
              const isMc = "redScoreHistogram" in r;
              const winP: number | null = isMc
                ? (r.redWinPct as number)
                : ((r.redWinProbability as number | null) ?? null);
              return (
                <div key={h.id} className="card p-3 flex items-center gap-4 cursor-pointer hover:bg-surface2 transition-colors"
                     onClick={() => { if (isMc) setMc(h.results as MonteCarlo); else setPred(h.results as Prediction); }}>
                  <span className="font-mono text-[9px] tracking-widest text-white/40">{isMc ? "MC" : "FAST"}</span>
                  <div className="flex-1 font-mono text-xs">
                    <span className="text-ftc-red">{h.red_alliance.join(", ")}</span>
                    <span className="text-white/30 mx-2">vs</span>
                    <span className="text-ftc-blue">{h.blue_alliance.join(", ")}</span>
                  </div>
                  {winP !== null && winP !== undefined && (
                    <div className="font-mono text-xs text-white/40">{pct(winP)} red</div>
                  )}
                  <div className="font-mono text-[10px] text-white/20">{new Date(h.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
