import { useState, useEffect } from "react";
import { View, Text, ScrollView, Alert, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../../lib/supabase";
import { C } from "../../lib/theme";
import { Card, Input, Btn, Label, SectionHeader } from "../../components/ui";
import { useEventKey } from "../../lib/useEventKey";

const API_BASE = process.env.EXPO_PUBLIC_API_BASE_URL ?? "";

export default function SettingsScreen() {
  const router = useRouter();
  const [userId, setUserId]   = useState("");
  const [org,    setOrg]      = useState<{ id:string; name:string; ftc_team_number:string|null } | null>(null);
  const [user,   setUser]     = useState<{ email:string; display_name:string } | null>(null);
  const [members,setMembers]  = useState<{ user_id:string; role:string; profiles:{ display_name:string } }[]>([]);
  const [orgName,setOrgName]  = useState("");
  const [noOrg,  setNoOrg]    = useState(false);
  const [saving, setSaving]   = useState(false);

  // Persistent event key, shared across all screens
  const [eventKey, setEventKey] = useEventKey();

  // Create-org form (recovery for users without an org)
  const [newOrgName, setNewOrgName] = useState("");
  const [newOrgTeam, setNewOrgTeam] = useState("");
  const [creatingOrg,setCreatingOrg]= useState(false);

  // BYOK API key
  const [apiKeyInput,setApiKeyInput] = useState("");
  const [keyVisible, setKeyVisible]  = useState(false);
  const [keyStatus,  setKeyStatus]   = useState<"idle"|"ok"|"err">("idle");
  const [keyMsg,     setKeyMsg]      = useState("");
  const [byokMode,   setByokMode]    = useState<"trial"|"own_key"|"locked"|null>(null);
  const [keyPreview, setKeyPreview]  = useState<string|null>(null);
  const [keySaving,  setKeySaving]   = useState(false);
  const [keyTesting, setKeyTesting]  = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user: u } }) => {
      if (!u) return;
      setUserId(u.id);
      setUser({ email: u.email ?? "", display_name: u.user_metadata?.display_name ?? "" });

      const { data: m } = await supabase
        .from("org_members")
        .select("org_id,role,organizations(id,name,ftc_team_number)")
        .eq("user_id", u.id)
        .maybeSingle();

      if (!m) {
        // Check for pending org from email-confirmation signup flow
        const pending = await AsyncStorage.getItem("pendingOrg");
        if (pending) {
          const { name, teamNumber, userId: pendingUid } = JSON.parse(pending) as { name:string; teamNumber:string|null; userId:string };
          if (pendingUid === u.id) {
            const slug = name.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/(^-|-$)/g,"") + "-" + Date.now();
            const { data: org } = await supabase.from("organizations")
              .insert({ name, ftc_team_number: teamNumber, slug, created_by: u.id })
              .select("id,name,ftc_team_number").single();
            if (org) {
              await supabase.from("org_members").insert({ org_id: org.id, user_id: u.id, role: "admin" });
              await AsyncStorage.removeItem("pendingOrg");
              setOrg(org as typeof org); setOrgName(name); setNoOrg(false);
              return;
            }
          }
        }
        setNoOrg(true);
        return;
      }

      const o = m.organizations as unknown as { id:string; name:string; ftc_team_number:string|null };
      setOrg(o); setOrgName(o.name);

      const { data: mems } = await supabase
        .from("org_members").select("user_id,role,profiles(display_name)").eq("org_id", o.id);
      setMembers((mems ?? []) as unknown as typeof members);

      // Load BYOK status
      if (API_BASE) {
        const { data: { session } } = await supabase.auth.getSession();
        const r = await fetch(`${API_BASE}/api/byok?orgId=${o.id}`, {
          headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
        }).catch(() => null);
        if (r?.ok) {
          const j = await r.json();
          setByokMode(j.mode ?? null);
          setKeyPreview(j.keyPreview ?? null);
        }
      }
    });
  }, []);

  async function saveOrgName() {
    if (!org) return; setSaving(true);
    await supabase.from("organizations").update({ name: orgName }).eq("id", org.id);
    setOrg(o => o ? { ...o, name: orgName } : o);
    setSaving(false);
    Alert.alert("Saved", "Organization name updated.");
  }

  async function createOrg() {
    if (!newOrgName.trim() || !userId) return;
    setCreatingOrg(true);
    const slug = newOrgName.trim().toLowerCase().replace(/[^a-z0-9]+/g,"-") + "-" + Date.now();
    const { data: org, error: orgErr } = await supabase.from("organizations")
      .insert({ name: newOrgName.trim(), ftc_team_number: newOrgTeam.trim() || null, slug, created_by: userId })
      .select("id,name,ftc_team_number").single();
    if (orgErr || !org) { Alert.alert("Error", orgErr?.message ?? "Failed"); setCreatingOrg(false); return; }
    const { error: memErr } = await supabase.from("org_members")
      .insert({ org_id: org.id, user_id: userId, role: "admin" });
    if (memErr) { Alert.alert("Warning", "Org created but membership link failed. Try signing out and back in."); }
    setOrg(org as typeof org); setOrgName(org.name); setNoOrg(false); setCreatingOrg(false);
    Alert.alert("Team created!", `Welcome to ${org.name}.`);
  }

  async function testKey() {
    if (!apiKeyInput || !org) return;
    setKeyTesting(true); setKeyStatus("idle"); setKeyMsg("");
    const { data: { session } } = await supabase.auth.getSession();
    const r = await fetch(`${API_BASE}/api/byok?test=1`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token ?? ""}` },
      body: JSON.stringify({ orgId: org.id, key: apiKeyInput }),
    }).catch(() => null);
    setKeyTesting(false);
    if (!r) { setKeyStatus("err"); setKeyMsg("Could not reach server."); return; }
    const d = await r.json();
    if (r.ok) { setKeyStatus("ok"); setKeyMsg(d.message ?? "Key valid ✓"); }
    else      { setKeyStatus("err"); setKeyMsg(d.error ?? "Invalid key"); }
  }

  async function saveKey() {
    if (!apiKeyInput || keyStatus !== "ok" || !org) return;
    setKeySaving(true);
    const { data: { session } } = await supabase.auth.getSession();
    const r = await fetch(`${API_BASE}/api/byok`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token ?? ""}` },
      body: JSON.stringify({ orgId: org.id, key: apiKeyInput }),
    }).catch(() => null);
    setKeySaving(false);
    if (r?.ok) {
      setApiKeyInput(""); setKeyStatus("idle"); setKeyMsg("");
      setByokMode("own_key"); Alert.alert("Key saved", "ARIA will now use your Anthropic API key.");
    } else {
      Alert.alert("Error", "Failed to save key. Check server configuration.");
    }
  }

  const roleColors: Record<string,string> = { admin:C.accent, analyst:C.blue, scout:C.green, viewer:C.text2 };

  return (
    <ScrollView style={{ flex:1, backgroundColor:C.bg }}
      contentContainerStyle={{ padding:20, paddingTop:60, gap:12, paddingBottom:60 }}
      keyboardShouldPersistTaps="handled">

      <Text style={{ color:C.accent, fontSize:10, letterSpacing:3 }}>SETTINGS</Text>
      <Text style={{ color:C.text, fontSize:34, fontWeight:"900", letterSpacing:2, marginBottom:4 }}>SETTINGS</Text>

      {/* ── No-org recovery ─────────────────────────────────────── */}
      {noOrg && (
        <Card style={{ borderColor:C.accent, borderWidth:1 }}>
          <SectionHeader label="SETUP REQUIRED" />
          <Text style={{ color:C.text2, fontSize:12, marginBottom:10 }}>
            Your account isn't linked to a team yet.
          </Text>
          {/* Mode toggle */}
          <View style={{ flexDirection:"row", gap:8, marginBottom:14 }}>
            <TouchableOpacity
              onPress={() => setNoOrg(false)}
              style={{ flex:1, paddingVertical:8, borderRadius:6, backgroundColor:C.accent, alignItems:"center" }}
            >
              <Text style={{ color:"#000", fontSize:11, fontWeight:"700" }}>CREATE ORG</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {}}
              style={{ flex:1, paddingVertical:8, borderRadius:6, backgroundColor:C.surface2, alignItems:"center" }}
            >
              <Text style={{ color:C.text2, fontSize:11 }}>JOIN EXISTING</Text>
            </TouchableOpacity>
          </View>
          <Label text="TEAM / ORG NAME" />
          <Input value={newOrgName} onChangeText={setNewOrgName} placeholder="Cool Name Pending" />
          <View style={{ height:10 }} />
          <Label text="FTC TEAM NUMBER (OPTIONAL)" />
          <Input value={newOrgTeam} onChangeText={setNewOrgTeam} placeholder="30439" keyboardType="numeric" />
          <View style={{ height:8 }} />
          <Text style={{ color:C.text3, fontSize:11, marginBottom:14 }}>
            Or, to join an existing org, have your admin add your email: {'\n'}
            <Text style={{ color:C.text, fontWeight:"600" }}>{user?.email}</Text>
          </Text>
          <Btn label={creatingOrg?"Creating…":"Create Team →"} onPress={createOrg} loading={creatingOrg} />
        </Card>
      )}

      {/* ── Active event key ────────────────────────────────────── */}
      <Card>
        <SectionHeader label="ACTIVE EVENT" />
        <Text style={{ color:C.text2, fontSize:11, marginBottom:10 }}>
          Set your event once — all screens (Scout, Notes, Analytics, etc.) will use it automatically.
        </Text>
        <Label text="EVENT KEY" />
        <Input
          value={eventKey}
          onChangeText={setEventKey}
          placeholder="e.g. 2025-USCAFFFAQ"
          autoCapitalize="none"
        />
        <Text style={{ color:C.text3, fontSize:10, marginTop:6 }}>
          Find event codes at ftcscout.org or the FIRST FTC website.
        </Text>
        {eventKey ? (
          <Text style={{ color:C.green, fontSize:11, marginTop:6 }}>✓ Active: {eventKey}</Text>
        ) : (
          <Text style={{ color:C.amber, fontSize:11, marginTop:6 }}>⚠ No event set — enter above</Text>
        )}
      </Card>

      {/* ── ARIA API Key ─────────────────────────────────────────── */}
      {API_BASE && (org || noOrg) && (
        <Card>
          <SectionHeader label="ARIA API KEY" />
          {byokMode === "own_key" && keyPreview && (
            <View style={{ flexDirection:"row", alignItems:"center", marginBottom:12 }}>
              <View style={{ flex:1 }}>
                <Text style={{ color:C.green, fontSize:12, fontWeight:"700" }}>✓ Using your key</Text>
                <Text style={{ color:C.text2, fontSize:11, marginTop:2 }}>{keyPreview}</Text>
              </View>
            </View>
          )}
          {byokMode === "trial" && (
            <Text style={{ color:C.amber, fontSize:12, marginBottom:12 }}>Trial active. Add your key to keep using ARIA after trial ends.</Text>
          )}
          {byokMode === "locked" && (
            <Text style={{ color:C.red, fontSize:12, marginBottom:12 }}>Trial ended. You must add an Anthropic key to use ARIA.</Text>
          )}
          <Text style={{ color:C.text2, fontSize:11, marginBottom:10 }}>
            Get a key at console.anthropic.com. Stored encrypted on your server, never sent to clients.
          </Text>
          <Label text="ANTHROPIC API KEY" />
          <View style={{ flexDirection:"row", gap:8 }}>
            <View style={{ flex:1 }}>
              <Input
                value={apiKeyInput}
                onChangeText={v => { setApiKeyInput(v); setKeyStatus("idle"); setKeyMsg(""); }}
                placeholder="sk-ant-api03-..."
                secureTextEntry={!keyVisible}
              />
            </View>
            <TouchableOpacity onPress={() => setKeyVisible(v => !v)}
              style={{ justifyContent:"center", paddingHorizontal:10 }}>
              <Text style={{ color:C.text2, fontSize:11 }}>{keyVisible?"HIDE":"SHOW"}</Text>
            </TouchableOpacity>
          </View>
          {keyMsg ? (
            <Text style={{ color: keyStatus==="ok" ? C.green : C.red, fontSize:11, marginTop:6 }}>{keyMsg}</Text>
          ) : null}
          <View style={{ flexDirection:"row", gap:8, marginTop:10 }}>
            <Btn label={keyTesting?"Testing…":"Test Key"} onPress={testKey}
              variant="ghost" style={{ flex:1 }} />
            <Btn label={keySaving?"Saving…":"Save Key →"} onPress={saveKey}
              disabled={keyStatus !== "ok"} loading={keySaving} style={{ flex:1 }} />
          </View>
        </Card>
      )}
      {!API_BASE && (
        <Card>
          <SectionHeader label="ARIA API KEY" />
          <Text style={{ color:C.text2, fontSize:12 }}>
            Set EXPO_PUBLIC_API_BASE_URL in your .env to configure your Anthropic API key for ARIA.
          </Text>
        </Card>
      )}

      {/* ── Organization ─────────────────────────────────────────── */}
      {org && (
        <Card>
          <SectionHeader label="ORGANIZATION" />
          <Label text="ORG NAME" />
          <Input value={orgName} onChangeText={setOrgName} placeholder="Team name" />
          <View style={{ height:12 }} />
          <Btn label={saving?"Saving…":"Save Name"} onPress={saveOrgName} variant="ghost" loading={saving} />
        </Card>
      )}

      {/* ── Members ──────────────────────────────────────────────── */}
      {members.length > 0 && (
        <Card>
          <SectionHeader label="MEMBERS" />
          {members.map(m => (
            <View key={m.user_id} style={{ flexDirection:"row", alignItems:"center", gap:10, paddingVertical:10, borderBottomWidth:1, borderBottomColor:C.border }}>
              <View style={{ width:32, height:32, borderRadius:16, backgroundColor:C.surface3, alignItems:"center", justifyContent:"center" }}>
                <Text style={{ color:C.text2, fontSize:13 }}>{(m.profiles?.display_name??"?")[0].toUpperCase()}</Text>
              </View>
              <Text style={{ flex:1, color:C.text, fontSize:14 }}>{m.profiles?.display_name}</Text>
              <Text style={{ color:roleColors[m.role]??C.text2, fontSize:10, letterSpacing:2 }}>{m.role.toUpperCase()}</Text>
            </View>
          ))}
        </Card>
      )}

      {/* ── Account ──────────────────────────────────────────────── */}
      <Card>
        <SectionHeader label="ACCOUNT" />
        {user && <Text style={{ color:C.text2, fontSize:13, marginBottom:16 }}>{user.email}</Text>}
        <Btn label="Sign Out" onPress={async () => { await supabase.auth.signOut(); router.replace("/(auth)/login"); }} variant="danger" />
      </Card>
    </ScrollView>
  );
}
