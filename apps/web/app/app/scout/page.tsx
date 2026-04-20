"use client";
import { useState, useEffect } from "react";
import { createBrowserClient } from "@supabase/ssr";

const sb = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

type Tab = "match" | "pit" | "quick";

// Match form types
type MatchForm = {
  teamNumber: string; matchNumber: string; matchType: string; alliance: string;
  autoLeave: boolean; autoCloseRange: boolean; autoFarRange: boolean;
  avgBallsAuto: string; highBallsAuto: string;
  avgBallsTeleop: string; highBallsTeleop: string;
  endgamePlan: string; penaltyNotes: string; generalNotes: string;
};
const MATCH_INIT: MatchForm = {
  teamNumber: "", matchNumber: "", matchType: "qual", alliance: "red",
  autoLeave: false, autoCloseRange: false, autoFarRange: false,
  avgBallsAuto: "0", highBallsAuto: "0", avgBallsTeleop: "0", highBallsTeleop: "0",
  endgamePlan: "none", penaltyNotes: "", generalNotes: "",
};

// Pit form types
type PitForm = {
  teamNumber: string; drivetrain: string; autoCap: boolean;
  endgamePlan: string; mechRisk: string;
  autoNotes: string; teleopNotes: string; endgameNotes: string; generalNotes: string;
};
const PIT_INIT: PitForm = {
  teamNumber: "", drivetrain: "tank", autoCap: false,
  endgamePlan: "none", mechRisk: "3",
  autoNotes: "", teleopNotes: "", endgameNotes: "", generalNotes: "",
};

// Quick-scout types — 1-tap scoring
type QuickEntry = { teamNumber: string; autoScore: number; teleopScore: number; endgame: string; matchNumber: string };

