"use client";
import { useState, useEffect, useCallback } from "react";
import { createBrowserClient } from "@supabase/ssr";

const sb = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type EditionType = "quals_recap" | "elim_recap" | "daily" | "robot_spotlight" | "hot_takes";
type Edition = {
  id: string;
  edition_type: EditionType;
  team_number: string | null;
  content: string;
  generated_at: string;
  generated_by: string;
};

const TYPES: { id: EditionType; label: string; icon: string; desc: string }[] = [
  { id: "quals_recap",     label: "Quals Recap",     icon: "◈", desc: "Post-qualification summary — top performers, upsets, elim preview" },
  { id: "elim_recap",      label: "Elim Recap",      icon: "🏆", desc: "Elimination rounds narrative with key matches and final standings" },
  { id: "daily",           label: "Daily Wrap",      icon: "◐", desc: "End-of-day hits: top performer, biggest OPR swing, one to watch" },
  { id: "robot_spotlight", label: "Robot Spotlight", icon: "⚡", desc: "Deep feature on one standout robot — requires team number" },
  { id: "hot_takes",       label: "Hot Takes",       icon: "🔥", desc: "3-4 opinionated takes on event trends, bold predictions" },
];

const LABELS: Record<EditionType, string> = {
  quals_recap: "Quals Recap",
  elim_recap: "Elim Recap",
  daily: "Daily Wrap",
  robot_spotlight: "Robot Spotlight",
  hot_takes: "Hot Takes",
};

// Minimal markdown-ish renderer — handles headings, bold, italic, paragraphs
function renderContent(md: string) {
  const blocks = md.split(/\n\n+/);
  return blocks.map((b, i) => {
    const trimmed = b.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith("### ")) return <h3 key={i} className="font-display text-lg font-black text-white mt-4 mb-2">{trimmed.slice(4)}</h3>;
    if (trimmed.startsWith("## "))  return <h2 key={i} className="font-display text-2xl font-black text-white mt-5 mb-2 tracking-wide">{trimmed.slice(3)}</h2>;
    if (trimmed.startsWith("# "))   return <h1 key={i} className="font-display text-3xl font-black text-white mt-6 mb-3 tracking-wide">{trimmed.slice(2)}</h1>;
    // inline bold / italic
    const parts = trimmed.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
    return (
      <p key={i} className="text-white/80 leading-relaxed mb-3 text-[14px]">
        {parts.map((p, j) => {
          if (p.startsWith("**") && p.endsWith("**")) return <strong key={j} className="text-white font-bold">{p.slice(2,-2)}</strong>;
          if (p.startsWith("*") && p.endsWith("*"))   return <em key={j} className="text-accent">{p.slice(1,-1)}</em>;
          return <span key={j}>{p}</span>;
        })}
      </p>
    );
  });
}

