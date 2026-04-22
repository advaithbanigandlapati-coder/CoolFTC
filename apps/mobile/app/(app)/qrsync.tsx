/**
 * CoolFTC — QR Sync Screen (mobile)
 * apps/mobile/app/(app)/qrsync.tsx
 *
 * Two modes:
 *   SHARE — Scout uploads their offline queue, gets a QR code.
 *           Other devices scan it to pull those entries.
 *   SCAN  — Camera opens, reads a coolfTC QR code, pulls entries.
 */

import { useState, useEffect } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, ScrollView
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import QRCode from "react-native-qrcode-svg";
import { supabase } from "../../lib/supabase";
import { C } from "../../lib/theme";
import { Card, Btn } from "../../components/ui";

const API_BASE = process.env.EXPO_PUBLIC_API_BASE_URL ?? "";

// Real QR code via react-native-qrcode-svg
function QRDisplay({ value }: { value: string }) {
  return (
    <View style={s.qrBox}>
      <Text style={s.qrLabel}>SCAN THIS CODE</Text>
      <View style={s.qrInner}>
        <QRCode
          value={value}
          size={240}
          color="#EAE8DE"
          backgroundColor="#07070A"
          quietZone={10}
        />
        <Text style={s.qrHint} numberOfLines={1}>ID: {value.slice(0, 24)}…</Text>
      </View>
      <Text style={s.qrExpiry}>Expires in 10 minutes</Text>
    </View>
  );
}

type Mode = "home" | "sharing" | "scanning" | "result";

