import { useState, useEffect } from "react";
import { View, Text, ScrollView, StyleSheet, Alert, ActivityIndicator } from "react-native";
import { supabase } from "../../lib/supabase";
import { C } from "../../lib/theme";
import { Card, Input, Btn, SectionHeader } from "../../components/ui";
import { getTeamStats, CURRENT_SEASON } from "../../lib/ftcscout";

/** Box-Muller normal sample */
function randn(mean: number, std: number) {
  const u = Math.max(1e-10, Math.random()), v = Math.random();
  return mean + std * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

async function fetchOPRs(teams: string[]): Promise<{ oprs: Record<string, number>; missing: string[] }> {
  const oprs: Record<string, number> = {};
  const missing: string[] = [];
  await Promise.all(teams.map(async t => {
    const stats = await getTeamStats(parseInt(t), CURRENT_SEASON).catch(() => null);
    const val = stats?.quickStats?.tot?.value ?? null;
    if (val !== null) oprs[t] = val;
    else { oprs[t] = 0; missing.push(t); }
  }));
  return { oprs, missing };
}

function simulate(redOprs: number[], blueOprs: number[], iters = 3000) {
  const NOISE = 8;
  let rw = 0, bw = 0, ties = 0;
  const rs: number[] = [], bs: number[] = [];
  for (let i = 0; i < iters; i++) {
    const r = Math.max(0, redOprs.reduce((a, o) => a + randn(o, NOISE), 0));
    const b = Math.max(0, blueOprs.reduce((a, o) => a + randn(o, NOISE), 0));
    rs.push(r); bs.push(b);
    if (r > b) rw++; else if (b > r) bw++; else ties++;
  }
  rs.sort((a, b) => a - b); bs.sort((a, b) => a - b);
  const stat = (scores: number[]) => {
    const n = scores.length;
    const mean = scores.reduce((a, b) => a + b, 0) / n;
    const stdDev = Math.sqrt(scores.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
    return {
      meanScore: Math.round(mean * 10) / 10,
      stdDev: Math.round(stdDev * 10) / 10,
      median: Math.round(scores[Math.floor(n * 0.5)] * 10) / 10,
      p10: Math.round(scores[Math.floor(n * 0.1)] * 10) / 10,
      p90: Math.round(scores[Math.floor(n * 0.9)] * 10) / 10,
    };
  };
  return {
    red: stat(rs), blue: stat(bs),
    redWinPct: rw / iters, blueWinPct: bw / iters, tieWinPct: ties / iters,
    rpProbs: {
      red:  { winRp: rw / iters, bonusRp_high: rs.filter(s => s >= 36).length / iters, bonusRp_high_threshold: 36 },
      blue: { winRp: bw / iters, bonusRp_high: bs.filter(s => s >= 36).length / iters, bonusRp_high_threshold: 36 },
    },
    iterations: iters,
  };
}

type MonteCarlo = {
  iterations: number;
  red:  { meanScore: number; stdDev: number; median: number; p10: number; p90: number };
  blue: { meanScore: number; stdDev: number; median: number; p10: number; p90: number };
  redWinPct: number; blueWinPct: number; tieWinPct: number;
  rpProbs: {
    red:  { winRp: number; bonusRp_high: number; bonusRp_high_threshold: number };
    blue: { winRp: number; bonusRp_high: number; bonusRp_high_threshold: number };
  };
  dataAvailable: boolean;
  teamsWithoutData: string[];
};

export default function ForgeScreen() {
  const [orgId, setOrgId] = useState("");
  const [userId, setUserId] = useState("");
  const [eventKey] = useState("2025-DECODE-TEST");
  const [red, setRed] = useState(["","",""]);
  const [blue, setBlue] = useState(["","",""]);
  const [mc, setMc] = useState<MonteCarlo|null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(async ({data:{user}}) => {
      if (!user) return;
      setUserId(user.id);
      const {data:m} = await supabase.from("org_members").select("org_id").eq("user_id",user.id).maybeSingle();
      if (m) setOrgId(m.org_id);
    });
  }, []);

  async function runMc() {
    const r = red.filter(Boolean).map(s => s.trim());
    const b = blue.filter(Boolean).map(s => s.trim());
    if (r.length < 2 || b.length < 2) { Alert.alert("Need at least 2 teams per side"); return; }
    setRunning(true); setMc(null);
    try {
      // Fetch real OPRs from FTCScout — no server needed
      const { oprs, missing } = await fetchOPRs([...r, ...b]);
      const redOprs  = r.map(t => oprs[t] ?? 0);
      const blueOprs = b.map(t => oprs[t] ?? 0);
      // Small yield so loading state renders
      await new Promise(res => setTimeout(res, 8));
      const sim = simulate(redOprs, blueOprs, 3000);
      setMc({ ...sim, dataAvailable: missing.length < r.length + b.length, teamsWithoutData: missing });
      if (orgId) {
        Promise.resolve(
          supabase.from("forge_simulations").insert({
            org_id: orgId, event_key: eventKey,
            red_alliance: r, blue_alliance: b,
            iterations: 3000, results: sim, created_by: userId,
          })
        ).catch(() => {});
      }
    } catch (e) {
      Alert.alert("Simulation failed", e instanceof Error ? e.message : String(e));
    } finally { setRunning(false); }
  }

  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.eyebrow}>THE FORGE</Text>
      <Text style={styles.title}>MONTE CARLO</Text>
      <Text style={styles.sub}>Real FTCScout data · 2,000 iterations</Text>

      <Card style={{borderTopWidth:2,borderTopColor:C.red}}>
        <SectionHeader label="RED ALLIANCE" />
        {red.map((t,i)=>(
          <View key={i} style={{marginBottom:8}}>
            <Input value={t} onChangeText={v=>{const n=[...red];n[i]=v;setRed(n);}} placeholder={`Team ${i+1}`} keyboardType="numeric" />
          </View>
        ))}
      </Card>

      <Card style={{borderTopWidth:2,borderTopColor:C.blue}}>
        <SectionHeader label="BLUE ALLIANCE" />
        {blue.map((t,i)=>(
          <View key={i} style={{marginBottom:8}}>
            <Input value={t} onChangeText={v=>{const n=[...blue];n[i]=v;setBlue(n);}} placeholder={`Team ${i+1}`} keyboardType="numeric" />
          </View>
        ))}
      </Card>

      <Btn label={running ? "Fetching FTCScout data & simulating…" : "Run Monte Carlo ⚡"} onPress={runMc} loading={running} />

      {mc && mc.teamsWithoutData.length > 0 && (
        <Card style={{borderColor: "#F59E0B40", borderWidth: 1}}>
          <Text style={{color: "#F59E0B", fontSize: 11}}>
            ⚠ No FTCScout data for: {mc.teamsWithoutData.join(", ")} — contributed 0 to simulation.
          </Text>
        </Card>
      )}

      {mc && (
        <>
          <Card>
            <SectionHeader label="RESULTS" />
            <View style={{flexDirection:"row",gap:1,backgroundColor:C.border,borderRadius:10,overflow:"hidden",marginBottom:16}}>
              {[
                {label:"RED MEAN", v: String(mc.red.meanScore), color: C.red},
                {label:"WIN PROB", v: pct(mc.redWinPct), color: C.text},
                {label:"BLUE MEAN", v: String(mc.blue.meanScore), color: C.blue},
              ].map(({label,v,color})=>(
                <View key={label} style={{flex:1,backgroundColor:C.surface,padding:12,alignItems:"center"}}>
                  <Text style={{color,fontSize:22,fontWeight:"900"}}>{v}</Text>
                  <Text style={{color:C.text2,fontSize:9,marginTop:4,letterSpacing:1}}>{label}</Text>
                </View>
              ))}
            </View>
            <View style={styles.winBar}>
              <View style={[styles.redBar, {flex: mc.redWinPct}]} />
              <View style={[{backgroundColor: C.text2}, {flex: mc.tieWinPct}]} />
              <View style={[styles.blueBar, {flex: mc.blueWinPct}]} />
            </View>
            <Text style={styles.winBarLabel}>
              {pct(mc.redWinPct)} RED · {pct(mc.blueWinPct)} BLUE{mc.tieWinPct > 0 ? ` · ${pct(mc.tieWinPct)} tie` : ""}
            </Text>
          </Card>

          <Card>
            <SectionHeader label="RED PERCENTILES" />
            <View style={{flexDirection: "row", gap: 8}}>
              <View style={{flex: 1}}><Text style={styles.percLabel}>P10</Text><Text style={styles.percVal}>{mc.red.p10}</Text></View>
              <View style={{flex: 1}}><Text style={styles.percLabel}>P50</Text><Text style={styles.percVal}>{mc.red.median}</Text></View>
              <View style={{flex: 1}}><Text style={styles.percLabel}>P90</Text><Text style={styles.percVal}>{mc.red.p90}</Text></View>
              <View style={{flex: 1}}><Text style={styles.percLabel}>σ</Text><Text style={styles.percVal}>±{mc.red.stdDev}</Text></View>
            </View>
          </Card>

          <Card>
            <SectionHeader label="BLUE PERCENTILES" />
            <View style={{flexDirection: "row", gap: 8}}>
              <View style={{flex: 1}}><Text style={styles.percLabel}>P10</Text><Text style={styles.percVal}>{mc.blue.p10}</Text></View>
              <View style={{flex: 1}}><Text style={styles.percLabel}>P50</Text><Text style={styles.percVal}>{mc.blue.median}</Text></View>
              <View style={{flex: 1}}><Text style={styles.percLabel}>P90</Text><Text style={styles.percVal}>{mc.blue.p90}</Text></View>
              <View style={{flex: 1}}><Text style={styles.percLabel}>σ</Text><Text style={styles.percVal}>±{mc.blue.stdDev}</Text></View>
            </View>
          </Card>

          <Card>
            <SectionHeader label="RP PROBABILITIES" />
            {(["red", "blue"] as const).map(color => {
              const rp = color === "red" ? mc.rpProbs.red : mc.rpProbs.blue;
              return (
                <View key={color} style={{marginBottom: 12}}>
                  <Text style={{color: color === "red" ? C.red : C.blue, fontSize: 10, letterSpacing: 2, marginBottom: 4}}>{color.toUpperCase()}</Text>
                  <View style={{flexDirection: "row", justifyContent: "space-between", marginBottom: 2}}>
                    <Text style={{color: C.text2, fontSize: 12}}>Win RP</Text>
                    <Text style={{color: C.text, fontSize: 12}}>{pct(rp.winRp)}</Text>
                  </View>
                  <View style={{flexDirection: "row", justifyContent: "space-between"}}>
                    <Text style={{color: C.text2, fontSize: 12}}>Score ≥ {rp.bonusRp_high_threshold}</Text>
                    <Text style={{color: C.text, fontSize: 12}}>{pct(rp.bonusRp_high)}</Text>
                  </View>
                </View>
              );
            })}
          </Card>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root:{flex:1,backgroundColor:C.bg},
  content:{padding:20,paddingTop:60,gap:12},
  eyebrow:{color:C.accent,fontSize:10,letterSpacing:3},
  title:{color:C.text,fontSize:34,fontWeight:"900",letterSpacing:2},
  sub:{color:C.text2,fontSize:13,marginBottom:4},
  winBar:{flexDirection:"row",height:8,borderRadius:4,overflow:"hidden",marginBottom:6},
  redBar:{backgroundColor:C.red},
  blueBar:{backgroundColor:C.blue},
  winBarLabel:{color:C.text2,fontSize:11,textAlign:"center"},
  percLabel:{color:C.text2,fontSize:9,letterSpacing:1,textAlign:"center"},
  percVal:{color:C.text,fontSize:18,fontWeight:"800",textAlign:"center",marginTop:2},
});
