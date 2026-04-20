"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { createBrowserClient } from "@supabase/ssr";

const sb = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

type Msg = { role: "user" | "assistant"; content: string; ragUsed?: boolean };
const MODULES = [
  { id:"scout",   label:"Scout Data",  icon:"▣", desc:"Scouted team profiles" },
  { id:"stats",   label:"Live Stats",  icon:"◎", desc:"OPR, rankings, W-L" },
  { id:"forge",   label:"Forge Sim",   icon:"🔮", desc:"Last simulation result" },
  { id:"warroom", label:"War Room",    icon:"🏰", desc:"Alliance board state" },
  { id:"myrobot", label:"My Robot",    icon:"⚡", desc:"Your team profile" },
];

type UsageStats = { orgUsed:number; orgRemaining:number; orgPct:number; userUsed:number; userRemaining:number; userPct:number; requestCount:number; windowHours:number; limits:{ ORG_TOKENS_PER_5H:number; USER_TOKENS_PER_5H:number } };

export default function ARIAPage() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeModules, setActiveModules] = useState(["scout","stats"]);
  const [eventKey, setEventKey] = useState("2025-DECODE-TEST");
  const [orgId, setOrgId] = useState("");
  const [userId, setUserId] = useState("");
  const [streaming, setStreaming] = useState("");
  const [usage, setUsage] = useState<UsageStats|null>(null);
  const [ragAvailable, setRagAvailable] = useState(false);
  const [ragIndexing, setRagIndexing] = useState(false);
  const [rateLimitError, setRateLimitError] = useState<string|null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadUsage = useCallback(async (oid: string) => {
    const res = await fetch(`/api/aria-usage?orgId=${oid}`);
    if (res.ok) setUsage(await res.json());
  }, []);

  useEffect(() => {
    sb.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      setUserId(user.id);
      const { data: m } = await sb.from("org_members").select("org_id").eq("user_id", user.id).maybeSingle();
      if (!m) return;
      setOrgId(m.org_id);
      loadUsage(m.org_id);
      // Check if RAG index exists
      const { count } = await sb.from("scouting_embeddings").select("id", { count: "exact", head: true }).eq("org_id", m.org_id).eq("event_key", eventKey);
      setRagAvailable((count ?? 0) > 0);
    });
  }, [loadUsage, eventKey]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, streaming]);

  function toggleModule(id: string) {
    setActiveModules(prev => prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]);
  }

  async function buildIndex() {
    setRagIndexing(true);
    const res = await fetch("/api/rag", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orgId, eventKey }) });
    const data = await res.json();
    if (res.ok) { setRagAvailable(true); alert(`✓ ${data.message}`); }
    else alert(`RAG indexing failed: ${data.error}`);
    setRagIndexing(false);
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || loading) return;
    setRateLimitError(null);
    const userMsg: Msg = { role: "user", content: input };
    setMessages(prev => [...prev, userMsg]);
    setInput(""); setLoading(true); setStreaming("");

    try {
      const res = await fetch("/api/aria", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [...messages, userMsg], activeModules, eventKey, orgId }),
      });

      if (res.status === 429) {
        const err = await res.json();
        setRateLimitError(err.message);
        setMessages(prev => prev.slice(0, -1)); // remove the user message
        setLoading(false); return;
      }

      if (!res.body) throw new Error("No stream");
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let full = ""; let wasRAG = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const lines = dec.decode(value).split("\n").filter(l => l.startsWith("data:"));
        for (const line of lines) {
          const d = line.slice(5).trim();
          if (d === "[DONE]") break;
          try {
            const p = JSON.parse(d);
            if (p.text) { full += p.text; setStreaming(full); }
            if (p.done) { wasRAG = p.ragUsed; }
            if (p.error) { full = `Error: ${p.error}`; }
          } catch {}
        }
      }
      setMessages(prev => [...prev, { role: "assistant", content: full, ragUsed: wasRAG }]);
      setStreaming("");
      if (orgId) loadUsage(orgId);
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "Connection error. Is your web server running?" }]);
    } finally { setLoading(false); }
  }

  const SUGGESTIONS = [
    "Who should be our first alliance pick?",
    "How do we beat the current #1 seed?",
    "Preview our next match",
    "What teams should go on the DNP list?",
  ];

  return (
    <div className="flex flex-col h-full max-w-4xl mx-auto">
      {/* Header */}
      <div className="p-5 pb-3 border-b border-white/[0.065] flex-shrink-0">
        <div className="flex items-end justify-between flex-wrap gap-3 mb-3">
          <div>
            <p className="font-mono text-[10px] text-accent tracking-widest mb-1">ARIA — STRATEGY AI</p>
            <h1 className="font-display text-3xl font-black tracking-wide">SYNERGY ENGINE</h1>
          </div>
          <div className="flex items-center gap-3">
            <input className="input w-48 text-xs" placeholder="Event key" value={eventKey} onChange={e => setEventKey(e.target.value)} />
            <div className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${ragAvailable ? "bg-ftc-green" : "bg-white/20"}`} />
              <span className="font-mono text-[10px] text-white/40">{ragAvailable ? "RAG ACTIVE" : "FULL CTX"}</span>
            </div>
          </div>
        </div>

        {/* Module toggles */}
        <div className="flex gap-2 flex-wrap items-center">
          <span className="font-mono text-[10px] text-white/30 tracking-widest">CONTEXT:</span>
          {MODULES.map(m => (
            <button key={m.id} onClick={() => toggleModule(m.id)} title={m.desc}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border font-mono text-xs transition-all ${activeModules.includes(m.id) ? "bg-accent/20 border-accent text-accent" : "border-white/10 text-white/40 hover:border-white/20"}`}>
              {m.icon} {m.label}
            </button>
          ))}
          {!ragAvailable && (
            <button onClick={buildIndex} disabled={ragIndexing}
              className="px-3 py-1.5 rounded-lg border border-ftc-blue/40 text-ftc-blue font-mono text-xs hover:bg-ftc-blue/10 transition-colors ml-auto">
              {ragIndexing ? "Indexing…" : "⚡ Build RAG Index"}
            </button>
          )}
        </div>

        {/* Usage bar */}
        {usage && (
          <div className="mt-3 flex items-center gap-4">
            <div className="flex-1">
              <div className="flex justify-between font-mono text-[9px] text-white/30 mb-1">
                <span>Team ({usage.windowHours}h window)</span>
                <span>{usage.orgUsed.toLocaleString()} / {usage.limits.ORG_TOKENS_PER_5H.toLocaleString()} tokens</span>
              </div>
              <div className="h-1 rounded-full bg-surface3 overflow-hidden">
                <div className={`h-full rounded-full transition-all ${usage.orgPct > 80 ? "bg-ftc-red" : usage.orgPct > 60 ? "bg-ftc-amber" : "bg-ftc-green"}`} style={{ width: `${usage.orgPct}%` }} />
              </div>
            </div>
            <div className="flex-1">
              <div className="flex justify-between font-mono text-[9px] text-white/30 mb-1">
                <span>You</span>
                <span>{usage.userUsed.toLocaleString()} / {usage.limits.USER_TOKENS_PER_5H.toLocaleString()} tokens</span>
              </div>
              <div className="h-1 rounded-full bg-surface3 overflow-hidden">
                <div className={`h-full rounded-full transition-all ${usage.userPct > 80 ? "bg-ftc-red" : usage.userPct > 60 ? "bg-ftc-amber" : "bg-accent"}`} style={{ width: `${usage.userPct}%` }} />
              </div>
            </div>
            <span className="font-mono text-[9px] text-white/30">{usage.requestCount} calls</span>
          </div>
        )}
      </div>

      {/* Rate limit error banner */}
      {rateLimitError && (
        <div className="mx-5 mt-3 p-3 bg-ftc-red/10 border border-ftc-red/30 rounded-lg font-mono text-xs text-ftc-red flex-shrink-0">
          ⛔ {rateLimitError}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {messages.length === 0 && !streaming && (
          <div className="text-center py-16 text-white/20">
            <div className="font-display text-5xl font-black mb-3 text-white">ARIA</div>
            <p className="font-mono text-sm mb-1">
              {ragAvailable ? "🟢 RAG active — semantic search over your scouted data" : "Activate RAG for smarter retrieval →"}
            </p>
            <p className="font-mono text-xs text-white/20 mb-8">Ask about alliance selection, match strategy, team analysis, or counter-tactics.</p>
            <div className="grid grid-cols-2 gap-2 max-w-md mx-auto">
              {SUGGESTIONS.map(q => (
                <button key={q} onClick={() => setInput(q)} className="text-left p-3 rounded-lg bg-surface2 hover:bg-surface3 border border-white/10 text-xs text-white/50 hover:text-white transition-colors">{q}</button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : ""}`}>
            <div className={`max-w-[85%] rounded-xl p-4 ${m.role === "user" ? "bg-accent/20 border border-accent/30 rounded-tr-sm" : "bg-surface2 border border-white/[0.065] rounded-tl-sm"}`}>
              {m.role === "assistant" && (
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-mono text-[9px] text-accent tracking-widest">ARIA</span>
                  {m.ragUsed && <span className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-ftc-blue/10 text-ftc-blue border border-ftc-blue/20">RAG</span>}
                </div>
              )}
              <div className="text-sm text-white/90 leading-relaxed whitespace-pre-wrap">{m.content}</div>
            </div>
          </div>
        ))}
        {streaming && (
          <div className="flex">
            <div className="max-w-[85%] bg-surface2 border border-white/[0.065] rounded-xl rounded-tl-sm p-4">
              <div className="font-mono text-[9px] text-accent tracking-widest mb-2">ARIA</div>
              <div className="text-sm text-white/90 leading-relaxed whitespace-pre-wrap">{streaming}<span className="inline-block w-1.5 h-4 bg-accent ml-0.5 animate-pulse" /></div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form onSubmit={send} className="p-4 border-t border-white/[0.065] flex gap-2 flex-shrink-0">
        <input className="input flex-1" placeholder="Ask ARIA anything about your event…" value={input} onChange={e => setInput(e.target.value)} disabled={loading} />
        <button className="btn-primary px-6" disabled={loading || !input.trim()}>
          {loading ? "…" : "Send"}
        </button>
      </form>
    </div>
  );
}
