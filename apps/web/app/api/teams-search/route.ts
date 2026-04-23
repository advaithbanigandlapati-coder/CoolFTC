/**
 * GET /api/teams-search?q=xxx
 * Searches all of FTC via FTCScout. Returns up to 25 results.
 */
import { NextRequest, NextResponse } from "next/server";
import { searchTeams } from "@coolfTC/ftc-api";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (!q) return NextResponse.json({ teams: [] });
  try {
    const teams = await searchTeams(q, 25);
    return NextResponse.json({ teams, source: "ftcscout" });
  } catch (err) {
    return NextResponse.json({ error: String(err), teams: [] }, { status: 502 });
  }
}
