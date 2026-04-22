/**
 * CoolFTC — Mobile Courier Screen
 * apps/mobile/app/(app)/courier.tsx
 *
 * Read-only on mobile (+ generate shortcuts). Generation streams from
 * the web API base URL. Heavy writing / layout is web-first.
 */

import { useState, useEffect, useCallback } from "react";
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert, ActivityIndicator } from "react-native";
import { supabase } from "../../lib/supabase";
import { C } from "../../lib/theme";
import { Card, SectionHeader, Btn } from "../../components/ui";

type EditionType = "quals_recap" | "elim_recap" | "daily" | "robot_spotlight" | "hot_takes";
type Edition = {
  id: string;
  edition_type: EditionType;
  team_number: string | null;
  content: string;
  generated_at: string;
};

const TYPES: { id: EditionType; label: string; icon: string }[] = [
  { id: "quals_recap",     label: "Quals Recap",     icon: "◈" },
  { id: "elim_recap",      label: "Elim Recap",      icon: "🏆" },
  { id: "daily",           label: "Daily",           icon: "◐" },
  { id: "hot_takes",       label: "Hot Takes",       icon: "🔥" },
];

const LABELS: Record<EditionType, string> = {
  quals_recap: "Quals Recap",
  elim_recap: "Elim Recap",
  daily: "Daily",
  robot_spotlight: "Spotlight",
  hot_takes: "Hot Takes",
};

const API_BASE = process.env.EXPO_PUBLIC_API_BASE_URL ?? "";

export default function CourierScreen() {
  const [orgId, setOrgId] = useState("");
  const [eventKey] = useState("2025-DECODE-TEST");
  const [editions, setEditions] = useState<Edition[]>([]);
  const [selected, setSelected] = useState<Edition | null>(null);
  const [generating, setGenerating] = useState<EditionType | null>(null);
  const [loading, setLoading] = useState(true);

  const loadEditions = useCallback(async (oid: string) => {
    setLoading(true);
    try {
      // Read directly from Supabase — RLS allows org members to select courier_editions
      const { data, error } = await supabase
        .from("courier_editions")
        .select("id, edition_type, team_number, content, generated_at")
        .eq("org_id", oid)
        .eq("event_key", eventKey)
        .order("generated_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      setEditions((data ?? []) as Edition[]);
    } catch {
      // offline OK — show cached / empty
    } finally {
      setLoading(false);
    }
  }, [eventKey]);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data: m } = await supabase.from("org_members").select("org_id").eq("user_id", user.id).maybeSingle();
      if (!m) return;
      setOrgId(m.org_id);
      loadEditions(m.org_id);
    });
  }, [loadEditions]);

  async function generate(type: EditionType) {
    if (!orgId || !API_BASE) {
      Alert.alert("Not configured", "Set EXPO_PUBLIC_API_BASE_URL in .env.local.");
      return;
    }
    setGenerating(type);
    const { data: { session } } = await supabase.auth.getSession();

    try {
      const res = await fetch(`${API_BASE}/api/courier`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token ?? ""}`,
        },
        body: JSON.stringify({ orgId, eventKey, editionType: type }),
      });
      // On mobile we don't stream — just wait for full response then refresh
      await res.text();
      await loadEditions(orgId);
    } catch (e) {
      Alert.alert("Failed", e instanceof Error ? e.message : "Network error");
    } finally {
      setGenerating(null);
    }
  }

  if (selected) {
    return (
      <ScrollView style={s.c} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <TouchableOpacity onPress={() => setSelected(null)} style={s.back}>
          <Text style={s.backTxt}>← Back to archive</Text>
        </TouchableOpacity>
        <View style={s.readerHead}>
          <Text style={s.readerType}>
            {LABELS[selected.edition_type].toUpperCase()}
            {selected.team_number ? ` · #${selected.team_number}` : ""}
          </Text>
          <Text style={s.readerDate}>{new Date(selected.generated_at).toLocaleString()}</Text>
        </View>
        <Text style={s.body}>{selected.content}</Text>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={s.c} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Text style={s.eyebrow}>◪ THE COURIER</Text>
      <Text style={s.h1}>CNP NEWSPAPER</Text>
      <Text style={s.sub}>AI-generated editions from your event data</Text>

      <SectionHeader label="GENERATE" />
      <View style={s.genGrid}>
        {TYPES.map((t) => (
          <TouchableOpacity
            key={t.id}
            style={[s.genBtn, generating === t.id && s.genBtnActive]}
            onPress={() => generate(t.id)}
            disabled={generating !== null}
          >
            <Text style={s.genIcon}>{t.icon}</Text>
            <Text style={s.genLabel}>{t.label}</Text>
            {generating === t.id && <ActivityIndicator size="small" color={C.accent} />}
          </TouchableOpacity>
        ))}
      </View>
      <Text style={s.hint}>Robot Spotlight available on web only (needs team picker).</Text>

      <SectionHeader label={`ARCHIVE · ${editions.length}`} />
      {loading && <ActivityIndicator color={C.accent} style={{ marginTop: 20 }} />}
      {!loading && editions.length === 0 && (
        <Card>
          <Text style={s.empty}>No editions yet. Generate one above.</Text>
        </Card>
      )}
      {editions.map((e) => (
        <TouchableOpacity key={e.id} onPress={() => setSelected(e)} style={s.row}>
          <View style={{ flex: 1 }}>
            <Text style={s.rowLabel}>
              {LABELS[e.edition_type]}
              {e.team_number ? <Text style={s.rowTeam}> · #{e.team_number}</Text> : null}
            </Text>
            <Text style={s.rowDate}>
              {new Date(e.generated_at).toLocaleString([], {
                month: "short", day: "numeric",
                hour: "2-digit", minute: "2-digit",
              })}
            </Text>
          </View>
          <Text style={s.rowArrow}>→</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  c: { flex: 1, backgroundColor: C.bg },
  eyebrow: { fontFamily: "monospace", fontSize: 10, color: C.accent, letterSpacing: 2, marginBottom: 4 },
  h1: { color: C.text, fontSize: 28, fontWeight: "900", letterSpacing: 1, marginBottom: 4 },
  sub: { color: C.text2, fontSize: 12, marginBottom: 20 },
  genGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 10 },
  genBtn: {
    flexGrow: 1, minWidth: "47%",
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
    borderRadius: 12, padding: 14, alignItems: "center", gap: 6,
  },
  genBtnActive: { borderColor: C.accent, backgroundColor: C.accentDim },
  genIcon: { fontSize: 20 },
  genLabel: { color: C.text, fontSize: 12, fontWeight: "600" },
  hint: { color: C.text3, fontSize: 10, marginTop: 10, textAlign: "center" },
  empty: { color: C.text2, textAlign: "center", padding: 20, fontSize: 13 },
  row: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
    borderRadius: 10, padding: 14, marginBottom: 8,
  },
  rowLabel: { color: C.text, fontSize: 14, fontWeight: "700" },
  rowTeam: { color: C.text2, fontWeight: "400" },
  rowDate: { color: C.text3, fontSize: 10, fontFamily: "monospace", marginTop: 2 },
  rowArrow: { color: C.text2, fontSize: 18 },
  back: { marginBottom: 16 },
  backTxt: { color: C.accent, fontSize: 13, fontFamily: "monospace" },
  readerHead: { marginBottom: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  readerType: { fontFamily: "monospace", fontSize: 11, color: C.accent, letterSpacing: 1, marginBottom: 4 },
  readerDate: { fontFamily: "monospace", fontSize: 10, color: C.text3 },
  body: { color: C.text, fontSize: 14, lineHeight: 22 },
});
