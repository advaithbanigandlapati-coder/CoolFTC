import { ScrollView, View, Text, StyleSheet } from "react-native";
import { C } from "../../lib/theme";

const ENTRIES=[
  {version:"v1.2.0",date:"2025-06-15",summary:"Forge + War Room realtime",
   changes:[{t:"✨",l:"New",d:"Monte Carlo Forge engine with seeded PRNG"},{t:"✨",l:"New",d:"War Room syncs across all devices in real time"},{t:"⚡",l:"Improved",d:"ARIA context includes Forge + War Room state"}]},
  {version:"v1.1.0",date:"2025-05-28",summary:"ARIA streaming + module system",
   changes:[{t:"✨",l:"New",d:"ARIA streams responses in real time"},{t:"✨",l:"New",d:"Module toggles — Scout, Stats, Forge, War Room context"},{t:"🐛",l:"Fixed",d:"ARIAModule import path in assembler.ts"}]},
  {version:"v1.0.0",date:"2025-05-10",summary:"Initial launch",
   changes:[{t:"✨",l:"New",d:"Full match scouting form for DECODE 25–26"},{t:"✨",l:"New",d:"Hive Mind stat lead dashboard"},{t:"✨",l:"New",d:"14-table Supabase schema with RLS + realtime"},{t:"✨",l:"New",d:"Live Intel from FTCScout GraphQL"}]},
];

export default function ChangelogScreen() {
  return (
    <ScrollView style={{flex:1,backgroundColor:C.bg}} contentContainerStyle={{padding:20,paddingTop:60,gap:16,paddingBottom:40}}>
      <Text style={{color:C.accent,fontSize:10,letterSpacing:3}}>CHANGELOG</Text>
      <Text style={{color:C.text,fontSize:34,fontWeight:"900",letterSpacing:2}}>RELEASE NOTES</Text>
      {ENTRIES.map((e,ei)=>(
        <View key={e.version} style={{backgroundColor:C.surface,borderRadius:12,borderWidth:1,borderColor:ei===0?C.accent:C.border,padding:16}}>
          <View style={{flexDirection:"row",alignItems:"center",gap:10,marginBottom:4}}>
            <Text style={{color:C.accent,fontSize:22,fontWeight:"900"}}>{e.version}</Text>
            <Text style={{color:C.text2,fontSize:11}}>{e.date}</Text>
            {ei===0&&<View style={{backgroundColor:C.accentDim,borderRadius:99,paddingHorizontal:8,paddingVertical:2,borderWidth:1,borderColor:C.accent+"40"}}><Text style={{color:C.accent,fontSize:9}}>LATEST</Text></View>}
          </View>
          <Text style={{color:C.text2,fontSize:13,marginBottom:12,fontStyle:"italic"}}>{e.summary}</Text>
          {e.changes.map((c,ci)=>(
            <View key={ci} style={{flexDirection:"row",gap:10,marginBottom:8}}>
              <Text style={{fontSize:15}}>{c.t}</Text>
              <Text style={{color:C.text,fontSize:13,flex:1,lineHeight:18}}>{c.d}</Text>
            </View>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}
