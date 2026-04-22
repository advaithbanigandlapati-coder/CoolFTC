import { useState } from "react";
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from "react-native";
import { useRouter, Link } from "expo-router";
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

  function validateStep1() {
    if (!form.displayName.trim()) return "Display name is required.";
    if (!form.email.includes("@")) return "Enter a valid email.";
    if (form.password.length < 8) return "Password must be at least 8 characters.";
    return null;
  }

  async function submit() {
    if (step === 1) {
      const err = validateStep1();
      if (err) { setError(err); return; }
      setError(""); setStep(2); return;
    }
    if (!form.orgName.trim()) { setError("Team / org name is required."); return; }
    setError(""); setLoading(true);
    try {
      // 1. Create auth user
      const { data, error: signUpErr } = await supabase.auth.signUp({
        email: form.email.trim(), password: form.password,
        options: { data: { display_name: form.displayName.trim() } },
      });
      if (signUpErr || !data.user) {
        setError(signUpErr?.message ?? "Signup failed."); setLoading(false); return;
      }
      const userId = data.user.id;
      const slug = form.orgName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") + "-" + Date.now();

      // 2. Create organization
      const { data: org, error: orgErr } = await supabase.from("organizations")
        .insert({ name: form.orgName.trim(), ftc_team_number: form.teamNumber.trim() || null, slug, created_by: userId })
        .select().single();
      if (orgErr || !org) { setError(orgErr?.message ?? "Failed to create organization."); setLoading(false); return; }

      // 3. Add creator as admin (THIS WAS MISSING — fixes blank dashboard bug)
      await supabase.from("org_members").insert({ org_id: org.id, user_id: userId, role: "admin" });

      // 4. Navigate after full setup — bypass auth listener race condition
      router.replace("/(app)");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unexpected error.");
    } finally { setLoading(false); }
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.logoWrap}>
        <Text style={styles.logo}>COOL<Text style={{ color: C.accent }}>FTC</Text></Text>
        <Text style={styles.logoSub}>Create your scouting team</Text>
      </View>
      <View style={styles.steps}>
        {[1,2].map(s => (
          <View key={s} style={{ flex:1, gap:4 }}>
            <View style={[styles.pip, s <= step && styles.pipActive]} />
            <Text style={{ color: s <= step ? C.text4 : C.text3, fontSize:9, letterSpacing:1 }}>
              {s === 1 ? "ACCOUNT" : "TEAM"}
            </Text>
          </View>
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
          <Label text="TEAM / ORG NAME" />
          <Input value={form.orgName} onChangeText={v=>upd("orgName",v)} placeholder="Cool Name Pending" />
          <View style={{height:12}} />
          <Label text="FTC TEAM NUMBER (OPTIONAL)" />
          <Input value={form.teamNumber} onChangeText={v=>upd("teamNumber",v)} placeholder="30439" keyboardType="numeric" />
          <Text style={{color:C.text2,fontSize:11,marginTop:6}}>Used to pre-fill scouting forms and identify your team in FTCScout.</Text>
        </>)}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <View style={{height:16}} />
        <Btn label={step===1?"Next: Team Setup →":loading?"Creating team…":"Create Team →"} onPress={submit} loading={loading} />
        {step === 2 && (
          <TouchableOpacity onPress={() => { setError(""); setStep(1); }} style={{marginTop:12,alignItems:"center"}}>
            <Text style={{color:C.text2,fontSize:13}}>← Back</Text>
          </TouchableOpacity>
        )}
      </Card>
      <Link href="/(auth)/login" asChild>
        <TouchableOpacity style={styles.switchLink}>
          <Text style={styles.switchText}>Have an account? <Text style={{color:C.accent}}>Sign in</Text></Text>
        </TouchableOpacity>
      </Link>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root:    { flex:1, backgroundColor:C.bg },
  content: { padding:24, paddingTop:70, gap:16 },
  logoWrap:{ alignItems:"center", marginBottom:8 },
  logo:    { fontSize:48, fontWeight:"900", color:C.text, letterSpacing:2 },
  logoSub: { color:C.text2, fontSize:12, marginTop:4 },
  steps:   { flexDirection:"row", gap:8, paddingHorizontal:4, marginBottom:4 },
  pip:     { height:4, borderRadius:2, backgroundColor:"rgba(255,255,255,0.1)" },
  pipActive:{ backgroundColor:C.accent },
  title:   { fontSize:24, fontWeight:"900", color:C.text, letterSpacing:2, marginBottom:20 },
  error:   { color:C.red, fontSize:12, marginTop:8 },
  switchLink:{ alignItems:"center", paddingVertical:8 },
  switchText:{ color:C.text2, fontSize:14 },
});
