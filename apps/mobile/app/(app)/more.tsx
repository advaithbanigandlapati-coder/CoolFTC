import { useState, useEffect } from "react";
import { ScrollView, View, Text, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "../../lib/supabase";
import { C } from "../../lib/theme";

const ITEMS = [
  { icon:"◈", label:"Analytics Hub",   route:"/(app)/analytics", desc:"Radar charts, OPR rankings, compat matrix" },
  { icon:"▤", label:"Strategy Notes",  route:"/(app)/notes",     desc:"Shared notebook for all scouts" },
  { icon:"◐", label:"Season Hub",      route:"/(app)/season",    desc:"Worlds tracker, rival teams" },
  { icon:"◪", label:"The Courier",     route:"/(app)/courier",   desc:"AI-generated event newspaper editions" },
  { icon:"⬡", label:"QR Sync",         route:"/(app)/qrsync",    desc:"Share scouting entries between phones" },
  { icon:"📋", label:"Changelog",       route:"/(app)/changelog", desc:"What's new in CoolFTC" },
  { icon:"⚙",  label:"Settings",        route:"/(app)/settings",  desc:"Team, API key, members, data sync" },
];

export default function MoreScreen() {
  const router = useRouter();
  const [orgName, setOrgName] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data: m } = await supabase
        .from("org_members")
        .select("organizations(name)")
        .eq("user_id", user.id)
        .single();
      if (m) setOrgName((m.organizations as { name: string } | null)?.name ?? "");
    });
  }, []);

  return (
    <ScrollView style={{ flex:1, backgroundColor:C.bg }}
      contentContainerStyle={{ padding:20, paddingTop:60, paddingBottom:40 }}>
      <Text style={{ color:C.accent, fontSize:10, letterSpacing:3, marginBottom:4 }}>MORE</Text>
      <Text style={{ color:C.text, fontSize:34, fontWeight:"900", letterSpacing:2, marginBottom:4 }}>ALL TOOLS</Text>
      {orgName ? <Text style={{ color:C.text2, fontSize:12, marginBottom:20 }}>{orgName}</Text> : null}

      {ITEMS.map(({ icon, label, route, desc }) => (
        <TouchableOpacity key={route} onPress={() => router.push(route as never)}
          style={{
            flexDirection:"row", alignItems:"center", gap:14,
            backgroundColor:C.surface2, padding:16, borderRadius:12,
            borderWidth:1, borderColor:C.border, marginBottom:10,
          }}>
          <Text style={{ fontSize:22 }}>{icon}</Text>
          <View style={{ flex:1 }}>
            <Text style={{ color:C.text, fontSize:15, fontWeight:"600" }}>{label}</Text>
            <Text style={{ color:C.text2, fontSize:12, marginTop:2 }}>{desc}</Text>
          </View>
          <Text style={{ color:C.text2, fontSize:18 }}>›</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}
