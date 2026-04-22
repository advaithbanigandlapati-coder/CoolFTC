import { useState, useEffect } from "react";
import { View, Text, ScrollView, Alert } from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "../../lib/supabase";
import { C } from "../../lib/theme";
import { Card, Input, Btn, Label, SectionHeader } from "../../components/ui";

export default function SettingsScreen() {
  const router = useRouter();
  const [org,setOrg]=useState<{id:string;name:string;ftc_team_number:string|null}|null>(null);
  const [user,setUser]=useState<{email:string;display_name:string}|null>(null);
  const [members,setMembers]=useState<{user_id:string;role:string;profiles:{display_name:string}}[]>([]);
  const [name,setName]=useState("");

  useEffect(()=>{
    supabase.auth.getUser().then(async({data:{user:u}})=>{
      if(!u) return;
      setUser({email:u.email??"",display_name:u.user_metadata?.display_name??""});
      const{data:m}=await supabase.from("org_members").select("org_id,role,organizations(id,name,ftc_team_number)").eq("user_id",u.id).maybeSingle();
      if(!m) return;
      const o=m.organizations as unknown as {id:string;name:string;ftc_team_number:string|null};
      setOrg(o);setName(o.name);
      const{data:mems}=await supabase.from("org_members").select("user_id,role,profiles(display_name)").eq("org_id",o.id);
      setMembers((mems??[]) as unknown as typeof members);
    });
  },[]);

  async function saveOrg(){
    if(!org) return;
    await supabase.from("organizations").update({name}).eq("id",org.id);
    Alert.alert("Saved","Organization name updated.");
  }

  const roleColors:Record<string,string>={admin:C.accent,analyst:C.blue,scout:C.green,viewer:C.text2};

  return (
    <ScrollView style={{flex:1,backgroundColor:C.bg}} contentContainerStyle={{padding:20,paddingTop:60,gap:12,paddingBottom:60}} keyboardShouldPersistTaps="handled">
      <Text style={{color:C.accent,fontSize:10,letterSpacing:3}}>SETTINGS</Text>
      <Text style={{color:C.text,fontSize:34,fontWeight:"900",letterSpacing:2,marginBottom:4}}>TEAM SETTINGS</Text>

      <Card>
        <SectionHeader label="ORGANIZATION" />
        <Label text="ORG NAME" />
        <Input value={name} onChangeText={setName} placeholder="Team name" />
        <View style={{height:12}} />
        <Btn label="Save Name" onPress={saveOrg} variant="ghost" />
      </Card>

      <Card>
        <SectionHeader label="MEMBERS" />
        {members.map(m=>(
          <View key={m.user_id} style={{flexDirection:"row",alignItems:"center",gap:10,paddingVertical:10,borderBottomWidth:1,borderBottomColor:C.border}}>
            <View style={{width:32,height:32,borderRadius:16,backgroundColor:C.surface3,alignItems:"center",justifyContent:"center"}}>
              <Text style={{color:C.text2,fontSize:13}}>{(m.profiles?.display_name??"?")[0].toUpperCase()}</Text>
            </View>
            <Text style={{flex:1,color:C.text,fontSize:14}}>{m.profiles?.display_name}</Text>
            <Text style={{color:roleColors[m.role]??C.text2,fontSize:10,letterSpacing:2}}>{m.role.toUpperCase()}</Text>
          </View>
        ))}
      </Card>

      <Card>
        <SectionHeader label="ACCOUNT" />
        {user&&<Text style={{color:C.text2,fontSize:13,marginBottom:16}}>{user.email}</Text>}
        <Btn label="Sign Out" onPress={async()=>{ await supabase.auth.signOut(); router.replace("/(auth)/login"); }} variant="danger" />
      </Card>
    </ScrollView>
  );
}
