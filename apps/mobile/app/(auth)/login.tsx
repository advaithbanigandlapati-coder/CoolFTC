import { useState } from "react";
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from "react-native";
import { useRouter, Link } from "expo-router";
import { supabase } from "../../lib/supabase";
import { C } from "../../lib/theme";
import { Card, Label, Input, Btn } from "../../components/ui";

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function login() {
    setLoading(true); setError("");
    const { error: e } = await supabase.auth.signInWithPassword({ email, password });
    if (e) { setError(e.message); setLoading(false); return; }
    router.replace("/(app)");
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.logoWrap}>
        <Text style={styles.logo}>COOL<Text style={{ color: C.accent }}>FTC</Text></Text>
        <Text style={styles.logoSub}>Intelligence Platform · Team #30439</Text>
      </View>
      <Card>
        <Text style={styles.title}>SIGN IN</Text>
        <Label text="EMAIL" /><Input value={email} onChangeText={setEmail} placeholder="you@team.com" keyboardType="email-address" />
        <View style={{ height: 12 }} />
        <Label text="PASSWORD" /><Input value={password} onChangeText={setPassword} placeholder="••••••••" secureTextEntry />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <View style={{ height: 16 }} />
        <Btn label={loading ? "Signing in…" : "Sign In →"} onPress={login} loading={loading} />
      </Card>
      <Link href="/(auth)/signup" asChild>
        <TouchableOpacity style={styles.switchLink}>
          <Text style={styles.switchText}>No account? <Text style={{ color: C.accent }}>Create your team</Text></Text>
        </TouchableOpacity>
      </Link>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  content: { padding: 24, paddingTop: 80, gap: 20 },
  logoWrap: { alignItems: "center", marginBottom: 12 },
  logo: { fontSize: 52, fontWeight: "900", color: C.text, letterSpacing: 2 },
  logoSub: { color: C.text2, fontSize: 12, marginTop: 4 },
  title: { fontSize: 26, fontWeight: "900", color: C.text, letterSpacing: 2, marginBottom: 20 },
  error: { color: C.red, fontSize: 12, marginTop: 8 },
  switchLink: { alignItems: "center", paddingVertical: 8 },
  switchText: { color: C.text2, fontSize: 14 },
});
