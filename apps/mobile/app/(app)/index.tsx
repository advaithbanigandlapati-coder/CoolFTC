import { useEffect, useState } from "react";
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "../../lib/supabase";
import { C } from "../../lib/theme";
import { Card, SectionHeader } from "../../components/ui";

type QuickAction = { label: string; desc: string; icon: string; route: string };

const QUICK: QuickAction[] = [
  { label: "Scout a Match", desc: "Open match form", icon: "▣", route: "/(app)/scout" },
  { label: "Ask ARIA", desc: "Strategy AI", icon: "⚡", route: "/(app)/aria" },
  { label: "Run Simulation", desc: "Monte Carlo Forge", icon: "🔮", route: "/(app)/forge" },
  { label: "War Room", desc: "Alliance selection", icon: "🏰", route: "/(app)/warroom" },
];

export default function HomeScreen() {
  const router = useRouter();
  const [org, setOrg] = useState<{ name: string; ftc_team_number: string | null } | null>(null);
  const [stats, setStats] = useState({ scouted: 0, matches: 0 });

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data: m } = await supabase.from("org_members").select("org_id, organizations(name,ftc_team_number)").eq("user_id", user.id).maybeSingle();
      if (!m) return;
      setOrg(m.organizations as { name: string; ftc_team_number: string | null });
      const [{ count: sc }, { count: mc }] = await Promise.all([
        supabase.from("scouting_entries").select("id", { count: "exact", head: true }).eq("org_id", m.org_id),
        supabase.from("match_scouting").select("id", { count: "exact", head: true }).eq("org_id", m.org_id),
      ]);
      setStats({ scouted: sc ?? 0, matches: mc ?? 0 });
    });
  }, []);

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>DASHBOARD</Text>
        <Text style={styles.orgName}>{org?.name?.toUpperCase() ?? "LOADING…"}</Text>
        {org?.ftc_team_number && <Text style={styles.teamNum}>Team #{org.ftc_team_number} · DECODE 25–26</Text>}
      </View>

      <View style={styles.statRow}>
        {[{ label: "TEAMS SCOUTED", v: stats.scouted, color: C.green },
          { label: "MATCH ENTRIES", v: stats.matches, color: C.blue }].map(({ label, v, color }) => (
          <Card key={label} style={{ flex: 1 }}>
            <Text style={[styles.statNum, { color }]}>{v}</Text>
            <Text style={styles.statLabel}>{label}</Text>
          </Card>
        ))}
      </View>

      <SectionHeader label="QUICK ACTIONS" />
      {QUICK.map(({ label, desc, icon, route }) => (
        <TouchableOpacity key={route} onPress={() => router.push(route as any)} style={styles.qaRow}>
          <Text style={styles.qaIcon}>{icon}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.qaLabel}>{label}</Text>
            <Text style={styles.qaDesc}>{desc}</Text>
          </View>
          <Text style={{ color: C.text2 }}>›</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  content: { padding: 20, paddingTop: 60, gap: 10 },
  header: { marginBottom: 8 },
  eyebrow: { color: C.accent, fontSize: 10, letterSpacing: 3, marginBottom: 4 },
  orgName: { color: C.text, fontSize: 32, fontWeight: "900", letterSpacing: 1 },
  teamNum: { color: C.text2, fontSize: 12, marginTop: 2 },
  statRow: { flexDirection: "row", gap: 10, marginBottom: 8 },
  statNum: { fontSize: 36, fontWeight: "900" },
  statLabel: { color: C.text2, fontSize: 9, letterSpacing: 2, marginTop: 4 },
  qaRow: { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: C.surface2, padding: 14, borderRadius: 10, borderWidth: 1, borderColor: C.border },
  qaIcon: { fontSize: 22 },
  qaLabel: { color: C.text, fontSize: 14, fontWeight: "600" },
  qaDesc: { color: C.text2, fontSize: 12, marginTop: 2 },
});
