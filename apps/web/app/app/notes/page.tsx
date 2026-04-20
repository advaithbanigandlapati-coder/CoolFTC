"use client";
import { useState, useEffect } from "react";
import { createBrowserClient } from "@supabase/ssr";

const sb = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

type Note = {
  id: string; team_number: string | null; content: { text?: string };
  tags: string[]; is_pinned: boolean; created_at: string;
  profiles?: { display_name: string } | null;
};

const QUICK_TAGS = ["auto issue", "defense risk", "alliance target", "pit flag", "endgame capable", "penalty risk", "worlds threat"];
type Tab = "all" | "notebook";

export default function NotesPage() {
  const [orgId,   setOrgId]   = useState("");
  const [userId,  setUserId]  = useState("");
  const [eventKey,setEventKey]= useState("2025-DECODE-TEST");
  const [notes,   setNotes]   = useState<Note[]>([]);
  const [search,  setSearch]  = useState("");
  const [tagFilter,setTagFilter]=useState<string|null>(null);
  const [tab,     setTab]     = useState<Tab>("all");
  const [saving,  setSaving]  = useState(false);

  const [form, setForm] = useState({ team: "", text: "", tags: [] as string[] });

  const load = async (oid: string) => {
    const { data } = await sb
      .from("notes")
      .select("*, profiles(display_name)")
      .eq("org_id", oid)
      .eq("event_key", eventKey)
      .order("is_pinned", { ascending: false })
      .order("created_at", { ascending: false });
    setNotes((data as Note[]) ?? []);
  };

  useEffect(() => {
    sb.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      setUserId(user.id);
      const { data: m } = await sb.from("org_members").select("org_id").eq("user_id", user.id).single();
      if (!m) return;
      setOrgId(m.org_id);
      await load(m.org_id);
    });
  }, [eventKey]);

  // Realtime
  useEffect(() => {
    if (!orgId) return;
    const ch = sb.channel(`notes:${orgId}:${eventKey}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notes", filter: `org_id=eq.${orgId}` }, () => load(orgId))
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [orgId, eventKey]);

  async function addNote(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId || !form.text) return;
    setSaving(true);
    await sb.from("notes").insert({
      org_id: orgId, event_key: eventKey, team_number: form.team || null,
      author_id: userId, content: { text: form.text }, tags: form.tags, is_pinned: false,
    });
    await load(orgId);
    setForm({ team: "", text: "", tags: [] });
    setSaving(false);
  }

  async function togglePin(id: string, pinned: boolean) {
    await sb.from("notes").update({ is_pinned: !pinned }).eq("id", id);
    setNotes(ns => ns.map(n => n.id === id ? { ...n, is_pinned: !pinned } : n));
  }

  async function deleteNote(id: string) {
    await sb.from("notes").delete().eq("id", id);
    setNotes(ns => ns.filter(n => n.id !== id));
  }

  function toggleTag(t: string) {
    setForm(f => ({
      ...f,
      tags: f.tags.includes(t) ? f.tags.filter(x => x !== t) : [...f.tags, t]
    }));
  }

  const filtered = notes.filter(n => {
    const matchesSearch = !search || n.content.text?.toLowerCase().includes(search.toLowerCase()) || n.team_number?.includes(search);
    const matchesTag = !tagFilter || n.tags?.includes(tagFilter);
    return matchesSearch && matchesTag;
  });

  // Notebook mode: group by team
  const byTeam = Object.entries(
    filtered.reduce<Record<string, Note[]>>((acc, n) => {
      const k = n.team_number ?? "General";
      (acc[k] = acc[k] ?? []).push(n);
      return acc;
    }, {})
  ).sort(([a], [b]) => a === "General" ? 1 : b === "General" ? -1 : a.localeCompare(b));

  const allTags = [...new Set(notes.flatMap(n => n.tags ?? []))];

  return (
    <div className="p-6 max-w-3xl">
      <div className="mb-4">
        <p className="font-mono text-[10px] text-accent tracking-widest mb-1">STRATEGY</p>
        <h1 className="font-display text-4xl font-black tracking-wide">NOTES</h1>
      </div>

      {/* Controls */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <input className="input w-48" placeholder="Event key" value={eventKey} onChange={e => setEventKey(e.target.value)} />
        <input className="input flex-1 min-w-40" placeholder="Search notes…" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {/* Tag filter chips */}
      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          <button onClick={() => setTagFilter(null)}
            className={`px-2.5 py-1 rounded-full font-mono text-[10px] transition-colors ${!tagFilter ? "bg-accent text-white" : "bg-white/5 text-white/40"}`}>
            All
          </button>
          {allTags.map(t => (
            <button key={t} onClick={() => setTagFilter(tagFilter === t ? null : t)}
              className={`px-2.5 py-1 rounded-full font-mono text-[10px] transition-colors ${tagFilter === t ? "bg-accent text-white" : "bg-white/5 text-white/40"}`}>
              {t}
            </button>
          ))}
        </div>
      )}

      {/* View tabs */}
      <div className="flex gap-1 border-b border-white/[0.065] mb-5">
        {(["all", "notebook"] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 font-mono text-[11px] tracking-widest transition-colors ${tab === t ? "text-accent border-b border-accent" : "text-white/40 hover:text-white/70"}`}>
            {t === "notebook" ? "NOTEBOOK MODE" : "ALL NOTES"}
          </button>
        ))}
      </div>

      {/* Add note form */}
      <form onSubmit={addNote} className="card p-4 space-y-3 mb-5">
        <div className="font-mono text-[10px] text-white/40 tracking-widest">NEW NOTE</div>
        <div className="grid grid-cols-4 gap-2">
          <input className="input col-span-1" placeholder="Team # (opt)" value={form.team} onChange={e => setForm(f => ({ ...f, team: e.target.value }))} />
          <textarea
            className="input col-span-3 h-20 resize-none text-sm"
            placeholder="Write your note… use Markdown: **bold**, - list, # heading"
            value={form.text}
            onChange={e => setForm(f => ({ ...f, text: e.target.value }))}
            required
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {QUICK_TAGS.map(t => (
            <button type="button" key={t} onClick={() => toggleTag(t)}
              className={`px-2.5 py-1 rounded-full font-mono text-[10px] transition-colors ${form.tags.includes(t) ? "bg-accent text-white" : "bg-white/5 text-white/40"}`}>
              {t}
            </button>
          ))}
        </div>
        <button type="submit" disabled={saving || !form.text} className="btn text-sm">
          {saving ? "Saving…" : "Add note →"}
        </button>
      </form>

      {/* ── All notes ── */}
      {tab === "all" && (
        <div className="space-y-3">
          {filtered.length === 0 && <p className="text-center py-10 text-white/20 font-mono text-sm">No notes yet.</p>}
          {filtered.map(n => (
            <div key={n.id} className={`card p-4 ${n.is_pinned ? "border-accent/40" : ""}`}>
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  {n.team_number && <span className="font-mono text-[10px] text-accent">TEAM {n.team_number}</span>}
                  <span className="font-mono text-[9px] text-white/25">{new Date(n.created_at).toLocaleString()}</span>
                  {n.profiles && <span className="font-mono text-[9px] text-white/25">{n.profiles.display_name}</span>}
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button onClick={() => togglePin(n.id, n.is_pinned)} className="font-mono text-[10px] text-white/30 hover:text-accent transition-colors" title={n.is_pinned ? "Unpin" : "Pin"}>
                    {n.is_pinned ? "📍" : "pin"}
                  </button>
                  <button onClick={() => deleteNote(n.id)} className="font-mono text-[10px] text-white/20 hover:text-red-400 transition-colors">×</button>
                </div>
              </div>
              <p className="text-sm text-white/75 leading-relaxed whitespace-pre-wrap">{n.content.text}</p>
              {n.tags?.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {n.tags.map(t => (
                    <span key={t} className="px-2 py-0.5 rounded-full bg-accent/10 border border-accent/20 font-mono text-[9px] text-accent">{t}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Notebook mode ── */}
      {tab === "notebook" && (
        <div className="space-y-4">
          <p className="font-mono text-xs text-white/30">Alliance selection day view — all notes grouped by team.</p>
          {byTeam.map(([team, teamNotes]) => (
            <div key={team} className="card overflow-hidden">
              <div className="bg-white/[0.04] border-b border-white/[0.065] px-4 py-2 flex items-center gap-3">
                <span className="font-display font-black text-accent">{team === "General" ? "General" : `Team ${team}`}</span>
                <span className="font-mono text-[10px] text-white/30">{teamNotes.length} note{teamNotes.length !== 1 ? "s" : ""}</span>
              </div>
              <div className="p-4 space-y-3">
                {teamNotes.map(n => (
                  <div key={n.id}>
                    <p className="text-sm text-white/70 leading-relaxed whitespace-pre-wrap">{n.content.text}</p>
                    {n.tags?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {n.tags.map(t => <span key={t} className="px-1.5 py-0.5 rounded bg-accent/10 font-mono text-[9px] text-accent">{t}</span>)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
