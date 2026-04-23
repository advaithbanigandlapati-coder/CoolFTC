/**
 * Cron: refresh FTC rankings for every org with an active event.
 * Invoked every 2 minutes by Vercel Cron. Respects a soft rate limit —
 * only fetches when last refresh was > 90 seconds ago.
 *
 * Auth: Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}` if set.
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@coolfTC/db";
import { syncEventStats } from "@coolfTC/ftc-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;  // not configured => dev mode
  const h = req.headers.get("authorization");
  return h === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = createAdminClient();

  // Distinct event_keys that have scouting data and haven't been refreshed recently
  const { data: events } = await db
    .from("team_stats_cache")
    .select("event_key, fetched_at")
    .order("fetched_at", { ascending: true })
    .limit(20);
  if (!events || events.length === 0) return NextResponse.json({ refreshed: 0, reason: "no active events" });

  const seenKeys = new Set<string>();
  const toRefresh: string[] = [];
  const cutoff = Date.now() - 90_000; // 90s stale threshold
  for (const e of events) {
    if (seenKeys.has(e.event_key)) continue;
    seenKeys.add(e.event_key);
    if (!e.fetched_at || new Date(e.fetched_at).getTime() < cutoff) {
      toRefresh.push(e.event_key);
    }
  }
  if (toRefresh.length === 0) return NextResponse.json({ refreshed: 0, reason: "all fresh" });

  const results: { eventKey: string; ok: boolean; error?: string; teams?: number }[] = [];
  for (const key of toRefresh.slice(0, 5)) {  // max 5 per invocation to stay under FTC rate limits
    const m = key.match(/^(\d{4})-(.+)$/);
    if (!m) { results.push({ eventKey: key, ok: false, error: "bad format" }); continue; }
    try {
      const n = await syncEventStats(Number(m[1]), m[2]);
      results.push({ eventKey: key, ok: true, teams: n });
    } catch (err) {
      results.push({ eventKey: key, ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return NextResponse.json({ refreshed: results.filter(r => r.ok).length, results });
}
