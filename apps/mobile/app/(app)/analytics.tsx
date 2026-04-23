/**
 * Analytics Hub — CoolFTC
 *
 * OVERVIEW / TIMELINE / COMPAT  →  your org's own scouting data (Supabase)
 * EVENT RANKINGS                →  live from FTCscout (always accurate)
 */

import { useState, useEffect, useMemo } from "react";
import {
  View, Text, ScrollView, TouchableOpacity,
  ActivityIndicator, StyleSheet,
} from "react-native";
import { CartesianChart, Line } from "victory-native";
import { supabase } from "../../lib/supabase";
import { C } from "../../lib/theme";
import { Card, Input, Btn, SectionHeader, StatGrid } from "../../components/ui";
import { getEventRankings, FTCEvent, FTCEventTeam } from "../../lib/ftcscout";

// ── Types ─────────────────────────────────────────────────────────────────────

type MatchEntry = {
  match_number: number;
  auto_score: number;
  teleop_score: number;
  endgame_score: number;
  total_score: number;
};
type ScoutEntry = {
  team_number: string;
  tier: string | null;
  form_data: Record<string, unknown>;
};
type Tab = "overview" | "timeline" | "compat" | "event";

const TIER_DOT: Record<string, string> = {
  OPTIMAL: "#2DD88A", MID: "#F59E0B", BAD: "#EF4444",
};

// ── Compat scorer (unchanged — org data) ──────────────────────────────────────
function compatScore(a: ScoutEntry, b: ScoutEntry): number {
  let s = 50;
  const af = a.form_data, bf = b.form_data;
  if (af.endgamePlan !== bf.endgamePlan) s += 12;
  if (Boolean(af.autoCloseRange) !== Boolean(bf.autoCloseRange)) s += 8;
  if (Boolean(af.autoFarRange) !== Boolean(bf.autoFarRange)) s += 8;
  if (Number(af.ballCapacity ?? 1) > 3 && Number(bf.ballCapacity ?? 1) > 3) s -= 8;
  if (a.tier === "OPTIMAL" || b.tier === "OPTIMAL") s += 8;
  if (a.tier === "OPTIMAL" && b.tier === "OPTIMAL") s += 10;
  if (a.tier === "BAD" || b.tier === "BAD") s -= 15;
  return Math.max(0, Math.min(100, s));
}

const avg = (arr: number[]) =>
  arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1) : "—";

