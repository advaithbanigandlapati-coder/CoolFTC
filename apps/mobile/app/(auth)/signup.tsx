import { useState } from "react";
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from "react-native";
import { useRouter, Link } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../../lib/supabase";
import { C } from "../../lib/theme";
import { Card, Label, Input, Btn } from "../../components/ui";

export default function SignupScreen() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ email:"", password:"", displayName:"", teamNumber:"", orgName:"" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const upd = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  async function createOrg(userId: string) {
    const slug = form.orgName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") + "-" + Date.now();
    const { data: org, error: orgErr } = await supabase.from("organizations").insert({
      name: form.orgName.trim(), ftc_team_number: form.teamNumber || null,
      slug, created_by: userId,
    }).select("id").single();
    if (orgErr || !org) { setError("Account created but org setup failed. Sign in and try again."); setLoading(false); return; }
    const { error: memErr } = await supabase.from("org_members").insert({
      org_id: org.id, user_id: userId, role: "admin",
    });
    if (memErr) { setError("Account created but org link failed. Sign in and retry."); setLoading(false); return; }
    setLoading(false);
    router.replace("/(app)");
  }

  async function submit() {
    if (step === 1) {
      if (!form.email || !form.password || !form.displayName) { setError("Please fill in all fields."); return; }
      setError(""); setStep(2); return;
    }
    if (!form.orgName.trim()) { setError("Please enter a team/org name."); return; }
    setLoading(true); setError("");
    const { data, error: e } = await supabase.auth.signUp({
      email: form.email, password: form.password,
      options: { data: { display_name: form.displayName } },
    });
    if (e || !data.user) { setError(e?.message ?? "Signup failed"); setLoading(false); return; }

    if (!data.session) {
      // Email confirmation required — stash org details, show "check email" screen
      await AsyncStorage.setItem("pendingOrg", JSON.stringify({
        name: form.orgName.trim(), teamNumber: form.teamNumber || null, userId: data.user.id,
      }));
      setLoading(false); setStep(3); return;
    }

    await createOrg(data.user.id);
  }

  // Step 3 = check your email screen
  if (step === 3) {
    return (
      <ScrollView style={styles.root} contentContainerStyle={styles.content}>
        <View style={styles.logoWrap}>
          <Text style={styles.logo}>COOL<Text style={{ color: C.accent }}>FTC</Text></Text>
        </View>
        <Card>
          <Text style={[styles.title, { fontSize: 18 }]}>CHECK YOUR EMAIL</Text>
          <Text style={{ color: C.text2, fontSize: 14, lineHeight: 22, marginBottom: 16 }}>
            We sent a confirmation link to{"\n"}
            <Text style={{ color: C.text, fontWeight: "700" }}>{form.email}</Text>{"\n\n"}
            Open the link, then come back and sign in. Your organization will be created automatically on first login.
          </Text>
          <Btn label="Go to Sign In" onPress={() => router.replace("/(auth)/login")} />
        </Card>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.logoWrap}>
        <Text style={styles.logo}>COOL<Text style={{ color: C.accent }}>FTC</Text></Text>
        <Text style={styles.logoSub}>Create your scouting team</Text>
      </View>
      <View style={styles.steps}>
        {[1,2].map(s => (
          <View key={s} style={[styles.pip, s <= step && styles.pipActive]} />
        ))}
      </View>
      <Card>
        <Text style={styles.title}>{step === 1 ? "YOUR ACCOUNT" : "YOUR TEAM"}</Text>
        {step === 1 ? (<>
          <Label text="DISPLAY NAME" /><Input value={form.displayName} onChangeText={v=>upd("displayName",v)} placeholder="Your name" />
          <View style={{height:12}} />
          <Label text="EMAIL" /><Input value={form.email} onChangeText={v=>upd("email",v)} placeholder="you@school.edu" keyboardType="email-address" autoCapitalize="none" />
          <View style={{height:12}} />
          <Label text="PASSWORD" /><Input value={form.password} onChangeText={v=>upd("password",v)} placeholder="Min 8 characters" secureTextEntry />
        </>) : (<>
          <Label text="TEAM / ORG NAME" /><Input value={form.orgName} onChangeText={v=>upd("orgName",v)} placeholder="Cool Name Pending" />
          <View style={{height:12}} />
          <Label text="FTC TEAM NUMBER (OPTIONAL)" /><Input value={form.teamNumber} onChangeText={v=>upd("teamNumber",v)} placeholder="30439" keyboardType="numeric" />
        </>)}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <View style={{height:16}} />
        <Btn label={step===1?"Next: Team Setup →":loading?"Creating…":"Create Team →"} onPress={submit} loading={loading} />
      </Card>
      <Link href="/(auth)/login" asChild>
        <TouchableOpacity style={styles.switchLink}>
          <Text style={styles.switchText}>Have an account? <Text style={{ color: C.accent }}>Sign in</Text></Text>
        </TouchableOpacity>
      </Link>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  content: { padding: 24, paddingTop: 70, gap: 16 },
  logoWrap: { alignItems: "center", marginBottom: 8 },
  logo: { fontSize: 48, fontWeight: "900", color: C.text, letterSpacing: 2 },
  logoSub: { color: C.text2, fontSize: 12, marginTop: 4 },
  steps: { flexDirection: "row", gap: 8, paddingHorizontal: 8 },
  pip: { flex: 1, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.1)" },
  pipActive: { backgroundColor: C.accent },
  title: { fontSize: 24, fontWeight: "900", color: C.text, letterSpacing: 2, marginBottom: 20 },
  error: { color: C.red, fontSize: 12, marginTop: 8 },
  switchLink: { alignItems: "center", paddingVertical: 8 },
  switchText: { color: C.text2, fontSize: 14 },
});
