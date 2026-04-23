"use client";
import { useState, useEffect } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";
import { EventPicker } from "../../components/EventPicker";

const sb = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

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
  const [eventKey, setEventKey] = useState("");
  const [orgId,   setOrgId]   = useState("");
  const [role,    setRole]    = useState("");
  const [noOrg,   setNoOrg]   = useState(false);
  const [authLoaded, setAuthLoaded] = useState(false);

  // Create-org recovery form
  const [newOrgName, setNewOrgName] = useState("");
  const [newOrgTeam, setNewOrgTeam] = useState("");
  const [creatingOrg, setCreatingOrg] = useState(false);
  const [createOrgErr, setCreateOrgErr] = useState("");

  // Join-org by invite code
  const [joinMode, setJoinMode] = useState<"create" | "join">("create");
  const [joinEmail, setJoinEmail] = useState("");

  // BYOK key entry
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [keyVisible,  setKeyVisible]  = useState(false);
  const [keyTesting,  setKeyTesting]  = useState(false);
  const [keyStatus,   setKeyStatus]   = useState<"idle" | "ok" | "err">("idle");
  const [keyMsg,      setKeyMsg]      = useState("");
  const [keySaving,   setKeySaving]   = useState(false);

  // Other state
  const [saving,     setSaving]    = useState(false);
  const [syncStatus, setSyncStatus] = useState("");
  const [ragStatus,  setRagStatus]  = useState("");
  const [tab, setTab] = useState<"api" | "org" | "event" | "members">("api");

  useEffect(() => {
    sb.auth.getUser().then(async ({ data: { user: u } }) => {
      if (!u) { router.push("/login"); return; }
      setUser({ id: u.id, email: u.email ?? "", display_name: u.user_metadata?.display_name ?? "" });

      // Check for pending org from email-confirmation flow (stored in localStorage)
      const pendingRaw = typeof window !== "undefined" ? localStorage.getItem("pendingOrg") : null;

      const { data: m } = await sb
        .from("org_members")
        .select("org_id, role, organizations(id,name,ftc_team_number,slug)")
        .eq("user_id", u.id)
        .maybeSingle();

      if (!m) {
        // Try to create org from pending localStorage stash
        if (pendingRaw) {
          try {
            const pending = JSON.parse(pendingRaw) as { name: string; teamNumber: string | null; userId: string };
            if (pending.userId === u.id) {
              const slug = pending.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") + "-" + Date.now();
              const { data: newOrg } = await sb
                .from("organizations")
                .insert({ name: pending.name, ftc_team_number: pending.teamNumber, slug, created_by: u.id })
                .select("id,name,ftc_team_number,slug")
                .single();
              if (newOrg) {
                await sb.from("org_members").insert({ org_id: newOrg.id, user_id: u.id, role: "admin" });
                localStorage.removeItem("pendingOrg");
                setOrg(newOrg as OrgData);
                setOrgName(newOrg.name);
                setOrgId(newOrg.id);
                setRole("admin");
                setAuthLoaded(true);
                return;
              }
            }
          } catch { /* JSON parse failed */ }
        }
        setNoOrg(true);
        setAuthLoaded(true);
        return;
      }

      const o = m.organizations as unknown as OrgData;
      setOrg(o); setOrgName(o.name); setOrgId(o.id); setRole(m.role);

      // Load active event key from org
      const { data: orgFull } = await sb
        .from("organizations")
        .select("active_event_key")
        .eq("id", o.id)
        .maybeSingle();
      if (orgFull?.active_event_key) setEventKey(orgFull.active_event_key as string);

      const { data: mems } = await sb
        .from("org_members")
        .select("user_id, role, profiles(display_name)")
        .eq("org_id", o.id);
      setMembers((mems ?? []) as unknown as Member[]);

      const r = await fetch(`/api/byok?orgId=${o.id}`);
      if (r.ok) setByok(await r.json());

      setAuthLoaded(true);
    });
  }, []);

  async function createOrg() {
    if (!newOrgName.trim() || !user) return;
    setCreatingOrg(true); setCreateOrgErr("");
    const slug = newOrgName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") + "-" + Date.now();
    const { data: newOrg, error: orgErr } = await sb
      .from("organizations")
      .insert({ name: newOrgName.trim(), ftc_team_number: newOrgTeam.trim() || null, slug, created_by: user.id })
      .select("id,name,ftc_team_number,slug")
      .single();
    if (orgErr || !newOrg) {
      setCreateOrgErr(orgErr?.message ?? "Failed to create org. Try again.");
      setCreatingOrg(false); return;
    }
    await sb.from("org_members").insert({ org_id: newOrg.id, user_id: user.id, role: "admin" });
    setOrg(newOrg as OrgData); setOrgName(newOrg.name); setOrgId(newOrg.id); setRole("admin");
    setNoOrg(false); setCreatingOrg(false);
  }

  async function saveOrgName() {
    if (!org) return; setSaving(true);
    await sb.from("organizations").update({ name: orgName }).eq("id", org.id);
    setSaving(false);
  }

  async function saveEventKey(key: string) {
    setEventKey(key);
    if (!orgId || !key) return;
    await sb.from("organizations").update({ active_event_key: key }).eq("id", orgId);
  }

  async function syncFTC() {
    if (!orgId || !eventKey) return;
    setSyncStatus("Syncing…");
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

  // ── Member management ──────────────────────────────────────────────
  const [inviteEmail,  setInviteEmail]  = useState("");
  const [inviteRole,   setInviteRole]   = useState<"admin" | "analyst" | "scout" | "viewer">("scout");
  const [inviteMsg,    setInviteMsg]    = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [inviting,     setInviting]     = useState(false);

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
    const r = await fetch("/api/rag", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgId, eventKey }),
    });
    const d = await r.json();
    setRagStatus(r.ok ? `✓ ${d.message}` : `Error: ${d.error}`);
  }

  async function testKey() {
    if (!apiKeyInput) return; setKeyTesting(true); setKeyStatus("idle");
    const r = await fetch("/api/byok?test=1", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgId, key: apiKeyInput }),
    });
    const d = await r.json();
    setKeyTesting(false);
    if (r.ok) { setKeyStatus("ok"); setKeyMsg(d.message); }
    else { setKeyStatus("err"); setKeyMsg(d.error); }
  }

  async function saveKey() {
    if (!apiKeyInput || keyStatus !== "ok") return;
    setKeySaving(true);
    const r = await fetch("/api/byok", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgId, key: apiKeyInput }),
    });
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

  const roleColors: Record<string, string> = {
    admin: "text-accent", analyst: "text-ftc-blue", scout: "text-ftc-green", viewer: "text-white/40",
  };
  const modeColor = { trial: "text-amber-400", own_key: "text-ftc-green", locked: "text-red-400" };
  const modeLabel = { trial: "Trial", own_key: "Your key", locked: "Locked — key required" };

  // ── No org recovery screen ──────────────────────────────────────────
  if (authLoaded && noOrg) {
    return (
      <div className="p-6 max-w-lg">
        <div className="mb-6">
          <p className="font-mono text-[10px] text-accent tracking-widest mb-1">SETTINGS</p>
          <h1 className="font-display text-4xl font-black tracking-wide">SETUP REQUIRED</h1>
        </div>

        <div className="card p-6 border border-accent/20 mb-4">
          <div className="font-mono text-[10px] text-accent tracking-widest mb-3">YOUR ACCOUNT ISN&apos;T LINKED TO A TEAM</div>
          <p className="text-sm text-white/60 mb-4 leading-relaxed">
            You can create a new team/organization, or ask a teammate to add you from their Settings → Members tab once you tell them your email:
            <span className="block font-mono text-white/80 mt-1">{user?.email}</span>
          </p>

          {/* Toggle */}
          <div className="flex gap-1 mb-5 border-b border-white/[0.065]">
            {(["create", "join"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setJoinMode(m)}
                className={`px-4 py-2 font-mono text-[11px] tracking-widest transition-colors ${joinMode === m ? "text-accent border-b border-accent" : "text-white/40 hover:text-white/70"}`}
              >
                {m === "create" ? "CREATE ORG" : "JOIN EXISTING"}
              </button>
            ))}
          </div>

          {joinMode === "create" && (
            <div className="space-y-3">
              <div>
                <label className="font-mono text-[10px] text-white/40 tracking-widest block mb-1.5">TEAM / ORG NAME</label>
                <input
                  className="input w-full"
                  value={newOrgName}
                  onChange={(e) => setNewOrgName(e.target.value)}
                  placeholder="Cool Name Pending"
                />
              </div>
              <div>
                <label className="font-mono text-[10px] text-white/40 tracking-widest block mb-1.5">
                  FTC TEAM NUMBER <span className="text-white/20">(optional)</span>
                </label>
                <input
                  className="input w-full"
                  value={newOrgTeam}
                  onChange={(e) => setNewOrgTeam(e.target.value)}
                  placeholder="30439"
                  inputMode="numeric"
                />
              </div>
              {createOrgErr && <p className="font-mono text-xs text-red-400">{createOrgErr}</p>}
              <button
                onClick={createOrg}
                disabled={!newOrgName.trim() || creatingOrg}
                className="btn w-full justify-center"
              >
                {creatingOrg ? "Creating…" : "Create Team →"}
              </button>
            </div>
          )}

          {joinMode === "join" && (
            <div className="space-y-3">
              <p className="text-sm text-white/50 leading-relaxed">
                Have a teammate add you from their <span className="text-white/70">Settings → Members</span> tab.
                Give them your account email:
              </p>
              <div className="bg-white/[0.04] border border-white/[0.065] rounded-lg px-4 py-3 font-mono text-sm text-white/80 select-all">
                {user?.email}
              </div>
              <p className="font-mono text-[10px] text-white/30">
                Once they add you, refresh this page and you&apos;ll be set.
              </p>
              <button onClick={() => window.location.reload()} className="btn-ghost w-full justify-center text-sm">
                Refresh →
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl space-y-4">
      <div className="mb-4">
        <p className="font-mono text-[10px] text-accent tracking-widest mb-1">SETTINGS</p>
        <h1 className="font-display text-4xl font-black tracking-wide">CONFIGURATION</h1>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-white/[0.065] mb-2">
        {(["api", "org", "event", "members"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 font-mono text-[11px] tracking-widest transition-colors ${tab === t ? "text-accent border-b border-accent" : "text-white/40 hover:text-white/70"}`}
          >
            {t.toUpperCase()}
          </button>
        ))}
      </div>

      {/* ── API KEY TAB ── */}
      {tab === "api" && (
        <div className="space-y-4">
          {/* Status banner — shown once loaded */}
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
                    {byok.trial.tokensRemaining.toLocaleString()} tokens remaining · expires{" "}
                    {new Date(byok.trial.expiresAt).toLocaleDateString()}
                  </p>
                </>
              )}

              {byok.mode === "own_key" && (
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-white/40">{byok.keyPreview}</span>
                  {role === "admin" && (
                    <button onClick={removeKey} className="btn-ghost text-xs text-red-400 hover:text-red-300">
                      Remove key
                    </button>
                  )}
                </div>
              )}

              {byok.mode === "locked" && (
                <p className="font-mono text-xs text-red-400/70 mt-1">
                  Trial ended. Add your Anthropic API key below to continue using ARIA.
                </p>
              )}
            </div>
          )}

          {/* Key entry — shown to admins, or any user if no org/byok yet */}
          {(role === "admin" || !orgId) && byok?.mode !== "own_key" && (
            <div className="card p-4 space-y-3">
              <div className="font-mono text-[10px] text-white/40 tracking-widest">ADD YOUR ANTHROPIC KEY</div>
              <p className="text-xs text-white/50 leading-relaxed">
                Get a key at{" "}
                <a href="https://console.anthropic.com" target="_blank" rel="noopener noreferrer" className="text-accent underline">
                  console.anthropic.com
                </a>
                . Your key is stored encrypted and never exposed to the client.
              </p>
              <div className="relative">
                <input
                  type={keyVisible ? "text" : "password"}
                  className="input w-full pr-20 font-mono text-sm"
                  placeholder="sk-ant-api03-…"
                  value={apiKeyInput}
                  onChange={(e) => { setApiKeyInput(e.target.value); setKeyStatus("idle"); setKeyMsg(""); }}
                />
                <button
                  onClick={() => setKeyVisible((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[10px] text-white/40 hover:text-white/70"
                >
                  {keyVisible ? "HIDE" : "SHOW"}
                </button>
              </div>
              {keyMsg && (
                <p className={`font-mono text-xs ${keyStatus === "ok" ? "text-ftc-green" : "text-red-400"}`}>
                  {keyMsg}
                </p>
              )}
              <div className="flex gap-2">
                <button
                  onClick={testKey}
                  disabled={!apiKeyInput || keyTesting}
                  className="btn-ghost text-sm"
                >
                  {keyTesting ? "Testing…" : "Test key"}
                </button>
                <button
                  onClick={saveKey}
                  disabled={keyStatus !== "ok" || keySaving || !orgId}
                  className="btn text-sm"
                >
                  {keySaving ? "Saving…" : "Save key →"}
                </button>
              </div>
              {!orgId && (
                <p className="font-mono text-[10px] text-amber-400">Create an org first to save an API key.</p>
              )}
            </div>
          )}

          {/* How it works */}
          <div className="card p-4 space-y-2">
            <div className="font-mono text-[10px] text-white/40 tracking-widest">HOW ARIA BILLING WORKS</div>
            <div className="space-y-1.5 text-xs text-white/50 leading-relaxed">
              <p>• <span className="text-white/70">Trial:</span> 100,000 tokens free, valid 21 days. Enough for ~2 competitions.</p>
              <p>• <span className="text-white/70">Your key:</span> ARIA uses your Anthropic account directly. You pay only for what you use (~$0.003/conversation).</p>
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
                <input className="input flex-1" value={orgName} onChange={(e) => setOrgName(e.target.value)} />
                <button onClick={saveOrgName} disabled={saving} className="btn text-sm">
                  {saving ? "Saving…" : "Save"}
                </button>
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
            <EventPicker value={eventKey} onChange={saveEventKey} />
            <p className="font-mono text-[10px] text-white/30">
              Type a code directly, or click <span className="text-accent">Find →</span> to search by event name.
              Format: <span className="text-white/60">2025-USCAFFFAQ</span>
            </p>
            {eventKey ? (
              <p className="font-mono text-[11px] text-ftc-green">✓ Active: {eventKey}</p>
            ) : (
              <p className="font-mono text-[11px] text-amber-400">⚠ No event set — analytics and sync require an active event.</p>
            )}
          </div>
          <div className="card p-4 space-y-3">
            <div className="font-mono text-[10px] text-white/40 tracking-widest">FTC DATA SYNC</div>
            <p className="text-xs text-white/50">
              Pull live rankings, OPR, and match results from FIRST FTC Events API + FTCScout into your local cache.
              Requires FTC_API_KEY / FTC_API_SECRET set on server.
            </p>
            <div className="flex gap-2 items-center flex-wrap">
              <button onClick={syncFTC} disabled={!eventKey} className="btn-ghost text-sm">
                ↺ Sync event data
              </button>
              {syncStatus && (
                <span className={`font-mono text-xs ${syncStatus.startsWith("✓") ? "text-ftc-green" : "text-red-400"}`}>
                  {syncStatus}
                </span>
              )}
            </div>
            {!eventKey && (
              <p className="font-mono text-[10px] text-amber-400">Set an active event key above first.</p>
            )}
          </div>
          <div className="card p-4 space-y-3">
            <div className="font-mono text-[10px] text-white/40 tracking-widest">ARIA RAG INDEX</div>
            <p className="text-xs text-white/50">
              Build the semantic search index so ARIA gets focused context from your scouting data.
            </p>
            <div className="flex gap-2 items-center">
              <button onClick={buildRAG} disabled={!eventKey} className="btn-ghost text-sm">
                ⬡ Build index
              </button>
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
                The person must already have a CoolFTC account. They&apos;ll be added immediately.
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

          {role !== "admin" && (
            <div className="card p-4">
              <div className="font-mono text-[10px] text-white/40 tracking-widest mb-2">YOUR MEMBERSHIP</div>
              <p className="text-xs text-white/50">
                Only admins can invite members. Ask your org admin to add teammates.
                Share your email with them: <span className="text-white/70 font-mono">{user?.email}</span>
              </p>
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
