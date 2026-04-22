/**
 * CoolFTC — Mobile Scout Suite
 * apps/mobile/app/(app)/scout.tsx
 *
 * Three tabs matching web /app/scout:
 *   MATCH  — full match scouting form
 *   PIT    — structured pit interview + mechanical risk rating
 *   QUICK  — 1-tap rapid scoring for stands
 */

import { useState, useEffect } from "react";
import { View, Text, ScrollView, StyleSheet, Switch, TouchableOpacity, Alert, Image } from "react-native";
import { supabase } from "../../lib/supabase";
import { C } from "../../lib/theme";
import { Card, Label, Input, Btn, SectionHeader, StatGrid } from "../../components/ui";

type Tab = "match" | "pit" | "quick";

const ENDGAME_OPTS = [
  { label: "None",       value: "none",    pts: 0  },
  { label: "Partial",    value: "partial", pts: 5  },
  { label: "Full Base",  value: "full",    pts: 10 },
  { label: "Both Bonus", value: "both",    pts: 20 },
];

const DRIVETRAIN_OPTS = ["tank", "mecanum", "swerve", "holonomic", "other"];

type MatchForm = {
  teamNumber: string; matchNumber: string; alliance: "red" | "blue";
  autoLeave: boolean; autoCloseRange: boolean; autoFarRange: boolean;
  avgBallsAuto: string; highBallsAuto: string;
  avgBallsTeleop: string; highBallsTeleop: string;
  endgamePlan: string; notes: string;
};
const MATCH_INIT: MatchForm = {
  teamNumber: "", matchNumber: "", alliance: "red",
  autoLeave: false, autoCloseRange: false, autoFarRange: false,
  avgBallsAuto: "0", highBallsAuto: "0", avgBallsTeleop: "0", highBallsTeleop: "0",
  endgamePlan: "none", notes: "",
};

type PitForm = {
  teamNumber: string; drivetrain: string; autoCap: boolean;
  endgamePlan: string; mechRisk: number;
  autoNotes: string; teleopNotes: string; endgameNotes: string; generalNotes: string;
};
const PIT_INIT: PitForm = {
  teamNumber: "", drivetrain: "tank", autoCap: false,
  endgamePlan: "none", mechRisk: 3,
  autoNotes: "", teleopNotes: "", endgameNotes: "", generalNotes: "",
};

type QuickForm = {
  teamNumber: string; matchNumber: string;
  autoScore: number; teleopScore: number; endgame: string;
};
const QUICK_INIT: QuickForm = {
  teamNumber: "", matchNumber: "",
  autoScore: 0, teleopScore: 0, endgame: "none",
};

