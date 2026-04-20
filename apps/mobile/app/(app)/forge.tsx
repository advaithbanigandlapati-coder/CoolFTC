import { useState, useEffect } from "react";
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert } from "react-native";
import { supabase } from "../../lib/supabase";
import { C } from "../../lib/theme";
import { Card, Label, Input, Btn, SectionHeader, StatGrid } from "../../components/ui";
import { runForge } from "@coolfTC/ui";
import type { ForgeResults } from "@coolfTC/types";

export default function ForgeScreen() {
  const [orgId, setOrgId] = useState("");
  const [userId, setUserId] = useState("");
  const [eventKey, setEventKey] = useState("2025-DECODE-TEST");
  const [red, setRed] = useState(["","",""]);
  const [blue, setBlue] = useState(["","",""]);
  const [results, setResults] = useState<ForgeResults|null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(async ({data:{user}}) => {
      if (!user) return;
      setUserId(user.id);
      const {data:m} = await supabase.from("org_members").select("org_id").eq("user_id",user.id).single();
      if (m) setOrgId(m.org_id);
    });
  }, []);

  async function sim() {
    const r = red.filter(Boolean), b = blue.filter(Boolean);
    if (r.length<2||b.length<2) { Alert.alert("Need at least 2 teams per side"); return; }
    setRunning(true);
    await new Promise(resolve=>setTimeout(resolve,50));
    const res = runForge({teams:r,stats:[],entries:[]},{teams:b,stats:[],entries:[]},1000);
    setResults(res);
    if (orgId) {
      await supabase.from("forge_simulations").insert({
        org_id:orgId,event_key:eventKey,red_alliance:r,blue_alliance:b,
        iterations:1000,results:res,created_by:userId,
      });
    }
    setRunning(false);
  }

  const pct = (n: number) => `${(n*100).toFixed(1)}%`;

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.eyebrow}>THE FORGE</Text>
      <Text style={styles.title}>MONTE CARLO</Text>
      <Text style={styles.sub}>1,000 match simulations</Text>

      <Card style={{borderTopWidth:2,borderTopColor:C.red}}>
        <SectionHeader label="RED ALLIANCE" />
        {red.map((t,i)=>(
          <View key={i} style={{marginBottom:8}}>
            <Input value={t} onChangeText={v=>{const n=[...red];n[i]=v;setRed(n);}} placeholder={`Team ${i+1}`} keyboardType="numeric" />
          </View>
        ))}
      </Card>

      <Card style={{borderTopWidth:2,borderTopColor:C.blue}}>
        <SectionHeader label="BLUE ALLIANCE" />
        {blue.map((t,i)=>(
          <View key={i} style={{marginBottom:8}}>
            <Input value={t} onChangeText={v=>{const n=[...blue];n[i]=v;setBlue(n);}} placeholder={`Team ${i+1}`} keyboardType="numeric" />
          </View>
        ))}
      </Card>

      <Btn label={running?"Simulating 1,000×…":"Run Simulation ⚡"} onPress={sim} loading={running} />

      {results && (
        <>
          <Card>
            <SectionHeader label="RESULTS" />
            <View style={{flexDirection:"row",gap:1,backgroundColor:C.border,borderRadius:10,overflow:"hidden",marginBottom:16}}>
              {[{label:"RED AVG",v:results.redMean.toFixed(1),color:C.red},{label:"WIN PROB",v:pct(results.redWinPct),color:C.text},{label:"BLUE AVG",v:results.blueMean.toFixed(1),color:C.blue}].map(({label,v,color})=>(
                <View key={label} style={{flex:1,backgroundColor:C.surface,padding:12,alignItems:"center"}}>
                  <Text style={{color,fontSize:22,fontWeight:"900"}}>{v}</Text>
                  <Text style={{color:C.text2,fontSize:9,marginTop:4,letterSpacing:1}}>{label}</Text>
                </View>
              ))}
            </View>
            <View style={styles.winBar}>
              <View style={[styles.redBar,{flex:results.redWinPct}]} />
              <View style={[styles.blueBar,{flex:results.blueWinPct}]} />
            </View>
            <Text style={styles.winBarLabel}>{pct(results.redWinPct)} RED · {pct(results.blueWinPct)} BLUE</Text>
          </Card>
          <Card>
            <SectionHeader label="RP PROBABILITIES" />
            {Object.entries({movementRP:"Movement RP (≥16 pts)",goalRP:"Goal RP (≥36 pts)"}).map(([key,label])=>(
              <View key={key} style={{marginBottom:12}}>
                <View style={{flexDirection:"row",justifyContent:"space-between",marginBottom:4}}>
                  <Text style={{color:C.text2,fontSize:12}}>{label}</Text>
                  <Text style={{color:C.text,fontSize:12,fontWeight:"600"}}>{pct(results.rpProbs.red[key as keyof typeof results.rpProbs.red])}</Text>
                </View>
                <View style={styles.rpTrack}>
                  <View style={[styles.rpFill,{width:`${results.rpProbs.red[key as keyof typeof results.rpProbs.red]*100}%`}]} />
                </View>
              </View>
            ))}
          </Card>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root:{flex:1,backgroundColor:C.bg},
  content:{padding:20,paddingTop:60,gap:12},
  eyebrow:{color:C.accent,fontSize:10,letterSpacing:3},
  title:{color:C.text,fontSize:34,fontWeight:"900",letterSpacing:2},
  sub:{color:C.text2,fontSize:13,marginBottom:4},
  winBar:{flexDirection:"row",height:8,borderRadius:4,overflow:"hidden",marginBottom:6},
  redBar:{backgroundColor:C.red},
  blueBar:{backgroundColor:C.blue},
  winBarLabel:{color:C.text2,fontSize:11,textAlign:"center"},
  rpTrack:{height:6,backgroundColor:C.surface3,borderRadius:3,overflow:"hidden"},
  rpFill:{height:"100%",backgroundColor:C.accent,borderRadius:3},
});
