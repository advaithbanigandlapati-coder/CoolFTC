/**
 * CoolFTC — Courier API Route
 * apps/web/app/api/courier/route.ts
 *
 * The Courier: AI-generated FTC newspaper. Editions:
 *   quals_recap     — post-qualification summary
 *   elim_recap      — elimination rounds narrative
 *   daily           — end-of-day wrap
 *   robot_spotlight — deep feature on one standout robot
 *   hot_takes       — opinionated trend analysis
 *
 * GET  /api/courier?orgId=&eventKey=           — list past editions
 * POST /api/courier { orgId, eventKey, editionType, teamNumber? }
 *                                              — generate new edition (streams)
 * DELETE /api/courier?id=                      — remove an edition (admin only)
 */

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createAdminClient } from "@coolfTC/db";
import { courierPrompt } from "@coolfTC/aria/prompts/systemBase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Authenticate the caller. Supports two flows:
 *  1. Cookie-based SSR (web app) — reads Supabase session cookies
 *  2. Bearer token (mobile app) — `Authorization: Bearer <access_token>`
 */
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

async function isOrgMember(userId: string, orgId: string): Promise<boolean> {
  const db = createAdminClient();
  const { data } = await db
    .from("org_members")
    .select("role")
    .eq("user_id", userId)
    .eq("org_id", orgId)
    .single();
  return !!data;
}

// ─── GET: list editions ────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const orgId = req.nextUrl.searchParams.get("orgId");
  const eventKey = req.nextUrl.searchParams.get("eventKey");
  if (!orgId || !eventKey)
    return NextResponse.json({ error: "Missing orgId or eventKey" }, { status: 400 });

  if (!(await isOrgMember(user.id, orgId)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const db = createAdminClient();
  const { data, error } = await db
    .from("courier_editions")
    .select("id, edition_type, team_number, content, generated_at, generated_by")
    .eq("org_id", orgId)
    .eq("event_key", eventKey)
    .order("generated_at", { ascending: false })
    .limit(30);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ editions: data ?? [] });
}

