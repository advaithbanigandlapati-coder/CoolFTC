import { useState, useEffect, useMemo } from "react";
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from "react-native";
import { CartesianChart, Line, Bar, useChartPressState } from "victory-native";
import { supabase } from "../../lib/supabase";
import { C } from "../../lib/theme";
import { Card, Input, Btn, SectionHeader, StatGrid } from "../../components/ui";

type MatchEntry = {
  match_number:number; auto_score:number;
  teleop_score:number; endgame_score:number; total_score:number;
};
type StatRow = { team_number:string; opr:number|null; rank:number|null; wins:number; losses:number };
type ScoutEntry = { team_number:string; tier:string|null; form_data:Record<string,unknown> };
type Tab = "overview"|"timeline"|"compat"|"rankings";

const TIER_DOT:Record<string,string> = { OPTIMAL:"#2DD88A", MID:"#F59E0B", BAD:"#EF4444" };

function compatScore(a:ScoutEntry, b:ScoutEntry):number {
  let s=50; const af=a.form_data, bf=b.form_data;
  if(af.endgamePlan!==bf.endgamePlan) s+=12;
  if(Boolean(af.autoCloseRange)!==Boolean(bf.autoCloseRange)) s+=8;
  if(Boolean(af.autoFarRange)!==Boolean(bf.autoFarRange)) s+=8;
  if(Number(af.ballCapacity??1)>3&&Number(bf.ballCapacity??1)>3) s-=8;
  if(a.tier==="OPTIMAL"||b.tier==="OPTIMAL") s+=8;
  if(a.tier==="OPTIMAL"&&b.tier==="OPTIMAL") s+=10;
  if(a.tier==="BAD"||b.tier==="BAD") s-=15;
  return Math.max(0,Math.min(100,s));
}

