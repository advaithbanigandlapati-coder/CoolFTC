/**
 * Season Hub — Clean reference + watchlist
 * All team data comes from FTCScout (live search, no fabrication)
 */
import { useState, useEffect } from "react";
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from "react-native";
import { supabase } from "../../lib/supabase";
import { C } from "../../lib/theme";
import { Card, Input, Btn, SectionHeader } from "../../components/ui";
import { searchTeams, getTeamStats, CURRENT_SEASON, type FTCTeam, type FTCTeamStats } from "../../lib/ftcscout";

type WatchEntry = { team_number: string; reason: string | null; ftc_data?: FTCTeamStats | null };

export default function SeasonScreen() {
  const [orgId, setOrgId]       = useState("");
  const [userId, setUserId]     = useState("");
  const [watchlist, setWatchlist] = useState<WatchEntry[]>([]);

  // Search state
  const [query, setQuery]         = useState("");
  const [results, setResults]     = useState<FTCTeam[]>([]);
  const [searching, setSearching] = useState(false);
  const [addReason, setAddReason] = useState("");
  const [selected, setSelected]   = useState<FTCTeam | null>(null);
  const [adding, setAdding]       = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      setUserId(user.id);
      const { data: m } = await supabase.from("org_members").select("org_id").eq("user_id", user.id).maybeSingle();
      if (!m) return;
      setOrgId(m.org_id);
      loadWatchlist(m.org_id);
    });
  }, []);

  async function loadWatchlist(oid: string) {
    const { data: wl } = await supabase.from("watchlist").select("team_number,reason").eq("org_id", oid);
    if (!wl) return;
    // Enrich with FTCScout data
    const enriched: WatchEntry[] = await Promise.all(
      (wl as { team_number: string; reason: string | null }[]).map(async w => ({
        ...w,
        ftc_data: await getTeamStats(parseInt(w.team_number)).catch(() => null),
      }))
    );
    setWatchlist(enriched);
  }

  async function doSearch() {
    if (!query.trim()) return;
    setSearching(true); setResults([]); setSelected(null);
    const r = await searchTeams(query.trim());
    setResults(r); setSearching(false);
  }

  async function addTeam() {
    if (!selected || !orgId) return;
    setAdding(true);
    await supabase.from("watchlist").upsert({
      org_id: orgId, team_number: String(selected.number),
      added_by: userId, reason: addReason.trim() || null,
    });
    await loadWatchlist(orgId);
    setSelected(null); setQuery(""); setResults([]); setAddReason(""); setAdding(false);
  }

  async function removeTeam(teamNumber: string) {
    await supabase.from("watchlist").delete().eq("org_id", orgId).eq("team_number", teamNumber);
    setWatchlist(x => x.filter(y => y.team_number !== teamNumber));
  }

  const scorePct = (val: number | undefined | null, rank: number | undefined | null) =>
    rank ? `Rank #${rank}` : val != null ? val.toFixed(1) : "—";

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.bg }}
      contentContainerStyle={{ padding: 20, paddingTop: 60, gap: 14, paddingBottom: 48 }}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={{ color: C.accent, fontSize: 10, letterSpacing: 3 }}>SEASON HUB</Text>
      <Text style={{ color: C.text, fontSize: 32, fontWeight: "900", letterSpacing: 2, marginBottom: 4 }}>
        DECODE {CURRENT_SEASON}–{String(CURRENT_SEASON + 1).slice(2)}
      </Text>

      {/* Quick reference — verified scoring info */}
      <Card>
        <SectionHeader label="SCORING REFERENCE" />
        {[
          ["Endgame — Partial", "+5 pts"],
          ["Endgame — Full Base", "+10 pts"],
          ["Endgame — Both Bonus", "+20 pts"],
          ["Movement RP", "≥ 16 teleop points"],
          ["Goal RP", "≥ 36 teleop points"],
          ["Alliance Selection", "Snake draft · Top 4 captains"],
        ].map(([k, v]) => (
          <View key={k} style={{ flexDirection: "row", gap: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.border }}>
            <Text style={{ color: C.text2, fontSize: 12, flex: 1 }}>{k}</Text>
            <Text style={{ color: C.text, fontSize: 13, fontWeight: "700" }}>{v}</Text>
          </View>
        ))}
      </Card>

      {/* FTCScout team search */}
      <Card>
        <SectionHeader label="ADD TEAM TO WATCHLIST" />
        <Text style={{ color: C.text2, fontSize: 11, marginBottom: 10 }}>
          Search by team number or name. Data pulled live from FTCScout.
        </Text>
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 10 }}>
          <View style={{ flex: 1 }}>
            <Input
              value={query}
              onChangeText={setQuery}
              placeholder="Team # or name…"
              onSubmitEditing={doSearch}
              returnKeyType="search"
            />
          </View>
          <Btn label={searching ? "…" : "Search"} onPress={doSearch} style={{ alignSelf: "flex-end", paddingHorizontal: 14 }} />
        </View>

        {searching && <ActivityIndicator color={C.accent} style={{ marginVertical: 8 }} />}

        {results.map(t => (
          <TouchableOpacity
            key={t.number}
            onPress={() => setSelected(t)}
            style={{
              flexDirection: "row", alignItems: "center", gap: 10,
              backgroundColor: selected?.number === t.number ? C.accentDim : C.surface2,
              borderRadius: 8, padding: 10, marginBottom: 6,
              borderWidth: 1, borderColor: selected?.number === t.number ? C.accent : "transparent",
            }}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ color: C.text, fontSize: 14, fontWeight: "700" }}>#{t.number} {t.name}</Text>
              {t.schoolName && <Text style={{ color: C.text2, fontSize: 11 }}>{t.schoolName}</Text>}
              {t.location && (
                <Text style={{ color: C.text3, fontSize: 10 }}>
                  {[t.location.city, t.location.state, t.location.country].filter(Boolean).join(", ")}
                </Text>
              )}
            </View>
            {selected?.number === t.number && (
              <Text style={{ color: C.accent, fontSize: 12, fontWeight: "700" }}>✓</Text>
            )}
          </TouchableOpacity>
        ))}

        {selected && (
          <View style={{ marginTop: 6, gap: 8 }}>
            <Input value={addReason} onChangeText={setAddReason} placeholder="Reason (optional): strong auto, rival team…" />
            <Btn label={adding ? "Adding…" : `Add #${selected.number} to Watchlist`} onPress={addTeam} loading={adding} />
          </View>
        )}
      </Card>

      {/* Watchlist */}
      <Card>
        <SectionHeader label={`WATCHLIST · ${watchlist.length} TEAMS`} />
        {watchlist.length === 0 && (
          <Text style={{ color: C.text2, fontSize: 12, paddingVertical: 8 }}>
            No teams tracked yet. Search above to add teams.
          </Text>
        )}
        {watchlist.map(w => (
          <View
            key={w.team_number}
            style={{ backgroundColor: C.surface2, borderRadius: 10, padding: 12, marginBottom: 8 }}
          >
            <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.text, fontSize: 15, fontWeight: "700" }}>
                  #{w.team_number}
                  {w.ftc_data?.name ? `  ${w.ftc_data.name}` : ""}
                </Text>
                {w.ftc_data?.schoolName && (
                  <Text style={{ color: C.text2, fontSize: 11, marginTop: 2 }}>{w.ftc_data.schoolName}</Text>
                )}
                {w.reason && (
                  <Text style={{ color: C.amber, fontSize: 11, marginTop: 4 }}>📌 {w.reason}</Text>
                )}
              </View>
              <TouchableOpacity onPress={() => removeTeam(w.team_number)} style={{ padding: 4 }}>
                <Text style={{ color: C.text3, fontSize: 16 }}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* FTCScout stats row */}
            {w.ftc_data?.quickStats && (
              <View style={{ flexDirection: "row", gap: 6, marginTop: 10 }}>
                {[
                  ["TOTAL",   w.ftc_data.quickStats.tot],
                  ["AUTO",    w.ftc_data.quickStats.auto],
                  ["TELEOP",  w.ftc_data.quickStats.dc],
                  ["ENDGAME", w.ftc_data.quickStats.eg],
                ].map(([label, stat]) => {
                  const s = stat as { value: number; rank: number } | null;
                  return (
                    <View key={label as string} style={{ flex: 1, backgroundColor: C.surface, borderRadius: 6, padding: 6, alignItems: "center" }}>
                      <Text style={{ color: C.accent, fontSize: 13, fontWeight: "900" }}>
                        {s?.value != null ? s.value.toFixed(1) : "—"}
                      </Text>
                      <Text style={{ color: C.text3, fontSize: 8, letterSpacing: 1, marginTop: 2 }}>{label as string}</Text>
                      {s?.rank && <Text style={{ color: C.text3, fontSize: 8 }}>#{s.rank}</Text>}
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        ))}
      </Card>
    </ScrollView>
  );
}