export default function ScoutPage() {
  const [tab,     setTab]     = useState<Tab>("match");
  const [orgId,   setOrgId]   = useState("");
  const [userId,  setUserId]  = useState("");
  const [eventKey,setEventKey]= useState("2025-DECODE-TEST");
  const [saved,   setSaved]   = useState(false);
  const [saving,  setSaving]  = useState(false);

  const [match,   setMatch]   = useState<MatchForm>(MATCH_INIT);
  const [pit,     setPit]     = useState<PitForm>(PIT_INIT);
  const [quick,   setQuick]   = useState<QuickEntry>({ teamNumber: "", autoScore: 0, teleopScore: 0, endgame: "none", matchNumber: "" });
  const [fieldPositions, setFieldPositions] = useState<{ x: number; y: number; phase: "auto" | "teleop" | "endgame" }[]>([]);
  const [tapPhase, setTapPhase] = useState<"auto" | "teleop" | "endgame">("teleop");

  useEffect(() => {
    sb.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      setUserId(user.id);
      const { data: m } = await sb.from("org_members").select("org_id").eq("user_id", user.id).single();
      if (m) setOrgId(m.org_id);
    });
  }, []);

  // ── Score calculators ───────────────────────────────────────────────────
  const autoScore  = () => (match.autoLeave ? 3 : 0) + (match.autoCloseRange ? (parseInt(match.avgBallsAuto) * 4 || 0) : 0) + (match.autoFarRange ? 2 : 0);
  const teleopScore= () => parseInt(match.avgBallsTeleop) * 2 || 0;
  const egScore    = () => ({ none: 0, partial: 5, full: 10, both: 20 }[match.endgamePlan] ?? 0);

  // ── Save match ──────────────────────────────────────────────────────────
  async function saveMatch(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId || !match.teamNumber) return;
    setSaving(true);
    const aScore = autoScore(); const tScore = teleopScore(); const eScore = egScore();
    await fetch("/api/scout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        org_id: orgId, event_key: eventKey, team_number: match.teamNumber,
        match_number: parseInt(match.matchNumber) || 0, match_type: match.matchType,
        alliance: match.alliance, auto_score: aScore, teleop_score: tScore,
        endgame_score: eScore, total_score: aScore + tScore + eScore,
        form_data: match,
        field_positions: fieldPositions,
      }),
    });
    setSaved(true); setMatch(MATCH_INIT); setFieldPositions([]); setSaving(false);
    setTimeout(() => setSaved(false), 2000);
  }

  // ── Save pit ────────────────────────────────────────────────────────────
  async function savePit(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId || !pit.teamNumber) return;
    setSaving(true);
    await sb.from("pit_scouting").upsert({
      org_id: orgId, event_key: eventKey, team_number: pit.teamNumber,
      scouted_by: userId, drivetrain: pit.drivetrain,
      auto_capable: pit.autoCap, endgame_capable: pit.endgamePlan,
      mechanical_risk: parseInt(pit.mechRisk),
      auto_notes: pit.autoNotes, teleop_notes: pit.teleopNotes,
      endgame_notes: pit.endgameNotes, general_notes: pit.generalNotes,
      form_data: pit,
    }, { onConflict: "org_id,event_key,team_number" });
    setSaved(true); setPit(PIT_INIT); setSaving(false);
    setTimeout(() => setSaved(false), 2000);
  }

  // ── Save quick entry ────────────────────────────────────────────────────
  async function saveQuick() {
    if (!orgId || !quick.teamNumber) return;
    setSaving(true);
    const eg = { none: 0, partial: 5, full: 10, both: 20 }[quick.endgame] ?? 0;
    await fetch("/api/scout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        org_id: orgId, event_key: eventKey, team_number: quick.teamNumber,
        match_number: parseInt(quick.matchNumber) || 0, match_type: "qual",
        alliance: "unknown", auto_score: quick.autoScore,
        teleop_score: quick.teleopScore, endgame_score: eg,
        total_score: quick.autoScore + quick.teleopScore + eg,
        form_data: { quickScout: true, ...quick },
      }),
    });
    setSaved(true); setQuick({ teamNumber: "", autoScore: 0, teleopScore: 0, endgame: "none", matchNumber: "" });
    setSaving(false); setTimeout(() => setSaved(false), 2000);
  }

  const upd = (k: keyof MatchForm, v: string | boolean) => setMatch(f => ({ ...f, [k]: v }));
  const pudp = (k: keyof PitForm,  v: string | boolean) => setPit(f => ({ ...f, [k]: v }));

  const DRIVETRAINS = ["tank", "mecanum", "swerve", "H-drive", "other"];
  const ENDGAMES    = [["none", "None"], ["partial", "Partial (5)"], ["full", "Full (10)"], ["both", "Both (20)"]];

  return (
    <div className="p-6 max-w-2xl">
      <div className="mb-6">
        <p className="font-mono text-[10px] text-accent tracking-widest mb-1">SCOUT SUITE</p>
        <h1 className="font-display text-4xl font-black tracking-wide">SCOUTING</h1>
      </div>

      {/* Event key */}
      <div className="flex gap-3 mb-5">
        <input className="input w-56" placeholder="Event key" value={eventKey} onChange={e => setEventKey(e.target.value)} />
        {saved && <span className="font-mono text-xs text-ftc-green self-center">✓ Saved</span>}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-white/[0.065] mb-6">
        {(["match", "pit", "quick"] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 font-mono text-[11px] tracking-widest transition-colors ${tab === t ? "text-accent border-b border-accent" : "text-white/40 hover:text-white/70"}`}>
            {t === "match" ? "MATCH FORM" : t === "pit" ? "PIT SCOUT" : "QUICK SCOUT"}
          </button>
        ))}
      </div>

      {/* ── MATCH FORM ── */}
      {tab === "match" && (
        <form onSubmit={saveMatch} className="space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Team #</label>
              <input className="input w-full" value={match.teamNumber} onChange={e => upd("teamNumber", e.target.value)} placeholder="4042" required />
            </div>
            <div>
              <label className="label">Match #</label>
              <input className="input w-full" type="number" value={match.matchNumber} onChange={e => upd("matchNumber", e.target.value)} placeholder="1" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Alliance</label>
              <div className="flex gap-2">
                {["red", "blue"].map(a => (
                  <button type="button" key={a} onClick={() => upd("alliance", a)}
                    className={`flex-1 py-1.5 rounded font-mono text-xs transition-colors ${match.alliance === a ? (a === "red" ? "bg-red-500 text-white" : "bg-blue-500 text-white") : "bg-white/5 text-white/40"}`}>
                    {a.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="label">Match type</label>
              <select className="input w-full" value={match.matchType} onChange={e => upd("matchType", e.target.value)}>
                <option value="qual">Quals</option><option value="semi">Semis</option><option value="final">Finals</option>
              </select>
            </div>
          </div>

          <div className="card p-4 space-y-3">
            <div className="font-mono text-[10px] text-accent tracking-widest">AUTO — {autoScore()} pts</div>
            <div className="flex gap-4 flex-wrap">
              {[["autoLeave", "Leave (3pt)"], ["autoCloseRange", "Close range scoring"], ["autoFarRange", "Far range (+2)"]] .map(([k, l]) => (
                <label key={k} className="flex items-center gap-2 font-mono text-xs text-white/70 cursor-pointer">
                  <input type="checkbox" checked={match[k as keyof MatchForm] as boolean}
                    onChange={e => upd(k as keyof MatchForm, e.target.checked)} className="accent-accent" />
                  {l}
                </label>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Avg balls scored</label><input className="input w-full" type="number" min="0" value={match.avgBallsAuto} onChange={e => upd("avgBallsAuto", e.target.value)} /></div>
              <div><label className="label">High score (balls)</label><input className="input w-full" type="number" min="0" value={match.highBallsAuto} onChange={e => upd("highBallsAuto", e.target.value)} /></div>
            </div>
          </div>

          <div className="card p-4 space-y-3">
            <div className="font-mono text-[10px] text-accent tracking-widest">TELEOP — {teleopScore()} pts</div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Avg balls scored</label><input className="input w-full" type="number" min="0" value={match.avgBallsTeleop} onChange={e => upd("avgBallsTeleop", e.target.value)} /></div>
              <div><label className="label">High score (balls)</label><input className="input w-full" type="number" min="0" value={match.highBallsTeleop} onChange={e => upd("highBallsTeleop", e.target.value)} /></div>
            </div>
          </div>

          <div className="card p-4 space-y-3">
            <div className="font-mono text-[10px] text-accent tracking-widest">ENDGAME — {egScore()} pts</div>
            <div className="grid grid-cols-2 gap-2">
              {ENDGAMES.map(([v, l]) => (
                <button type="button" key={v} onClick={() => upd("endgamePlan", v)}
                  className={`py-2 rounded font-mono text-xs transition-colors ${match.endgamePlan === v ? "bg-accent text-white" : "bg-white/5 text-white/50"}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>

          <div className="card p-4 space-y-2">
            <div className="font-mono text-[10px] text-white/40 tracking-widest">NOTES</div>
            <textarea className="input w-full h-16 resize-none" placeholder="Penalty notes, observations…" value={match.penaltyNotes} onChange={e => upd("penaltyNotes", e.target.value)} />
            <textarea className="input w-full h-16 resize-none" placeholder="General notes…" value={match.generalNotes} onChange={e => upd("generalNotes", e.target.value)} />
          </div>

          <div className="card p-4">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <div>
                <div className="font-mono text-[10px] text-white/40 tracking-widest">FIELD POSITIONS</div>
                <div className="font-mono text-[9px] text-white/30 mt-0.5">Tap where this team scored. Builds the heatmap over time.</div>
              </div>
              <div className="flex gap-1">
                {(["auto", "teleop", "endgame"] as const).map((p) => (
                  <button type="button" key={p} onClick={() => setTapPhase(p)}
                    className={`px-3 py-1 rounded font-mono text-[10px] tracking-widest ${tapPhase === p ? "bg-accent text-white" : "bg-white/5 text-white/50"}`}>
                    {p.toUpperCase()}
                  </button>
                ))}
                {fieldPositions.length > 0 && (
                  <button type="button" onClick={() => setFieldPositions([])} className="px-3 py-1 rounded font-mono text-[10px] tracking-widest bg-white/5 text-white/40 hover:text-ftc-red">
                    CLEAR ({fieldPositions.length})
                  </button>
                )}
              </div>
            </div>
            <svg
              viewBox="0 0 360 240"
              className="w-full rounded border border-white/[0.065] bg-[#0F0F17] cursor-crosshair touch-none"
              onClick={(e) => {
                const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
                const x = (e.clientX - rect.left) / rect.width;
                const y = (e.clientY - rect.top) / rect.height;
                setFieldPositions((prev) => [...prev, { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)), phase: tapPhase }]);
              }}
              role="img"
              aria-label="FTC field diagram. Tap to add position markers."
            >
              {/* Field outline */}
              <rect x="4" y="4" width="352" height="232" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="1" rx="4" />
              <line x1="180" y1="4" x2="180" y2="236" stroke="rgba(255,255,255,0.05)" strokeDasharray="3 3" />
              <line x1="4" y1="120" x2="356" y2="120" stroke="rgba(255,255,255,0.05)" strokeDasharray="3 3" />
              <text x="12" y="18" fill="rgba(255,255,255,0.25)" fontFamily="DM Mono" fontSize="8">AUDIENCE</text>
              <text x="300" y="18" fill="rgba(255,255,255,0.25)" fontFamily="DM Mono" fontSize="8">FAR SIDE</text>
              <text x="12" y="232" fill="rgba(255,255,255,0.25)" fontFamily="DM Mono" fontSize="8">RED</text>
              <text x="320" y="232" fill="rgba(255,255,255,0.25)" fontFamily="DM Mono" fontSize="8">BLUE</text>
              {/* Tap markers */}
              {fieldPositions.map((p, i) => (
                <circle
                  key={i}
                  cx={p.x * 360}
                  cy={p.y * 240}
                  r={6}
                  fill={p.phase === "auto" ? "#5B9CF4" : p.phase === "endgame" ? "#FF5A1F" : "#2DD88A"}
                  fillOpacity={0.65}
                  stroke={p.phase === "auto" ? "#5B9CF4" : p.phase === "endgame" ? "#FF5A1F" : "#2DD88A"}
                  strokeWidth={1}
                />
              ))}
            </svg>
            <div className="flex gap-4 mt-2 font-mono text-[9px] text-white/40">
              <span><span className="inline-block w-2 h-2 rounded-full bg-[#5B9CF4] mr-1" />AUTO</span>
              <span><span className="inline-block w-2 h-2 rounded-full bg-[#2DD88A] mr-1" />TELEOP</span>
              <span><span className="inline-block w-2 h-2 rounded-full bg-[#FF5A1F] mr-1" />ENDGAME</span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="card px-4 py-2">
              <span className="font-mono text-xs text-white/40">TOTAL: </span>
              <span className="font-display text-xl font-black text-accent">{autoScore() + teleopScore() + egScore()}</span>
            </div>
            <button type="submit" disabled={saving || !match.teamNumber} className="btn flex-1">
              {saving ? "Saving…" : "Submit match entry →"}
            </button>
          </div>
        </form>
      )}

      {/* ── PIT SCOUTING ── */}
      {tab === "pit" && (
        <form onSubmit={savePit} className="space-y-5">
          <div>
            <label className="label">Team #</label>
            <input className="input w-40" value={pit.teamNumber} onChange={e => pudp("teamNumber", e.target.value)} placeholder="4042" required />
          </div>

          <div className="card p-4 space-y-3">
            <div className="font-mono text-[10px] text-accent tracking-widest">DRIVETRAIN</div>
            <div className="flex flex-wrap gap-2">
              {DRIVETRAINS.map(d => (
                <button type="button" key={d} onClick={() => pudp("drivetrain", d)}
                  className={`px-3 py-1.5 rounded font-mono text-xs transition-colors ${pit.drivetrain === d ? "bg-accent text-white" : "bg-white/5 text-white/50"}`}>
                  {d}
                </button>
              ))}
            </div>
          </div>

          <div className="card p-4 space-y-3">
            <div className="font-mono text-[10px] text-accent tracking-widest">CAPABILITIES</div>
            <label className="flex items-center gap-2 font-mono text-xs text-white/70 cursor-pointer">
              <input type="checkbox" checked={pit.autoCap} onChange={e => pudp("autoCap", e.target.checked)} className="accent-accent" />
              Auto-capable
            </label>
            <div>
              <label className="label">Endgame plan</label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                {ENDGAMES.map(([v, l]) => (
                  <button type="button" key={v} onClick={() => pudp("endgamePlan", v)}
                    className={`py-2 rounded font-mono text-xs transition-colors ${pit.endgamePlan === v ? "bg-accent text-white" : "bg-white/5 text-white/50"}`}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="label">Mechanical risk (1–5)</label>
              <div className="flex gap-2 mt-1">
                {[1,2,3,4,5].map(n => (
                  <button type="button" key={n} onClick={() => pudp("mechRisk", String(n))}
                    className={`w-9 h-9 rounded font-display font-black text-sm transition-colors ${parseInt(pit.mechRisk) === n ? (n <= 2 ? "bg-ftc-green text-black" : n <= 3 ? "bg-amber-400 text-black" : "bg-red-500 text-white") : "bg-white/5 text-white/40"}`}>
                    {n}
                  </button>
                ))}
              </div>
              <p className="font-mono text-[10px] text-white/30 mt-1">1 = solid, 5 = actively worrying</p>
            </div>
          </div>

          <div className="card p-4 space-y-2">
            <div className="font-mono text-[10px] text-white/40 tracking-widest">PIT NOTES</div>
            {[["autoNotes","Auto observations"], ["teleopNotes","Teleop observations"], ["endgameNotes","Endgame observations"], ["generalNotes","General notes"]].map(([k,ph]) => (
              <textarea key={k} className="input w-full h-14 resize-none text-sm" placeholder={ph}
                value={pit[k as keyof PitForm] as string} onChange={e => pudp(k as keyof PitForm, e.target.value)} />
            ))}
          </div>

          <button type="submit" disabled={saving || !pit.teamNumber} className="btn w-full">
            {saving ? "Saving…" : "Submit pit entry →"}
          </button>
        </form>
      )}

      {/* ── QUICK SCOUT ── */}
      {tab === "quick" && (
        <div className="space-y-5">
          <p className="text-sm text-white/50">Rapid 1-tap scoring for when you're in the stands without time to think. Hit save after each robot.</p>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Team #</label><input className="input w-full" value={quick.teamNumber} onChange={e => setQuick(q => ({ ...q, teamNumber: e.target.value }))} placeholder="4042" /></div>
            <div><label className="label">Match #</label><input className="input w-full" type="number" value={quick.matchNumber} onChange={e => setQuick(q => ({ ...q, matchNumber: e.target.value }))} /></div>
          </div>

          <div className="card p-4 space-y-3">
            <div className="font-mono text-[10px] text-accent tracking-widest">AUTO SCORE: {quick.autoScore}</div>
            <div className="flex gap-2">
              {[0,2,4,6,8,10,12,16,20].map(n => (
                <button key={n} onClick={() => setQuick(q => ({ ...q, autoScore: n }))}
                  className={`px-3 py-2 rounded font-mono text-xs transition-colors ${quick.autoScore === n ? "bg-accent text-white" : "bg-white/5 text-white/50"}`}>
                  {n}
                </button>
              ))}
            </div>
          </div>

          <div className="card p-4 space-y-3">
            <div className="font-mono text-[10px] text-accent tracking-widest">TELEOP SCORE: {quick.teleopScore}</div>
            <div className="flex flex-wrap gap-2">
              {[0,4,8,12,16,20,24,30,36,40,50].map(n => (
                <button key={n} onClick={() => setQuick(q => ({ ...q, teleopScore: n }))}
                  className={`px-3 py-2 rounded font-mono text-xs transition-colors ${quick.teleopScore === n ? "bg-accent text-white" : "bg-white/5 text-white/50"}`}>
                  {n}
                </button>
              ))}
            </div>
          </div>

          <div className="card p-4 space-y-2">
            <div className="font-mono text-[10px] text-accent tracking-widest">ENDGAME</div>
            <div className="grid grid-cols-2 gap-2">
              {ENDGAMES.map(([v, l]) => (
                <button key={v} onClick={() => setQuick(q => ({ ...q, endgame: v }))}
                  className={`py-2 rounded font-mono text-xs transition-colors ${quick.endgame === v ? "bg-accent text-white" : "bg-white/5 text-white/50"}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="card px-4 py-2">
              <span className="font-mono text-xs text-white/40">TOTAL: </span>
              <span className="font-display text-xl font-black text-accent">
                {quick.autoScore + quick.teleopScore + ({ none:0,partial:5,full:10,both:20 }[quick.endgame] ?? 0)}
              </span>
            </div>
            <button onClick={saveQuick} disabled={saving || !quick.teamNumber} className="btn flex-1">
              {saving ? "Saving…" : "Save ↵"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
