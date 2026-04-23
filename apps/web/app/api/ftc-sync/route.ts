/**
 * CoolFTC — FTC Data Sync API Route
 * apps/web/app/api/ftc-sync/route.ts
 *
 * Pulls event data from TWO sources and merges them:
 *   1. FIRST FTC Events API — official rankings, match scores, team list
 *   2. FTCScout GraphQL — OPR, season stats, team info
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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FTCSCOUT_GQL = "https://api.ftcscout.org/graphql";

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

// Fetch FTCScout OPR + team info for an event
async function fetchFTCScoutEventData(season: number, eventCode: string) {
  try {
    const query = `
      query EventData($season: Int!, $code: String!) {
        eventByCode(season: $season, code: $code) {
          name
          teams {
            team { number name city stateProv country }
            stats {
              ... on TeamEventStats2025 {
                rank
                wins losses ties
                highScore
                rankingPoints
                opr { totalPointsNp autoPointsNp dcPointsNp egPointsNp }
              }
            }
          }
        }
      }
    `;
    const res = await fetch(FTCSCOUT_GQL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": "CoolFTC (coolftc.app)" },
      body: JSON.stringify({ query, variables: { season, code: eventCode } }),
    });
    if (!res.ok) return null;
    const { data, errors } = await res.json();
    if (errors?.length || !data?.eventByCode) return null;
    return data.eventByCode as {
      name: string;
      teams: {
        team: { number: number; name: string; city: string | null; stateProv: string | null; country: string | null };
        stats: {
          rank?: number; wins?: number; losses?: number; ties?: number;
          highScore?: number; rankingPoints?: number;
          opr?: { totalPointsNp: number; autoPointsNp: number; dcPointsNp: number; egPointsNp: number };
        } | null;
      }[];
    };
  } catch { return null; }
}

// Fetch FIRST FTC Events API rankings (optional — requires API keys)
async function fetchFTCEventsRankings(season: number, eventCode: string) {
  const key = process.env.FTC_API_KEY;
  const secret = process.env.FTC_API_SECRET;
  if (!key || !secret) return null;

  try {
    const auth = "Basic " + Buffer.from(`${key}:${secret}`).toString("base64");
    const res = await fetch(`https://ftc-api.firstinspires.org/v2.0/${season}/rankings/${eventCode}`, {
      headers: { Authorization: auth, "Content-Type": "application/json" },
    });
    if (!res.ok) return null;
    const { Rankings } = await res.json() as { Rankings: Record<string, unknown>[] };
    return Rankings;
  } catch { return null; }
}

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { season, eventCode, orgId } = await req.json();
  if (!season || !eventCode || !orgId)
    return NextResponse.json({ error: "Missing season, eventCode, or orgId" }, { status: 400 });

  if (!(await canWriteOrg(user.id, orgId)))
    return NextResponse.json({ error: "Admin or analyst role required" }, { status: 403 });

  const eventKey = `${season}-${eventCode}`;
  const db = createAdminClient();
  const sources: string[] = [];

  // ── Source 1: FTCScout (always available — no API key required) ──
  const scoutData = await fetchFTCScoutEventData(Number(season), String(eventCode));

  let teamsUpserted = 0;

  if (scoutData?.teams?.length) {
    sources.push("FTCScout");
    const eventName = scoutData.name ?? eventKey;

    // Upsert event row
    await db.from("events").upsert({
      event_key: eventKey,
      season_year: Number(season),
      name: eventName,
    }, { onConflict: "event_key" });

    // Build cache rows from FTCScout data
    const statsRows = scoutData.teams
      .filter(t => t.team?.number)
      .map(t => ({
        event_key: eventKey,
        team_number: String(t.team.number),
        season_year: Number(season),
        rank: t.stats?.rank ?? null,
        ranking_score: t.stats?.rankingPoints ?? null,
        rp: t.stats?.rankingPoints ?? null,
        match_points: null as number | null,
        wins: t.stats?.wins ?? 0,
        losses: t.stats?.losses ?? 0,
        ties: t.stats?.ties ?? 0,
        plays: (t.stats?.wins ?? 0) + (t.stats?.losses ?? 0) + (t.stats?.ties ?? 0),
        high_score: t.stats?.highScore ?? null,
        opr: t.stats?.opr?.totalPointsNp ?? null,
        dpr: null as number | null,
        epa: null as number | null,
        fetched_at: new Date().toISOString(),
      }));

    if (statsRows.length > 0) {
      const { error } = await db
        .from("team_stats_cache")
        .upsert(statsRows, { onConflict: "event_key,team_number" });
      if (!error) teamsUpserted = statsRows.length;
    }

    // Also upsert team roster into ftc_teams for local search cache
    const teamRows = scoutData.teams
      .filter(t => t.team?.number)
      .map(t => ({
        team_number: String(t.team.number),
        team_name: t.team.name ?? null,
        city: t.team.city ?? null,
        state_province: t.team.stateProv ?? null,
        country: t.team.country ?? null,
      }));

    if (teamRows.length > 0) {
      await db
        .from("ftc_teams")
        .upsert(teamRows, { onConflict: "team_number" })
        .then(() => {}); // non-fatal
    }
  }

  // ── Source 2: FIRST FTC Events API (optional — enriches with official rankings) ──
  const ftcRankings = await fetchFTCEventsRankings(Number(season), String(eventCode));

  if (ftcRankings?.length) {
    sources.push("FIRST FTC API");
    const rankPatch = (ftcRankings as Record<string, unknown>[]).map(r => ({
      event_key: eventKey,
      team_number: String(r.teamNumber),
      season_year: Number(season),
      rank: (r.rank as number) ?? null,
      ranking_score: (r.sortOrder1 as number) ?? null,
      rp: (r.rankingPoints as number) ?? null,
      match_points: (r.matchPoints as number) ?? null,
      wins: (r.wins as number) ?? 0,
      losses: (r.losses as number) ?? 0,
      ties: (r.ties as number) ?? 0,
      plays: ((r.wins as number) ?? 0) + ((r.losses as number) ?? 0) + ((r.ties as number) ?? 0),
      high_score: (r.highScore as number) ?? null,
      opr: null, dpr: null, epa: null,
      fetched_at: new Date().toISOString(),
    }));

    await db
      .from("team_stats_cache")
      .upsert(rankPatch, { onConflict: "event_key,team_number" })
      .then(() => { if (rankPatch.length > teamsUpserted) teamsUpserted = rankPatch.length; });
  }

  // If neither source returned data, report the issue clearly
  if (sources.length === 0) {
    return NextResponse.json({
      error: `No data found for event ${eventKey} on FTCScout or FIRST FTC API. ` +
             `Check the event code is correct (e.g. 2025-USCAFFFAQ). ` +
             `FTCScout is free; FIRST FTC API requires FTC_API_KEY + FTC_API_SECRET env vars.`,
    }, { status: 404 });
  }

  // Store active event key on org
  await db
    .from("organizations")
    .update({ active_event_key: eventKey })
    .eq("id", orgId);

  return NextResponse.json({
    success: true,
    eventKey,
    teamsSync: teamsUpserted,
    sources,
    syncedAt: new Date().toISOString(),
  });
}

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const eventKey = req.nextUrl.searchParams.get("eventKey");
  if (!eventKey) return NextResponse.json({ error: "Missing eventKey" }, { status: 400 });

  const db = createAdminClient();
  const { data, count } = await db
    .from("team_stats_cache")
    .select("fetched_at", { count: "exact" })
    .eq("event_key", eventKey)
    .order("fetched_at", { ascending: false })
    .limit(1);

  return NextResponse.json({
    eventKey,
    lastSyncedAt: data?.[0]?.fetched_at ?? null,
    teamCount: count ?? 0,
  });
}
