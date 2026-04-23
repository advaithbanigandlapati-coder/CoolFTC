/**
 * War Room — Alliance Selection Board
 *
 * 1. Enter your event code → Load Event from FTCscout
 * 2. Tap any alliance slot → pick from the loaded team list (filterable)
 * 3. DNP / Priority lists — add teams from the event or type manually
 * 4. Everything auto-syncs to Supabase for org-wide collaboration
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  View, Text, ScrollView, StyleSheet,
  TouchableOpacity, ActivityIndicator,
} from "react-native";
import { supabase } from "../../lib/supabase";
import { C } from "../../lib/theme";
import { Card, Input, Btn, SectionHeader, Label } from "../../components/ui";
import { getEventRankings, FTCEvent, FTCEventTeam } from "../../lib/ftcscout";

// ── Types ─────────────────────────────────────────────────────────────────────
type Alliance = { id: number; captain: string | null; first: string | null; second: string | null };
type DNPEntry = { team: string; name: string; reason: string };
type PriorityEntry = { team: string; name: string };
type BoardState = { alliances: Alliance[]; dnp: DNPEntry[]; priorities: PriorityEntry[] };

type PickerTarget =
  | { kind: "slot"; allianceId: number; field: "captain" | "first" | "second" }
  | { kind: "dnp" }
  | { kind: "priority" }
  | null;

const INIT_BOARD: BoardState = {
  alliances: [1, 2, 3, 4].map(id => ({ id, captain: null, first: null, second: null })),
  dnp: [],
  priorities: [],
};

// ── Component ─────────────────────────────────────────────────────────────────
export default function WarRoomScreen() {
  const [orgId,   setOrgId]   = useState("");
  const [userId,  setUserId]  = useState("");
  const [boardId, setBoardId] = useState<string | null>(null);
  const [board,   setBoard]   = useState<BoardState>(INIT_BOARD);
  const [syncing, setSyncing] = useState(false);

  // Event loader
  const [eventCode,   setEventCode]   = useState("");
  const [ftcEvent,    setFtcEvent]    = useState<FTCEvent | null>(null);
  const [eventLoading, setEventLoading] = useState(false);
  const [eventError,  setEventError]  = useState("");

  // Team picker
  const [picker,       setPicker]       = useState<PickerTarget>(null);
  const [pickerFilter, setPickerFilter] = useState("");
  const [manualTeam,   setManualTeam]   = useState("");
  const [manualReason, setManualReason] = useState("");

  // ── Bootstrap ──────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      setUserId(user.id);
      const { data: m } = await supabase.from("org_members").select("org_id").eq("user_id", user.id).maybeSingle();
      if (!m) return;
      setOrgId(m.org_id);
    });
  }, []);

  // Re-load board when event changes
  useEffect(() => {
    if (!orgId || !eventCode.trim()) return;
    supabase
      .from("alliance_boards")
      .select("*")
      .eq("org_id", orgId)
      .eq("event_key", eventCode.toUpperCase())
      .eq("is_active", true)
      .maybeSingle()
      .then(({ data }) => {
        if (data) { setBoardId(data.id); setBoard(data.state as BoardState); }
      });
  }, [orgId, eventCode]);

  // ── Sync to Supabase ───────────────────────────────────────────────────────
  const sync = useCallback(async (next: BoardState) => {
    if (!orgId) return;
    setSyncing(true);
    try {
      const key = eventCode.trim().toUpperCase() || "NO-EVENT";
      if (boardId) {
        await supabase.from("alliance_boards")
          .update({ state: next, updated_at: new Date().toISOString() })
          .eq("id", boardId);
      } else {
        const { data } = await supabase.from("alliance_boards").insert({
          org_id: orgId, event_key: key,
          name: "Alliance Board", state: next,
          is_active: true, created_by: userId,
        }).select().single();
        if (data) setBoardId(data.id);
      }
    } catch {
      // network error — board state kept locally
    } finally {
      setSyncing(false);
    }
  }, [orgId, boardId, eventCode, userId]);

  function update(next: BoardState) { setBoard(next); sync(next); }

  // ── Load FTCscout event ────────────────────────────────────────────────────
  async function loadEvent() {
    if (!eventCode.trim()) return;
    setEventLoading(true); setEventError(""); setFtcEvent(null);
    setPicker(null); setPickerFilter("");
    try {
      const ev = await getEventRankings(eventCode.trim());
      if (!ev) {
        setEventError(`Event "${eventCode.toUpperCase()}" not found. Check the code on ftcscout.org.`);
      } else {
        setFtcEvent(ev);
      }
    } catch {
      setEventError("Couldn't reach FTCscout. Check your connection.");
    } finally {
      setEventLoading(false);
    }
  }

  // ── Alliance slot operations ───────────────────────────────────────────────
  function setSlot(allianceId: number, field: "captain" | "first" | "second", value: string | null) {
    const next = {
      ...board,
      alliances: board.alliances.map(a =>
        a.id === allianceId ? { ...a, [field]: value } : a
      ),
    };
    update(next);
    setPicker(null); setPickerFilter(""); setManualTeam("");
  }

  function clearSlot(allianceId: number, field: "captain" | "first" | "second") {
    setSlot(allianceId, field, null);
  }

  // ── DNP / Priority ─────────────────────────────────────────────────────────
  function addDNP(teamNum: string, name: string, reason: string) {
    if (!teamNum.trim()) return;
    if (board.dnp.find(d => d.team === teamNum)) return;
    const next = { ...board, dnp: [...board.dnp, { team: teamNum, name, reason }] };
    update(next);
    setPicker(null); setManualTeam(""); setManualReason("");
  }

  function removeDNP(team: string) {
    const next = { ...board, dnp: board.dnp.filter(d => d.team !== team) };
    update(next);
  }

  function addPriority(teamNum: string, name: string) {
    if (!teamNum.trim()) return;
    if (board.priorities.find(p => p.team === teamNum)) return;
    const next = { ...board, priorities: [...board.priorities, { team: teamNum, name }] };
    update(next);
    setPicker(null); setManualTeam("");
  }

  function removePriority(team: string) {
    const next = { ...board, priorities: board.priorities.filter(p => p.team !== team) };
    update(next);
  }

  // ── All teams already assigned (to highlight in picker) ───────────────────
  const assignedTeams = useMemo(() => {
    const set = new Set<string>();
    board.alliances.forEach(a => {
      if (a.captain) set.add(a.captain);
      if (a.first)   set.add(a.first);
      if (a.second)  set.add(a.second);
    });
    board.dnp.forEach(d => set.add(d.team));
    return set;
  }, [board]);

  // ── Filtered team list for picker ──────────────────────────────────────────
  const filteredTeams = useMemo(() => {
    if (!ftcEvent) return [];
    const q = pickerFilter.trim().toLowerCase();
    if (!q) return ftcEvent.teams;
    return ftcEvent.teams.filter(t =>
      String(t.team.number).includes(q) ||
      t.team.name.toLowerCase().includes(q)
    );
  }, [ftcEvent, pickerFilter]);

  // ── Picker action dispatcher ───────────────────────────────────────────────
  function pickTeam(et: FTCEventTeam) {
    const num = String(et.team.number);
    const name = et.team.name;
    if (!picker) return;
    if (picker.kind === "slot") {
      setSlot(picker.allianceId, picker.field, num);
    } else if (picker.kind === "dnp") {
      addDNP(num, name, manualReason);
    } else if (picker.kind === "priority") {
      addPriority(num, name);
    }
  }

  function openPicker(target: PickerTarget) {
    setPicker(target);
    setPickerFilter("");
    setManualTeam("");
    setManualReason("");
  }

  // ── Slot button ────────────────────────────────────────────────────────────
  const SlotBtn = ({
    label, value, allianceId,
    field,
  }: {
    label: string; value: string | null;
    allianceId: number; field: "captain" | "first" | "second";
  }) => {
    const active = picker?.kind === "slot" && picker.allianceId === allianceId && picker.field === field;
    return (
      <TouchableOpacity
        onPress={() =>
          active
            ? setPicker(null)
            : openPicker({ kind: "slot", allianceId, field })
        }
        style={[
          s.slot,
          value ? { backgroundColor: C.accentDim, borderColor: C.accent } : null,
          active ? { borderColor: C.accent, borderWidth: 2 } : null,
        ]}
      >
        {value
          ? <Text style={s.slotFilled}>{value}</Text>
          : <Text style={s.slotEmpty}>{label}</Text>}
      </TouchableOpacity>
    );
  };

  // ── Team picker panel (shared for slots / DNP / priority) ─────────────────
  const TeamPickerPanel = () => {
    if (!picker) return null;
    const isSlot = picker.kind === "slot";
    const title = isSlot
      ? `ALLIANCE ${(picker as { allianceId: number }).allianceId} — ${(picker as { field: string }).field.toUpperCase()}`
      : picker.kind === "dnp" ? "ADD TO DNP" : "ADD TO PRIORITY";

    return (
      <Card style={s.pickerCard}>
        <Text style={s.pickerTitle}>{title}</Text>

        {ftcEvent ? (
          <>
            <Input
              value={pickerFilter}
              onChangeText={setPickerFilter}
              placeholder="Filter by # or name…"
            />
            <View style={{ maxHeight: 280, marginTop: 8 }}>
              <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false}>
                {filteredTeams.length === 0 && (
                  <Text style={{ color: C.text2, fontSize: 12, padding: 8 }}>No matches</Text>
                )}
                {filteredTeams.map(et => {
                  const num = String(et.team.number);
                  const taken = assignedTeams.has(num);
                  return (
                    <TouchableOpacity
                      key={et.team.number}
                      onPress={() => pickTeam(et)}
                      style={[
                        s.teamPickerRow,
                        taken && { opacity: 0.4 },
                      ]}
                      disabled={taken && isSlot}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={s.tNum}>#{et.team.number}</Text>
                        <Text style={s.tName} numberOfLines={1}>{et.team.name}</Text>
                      </View>
                      <View style={{ alignItems: "flex-end" }}>
                        {et.ranking ? (
                          <>
                            <Text style={{ color: C.accent, fontSize: 12, fontWeight: "700" }}>#{et.ranking.rank}</Text>
                            <Text style={{ color: C.text2, fontSize: 10 }}>{et.ranking.wins}-{et.ranking.losses}</Text>
                          </>
                        ) : (
                          <Text style={{ color: C.text3, fontSize: 10 }}>No rank</Text>
                        )}
                      </View>
                      {taken && (
                        <Text style={{ color: C.text3, fontSize: 9, marginLeft: 6 }}>USED</Text>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          </>
        ) : (
          <Text style={{ color: C.text2, fontSize: 12, marginBottom: 8 }}>
            Load an event above to pick from the team list, or enter manually:
          </Text>
        )}

        {/* Manual entry fallback */}
        <View style={{ marginTop: 8, gap: 6 }}>
          <Input
            value={manualTeam}
            onChangeText={setManualTeam}
            placeholder="Or type team # manually"
            keyboardType="numeric"
          />
          {picker.kind === "dnp" && (
            <Input
              value={manualReason}
              onChangeText={setManualReason}
              placeholder="Reason (optional)"
            />
          )}
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Btn
              label="Confirm"
              onPress={() => {
                if (!manualTeam.trim()) return;
                if (picker.kind === "slot") setSlot(picker.allianceId, picker.field, manualTeam.trim());
                else if (picker.kind === "dnp") addDNP(manualTeam.trim(), "", manualReason);
                else addPriority(manualTeam.trim(), "");
              }}
              style={{ flex: 1 }}
            />
            {picker.kind === "slot" && (
              <Btn
                label="Clear Slot"
                onPress={() => { clearSlot(picker.allianceId, picker.field); }}
                variant="ghost"
                style={{ flex: 1 }}
              />
            )}
            <Btn label="Cancel" onPress={() => setPicker(null)} variant="ghost" style={{ flex: 1 }} />
          </View>
        </View>
      </Card>
    );
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <ScrollView
      style={s.root}
      contentContainerStyle={s.content}
      keyboardShouldPersistTaps="handled"
    >
      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.eyebrow}>WAR ROOM</Text>
          <Text style={s.title}>ALLIANCE SELECTION</Text>
        </View>
        {syncing && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <ActivityIndicator size="small" color={C.text2} />
            <Text style={{ color: C.text2, fontSize: 11 }}>syncing</Text>
          </View>
        )}
      </View>

      {/* ── Event Loader ────────────────────────────────────────────────── */}
      <Card>
        <SectionHeader label="LOAD EVENT" />
        <Text style={s.hint}>Enter the official FIRST event code (find it on ftcscout.org)</Text>
        <View style={s.row}>
          <View style={{ flex: 1 }}>
            <Input
              value={eventCode}
              onChangeText={setEventCode}
              placeholder="e.g. USTXHOU, CASC…"
            />
          </View>
          <Btn
            label={eventLoading ? "…" : "Load ▶"}
            onPress={loadEvent}
            style={{ alignSelf: "flex-end" }}
          />
        </View>
        {eventError ? <Text style={s.errText}>{eventError}</Text> : null}
        {ftcEvent && (
          <View style={s.loadedBadge}>
            <Text style={s.loadedName}>{ftcEvent.name}</Text>
            <Text style={s.loadedSub}>{ftcEvent.teams.length} teams loaded · tap any slot to pick</Text>
          </View>
        )}
      </Card>

      {/* ── Team Picker Panel ────────────────────────────────────────────── */}
      {picker && <TeamPickerPanel />}

      {/* ── Alliance Board ───────────────────────────────────────────────── */}
      <SectionHeader label="ALLIANCE BOARD" />
      {board.alliances.map(a => (
        <View key={a.id} style={s.allianceRow}>
          <Text style={s.allianceNum}>{a.id}</Text>
          <SlotBtn label="CAPTAIN" value={a.captain} allianceId={a.id} field="captain" />
          <SlotBtn label="1ST"     value={a.first}   allianceId={a.id} field="first"   />
          <SlotBtn label="2ND"     value={a.second}  allianceId={a.id} field="second"  />
        </View>
      ))}

      {/* ── DNP ─────────────────────────────────────────────────────────── */}
      <Card>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <Text style={{ color: C.red, fontSize: 12, letterSpacing: 3, fontWeight: "700" }}>DO NOT PICK</Text>
          <TouchableOpacity
            onPress={() => openPicker({ kind: "dnp" })}
            style={[s.addChipBtn, { borderColor: C.red + "60" }]}
          >
            <Text style={{ color: C.red, fontSize: 11, fontWeight: "700" }}>+ Add Team</Text>
          </TouchableOpacity>
        </View>
        {board.dnp.length === 0
          ? <Text style={s.hint}>No DNPs yet</Text>
          : (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {board.dnp.map(d => (
                <TouchableOpacity
                  key={d.team}
                  onPress={() => removeDNP(d.team)}
                  style={s.dnpChip}
                >
                  <Text style={{ color: C.red, fontSize: 12 }}>
                    ✕ #{d.team}{d.reason ? ` — ${d.reason}` : ""}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
      </Card>

      {/* ── Priority Queue ───────────────────────────────────────────────── */}
      <Card>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <Text style={{ color: C.amber, fontSize: 12, letterSpacing: 3, fontWeight: "700" }}>PRIORITY QUEUE</Text>
          <TouchableOpacity
            onPress={() => openPicker({ kind: "priority" })}
            style={[s.addChipBtn, { borderColor: C.amber + "60" }]}
          >
            <Text style={{ color: C.amber, fontSize: 11, fontWeight: "700" }}>+ Add Team</Text>
          </TouchableOpacity>
        </View>
        {board.priorities.length === 0
          ? <Text style={s.hint}>Queue is empty</Text>
          : (
            <View style={{ gap: 6 }}>
              {board.priorities.map((p, i) => (
                <TouchableOpacity
                  key={p.team}
                  onPress={() => removePriority(p.team)}
                  style={s.priorityRow}
                >
                  <Text style={{ color: C.amber, fontSize: 15, fontWeight: "900", width: 24 }}>{i + 1}</Text>
                  <Text style={{ color: C.text, fontSize: 13, fontWeight: "600", flex: 1 }}>
                    #{p.team}{p.name ? ` · ${p.name}` : ""}
                  </Text>
                  <Text style={{ color: C.text3, fontSize: 13 }}>✕</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
      </Card>
    </ScrollView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  content: { padding: 20, paddingTop: 60, gap: 12, paddingBottom: 60 },

  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 4 },
  eyebrow: { color: C.accent, fontSize: 10, letterSpacing: 3 },
  title: { color: C.text, fontSize: 28, fontWeight: "900", letterSpacing: 2 },

  row: { flexDirection: "row", gap: 8, marginTop: 8 },
  hint: { color: C.text2, fontSize: 11 },
  errText: { color: C.red, fontSize: 12, marginTop: 8 },

  loadedBadge: {
    marginTop: 10, backgroundColor: C.accentDim,
    borderRadius: 8, padding: 10, borderWidth: 1, borderColor: C.accent + "30",
  },
  loadedName: { color: C.accent, fontSize: 13, fontWeight: "700" },
  loadedSub: { color: C.text2, fontSize: 11, marginTop: 2 },

  // Alliance board
  allianceRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: C.surface, borderRadius: 10,
    borderWidth: 1, borderColor: C.border, padding: 10,
  },
  allianceNum: { color: C.accent, fontSize: 22, fontWeight: "900", width: 26 },
  slot: {
    flex: 1, borderRadius: 8, borderWidth: 1, borderColor: C.border2,
    padding: 8, alignItems: "center", minHeight: 48, justifyContent: "center",
  },
  slotFilled: { color: C.accent, fontSize: 14, fontWeight: "700" },
  slotEmpty: { color: C.text3, fontSize: 10, letterSpacing: 0.5 },

  // Team picker
  pickerCard: { borderWidth: 2, borderColor: C.accent + "60" },
  pickerTitle: { color: C.accent, fontSize: 12, letterSpacing: 2, marginBottom: 10, fontWeight: "700" },
  teamPickerRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingVertical: 10, paddingHorizontal: 4,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  tNum: { color: C.accent, fontSize: 13, fontWeight: "900" },
  tName: { color: C.text2, fontSize: 11, marginTop: 1 },

  // DNP / Priority
  addChipBtn: {
    borderWidth: 1, borderRadius: 6,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  dnpChip: {
    backgroundColor: C.redDim, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, borderColor: C.red + "40",
  },
  priorityRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: C.amberDim, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 8,
    borderWidth: 1, borderColor: C.amber + "30",
  },
});