export default function QRSyncScreen() {
  const [mode,     setMode]    = useState<Mode>("home");
  const [orgId,    setOrgId]   = useState("");
  const [eventKey, setEventKey]= useState("2025-DECODE-TEST");
  const [loading,  setLoading] = useState(false);
  const [qrPayload,setQrPayload]=useState("");
  const [entryCount,setEntryCount]=useState(0);
  const [received, setReceived]=useState(0);

  const [permission, requestPermission] = useCameraPermissions();

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data: m } = await supabase.from("org_members").select("org_id").eq("user_id", user.id).maybeSingle();
      if (m) setOrgId(m.org_id);
    });
  }, []);

  // ── Share: upload offline entries and generate QR ─────────────────────────
  async function startShare() {
    if (!orgId) return;
    if (!API_BASE) {
      Alert.alert("Server not configured", "Set EXPO_PUBLIC_API_BASE_URL in your .env to use QR Sync.");
      return;
    }
    setLoading(true);

    // Pull from offline queue (match_scouting records not yet synced)
    const { data: unsent } = await supabase
      .from("match_scouting")
      .select("*")
      .eq("org_id", orgId)
      .eq("event_key", eventKey)
      .order("scouted_at", { ascending: false })
      .limit(30);

    if (!unsent?.length) {
      Alert.alert("Nothing to share", "No scouting entries for this event.");
      setLoading(false);
      return;
    }

    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`${API_BASE}/api/qr-sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session?.access_token ?? ""}`,
      },
      body: JSON.stringify({ orgId, eventKey, entries: unsent }),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) { Alert.alert("Error", data.error); return; }

    setQrPayload(data.qrPayload);
    setEntryCount(data.entryCount);
    setMode("sharing");
  }

  // ── Scan: camera reads QR and pulls entries ───────────────────────────────
  async function startScan() {
    if (!permission?.granted) {
      const { granted } = await requestPermission();
      if (!granted) { Alert.alert("Camera permission needed to scan QR codes"); return; }
    }
    setMode("scanning");
  }

  async function onBarcodeScanned({ data }: { data: string }) {
    setMode("home"); // stop scanning
    if (!API_BASE) {
      Alert.alert("Server not configured", "Set EXPO_PUBLIC_API_BASE_URL in your .env to use QR Sync.");
      return;
    }
    setLoading(true);

    let payload: { sessionId: string };
    try { payload = JSON.parse(data); } catch {
      Alert.alert("Invalid QR code"); setLoading(false); return;
    }

    const { data: { session: sess2 } } = await supabase.auth.getSession();
    const res = await fetch(`${API_BASE}/api/qr-sync?id=${payload.sessionId}`, {
      headers: { Authorization: `Bearer ${sess2?.access_token ?? ""}` },
    });
    const result = await res.json();
    setLoading(false);

    if (!res.ok) { Alert.alert("Sync error", result.error); return; }

    setReceived(result.entryCount);
    setMode("result");
  }

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      <Text style={{ color: C.accent, fontSize: 10, letterSpacing: 3 }}>SCOUT SUITE</Text>
      <Text style={{ color: C.text, fontSize: 34, fontWeight: "900", letterSpacing: 2, marginBottom: 4 }}>QR SYNC</Text>

      {/* Event key */}
      <Card style={s.mb3}>
        <Text style={s.label}>ACTIVE EVENT</Text>
        <Text style={s.evKey}>{eventKey}</Text>
        <Text style={s.hint}>Change in Settings → Event</Text>
      </Card>

      {mode === "home" && (
        <View style={s.mb3}>
          <Text style={s.sectionLabel}>SHARE YOUR ENTRIES</Text>
          <Text style={s.desc}>Upload your recent scouting entries and generate a QR code. Other scouts scan it to get your data instantly.</Text>
          <Btn label={loading ? "Preparing…" : "Generate QR code →"} onPress={startShare} disabled={loading || !orgId} />

          <View style={s.divider} />

          <Text style={s.sectionLabel}>SCAN SOMEONE'S CODE</Text>
          <Text style={s.desc}>Scan a QR code from another scout's phone to pull their entries into your app.</Text>
          <Btn label="Open camera →" onPress={startScan} variant="ghost" />
        </View>
      )}

      {mode === "sharing" && (
        <View style={s.mb3}>
          <QRDisplay value={qrPayload} />
          <Text style={s.countText}>{entryCount} entries ready to share</Text>
          <TouchableOpacity onPress={() => setMode("home")} style={s.backBtn}>
            <Text style={s.backLabel}>← Back</Text>
          </TouchableOpacity>
        </View>
      )}

      {mode === "scanning" && permission?.granted && (
        <View style={s.cameraWrap}>
          <CameraView
            style={s.camera}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onBarcodeScanned={onBarcodeScanned}
          />
          <View style={s.scanOverlay}>
            <View style={s.scanFrame} />
            <Text style={s.scanHint}>Point camera at QR code</Text>
          </View>
          <TouchableOpacity onPress={() => setMode("home")} style={s.cancelBtn}>
            <Text style={s.cancelLabel}>Cancel</Text>
          </TouchableOpacity>
        </View>
      )}

      {mode === "result" && (
        <Card style={s.mb3}>
          <Text style={s.successIcon}>✓</Text>
          <Text style={s.successTitle}>Sync complete</Text>
          <Text style={s.successCount}>{received} entries received</Text>
          <Btn label="Done" onPress={() => setMode("home")} />
        </Card>
      )}

      {loading && (
        <ActivityIndicator color={C.accent} size="large" style={{ marginTop: 24 }} />
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container:   { flex: 1, backgroundColor: C.bg },
  content:     { padding: 20 },
  mb3:         { marginBottom: 16 },
  label:       { fontFamily: "DMMono", fontSize: 10, color: C.text3, letterSpacing: 1.5, marginBottom: 4 },
  evKey:       { fontFamily: "DMSans", fontWeight: "700", fontSize: 16, color: C.text },
  hint:        { fontFamily: "DMMono", fontSize: 10, color: C.text3, marginTop: 2 },
  sectionLabel:{ fontFamily: "DMMono", fontSize: 10, color: C.text3, letterSpacing: 1.5, marginBottom: 6 },
  desc:        { fontFamily: "DMMono", fontSize: 12, color: C.text2, lineHeight: 18, marginBottom: 12 },
  divider:     { height: 1, backgroundColor: C.border, marginVertical: 20 },
  countText:   { fontFamily: "DMMono", fontSize: 12, color: C.accent, textAlign: "center", marginTop: 12 },
  backBtn:     { marginTop: 16, alignSelf: "center" },
  backLabel:   { fontFamily: "DMMono", fontSize: 12, color: C.text2 },
  qrBox:       { backgroundColor: C.bg2, borderRadius: 12, padding: 20, alignItems: "center" },
  qrLabel:     { fontFamily: "DMMono", fontSize: 9, color: C.text3, letterSpacing: 2, marginBottom: 12 },
  qrInner:     { backgroundColor: C.bg3 ?? "#1A1A27", borderRadius: 8, padding: 20, width: "100%", alignItems: "center" },
  qrText:      { fontFamily: "DMMono", fontSize: 10, color: C.accent, textAlign: "center" },
  qrHint:      { fontFamily: "DMMono", fontSize: 9, color: C.text3, marginTop: 8, textAlign: "center" },
  qrExpiry:    { fontFamily: "DMMono", fontSize: 10, color: C.text3, marginTop: 8 },
  cameraWrap:  { borderRadius: 12, overflow: "hidden", height: 360, position: "relative" },
  camera:      { flex: 1 },
  scanOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" },
  scanFrame:   { width: 200, height: 200, borderWidth: 2, borderColor: C.accent, borderRadius: 8 },
  scanHint:    { fontFamily: "DMMono", fontSize: 11, color: "#fff", marginTop: 12 },
  cancelBtn:   { position: "absolute", top: 16, right: 16, backgroundColor: "rgba(0,0,0,0.6)", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  cancelLabel: { fontFamily: "DMMono", fontSize: 12, color: "#fff" },
  successIcon: { fontSize: 40, textAlign: "center", marginBottom: 8 },
  successTitle:{ fontFamily: "DMSans", fontWeight: "700", fontSize: 20, color: C.text, textAlign: "center" },
  successCount:{ fontFamily: "DMMono", fontSize: 12, color: C.accent, textAlign: "center", marginBottom: 16 },
});
