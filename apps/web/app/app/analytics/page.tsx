"use client";
import { useEffect, useState, useMemo } from "react";
import { createBrowserClient } from "@supabase/ssr";
import {
  RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, LineChart, Line, Legend,
} from "recharts";

const sb = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

type MatchRow = { match_number:number; auto_score:number; teleop_score:number; endgame_score:number; total_score:number };
type StatRow  = { team_number:string; opr:number|null; rank:number|null; wins:number; losses:number };
type ScoutEntry = { team_number:string; tier:string|null; form_data:Record<string,unknown> };
type Tab = "radar"|"timeline"|"compat"|"heatmap"|"rankings";

const HEATMAP_W = 380; const HEATMAP_H = 260; const GRID = 16;
const TIER_COLOR:Record<string,string> = { OPTIMAL:"#2DD88A", MID:"#F59E0B", BAD:"#EF4444" };

function heatColor(d:number,max:number){
  const t=max>0?d/max:0;
  return `rgba(${Math.round(255*Math.min(1,t*2))},${Math.round(90*(1-t))},31,${0.15+t*0.75})`;
}

function compatScore(a:ScoutEntry,b:ScoutEntry):number{
  let s=50;const af=a.form_data,bf=b.form_data;
  if(af.endgamePlan!==bf.endgamePlan)s+=12;
  if(Boolean(af.autoCloseRange)!==Boolean(bf.autoCloseRange))s+=8;
  if(Boolean(af.autoFarRange)!==Boolean(bf.autoFarRange))s+=8;
  if(Number(af.ballCapacity??1)>3&&Number(bf.ballCapacity??1)>3)s-=8;
  if(a.tier==="OPTIMAL"||b.tier==="OPTIMAL")s+=8;
  if(a.tier==="OPTIMAL"&&b.tier==="OPTIMAL")s+=10;
  if(a.tier==="BAD"||b.tier==="BAD")s-=15;
  return Math.max(0,Math.min(100,s));
}

