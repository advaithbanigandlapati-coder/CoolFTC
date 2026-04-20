/**
 * GET /api/events-search?q=xxx[&season=2025]
 * Translates "Houston championship" → "2025-FTCCMP1"
 * Returns up to 15 matching events with full FIRST event codes.
 */
import { NextRequest, NextResponse } from "next/server";
import { searchEvents } from "@coolfTC/ftc-api";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const seasonStr = req.nextUrl.searchParams.get("season");
  const season = seasonStr ? Number(seasonStr) : undefined;
  if (!q) return NextResponse.json({ events: [] });
  try {
    const events = await searchEvents(q, season, 15);
    return NextResponse.json({ events, source: "ftcscout" });
  } catch (err) {
    return NextResponse.json({ error: String(err), events: [] }, { status: 502 });
  }
}
