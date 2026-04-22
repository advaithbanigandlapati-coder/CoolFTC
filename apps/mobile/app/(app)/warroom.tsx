/**
 * War Room — Alliance Selection Board
 * Simplified: clear step-by-step flow, explicit instructions, no confusing state
 */
import { useState, useEffect, useCallback } from "react";
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Modal, Pressable } from "react-native";
import { supabase } from "../../lib/supabase";
import { C } from "../../lib/theme";
import { Card, Input, Btn, Label } from "../../components/ui";

type Alliance = { id: number; captain: string | null; first: string | null; second: string | null };
type DNP = { team: string; reason: string };
type Priority = { team: string; note: string };
type BoardState = { alliances: Alliance[]; dnp: DNP[]; priorities: Priority[] };

const EMPTY_BOARD: BoardState = {
  alliances: [1, 2, 3, 4].map(id => ({ id, captain: null, first: null, second: null })),
  dnp: [], priorities: [],
};

export default function WarRoomScreen() {
  const [orgId,   setOrgId]   = useState("");
  const [userId,  setUserId]  = useState("");
  const [boardId, setBoardId] = useState<string | null>(null);
  const [state,   setState]   = useState<BoardState>(EMPTY_BOARD);
  const [eventKey, setEventKey] = useState("");
  const [syncing,  setSyncing]  = useState(false);
  const [saved,    setSaved]    = useState(false);

  // Slot edit modal
  const [modal, setModal] = useState<{
    allianceId: number; field: "captain" | "first" | "second"; current: string | null;
  } | null>(null);
  const [modalVal, setModalVal] = useState("");

  // DNP / Priority inputs
  const [dnpTeam,   setDnpTeam]   = useState("");
  const [dnpReason, setDnpReason] = useState("");
  const [priTeam,   setPriTeam]   = useState("");
  const [priNote,   setPriNote]   = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      setUserId(user.id);
      const { data: m } = await supabase.from("org_members").select("org_id").eq("user_id", user.id).maybeSingle();
      if (!m) return;
      setOrgId(m.org_id);
    });
  }, []);

  async function loadBoard(ek: string) {
    if (!orgId || !ek.trim()) return;
    const { data } = await supabase.from("alliance_boards")
      .select("*").eq("org_id", orgId).eq("event_key", ek.trim()).eq("is_active", true)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (data) { setBoardId(data.id); setState(data.state as BoardState); }
    else { setBoardId(null); setState(EMPTY_BOARD); }
  }

  const save = useCallback(async (s: BoardState) => {
    if (!orgId || !eventKey.trim()) return;
    setSyncing(true); setSaved(false);
    if (boardId) {
      await supabase.from("alliance_boards").update({ state: s, updated_at: new Date().toISOString() }).eq("id", boardId);
    } else {
      const { data } = await supabase.from("alliance_boards").insert({
        org_id: orgId, event_key: eventKey.trim(), name: "Alliance Board",
        state: s, is_active: true, created_by: userId,
      }).select().single();
      if (data) setBoardId(data.id);
    }
    setSyncing(false); setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }, [orgId, boardId, eventKey, userId]);

  function mutate(next: BoardState) { setState(next); save(next); }

  function openModal(allianceId: number, field: "captain" | "first" | "second", current: string | null) {
    setModal({ allianceId, field, current }); setModalVal(current ?? "");
  }

  function confirmModal() {
    if (!modal) return;
    const { allianceId, field } = modal;
    const next = {
      ...state,
      alliances: state.alliances.map(a =>
        a.id === allianceId ? { ...a, [field]: modalVal.trim() || null } : a
      ),
    };
    mutate(next); setModal(null);
  }

  function clearSlot(allianceId: number, field: "captain" | "first" | "second") {
    const next = {
      ...state,
      alliances: state.alliances.map(a =>
        a.id === allianceId ? { ...a, [field]: null } : a
      ),
    };
    mutate(next); setModal(null);
  }

  function addDNP() {
    if (!dnpTeam.trim()) return;
    const next = { ...state, dnp: [...state.dnp, { team: dnpTeam.trim(), reason: dnpReason.trim() }] };
    mutate(next); setDnpTeam(""); setDnpReason("");
  }

  function addPriority() {
    if (!priTeam.trim()) return;
    const next = { ...state, priorities: [...state.priorities, { team: priTeam.trim(), note: priNote.trim() }] };
    mutate(next); setPriTeam(""); setPriNote("");
  }

  const fieldLabel: Record<string, string> = { captain: "Alliance Captain", first: "1st Pick", second: "2nd Pick" };

  return (
    <ScrollView style={s.root} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">

      {/* Header */}
      <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 4 }}>
        <View>
          <Text style={{ color: C.accent, fontSize: 10, letterSpacing: 3 }}>WAR ROOM</Text>
          <Text style={{ color: C.text, fontSize: 28, fontWeight: "900", letterSpacing: 2 }}>ALLIANCE BOARD</Text>
        </View>
        {syncing && <Text style={{ color: C.text2, fontSize: 11 }}>Saving…</Text>}
        {saved   && <Text style={{ color: C.green,  fontSize: 11 }}>✓ Saved</Text>}
      </View>

      {/* Event setup */}
      <Card>
        <Label text="EVENT KEY" />
        <Text style={{ color: C.text2, fontSize: 11, marginBottom: 8 }}>
          Enter your event key (e.g. 2025-TXHOU) then tap Load Board. Your board syncs across your whole org.
        </Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Input value={eventKey} onChangeText={setEventKey} placeholder="2025-TXHOU" autoCapitalize="none" />
          </View>
          <Btn label="Load Board" onPress={() => loadBoard(eventKey)} style={{ alignSelf: "flex-end", paddingHorizontal: 12 }} />
        </View>
      </Card>

      {/* Alliance Board */}
      <Text style={{ color: C.text2, fontSize: 9, letterSpacing: 2, marginTop: 4 }}>
        TAP ANY SLOT TO ASSIGN A TEAM
      </Text>
      {state.alliances.map(a => (
        <View key={a.id} style={s.allianceRow}>
          <View style={s.allianceNumWrap}>
            <Text style={s.allianceNum}>{a.id}</Text>
          </View>
          {(["captain", "first", "second"] as const).map(field => (
            <TouchableOpacity
              key={field}
              onPress={() => openModal(a.id, field, a[field])}
              style={[s.slot, a[field] ? { backgroundColor: C.accentDim, borderColor: C.accent } : null]}
            >
              {a[field] ? (
                <>
                  <Text style={{ color: C.accent, fontSize: 14, fontWeight: "700" }}>{a[field]}</Text>
                  <Text style={{ color: C.text3, fontSize: 8, marginTop: 2 }}>{fieldLabel[field].toUpperCase()}</Text>
                </>
              ) : (
                <>
                  <Text style={{ color: C.text3, fontSize: 18 }}>+</Text>
                  <Text style={{ color: C.text3, fontSize: 8, marginTop: 2 }}>{fieldLabel[field].toUpperCase()}</Text>
                </>
              )}
            </TouchableOpacity>
          ))}
        </View>
      ))}

      {/* DNP List */}
      <Card>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.red }} />
          <Text style={{ color: C.red, fontSize: 12, letterSpacing: 2, fontWeight: "700" }}>DO NOT PICK</Text>
        </View>
        <Text style={{ color: C.text2, fontSize: 11, marginBottom: 10 }}>
          Teams your org has decided to avoid — syncs to all members.
        </Text>
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 10 }}>
          <View style={{ flex: 1 }}>
            <Input value={dnpTeam} onChangeText={setDnpTeam} placeholder="Team #" keyboardType="numeric" />
          </View>
          <View style={{ flex: 2 }}>
            <Input value={dnpReason} onChangeText={setDnpReason} placeholder="Reason (optional)" />
          </View>
          <Btn label="Add" onPress={addDNP} style={{ alignSelf: "flex-end" }} />
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {state.dnp.length === 0 && (
            <Text style={{ color: C.text3, fontSize: 12 }}>No DNPs yet.</Text>
          )}
          {state.dnp.map(d => (
            <TouchableOpacity
              key={d.team}
              onPress={() => mutate({ ...state, dnp: state.dnp.filter(x => x.team !== d.team) })}
              style={{ backgroundColor: C.redDim, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: C.red + "40" }}
            >
              <Text style={{ color: C.red, fontSize: 12 }}>
                ✕  {d.team}{d.reason ? ` — ${d.reason}` : ""}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </Card>

      {/* Priority Queue */}
      <Card>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.amber }} />
          <Text style={{ color: C.amber, fontSize: 12, letterSpacing: 2, fontWeight: "700" }}>PRIORITY QUEUE</Text>
        </View>
        <Text style={{ color: C.text2, fontSize: 11, marginBottom: 10 }}>
          Ranked teams to target during selection. Tap a team to remove it.
        </Text>
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 10 }}>
          <View style={{ flex: 1 }}>
            <Input value={priTeam} onChangeText={setPriTeam} placeholder="Team #" keyboardType="numeric" />
          </View>
          <View style={{ flex: 2 }}>
            <Input value={priNote} onChangeText={setPriNote} placeholder="Note (optional)" />
          </View>
          <Btn label="Add" onPress={addPriority} style={{ alignSelf: "flex-end" }} />
        </View>
        <View style={{ gap: 6 }}>
          {state.priorities.length === 0 && (
            <Text style={{ color: C.text3, fontSize: 12 }}>No priorities yet.</Text>
          )}
          {state.priorities.map((p, i) => (
            <TouchableOpacity
              key={i}
              onPress={() => mutate({ ...state, priorities: state.priorities.filter((_, j) => j !== i) })}
              style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: C.amberDim,
                borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: C.amber + "30" }}
            >
              <Text style={{ color: C.amber, fontSize: 16, fontWeight: "900", width: 24 }}>{i + 1}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.text, fontSize: 13, fontWeight: "700" }}>Team {p.team}</Text>
                {p.note ? <Text style={{ color: C.text2, fontSize: 11 }}>{p.note}</Text> : null}
              </View>
              <Text style={{ color: C.text3, fontSize: 12 }}>✕</Text>
            </TouchableOpacity>
          ))}
        </View>
      </Card>

      {/* Slot edit modal */}
      <Modal visible={modal !== null} transparent animationType="fade">
        <Pressable style={s.overlay} onPress={() => setModal(null)}>
          <Pressable style={s.modalBox} onPress={() => {}}>
            {modal && (
              <>
                <Text style={{ color: C.accent, fontSize: 11, letterSpacing: 2, marginBottom: 4 }}>
                  ALLIANCE {modal.allianceId}
                </Text>
                <Text style={{ color: C.text, fontSize: 18, fontWeight: "900", marginBottom: 16 }}>
                  {fieldLabel[modal.field].toUpperCase()}
                </Text>
                <Input
                  value={modalVal}
                  onChangeText={setModalVal}
                  placeholder="Team number"
                  keyboardType="numeric"
                  autoFocus
                />
                <View style={{ flexDirection: "row", gap: 8, marginTop: 16 }}>
                  <Btn label="Set Team" onPress={confirmModal} style={{ flex: 2 }} />
                  {modal.current && (
                    <Btn label="Clear" onPress={() => clearSlot(modal.allianceId, modal.field)} variant="ghost" style={{ flex: 1 }} />
                  )}
                  <Btn label="Cancel" onPress={() => setModal(null)} variant="ghost" style={{ flex: 1 }} />
                </View>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>

    </ScrollView>
  );
}

const s = StyleSheet.create({
  root:    { flex: 1, backgroundColor: C.bg },
  content: { padding: 20, paddingTop: 60, gap: 12, paddingBottom: 48 },
  allianceRow: {
    flexDirection: "row", alignItems: "stretch", gap: 6,
    backgroundColor: C.surface, borderRadius: 10,
    borderWidth: 1, borderColor: C.border, padding: 8,
  },
  allianceNumWrap: {
    width: 32, alignItems: "center", justifyContent: "center",
    borderRightWidth: 1, borderRightColor: C.border, paddingRight: 6, marginRight: 2,
  },
  allianceNum: { color: C.accent, fontSize: 22, fontWeight: "900" },
  slot: {
    flex: 1, borderRadius: 8, borderWidth: 1, borderColor: C.border2,
    padding: 8, alignItems: "center", justifyContent: "center", minHeight: 52,
    backgroundColor: C.surface2,
  },
  overlay:  { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", padding: 20 },
  modalBox: { backgroundColor: C.surface, borderRadius: 16, padding: 24, borderWidth: 1, borderColor: C.border2 },
});
