"use client";
import { useState, useEffect } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { runForge } from "@coolfTC/ui";
import type { ForgeResults } from "@coolfTC/types";

const sb = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

export default function ForgePage() {
  const [orgId, setOrgId] = useState("");
  const [userId, setUserId] = useState("");
  const [eventKey, setEventKey] = useState("2025-DECODE-TEST");
  const [red, setRed] = useState(["","",""]);
  const [blue, setBlue] = useState(["","",""]);
  const [iters, setIters] = useState(1000);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<ForgeResults|null>(null);
  const [history, setHistory] = useState<{id:string;red_alliance:string[];blue_alliance:string[];results:{redMean:number;blueMean:number;redWinPct:number};created_at:string}[]>([]);

  useEffect(() => {
    sb.auth.getUser().then(async ({data:{user}}) => {
      if (!user) return;
      setUserId(user.id);
      const {data:m} = await sb.from("org_members").select("org_id").eq("user_id",user.id).single();
      if (!m) return;
      setOrgId(m.org_id);
      const {data:h} = await sb.from("forge_simulations").select("id,red_alliance,blue_alliance,results,created_at").eq("org_id",m.org_id).order("created_at",{ascending:false}).limit(5);
      setHistory((h as typeof history) ?? []);
    });
  }, []);

  async function runSim() {
    const redTeams = red.filter(Boolean);
    const blueTeams = blue.filter(Boolean);
    if (redTeams.length < 2 || blueTeams.length < 2) { alert("Need at least 2 teams per alliance"); return; }
    setRunning(true);
    await new Promise(r=>setTimeout(r,50)); // let UI update
    const r = runForge({teams:redTeams,stats:[],entries:[]},{teams:blueTeams,stats:[],entries:[]},iters);
    setResults(r);
    if (orgId) {
      await sb.from("forge_simulations").insert({
        org_id:orgId, event_key:eventKey, red_alliance:redTeams, blue_alliance:blueTeams,
        iterations:iters, results:r, created_by:userId,
      });
      const {data:h} = await sb.from("forge_simulations").select("id,red_alliance,blue_alliance,results,created_at").eq("org_id",orgId).order("created_at",{ascending:false}).limit(5);
      setHistory((h as typeof history) ?? []);
    }
    setRunning(false);
  }

  const pct = (n: number) => `${(n*100).toFixed(1)}%`;
  const AllianceInput = ({teams, setTeams, color}: {teams:string[];setTeams:(t:string[])=>void;color:"red"|"blue"}) => (
    <div className={`card p-4 border-t-2 ${color==="red"?"border-t-ftc-red":"border-t-ftc-blue"}`}>
      <h3 className={`font-display text-lg font-black tracking-wide mb-3 ${color==="red"?"text-ftc-red":"text-ftc-blue"}`}>{color.toUpperCase()} ALLIANCE</h3>
      <div className="space-y-2">
        {teams.map((t,i)=>(
          <input key={i} className="input" placeholder={`Team ${i+1} number`} value={t}
            onChange={e=>{const n=[...teams]; n[i]=e.target.value; setTeams(n);}} />
        ))}
      </div>
    </div>
  );

  return (
    <div className="p-6 max-w-4xl">
      <div className="mb-6">
        <p className="font-mono text-[10px] text-accent tracking-widest mb-1">THE FORGE</p>
        <h1 className="font-display text-4xl font-black tracking-wide">MONTE CARLO SIM</h1>
        <p className="text-white/40 text-sm mt-1">Run thousands of match iterations before the match happens.</p>
      </div>

      <div className="grid md:grid-cols-2 gap-4 mb-4">
        <AllianceInput teams={red} setTeams={setRed} color="red" />
        <AllianceInput teams={blue} setTeams={setBlue} color="blue" />
      </div>

      <div className="flex gap-3 items-center mb-6">
        <div className="flex-1 card p-3 flex items-center gap-3">
          <label className="font-mono text-[10px] text-white/40 tracking-widest whitespace-nowrap">ITERATIONS</label>
          <input className="input flex-1" type="number" min="100" max="10000" step="100" value={iters} onChange={e=>setIters(parseInt(e.target.value)||1000)} />
        </div>
        <button className="btn-primary px-8 py-3" onClick={runSim} disabled={running}>
          {running ? "Running…" : `Simulate ${iters.toLocaleString()}×`}
        </button>
      </div>

      {results && (
        <div className="space-y-4">
          <div className="card p-5">
            <h2 className="font-display text-xl font-black tracking-wide mb-4">RESULTS</h2>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center">
                <div className="font-display text-5xl font-black text-ftc-red">{results.redMean.toFixed(1)}</div>
                <div className="font-mono text-[10px] text-white/40 mt-1">RED AVG SCORE</div>
                <div className="font-mono text-xs text-white/30">±{results.redStdDev.toFixed(1)}</div>
              </div>
              <div className="text-center border-x border-white/[0.065]">
                <div className="font-display text-3xl font-black text-white">{pct(results.redWinPct)}</div>
                <div className="font-mono text-[10px] text-white/40 mt-1">RED WIN PROB</div>
                <div className="mt-2 h-2 rounded-full bg-surface3 overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-ftc-red to-ftc-blue" style={{width:"100%"}}>
                    <div className="h-full bg-ftc-red" style={{width:pct(results.redWinPct)}} />
                  </div>
                </div>
              </div>
              <div className="text-center">
                <div className="font-display text-5xl font-black text-ftc-blue">{results.blueMean.toFixed(1)}</div>
                <div className="font-mono text-[10px] text-white/40 mt-1">BLUE AVG SCORE</div>
                <div className="font-mono text-xs text-white/30">±{results.blueStdDev.toFixed(1)}</div>
              </div>
            </div>
          </div>

          <div className="card p-5">
            <h2 className="font-display text-lg font-black tracking-wide mb-4">RP PROBABILITIES</h2>
            <div className="grid grid-cols-2 gap-4">
              {[["RED","red",results.rpProbs.red],["BLUE","blue",results.rpProbs.blue]].map(([label,color,rp])=>(
                <div key={label as string}>
                  <h3 className={`font-mono text-xs mb-3 ${color==="red"?"text-ftc-red":"text-ftc-blue"}`}>{label as string} ALLIANCE</h3>
                  {Object.entries(rp as Record<string,number>).map(([k,v])=>(
                    <div key={k} className="flex items-center gap-2 mb-2">
                      <span className="font-mono text-[10px] text-white/40 w-28 capitalize">{k.replace(/RP/," RP")}</span>
                      <div className="flex-1 h-1.5 bg-surface3 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${color==="red"?"bg-ftc-red":"bg-ftc-blue"}`} style={{width:`${v*100}%`}} />
                      </div>
                      <span className="font-mono text-xs text-white/60 w-10 text-right">{pct(v as number)}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {history.length > 0 && (
        <div className="mt-6">
          <h2 className="font-display text-xl font-black tracking-wide mb-3">RECENT SIMS</h2>
          <div className="space-y-2">
            {history.map(h=>(
              <div key={h.id} className="card p-3 flex items-center gap-4 cursor-pointer hover:bg-surface2 transition-colors" onClick={()=>setResults(h.results as unknown as ForgeResults)}>
                <div className="flex-1 font-mono text-xs">
                  <span className="text-ftc-red">{h.red_alliance.join(", ")}</span>
                  <span className="text-white/30 mx-2">vs</span>
                  <span className="text-ftc-blue">{h.blue_alliance.join(", ")}</span>
                </div>
                <div className="font-mono text-xs text-white/40">{pct(h.results.redWinPct)} red win</div>
                <div className="font-mono text-[10px] text-white/20">{new Date(h.created_at).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
