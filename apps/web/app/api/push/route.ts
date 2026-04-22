/**
 * CoolFTC — Push Notification API
 * apps/web/app/api/push/route.ts
 *
 * POST /api/push/register  — Register Expo push token
 * POST /api/push/notify    — Send notification (internal, called by sync job)
 * DELETE /api/push/register — Deregister token
 *
 * Mobile clients send `Authorization: Bearer <access_token>`.
 * Web clients rely on Supabase SSR cookies.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createAdminClient } from "@coolfTC/db";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

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

// ── Register a push token ─────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { action } = body;

  const db = createAdminClient();

  // Register token
  if (action === "register") {
    const { token, platform, orgId, eventKey, myTeam } = body;
    if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

    await db.from("push_tokens").upsert({
      user_id: user.id,
      org_id: orgId,
      token,
      platform: platform ?? "unknown",
      event_key: eventKey ?? null,
      my_team: myTeam ?? null,
      active: true,
      last_used_at: new Date().toISOString(),
    }, { onConflict: "token" });

    return NextResponse.json({ ok: true });
  }

  // Trigger manual "match queuing" notification (called by sync worker or admin)
  if (action === "notify_queuing") {
    const { eventKey, matchNumber, teamNumbers } = body;
    if (!eventKey || !matchNumber || !Array.isArray(teamNumbers)) {
      return NextResponse.json({ error: "Missing eventKey, matchNumber, or teamNumbers" }, { status: 400 });
    }

    // Find all active tokens watching these teams at this event
    const { data: tokens } = await db
      .from("push_tokens")
      .select("token")
      .eq("event_key", eventKey)
      .eq("active", true)
      .in("my_team", teamNumbers);

    if (!tokens?.length) return NextResponse.json({ sent: 0 });

    // Batch Expo push notifications (max 100 per request)
    const messages = tokens.map(({ token }: { token: string }) => ({
      to: token,
      title: "⬡ Match Queuing",
      body: `Q${matchNumber} is queuing. Get to the field!`,
      data: { eventKey, matchNumber },
      sound: "default",
      priority: "high",
    }));

    const chunks: typeof messages[] = [];
    for (let i = 0; i < messages.length; i += 100) chunks.push(messages.slice(i, i + 100));

    let sent = 0;
    for (const chunk of chunks) {
      const res = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(chunk),
      });
      if (res.ok) sent += chunk.length;
    }

    return NextResponse.json({ sent });
  }

  // Score alert: notify when team hits unusually high score
  if (action === "score_alert") {
    const { eventKey, teamNumber, score, threshold = 80 } = body;
    if (score < threshold) return NextResponse.json({ sent: 0, reason: "below_threshold" });

    const { data: tokens } = await db
      .from("push_tokens")
      .select("token")
      .eq("event_key", eventKey)
      .eq("active", true);

    if (!tokens?.length) return NextResponse.json({ sent: 0 });

    const messages = tokens.map(({ token }: { token: string }) => ({
      to: token,
      title: "⚡ Score Alert",
      body: `Team ${teamNumber} just scored ${score} pts — scouting flag!`,
      data: { eventKey, teamNumber, score },
      sound: "default",
    }));

    await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(messages.slice(0, 100)),
    });

    return NextResponse.json({ sent: messages.length });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

// ── Deregister token ─────────────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { token } = await req.json();
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

  const db = createAdminClient();
  await db.from("push_tokens").update({ active: false }).eq("token", token).eq("user_id", user.id);

  return NextResponse.json({ ok: true });
}