export default function CourierPage() {
  const [orgId, setOrgId] = useState("");
  const [orgName, setOrgName] = useState("");
  const [eventKey, setEventKey] = useState("2025-DECODE-TEST");
  const [eventName, setEventName] = useState("");
  const [editions, setEditions] = useState<Edition[]>([]);
  const [selected, setSelected] = useState<Edition | null>(null);
  const [genType, setGenType] = useState<EditionType | null>(null);
  const [teamInput, setTeamInput] = useState("");
  const [generating, setGenerating] = useState(false);
  const [streaming, setStreaming] = useState("");
  const [error, setError] = useState<string | null>(null);

  const loadEditions = useCallback(async (oid: string, ek: string) => {
    const r = await fetch(`/api/courier?orgId=${oid}&eventKey=${encodeURIComponent(ek)}`);
    if (r.ok) { const { editions } = await r.json(); setEditions(editions ?? []); }
  }, []);

  useEffect(() => {
    sb.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data: m } = await sb.from("org_members")
        .select("org_id, organizations(name)").eq("user_id", user.id).maybeSingle();
      if (!m) return;
      setOrgId(m.org_id);
      setOrgName((m.organizations as unknown as { name: string } | null)?.name ?? "");
      loadEditions(m.org_id, eventKey);
      const { data: ev } = await sb.from("events").select("name").eq("event_key", eventKey).maybeSingle();
      setEventName(ev?.name ?? eventKey);
    });
  }, [eventKey, loadEditions]);

  async function generate(type: EditionType) {
    if (!orgId) return;
    if (type === "robot_spotlight" && !teamInput.trim()) {
      setError("Robot Spotlight requires a team number."); return;
    }
    setError(null); setGenerating(true); setStreaming(""); setSelected(null); setGenType(type);

    try {
      const res = await fetch("/api/courier", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orgId, eventKey, editionType: type,
          teamNumber: type === "robot_spotlight" ? teamInput.trim() : undefined,
        }),
      });
      if (!res.body) throw new Error("No response stream");
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const body = line.slice(6);
          if (body === "[DONE]") continue;
          try {
            const obj = JSON.parse(body);
            if (obj.error) { setError(obj.error); break; }
            if (obj.text) setStreaming((prev) => prev + obj.text);
            if (obj.done) { await loadEditions(orgId, eventKey); }
          } catch { /* ignore malformed */ }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setGenerating(false);
      setGenType(null);
    }
  }

  async function deleteEdition(id: string) {
    if (!confirm("Delete this edition?")) return;
    const r = await fetch(`/api/courier?id=${id}`, { method: "DELETE" });
    if (r.ok) {
      setEditions((es) => es.filter((e) => e.id !== id));
      if (selected?.id === id) setSelected(null);
    } else {
      const j = await r.json();
      alert(j.error ?? "Delete failed");
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <p className="font-mono text-[10px] text-accent tracking-widest uppercase mb-1">◪ The Courier</p>
        <h1 className="font-display text-5xl font-black tracking-wide text-white">
          THE CNP <span className="text-accent">NEWSPAPER</span>
        </h1>
        <p className="font-mono text-xs text-white/40 mt-2">
          {orgName}{eventName && ` · ${eventName}`} · AI-generated editions
        </p>
      </div>

      {/* Event + controls */}
      <div className="card p-5 mb-6">
        <div className="flex items-center gap-3 mb-5">
          <label className="font-mono text-[10px] text-white/40 tracking-widest">EVENT KEY</label>
          <input
            className="input max-w-xs"
            value={eventKey}
            onChange={(e) => setEventKey(e.target.value)}
            placeholder="2025-DECODE-TEST"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {TYPES.map((t) => {
            const active = generating && genType === t.id;
            return (
              <div key={t.id} className="bg-bg3 border border-white/10 rounded-lg p-4 hover:border-accent/40 transition-colors">
                <div className="flex items-start gap-3 mb-2">
                  <div className="w-8 h-8 rounded bg-accent/10 flex items-center justify-center text-base">{t.icon}</div>
                  <div className="flex-1">
                    <div className="font-display text-base font-black tracking-wide">{t.label.toUpperCase()}</div>
                    <div className="text-[11px] text-white/50 leading-snug mt-0.5">{t.desc}</div>
                  </div>
                </div>
                {t.id === "robot_spotlight" && (
                  <input
                    className="input text-xs mt-2"
                    placeholder="Team number e.g. 23901"
                    value={teamInput}
                    onChange={(e) => setTeamInput(e.target.value)}
                    disabled={generating}
                  />
                )}
                <button
                  onClick={() => generate(t.id)}
                  disabled={generating}
                  className="btn-primary w-full justify-center mt-3 text-xs"
                >
                  {active ? "Writing…" : generating ? "Waiting…" : "Generate →"}
                </button>
              </div>
            );
          })}
        </div>

        {error && (
          <div className="mt-4 bg-ftc-red/10 border border-ftc-red/30 rounded-lg p-3 text-ftc-red text-sm font-mono">
            {error}
          </div>
        )}
      </div>

      {/* Streaming output */}
      {generating && streaming && (
        <div className="card p-6 mb-6 border-accent/30">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-2 h-2 rounded-full bg-accent animate-pulse"></span>
            <span className="font-mono text-[10px] text-accent tracking-widest uppercase">LIVE DRAFT</span>
          </div>
          <div className="prose-courier">{renderContent(streaming)}</div>
        </div>
      )}

      {/* Main layout: archive + reader */}
      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
        {/* Archive sidebar */}
        <div className="card p-4">
          <div className="font-mono text-[10px] text-white/40 tracking-widest uppercase mb-3">
            ARCHIVE · {editions.length}
          </div>
          {editions.length === 0 && (
            <div className="text-white/30 text-xs text-center py-8">
              No editions yet.<br/>Generate one above.
            </div>
          )}
          <div className="flex flex-col gap-1.5 max-h-[70vh] overflow-y-auto">
            {editions.map((e) => {
              const active = selected?.id === e.id;
              return (
                <button
                  key={e.id}
                  onClick={() => setSelected(e)}
                  className={`text-left px-3 py-2.5 rounded-lg border transition-colors ${
                    active ? "border-accent bg-accent/10" : "border-white/10 hover:border-white/20 hover:bg-white/[0.03]"
                  }`}
                >
                  <div className={`font-display text-sm font-black tracking-wide ${active ? "text-accent" : "text-white"}`}>
                    {LABELS[e.edition_type]}
                    {e.team_number && <span className="text-white/40 font-normal font-mono text-xs ml-1">#{e.team_number}</span>}
                  </div>
                  <div className="text-[10px] text-white/30 font-mono mt-0.5">
                    {new Date(e.generated_at).toLocaleString([], {
                      month: "short", day: "numeric",
                      hour: "2-digit", minute: "2-digit",
                    })}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Reader */}
        <div className="card p-6 min-h-[500px]">
          {selected ? (
            <>
              <div className="flex items-start justify-between mb-4 pb-4 border-b border-white/10">
                <div>
                  <p className="font-mono text-[10px] text-accent tracking-widest uppercase mb-1">
                    {LABELS[selected.edition_type]}
                    {selected.team_number && ` · Team #${selected.team_number}`}
                  </p>
                  <p className="font-mono text-[11px] text-white/40">
                    {new Date(selected.generated_at).toLocaleString()}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => navigator.clipboard.writeText(selected.content)}
                    className="btn-ghost text-xs"
                  >Copy</button>
                  <button
                    onClick={() => window.print()}
                    className="btn-ghost text-xs"
                  >Print</button>
                  <button
                    onClick={() => deleteEdition(selected.id)}
                    className="btn-ghost text-xs text-ftc-red hover:border-ftc-red/40"
                  >Delete</button>
                </div>
              </div>
              <article className="prose-courier">{renderContent(selected.content)}</article>
            </>
          ) : (
            <div className="h-full flex items-center justify-center text-center text-white/30 text-sm">
              <div>
                <div className="text-5xl mb-3">◪</div>
                <div>Pick an edition from the archive, or generate a new one above.</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
