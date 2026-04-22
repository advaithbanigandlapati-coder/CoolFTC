/**
 * Live Intel — Event standings powered by FTCScout
 * Real data pulled directly from FTCScout API, no fake cache
 */
import { useState, useEffect, useCallback } from "react";
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl, ActivityIndicator } from "react-native";
import { supabase } from "../../lib/supabase";
import { C } from "../../lib/theme";
import { Input } from "../../components/ui";
import { getEventTeams, CURRENT_SEASON, type FTCTeamStats } from "../../lib/ftcscout";

export default function LiveScreen() {
  const [eventCode, setEventCode] = useState("");
  const [draftCode, setDraftCode] = useState("");
  const [teams, setTeams]         = useState<FTCTeamStats[]>([]);
  const [myTeam, setMyTeam]       = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [loaded, setLoaded]       = useState(false);
  const [error, setError]         = useState("");

  // Pre-fill my team number from org
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data: m } = await supabase
        .from("org_members")
        .select("organizations(ftc_team_number)")
        .eq("user_id", user.id)
        .maybeSingle();
      const num = (m?.organizations as unknown as { ftc_team_number: string | null } | null)?.ftc_team_number;
      if (num) setMyTeam(num);
    });
  }, []);

  const load = useCallback(async (code: string) => {
    if (!code.trim()) return;
    setRefreshing(true); setError(""); setLoaded(false);
    const result = await getEventTeams(code.trim(), CURRENT_SEASON);
    if (result.length === 0) {
      setError(`No teams found for event "${code.trim()}". Check the event code and try again.`);
    } else {
      // Sort by total OPR rank descending
      result.sort((a, b) => {
        const ra = a.quickStats?.tot?.rank ?? 9999;
        const rb = b.quickStats?.tot?.rank ?? 9999;
        return ra - rb;
      });
      setTeams(result);
    }
    setRefreshing(false); setLoaded(true);
  }, []);

  function submit() {
    setEventCode(draftCode);
    load(draftCode);
  }

  const myRow = teams.find(t => String(t.number) === myTeam.trim());

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => load(eventCode)} tintColor={C.accent} />
      }
    >
      <Text style={styles.eyebrow}>LIVE INTEL</Text>
      <Text style={styles.title}>EVENT STANDINGS</Text>
      <Text style={{ color: C.text2, fontSize: 11, marginBottom: 12 }}>
        Live data from FTCScout · Pull to refresh
      </Text>

      {/* Event code input */}
      <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
        <View style={{ flex: 2 }}>
          <Input
            value={draftCode}
            onChangeText={setDraftCode}
            placeholder="Event code (e.g. USTXHOU1)"
            autoCapitalize="none"
            onSubmitEditing={submit}
            returnKeyType="search"
          />
        </View>
        <View style={{ flex: 1 }}>
          <Input
            value={myTeam}
            onChangeText={setMyTeam}
            placeholder="My team #"
            keyboardType="numeric"
          />
        </View>
        <TouchableOpacity onPress={submit}
          style={{ backgroundColor: C.accent, borderRadius: 8, paddingHorizontal: 14, justifyContent: "center" }}>
          <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>Go</Text>
        </TouchableOpacity>
      </View>

      {refreshing && !loaded && (
        <ActivityIndicator color={C.accent} style={{ marginVertical: 24 }} />
      )}

      {error ? (
        <View style={{ backgroundColor: C.redDim, borderRadius: 10, padding: 14, borderWidth: 1, borderColor: C.red + "40" }}>
          <Text style={{ color: C.red, fontSize: 13 }}>{error}</Text>
        </View>
      ) : null}

      {/* My team highlight */}
      {myRow && (
        <View style={styles.myCard}>
          <Text style={{ color: C.accent, fontSize: 10, letterSpacing: 3, marginBottom: 8 }}>YOUR TEAM</Text>
          <Text style={{ color: C.text, fontSize: 18, fontWeight: "900", marginBottom: 10 }}>
            #{myRow.number}  {myRow.name}
          </Text>
          <View style={{ flexDirection: "row", gap: 16 }}>
            {[
              ["OPR",     myRow.quickStats?.tot?.value?.toFixed(1)  ?? "—"],
              ["AUTO",    myRow.quickStats?.auto?.value?.toFixed(1) ?? "—"],
              ["TELEOP",  myRow.quickStats?.dc?.value?.toFixed(1)   ?? "—"],
              ["ENDGAME", myRow.quickStats?.eg?.value?.toFixed(1)   ?? "—"],
            ].map(([l, v]) => (
              <View key={l}>
                <Text style={{ color: C.accent, fontSize: 22, fontWeight: "900" }}>{v}</Text>
                <Text style={{ color: C.text2, fontSize: 9, letterSpacing: 2 }}>{l}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Table */}
      {teams.length > 0 && (
        <>
          <View style={styles.tableHead}>
            {["#", "TEAM", "OPR", "AUTO", "EG"].map((h, i) => (
              <Text key={h} style={[styles.headCell, i === 1 && { flex: 3 }]}>{h}</Text>
            ))}
          </View>
          {teams.map((t, i) => {
            const isMine = String(t.number) === myTeam.trim();
            return (
              <View key={t.number} style={[styles.row, isMine && { backgroundColor: C.accentDim }]}>
                <Text style={[styles.cell, isMine && { color: C.accent }]}>{i + 1}</Text>
                <View style={{ flex: 3 }}>
                  <Text style={{ color: isMine ? C.accent : C.text, fontSize: 13, fontWeight: "600" }}>
                    {t.number}
                  </Text>
                  <Text style={{ color: C.text2, fontSize: 10 }} numberOfLines={1}>{t.name}</Text>
                </View>
                <Text style={styles.cell}>{t.quickStats?.tot?.value?.toFixed(1) ?? "—"}</Text>
                <Text style={styles.cell}>{t.quickStats?.auto?.value?.toFixed(1) ?? "—"}</Text>
                <Text style={styles.cell}>{t.quickStats?.eg?.value?.toFixed(1) ?? "—"}</Text>
              </View>
            );
          })}
          <Text style={{ color: C.text3, fontSize: 10, textAlign: "center", marginTop: 12 }}>
            {teams.length} teams · Data from FTCScout
          </Text>
        </>
      )}

      {loaded && teams.length === 0 && !error && (
        <Text style={{ color: C.text3, textAlign: "center", marginTop: 40, fontSize: 13 }}>
          Enter an event code above to load standings.
        </Text>
      )}

      {!loaded && !refreshing && (
        <Text style={{ color: C.text3, textAlign: "center", marginTop: 60, fontSize: 13, lineHeight: 20 }}>
          Enter an FTCScout event code above.{"\n"}
          <Text style={{ fontSize: 11 }}>Find it at ftcscout.org</Text>
        </Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: C.bg },
  content: { padding: 20, paddingTop: 60, paddingBottom: 40 },
  eyebrow: { color: C.accent, fontSize: 10, letterSpacing: 3 },
  title:   { color: C.text, fontSize: 34, fontWeight: "900", letterSpacing: 2 },
  myCard:  { backgroundColor: C.accentDim, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: C.accent + "40", marginBottom: 16 },
  tableHead: { flexDirection: "row", backgroundColor: C.bg3, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: C.border, marginBottom: 4 },
  headCell:  { flex: 1, color: C.text2, fontSize: 9, letterSpacing: 2 },
  row:  { flexDirection: "row", padding: 10, borderBottomWidth: 1, borderBottomColor: C.border, alignItems: "center" },
  cell: { flex: 1, color: C.text, fontSize: 12 },
});
