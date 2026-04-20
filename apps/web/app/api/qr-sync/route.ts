/**
 * CoolFTC — QR Sync API
 * apps/web/app/api/qr-sync/route.ts
 *
 * POST /api/qr-sync         → Create a new QR session (source device)
 * GET  /api/qr-sync?id=...  → Pull entries from a session (target device)
 * PATCH /api/qr-sync        → Mark session as scanned
 *
 * Mobile clients send `Authorization: Bearer <access_token>`.
 * Web clients rely on Supabase SSR cookies.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createAdminClient } from "@coolfTC/db";

async function getUser(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    if (token) {
      const sb = createAdminClient();
      const { data: { user } } = await sb.auth.getUser(token);
      if (user) return user;
    }
  }
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

// POST — source device creates a session with its unsynced entries
export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { orgId, eventKey, entries } = await req.json();
  if (!orgId || !eventKey || !Array.isArray(entries) || entries.length === 0) {
    return NextResponse.json({ error: "Missing orgId, eventKey, or entries" }, { status: 400 });
  }

  const db = createAdminClient();

  // Upsert the scouting entries into Supabase (in case this device was offline)
  const upsertData = entries.map((e: Record<string, unknown>) => ({
    ...e,
    org_id: orgId,
    event_key: eventKey,
    scouted_by: user.id,
  }));

  const { data: upserted, error: upsertErr } = await db
    .from("match_scouting")
    .upsert(upsertData, { onConflict: "org_id,event_key,match_number,team_number" })
    .select("id");

  if (upsertErr) {
    return NextResponse.json({ error: upsertErr.message }, { status: 500 });
  }

  const entryIds = (upserted ?? []).map((e: { id: string }) => e.id);

  // Create the QR session
  const { data: session, error: sessionErr } = await db
    .from("qr_sync_sessions")
    .insert({
      org_id: orgId,
      event_key: eventKey,
      created_by: user.id,
      entry_ids: entryIds,
      entry_count: entryIds.length,
    })
    .select("id, expires_at")
    .single();

  if (sessionErr || !session) {
    return NextResponse.json({ error: sessionErr?.message ?? "Failed to create session" }, { status: 500 });
  }

  return NextResponse.json({
    sessionId: session.id,
    entryCount: entryIds.length,
    expiresAt: session.expires_at,
    qrPayload: JSON.stringify({ sessionId: session.id, orgId, eventKey }),
  });
}

// GET — target device scans QR and pulls entries
export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sessionId = req.nextUrl.searchParams.get("id");
  if (!sessionId) return NextResponse.json({ error: "Missing session ID" }, { status: 400 });

  const db = createAdminClient();

  const { data: session } = await db
    .from("qr_sync_sessions")
    .select("*")
    .eq("id", sessionId)
    .single();

  if (!session) return NextResponse.json({ error: "Session not found or expired" }, { status: 404 });
  if (new Date(session.expires_at) < new Date()) {
    return NextResponse.json({ error: "QR session expired — source device must re-generate" }, { status: 410 });
  }

  // Fetch the actual entries
  const { data: entries } = await db
    .from("match_scouting")
    .select("*")
    .in("id", session.entry_ids as string[]);

  // Mark session as scanned
  await db
    .from("qr_sync_sessions")
    .update({ scanned_by: user.id, scanned_at: new Date().toISOString() })
    .eq("id", sessionId);

  return NextResponse.json({
    entries: entries ?? [],
    entryCount: (entries ?? []).length,
    eventKey: session.event_key,
    createdBy: session.created_by,
  });
}
