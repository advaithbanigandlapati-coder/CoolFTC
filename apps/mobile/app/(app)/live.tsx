/**
 * Live Intel — real-time event standings from FTCscout.
 * Replaces the previous fake team_stats_cache table.
 */

import { useState, useEffect } from "react";
import {
  View, Text, ScrollView, StyleSheet,
  TouchableOpacity, ActivityIndicator, RefreshControl,
} from "react-native";
import { supabase } from "../../lib/supabase";
import { C } from "../../lib/theme";
import { Input, SectionHeader } from "../../components/ui";
import { getEventRankings, FTCEvent, FTCEventTeam } from "../../lib/ftcscout";

export default function LiveScreen() {
  const [eventCode, setEventCode] = useState("");
  const [myTeam,    setMyTeam]    = useState("");
  const [ftcEvent,  setFtcEvent]  = useState<FTCEvent | null>(null);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState("");

  // Pre-fill my team from org profile
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

  async function load() {
    if (!eventCode.trim()) return;
    setLoading(true); setError(""); setFtcEvent(null);
    try {
      const ev = await getEventRankings(eventCode.trim());
      if (!ev) {
        setError(`Event "${eventCode.toUpperCase()}" not found. Find codes on ftcscout.org.`);
      } else {
        setFtcEvent(ev);
      }
    } catch {
      setError("Couldn't reach FTCscout. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  const myRow = ftcEvent?.teams.find(t => String(t.team.number) === myTeam.trim());

  return (
    <ScrollView
      style={s.root}
      contentContainerStyle={s.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          refreshing={loading}
          onRefresh={load}
          tintColor={C.accent}
          enabled={!!eventCode.trim()}
        />
      }
    >
      <Text style={s.eyebrow}>LIVE INTEL</Text>
      <Text style={s.title}>EVENT STANDINGS</Text>
      <Text style={s.source}>Live data · FTCscout</Text>

      {/* ── Inputs ──────────────────────────────────────────────────────── */}
      <View style={s.inputRow}>
        <View style={{ flex: 3 }}>
          <Input
            value={eventCode}
            onChangeText={setEventCode}
            placeholder="Event code (e.g. USTXHOU)"
          />
        </View>
        <View style={{ flex: 2 }}>
          <Input
            value={myTeam}
            onChangeText={setMyTeam}
            placeholder="My team #"
            keyboardType="numeric"
          />
        </View>
        <TouchableOpacity onPress={load} style={s.goBtn}>
          <Text style={s.goBtnText}>GO</Text>
        </TouchableOpacity>
      </View>

      {error ? <Text style={s.errText}>{error}</Text> : null}
      {loading && <ActivityIndicator color={C.accent} style={{ marginVertical: 24 }} />}

      {/* ── My team highlight ───────────────────────────────────────────── */}
      {myRow && (
        <View style={s.myCard}>
          <Text style={s.myCardLabel}>YOUR TEAM · #{myRow.team.number}</Text>
          <Text style={s.myCardName} numberOfLines={1}>{myRow.team.name}</Text>
          <View style={s.myStats}>
            {[
              ["RANK",  myRow.ranking ? `#${myRow.ranking.rank}` : "—"],
              ["W-L",   myRow.ranking ? `${myRow.ranking.wins}-${myRow.ranking.losses}` : "—"],
              ["RP",    myRow.ranking ? myRow.ranking.rp.toFixed(1) : "—"],
              ["PLAYED",myRow.ranking ? String(myRow.ranking.qualMatchesPlayed) : "—"],
            ].map(([label, value]) => (
              <View key={String(label)} style={{ alignItems: "center" }}>
                <Text style={s.myStatVal}>{value}</Text>
                <Text style={s.myStatLabel}>{label}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* ── Rankings table ──────────────────────────────────────────────── */}
      {ftcEvent && (
        <>
          <View style={s.tableHead}>
            <Text style={[s.headCell, { width: 32 }]}>RK</Text>
            <Text style={[s.headCell, { width: 52 }]}>TEAM</Text>
            <Text style={[s.headCell, { flex: 1 }]}>NAME</Text>
            <Text style={[s.headCell, { width: 44 }]}>W-L</Text>
            <Text style={[s.headCell, { width: 36 }]}>RP</Text>
          </View>

          {ftcEvent.teams.map((et: FTCEventTeam) => {
            const isMe = String(et.team.number) === myTeam.trim();
            return (
              <View
                key={et.team.number}
                style={[s.tableRow, isMe && s.tableRowMe]}
              >
                <Text style={[s.rankCell, isMe && { color: C.accent }]}>
                  {et.ranking ? et.ranking.rank : "—"}
                </Text>
                <Text style={[s.teamCell, isMe && { color: C.accent }]}>
                  {et.team.number}
                </Text>
                <Text style={s.nameCell} numberOfLines={1}>{et.team.name}</Text>
                <Text style={s.dataCell}>
                  {et.ranking ? `${et.ranking.wins}-${et.ranking.losses}` : "—"}
                </Text>
                <Text style={[s.dataCell, { color: et.ranking ? C.text : C.text3 }]}>
                  {et.ranking ? et.ranking.rp.toFixed(1) : "—"}
                </Text>
              </View>
            );
          })}

          {/* Unranked section */}
          {ftcEvent.teams.some(t => !t.ranking) && (
            <Text style={[s.source, { marginTop: 12 }]}>
              {ftcEvent.teams.filter(t => !t.ranking).length} teams not yet ranked (quals pending)
            </Text>
          )}
        </>
      )}

      {!ftcEvent && !loading && !error && (
        <View style={s.emptyState}>
          <Text style={s.emptyTitle}>Enter an event code to load standings</Text>
          <Text style={s.emptyBody}>
            Find your event code on ftcscout.org or the official FIRST FTC website.{"\n"}
            Example codes: USTXHOU, CASC, USFLN, USMDBA
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  content: { padding: 20, paddingTop: 60, gap: 10, paddingBottom: 40 },
  eyebrow: { color: C.accent, fontSize: 10, letterSpacing: 3 },
  title: { color: C.text, fontSize: 34, fontWeight: "900", letterSpacing: 2 },
  source: { color: C.text2, fontSize: 11, marginBottom: 4 },
  errText: { color: C.red, fontSize: 12, marginTop: 4 },

  inputRow: {
    flexDirection: "row", gap: 8, alignItems: "center",
    marginTop: 8,
  },
  goBtn: {
    backgroundColor: C.accent, borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 12, alignItems: "center",
  },
  goBtnText: { color: "#fff", fontSize: 12, fontWeight: "800", letterSpacing: 1 },

  // My team card
  myCard: {
    backgroundColor: C.accentDim, borderRadius: 12,
    padding: 16, borderWidth: 1, borderColor: C.accent + "40",
  },
  myCardLabel: { color: C.accent, fontSize: 10, letterSpacing: 3 },
  myCardName: { color: C.text, fontSize: 16, fontWeight: "700", marginTop: 2, marginBottom: 12 },
  myStats: { flexDirection: "row", justifyContent: "space-around" },
  myStatVal: { color: C.accent, fontSize: 24, fontWeight: "900", textAlign: "center" },
  myStatLabel: { color: C.text2, fontSize: 9, letterSpacing: 2, textAlign: "center", marginTop: 2 },

  // Rankings table
  tableHead: {
    flexDirection: "row", backgroundColor: C.bg3,
    paddingHorizontal: 10, paddingVertical: 8,
    borderRadius: 8, borderWidth: 1, borderColor: C.border,
    alignItems: "center",
  },
  headCell: { color: C.text2, fontSize: 9, letterSpacing: 1.5 },
  tableRow: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 10, paddingVertical: 9,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  tableRowMe: { backgroundColor: C.accentDim, borderRadius: 6 },
  rankCell: { width: 32, color: C.text2, fontSize: 12 },
  teamCell: { width: 52, color: C.text, fontSize: 13, fontWeight: "700" },
  nameCell: { flex: 1, color: C.text2, fontSize: 11 },
  dataCell: { width: 44, color: C.text, fontSize: 12 },

  emptyState: { marginTop: 24, gap: 10 },
  emptyTitle: { color: C.text, fontSize: 15, fontWeight: "700" },
  emptyBody: { color: C.text2, fontSize: 13, lineHeight: 20 },
});
