/**
 * Analytics — Performance analysis powered by FTCScout + your scouting data
 * Teams must be explicitly imported/searched — no fabricated data
 */
import { useState, useEffect, useMemo } from "react";
import {
  View, Text, ScrollView, TouchableOpacity,
  ActivityIndicator, TextInput, StyleSheet,
} from "react-native";
import { supabase } from "../../lib/supabase";
import { C } from "../../lib/theme";
import { Card, Input, Btn, SectionHeader, StatGrid } from "../../components/ui";
import {
  searchTeams, getTeamStats, getTeamEvents,
  CURRENT_SEASON, type FTCTeam, type FTCTeamStats, type FTCEventResult,
} from "../../lib/ftcscout";

type Tab = "search" | "compare" | "scouted";

// ── Scouted match data from Supabase ────────────────────────────────────────
type MatchEntry = {
  match_number: number; auto_score: number;
  teleop_score: number; endgame_score: number; total_score: number;
};

export default function AnalyticsScreen() {
  const [tab,    setTab]    = useState<Tab>("search");
  const [orgId,  setOrgId]  = useState("");

  // Search tab
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<FTCTeam[]>([]);
  const [searching, setSearching] = useState(false);
  const [focusTeam, setFocusTeam]  = useState<FTCTeamStats | null>(null);
  const [focusEvents, setFocusEvents] = useState<FTCEventResult[]>([]);
  const [loadingTeam, setLoadingTeam] = useState(false);

  // Compare tab — up to 4 teams
  const [compareInputs, setCompareInputs] = useState(["", "", "", ""]);
  const [compareTeams, setCompareTeams]   = useState<(FTCTeamStats | null)[]>([null, null, null, null]);
  const [loadingCompare, setLoadingCompare] = useState(false);

  // Scouted tab
  const [eventKey, setEventKey]   = useState("");
  const [scoutTeam, setScoutTeam] = useState("");
  const [entries, setEntries]     = useState<MatchEntry[]>([]);
  const [loadingScout, setLoadingScout] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data: m } = await supabase.from("org_members").select("org_id").eq("user_id", user.id).maybeSingle();
      if (m) setOrgId(m.org_id);
    });
  }, []);

  // ── Search tab ─────────────────────────────────────────────────────────────
  async function doSearch() {
    if (!searchQuery.trim()) return;
    setSearching(true); setSearchResults([]); setFocusTeam(null); setFocusEvents([]);
    const r = await searchTeams(searchQuery.trim());
    setSearchResults(r); setSearching(false);
  }

  async function loadTeam(num: number) {
    setLoadingTeam(true); setFocusTeam(null); setFocusEvents([]);
    try {
      const [stats, events] = await Promise.all([
        getTeamStats(num, CURRENT_SEASON),
        getTeamEvents(num, CURRENT_SEASON),
      ]);
      setFocusTeam(stats); setFocusEvents(events);
    } catch {} finally { setLoadingTeam(false); }
  }

  // ── Compare tab ─────────────────────────────────────────────────────────────
  async function runCompare() {
    setLoadingCompare(true);
    try {
      const nums = compareInputs.map(s => parseInt(s)).filter(n => !isNaN(n) && n > 0);
      if (nums.length === 0) return;
      const results = await Promise.all(nums.map(n => getTeamStats(n, CURRENT_SEASON)));
      const padded: (FTCTeamStats | null)[] = [...results];
      while (padded.length < 4) padded.push(null);
      setCompareTeams(padded);
    } catch {} finally { setLoadingCompare(false); }
  }

  // ── Scouted tab ─────────────────────────────────────────────────────────────
  async function loadScoutData() {
    if (!orgId || !scoutTeam || !eventKey) return;
    setLoadingScout(true);
    try {
      const { data } = await supabase
        .from("match_scouting")
        .select("match_number,auto_score,teleop_score,endgame_score,total_score")
        .eq("org_id", orgId).eq("event_key", eventKey).eq("team_number", scoutTeam)
        .order("match_number");
      setEntries((data ?? []) as MatchEntry[]);
    } catch {} finally { setLoadingScout(false); }
  }

  const avg = (arr: number[]) =>
    arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1) : "—";

  const TABS: { id: Tab; label: string }[] = [
    { id: "search",  label: "SEARCH" },
    { id: "compare", label: "COMPARE" },
    { id: "scouted", label: "MY DATA" },
  ];

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }}
      contentContainerStyle={{ padding: 20, paddingTop: 60, paddingBottom: 48, gap: 14 }}>

      <Text style={{ color: C.accent, fontSize: 10, letterSpacing: 3 }}>ANALYTICS</Text>
      <Text style={{ color: C.text, fontSize: 28, fontWeight: "900", letterSpacing: 2, marginBottom: 4 }}>
        PERFORMANCE HUB
      </Text>

      {/* Tab bar */}
      <View style={{ flexDirection: "row", borderBottomWidth: 1, borderColor: C.border, marginBottom: 4 }}>
        {TABS.map(t => (
          <TouchableOpacity key={t.id} onPress={() => setTab(t.id)}
            style={{ flex: 1, alignItems: "center", paddingVertical: 12,
              borderBottomWidth: 2, borderBottomColor: tab === t.id ? C.accent : "transparent" }}>
            <Text style={{ color: tab === t.id ? C.accent : C.text2, fontSize: 10, letterSpacing: 1, fontWeight: "700" }}>
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── SEARCH TAB ─────────────────────────────────────────────────────── */}
      {tab === "search" && (
        <>
          <Card>
            <SectionHeader label="TEAM LOOKUP  ·  POWERED BY FTCSCOUT" />
            <Text style={{ color: C.text2, fontSize: 11, marginBottom: 10 }}>
              Search any FTC team by number or name. Stats reflect the {CURRENT_SEASON}–{CURRENT_SEASON+1} season.
            </Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Input value={searchQuery} onChangeText={setSearchQuery}
                  placeholder="Team # or name…" onSubmitEditing={doSearch} returnKeyType="search" />
              </View>
              <Btn label={searching ? "…" : "Search"} onPress={doSearch}
                style={{ alignSelf: "flex-end", paddingHorizontal: 14 }} />
            </View>
            {searching && <ActivityIndicator color={C.accent} style={{ marginTop: 12 }} />}
            {searchResults.map(t => (
              <TouchableOpacity key={t.number} onPress={() => loadTeam(t.number)}
                style={{ flexDirection: "row", alignItems: "center", gap: 10,
                  backgroundColor: focusTeam?.number === t.number ? C.accentDim : C.surface2,
                  borderRadius: 8, padding: 10, marginTop: 6,
                  borderWidth: 1, borderColor: focusTeam?.number === t.number ? C.accent : "transparent" }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: C.text, fontSize: 14, fontWeight: "700" }}>#{t.number} {t.name}</Text>
                  {t.location && (
                    <Text style={{ color: C.text2, fontSize: 11 }}>
                      {[t.location.city, t.location.state].filter(Boolean).join(", ")}
                    </Text>
                  )}
                </View>
                <Text style={{ color: C.accent, fontSize: 13 }}>›</Text>
              </TouchableOpacity>
            ))}
          </Card>

          {loadingTeam && <ActivityIndicator color={C.accent} style={{ marginVertical: 8 }} />}

          {focusTeam && !loadingTeam && (
            <>
              <Card>
                <Text style={{ color: C.text, fontSize: 20, fontWeight: "900" }}>
                  #{focusTeam.number}  {focusTeam.name}
                </Text>
                {focusTeam.schoolName && (
                  <Text style={{ color: C.text2, fontSize: 12, marginTop: 2 }}>{focusTeam.schoolName}</Text>
                )}
                {focusTeam.location && (
                  <Text style={{ color: C.text3, fontSize: 11, marginTop: 2 }}>
                    {[focusTeam.location.city, focusTeam.location.state, focusTeam.location.country].filter(Boolean).join(", ")}
                  </Text>
                )}
                {focusTeam.quickStats ? (
                  <View style={{ flexDirection: "row", gap: 6, marginTop: 14 }}>
                    {[
                      ["OPR TOTAL",   focusTeam.quickStats.tot],
                      ["AUTO",        focusTeam.quickStats.auto],
                      ["TELEOP",      focusTeam.quickStats.dc],
                      ["ENDGAME",     focusTeam.quickStats.eg],
                    ].map(([label, stat]) => {
                      const s = stat as { value: number; rank: number } | null;
                      return (
                        <View key={label as string} style={{ flex:1, backgroundColor:C.surface2, borderRadius:8, padding:8, alignItems:"center" }}>
                          <Text style={{ color:C.accent, fontSize:16, fontWeight:"900" }}>
                            {s?.value != null ? s.value.toFixed(1) : "—"}
                          </Text>
                          <Text style={{ color:C.text3, fontSize:8, letterSpacing:1, marginTop:2 }}>{label as string}</Text>
                          {s?.rank ? <Text style={{ color:C.text2, fontSize:9 }}>#{s.rank} global</Text> : null}
                        </View>
                      );
                    })}
                  </View>
                ) : (
                  <Text style={{ color:C.text2, fontSize:12, marginTop:10 }}>
                    No season stats available for {CURRENT_SEASON}–{CURRENT_SEASON+1} yet.
                  </Text>
                )}
              </Card>

              {focusEvents.length > 0 && (
                <Card>
                  <SectionHeader label={`EVENT HISTORY · ${CURRENT_SEASON}–${CURRENT_SEASON+1}`} />
                  {focusEvents.map((ev, i) => (
                    <View key={i} style={{ paddingVertical: 10, borderBottomWidth: 1, borderColor: C.border }}>
                      <View style={{ flexDirection: "row", alignItems: "center" }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: C.text, fontSize: 13, fontWeight: "700" }}>{ev.event.name}</Text>
                          <Text style={{ color: C.text2, fontSize: 10, marginTop: 2 }}>{ev.event.start?.slice(0,10)}</Text>
                        </View>
                        <View style={{ alignItems: "flex-end" }}>
                          {ev.stats?.rank && (
                            <Text style={{ color: C.accent, fontSize: 14, fontWeight: "900" }}>#{ev.stats.rank}</Text>
                          )}
                          <Text style={{ color: C.green, fontSize: 11 }}>
                            {ev.wins}W–{ev.losses}L{ev.ties > 0 ? `–${ev.ties}T` : ""}
                          </Text>
                        </View>
                      </View>
                      {ev.stats?.opr?.value != null && (
                        <Text style={{ color: C.text2, fontSize: 10, marginTop: 4 }}>
                          OPR: {ev.stats.opr.value.toFixed(2)}
                        </Text>
                      )}
                    </View>
                  ))}
                </Card>
              )}
            </>
          )}
        </>
      )}

      {/* ── COMPARE TAB ─────────────────────────────────────────────────────── */}
      {tab === "compare" && (
        <>
          <Card>
            <SectionHeader label="SIDE-BY-SIDE COMPARISON" />
            <Text style={{ color: C.text2, fontSize: 11, marginBottom: 12 }}>
              Enter up to 4 team numbers. Stats from FTCScout — no fabricated data.
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
              {compareInputs.map((v, i) => (
                <View key={i} style={{ width: "48%" }}>
                  <Text style={{ color: C.text2, fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>
                    TEAM {i + 1}
                  </Text>
                  <Input
                    value={v}
                    onChangeText={t => setCompareInputs(ci => ci.map((x, j) => j === i ? t : x))}
                    placeholder="Team #"
                    keyboardType="numeric"
                  />
                </View>
              ))}
            </View>
            <Btn label={loadingCompare ? "Loading…" : "Compare Teams →"} onPress={runCompare} loading={loadingCompare} />
          </Card>

          {compareTeams.some(t => t !== null) && (
            <Card>
              <SectionHeader label="COMPARISON RESULTS" />
              {/* Header row */}
              <View style={{ flexDirection: "row", gap: 4, marginBottom: 8 }}>
                <View style={{ width: 72 }} />
                {compareTeams.filter(t => t !== null).map(t => (
                  <Text key={t!.number} style={{ flex: 1, color: C.accent, fontSize: 11, fontWeight: "700", textAlign: "center" }}>
                    #{t!.number}
                  </Text>
                ))}
              </View>
              {/* Stat rows */}
              {(["tot", "auto", "dc", "eg"] as const).map(key => {
                const labels: Record<string, string> = { tot: "TOTAL OPR", auto: "AUTO", dc: "TELEOP", eg: "ENDGAME" };
                const vals = compareTeams.filter(t => t !== null).map(t => t!.quickStats?.[key]?.value ?? null);
                const maxVal = Math.max(...vals.filter(v => v !== null) as number[]);
                return (
                  <View key={key} style={{ flexDirection: "row", gap: 4, marginBottom: 8 }}>
                    <Text style={{ width: 72, color: C.text2, fontSize: 9, letterSpacing: 0.5, alignSelf: "center" }}>
                      {labels[key]}
                    </Text>
                    {compareTeams.filter(t => t !== null).map(t => {
                      const val = t!.quickStats?.[key]?.value ?? null;
                      const isBest = val !== null && val === maxVal;
                      return (
                        <View key={t!.number} style={{ flex: 1, alignItems: "center" }}>
                          <Text style={{ color: isBest ? C.green : C.text, fontSize: 15, fontWeight: "900" }}>
                            {val !== null ? val.toFixed(1) : "—"}
                          </Text>
                          {t!.quickStats?.[key]?.rank && (
                            <Text style={{ color: C.text3, fontSize: 8 }}>#{t!.quickStats![key]!.rank}</Text>
                          )}
                        </View>
                      );
                    })}
                  </View>
                );
              })}
              <Text style={{ color: C.text3, fontSize: 9, marginTop: 6 }}>● = best in comparison</Text>
            </Card>
          )}
        </>
      )}

      {/* ── SCOUTED (MY DATA) TAB ─────────────────────────────────────────── */}
      {tab === "scouted" && (
        <>
          <Card>
            <SectionHeader label="YOUR SCOUTED DATA" />
            <Text style={{ color: C.text2, fontSize: 11, marginBottom: 10 }}>
              View match data entered by your team's scouts.
            </Text>
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 10 }}>
              <View style={{ flex: 2 }}>
                <Input value={eventKey} onChangeText={setEventKey} placeholder="Event key (e.g. 2025-TXHOU)" />
              </View>
              <View style={{ flex: 1 }}>
                <Input value={scoutTeam} onChangeText={setScoutTeam} placeholder="Team #" keyboardType="numeric" />
              </View>
            </View>
            <Btn label={loadingScout ? "Loading…" : "Load Data →"} onPress={loadScoutData} loading={loadingScout} />
          </Card>

          {entries.length > 0 && (
            <Card>
              <SectionHeader label={`TEAM ${scoutTeam} · ${entries.length} MATCHES SCOUTED`} />
              <StatGrid items={[
                { label: "AVG AUTO",    value: avg(entries.map(e => e.auto_score)) },
                { label: "AVG TELEOP",  value: avg(entries.map(e => e.teleop_score)) },
                { label: "AVG ENDGAME", value: avg(entries.map(e => e.endgame_score)) },
                { label: "HIGH SCORE",  value: String(Math.max(...entries.map(e => e.total_score))) },
                { label: "LOW SCORE",   value: String(Math.min(...entries.map(e => e.total_score))) },
                { label: "MATCHES",     value: String(entries.length) },
              ]} />

              {/* Score bars */}
              <View style={{ marginTop: 16, gap: 6 }}>
                {entries.map((e, i) => {
                  const mx = Math.max(...entries.map(x => x.total_score), 1);
                  return (
                    <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <Text style={{ color: C.accent, fontSize: 11, fontWeight: "700", width: 32 }}>Q{e.match_number}</Text>
                      <View style={{ flex: 1, height: 12, flexDirection: "row", backgroundColor: C.surface2, borderRadius: 4, overflow: "hidden" }}>
                        <View style={{ width: `${(e.auto_score / mx) * 100}%`, backgroundColor: "#5B9CF4" }} />
                        <View style={{ width: `${(e.teleop_score / mx) * 100}%`, backgroundColor: "#2DD88A" }} />
                        <View style={{ width: `${(e.endgame_score / mx) * 100}%`, backgroundColor: C.accent }} />
                      </View>
                      <Text style={{ color: C.text, fontSize: 12, fontWeight: "700", width: 30, textAlign: "right" }}>
                        {e.total_score}
                      </Text>
                    </View>
                  );
                })}
              </View>
              <View style={{ flexDirection: "row", gap: 14, marginTop: 10 }}>
                {[["Auto", "#5B9CF4"], ["Teleop", "#2DD88A"], ["Endgame", C.accent]].map(([l, col]) => (
                  <View key={l} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: col }} />
                    <Text style={{ color: C.text2, fontSize: 10 }}>{l}</Text>
                  </View>
                ))}
              </View>
            </Card>
          )}

          {!loadingScout && entries.length === 0 && eventKey && scoutTeam && (
            <Card>
              <Text style={{ color: C.text2, fontSize: 13, textAlign: "center", paddingVertical: 16 }}>
                No scouting entries found for Team {scoutTeam} at {eventKey}.{"\n"}
                <Text style={{ fontSize: 11, color: C.text3 }}>
                  Scout some matches first, or check the event key.
                </Text>
              </Text>
            </Card>
          )}
        </>
      )}
    </ScrollView>
  );
}
