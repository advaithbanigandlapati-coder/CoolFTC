"use client";
import { useState, useEffect } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";

const sb = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

type OrgData = { id: string; name: string; ftc_team_number: string | null; slug: string };
type Member  = { user_id: string; role: string; profiles: { display_name: string } };
type ByokStatus = {
  mode: "trial" | "own_key" | "locked";
  hasOwnKey: boolean;
  keyPreview: string | null;
  trial: {
    tokensUsed: number; tokensRemaining: number; tokensLimit: number;
    pct: number; daysLeft: number; expiresAt: string; lockedAt: string | null;
  };
};

export default function SettingsPage() {
  const router = useRouter();
  const [user,    setUser]    = useState<{ id: string; email: string; display_name: string } | null>(null);
  const [org,     setOrg]     = useState<OrgData | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [byok,    setByok]    = useState<ByokStatus | null>(null);
  const [orgName, setOrgName] = useState("");
  const [eventKey, setEventKey] = useState("2025-DECODE-TEST");
  const [orgId,   setOrgId]   = useState("");
  const [role,    setRole]    = useState("");

  // Key entry state
  const [apiKeyInput, setApiKeyInput]   = useState("");
  const [keyVisible,  setKeyVisible]    = useState(false);
  const [keyTesting,  setKeyTesting]    = useState(false);
  const [keyStatus,   setKeyStatus]     = useState<"idle" | "ok" | "err">("idle");
  const [keyMsg,      setKeyMsg]        = useState("");
  const [keySaving,   setKeySaving]     = useState(false);

  // Other state
  const [saving,     setSaving]    = useState(false);
  const [syncStatus, setSyncStatus] = useState("");
  const [ragStatus,  setRagStatus]  = useState("");
  const [tab,        setTab]        = useState<"api" | "org" | "event" | "members">("api");

  useEffect(() => {
    sb.auth.getUser().then(async ({ data: { user: u } }) => {
      if (!u) { router.push("/login"); return; }
      setUser({ id: u.id, email: u.email ?? "", display_name: u.user_metadata?.display_name ?? "" });
      const { data: m } = await sb
        .from("org_members")
        .select("org_id, role, organizations(id,name,ftc_team_number,slug)")
        .eq("user_id", u.id)
        .single();
      if (!m) return;
      const o = m.organizations as unknown as OrgData;
      setOrg(o); setOrgName(o.name); setOrgId(o.id); setRole(m.role);
      const { data: mems } = await sb
        .from("org_members")
        .select("user_id, role, profiles(display_name)")
        .eq("org_id", o.id);
      setMembers((mems ?? []) as unknown as Member[]);
      const r = await fetch(`/api/byok?orgId=${o.id}`);
      if (r.ok) setByok(await r.json());
    });
  }, []);

  async function saveOrgName() {
    if (!org) return; setSaving(true);
    await sb.from("organizations").update({ name: orgName }).eq("id", org.id);
    setSaving(false);
  }

  async function syncFTC() {
    if (!orgId || !eventKey) return;
    setSyncStatus("Syncing…");
    // Parse event key "YYYY-EVENTCODE" → { season, eventCode }
    const m = eventKey.match(/^(\d{4})-(.+)$/);
    if (!m) { setSyncStatus("✗ Event key must be YYYY-CODE (e.g. 2025-TXHOU)"); return; }
    const [, season, eventCode] = m;
    try {
      const r = await fetch("/api/ftc-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ season: Number(season), eventCode, orgId }),
      });
      const d = await r.json();
      if (r.ok) setSyncStatus(`✓ Synced ${d.teamsSync ?? 0} teams at ${new Date(d.syncedAt).toLocaleTimeString()}`);
      else      setSyncStatus(`✗ ${d.error ?? "Sync failed"}`);
    } catch (e) {
      setSyncStatus(`✗ ${e instanceof Error ? e.message : "Network error"}`);
    }
  }

  // ── Member management ─────────────────────────────────────────────
  const [inviteEmail, setInviteEmail]     = useState("");
  const [inviteRole,  setInviteRole]      = useState<"admin" | "analyst" | "scout" | "viewer">("scout");
  const [inviteMsg,   setInviteMsg]       = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [inviting,    setInviting]        = useState(false);

  async function refreshMembers() {
    if (!orgId) return;
    const r = await fetch(`/api/org/members?orgId=${orgId}`);
    if (r.ok) {
      const { members: list } = await r.json();
      setMembers((list ?? []) as unknown as Member[]);
    }
  }

  async function inviteMember() {
    if (!inviteEmail.trim() || !orgId) return;
    setInviting(true); setInviteMsg(null);
    try {
      const r = await fetch("/api/org/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId, email: inviteEmail.trim(), role: inviteRole }),
      });
      const d = await r.json();
      if (r.ok) {
        setInviteMsg({ kind: "ok", text: `✓ Added ${d.email} as ${d.role}` });
        setInviteEmail(""); await refreshMembers();
      } else {
        setInviteMsg({ kind: "err", text: d.error ?? "Failed to add member" });
      }
    } catch (e) {
      setInviteMsg({ kind: "err", text: e instanceof Error ? e.message : "Network error" });
    } finally { setInviting(false); }
  }

  async function changeMemberRole(userId: string, newRole: string) {
    if (!orgId) return;
    const r = await fetch("/api/org/members", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgId, userId, role: newRole }),
    });
    if (r.ok) await refreshMembers();
    else { const d = await r.json(); alert(d.error ?? "Failed to update role"); }
  }

  async function removeMember(userId: string, name: string) {
    if (!orgId) return;
    if (!confirm(`Remove ${name} from this org?`)) return;
    const r = await fetch(`/api/org/members?orgId=${orgId}&userId=${userId}`, { method: "DELETE" });
    if (r.ok) await refreshMembers();
    else { const d = await r.json(); alert(d.error ?? "Failed to remove"); }
  }

  async function buildRAG() {
    if (!orgId) return; setRagStatus("Indexing…");
    const r = await fetch("/api/rag", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orgId, eventKey }) });
    const d = await r.json();
    setRagStatus(r.ok ? `✓ ${d.message}` : `Error: ${d.error}`);
  }

  async function testKey() {
    if (!apiKeyInput) return; setKeyTesting(true); setKeyStatus("idle");
    const r = await fetch("/api/byok?test=1", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orgId, key: apiKeyInput }) });
    const d = await r.json();
    setKeyTesting(false);
    if (r.ok) { setKeyStatus("ok"); setKeyMsg(d.message); }
    else { setKeyStatus("err"); setKeyMsg(d.error); }
  }

  async function saveKey() {
    if (!apiKeyInput || keyStatus !== "ok") return;
    setKeySaving(true);
    const r = await fetch("/api/byok", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orgId, key: apiKeyInput }) });
    const d = await r.json();
    if (r.ok) {
      setApiKeyInput(""); setKeyStatus("idle"); setKeyMsg("");
      const r2 = await fetch(`/api/byok?orgId=${orgId}`);
      if (r2.ok) setByok(await r2.json());
    } else { setKeyMsg(d.error); }
    setKeySaving(false);
  }

  async function removeKey() {
    if (!confirm("Remove your API key? ARIA will revert to trial (if still valid) or go locked.")) return;
    const r = await fetch(`/api/byok?orgId=${orgId}`, { method: "DELETE" });
    if (r.ok) { const r2 = await fetch(`/api/byok?orgId=${orgId}`); if (r2.ok) setByok(await r2.json()); }
  }

  const roleColors: Record<string, string> = { admin: "text-accent", analyst: "text-ftc-blue", scout: "text-ftc-green", viewer: "text-white/40" };
  const modeColor = { trial: "text-amber-400", own_key: "text-ftc-green", locked: "text-red-400" };
  const modeLabel = { trial: "Trial", own_key: "Your key", locked: "Locked — key required" };

  return (
    <div className="p-6 max-w-2xl space-y-4">
      <div className="mb-4">
        <p className="font-mono text-[10px] text-accent tracking-widest mb-1">SETTINGS</p>
        <h1 className="font-display text-4xl font-black tracking-wide">CONFIGURATION</h1>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-white/[0.065] mb-2">
        {(["api", "org", "event", "members"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 font-mono text-[11px] tracking-widest transition-colors ${tab === t ? "text-accent border-b border-accent" : "text-white/40 hover:text-white/70"}`}>
            {t.toUpperCase()}
          </button>
        ))}
      </div>

      {/* ── API KEY TAB ── */}
      {tab === "api" && (
        <div className="space-y-4">
          {/* Status banner */}
          {byok && (
            <div className={`card p-4 ${byok.mode === "locked" ? "border-red-500/30" : byok.mode === "own_key" ? "border-ftc-green/30" : "border-amber-400/30"}`}>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="font-mono text-[10px] text-white/40 tracking-widest mb-0.5">ARIA API KEY</div>
                  <div className={`font-display text-xl font-black ${modeColor[byok.mode]}`}>{modeLabel[byok.mode]}</div>
                </div>
                {byok.mode === "trial" && (
                  <div className="text-right">
                    <div className="font-display text-2xl font-black">{byok.trial.daysLeft}d</div>
                    <div className="font-mono text-[9px] text-white/40">TRIAL REMAINING</div>
                  </div>
                )}
              </div>

              {byok.mode === "trial" && (
                <>
                  <div className="flex justify-between font-mono text-[10px] text-white/40 mb-1">
                    <span>{byok.trial.tokensUsed.toLocaleString()} tokens used</span>
                    <span>{byok.trial.pct}%</span>
                  </div>
                  <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full bg-amber-400 rounded-full transition-all" style={{ width: `${byok.trial.pct}%` }} />
                  </div>
                  <p className="font-mono text-[10px] text-white/30 mt-2">
                    {byok.trial.tokensRemaining.toLocaleString()} tokens remaining · expires {new Date(byok.trial.expiresAt).toLocaleDateString()}
                  </p>
                </>
              )}

              {byok.mode === "own_key" && (
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-white/40">{byok.keyPreview}</span>
                  <button onClick={removeKey} className="btn-ghost text-xs text-red-400 hover:text-red-300">Remove key</button>
                </div>
              )}

              {byok.mode === "locked" && (
                <p className="font-mono text-xs text-red-400/70 mt-1">
                  Trial ended. Add your Anthropic API key below to continue using ARIA.
                </p>
              )}
            </div>
          )}

          {/* Key entry — shown to admins */}
          {role === "admin" && byok?.mode !== "own_key" && (
            <div className="card p-4 space-y-3">
              <div className="font-mono text-[10px] text-white/40 tracking-widest">ADD YOUR ANTHROPIC KEY</div>
              <p className="text-xs text-white/50 leading-relaxed">
                Get a key at <a href="https://console.anthropic.com" target="_blank" rel="noopener noreferrer" className="text-accent underline">console.anthropic.com</a>.
                Your key is stored encrypted and never exposed to the client.
              </p>
              <div className="relative">
                <input
                  type={keyVisible ? "text" : "password"}
                  className="input w-full pr-20 font-mono text-sm"
                  placeholder="sk-ant-api03-..."
                  value={apiKeyInput}
                  onChange={e => { setApiKeyInput(e.target.value); setKeyStatus("idle"); setKeyMsg(""); }}
                />
                <button onClick={() => setKeyVisible(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[10px] text-white/40 hover:text-white/70">
                  {keyVisible ? "HIDE" : "SHOW"}
                </button>
              </div>
              {keyMsg && (
                <p className={`font-mono text-xs ${keyStatus === "ok" ? "text-ftc-green" : "text-red-400"}`}>{keyMsg}</p>
              )}
              <div className="flex gap-2">
                <button onClick={testKey} disabled={!apiKeyInput || keyTesting} className="btn-ghost text-sm">
                  {keyTesting ? "Testing…" : "Test key"}
                </button>
                <button onClick={saveKey} disabled={keyStatus !== "ok" || keySaving} className="btn text-sm">
                  {keySaving ? "Saving…" : "Save key →"}
                </button>
              </div>
            </div>
          )}

          {/* How it works */}
          <div className="card p-4 space-y-2">
            <div className="font-mono text-[10px] text-white/40 tracking-widest">HOW ARIA BILLING WORKS</div>
            <div className="space-y-1.5 text-xs text-white/50 leading-relaxed">
              <p>• <span className="text-white/70">Trial:</span> 100,000 tokens free, valid 21 days. Enough for ~2 competitions.</p>
              <p>• <span className="text-white/70">Your key:</span> ARIA uses your Anthropic account directly. You pay only for what you use (~$0.003 per conversation).</p>
              <p>• <span className="text-white/70">Rate limits:</span> 150k tokens/5h per org, 30k/5h per user regardless of key mode.</p>
            </div>
          </div>
        </div>
      )}

      {/* ── ORG TAB ── */}
      {tab === "org" && org && (
        <div className="space-y-4">
          <div className="card p-4 space-y-3">
            <div className="font-mono text-[10px] text-white/40 tracking-widest">ORGANIZATION</div>
            <div className="space-y-2">
              <label className="font-mono text-[10px] text-white/40">NAME</label>
              <div className="flex gap-2">
                <input className="input flex-1" value={orgName} onChange={e => setOrgName(e.target.value)} />
                <button onClick={saveOrgName} disabled={saving} className="btn text-sm">{saving ? "Saving…" : "Save"}</button>
              </div>
            </div>
            <div>
              <label className="font-mono text-[10px] text-white/40">TEAM NUMBER</label>
              <p className="font-mono text-sm text-white/70 mt-1">{org.ftc_team_number ?? "Not set"}</p>
            </div>
            <div>
              <label className="font-mono text-[10px] text-white/40">ORG SLUG</label>
              <p className="font-mono text-sm text-white/40 mt-1">{org.slug}</p>
            </div>
          </div>
        </div>
      )}

      {/* ── EVENT TAB ── */}
      {tab === "event" && (
        <div className="space-y-4">
          <div className="card p-4 space-y-3">
            <div className="font-mono text-[10px] text-white/40 tracking-widest">ACTIVE EVENT</div>
            <div className="flex gap-2">
              <input className="input flex-1" placeholder="Event key e.g. 2025-DECODE-TEST" value={eventKey} onChange={e => setEventKey(e.target.value)} />
            </div>
          </div>
          <div className="card p-4 space-y-3">
            <div className="font-mono text-[10px] text-white/40 tracking-widest">FTC DATA SYNC</div>
            <p className="text-xs text-white/50">Pull rankings, OPR, and match results from FTC Events API + FTCScout.</p>
            <div className="flex gap-2 items-center">
              <button onClick={syncFTC} className="btn-ghost text-sm">↺ Sync event data</button>
              {syncStatus && <span className="font-mono text-xs text-ftc-green">{syncStatus}</span>}
            </div>
          </div>
          <div className="card p-4 space-y-3">
            <div className="font-mono text-[10px] text-white/40 tracking-widest">ARIA RAG INDEX</div>
            <p className="text-xs text-white/50">Build or rebuild the semantic search index so ARIA gets focused context.</p>
            <div className="flex gap-2 items-center">
              <button onClick={buildRAG} className="btn-ghost text-sm">⬡ Build index</button>
              {ragStatus && <span className="font-mono text-xs text-ftc-green">{ragStatus}</span>}
            </div>
          </div>
        </div>
      )}

      {/* ── MEMBERS TAB ── */}
      {tab === "members" && (
        <div className="space-y-4">
          {/* Invite form (admin only) */}
          {role === "admin" && (
            <div className="card p-4 space-y-3">
              <div className="font-mono text-[10px] text-white/40 tracking-widest">INVITE MEMBER</div>
              <p className="text-xs text-white/50">
                The person must have already signed up with this email. They'll be added to your org immediately.
              </p>
              <div className="flex flex-col md:flex-row gap-2">
                <input
                  className="input flex-1"
                  type="email"
                  placeholder="scout@school.edu"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  disabled={inviting}
                />
                <select
                  className="input md:w-32"
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as typeof inviteRole)}
                  disabled={inviting}
                >
                  <option value="scout">Scout</option>
                  <option value="analyst">Analyst</option>
                  <option value="admin">Admin</option>
                  <option value="viewer">Viewer</option>
                </select>
                <button
                  onClick={inviteMember}
                  disabled={inviting || !inviteEmail.trim()}
                  className="btn-primary text-sm whitespace-nowrap"
                >
                  {inviting ? "Adding…" : "Add Member →"}
                </button>
              </div>
              {inviteMsg && (
                <div className={`font-mono text-xs ${inviteMsg.kind === "ok" ? "text-ftc-green" : "text-ftc-red"}`}>
                  {inviteMsg.text}
                </div>
              )}
            </div>
          )}

          {/* Members table */}
          <div className="card overflow-hidden">
            <div className="grid grid-cols-[1fr_140px_100px] bg-white/[0.04] border-b border-white/[0.065]">
              {["MEMBER", "ROLE", ""].map((h) => (
                <div key={h} className="px-4 py-2 font-mono text-[9px] text-white/40 tracking-widest">{h}</div>
              ))}
            </div>
            {members.map((m) => {
              const name = (m.profiles as unknown as { display_name: string }).display_name;
              const isSelf = m.user_id === user?.id;
              return (
                <div key={m.user_id} className="grid grid-cols-[1fr_140px_100px] border-b border-white/[0.04] last:border-0 items-center">
                  <div className="px-4 py-3 font-mono text-xs text-white/70">
                    {name}
                    {isSelf && <span className="text-white/30 ml-2">(you)</span>}
                  </div>
                  <div className="px-4 py-3">
                    {role === "admin" ? (
                      <select
                        className="input text-xs py-1 font-mono"
                        value={m.role}
                        onChange={(e) => changeMemberRole(m.user_id, e.target.value)}
                      >
                        <option value="admin">admin</option>
                        <option value="analyst">analyst</option>
                        <option value="scout">scout</option>
                        <option value="viewer">viewer</option>
                      </select>
                    ) : (
                      <span className={`font-mono text-xs ${roleColors[m.role] ?? "text-white/40"}`}>{m.role}</span>
                    )}
                  </div>
                  <div className="px-4 py-3">
                    {(role === "admin" || isSelf) && (
                      <button
                        onClick={() => removeMember(m.user_id, name)}
                        className="font-mono text-[10px] text-white/30 hover:text-ftc-red transition-colors"
                      >
                        {isSelf ? "Leave" : "Remove"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            {members.length === 0 && (
              <div className="px-4 py-8 text-center text-white/30 text-xs font-mono">No members yet.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
