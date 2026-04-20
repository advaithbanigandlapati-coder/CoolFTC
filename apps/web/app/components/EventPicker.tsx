"use client";
import { useState, useEffect } from "react";

type EventResult = {
  season: number;
  code: string;
  name: string;
  type: string | null;
  region: string | null;
  start: string | null;
  end: string | null;
  city: string | null;
  state: string | null;
  fullKey: string;
};

/**
 * Event picker — translates real event names to FIRST event codes.
 *
 * Usage:
 *   <EventPicker value={eventKey} onChange={setEventKey} />
 *
 * Lets users either:
 *   - Type a code directly (advanced)
 *   - Search by name and pick from a dropdown (typical)
 */
export function EventPicker({
  value,
  onChange,
  placeholder = "Search event by name…",
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<EventResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!query || query.length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await fetch(`/api/events-search?q=${encodeURIComponent(query)}`);
        const j = await r.json();
        setResults(j.events ?? []);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  return (
    <div className={`relative ${className}`}>
      <div className="flex gap-2">
        <input
          className="input flex-1"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Event key (e.g. 2025-USCAFFFAQ)"
        />
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="btn px-3 text-xs whitespace-nowrap"
          title="Search events"
        >
          {open ? "Close" : "Find →"}
        </button>
      </div>

      {open && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 card p-3 shadow-2xl border border-white/10 max-h-96 overflow-auto">
          <input
            autoFocus
            className="input w-full mb-2"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder}
          />
          {loading && <div className="font-mono text-[10px] text-white/30 px-2">Searching…</div>}
          {!loading && query.length >= 2 && results.length === 0 && (
            <div className="font-mono text-[10px] text-white/30 px-2">No events found.</div>
          )}
          {results.length > 0 && (
            <div className="font-mono text-[10px] text-white/30 mb-1 px-2">{results.length} matches • Powered by FTCScout</div>
          )}
          {results.map((e) => (
            <button
              type="button"
              key={`${e.season}-${e.code}`}
              onClick={() => {
                onChange(e.fullKey);
                setOpen(false);
                setQuery("");
              }}
              className="w-full text-left px-2 py-2 hover:bg-white/5 rounded transition-colors"
            >
              <div className="text-sm text-white truncate">{e.name}</div>
              <div className="font-mono text-[10px] text-white/50 flex items-center gap-2 mt-0.5">
                <span className="text-accent">{e.fullKey}</span>
                {e.type && <span>• {e.type}</span>}
                {e.city && <span>• {e.city}{e.state ? `, ${e.state}` : ""}</span>}
                {e.start && <span className="ml-auto">{new Date(e.start).toLocaleDateString()}</span>}
              </div>
            </button>
          ))}
          {query.length < 2 && (
            <div className="px-2 py-3 text-center">
              <div className="font-mono text-[10px] text-white/30 mb-1">Type at least 2 characters to search.</div>
              <div className="font-mono text-[9px] text-white/20">Examples: &ldquo;Houston championship&rdquo;, &ldquo;NJ qualifier&rdquo;, &ldquo;Super-Regional&rdquo;</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
