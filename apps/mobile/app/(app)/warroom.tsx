import { useState, useEffect, useCallback } from "react";
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert, TextInput } from "react-native";
import { supabase } from "../../lib/supabase";
import { C } from "../../lib/theme";
import { Card, Label, Input, Btn, SectionHeader } from "../../components/ui";

type Alliance = {id:number;captain:string|null;first:string|null;second:string|null};
type DNP = {team:string;reason:string};
type BoardState = {alliances:Alliance[];dnp:DNP[];priorities:string[]};

export default function WarRoomScreen() {
  const [orgId, setOrgId] = useState("");
  const [userId, setUserId] = useState("");
  const [boardId, setBoardId] = useState<string|null>(null);
  const [state, setState] = useState<BoardState>({
    alliances:[1,2,3,4].map(id=>({id,captain:null,first:null,second:null})),
    dnp:[],priorities:[]
  });
  const [eventKey, setEventKey] = useState("2025-DECODE-TEST");
  const [editSlot, setEditSlot] = useState<{allianceId:number;field:"captain"|"first"|"second"}|null>(null);
  const [editVal, setEditVal] = useState("");
  const [dnpTeam, setDnpTeam] = useState("");
  const [dnpReason, setDnpReason] = useState("");
  const [priorityInput, setPriorityInput] = useState("");
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(async ({data:{user}}) => {
      if (!user) return;
      setUserId(user.id);
      const {data:m} = await supabase.from("org_members").select("org_id").eq("user_id",user.id).single();
      if (!m) return;
      setOrgId(m.org_id);
      const {data:board} = await supabase.from("alliance_boards").select("*").eq("org_id",m.org_id).eq("event_key",eventKey).eq("is_active",true).single();
      if (board) { setBoardId(board.id); setState(board.state as BoardState); }
    });
  }, [eventKey]);

  const save = useCallback(async (s: BoardState) => {
    if (!orgId) return;
    setSyncing(true);
    if (boardId) {
      await supabase.from("alliance_boards").update({state:s,updated_at:new Date().toISOString()}).eq("id",boardId);
    } else {
      const {data} = await supabase.from("alliance_boards").insert({org_id:orgId,event_key:eventKey,name:"Alliance board",state:s,is_active:true,created_by:userId}).select().single();
      if (data) setBoardId(data.id);
    }
    setSyncing(false);
  },[orgId,boardId,eventKey,userId]);

  function setSlot(allianceId:number,field:"captain"|"first"|"second",value:string|null) {
    const next={...state,alliances:state.alliances.map(a=>a.id===allianceId?{...a,[field]:value}:a)};
    setState(next);save(next);
  }

  function addDNP() {
    if (!dnpTeam) return;
    const next={...state,dnp:[...state.dnp,{team:dnpTeam,reason:dnpReason}]};
    setState(next);save(next);setDnpTeam("");setDnpReason("");
  }

  function addPriority() {
    if (!priorityInput) return;
    const next={...state,priorities:[...state.priorities,priorityInput]};
    setState(next);save(next);setPriorityInput("");
  }

  const SlotBtn = ({label,value,allianceId,field}:{label:string;value:string|null;allianceId:number;field:"captain"|"first"|"second"}) => (
    <TouchableOpacity onPress={()=>{setEditSlot({allianceId,field});setEditVal(value??"");}}
      style={[styles.slot, value&&{backgroundColor:C.accentDim,borderColor:C.accent}]}>
      {value?<Text style={{color:C.accent,fontSize:13,fontWeight:"700"}}>{value}</Text>:<Text style={{color:C.text3,fontSize:11}}>{label}</Text>}
    </TouchableOpacity>
  );

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.titleRow}>
        <View>
          <Text style={styles.eyebrow}>WAR ROOM</Text>
          <Text style={styles.title}>ALLIANCE SELECTION</Text>
        </View>
        {syncing&&<Text style={{color:C.text2,fontSize:11}}>syncing…</Text>}
      </View>

      <Card>
        <Label text="EVENT KEY" />
        <Input value={eventKey} onChangeText={setEventKey} placeholder="2025-TXHOU" />
      </Card>

      {editSlot && (
        <Card style={{borderColor:C.accent,borderWidth:1}}>
          <Text style={{color:C.accent,fontSize:12,letterSpacing:2,marginBottom:8}}>
            ALLIANCE {editSlot.allianceId} — {editSlot.field.toUpperCase()}
          </Text>
          <Input value={editVal} onChangeText={setEditVal} placeholder="Team number" keyboardType="numeric" />
          <View style={{flexDirection:"row",gap:8,marginTop:10}}>
            <Btn label="Set" onPress={()=>{setSlot(editSlot.allianceId,editSlot.field,editVal||null);setEditSlot(null);}} style={{flex:1}} />
            <Btn label="Clear" onPress={()=>{setSlot(editSlot.allianceId,editSlot.field,null);setEditSlot(null);}} variant="ghost" style={{flex:1}} />
            <Btn label="Cancel" onPress={()=>setEditSlot(null)} variant="ghost" style={{flex:1}} />
          </View>
        </Card>
      )}

      <SectionHeader label="ALLIANCE BOARD" />
      {state.alliances.map(a=>(
        <View key={a.id} style={styles.allianceRow}>
          <Text style={styles.allianceNum}>{a.id}</Text>
          <SlotBtn label="Captain" value={a.captain} allianceId={a.id} field="captain" />
          <SlotBtn label="1st" value={a.first} allianceId={a.id} field="first" />
          <SlotBtn label="2nd" value={a.second} allianceId={a.id} field="second" />
        </View>
      ))}

      <Card>
        <Text style={{color:C.red,fontSize:12,letterSpacing:3,marginBottom:12}}>DO NOT PICK</Text>
        <View style={{flexDirection:"row",gap:8,marginBottom:10}}>
          <View style={{flex:1}}><Input value={dnpTeam} onChangeText={setDnpTeam} placeholder="Team #" keyboardType="numeric" /></View>
          <View style={{flex:2}}><Input value={dnpReason} onChangeText={setDnpReason} placeholder="Reason" /></View>
          <Btn label="Add" onPress={addDNP} style={{alignSelf:"flex-end"}} />
        </View>
        <View style={{flexDirection:"row",flexWrap:"wrap",gap:6}}>
          {state.dnp.map(d=>(
            <TouchableOpacity key={d.team} onPress={()=>{const next={...state,dnp:state.dnp.filter(x=>x.team!==d.team)};setState(next);save(next);}}
              style={{backgroundColor:C.redDim,borderRadius:8,paddingHorizontal:10,paddingVertical:5,borderWidth:1,borderColor:C.red+"40"}}>
              <Text style={{color:C.red,fontSize:12}}>✕ {d.team}{d.reason?` — ${d.reason}`:""}</Text>
            </TouchableOpacity>
          ))}
          {state.dnp.length===0&&<Text style={{color:C.text3,fontSize:12}}>No DNPs yet</Text>}
        </View>
      </Card>

      <Card>
        <Text style={{color:C.amber,fontSize:12,letterSpacing:3,marginBottom:12}}>PRIORITY QUEUE</Text>
        <View style={{flexDirection:"row",gap:8,marginBottom:10}}>
          <View style={{flex:1}}><Input value={priorityInput} onChangeText={setPriorityInput} placeholder="Add team" keyboardType="numeric" /></View>
          <Btn label="Add" onPress={addPriority} style={{alignSelf:"flex-end"}} />
        </View>
        <View style={{flexDirection:"row",flexWrap:"wrap",gap:6}}>
          {state.priorities.map((p,i)=>(
            <View key={i} style={{backgroundColor:C.amberDim,borderRadius:8,paddingHorizontal:10,paddingVertical:5,borderWidth:1,borderColor:C.amber+"40"}}>
              <Text style={{color:C.amber,fontSize:12}}>{i+1}. {p}</Text>
            </View>
          ))}
          {state.priorities.length===0&&<Text style={{color:C.text3,fontSize:12}}>Empty</Text>}
        </View>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root:{flex:1,backgroundColor:C.bg},
  content:{padding:20,paddingTop:60,gap:12,paddingBottom:40},
  titleRow:{flexDirection:"row",justifyContent:"space-between",alignItems:"flex-end",marginBottom:4},
  eyebrow:{color:C.accent,fontSize:10,letterSpacing:3},
  title:{color:C.text,fontSize:28,fontWeight:"900",letterSpacing:2},
  allianceRow:{flexDirection:"row",alignItems:"center",gap:8,backgroundColor:C.surface,borderRadius:10,borderWidth:1,borderColor:C.border,padding:10},
  allianceNum:{color:C.accent,fontSize:22,fontWeight:"900",width:24},
  slot:{flex:1,borderRadius:8,borderWidth:1,borderColor:C.border2,padding:8,alignItems:"center",minHeight:44,justifyContent:"center"},
});