// ─── POST: generate new edition (streaming SSE) ────────────────────────────

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { orgId, eventKey, editionType, teamNumber } = await req.json();
  if (!orgId || !eventKey || !editionType)
    return NextResponse.json({ error: "Missing params" }, { status: 400 });

  const validTypes = ["quals_recap", "elim_recap", "daily", "robot_spotlight", "hot_takes"];
  if (!validTypes.includes(editionType))
    return NextResponse.json({ error: "Invalid edition type" }, { status: 400 });

  if (!(await isOrgMember(user.id, orgId)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const db = createAdminClient();

  // ─── Gather context for the edition ──────────────────────────────────────
  const [{ data: event }, { data: stats }, { data: entries }, { data: matches }] = await Promise.all([
    db.from("events").select("name, city, state_province").eq("event_key", eventKey).single(),
    db.from("team_stats_cache")
      .select("team_number, rank, opr, dpr, wins, losses, high_score, ftc_teams(team_name)")
      .eq("event_key", eventKey)
      .order("rank", { nullsFirst: false, ascending: true })
      .limit(25),
    db.from("scouting_entries")
      .select("team_number, tier, ai_analysis, form_data, alliance_target, dnp, dnp_reason")
      .eq("org_id", orgId)
      .eq("event_key", eventKey)
      .limit(50),
    db.from("match_scouting")
      .select("team_number, match_number, total_score, auto_score, teleop_score, endgame_score, alliance")
      .eq("org_id", orgId)
      .eq("event_key", eventKey)
      .order("match_number", { ascending: false })
      .limit(40),
  ]);

  // ─── Build context block ────────────────────────────────────────────────
  const ctx: string[] = [];
  if (event) ctx.push(`EVENT: ${event.name} (${event.city}, ${event.state_province})`);
  ctx.push(`EDITION TYPE: ${editionType}${teamNumber ? ` | Featured team: ${teamNumber}` : ""}`);

  if (stats?.length) {
    ctx.push("\nSTANDINGS (top teams):");
    for (const s of stats.slice(0, 15)) {
      const name = (s as unknown as { ftc_teams: { team_name: string | null } | null })
        .ftc_teams?.team_name ?? "Unknown";
      ctx.push(`  #${s.rank ?? "?"} Team ${s.team_number} ${name} — OPR ${Number(s.opr ?? 0).toFixed(1)}, ${s.wins}W-${s.losses}L, high ${s.high_score ?? "?"}`);
    }
  }

  if (entries?.length) {
    ctx.push("\nSCOUTED TEAMS (your org's notes):");
    for (const e of entries.slice(0, 15)) {
      const a = (e.ai_analysis as { notes?: string } | null)?.notes;
      ctx.push(`  Team ${e.team_number} [${e.tier ?? "unranked"}]${e.alliance_target ? " ALLIANCE TARGET" : ""}${e.dnp ? ` DNP: ${e.dnp_reason}` : ""}${a ? ` — ${a}` : ""}`);
    }
  }

  if (matches?.length) {
    ctx.push("\nRECENT MATCHES:");
    for (const m of matches.slice(0, 10)) {
      ctx.push(`  Q${m.match_number} ${m.alliance}: Team ${m.team_number} scored ${m.total_score} (auto ${m.auto_score}, teleop ${m.teleop_score}, end ${m.endgame_score})`);
    }
  }

  const typeInstructions: Record<string, string> = {
    quals_recap: "Write a qualifying rounds recap. Lead with the #1 OPR team and a sharp headline. Cover the top 5 performers, any surprises, and tee up elim predictions. 400–500 words.",
    elim_recap: "Write an elimination rounds recap. Focus on the narrative of alliances forming, key matches, and what decided the outcome. Include specific scores. 400–500 words.",
    daily: "Write an end-of-day wrap. Three quick-hit sections: top performer of the day, biggest OPR swing, one team to watch tomorrow. ~300 words total.",
    robot_spotlight: `Write a deep-dive feature on Team ${teamNumber ?? "the selected team"}. Use their scouted data, OPR, and match history to argue what makes this robot special and what opponents should watch for. 350–450 words.`,
    hot_takes: "Write 3-4 opinionated hot takes about the event. Each one should be 60-90 words: a bold claim + specific data-backed reasoning. Slightly irreverent voice welcome.",
  };

  const userPrompt = [
    typeInstructions[editionType],
    "\n\n=== CONTEXT ===\n" + ctx.join("\n"),
  ].join("");

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // ─── Stream edition via SSE ─────────────────────────────────────────────
  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      let full = "";
      try {
        const stream = await client.messages.stream({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1500,
          system: courierPrompt,
          messages: [{ role: "user", content: userPrompt }],
        });

        for await (const chunk of stream) {
          if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
            const t = chunk.delta.text;
            full += t;
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: t })}\n\n`));
          }
        }

        // Persist the completed edition
        const { data: inserted } = await db.from("courier_editions").insert({
          org_id: orgId,
          event_key: eventKey,
          edition_type: editionType,
          team_number: teamNumber ?? null,
          content: full,
          generated_by: user.id,
          generated_at: new Date().toISOString(),
        }).select("id").single();

        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, id: inserted?.id })}\n\n`));
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: msg })}\n\n`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
    },
  });
}

// ─── DELETE: remove an edition (admin only) ────────────────────────────────

export async function DELETE(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const db = createAdminClient();
  const { data: edition } = await db
    .from("courier_editions")
    .select("org_id")
    .eq("id", id)
    .single();

  if (!edition) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: member } = await db
    .from("org_members")
    .select("role")
    .eq("user_id", user.id)
    .eq("org_id", edition.org_id)
    .single();

  if (member?.role !== "admin")
    return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const { error } = await db.from("courier_editions").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
