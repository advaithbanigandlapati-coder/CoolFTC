import { useState, useEffect } from "react";
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from "react-native";
import { supabase } from "../../lib/supabase";
import { C } from "../../lib/theme";
import { Card, Input, Btn, SectionHeader } from "../../components/ui";

type Note = {id:string;team_number:string|null;content:{text?:string};tags:string[];is_pinned:boolean;created_at:string;profiles?:{display_name:string}|null};

export default function NotesScreen() {
  const [orgId, setOrgId] = useState("");
  const [userId, setUserId] = useState("");
  const [eventKey, setEventKey] = useState("2025-DECODE-TEST");
  const [notes, setNotes] = useState<Note[]>([]);
  const [team, setTeam] = useState("");
  const [noteText, setNoteText] = useState("");
  const [tags, setTags] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async (oid:string) => {
    const{data}=await supabase.from("notes").select("*,profiles(display_name)").eq("org_id",oid).eq("event_key",eventKey).order("is_pinned",{ascending:false}).order("created_at",{ascending:false});
    setNotes((data as Note[])??[]);
  };

  useEffect(()=>{
    supabase.auth.getUser().then(async({data:{user}})=>{
      if(!user) return;
      setUserId(user.id);
      const{data:m}=await supabase.from("org_members").select("org_id").eq("user_id",user.id).maybeSingle();
      if(m){setOrgId(m.org_id);await load(m.org_id);}
    });
  },[eventKey]);

  async function add() {
    if(!noteText||!orgId) return;
    setSaving(true);
    await supabase.from("notes").insert({org_id:orgId,event_key:eventKey,team_number:team||null,author_id:userId,content:{text:noteText},tags:tags.split(",").map(t=>t.trim()).filter(Boolean),is_pinned:false});
    await load(orgId);
    setNoteText("");setTags("");setTeam("");
    setSaving(false);
  }

  return (
    <ScrollView style={{flex:1,backgroundColor:C.bg}} contentContainerStyle={{padding:20,paddingTop:60,gap:12,paddingBottom:40}} keyboardShouldPersistTaps="handled">
      <Text style={{color:C.accent,fontSize:10,letterSpacing:3}}>NOTEBOOK</Text>
      <Text style={{color:C.text,fontSize:34,fontWeight:"900",letterSpacing:2,marginBottom:4}}>NOTES</Text>

      <Card>
        <SectionHeader label="ADD NOTE" />
        <Input value={team} onChangeText={setTeam} placeholder="Team # (optional)" keyboardType="numeric" />
        <View style={{height:8}} />
        <Input value={noteText} onChangeText={setNoteText} placeholder="Observation or strategy note…" multiline numberOfLines={3} />
        <View style={{height:8}} />
        <Input value={tags} onChangeText={setTags} placeholder="Tags: defense risk, alliance target…" />
        <View style={{height:12}} />
        <Btn label={saving?"Saving…":"Add Note"} onPress={add} loading={saving} />
      </Card>

      {notes.length===0&&<Text style={{color:C.text3,textAlign:"center",marginTop:20,fontSize:13}}>No notes yet</Text>}
      {notes.map(n=>(
        <Card key={n.id} style={n.is_pinned?{borderColor:C.amber}:{}}>
          <View style={{flexDirection:"row",alignItems:"center",gap:8,marginBottom:8,flexWrap:"wrap"}}>
            {n.team_number&&<Text style={{color:C.accent,fontSize:14,fontWeight:"700"}}>#{n.team_number}</Text>}
            {n.tags.map(t=><View key={t} style={{backgroundColor:C.surface3,borderRadius:6,paddingHorizontal:8,paddingVertical:3}}><Text style={{color:C.text2,fontSize:10}}>{t}</Text></View>)}
            <View style={{flex:1}} />
            <TouchableOpacity onPress={async()=>{await supabase.from("notes").update({is_pinned:!n.is_pinned}).eq("id",n.id);load(orgId);}}>
              <Text style={{fontSize:16,color:n.is_pinned?C.amber:"rgba(255,255,255,0.15)"}}>★</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={async()=>{await supabase.from("notes").delete().eq("id",n.id);setNotes(x=>x.filter(m=>m.id!==n.id));}}>
              <Text style={{color:C.text3,fontSize:13,marginLeft:8}}>✕</Text>
            </TouchableOpacity>
          </View>
          <Text style={{color:C.text,fontSize:14,lineHeight:20}}>{n.content.text}</Text>
          <Text style={{color:C.text3,fontSize:10,marginTop:6}}>{n.profiles?.display_name??""} · {new Date(n.created_at).toLocaleString()}</Text>
        </Card>
      ))}
    </ScrollView>
  );
}