export default function AnalyticsPage() {
  const [tab,setTab]=useState<Tab>("radar");
  const [orgId,setOrgId]=useState("");
  const [eventKey,setEventKey]=useState("2025-DECODE-TEST");
  const [team,setTeam]=useState("");const [cmp,setCmp]=useState("");
  const [tsA,setTsA]=useState<MatchRow[]>([]);const [tsB,setTsB]=useState<MatchRow[]>([]);
  const [allStats,setAllStats]=useState<StatRow[]>([]);
  const [entries,setEntries]=useState<ScoutEntry[]>([]);
  const [loading,setLoading]=useState(false);

  useEffect(()=>{sb.auth.getUser().then(async({data:{user}})=>{if(!user)return;const{data:m}=await sb.from("org_members").select("org_id").eq("user_id",user.id).single();if(m)setOrgId(m.org_id);});}, []);
  useEffect(()=>{if(!orgId)return;sb.from("team_stats_cache").select("team_number,opr,rank,wins,losses").eq("event_key",eventKey).then(({data})=>setAllStats((data ?? []) as unknown as StatRow[]));sb.from("scouting_entries").select("team_number,tier,form_data").eq("org_id",orgId).eq("event_key",eventKey).then(({data})=>setEntries((data ?? []) as unknown as ScoutEntry[]));}, [orgId,eventKey]);

  async function loadT(tn:string,s:(r:MatchRow[])=>void){if(!orgId||!tn)return;setLoading(true);const{data}=await sb.from("match_scouting").select("match_number,auto_score,teleop_score,endgame_score,total_score").eq("org_id",orgId).eq("event_key",eventKey).eq("team_number",tn).order("match_number");s((data ?? []) as unknown as MatchRow[]);setLoading(false);}
  function analyze(){loadT(team,setTsA);if(cmp)loadT(cmp,setTsB);}

  const radar=tsA.length?[
    {subject:"Auto",    A:tsA.reduce((a,b)=>a+b.auto_score,0)/tsA.length,   B:tsB.length?tsB.reduce((a,b)=>a+b.auto_score,0)/tsB.length:undefined},
    {subject:"Teleop",  A:tsA.reduce((a,b)=>a+b.teleop_score,0)/tsA.length, B:tsB.length?tsB.reduce((a,b)=>a+b.teleop_score,0)/tsB.length:undefined},
    {subject:"Endgame", A:tsA.reduce((a,b)=>a+b.endgame_score,0)/tsA.length,B:tsB.length?tsB.reduce((a,b)=>a+b.endgame_score,0)/tsB.length:undefined},
    {subject:"Consist", A:tsA.length>1?Math.max(0,30-Math.sqrt(tsA.reduce((a,b)=>a+(b.total_score-tsA.reduce((x,y)=>x+y.total_score,0)/tsA.length)**2,0)/tsA.length)):0,
                        B:tsB.length>1?Math.max(0,30-Math.sqrt(tsB.reduce((a,b)=>a+(b.total_score-tsB.reduce((x,y)=>x+y.total_score,0)/tsB.length)**2,0)/tsB.length)):undefined},
    {subject:"Peak",    A:Math.max(...tsA.map(m=>m.total_score)),            B:tsB.length?Math.max(...tsB.map(m=>m.total_score)):undefined},
  ]:[];

  const timelineData=useMemo(()=>{
    if(!tsA.length)return[];
    const teams=[{key:team,rows:tsA},...(cmp&&tsB.length?[{key:cmp,rows:tsB}]:[])];
    const byMatch:Record<number,Record<string,number>>={};
    teams.forEach(({key,rows})=>rows.forEach((r,i)=>{const roll=rows.slice(0,i+1).reduce((a,b)=>a+b.total_score,0)/(i+1);(byMatch[r.match_number]=byMatch[r.match_number]??{})[key]=Math.round(roll*10)/10;}));
    return Object.entries(byMatch).sort(([a],[b])=>Number(a)-Number(b)).map(([m,vals])=>({match:Number(m),...vals}));
  },[tsA,tsB,team,cmp]);

  const compat=useMemo(()=>{if(entries.length<2)return{teams:[],matrix:[]};const ts=entries.slice(0,12);return{teams:ts.map(t=>t.team_number),matrix:ts.map(a=>ts.map(b=>a.team_number===b.team_number?100:compatScore(a,b)))};}, [entries]);

  const heatPts=useMemo(()=>{const e=entries.find(x=>x.team_number===team);if(!e)return[];const f=e.form_data,pts:{x:number;y:number}[]=[];if(f.autoCloseRange)for(let i=0;i<6;i++)pts.push({x:.1+Math.random()*.2,y:.25+Math.random()*.5});if(f.autoFarRange)for(let i=0;i<3;i++)pts.push({x:.65+Math.random()*.2,y:.2+Math.random()*.6});for(let i=0;i<Number(f.avgBallsTeleop??0);i++)pts.push({x:.1+Math.random()*.8,y:.1+Math.random()*.75});if(f.endgamePlan==="full"||f.endgamePlan==="both")pts.push({x:.45+Math.random()*.1,y:.82+Math.random()*.12});return pts;}, [entries,team]);
  const grid=useMemo(()=>{const g=Array.from({length:GRID},()=>Array(GRID).fill(0) as number[]);heatPts.forEach(({x,y})=>{g[Math.min(GRID-1,Math.floor(y*GRID))][Math.min(GRID-1,Math.floor(x*GRID))]++;});return g;}, [heatPts]);
  const maxD=useMemo(()=>Math.max(1,...grid.flat()), [grid]);

  const TABS=[{id:"radar",l:"RADAR"},{id:"timeline",l:"OPR TIMELINE"},{id:"compat",l:"COMPAT MATRIX"},{id:"heatmap",l:"FIELD HEATMAP"},{id:"rankings",l:"OPR RANKINGS"}] as {id:Tab;l:string}[];
  const Placeholder=({msg}:{msg:string})=><div className="flex items-center justify-center h-48 text-white/20 font-mono text-sm">{msg}</div>;

  return (
    <div className="p-6 max-w-5xl">
      <div className="mb-4"><p className="font-mono text-[10px] text-accent tracking-widest mb-1">ANALYTICS HUB</p><h1 className="font-display text-4xl font-black tracking-wide">PERFORMANCE ANALYSIS</h1></div>
      <div className="flex gap-3 mb-5 flex-wrap items-end">
        <div><div className="label mb-1 font-mono text-[10px] text-white/40">EVENT</div><input className="input w-48" value={eventKey} onChange={e=>setEventKey(e.target.value)} placeholder="Event key"/></div>
        <div><div className="label mb-1 font-mono text-[10px] text-white/40">TEAM A</div><input className="input w-28" value={team} onChange={e=>setTeam(e.target.value)} placeholder="Team #"/></div>
        <div><div className="label mb-1 font-mono text-[10px] text-white/40">TEAM B (compare)</div><input className="input w-28" value={cmp} onChange={e=>setCmp(e.target.value)} placeholder="Optional"/></div>
        <button className="btn px-5 text-sm" onClick={analyze} disabled={loading||!team}>{loading?"Loading…":"Analyze →"}</button>
      </div>
      <div className="flex gap-1 border-b border-white/[0.065] mb-5 overflow-x-auto">
        {TABS.map(t=><button key={t.id} onClick={()=>setTab(t.id)} className={`px-4 py-2 font-mono text-[11px] tracking-widest whitespace-nowrap transition-colors ${tab===t.id?"text-accent border-b border-accent":"text-white/40 hover:text-white/70"}`}>{t.l}</button>)}
      </div>

      {tab==="radar"&&<div className="grid md:grid-cols-2 gap-4">
        <div className="card p-5">
          <h2 className="font-display text-lg font-black tracking-wide mb-4">TEAM {team||"?"}{cmp&&<span className="text-white/40"> vs {cmp}</span>}</h2>
          {radar.length>0?<ResponsiveContainer width="100%" height={280}><RadarChart data={radar}><PolarGrid stroke="rgba(255,255,255,0.08)"/><PolarAngleAxis dataKey="subject" tick={{fill:"rgba(255,255,255,0.4)",fontSize:11,fontFamily:"DM Mono"}}/><Radar name={`Team ${team}`} dataKey="A" stroke="#FF5A1F" fill="#FF5A1F" fillOpacity={0.25} strokeWidth={2}/>{cmp&&tsB.length>0&&<Radar name={`Team ${cmp}`} dataKey="B" stroke="#5B9CF4" fill="#5B9CF4" fillOpacity={0.15} strokeWidth={2}/>}{cmp&&tsB.length>0&&<Legend/>}</RadarChart></ResponsiveContainer>:<Placeholder msg="Enter a team and click Analyze"/>}
        </div>
        <div className="card p-5">
          <h2 className="font-display text-lg font-black tracking-wide mb-4">SCORE BY MATCH</h2>
          {tsA.length>0?<ResponsiveContainer width="100%" height={280}><BarChart data={tsA} barCategoryGap="30%"><CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)"/><XAxis dataKey="match_number" tick={{fill:"rgba(255,255,255,0.4)",fontSize:10}} tickFormatter={v=>`Q${v}`}/><YAxis tick={{fill:"rgba(255,255,255,0.4)",fontSize:10}}/><Tooltip contentStyle={{background:"#18181F",border:"1px solid rgba(255,255,255,0.1)",borderRadius:8,color:"#EAE8DE",fontFamily:"DM Mono",fontSize:12}}/><Bar dataKey="auto_score" stackId="a" fill="#5B9CF4" name="Auto"/><Bar dataKey="teleop_score" stackId="a" fill="#2DD88A" name="Teleop"/><Bar dataKey="endgame_score" stackId="a" fill="#FF5A1F" name="Endgame" radius={[4,4,0,0]}/><Legend/></BarChart></ResponsiveContainer>:<Placeholder msg="No match data"/>}
        </div>
      </div>}

      {tab==="timeline"&&<div className="card p-5">
        <h2 className="font-display text-lg font-black tracking-wide mb-1">OPR / SCORE TRAJECTORY</h2>
        <p className="font-mono text-[10px] text-white/30 mb-4">Rolling average score across quals — tighter distribution = more consistent robot</p>
        {timelineData.length>0?<ResponsiveContainer width="100%" height={300}><LineChart data={timelineData}><CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)"/><XAxis dataKey="match" tick={{fill:"rgba(255,255,255,0.4)",fontSize:10}} tickFormatter={v=>`Q${v}`}/><YAxis tick={{fill:"rgba(255,255,255,0.4)",fontSize:10}}/><Tooltip contentStyle={{background:"#18181F",border:"1px solid rgba(255,255,255,0.1)",borderRadius:8,color:"#EAE8DE",fontFamily:"DM Mono",fontSize:12}}/><Legend/>{team&&<Line type="monotone" dataKey={team} stroke="#FF5A1F" strokeWidth={2} dot={{r:3,fill:"#FF5A1F"}} name={`Team ${team}`} connectNulls/>}{cmp&&tsB.length>0&&<Line type="monotone" dataKey={cmp} stroke="#5B9CF4" strokeWidth={2} dot={{r:3,fill:"#5B9CF4"}} name={`Team ${cmp}`} connectNulls/>}</LineChart></ResponsiveContainer>:<Placeholder msg="Analyze a team to see their trajectory"/>}
        {tsA.length>1&&(<div className="mt-6">
          <h3 className="font-display font-black tracking-wide mb-3 text-sm">SCORE DISTRIBUTION — Team {team}</h3>
          <div className="flex items-end gap-1 h-20">{(()=>{const mn=Math.min(...tsA.map(m=>m.total_score)),mx=Math.max(...tsA.map(m=>m.total_score)),B=8,st=Math.max(1,(mx-mn)/B),ct=Array(B).fill(0) as number[];tsA.forEach(m=>{ct[Math.min(B-1,Math.floor((m.total_score-mn)/st))]++;});const mxC=Math.max(1,...ct);return ct.map((c,i)=><div key={i} className="flex-1 flex flex-col items-center gap-1"><div className="w-full bg-accent/70 rounded-t" style={{height:`${(c/mxC)*72}px`}}/><div className="font-mono text-[8px] text-white/30">{Math.round(mn+i*st)}</div></div>);})()}</div>
          <div className="flex justify-between font-mono text-[9px] text-white/30 mt-1"><span>Low: {Math.min(...tsA.map(m=>m.total_score))}</span><span>Avg: {Math.round(tsA.reduce((a,b)=>a+b.total_score,0)/tsA.length)}</span><span>High: {Math.max(...tsA.map(m=>m.total_score))}</span></div>
        </div>)}
      </div>}

      {tab==="compat"&&<div className="card p-5">
        <h2 className="font-display text-lg font-black tracking-wide mb-1">ALLIANCE COMPATIBILITY MATRIX</h2>
        <p className="font-mono text-[10px] text-white/30 mb-4">Pairwise scores from scouted data — auto range, endgame type, capacity, tier. Sync event data and scout teams first.</p>
        {compat.teams.length<2?<Placeholder msg="Need 2+ scouting entries to compute compatibility"/>:
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead><tr><th className="w-20"/>{compat.teams.map(t=><th key={t} className="font-mono text-[9px] text-white/40 pb-2 text-center w-14" title={`Team ${t}`}>{t}</th>)}</tr></thead>
            <tbody>{compat.teams.map((rt,ri)=>{const en=entries.find(e=>e.team_number===rt);return(<tr key={rt}><td className="font-mono text-[9px] text-white/60 pr-3 text-right py-0.5"><div className="flex items-center justify-end gap-1.5">{en?.tier&&<span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{background:TIER_COLOR[en.tier]??""}}/>}{rt}</div></td>{compat.matrix[ri].map((sc,ci)=>{const self=ri===ci;const bg=self?"rgba(255,255,255,0.03)":sc>=80?"#2DD88A30":sc>=65?"#F59E0B20":sc<40?"#EF444420":"rgba(255,255,255,0.04)";const cl=self?"rgba(255,255,255,0.1)":sc>=80?"#2DD88A":sc>=65?"#F59E0B":sc<40?"#EF4444":"rgba(255,255,255,0.5)";return(<td key={ci} className="text-center py-1 font-mono text-[10px] rounded" style={{background:bg,color:cl}} title={self?"":String(sc)}>{self?"—":sc>=80?"✦":String(sc)}</td>);})}</tr>);})}
            </tbody>
          </table>
          <div className="flex gap-4 mt-4 font-mono text-[10px] text-white/40"><span><span className="text-ftc-green">✦ 80+</span> Strong</span><span><span className="text-amber-400">65-79</span> Good</span><span><span className="text-white/40">50-64</span> Neutral</span><span><span className="text-red-400">&lt;50</span> Conflict</span></div>
        </div>}
      </div>}

      {tab==="heatmap"&&<div className="card p-5">
        <h2 className="font-display text-lg font-black tracking-wide mb-1">FIELD SCORING HEATMAP — Team {team||"?"}</h2>
        <p className="font-mono text-[10px] text-white/30 mb-4">Inferred field positions from scouted data — auto range, teleop volume, endgame zone.</p>
        {heatPts.length>0?<div className="flex gap-6 flex-wrap">
          <div className="relative rounded overflow-hidden border border-white/[0.065]" style={{width:HEATMAP_W,height:HEATMAP_H,background:"#0F0F17"}}>
            <div className="absolute top-2 left-2 font-mono text-[9px] text-white/20">CLOSE ZONE</div>
            <div className="absolute top-2 right-2 font-mono text-[9px] text-white/20">FAR ZONE</div>
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 font-mono text-[9px] text-white/20">ENDGAME</div>
            <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/5"/>
            <div className="absolute bottom-1/4 left-0 right-0 h-px bg-white/5"/>
            <svg width={HEATMAP_W} height={HEATMAP_H} className="absolute inset-0">
              {grid.map((row,gy)=>row.map((d,gx)=><rect key={`${gy}-${gx}`} x={(gx/GRID)*HEATMAP_W} y={(gy/GRID)*HEATMAP_H} width={HEATMAP_W/GRID} height={HEATMAP_H/GRID} fill={heatColor(d,maxD)} rx={2}/>))}
            </svg>
          </div>
          <div className="space-y-2 font-mono text-xs">{(()=>{const e=entries.find(x=>x.team_number===team);if(!e)return null;const f=e.form_data;return[["Close range","autoCloseRange"],["Far range","autoFarRange"]].map(([l,k])=><div key={k} className="flex items-center justify-between gap-8"><span className="text-white/40">{l}</span><span className={Boolean(f[k])?"text-ftc-green":"text-white/20"}>{Boolean(f[k])?"✓":"—"}</span></div>).concat([["Avg teleop",String(f.avgBallsTeleop??0)],["Endgame",String(f.endgamePlan??"none")],["Tier",String(e.tier??"unranked")]].map(([l,v])=><div key={l} className="flex items-center justify-between gap-8"><span className="text-white/40">{l}</span><span className="text-white/70">{v}</span></div>));})()}</div>
        </div>:<Placeholder msg={team?"No scouting entry for this team":"Enter a team and click Analyze"}/>}
      </div>}

      {tab==="rankings"&&allStats.length>0&&<div>
        <h2 className="font-display text-lg font-black tracking-wide mb-3">OPR RANKINGS — {eventKey}</h2>
        <div className="card overflow-hidden">{allStats.sort((a,b)=>(b.opr??0)-(a.opr??0)).slice(0,24).map((s,i)=>(
          <div key={s.team_number} className={`flex items-center gap-4 px-4 py-2.5 border-b border-white/[0.04] last:border-0 ${s.team_number===team?"bg-accent/5 border-l-2 border-l-accent":""}`}>
            <span className="font-mono text-xs text-white/30 w-5">{i+1}</span>
            <span className="font-display text-sm font-black w-20">{s.team_number}</span>
            <div className="flex-1 h-1 bg-white/5 rounded-full overflow-hidden"><div className="h-full bg-accent rounded-full" style={{width:`${((s.opr??0)/Math.max(...allStats.map(x=>x.opr??0)))*100}%`}}/></div>
            <span className="font-mono text-xs text-white/60 w-16 text-right">{(s.opr??0).toFixed(1)} OPR</span>
            <span className="font-mono text-xs text-white/30 w-10 text-right">{s.wins}–{s.losses}</span>
          </div>
        ))}</div>
      </div>}
    </div>
  );
}