export default function AnalyticsScreen() {
  const [tab,      setTab]     = useState<Tab>("overview");
  const [orgId,    setOrgId]   = useState("");
  const [eventKey, setEvent]   = useState("2025-DECODE-TEST");
  const [team,     setTeam]    = useState("");
  const [entries,  setEntries] = useState<MatchEntry[]>([]);
  const [allStats, setAllStats]= useState<StatRow[]>([]);
  const [scouts,   setScouts]  = useState<ScoutEntry[]>([]);
  const [loading,  setLoading] = useState(false);

  useEffect(()=>{
    supabase.auth.getUser().then(async({data:{user}})=>{
      if(!user) return;
      const{data:m}=await supabase.from("org_members").select("org_id").eq("user_id",user.id).single();
      if(m) setOrgId(m.org_id);
    });
  },[]);

  useEffect(()=>{
    if(!orgId) return;
    supabase.from("team_stats_cache").select("team_number,opr,rank,wins,losses")
      .eq("event_key",eventKey).then(({data})=>setAllStats((data??[]) as StatRow[]));
    supabase.from("scouting_entries").select("team_number,tier,form_data")
      .eq("org_id",orgId).eq("event_key",eventKey)
      .then(({data})=>setScouts((data??[]) as ScoutEntry[]));
  },[orgId,eventKey]);

  async function load() {
    if(!orgId||!team) return; setLoading(true);
    const{data}=await supabase.from("match_scouting")
      .select("match_number,auto_score,teleop_score,endgame_score,total_score")
      .eq("org_id",orgId).eq("event_key",eventKey).eq("team_number",team).order("match_number");
    setEntries((data??[]) as MatchEntry[]); setLoading(false);
  }

  const avg=(arr:number[])=>arr.length?(arr.reduce((a,b)=>a+b,0)/arr.length).toFixed(1):"—";

  // Timeline data for victory-native
  const tlData = useMemo(()=>entries.map((e,i)=>({
    x: e.match_number,
    rolling: Math.round(entries.slice(0,i+1).reduce((a,b)=>a+b.total_score,0)/(i+1)*10)/10,
    total: e.total_score,
  })),[entries]);

  // Compat matrix — top 8 teams
  const compatTeams = scouts.slice(0,8);
  const compatMatrix = useMemo(()=>compatTeams.map(a=>compatTeams.map(b=>
    a.team_number===b.team_number?100:compatScore(a,b)
  )),[compatTeams]);

  const TABS:{ id:Tab; label:string }[] = [
    { id:"overview",  label:"OVERVIEW"  },
    { id:"timeline",  label:"TIMELINE"  },
    { id:"compat",    label:"COMPAT"    },
    { id:"rankings",  label:"RANKINGS"  },
  ];

  return (
    <ScrollView style={{flex:1,backgroundColor:C.bg}}
      contentContainerStyle={{padding:20,paddingTop:60,paddingBottom:40}}>

      <SectionHeader label="ANALYTICS HUB" title="PERFORMANCE" />

      {/* Controls */}
      <View style={{flexDirection:"row",gap:8,marginBottom:12}}>
        <View style={{flex:2}}><Input value={eventKey} onChangeText={setEvent} placeholder="Event key"/></View>
        <View style={{flex:1}}><Input value={team} onChangeText={setTeam} placeholder="Team #" keyboardType="numeric"/></View>
        <Btn label={loading?"…":"Go"} onPress={load} style={{alignSelf:"flex-end",paddingHorizontal:16}}/>
      </View>

      {/* Tab bar */}
      <View style={{flexDirection:"row",borderBottomWidth:1,borderColor:C.border,marginBottom:16}}>
        {TABS.map(t=>(
          <TouchableOpacity key={t.id} onPress={()=>setTab(t.id)}
            style={{flex:1,alignItems:"center",paddingVertical:10,
              borderBottomWidth:2, borderBottomColor:tab===t.id?C.accent:"transparent"}}>
            <Text style={{color:tab===t.id?C.accent:C.text2,fontSize:9,letterSpacing:1}}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading && <ActivityIndicator color={C.accent} style={{marginVertical:24}}/>}

      {/* ── OVERVIEW ── */}
      {tab==="overview" && entries.length>0 && (
        <Card>
          <SectionHeader label={`TEAM ${team} · ${entries.length} MATCHES`}/>
          <StatGrid items={[
            {label:"AVG AUTO",   value:avg(entries.map(e=>e.auto_score))},
            {label:"AVG TELEOP", value:avg(entries.map(e=>e.teleop_score))},
            {label:"AVG ENDGAME",value:avg(entries.map(e=>e.endgame_score))},
            {label:"HIGH SCORE", value:String(Math.max(...entries.map(e=>e.total_score)))},
            {label:"LOW SCORE",  value:String(Math.min(...entries.map(e=>e.total_score)))},
            {label:"MATCHES",    value:String(entries.length)},
          ]}/>

          {/* Score bars per match */}
          <View style={{marginTop:16,gap:6}}>
            {entries.map((e,i)=>(
              <View key={i} style={{flexDirection:"row",alignItems:"center",gap:10}}>
                <Text style={{color:C.accent,fontSize:11,fontWeight:"700",width:28}}>Q{e.match_number}</Text>
                {/* Stacked bar */}
                <View style={{flex:1,height:12,flexDirection:"row",backgroundColor:C.surface3,borderRadius:4,overflow:"hidden"}}>
                  <View style={{width:`${(e.auto_score/Math.max(...entries.map(x=>x.total_score)))*100}%`,backgroundColor:"#5B9CF4"}}/>
                  <View style={{width:`${(e.teleop_score/Math.max(...entries.map(x=>x.total_score)))*100}%`,backgroundColor:"#2DD88A"}}/>
                  <View style={{width:`${(e.endgame_score/Math.max(...entries.map(x=>x.total_score)))*100}%`,backgroundColor:C.accent,borderRadius:4}}/>
                </View>
                <Text style={{color:C.text,fontSize:12,fontWeight:"700",width:30,textAlign:"right"}}>{e.total_score}</Text>
              </View>
            ))}
          </View>

          {/* Legend */}
          <View style={{flexDirection:"row",gap:16,marginTop:10}}>
            {[["Auto","#5B9CF4"],["Teleop","#2DD88A"],["Endgame",C.accent]].map(([l,col])=>(
              <View key={l} style={{flexDirection:"row",alignItems:"center",gap:4}}>
                <View style={{width:8,height:8,borderRadius:2,backgroundColor:col}}/>
                <Text style={{color:C.text2,fontSize:10}}>{l}</Text>
              </View>
            ))}
          </View>
        </Card>
      )}

      {/* ── TIMELINE ── */}
      {tab==="timeline" && (
        <Card>
          <SectionHeader label={`SCORE TRAJECTORY — TEAM ${team||"?"}`}/>
          {tlData.length>1 ? (
            <>
              <View style={{height:200}}>
                <CartesianChart data={tlData} xKey="x" yKeys={["rolling","total"]}>
                  {({ points })=>(
                    <>
                      <Line points={points.total}   color={C.accent+"80"} strokeWidth={1.5}/>
                      <Line points={points.rolling} color={C.accent}      strokeWidth={2.5}/>
                    </>
                  )}
                </CartesianChart>
              </View>
              <View style={{flexDirection:"row",gap:16,marginTop:8}}>
                <View style={{flexDirection:"row",alignItems:"center",gap:4}}><View style={{width:16,height:2,backgroundColor:C.accent}}/><Text style={{color:C.text2,fontSize:10}}>Rolling avg</Text></View>
                <View style={{flexDirection:"row",alignItems:"center",gap:4}}><View style={{width:16,height:2,backgroundColor:C.accent+"60"}}/><Text style={{color:C.text2,fontSize:10}}>Match score</Text></View>
              </View>
              {/* Distribution histogram */}
              {(()=>{
                const mn=Math.min(...entries.map(e=>e.total_score));
                const mx=Math.max(...entries.map(e=>e.total_score));
                const B=6, st=Math.max(1,(mx-mn)/B);
                const ct=Array(B).fill(0) as number[];
                entries.forEach(e=>ct[Math.min(B-1,Math.floor((e.total_score-mn)/st))]++);
                const mxC=Math.max(1,...ct);
                return (<View style={{marginTop:16}}>
                  <Text style={{color:C.text2,fontSize:9,letterSpacing:1.5,marginBottom:8}}>SCORE DISTRIBUTION</Text>
                  <View style={{flexDirection:"row",alignItems:"flex-end",height:60,gap:4}}>
                    {ct.map((c,i)=>(
                      <View key={i} style={{flex:1,alignItems:"center",gap:2}}>
                        <View style={{width:"100%",backgroundColor:C.accent+"90",borderRadius:3}} height={Math.round((c/mxC)*56)}/>
                        <Text style={{color:C.text2,fontSize:8}}>{Math.round(mn+i*st)}</Text>
                      </View>
                    ))}
                  </View>
                  <View style={{flexDirection:"row",justifyContent:"space-between",marginTop:6}}>
                    {[["Low",Math.min(...entries.map(e=>e.total_score))],["Avg",Math.round(entries.reduce((a,b)=>a+b.total_score,0)/entries.length)],["High",Math.max(...entries.map(e=>e.total_score))]].map(([l,v])=>(
                      <Text key={l as string} style={{color:C.text2,fontSize:10}}>{l as string}: <Text style={{color:C.text,fontWeight:"700"}}>{v}</Text></Text>
                    ))}
                  </View>
                </View>);
              })()}
            </>
          ) : <Text style={{color:C.text2,fontSize:12,textAlign:"center",paddingVertical:24}}>Analyze a team to see trajectory</Text>}
        </Card>
      )}

      {/* ── COMPAT ── */}
      {tab==="compat" && (
        <Card>
          <SectionHeader label="ALLIANCE COMPATIBILITY"/>
          {compatTeams.length<2
            ? <Text style={{color:C.text2,fontSize:12,textAlign:"center",paddingVertical:24}}>Need 2+ scouting entries</Text>
            : (<>
                <View style={{flexDirection:"row",marginBottom:4,paddingLeft:56}}>
                  {compatTeams.map(t=>(
                    <Text key={t.team_number} style={{flex:1,color:C.text2,fontSize:8,textAlign:"center"}} numberOfLines={1}>{t.team_number}</Text>
                  ))}
                </View>
                {compatMatrix.map((row,ri)=>(
                  <View key={ri} style={{flexDirection:"row",alignItems:"center",marginBottom:2}}>
                    <View style={{flexDirection:"row",alignItems:"center",gap:4,width:56}}>
                      {compatTeams[ri].tier&&<View style={{width:6,height:6,borderRadius:3,backgroundColor:TIER_DOT[compatTeams[ri].tier!]??C.text2}}/>}
                      <Text style={{color:C.text2,fontSize:9}} numberOfLines={1}>{compatTeams[ri].team_number}</Text>
                    </View>
                    {row.map((sc,ci)=>{
                      const self=ri===ci;
                      const bg=self?"#1A1A2720":sc>=80?"#2DD88A30":sc>=65?"#F59E0B20":sc<40?"#EF444420":"#FFFFFF08";
                      const cl=self?"#FFFFFF10":sc>=80?"#2DD88A":sc>=65?"#F59E0B":sc<40?"#EF4444":"#FFFFFF60";
                      return(<View key={ci} style={{flex:1,alignItems:"center",justifyContent:"center",height:28,backgroundColor:bg,borderRadius:3,margin:1}}>
                        <Text style={{color:cl,fontSize:9,fontWeight:"700"}}>{self?"—":sc>=80?"✦":String(sc)}</Text>
                      </View>);
                    })}
                  </View>
                ))}
                <View style={{flexDirection:"row",flexWrap:"wrap",gap:8,marginTop:10}}>
                  {[["✦80+ Strong","#2DD88A"],["65-79 Good","#F59E0B"],["<50 Conflict","#EF4444"]].map(([l,c])=>(
                    <Text key={l} style={{color:c as string,fontSize:9}}>● {l}</Text>
                  ))}
                </View>
              </>)
          }
        </Card>
      )}

      {/* ── RANKINGS ── */}
      {tab==="rankings" && allStats.length>0 && (
        <Card>
          <SectionHeader label="OPR RANKINGS"/>
          {allStats.sort((a,b)=>(b.opr??0)-(a.opr??0)).slice(0,20).map((s,i)=>(
            <View key={s.team_number} style={{flexDirection:"row",alignItems:"center",gap:10,
              paddingVertical:8,borderBottomWidth:1,borderColor:C.border,
              ...(s.team_number===team?{backgroundColor:C.accent+"10",marginHorizontal:-4,paddingHorizontal:4,borderRadius:4}:{})}}>
              <Text style={{color:C.text2,fontSize:11,width:20}}>{i+1}</Text>
              <Text style={{color:s.team_number===team?C.accent:C.text,fontSize:14,fontWeight:"700",flex:1}}>{s.team_number}</Text>
              <View style={{flex:2,height:4,backgroundColor:C.surface3,borderRadius:2,overflow:"hidden"}}>
                <View style={{height:"100%",width:`${((s.opr??0)/Math.max(1,...allStats.map(x=>x.opr??0)))*100}%`,
                  backgroundColor:s.team_number===team?C.accent:"#FFFFFF40",borderRadius:2}}/>
              </View>
              <Text style={{color:C.text2,fontSize:11,width:36,textAlign:"right"}}>{(s.opr??0).toFixed(1)}</Text>
              <Text style={{color:C.text2,fontSize:10,width:28,textAlign:"right"}}>{s.wins}-{s.losses}</Text>
            </View>
          ))}
        </Card>
      )}
    </ScrollView>
  );
}
