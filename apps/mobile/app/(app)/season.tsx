import { useState, useEffect } from "react";
import { View, Text, ScrollView, TouchableOpacity } from "react-native";
import { supabase } from "../../lib/supabase";
import { C } from "../../lib/theme";
import { Card, Input, Btn, SectionHeader } from "../../components/ui";

export default function SeasonScreen() {
  const [orgId,setOrgId]=useState("");
  const [userId,setUserId]=useState("");
  const [watchlist,setWatchlist]=useState<{team_number:string;reason:string|null}[]>([]);
  const [addTeam,setAddTeam]=useState("");
  const [addReason,setAddReason]=useState("");

  useEffect(()=>{
    supabase.auth.getUser().then(async({data:{user}})=>{
      if(!user) return;
      setUserId(user.id);
      const{data:m}=await supabase.from("org_members").select("org_id").eq("user_id",user.id).single();
      if(!m) return;
      setOrgId(m.org_id);
      const{data:wl}=await supabase.from("watchlist").select("team_number,reason").eq("org_id",m.org_id);
      setWatchlist((wl??[]) as typeof watchlist);
    });
  },[]);

  async function addWatch(){
    if(!addTeam||!orgId) return;
    await supabase.from("watchlist").upsert({org_id:orgId,team_number:addTeam,added_by:userId,reason:addReason||null});
    const{data:wl}=await supabase.from("watchlist").select("team_number,reason").eq("org_id",orgId);
    setWatchlist((wl??[]) as typeof watchlist);
    setAddTeam("");setAddReason("");
  }

  return (
    <ScrollView style={{flex:1,backgroundColor:C.bg}} contentContainerStyle={{padding:20,paddingTop:60,gap:12,paddingBottom:40}} keyboardShouldPersistTaps="handled">
      <Text style={{color:C.accent,fontSize:10,letterSpacing:3}}>SEASON HUB</Text>
      <Text style={{color:C.text,fontSize:34,fontWeight:"900",letterSpacing:2,marginBottom:4}}>DECODE 25–26</Text>

      <Card>
        <SectionHeader label="QUICK REFERENCE" />
        {[["Season","DECODE 2025–26"],["Endgame","Partial +5 · Full +10 · Both +20"],["Movement RP","≥16 teleop points"],["Goal RP","≥36 teleop points"],["Alliance","Snake draft · Top 4 captains"]].map(([k,v])=>(
          <View key={k as string} style={{flexDirection:"row",gap:12,paddingVertical:8,borderBottomWidth:1,borderBottomColor:C.border}}>
            <Text style={{color:C.text2,fontSize:12,width:100}}>{k as string}</Text>
            <Text style={{color:C.text,fontSize:13,flex:1}}>{v as string}</Text>
          </View>
        ))}
      </Card>

      <Card>
        <SectionHeader label="RIVAL TRACKER" />
        <View style={{flexDirection:"row",gap:8,marginBottom:10}}>
          <View style={{flex:1}}><Input value={addTeam} onChangeText={setAddTeam} placeholder="Team #" keyboardType="numeric" /></View>
          <View style={{flex:2}}><Input value={addReason} onChangeText={setAddReason} placeholder="Reason" /></View>
          <Btn label="Add" onPress={addWatch} style={{alignSelf:"flex-end"}} />
        </View>
        {watchlist.length===0&&<Text style={{color:C.text3,fontSize:12}}>No rivals tracked</Text>}
        {watchlist.map(w=>(
          <View key={w.team_number} style={{flexDirection:"row",alignItems:"center",gap:10,backgroundColor:C.surface2,borderRadius:8,padding:10,marginBottom:6}}>
            <Text style={{color:C.text,fontSize:15,fontWeight:"700",flex:1}}>{w.team_number}</Text>
            {w.reason&&<Text style={{color:C.text2,fontSize:12}}>{w.reason}</Text>}
            <TouchableOpacity onPress={async()=>{await supabase.from("watchlist").delete().eq("org_id",orgId).eq("team_number",w.team_number);setWatchlist(x=>x.filter(y=>y.team_number!==w.team_number));}}>
              <Text style={{color:C.text3,fontSize:13}}>✕</Text>
            </TouchableOpacity>
          </View>
        ))}
      </Card>
    </ScrollView>
  );
}
