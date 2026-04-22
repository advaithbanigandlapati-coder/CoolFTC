import { useState, useEffect, useRef } from "react";
import { View, Text, ScrollView, StyleSheet, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ActivityIndicator } from "react-native";
import { supabase } from "../../lib/supabase";
import { C } from "../../lib/theme";

const API_BASE = process.env.EXPO_PUBLIC_API_BASE_URL ?? "";
const ARIA_AVAILABLE = !!API_BASE;
const MODULES = [
  {id:"scout",label:"Scout",icon:"▣"},{id:"stats",label:"Stats",icon:"◎"},
  {id:"forge",label:"Forge",icon:"🔮"},{id:"warroom",label:"War Room",icon:"🏰"},
];

type Msg = {role:"user"|"assistant";content:string};

export default function ARIAScreen() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeModules, setActiveModules] = useState(["scout","stats"]);
  const [orgId, setOrgId] = useState("");
  const [eventKey, setEventKey] = useState("2025-DECODE-TEST");
  const scroll = useRef<ScrollView>(null);

  useEffect(() => {
    supabase.auth.getUser().then(async ({data:{user}}) => {
      if (!user) return;
      const {data:m} = await supabase.from("org_members").select("org_id").eq("user_id",user.id).maybeSingle();
      if (m) setOrgId(m.org_id);
    });
  }, []);

  function toggleMod(id: string) {
    setActiveModules(prev => prev.includes(id) ? prev.filter(m=>m!==id) : [...prev,id]);
  }

  async function send() {
    if (!input.trim() || loading) return;
    if (!ARIA_AVAILABLE) {
      setMessages(prev => [...prev,
        { role: "user", content: input },
        { role: "assistant", content: "⚠️ ARIA needs a backend server to work.\n\nSet EXPO_PUBLIC_API_BASE_URL in your .env file to your deployed Vercel URL, then restart the app." },
      ]);
      setInput("");
      return;
    }
    const userMsg: Msg = {role:"user",content:input};
    const newMessages = [...messages,userMsg];
    setMessages(newMessages); setInput(""); setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${API_BASE}/api/aria`, {
        method:"POST",
        headers:{
          "Content-Type":"application/json",
          Authorization: `Bearer ${session?.access_token ?? ""}`,
        },
        body:JSON.stringify({messages:newMessages,activeModules,eventKey,orgId}),
      });
      if (!res.ok) throw new Error("API error");
      const reader = res.body!.getReader();
      const dec = new TextDecoder();
      let full = "";
      while (true) {
        const {done,value} = await reader.read();
        if (done) break;
        const lines = dec.decode(value).split("\n").filter(l=>l.startsWith("data:"));
        for (const line of lines) {
          const d = line.slice(5).trim();
          if (d==="[DONE]") break;
          try { const p=JSON.parse(d); if(p.text){full+=p.text; setMessages([...newMessages,{role:"assistant",content:full}]);} } catch{}
        }
      }
    } catch {
      setMessages([...newMessages,{role:"assistant",content:"Connection error — make sure your web app is running."}]);
    } finally { setLoading(false); scroll.current?.scrollToEnd({animated:true}); }
  }

  const SUGGESTIONS = ["Best alliance pick for us?","How do we beat the #1 seed?","Preview our next match"];

  return (
    <KeyboardAvoidingView style={{flex:1,backgroundColor:C.bg}} behavior={Platform.OS==="ios"?"padding":"height"} keyboardVerticalOffset={90}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>ARIA — STRATEGY AI</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginTop:10}}>
          <View style={{flexDirection:"row",gap:8,paddingHorizontal:20}}>
            {MODULES.map(m=>(
              <TouchableOpacity key={m.id} onPress={()=>toggleMod(m.id)}
                style={[styles.modBtn, activeModules.includes(m.id)&&{backgroundColor:C.accentDim,borderColor:C.accent}]}>
                <Text style={{color:activeModules.includes(m.id)?C.accent:C.text2,fontSize:11}}>{m.icon} {m.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>

      <ScrollView ref={scroll} style={styles.msgs} contentContainerStyle={{padding:16,gap:12}}
        onContentSizeChange={()=>scroll.current?.scrollToEnd({animated:true})}>
        {messages.length===0 && (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>ARIA</Text>
            <Text style={styles.emptySubtitle}>Your FTC strategy AI. Activate context modules above, then ask anything.</Text>
            <View style={{gap:8,marginTop:16}}>
              {SUGGESTIONS.map(s=>(
                <TouchableOpacity key={s} onPress={()=>setInput(s)} style={styles.suggestion}>
                  <Text style={{color:C.text2,fontSize:13}}>{s}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}
        {messages.map((m,i)=>(
          <View key={i} style={{alignItems:m.role==="user"?"flex-end":"flex-start"}}>
            {m.role==="assistant"&&<Text style={styles.ariaBadge}>ARIA</Text>}
            <View style={[styles.bubble, m.role==="user"?styles.userBubble:styles.aiBubble]}>
              <Text style={styles.bubbleText}>{m.content}</Text>
            </View>
          </View>
        ))}
        {loading&&<View style={{alignItems:"flex-start"}}><View style={styles.aiBubble}><ActivityIndicator color={C.accent} size="small"/></View></View>}
      </ScrollView>

      <View style={styles.inputRow}>
        <TextInput style={styles.input} value={input} onChangeText={setInput} placeholder="Ask ARIA…" placeholderTextColor={C.text3} multiline />
        <TouchableOpacity onPress={send} disabled={!input.trim()||loading} style={[styles.sendBtn,(!input.trim()||loading)&&{opacity:0.4}]}>
          <Text style={{color:"#fff",fontWeight:"700",fontSize:15}}>↑</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header:{backgroundColor:C.bg2,borderBottomWidth:1,borderBottomColor:C.border,paddingTop:60,paddingBottom:12},
  eyebrow:{color:C.accent,fontSize:10,letterSpacing:3,paddingHorizontal:20},
  modBtn:{paddingHorizontal:12,paddingVertical:6,borderRadius:8,borderWidth:1,borderColor:C.border2},
  msgs:{flex:1},
  empty:{alignItems:"center",paddingTop:40},
  emptyTitle:{color:C.text,fontSize:48,fontWeight:"900",letterSpacing:2},
  emptySubtitle:{color:C.text2,fontSize:13,textAlign:"center",marginTop:8,lineHeight:20},
  suggestion:{backgroundColor:C.surface2,borderRadius:8,padding:12,borderWidth:1,borderColor:C.border},
  ariaBadge:{color:C.accent,fontSize:9,letterSpacing:2,marginBottom:4},
  bubble:{maxWidth:"85%",borderRadius:12,padding:12},
  userBubble:{backgroundColor:C.accentDim,borderWidth:1,borderColor:"rgba(255,90,31,0.3)",borderTopRightRadius:4},
  aiBubble:{backgroundColor:C.surface2,borderWidth:1,borderColor:C.border,borderTopLeftRadius:4},
  bubbleText:{color:C.text,fontSize:14,lineHeight:20},
  inputRow:{flexDirection:"row",gap:8,padding:12,borderTopWidth:1,borderTopColor:C.border,backgroundColor:C.bg2,paddingBottom:24},
  input:{flex:1,backgroundColor:C.surface,borderWidth:1,borderColor:C.border2,borderRadius:10,paddingHorizontal:14,paddingVertical:10,color:C.text,fontSize:14,maxHeight:100},
  sendBtn:{width:44,height:44,borderRadius:10,backgroundColor:C.accent,alignItems:"center",justifyContent:"center"},
});
