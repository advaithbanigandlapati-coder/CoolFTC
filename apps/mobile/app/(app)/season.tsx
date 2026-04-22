/**
 * Season Hub — CoolFTC
 * Live data from FTCscout. No hardcoded fabricated values.
 */

import { useState, useEffect, useCallback } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, Image,
  ActivityIndicator, StyleSheet,
} from "react-native";
import { supabase } from "../../lib/supabase";
import { C } from "../../lib/theme";
import { Card, Input, Btn, SectionHeader } from "../../components/ui";
import {
  searchTeamsSmart, getTeamDetail, FTCTeam, FTCTeamDetail, teamLocation, record,
} from "../../lib/ftcscout";

type Watchlist = { team_number: string; reason: string | null };

export default function SeasonScreen() {
  const [orgId,     setOrgId]     = useState("");
  const [userId,    setUserId]    = useState("");
  const [watchlist, setWatchlist] = useState<Watchlist[]>([]);

  const [query,       setQuery]       = useState("");
  const [results,     setResults]     = useState<FTCTeam[]>([]);
  const [srchLoading, setSrchLoading] = useState(false);
  const [srchErr,     setSrchErr]     = useState("");

  const [expanded,      setExpanded]      = useState<FTCTeamDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [expandedNum,   setExpandedNum]   = useState<number | null>(null);

  const [pendingTeam, setPendingTeam] = useState<FTCTeam | null>(null);
  const [reason,      setReason]      = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      setUserId(user.id);
      const { data: m } = await supabase.from("org_members").select("org_id").eq("user_id", user.id).maybeSingle();
      if (!m) return;
      setOrgId(m.org_id);
      const { data: wl } = await supabase.from("watchlist").select("team_number,reason").eq("org_id", m.org_id);
      setWatchlist((wl ?? []) as Watchlist[]);
    });
  }, []);

  const doSearch = useCallback(async () => {
    if (!query.trim()) return;
    setSrchLoading(true); setSrchErr(""); setResults([]);
    setExpanded(null); setExpandedNum(null); setPendingTeam(null);
    try {
      const r = await searchTeamsSmart(query.trim());
      setResults(r);
      if (r.length === 0) setSrchErr("No teams found — try a different name or number.");
    } catch {
      setSrchErr("FTCscout unavailable. Check your connection.");
    } finally {
      setSrchLoading(false);
    }
  }, [query]);

  const openDetail = useCallback(async (t: FTCTeam) => {
    if (expandedNum === t.number) { setExpandedNum(null); setExpanded(null); return; }
    setExpandedNum(t.number); setExpanded(null); setDetailLoading(true);
    try {
      const d = await getTeamDetail(t.number);
      setExpanded(d);
    } finally {
      setDetailLoading(false);
    }
  }, [expandedNum]);

  const addToWatchlist = useCallback(async (t: FTCTeam) => {
    if (!orgId) return;
    await supabase.from("watchlist").upsert({
      org_id: orgId, team_number: String(t.number),
      added_by: userId, reason: reason || null,
    });
    const { data: wl } = await supabase.from("watchlist").select("team_number,reason").eq("org_id", orgId);
    setWatchlist((wl ?? []) as Watchlist[]);
    setPendingTeam(null); setReason("");
  }, [orgId, userId, reason]);

  const removeWatch = useCallback(async (teamNum: string) => {
    await supabase.from("watchlist").delete().eq("org_id", orgId).eq("team_number", teamNum);
    setWatchlist(x => x.filter(y => y.team_number !== teamNum));
  }, [orgId]);

  const inWatchlist = (num: number) => watchlist.some(w => w.team_number === String(num));

  return (
    <ScrollView style={s.root} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      <Text style={s.eyebrow}>SEASON HUB</Text>
      <Text style={s.title}>DECODE 25–26</Text>

      {/* ── Actual Field Image ───────────────────────────────── */}
      <View style={s.fieldWrap}>
        <Image source={require("../../assets/field.jpg")} style={s.fieldImg} resizeMode="contain" />
        <View style={s.fieldBadge}>
          <Text style={s.fieldBadgeText}>FTC FIELD · TOP DOWN</Text>
        </View>
      </View>

      {/* ── FTCscout Team Search ─────────────────────────────── */}
      <Card>
        <SectionHeader label="FIND A TEAM" />
        <Text style={s.hint}>Search by number or name — live from FTCscout</Text>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
          <View style={{ flex: 1 }}>
            <Input value={query} onChangeText={setQuery} placeholder="30439 or team name…" />
          </View>
          <Btn label={srchLoading ? "…" : "Search"} onPress={doSearch} style={{ alignSelf: "flex-end" }} />
        </View>
        {srchErr ? <Text style={s.errText}>{srchErr}</Text> : null}
        {srchLoading && <ActivityIndicator color={C.accent} style={{ marginTop: 12 }} />}

        {results.slice(0, 8).map(t => (
          <View key={t.number}>
            <TouchableOpacity
              onPress={() => openDetail(t)}
              style={[s.resultRow, expandedNum === t.number && { borderColor: C.accent }]}
            >
              <View style={{ flex: 1 }}>
                <Text style={s.tNum}>#{t.number}</Text>
                <Text style={s.tName}>{t.name}</Text>
                <Text style={s.tLoc}>{teamLocation(t) || "—"}</Text>
              </View>
              {inWatchlist(t.number) ? (
                <Text style={{ color: C.green, fontSize: 10, letterSpacing: 1 }}>WATCHING</Text>
              ) : (
                <TouchableOpacity
                  onPress={() => { setPendingTeam(t); setReason(""); }}
                  style={s.addBtn}
                >
                  <Text style={{ color: C.accent, fontSize: 11, fontWeight: "700" }}>+ WATCH</Text>
                </TouchableOpacity>
              )}
            </TouchableOpacity>

            {pendingTeam?.number === t.number && (
              <View style={s.reasonBox}>
                <Input value={reason} onChangeText={setReason} placeholder="Note (optional)" />
                <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
                  <Btn label="Add to Watchlist" onPress={() => addToWatchlist(t)} style={{ flex: 1 }} />
                  <Btn label="Cancel" onPress={() => setPendingTeam(null)} variant="ghost" style={{ flex: 1 }} />
                </View>
              </View>
            )}

            {expandedNum === t.number && (
              <View style={s.detailBox}>
                {detailLoading ? (
                  <ActivityIndicator color={C.accent} />
                ) : expanded ? (
                  <>
                    {expanded.schoolName ? <Text style={s.dRow}>🏫 {expanded.schoolName}</Text> : null}
                    <Text style={s.dRow}>📍 {teamLocation(expanded) || "Unknown"}</Text>
                    {expanded.events.length > 0 ? (
                      <>
                        <Text style={[s.hint, { marginTop: 10, marginBottom: 6 }]}>SEASON EVENTS</Text>
                        {expanded.events.map(ev => (
                          <View key={ev.event.code} style={s.evRow}>
                            <View style={{ flex: 1 }}>
                              <Text style={s.evName}>{ev.event.name}</Text>
                              <Text style={s.evCode}>{ev.event.code}</Text>
                            </View>
                            <View style={{ alignItems: "flex-end" }}>
                              {ev.ranking
                                ? <><Text style={s.rnk}>#{ev.ranking.rank}</Text><Text style={s.rec}>{record(ev.ranking)}</Text></>
                                : <Text style={s.rec}>Upcoming</Text>}
                            </View>
                          </View>
                        ))}
                      </>
                    ) : (
                      <Text style={s.hint}>No events this season yet.</Text>
                    )}
                  </>
                ) : null}
              </View>
            )}
          </View>
        ))}
      </Card>

      {/* ── Watchlist ────────────────────────────────────────── */}
      <Card>
        <SectionHeader label="WATCHLIST" />
        {watchlist.length === 0
          ? <Text style={s.hint}>No teams on watchlist. Search above and press + WATCH.</Text>
          : watchlist.map(w => (
            <View key={w.team_number} style={s.watchRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.tNum}>#{w.team_number}</Text>
                {w.reason ? <Text style={s.tLoc}>{w.reason}</Text> : null}
              </View>
              <TouchableOpacity onPress={() => removeWatch(w.team_number)}>
                <Text style={{ color: C.text2, fontSize: 16, paddingHorizontal: 6 }}>✕</Text>
              </TouchableOpacity>
            </View>
          ))
        }
      </Card>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  content: { padding: 20, paddingTop: 60, gap: 12, paddingBottom: 40 },
  eyebrow: { color: C.accent, fontSize: 10, letterSpacing: 3 },
  title: { color: C.text, fontSize: 34, fontWeight: "900", letterSpacing: 2, marginBottom: 4 },
  hint: { color: C.text2, fontSize: 11 },
  errText: { color: C.red, fontSize: 12, marginTop: 8 },

  fieldWrap: { borderRadius: 10, overflow: "hidden", borderWidth: 1, borderColor: C.border, backgroundColor: C.surface },
  fieldImg: { width: "100%", aspectRatio: 1 },
  fieldBadge: { position: "absolute", bottom: 8, left: 0, right: 0, alignItems: "center" },
  fieldBadgeText: {
    color: "rgba(255,255,255,0.5)", fontSize: 9, letterSpacing: 2,
    backgroundColor: "rgba(0,0,0,0.6)", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4,
  },

  resultRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: C.surface2, borderRadius: 8, padding: 12, marginTop: 8,
    borderWidth: 1, borderColor: C.border,
  },
  tNum: { color: C.accent, fontSize: 13, fontWeight: "900" },
  tName: { color: C.text, fontSize: 13, fontWeight: "600", marginTop: 1 },
  tLoc: { color: C.text2, fontSize: 11, marginTop: 2 },
  addBtn: {
    backgroundColor: C.accentDim, borderRadius: 6,
    paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: C.accent + "40",
  },

  reasonBox: {
    backgroundColor: C.bg3, borderRadius: 8, padding: 12,
    marginTop: 4, borderWidth: 1, borderColor: C.border,
  },
  detailBox: {
    backgroundColor: C.bg2, borderRadius: 8, padding: 12,
    marginTop: 4, borderWidth: 1, borderColor: C.border,
  },
  dRow: { color: C.text2, fontSize: 12, marginBottom: 4 },
  evRow: { flexDirection: "row", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.border },
  evName: { color: C.text, fontSize: 12, fontWeight: "600" },
  evCode: { color: C.text2, fontSize: 10, marginTop: 1 },
  rnk: { color: C.accent, fontSize: 13, fontWeight: "900" },
  rec: { color: C.text2, fontSize: 10, marginTop: 2 },

  watchRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: C.surface2, borderRadius: 8, padding: 12,
    marginBottom: 6, borderWidth: 1, borderColor: C.border,
  },
});
