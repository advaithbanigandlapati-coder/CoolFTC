/**
 * GET /api/analytics?action=xxx&...
 *
 * Actions:
 *   action=quickStats&team=12345&season=2025
 *   action=trajectory&team=12345&season=2025&eventCode=XYZ
 *   action=compat&teamA=12345&teamB=67890&season=2025
 *   action=h2h&teamA=12345&teamB=67890&season=2025
 *   action=predict&red=1,2,3&blue=4,5,6&season=2025
 *   action=breakout&season=2025&eventCode=XYZ
 *   action=matchHistory&team=12345&season=2025[&eventCode=XYZ]
 *
 * Publicly accessible (read-only FTCScout proxy). Does NOT require auth
 * because all data is from FTCScout's public API.
 */
import { NextRequest, NextResponse } from "next/server";
import {
  getTeamQuickStats, getTeamTrajectory, getAllianceCompatibility,
  getHeadToHead, predictMatchOutcome, getBreakoutTeams, getTeamMatchHistory,
  monteCarloMatchSim,
} from "@coolfTC/ftc-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const action = p.get("action");
  if (!action) return NextResponse.json({ error: "action required" }, { status: 400 });

  try {
    switch (action) {
      case "quickStats": {
        const team = Number(p.get("team")); const season = Number(p.get("season"));
        if (!team || !season) return NextResponse.json({ error: "team & season required" }, { status: 400 });
        return NextResponse.json({ stats: await getTeamQuickStats(team, season) });
      }
      case "matchHistory": {
        const team = Number(p.get("team")); const season = Number(p.get("season"));
        const eventCode = p.get("eventCode") ?? undefined;
        if (!team || !season) return NextResponse.json({ error: "team & season required" }, { status: 400 });
        return NextResponse.json({ history: await getTeamMatchHistory(team, season, eventCode) });
      }
      case "trajectory": {
        const team = Number(p.get("team")); const season = Number(p.get("season"));
        const eventCode = p.get("eventCode");
        if (!team || !season || !eventCode) return NextResponse.json({ error: "team, season, eventCode required" }, { status: 400 });
        return NextResponse.json({ trajectory: await getTeamTrajectory(team, season, eventCode) });
      }
      case "compat": {
        const teamA = Number(p.get("teamA")); const teamB = Number(p.get("teamB"));
        const season = Number(p.get("season"));
        if (!teamA || !teamB || !season) return NextResponse.json({ error: "teamA, teamB, season required" }, { status: 400 });
        return NextResponse.json({ compat: await getAllianceCompatibility(teamA, teamB, season) });
      }
      case "h2h": {
        const teamA = Number(p.get("teamA")); const teamB = Number(p.get("teamB"));
        const season = Number(p.get("season"));
        if (!teamA || !teamB || !season) return NextResponse.json({ error: "teamA, teamB, season required" }, { status: 400 });
        return NextResponse.json({ h2h: await getHeadToHead(teamA, teamB, season) });
      }
      case "predict": {
        const red = (p.get("red") ?? "").split(",").filter(Boolean).map(Number);
        const blue = (p.get("blue") ?? "").split(",").filter(Boolean).map(Number);
        const season = Number(p.get("season"));
        if (red.length === 0 || blue.length === 0 || !season) {
          return NextResponse.json({ error: "red, blue, season required" }, { status: 400 });
        }
        return NextResponse.json({ prediction: await predictMatchOutcome(red, blue, season) });
      }
      case "monteCarlo": {
        const red = (p.get("red") ?? "").split(",").filter(Boolean).map(Number);
        const blue = (p.get("blue") ?? "").split(",").filter(Boolean).map(Number);
        const season = Number(p.get("season"));
        const iters = Math.max(100, Math.min(10000, Number(p.get("iters") ?? 2000)));
        if (red.length === 0 || blue.length === 0 || !season) {
          return NextResponse.json({ error: "red, blue, season required" }, { status: 400 });
        }
        return NextResponse.json({ monteCarlo: await monteCarloMatchSim(red, blue, season, iters) });
      }
      case "breakout": {
        const season = Number(p.get("season"));
        const eventCode = p.get("eventCode");
        if (!season || !eventCode) return NextResponse.json({ error: "season & eventCode required" }, { status: 400 });
        return NextResponse.json({ breakouts: await getBreakoutTeams(season, eventCode) });
      }
      default:
        return NextResponse.json({ error: `unknown action: ${action}` }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