export default function ScoutScreen() {
  const [tab,      setTab]      = useState<Tab>("match");
  const [orgId,    setOrgId]    = useState("");
  const [userId,   setUserId]   = useState("");
  const [eventKey, setEventKey] = useState("2025-DECODE-TEST");
  const [saving,   setSaving]   = useState(false);

  const [match, setMatch] = useState<MatchForm>(MATCH_INIT);
  const [pit,   setPit]   = useState<PitForm>(PIT_INIT);
  const [quick, setQuick] = useState<QuickForm>(QUICK_INIT);
  const [fieldPositions, setFieldPositions] = useState<{x:number;y:number;phase:"auto"|"teleop"|"endgame"}[]>([]);
  const [tapPhase, setTapPhase] = useState<"auto"|"teleop"|"endgame">("teleop");

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      setUserId(user.id);
      const { data: m } = await supabase.from("org_members").select("org_id").eq("user_id", user.id).maybeSingle();
      if (m) setOrgId(m.org_id);
    });
  }, []);

  const updM = (k: keyof MatchForm, v: string | boolean) => setMatch(f => ({ ...f, [k]: v }));
  const autoScoreM = () => (match.autoLeave ? 3 : 0) + (match.autoCloseRange ? (parseInt(match.avgBallsAuto) || 0) * 4 : 0) + (match.autoFarRange ? 2 : 0);
  const teleScoreM = () => (parseInt(match.avgBallsTeleop) || 0) * 2;
  const egScoreM   = () => ({ none:0, partial:5, full:10, both:20 }[match.endgamePlan] ?? 0);
  const totalM     = () => autoScoreM() + teleScoreM() + egScoreM();

  async function saveMatch() {
    if (!match.teamNumber || !match.matchNumber) { Alert.alert("Missing fields", "Enter team # and match #"); return; }
    setSaving(true);
    try {
      const { error } = await supabase.from("match_scouting").upsert({
        org_id: orgId, event_key: eventKey,
        match_number: parseInt(match.matchNumber), match_type: "qual",
        team_number: match.teamNumber, alliance: match.alliance,
        form_data: match, auto_score: autoScoreM(), teleop_score: teleScoreM(),
        endgame_score: egScoreM(), total_score: totalM(),
        field_positions: fieldPositions,
        scouted_by: userId, scouted_at: new Date().toISOString(),
      }, { onConflict: "org_id,event_key,match_number,team_number" });
      if (error) throw error;
      Alert.alert("✓ Saved", `Team ${match.teamNumber} Q${match.matchNumber} recorded.`, [
        { text: "Next Match", onPress: () => { setMatch(f => ({ ...MATCH_INIT, matchNumber: String(parseInt(f.matchNumber) + 1) })); setFieldPositions([]); } },
        { text: "Close" },
      ]);
    } catch (e) {
      Alert.alert("Save failed", e instanceof Error ? e.message : "Unknown error");
    } finally { setSaving(false); }
  }

  const updP = <K extends keyof PitForm>(k: K, v: PitForm[K]) => setPit(f => ({ ...f, [k]: v }));

  async function savePit() {
    if (!pit.teamNumber) { Alert.alert("Missing field", "Enter a team number"); return; }
    setSaving(true);
    try {
      const { error } = await supabase.from("pit_scouting").upsert({
        org_id: orgId, event_key: eventKey, team_number: pit.teamNumber,
        drivetrain: pit.drivetrain, auto_capable: pit.autoCap,
        endgame_capable: pit.endgamePlan, mechanical_risk: pit.mechRisk,
        auto_notes: pit.autoNotes, teleop_notes: pit.teleopNotes,
        endgame_notes: pit.endgameNotes, general_notes: pit.generalNotes,
        form_data: pit, scouted_by: userId,
        scouted_at: new Date().toISOString(),
      }, { onConflict: "org_id,event_key,team_number" });
      if (error) throw error;
      Alert.alert("✓ Saved", `Pit data for Team ${pit.teamNumber}.`, [
        { text: "Another Team", onPress: () => setPit(PIT_INIT) },
        { text: "Close" },
      ]);
    } catch (e) {
      Alert.alert("Save failed", e instanceof Error ? e.message : "Unknown error");
    } finally { setSaving(false); }
  }

  const updQ = <K extends keyof QuickForm>(k: K, v: QuickForm[K]) => setQuick(f => ({ ...f, [k]: v }));
  const quickEg = () => ({ none:0, partial:5, full:10, both:20 }[quick.endgame] ?? 0);

  async function saveQuick() {
    if (!quick.teamNumber || !quick.matchNumber) { Alert.alert("Missing fields", "Enter team # and match #"); return; }
    setSaving(true);
    try {
      const { error } = await supabase.from("match_scouting").upsert({
        org_id: orgId, event_key: eventKey,
        match_number: parseInt(quick.matchNumber), match_type: "qual",
        team_number: quick.teamNumber, alliance: "red",
        form_data: { quickScout: true, ...quick },
        auto_score: quick.autoScore, teleop_score: quick.teleopScore,
        endgame_score: quickEg(),
        total_score: quick.autoScore + quick.teleopScore + quickEg(),
        scouted_by: userId, scouted_at: new Date().toISOString(),
      }, { onConflict: "org_id,event_key,match_number,team_number" });
      if (error) throw error;
      setQuick({ ...QUICK_INIT, matchNumber: String(parseInt(quick.matchNumber) + 1) });
      Alert.alert("✓ Quick scouted");
    } catch (e) {
      Alert.alert("Save failed", e instanceof Error ? e.message : "Unknown error");
    } finally { setSaving(false); }
  }

  return (
    <ScrollView style={s.root} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      <Text style={s.eyebrow}>SCOUT SUITE</Text>
      <Text style={s.title}>{tab.toUpperCase()} SCOUTING</Text>

      <View style={s.tabs}>
        {(["match", "pit", "quick"] as const).map(t => (
          <TouchableOpacity key={t} onPress={() => setTab(t)}
            style={[s.tabBtn, tab === t && s.tabBtnActive]}>
            <Text style={[s.tabLabel, tab === t && s.tabLabelActive]}>{t.toUpperCase()}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Card>
        <Label text="EVENT KEY" />
        <Input value={eventKey} onChangeText={setEventKey} placeholder="2025-TXHOU" />
      </Card>

      {tab === "match" && (<>
        <Card>
          <SectionHeader label="MATCH INFO" />
          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1 }}><Label text="TEAM #" /><Input value={match.teamNumber} onChangeText={v => updM("teamNumber", v)} placeholder="30439" keyboardType="numeric" /></View>
            <View style={{ flex: 1 }}><Label text="MATCH #" /><Input value={match.matchNumber} onChangeText={v => updM("matchNumber", v)} placeholder="1" keyboardType="numeric" /></View>
          </View>
          <View style={{ height: 12 }} />
          <Label text="ALLIANCE" />
          <View style={{ flexDirection: "row", gap: 8 }}>
            {(["red", "blue"] as const).map(a => (
              <TouchableOpacity key={a} onPress={() => updM("alliance", a)}
                style={[s.pill, match.alliance === a && { backgroundColor: a === "red" ? C.redDim : C.blueDim, borderColor: a === "red" ? C.red : C.blue }]}>
                <Text style={{ color: match.alliance === a ? (a === "red" ? C.red : C.blue) : C.text2, fontSize: 13, fontWeight: "600", textTransform: "capitalize" }}>{a}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Card>

        <Card>
          <SectionHeader label="AUTO" />
          {[["Leave Zone","autoLeave"],["Close Range","autoCloseRange"],["Far Range","autoFarRange"]].map(([label, key]) => (
            <View key={key} style={s.switchRow}>
              <Text style={s.switchLabel}>{label}</Text>
              <Switch value={match[key as keyof MatchForm] as boolean}
                onValueChange={v => updM(key as keyof MatchForm, v)}
                thumbColor={C.text} trackColor={{ false: C.surface2, true: C.accent }} />
            </View>
          ))}
          <View style={{ height: 10 }} />
          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1 }}><Label text="AVG BALLS" /><Input value={match.avgBallsAuto} onChangeText={v => updM("avgBallsAuto", v)} keyboardType="numeric" /></View>
            <View style={{ flex: 1 }}><Label text="HIGH BALLS" /><Input value={match.highBallsAuto} onChangeText={v => updM("highBallsAuto", v)} keyboardType="numeric" /></View>
          </View>
        </Card>

        <Card>
          <SectionHeader label="TELEOP" />
          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1 }}><Label text="AVG BALLS" /><Input value={match.avgBallsTeleop} onChangeText={v => updM("avgBallsTeleop", v)} keyboardType="numeric" /></View>
            <View style={{ flex: 1 }}><Label text="HIGH BALLS" /><Input value={match.highBallsTeleop} onChangeText={v => updM("highBallsTeleop", v)} keyboardType="numeric" /></View>
          </View>
        </Card>

        <Card>
          <SectionHeader label="ENDGAME" />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {ENDGAME_OPTS.map(({ label, value, pts }) => (
              <TouchableOpacity key={value} onPress={() => updM("endgamePlan", value)}
                style={[s.pill, match.endgamePlan === value && { backgroundColor: C.accentDim, borderColor: C.accent }]}>
                <Text style={{ color: match.endgamePlan === value ? C.accent : C.text2, fontSize: 12, fontWeight: "600" }}>{label} <Text style={{ opacity: 0.6 }}>+{pts}</Text></Text>
              </TouchableOpacity>
            ))}
          </View>
        </Card>

        <Card>
          <SectionHeader label="NOTES" />
          <Input value={match.notes} onChangeText={v => updM("notes", v)} placeholder="Observations, fouls, concerns…" multiline numberOfLines={3} />
        </Card>

        <Card>
          <SectionHeader label="FIELD POSITIONS" />
          <Text style={{ color: C.text2, fontSize: 11, marginBottom: 8 }}>Tap where this team scored. Builds the heatmap over time.</Text>
          <View style={{ flexDirection: "row", gap: 6, marginBottom: 10 }}>
            {(["auto", "teleop", "endgame"] as const).map((p) => (
              <TouchableOpacity key={p} onPress={() => setTapPhase(p)}
                style={[s.pill, tapPhase === p && { backgroundColor: C.accentDim, borderColor: C.accent }]}>
                <Text style={{ color: tapPhase === p ? C.accent : C.text2, fontSize: 11, fontWeight: "600" }}>{p.toUpperCase()}</Text>
              </TouchableOpacity>
            ))}
            {fieldPositions.length > 0 && (
              <TouchableOpacity onPress={() => setFieldPositions([])} style={s.pill}>
                <Text style={{ color: C.text2, fontSize: 11 }}>CLEAR ({fieldPositions.length})</Text>
              </TouchableOpacity>
            )}
          </View>
          <View
            onStartShouldSetResponder={() => true}
            onResponderRelease={(e) => {
              const { locationX, locationY } = e.nativeEvent;
              const FIELD_W = 320; const FIELD_H = 320;
              setFieldPositions(prev => [...prev, {
                x: Math.max(0, Math.min(1, locationX / FIELD_W)),
                y: Math.max(0, Math.min(1, locationY / FIELD_H)),
                phase: tapPhase,
              }]);
            }}
            style={{ width: 320, height: 320, borderRadius: 6, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", alignSelf: "center", position: "relative", overflow: "hidden" }}>
            {/* Real DECODE field image */}
            <Image
              source={require("../../assets/field.png")}
              style={{ position: "absolute", width: 320, height: 320 }}
              resizeMode="cover"
            />
            {/* Tap-to-mark dots */}
            {fieldPositions.map((p, i) => {
              const color = p.phase === "auto" ? "#5B9CF4" : p.phase === "endgame" ? "#FF5A1F" : "#2DD88A";
              return <View key={i} pointerEvents="none" style={{
                position: "absolute",
                left: p.x * 320 - 8, top: p.y * 320 - 8,
                width: 16, height: 16, borderRadius: 8,
                backgroundColor: color + "CC",
                borderWidth: 2, borderColor: color,
              }} />;
            })}
          </View>
          <View style={{ flexDirection: "row", gap: 12, marginTop: 6, alignSelf: "center" }}>
            <Text style={{ color: C.text2, fontSize: 9 }}>● AUTO</Text>
            <Text style={{ color: "#2DD88A", fontSize: 9 }}>● TELEOP</Text>
            <Text style={{ color: "#FF5A1F", fontSize: 9 }}>● ENDGAME</Text>
          </View>
        </Card>

        <StatGrid items={[
          { label: "AUTO",   value: autoScoreM() },
          { label: "TELEOP", value: teleScoreM() },
          { label: "EG",     value: egScoreM() },
          { label: "TOTAL",  value: totalM() },
        ]} />

        <Btn label={saving ? "Saving…" : "Save Match →"} onPress={saveMatch} loading={saving} style={{ marginTop: 4, marginBottom: 40 }} />
      </>)}

      {tab === "pit" && (<>
        <Card>
          <SectionHeader label="TEAM" />
          <Label text="TEAM #" />
          <Input value={pit.teamNumber} onChangeText={v => updP("teamNumber", v)} placeholder="30439" keyboardType="numeric" />
          <View style={{ height: 12 }} />
          <Label text="DRIVETRAIN" />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {DRIVETRAIN_OPTS.map(d => (
              <TouchableOpacity key={d} onPress={() => updP("drivetrain", d)}
                style={[s.pill, pit.drivetrain === d && { backgroundColor: C.accentDim, borderColor: C.accent }]}>
                <Text style={{ color: pit.drivetrain === d ? C.accent : C.text2, fontSize: 11, fontWeight: "600", textTransform: "uppercase" }}>{d}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Card>

        <Card>
          <SectionHeader label="CAPABILITIES" />
          <View style={s.switchRow}>
            <Text style={s.switchLabel}>Auto capable</Text>
            <Switch value={pit.autoCap} onValueChange={v => updP("autoCap", v)}
              thumbColor={C.text} trackColor={{ false: C.surface2, true: C.accent }} />
          </View>
          <View style={{ height: 10 }} />
          <Label text="ENDGAME" />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {ENDGAME_OPTS.map(({ label, value }) => (
              <TouchableOpacity key={value} onPress={() => updP("endgamePlan", value)}
                style={[s.pill, pit.endgamePlan === value && { backgroundColor: C.accentDim, borderColor: C.accent }]}>
                <Text style={{ color: pit.endgamePlan === value ? C.accent : C.text2, fontSize: 12, fontWeight: "600" }}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Card>

        <Card>
          <SectionHeader label={`MECHANICAL RISK · ${pit.mechRisk}/5`} />
          <View style={{ flexDirection: "row", gap: 6 }}>
            {[1, 2, 3, 4, 5].map(r => (
              <TouchableOpacity key={r} onPress={() => updP("mechRisk", r)}
                style={[s.riskBtn, pit.mechRisk >= r && { backgroundColor: r >= 4 ? C.red : r >= 3 ? C.amber : C.green, borderColor: "transparent" }]}>
                <Text style={{ color: pit.mechRisk >= r ? "#000" : C.text2, fontWeight: "900", fontSize: 16 }}>{r}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={s.hint}>1 = rock solid · 5 = held together with tape</Text>
        </Card>

        <Card>
          <SectionHeader label="NOTES" />
          <Label text="AUTO" /><Input value={pit.autoNotes} onChangeText={v => updP("autoNotes", v)} multiline numberOfLines={2} />
          <View style={{ height: 8 }} />
          <Label text="TELEOP" /><Input value={pit.teleopNotes} onChangeText={v => updP("teleopNotes", v)} multiline numberOfLines={2} />
          <View style={{ height: 8 }} />
          <Label text="ENDGAME" /><Input value={pit.endgameNotes} onChangeText={v => updP("endgameNotes", v)} multiline numberOfLines={2} />
          <View style={{ height: 8 }} />
          <Label text="GENERAL" /><Input value={pit.generalNotes} onChangeText={v => updP("generalNotes", v)} multiline numberOfLines={3} placeholder="Driver experience, strategy, anything else…" />
        </Card>

        <Btn label={saving ? "Saving…" : "Save Pit Entry →"} onPress={savePit} loading={saving} style={{ marginTop: 4, marginBottom: 40 }} />
      </>)}

      {tab === "quick" && (<>
        <Card>
          <SectionHeader label="QUICK SCOUT — 1-TAP" />
          <Text style={s.hint}>For stands. No time to think. Just numbers.</Text>
          <View style={{ height: 12 }} />
          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1 }}><Label text="TEAM #" /><Input value={quick.teamNumber} onChangeText={v => updQ("teamNumber", v)} keyboardType="numeric" /></View>
            <View style={{ flex: 1 }}><Label text="MATCH #" /><Input value={quick.matchNumber} onChangeText={v => updQ("matchNumber", v)} keyboardType="numeric" /></View>
          </View>
        </Card>

        <Card>
          <SectionHeader label={`AUTO · ${quick.autoScore}`} />
          <View style={s.tapRow}>
            {[-5, -1, +1, +5].map(delta => (
              <TouchableOpacity key={delta} onPress={() => updQ("autoScore", Math.max(0, quick.autoScore + delta))} style={s.tapBtn}>
                <Text style={s.tapText}>{delta > 0 ? `+${delta}` : delta}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Card>

        <Card>
          <SectionHeader label={`TELEOP · ${quick.teleopScore}`} />
          <View style={s.tapRow}>
            {[-5, -1, +1, +5].map(delta => (
              <TouchableOpacity key={delta} onPress={() => updQ("teleopScore", Math.max(0, quick.teleopScore + delta))} style={s.tapBtn}>
                <Text style={s.tapText}>{delta > 0 ? `+${delta}` : delta}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Card>

        <Card>
          <SectionHeader label="ENDGAME" />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {ENDGAME_OPTS.map(({ label, value, pts }) => (
              <TouchableOpacity key={value} onPress={() => updQ("endgame", value)}
                style={[s.pill, quick.endgame === value && { backgroundColor: C.accentDim, borderColor: C.accent }]}>
                <Text style={{ color: quick.endgame === value ? C.accent : C.text2, fontSize: 11, fontWeight: "600" }}>{label} <Text style={{ opacity: 0.6 }}>+{pts}</Text></Text>
              </TouchableOpacity>
            ))}
          </View>
        </Card>

        <StatGrid items={[
          { label: "AUTO",   value: quick.autoScore },
          { label: "TELEOP", value: quick.teleopScore },
          { label: "EG",     value: quickEg() },
          { label: "TOTAL",  value: quick.autoScore + quick.teleopScore + quickEg() },
        ]} />

        <Btn label={saving ? "Saving…" : "Save & Next →"} onPress={saveQuick} loading={saving} style={{ marginTop: 4, marginBottom: 40 }} />
      </>)}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root:    { flex: 1, backgroundColor: C.bg },
  content: { padding: 20, paddingTop: 60, gap: 12 },
  eyebrow: { color: C.accent, fontSize: 10, letterSpacing: 3 },
  title:   { color: C.text, fontSize: 28, fontWeight: "900", letterSpacing: 2, marginBottom: 4 },
  tabs:    { flexDirection: "row", gap: 6, marginBottom: 4 },
  tabBtn:  { flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: C.border2, alignItems: "center", backgroundColor: C.surface },
  tabBtnActive: { backgroundColor: C.accentDim, borderColor: C.accent },
  tabLabel:       { color: C.text2, fontSize: 11, fontWeight: "700", letterSpacing: 1 },
  tabLabelActive: { color: C.accent },
  switchRow:   { flexDirection: "row", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.border },
  switchLabel: { flex: 1, color: C.text, fontSize: 14 },
  pill:        { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: C.border2 },
  riskBtn:     { flex: 1, aspectRatio: 1, borderWidth: 1, borderColor: C.border2, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: C.surface },
  hint:        { color: C.text3, fontSize: 10, marginTop: 6, textAlign: "center" },
  tapRow:      { flexDirection: "row", gap: 8, justifyContent: "space-between" },
  tapBtn:      { flex: 1, paddingVertical: 16, borderRadius: 10, borderWidth: 1, borderColor: C.border2, alignItems: "center", backgroundColor: C.surface },
  tapText:     { color: C.accent, fontSize: 18, fontWeight: "900" },
});
