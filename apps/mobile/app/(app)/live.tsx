import { useState, useEffect } from "react";
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl } from "react-native";
import { supabase } from "../../lib/supabase";
import { C } from "../../lib/theme";
import { Input, SectionHeader } from "../../components/ui";

type TeamStat = {team_number:string;rank:number|null;opr:number|null;wins:number;losses:number;high_score:number|null;ftc_teams?:{team_name:string|null}};

export default function LiveScreen() {
  const [eventKey, setEventKey] = useState("2025-DECODE-TEST");
  const [stats, setStats] = useState<TeamStat[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [myTeam, setMyTeam] = useState("");

  async function load() {
    setRefreshing(true);
    const {data} = await supabase.from("team_stats_cache").select("*,ftc_teams(team_name)").eq("event_key",eventKey).order("rank",{nullsFirst:false}).limit(60);
    setStats((data as TeamStat[])??[]);
    setRefreshing(false);
  }

  useEffect(()=>{load();}, [eventKey]);

  const myRow = stats.find(s=>s.team_number===myTeam);

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={C.accent} />}>
      <Text style={styles.eyebrow}>LIVE INTEL</Text>
      <Text style={styles.title}>MATCH STATS</Text>

      <View style={{flexDirection:"row",gap:8,alignItems:"center"}}>
        <View style={{flex:2}}><Input value={eventKey} onChangeText={setEventKey} placeholder="Event key" /></View>
        <View style={{flex:1}}><Input value={myTeam} onChangeText={setMyTeam} placeholder="My team" keyboardType="numeric" /></View>
      </View>

      {myRow && (
        <View style={styles.myTeamCard}>
          <Text style={{color:C.accent,fontSize:10,letterSpacing:3,marginBottom:8}}>YOUR TEAM</Text>
          <View style={{flexDirection:"row",gap:20}}>
            {[["RANK",`#${myRow.rank??"-"}`],["OPR",(myRow.opr??0).toFixed(1)],["W-L",`${myRow.wins}-${myRow.losses}`]].map(([l,v])=>(
              <View key={l as string}>
                <Text style={{color:C.accent,fontSize:26,fontWeight:"900"}}>{v}</Text>
                <Text style={{color:C.text2,fontSize:9,letterSpacing:2}}>{l as string}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      <View style={styles.tableHead}>
        {["RANK","TEAM","OPR","W-L","HIGH"].map(h=>(
          <Text key={h} style={[styles.headCell,h==="TEAM"&&{flex:2}]}>{h}</Text>
        ))}
      </View>

      {stats.length===0 && <Text style={{color:C.text3,textAlign:"center",marginTop:40,fontSize:13}}>Pull down to refresh.{"\n"}No data yet for this event key.</Text>}
      {stats.map(s=>(
        <View key={s.team_number} style={[styles.row, s.team_number===myTeam&&{backgroundColor:C.accentDim}]}>
          <Text style={styles.cell}>{s.rank??"-"}</Text>
          <View style={{flex:2}}>
            <Text style={{color:C.text,fontSize:12,fontWeight:"600"}}>{s.team_number}</Text>
            <Text style={{color:C.text2,fontSize:10}} numberOfLines={1}>{(s.ftc_teams as {team_name:string|null}|undefined)?.team_name??""}</Text>
          </View>
          <Text style={styles.cell}>{(s.opr??0).toFixed(1)}</Text>
          <Text style={styles.cell}>{s.wins}-{s.losses}</Text>
          <Text style={styles.cell}>{s.high_score??"-"}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root:{flex:1,backgroundColor:C.bg},
  content:{padding:20,paddingTop:60,gap:12,paddingBottom:40},
  eyebrow:{color:C.accent,fontSize:10,letterSpacing:3},
  title:{color:C.text,fontSize:34,fontWeight:"900",letterSpacing:2},
  myTeamCard:{backgroundColor:C.accentDim,borderRadius:12,padding:16,borderWidth:1,borderColor:C.accent+"40"},
  tableHead:{flexDirection:"row",backgroundColor:C.bg3,padding:10,borderRadius:8,borderWidth:1,borderColor:C.border},
  headCell:{flex:1,color:C.text2,fontSize:9,letterSpacing:2},
  row:{flexDirection:"row",padding:10,borderBottomWidth:1,borderBottomColor:C.border,alignItems:"center"},
  cell:{flex:1,color:C.text,fontSize:12},
});
