/**
 * Cron: courier-schedules
 * Every 15 min, looks for courier_schedules rows where next_run_at <= now()
 * and generates a Courier edition for each.
 *
 * Delegates actual generation to the existing /api/courier/generate endpoint
 * by calling it server-side with org credentials via service role.
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@coolfTC/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

function nextRunAt(cadence: string, from: Date): Date {
  const d = new Date(from);
  switch (cadence) {
    case "hourly":    d.setHours(d.getHours() + 1); break;
    case "daily":     d.setDate(d.getDate() + 1); break;
    case "pre_match": d.setMinutes(d.getMinutes() + 20); break;
    default:          d.setHours(d.getHours() + 24);
  }
  return d;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = createAdminClient();
  const now = new Date().toISOString();

  const { data: due } = await db
    .from("courier_schedules")
    .select("id, org_id, event_key, cadence, lens, audience, active, next_run_at")
    .eq("active", true)
    .lte("next_run_at", now)
    .limit(20);

  if (!due || due.length === 0) return NextResponse.json({ generated: 0 });

  const base = process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "";
  const results: { id: string; ok: boolean; error?: string }[] = [];

  for (const sched of due) {
    try {
      // Mark next_run_at first so concurrent invocations don't double-fire
      const nra = nextRunAt(sched.cadence ?? "daily", new Date()).toISOString();
      await db.from("courier_schedules").update({ next_run_at: nra, last_run_at: now }).eq("id", sched.id);

      // Call generate with server-side credentials
      const res = await fetch(`${base}/api/courier/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-cron-secret": process.env.CRON_SECRET ?? "",
        },
        body: JSON.stringify({
          orgId: sched.org_id,
          eventKey: sched.event_key,
          lens: sched.lens,
          audience: sched.audience,
          trigger: "scheduled",
        }),
      });
      results.push({ id: sched.id, ok: res.ok, error: res.ok ? undefined : `HTTP ${res.status}` });
    } catch (err) {
      results.push({ id: sched.id, ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return NextResponse.json({ generated: results.filter((r) => r.ok).length, results });
}
