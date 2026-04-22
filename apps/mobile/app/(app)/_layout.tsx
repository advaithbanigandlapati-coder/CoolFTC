import { useState, useEffect } from "react";
import { Tabs } from "expo-router";
import { View, Text } from "react-native";
import { C } from "../../lib/theme";
import { supabase } from "../../lib/supabase";
import { usePushNotifications } from "../../lib/usePushNotifications";

// NOTE: Hive Mind is web/desktop only — requires multi-window stat lead view.
// Mobile: Scout, ARIA, Forge, War Room, Live, More (→ Analytics, Notes, Season, QR Sync, Settings)

function TabIcon({ icon, focused }: { icon: string; focused: boolean }) {
  return (
    <View style={{ alignItems:"center", justifyContent:"center" }}>
      <Text style={{ fontSize:18, opacity: focused ? 1 : 0.4 }}>{icon}</Text>
    </View>
  );
}

// Inner wrapper that loads org context and enables push notifications
function PushWrapper() {
  const [orgId,    setOrgId]    = useState("");
  const [eventKey, setEventKey] = useState("2025-DECODE-TEST");
  const [myTeam,   setMyTeam]   = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data: m } = await supabase
        .from("org_members")
        .select("org_id, organizations(ftc_team_number)")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!m) return;
      setOrgId(m.org_id);
      setMyTeam((m.organizations as unknown as { ftc_team_number: string | null } | null)?.ftc_team_number ?? "");
    });
  }, []);

  // Wire push notifications once we have org context
  usePushNotifications({ orgId, eventKey, myTeam });

  return null;
}

export default function AppTabLayout() {
  return (
    <>
      <PushWrapper />
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: C.bg2,
            borderTopColor: C.border,
            borderTopWidth: 1,
            height: 60,
            paddingBottom: 8,
            paddingTop: 6,
          },
          tabBarActiveTintColor:   C.accent,
          tabBarInactiveTintColor: C.text2,
          tabBarLabelStyle: { fontSize:9, letterSpacing:0.5, fontWeight:"600" },
        }}
      >
        <Tabs.Screen name="index"    options={{ title:"Home",     tabBarIcon:({focused})=><TabIcon icon="⬡" focused={focused}/> }} />
        <Tabs.Screen name="scout"    options={{ title:"Scout",    tabBarIcon:({focused})=><TabIcon icon="▣" focused={focused}/> }} />
        <Tabs.Screen name="aria"     options={{ title:"ARIA",     tabBarIcon:({focused})=><TabIcon icon="◆" focused={focused}/> }} />
        <Tabs.Screen name="forge"    options={{ title:"Forge",    tabBarIcon:({focused})=><TabIcon icon="▲" focused={focused}/> }} />
        <Tabs.Screen name="warroom"  options={{ title:"War Room", tabBarIcon:({focused})=><TabIcon icon="⬡" focused={focused}/> }} />
        <Tabs.Screen name="live"     options={{ title:"Live",     tabBarIcon:({focused})=><TabIcon icon="◎" focused={focused}/> }} />
        <Tabs.Screen name="more"     options={{ title:"More",     tabBarIcon:({focused})=><TabIcon icon="⋯" focused={focused}/> }} />

        {/* Hidden — accessible from More */}
        <Tabs.Screen name="analytics" options={{ href:null }} />
        <Tabs.Screen name="notes"     options={{ href:null }} />
        <Tabs.Screen name="season"    options={{ href:null }} />
        <Tabs.Screen name="courier"   options={{ href:null }} />
        <Tabs.Screen name="settings"  options={{ href:null }} />
        <Tabs.Screen name="changelog" options={{ href:null }} />
        <Tabs.Screen name="qrsync"    options={{ href:null }} />
      </Tabs>
    </>
  );
}
