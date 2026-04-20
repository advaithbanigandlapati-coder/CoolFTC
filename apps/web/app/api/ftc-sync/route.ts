/**
 * CoolFTC — FTC Data Sync API Route
 * apps/web/app/api/ftc-sync/route.ts
 *
 * Pulls event rankings + match results from the FTC Events API into
 * the Supabase cache. Called from Settings → Sync FTC Data.
 *
 * POST /api/ftc-sync { season, eventCode, orgId }
 *   → syncs team_stats_cache for the given event
 *
 * GET /api/ftc-sync?eventKey=YYYY-EVENTCODE
 *   → returns last-synced timestamp for an event
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createAdminClient } from "@coolfTC/db";
import { syncEventStats } from "@coolfTC/ftc-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getUser(req: NextRequest) {
  // Try bearer token first (mobile)
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    if (token) {
      const sb = createAdminClient();
      const { data: { user } } = await sb.auth.getUser(token);
      if (user) return user;
    }
  }
  // Fall back to SSR cookies (web)
  const cookieStore = cookies();
  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );
  const { data: { user } } = await sb.auth.getUser();
  return user;
}

async function canWriteOrg(userId: string, orgId: string): Promise<boolean> {
  const db = createAdminClient();
  const { data } = await db
    .from("org_members")
    .select("role")
    .eq("user_id", userId)
    .eq("org_id", orgId)
    .single();
  return data?.role === "admin" || data?.role === "analyst";
}

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { season, eventCode, orgId } = await req.json();
  if (!season || !eventCode || !orgId)
    return NextResponse.json({ error: "Missing season, eventCode, or orgId" }, { status: 400 });

  if (!(await canWriteOrg(user.id, orgId)))
    return NextResponse.json({ error: "Admin or analyst role required" }, { status: 403 });

  if (!process.env.FTC_API_KEY || !process.env.FTC_API_SECRET)
    return NextResponse.json({ error: "FTC_API_KEY / FTC_API_SECRET not configured on server" }, { status: 500 });

  try {
    const count = await syncEventStats(Number(season), String(eventCode));
    const eventKey = `${season}-${eventCode}`;

    // Also upsert the event row if it's new
    const db = createAdminClient();
    await db.from("events").upsert({
      event_key: eventKey,
      season_year: Number(season),
      name: eventKey,
    }, { onConflict: "event_key" });

    return NextResponse.json({
      success: true,
      eventKey,
      teamsSync: count,
      syncedAt: new Date().toISOString(),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Sync failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const eventKey = req.nextUrl.searchParams.get("eventKey");
  if (!eventKey) return NextResponse.json({ error: "Missing eventKey" }, { status: 400 });

  const db = createAdminClient();
  const { data } = await db
    .from("team_stats_cache")
    .select("fetched_at")
    .eq("event_key", eventKey)
    .order("fetched_at", { ascending: false })
    .limit(1)
    .single();

  return NextResponse.json({
    eventKey,
    lastSyncedAt: data?.fetched_at ?? null,
    teamCount: data ? 1 : 0,
  });
}
