"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { createBrowserClient } from "@supabase/ssr";

const sb = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

type Alliance   = { id: number; captain: string|null; first: string|null; second: string|null };
type DNPEntry   = { team: string; reason: string };
type Snapshot   = { label: string; state: BoardState; savedAt: string };
type BoardState = { alliances: Alliance[]; dnp: DNPEntry[]; priorities: string[]; snapshots?: Snapshot[] };

const INIT_STATE: BoardState = {
  alliances: [1,2,3,4].map(id => ({ id, captain: null, first: null, second: null })),
  dnp: [], priorities: [],
};

const TIER_COLORS: Record<string, string> = {
  OPTIMAL: "text-ftc-green border-ftc-green/40",
  MID:     "text-amber-400 border-amber-400/40",
  BAD:     "text-red-400 border-red-400/40",
};

export default function WarRoomPage() {
  const [orgId,       setOrgId]       = useState("");
  const [userId,      setUserId]      = useState("");
  const [eventKey,    setEventKey]    = useState("");
  const [boardId,     setBoardId]     = useState<string|null>(null);
  const [state,       setState]       = useState<BoardState>(INIT_STATE);
  const [teams,       setTeams]       = useState<{team_number:string;team_name?:string;opr?:number;tier?:string}[]>([]);
  const [ftcEvent,    setFtcEvent]    = useState<{name:string;teams:{team:{number:number;name:string};ranking:{rank:number;wins:number;losses:number}|null}[]}|null>(null);
  const [eventCode,   setEventCode]   = useState("");
  const [ftcLoading,  setFtcLoading]  = useState(false);
  const [ftcError,    setFtcError]    = useState("");
  const [dnpInput,    setDnpInput]    = useState({ team: "", reason: "" });
  const [priorityInput,setPriorityInput]=useState("");
  const [dragTeam,    setDragTeam]    = useState<string|null>(null);
  const [dragTarget,  setDragTarget]  = useState<string|null>(null);
  const [saving,      setSaving]      = useState(false);
  const [saved,       setSaved]       = useState(false);
  const [snapshotName,setSnapshotName]= useState("");
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    sb.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      setUserId(user.id);
      const { data: m } = await sb.from("org_members").select("org_id").eq("user_id", user.id).maybeSingle();
      if (!m) return;
      setOrgId(m.org_id);

      const { data: board } = await sb.from("alliance_boards").select("*").eq("org_id", m.org_id).eq("event_key", eventKey).eq("is_active", true).maybeSingle();
      if (board) { setBoardId(board.id); setState(board.state as BoardState); }

      const { data: sc } = await sb.from("scouting_entries").select("team_number,tier,ftc_teams(team_name)").eq("org_id", m.org_id).eq("event_key", eventKey);
      const { data: st } = await sb.from("team_stats_cache").select("team_number,opr").eq("event_key", eventKey);
      const statsMap = new Map((st ?? []).map((s: Record<string,unknown>) => [s.team_number, s.opr]));
      setTeams((sc ?? []).map((e: Record<string,unknown>) => ({
        team_number: e.team_number as string,
        team_name: (e.ftc_teams as unknown as {team_name:string|null}|null)?.team_name ?? undefined,
        opr: statsMap.get(e.team_number as string) as number ?? undefined,
        tier: e.tier as string ?? undefined,
      })));
    });
  }, [eventKey]);

  // Realtime sync
  useEffect(() => {
    if (!boardId) return;
    const ch = sb.channel(`warroom:${boardId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "alliance_boards", filter: `id=eq.${boardId}` },
        (payload) => { if (payload.new.state) setState(payload.new.state as BoardState); })
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [boardId]);

  async function loadFTCEvent() {
    if (!eventCode.trim()) return;
    setFtcLoading(true); setFtcError(""); setFtcEvent(null);
    try {
      const res = await fetch("https://api.ftcscout.org/graphql", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: `query($s:Int!,$c:String!){eventByCode(season:$s,code:$c){name teams{team{number name}ranking{rank wins losses}}}}`, variables: { s: 2025, c: eventCode.trim().toUpperCase() } }),
      });
      const json = await res.json();
      const ev = json.data?.eventByCode;
      if (!ev) { setFtcError(`Event "${eventCode.toUpperCase()}" not found on FTCscout.`); }
      else {
        const sorted = [...ev.teams].sort((a: {ranking:{rank:number}|null}, b: {ranking:{rank:number}|null}) => {
          if (!a.ranking && !b.ranking) return 0; if (!a.ranking) return 1; if (!b.ranking) return -1;
          return a.ranking.rank - b.ranking.rank;
        });
        setFtcEvent({ ...ev, teams: sorted });
        // Merge FTCscout teams into available teams list (won't overwrite scouting tiers/OPR)
        setTeams(prev => {
          const existing = new Map(prev.map(t => [t.team_number, t]));
          sorted.forEach((et: {team:{number:number;name:string};ranking:{rank:number;wins:number;losses:number}|null}) => {
            const tn = String(et.team.number);
            if (!existing.has(tn)) existing.set(tn, { team_number: tn, team_name: et.team.name });
          });
          return Array.from(existing.values());
        });
      }
    } catch { setFtcError("Could not reach FTCscout. Check your connection."); }
    finally { setFtcLoading(false); }
  }

  const saveBoard = useCallback(async (s: BoardState) => {
    if (!orgId) return;
    setSaving(true);
    if (boardId) {
      await sb.from("alliance_boards").update({ state: s, updated_at: new Date().toISOString() }).eq("id", boardId);
    } else {
      const { data } = await sb.from("alliance_boards").insert({ org_id: orgId, event_key: eventKey, name: "Alliance board", state: s, is_active: true, created_by: userId }).select().single();
      if (data) setBoardId(data.id);
    }
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 1500);
  }, [orgId, boardId, eventKey, userId]);

  function updateState(next: BoardState) { setState(next); saveBoard(next); }

  function drop(slot: { allianceId: number; role: "captain"|"first"|"second" }) {
    if (!dragTeam) return;
    const next = { ...state, alliances: state.alliances.map(a => {
      if (a.id !== slot.allianceId) return a;
      return { ...a, [slot.role]: dragTeam };
    })};
    updateState(next);
    setDragTeam(null); setDragTarget(null);
  }

  function clearSlot(allianceId: number, role: "captain"|"first"|"second") {
    const next = { ...state, alliances: state.alliances.map(a => a.id !== allianceId ? a : { ...a, [role]: null }) };
    updateState(next);
  }

  function addDNP() {
    if (!dnpInput.team) return;
    const next = { ...state, dnp: [...state.dnp.filter(d => d.team !== dnpInput.team), { team: dnpInput.team, reason: dnpInput.reason }] };
    updateState(next); setDnpInput({ team: "", reason: "" });
  }

  function removeDNP(team: string) {
    updateState({ ...state, dnp: state.dnp.filter(d => d.team !== team) });
  }

  function addPriority() {
    if (!priorityInput) return;
    updateState({ ...state, priorities: [...state.priorities, priorityInput] });
    setPriorityInput("");
  }

  function removePriority(i: number) {
    updateState({ ...state, priorities: state.priorities.filter((_, j) => j !== i) });
  }

  function saveSnapshot() {
    const label = snapshotName || `Snapshot ${new Date().toLocaleTimeString()}`;
    const snap: Snapshot = { label, state: JSON.parse(JSON.stringify(state)), savedAt: new Date().toISOString() };
    const next = { ...state, snapshots: [...(state.snapshots ?? []).slice(-4), snap] };
    updateState(next); setSnapshotName("");
  }

  function restoreSnapshot(snap: Snapshot) {
    if (!confirm(`Restore "${snap.label}"? Current state will be lost.`)) return;
    updateState({ ...snap.state, snapshots: state.snapshots });
  }

  function exportPDF() {
    // Build print content from live board state (printRef not needed)
    if (!state.alliances?.length) return;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><title>CoolFTC Alliance Selection — ${eventKey}</title>
    <style>
      body { font-family: 'Arial', sans-serif; color: #111; padding: 2rem; }
      h1 { font-size: 24px; margin-bottom: 1rem; }
      .alliance { border: 1px solid #ccc; border-radius: 8px; padding: 1rem; margin-bottom: 1rem; }
      .alliance-title { font-size: 14px; font-weight: bold; margin-bottom: 0.5rem; }
      .team-slot { display: inline-block; border: 1px solid #aaa; border-radius: 4px; padding: 4px 10px; margin: 2px; font-size: 13px; }
      .dnp { color: #c00; } .priority { color: #080; }
      .section-title { font-size: 13px; font-weight: bold; margin: 1rem 0 0.5rem; color: #555; text-transform: uppercase; letter-spacing: 1px; }
      @media print { body { padding: 0; } }
    </style></head><body>
    <h1>CoolFTC · Alliance Selection · ${eventKey}</h1>
    <div class="section-title">Alliance Board</div>
    ${state.alliances.map(a => `
      <div class="alliance">
        <div class="alliance-title">Alliance ${a.id}</div>
        ${a.captain ? `<span class="team-slot">C: ${a.captain}</span>` : ""}
        ${a.first   ? `<span class="team-slot">1: ${a.first}</span>`   : ""}
        ${a.second  ? `<span class="team-slot">2: ${a.second}</span>`  : ""}
      </div>`).join("")}
    <div class="section-title">Priority Picks</div>
    ${state.priorities.map((p, i) => `<div class="priority">${i+1}. ${p}</div>`).join("") || "None"}
    <div class="section-title">Do Not Pick</div>
    ${state.dnp.map(d => `<div class="dnp">✕ ${d.team}${d.reason ? ` — ${d.reason}` : ""}</div>`).join("") || "None"}
    <div style="margin-top:2rem;font-size:11px;color:#aaa;">Generated by CoolFTC · Team #30439 · ${new Date().toLocaleString()}</div>
    </body></html>`);
    win.document.close();
    win.print();
  }

  const usedTeams = new Set([
    ...state.alliances.flatMap(a => [a.captain, a.first, a.second].filter(Boolean)),
    ...state.dnp.map(d => d.team),
  ]);
  const availableTeams = teams.filter(t => !usedTeams.has(t.team_number));

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-start justify-between mb-6">
        <div>
          <p className="font-mono text-[10px] text-accent tracking-widest mb-1">ALLIANCE SELECTION</p>
          <h1 className="font-display text-4xl font-black tracking-wide">WAR ROOM</h1>
        </div>
        <div className="flex gap-2 items-center">
          {saved && <span className="font-mono text-xs text-ftc-green">✓ Saved</span>}
          {saving && <span className="font-mono text-xs text-white/40">Saving…</span>}
          <button onClick={exportPDF} className="btn-ghost text-sm">⬇ Export PDF</button>
        </div>
      </div>

      <div className="card p-4 mb-5 space-y-2">
        <div className="font-mono text-[10px] text-white/40 tracking-widest">LOAD EVENT FROM FTCSCOUT</div>
        <p className="font-mono text-[10px] text-white/30">Enter the official FIRST event code to load the real team list. Find codes on ftcscout.org.</p>
        <div className="flex gap-2">
          <input className="input flex-1" placeholder="e.g. USTXHOU, CASC…" value={eventCode} onChange={e => setEventCode(e.target.value)}
            onKeyDown={e => e.key === "Enter" && loadFTCEvent()} />
          <button className="btn text-sm" onClick={loadFTCEvent} disabled={ftcLoading}>
            {ftcLoading ? "Loading…" : "Load Event →"}
          </button>
        </div>
        {ftcError && <p className="text-ftc-red text-xs font-mono">{ftcError}</p>}
        {ftcEvent && (
          <div className="bg-accent/10 border border-accent/30 rounded px-3 py-2">
            <span className="font-mono text-xs text-accent font-bold">{ftcEvent.name}</span>
            <span className="font-mono text-xs text-white/40 ml-2">{ftcEvent.teams.length} teams loaded</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Alliance Board */}
        <div className="lg:col-span-2 space-y-3">
          <div className="font-mono text-[10px] text-white/40 tracking-widest mb-2">ALLIANCE BOARD — drag teams to slots</div>
          {state.alliances.map(a => (
            <div key={a.id} className="card p-3">
              <div className="font-mono text-[10px] text-white/40 mb-2">ALLIANCE {a.id}</div>
              <div className="flex gap-2">
                {(["captain", "first", "second"] as const).map(role => (
                  <div key={role}
                    className={`flex-1 h-14 rounded border-2 border-dashed flex items-center justify-center transition-colors ${dragTarget === `${a.id}-${role}` ? "border-accent bg-accent/10" : "border-white/10"}`}
                    onDragOver={e => { e.preventDefault(); setDragTarget(`${a.id}-${role}`); }}
                    onDragLeave={() => setDragTarget(null)}
                    onDrop={() => { drop({ allianceId: a.id, role }); }}>
                    {a[role] ? (
                      <div className="flex items-center gap-2 px-2">
                        <div>
                          <div className="font-mono text-xs text-white/80">{a[role]}</div>
                          <div className="font-mono text-[9px] text-white/30">{role}</div>
                        </div>
                        <button onClick={() => clearSlot(a.id, role)} className="text-white/20 hover:text-red-400 font-mono text-xs">×</button>
                      </div>
                    ) : (
                      <span className="font-mono text-[9px] text-white/20">{role}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Priority + DNP */}
          <div className="grid grid-cols-2 gap-3">
            <div className="card p-3 space-y-2">
              <div className="font-mono text-[10px] text-ftc-green tracking-widest">PRIORITY PICKS</div>
              <div className="flex gap-1">
                <input className="input flex-1 text-sm" placeholder="Team #" value={priorityInput} onChange={e => setPriorityInput(e.target.value)} onKeyDown={e => e.key === "Enter" && addPriority()} />
                <button onClick={addPriority} className="btn-ghost text-sm px-2">+</button>
              </div>
              {state.priorities.map((p, i) => (
                <div key={i} className="flex items-center justify-between">
                  <span className="font-mono text-xs text-ftc-green">{i+1}. {p}</span>
                  <button onClick={() => removePriority(i)} className="text-white/20 hover:text-red-400 font-mono text-xs">×</button>
                </div>
              ))}
            </div>

            <div className="card p-3 space-y-2">
              <div className="font-mono text-[10px] text-red-400 tracking-widest">DO NOT PICK</div>
              <div className="space-y-1">
                <input className="input w-full text-sm" placeholder="Team #" value={dnpInput.team} onChange={e => setDnpInput(d => ({ ...d, team: e.target.value }))} />
                <input className="input w-full text-sm" placeholder="Reason (opt)" value={dnpInput.reason} onChange={e => setDnpInput(d => ({ ...d, reason: e.target.value }))} onKeyDown={e => e.key === "Enter" && addDNP()} />
                <button onClick={addDNP} className="btn-ghost w-full text-xs">Add DNP</button>
              </div>
              {state.dnp.map(d => (
                <div key={d.team} className="flex items-center justify-between">
                  <span className="font-mono text-xs text-red-400">✕ {d.team} {d.reason && <span className="text-white/30">— {d.reason}</span>}</span>
                  <button onClick={() => removeDNP(d.team)} className="text-white/20 hover:text-red-400 font-mono text-xs">×</button>
                </div>
              ))}
            </div>
          </div>

          {/* Snapshots */}
          <div className="card p-3 space-y-2">
            <div className="font-mono text-[10px] text-white/40 tracking-widest">BOARD SNAPSHOTS</div>
            <div className="flex gap-2">
              <input className="input flex-1 text-sm" placeholder="Snapshot label (opt)" value={snapshotName} onChange={e => setSnapshotName(e.target.value)} />
              <button onClick={saveSnapshot} className="btn-ghost text-sm">Save snapshot</button>
            </div>
            {(state.snapshots ?? []).map((snap, i) => (
              <div key={i} className="flex items-center justify-between">
                <span className="font-mono text-xs text-white/40">{snap.label}</span>
                <button onClick={() => restoreSnapshot(snap)} className="font-mono text-[10px] text-accent hover:underline">restore</button>
              </div>
            ))}
          </div>
        </div>

        {/* Available teams panel */}
        <div className="space-y-2">
          <div className="font-mono text-[10px] text-white/40 tracking-widest mb-2">AVAILABLE TEAMS — drag onto board</div>
          {availableTeams.length === 0 && (
            <p className="text-center py-8 text-white/20 font-mono text-xs">All teams placed or no scouting data.</p>
          )}
          {availableTeams.map(t => (
            <div key={t.team_number}
              draggable
              onDragStart={() => setDragTeam(t.team_number)}
              onDragEnd={() => setDragTeam(null)}
              className={`card p-3 cursor-grab active:cursor-grabbing select-none border-2 transition-colors ${dragTeam === t.team_number ? "border-accent/60 bg-accent/5" : "border-transparent"} ${t.tier ? TIER_COLORS[t.tier] : ""}`}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-mono text-xs text-white/80">{t.team_number}</div>
                  <div className="font-mono text-[9px] text-white/30 truncate max-w-[120px]">{t.team_name}</div>
                </div>
                <div className="text-right">
                  {t.opr !== undefined && <div className="font-mono text-xs text-white/50">{t.opr.toFixed(1)}</div>}
                  {t.tier && <div className={`font-mono text-[9px] ${TIER_COLORS[t.tier]?.split(" ")[0]}`}>{t.tier}</div>}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Hidden print reference */}
      <div ref={printRef} style={{ display: "none" }} />
    </div>
  );
}