// ── Component ─────────────────────────────────────────────────────────────────
export default function AnalyticsScreen() {
  const [tab, setTab] = useState<Tab>("overview");
  const [orgId, setOrgId] = useState("");

  // ── Shared inputs ──────────────────────────────────────────────────────────
  const [eventCode, setEventCode] = useState(""); // FTCscout event code (e.g. USTXHOU)
  const [teamNum, setTeamNum] = useState("");      // team number for org data

  // ── Org scouting data (overview / timeline / compat) ──────────────────────
  const [entries, setEntries] = useState<MatchEntry[]>([]);
  const [scouts, setScouts] = useState<ScoutEntry[]>([]);
  const [orgLoading, setOrgLoading] = useState(false);

  // ── FTCscout event rankings ────────────────────────────────────────────────
  const [ftcEvent, setFtcEvent] = useState<FTCEvent | null>(null);
  const [ftcLoading, setFtcLoading] = useState(false);
  const [ftcError, setFtcError] = useState("");

  // ── Bootstrap ─────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data: m } = await supabase.from("org_members").select("org_id").eq("user_id", user.id).maybeSingle();
      if (m) setOrgId(m.org_id);
    });
  }, []);

  // ── Load org scouting data for a team ─────────────────────────────────────
  async function loadOrgData() {
    if (!orgId || !teamNum) return;
    setOrgLoading(true);
    try {
      const { data: matches } = await supabase
        .from("match_scouting")
        .select("match_number,auto_score,teleop_score,endgame_score,total_score")
        .eq("org_id", orgId)
        .eq("team_number", teamNum)
        .order("match_number");
      setEntries((matches ?? []) as MatchEntry[]);
      const { data: sc } = await supabase
        .from("scouting_entries")
        .select("team_number,tier,form_data")
        .eq("org_id", orgId);
      setScouts((sc ?? []) as ScoutEntry[]);
    } catch {
      // network error — leave existing data in place
    } finally {
      setOrgLoading(false);
    }
  }

  // ── Load FTCscout event rankings ───────────────────────────────────────────
  async function loadFTCEvent() {
    if (!eventCode.trim()) return;
    setFtcLoading(true);
    setFtcError("");
    setFtcEvent(null);
    try {
      const ev = await getEventRankings(eventCode.trim());
      if (!ev) {
        setFtcError(`Event "${eventCode.toUpperCase()}" not found. Check the code (e.g. USTXHOU).`);
      } else {
        setFtcEvent(ev);
        if (tab !== "event") setTab("event");
      }
    } catch {
      setFtcError("Could not reach FTCscout. Check your connection.");
    } finally {
      setFtcLoading(false);
    }
  }

  // ── Timeline data ──────────────────────────────────────────────────────────
  const tlData = useMemo(() =>
    entries.map((e, i) => ({
      x: e.match_number,
      rolling: Math.round(entries.slice(0, i + 1).reduce((a, b) => a + b.total_score, 0) / (i + 1) * 10) / 10,
      total: e.total_score,
    })), [entries]);

  // ── Compat matrix ──────────────────────────────────────────────────────────
  const compatTeams = scouts.slice(0, 8);
  const compatMatrix = useMemo(() =>
    compatTeams.map(a => compatTeams.map(b =>
      a.team_number === b.team_number ? 100 : compatScore(a, b)
    )), [compatTeams]);

  // ── Max score for bar normalisation ───────────────────────────────────────
  const maxTotal = entries.length ? Math.max(...entries.map(e => e.total_score)) : 1;

  const TABS: { id: Tab; label: string }[] = [
    { id: "overview", label: "OVERVIEW" },
    { id: "timeline", label: "TIMELINE" },
    { id: "compat",   label: "COMPAT"   },
    { id: "event",    label: "EVENT"    },
  ];

  return (
    <ScrollView style={s.root} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">

      <Text style={s.eyebrow}>ANALYTICS HUB</Text>
      <Text style={s.title}>PERFORMANCE</Text>

      {/* ── Controls ────────────────────────────────────────────────────── */}
      <Card>
        {/* Event code row — for EVENT tab (FTCscout) */}
        <SectionHeader label="EVENT RANKINGS (FTCSCOUT)" />
        <Text style={s.hint}>Enter the official FIRST event code (e.g. USTXHOU, CASC)</Text>
        <View style={s.row}>
          <View style={{ flex: 1 }}>
            <Input value={eventCode} onChangeText={setEventCode} placeholder="Event code…" />
          </View>
          <Btn
            label={ftcLoading ? "…" : "Load Event"}
            onPress={loadFTCEvent}
            style={{ alignSelf: "flex-end" }}
          />
        </View>
        {ftcError ? <Text style={s.errText}>{ftcError}</Text> : null}
        {ftcEvent && (
          <View style={s.eventBadge}>
            <Text style={s.eventBadgeName}>{ftcEvent.name}</Text>
            <Text style={s.eventBadgeSub}>{ftcEvent.teams.length} teams · source: FTCscout</Text>
          </View>
        )}

        {/* Team row — for OVERVIEW / TIMELINE tabs (org data) */}
        <View style={{ height: 12 }} />
        <SectionHeader label="YOUR SCOUTING DATA" />
        <Text style={s.hint}>Load your org's match entries for any team</Text>
        <View style={s.row}>
          <View style={{ flex: 1 }}>
            <Input value={teamNum} onChangeText={setTeamNum} placeholder="Team #" keyboardType="numeric" />
          </View>
          <Btn
            label={orgLoading ? "…" : "Load Team"}
            onPress={loadOrgData}
            style={{ alignSelf: "flex-end" }}
          />
        </View>
        {entries.length > 0 && (
          <Text style={[s.hint, { color: C.green, marginTop: 6 }]}>
            ✓ {entries.length} scouted matches for #{teamNum}
          </Text>
        )}
      </Card>

      {/* ── Tab bar ─────────────────────────────────────────────────────── */}
      <View style={s.tabBar}>
        {TABS.map(t => (
          <TouchableOpacity
            key={t.id}
            onPress={() => setTab(t.id)}
            style={[s.tabBtn, tab === t.id && s.tabBtnActive]}
          >
            <Text style={[s.tabLabel, tab === t.id && s.tabLabelActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {(orgLoading || ftcLoading) && (
        <ActivityIndicator color={C.accent} style={{ marginVertical: 24 }} />
      )}

      {/* ══════════════════════════════════════════════════════════════════
          OVERVIEW — org scouting data
      ══════════════════════════════════════════════════════════════════ */}
      {tab === "overview" && (
        entries.length === 0 ? (
          <Card>
            <Text style={s.emptyTitle}>No scouting data loaded</Text>
            <Text style={s.emptyBody}>
              Enter a team number above and tap "Load Team" to pull your org's match entries.
            </Text>
          </Card>
        ) : (
          <Card>
            <SectionHeader label={`TEAM ${teamNum} · ${entries.length} MATCHES`} />
            <StatGrid items={[
              { label: "AVG AUTO",    value: avg(entries.map(e => e.auto_score)) },
              { label: "AVG TELEOP",  value: avg(entries.map(e => e.teleop_score)) },
              { label: "AVG ENDGAME", value: avg(entries.map(e => e.endgame_score)) },
              { label: "HIGH SCORE",  value: String(Math.max(...entries.map(e => e.total_score))) },
              { label: "LOW SCORE",   value: String(Math.min(...entries.map(e => e.total_score))) },
              { label: "MATCHES",     value: String(entries.length) },
            ]} />

            <View style={{ marginTop: 16, gap: 6 }}>
              {entries.map((e, i) => (
                <View key={i} style={s.matchRow}>
                  <Text style={s.matchLabel}>Q{e.match_number}</Text>
                  <View style={s.barTrack}>
                    <View style={[s.barSeg, { flex: e.auto_score,    backgroundColor: "#5B9CF4" }]} />
                    <View style={[s.barSeg, { flex: e.teleop_score,  backgroundColor: "#2DD88A" }]} />
                    <View style={[s.barSeg, { flex: e.endgame_score, backgroundColor: C.accent  }]} />
                    <View style={{ flex: Math.max(0, maxTotal - e.total_score) }} />
                  </View>
                  <Text style={s.matchScore}>{e.total_score}</Text>
                </View>
              ))}
            </View>

            <View style={s.legend}>
              {[["Auto", "#5B9CF4"], ["Teleop", "#2DD88A"], ["Endgame", C.accent]].map(([l, col]) => (
                <View key={l} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: col }} />
                  <Text style={{ color: C.text2, fontSize: 10 }}>{l}</Text>
                </View>
              ))}
            </View>
          </Card>
        )
      )}

      {/* ══════════════════════════════════════════════════════════════════
          TIMELINE — score trajectory
      ══════════════════════════════════════════════════════════════════ */}
      {tab === "timeline" && (
        <Card>
          <SectionHeader label={`SCORE TRAJECTORY — TEAM ${teamNum || "?"}`} />
          {tlData.length > 1 ? (
            <>
              <View style={{ height: 200 }}>
                <CartesianChart data={tlData} xKey="x" yKeys={["rolling", "total"]}>
                  {({ points }) => (
                    <>
                      <Line points={points.total}   color={C.accent + "70"} strokeWidth={1.5} />
                      <Line points={points.rolling} color={C.accent}        strokeWidth={2.5} />
                    </>
                  )}
                </CartesianChart>
              </View>
              <View style={{ flexDirection: "row", gap: 16, marginTop: 8 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <View style={{ width: 16, height: 2, backgroundColor: C.accent }} />
                  <Text style={{ color: C.text2, fontSize: 10 }}>Rolling avg</Text>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <View style={{ width: 16, height: 2, backgroundColor: C.accent + "60" }} />
                  <Text style={{ color: C.text2, fontSize: 10 }}>Match score</Text>
                </View>
              </View>

              {/* Score distribution */}
              {(() => {
                const mn = Math.min(...entries.map(e => e.total_score));
                const mx = Math.max(...entries.map(e => e.total_score));
                const B = 6, st = Math.max(1, (mx - mn) / B);
                const ct = Array(B).fill(0) as number[];
                entries.forEach(e => ct[Math.min(B - 1, Math.floor((e.total_score - mn) / st))]++);
                const mxC = Math.max(1, ...ct);
                return (
                  <View style={{ marginTop: 16 }}>
                    <Text style={{ color: C.text2, fontSize: 9, letterSpacing: 1.5, marginBottom: 8 }}>SCORE DISTRIBUTION</Text>
                    <View style={{ flexDirection: "row", alignItems: "flex-end", height: 60, gap: 4 }}>
                      {ct.map((c, i) => (
                        <View key={i} style={{ flex: 1, alignItems: "center", gap: 2 }}>
                          <View style={{ width: "100%", backgroundColor: C.accent + "90", borderRadius: 3, height: Math.round((c / mxC) * 56) }} />
                          <Text style={{ color: C.text2, fontSize: 8 }}>{Math.round(mn + i * st)}</Text>
                        </View>
                      ))}
                    </View>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6 }}>
                      {[["Low", Math.min(...entries.map(e => e.total_score))],
                        ["Avg", Math.round(entries.reduce((a, b) => a + b.total_score, 0) / entries.length)],
                        ["High", Math.max(...entries.map(e => e.total_score))]].map(([l, v]) => (
                        <Text key={String(l)} style={{ color: C.text2, fontSize: 10 }}>
                          {String(l)}: <Text style={{ color: C.text, fontWeight: "700" }}>{v}</Text>
                        </Text>
                      ))}
                    </View>
                  </View>
                );
              })()}
            </>
          ) : (
            <View style={s.emptyWrap}>
              <Text style={s.emptyTitle}>No trajectory yet</Text>
              <Text style={s.emptyBody}>Load a team with 2+ scouted matches to see their score trajectory.</Text>
            </View>
          )}
        </Card>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          COMPAT — alliance compatibility matrix (org data)
      ══════════════════════════════════════════════════════════════════ */}
      {tab === "compat" && (
        <Card>
          <SectionHeader label="ALLIANCE COMPATIBILITY" />
          {compatTeams.length < 2 ? (
            <View style={s.emptyWrap}>
              <Text style={s.emptyTitle}>Need 2+ scouting entries</Text>
              <Text style={s.emptyBody}>
                Scout at least 2 teams in the same event to see compatibility scores.
              </Text>
            </View>
          ) : (
            <>
              <View style={{ flexDirection: "row", marginBottom: 4, paddingLeft: 56 }}>
                {compatTeams.map(t => (
                  <Text key={t.team_number} style={{ flex: 1, color: C.text2, fontSize: 8, textAlign: "center" }} numberOfLines={1}>
                    {t.team_number}
                  </Text>
                ))}
              </View>
              {compatMatrix.map((row, ri) => (
                <View key={ri} style={{ flexDirection: "row", alignItems: "center", marginBottom: 2 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4, width: 56 }}>
                    {compatTeams[ri].tier && (
                      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: TIER_DOT[compatTeams[ri].tier!] ?? C.text2 }} />
                    )}
                    <Text style={{ color: C.text2, fontSize: 9 }} numberOfLines={1}>{compatTeams[ri].team_number}</Text>
                  </View>
                  {row.map((sc, ci) => {
                    const self = ri === ci;
                    const bg = self ? "#1A1A2720" : sc >= 80 ? "#2DD88A30" : sc >= 65 ? "#F59E0B20" : sc < 40 ? "#EF444420" : "#FFFFFF08";
                    const cl = self ? "#FFFFFF10" : sc >= 80 ? "#2DD88A" : sc >= 65 ? "#F59E0B" : sc < 40 ? "#EF4444" : "#FFFFFF60";
                    return (
                      <View key={ci} style={{ flex: 1, alignItems: "center", justifyContent: "center", height: 28, backgroundColor: bg, borderRadius: 3, margin: 1 }}>
                        <Text style={{ color: cl, fontSize: 9, fontWeight: "700" }}>{self ? "—" : sc >= 80 ? "✦" : String(sc)}</Text>
                      </View>
                    );
                  })}
                </View>
              ))}
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                {[["✦ 80+ Strong", "#2DD88A"], ["65–79 Good", "#F59E0B"], ["< 50 Conflict", "#EF4444"]].map(([l, c]) => (
                  <Text key={l} style={{ color: c, fontSize: 9 }}>● {l}</Text>
                ))}
              </View>
            </>
          )}
        </Card>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          EVENT — live FTCscout rankings (100% accurate, no fabrication)
      ══════════════════════════════════════════════════════════════════ */}
      {tab === "event" && (
        !ftcEvent ? (
          <Card>
            <Text style={s.emptyTitle}>No event loaded</Text>
            <Text style={s.emptyBody}>
              Enter an event code above and tap "Load Event" to pull live rankings from FTCscout.{"\n\n"}
              You can find event codes on the FTCscout or FIRST websites. Examples: USTXHOU, CASC, USFLN.
            </Text>
          </Card>
        ) : (
          <Card>
            <SectionHeader label={ftcEvent.name.toUpperCase()} />
            <Text style={[s.hint, { marginBottom: 12 }]}>
              {ftcEvent.teams.filter(t => t.ranking).length} ranked ·{" "}
              {ftcEvent.teams.filter(t => !t.ranking).length} unranked · source: FTCscout
            </Text>

            {/* Header row */}
            <View style={s.tableHead}>
              {["RK", "TEAM", "NAME", "W-L", "RP"].map(h => (
                <Text key={h} style={[s.headCell, h === "NAME" && { flex: 2 }]}>{h}</Text>
              ))}
            </View>

            {ftcEvent.teams.map((et: FTCEventTeam) => {
              const isMe = String(et.team.number) === teamNum;
              return (
                <View
                  key={et.team.number}
                  style={[s.tableRow, isMe && { backgroundColor: C.accentDim }]}
                >
                  <Text style={[s.tableCell, { color: isMe ? C.accent : C.text2 }]}>
                    {et.ranking ? et.ranking.rank : "—"}
                  </Text>
                  <Text style={[s.tableCell, { color: isMe ? C.accent : C.text, fontWeight: "700" }]}>
                    {et.team.number}
                  </Text>
                  <Text style={[s.tableCell, { flex: 2, color: C.text2, fontSize: 11 }]} numberOfLines={1}>
                    {et.team.name}
                  </Text>
                  <Text style={s.tableCell}>
                    {et.ranking ? `${et.ranking.wins}-${et.ranking.losses}` : "—"}
                  </Text>
                  <Text style={[s.tableCell, { color: et.ranking ? C.text : C.text3 }]}>
                    {et.ranking ? et.ranking.rp.toFixed(1) : "—"}
                  </Text>
                </View>
              );
            })}
          </Card>
        )
      )}
    </ScrollView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  content: { padding: 20, paddingTop: 60, paddingBottom: 40, gap: 12 },
  eyebrow: { color: C.accent, fontSize: 10, letterSpacing: 3 },
  title: { color: C.text, fontSize: 34, fontWeight: "900", letterSpacing: 2, marginBottom: 4 },
  hint: { color: C.text2, fontSize: 11 },
  errText: { color: C.red, fontSize: 12, marginTop: 8 },
  row: { flexDirection: "row", gap: 8, marginTop: 8 },

  tabBar: {
    flexDirection: "row", borderBottomWidth: 1,
    borderColor: C.border, marginBottom: 4,
  },
  tabBtn: { flex: 1, alignItems: "center", paddingVertical: 12 },
  tabBtnActive: { borderBottomWidth: 2, borderBottomColor: C.accent },
  tabLabel: { color: C.text2, fontSize: 9, letterSpacing: 1 },
  tabLabelActive: { color: C.accent },

  eventBadge: {
    marginTop: 10, backgroundColor: C.accentDim,
    borderRadius: 8, padding: 10, borderWidth: 1, borderColor: C.accent + "30",
  },
  eventBadgeName: { color: C.accent, fontSize: 13, fontWeight: "700" },
  eventBadgeSub: { color: C.text2, fontSize: 11, marginTop: 2 },

  matchRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  matchLabel: { color: C.accent, fontSize: 11, fontWeight: "700", width: 28 },
  barTrack: {
    flex: 1, height: 12, flexDirection: "row",
    backgroundColor: C.surface3, borderRadius: 4, overflow: "hidden",
  },
  barSeg: { height: "100%" },
  matchScore: { color: C.text, fontSize: 12, fontWeight: "700", width: 30, textAlign: "right" },
  legend: { flexDirection: "row", gap: 16, marginTop: 10 },

  tableHead: {
    flexDirection: "row", backgroundColor: C.bg3,
    padding: 10, borderRadius: 8, borderWidth: 1,
    borderColor: C.border, marginBottom: 2,
  },
  headCell: { flex: 1, color: C.text2, fontSize: 9, letterSpacing: 1.5 },
  tableRow: {
    flexDirection: "row", alignItems: "center",
    padding: 10, borderBottomWidth: 1, borderBottomColor: C.border,
  },
  tableCell: { flex: 1, color: C.text, fontSize: 12 },

  emptyWrap: { paddingVertical: 16, gap: 8 },
  emptyTitle: { color: C.text, fontSize: 15, fontWeight: "700" },
  emptyBody: { color: C.text2, fontSize: 13, lineHeight: 20 },
});
