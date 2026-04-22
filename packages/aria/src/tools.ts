/**
 * CoolFTC — ARIA Tool Definitions
 * packages/aria/src/tools.ts
 *
 * Gives ARIA agentic capability: instead of only answering from pre-loaded
 * context, it can actively fetch data mid-conversation.
 *
 * Tools:
 *   get_live_standings     — current event rankings + OPR from team_stats_cache
 *   get_team_profile       — full scouting entry + pit scouting for a specific team
 *   get_match_history      — match scouting entries for a team or all teams
 *   search_teams           — global FTC team search by number/name
 *   run_forge_simulation   — trigger a Monte Carlo sim and return results
 */

import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@coolfTC/db";

export const ARIA_TOOLS: Anthropic.Tool[] = [
  {
    name: "get_live_standings",
    description:
      "Fetch the current event standings, rankings, OPR, and win-loss record for all teams at the active event. Use when the user asks about rankings, who is in first, team performance stats, or OPR comparisons.",
    input_schema: {
      type: "object",
      properties: {
        event_key: { type: "string", description: "The FTC event key, e.g. '2025-DECODE-TEST'" },
        top_n:     { type: "number", description: "Return only the top N teams. Defaults to 20." },
      },
      required: ["event_key"],
    },
  },
  {
    name: "get_team_profile",
    description:
      "Fetch the complete scouting profile for a specific team: pit scouting data, all match scouting entries, tier rating, and alliance target status. Use when the user asks about a specific team in detail.",
    input_schema: {
      type: "object",
      properties: {
        team_number: { type: "string", description: "The FTC team number, e.g. '4042'" },
        org_id:      { type: "string", description: "The org ID for scoping scouting data" },
        event_key:   { type: "string", description: "The FTC event key" },
      },
      required: ["team_number", "org_id", "event_key"],
    },
  },
  {
    name: "get_match_history",
    description:
      "Retrieve match scouting data. Can fetch all match entries for a specific team, or the N most recent matches for all teams. Use for performance trend analysis or when asked about match-by-match data.",
    input_schema: {
      type: "object",
      properties: {
        org_id:      { type: "string" },
        event_key:   { type: "string" },
        team_number: { type: "string", description: "Optional — omit to get all teams' match data" },
        limit:       { type: "number", description: "Max entries to return. Defaults to 20." },
      },
      required: ["org_id", "event_key"],
    },
  },
  {
    name: "search_teams",
    description:
      "Search the global FTC team database by team number or name. Returns team info including location and season history. Use when the user asks about a team not in the current event.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Team number or partial name to search" },
        limit: { type: "number", description: "Max results. Defaults to 5." },
      },
      required: ["query"],
    },
  },
  {
    name: "run_forge_simulation",
    description:
      "Run a Monte Carlo match simulation between two alliances. Returns projected score, win probability, RP likelihood, and score distribution. Use when asked to simulate a match or predict a score.",
    input_schema: {
      type: "object",
      properties: {
        red_alliance:  { type: "array", items: { type: "string" }, description: "Array of 2-3 team numbers on red alliance" },
        blue_alliance: { type: "array", items: { type: "string" }, description: "Array of 2-3 team numbers on blue alliance" },
        org_id:        { type: "string" },
        event_key:     { type: "string" },
      },
      required: ["red_alliance", "blue_alliance", "org_id", "event_key"],
    },
  },
];

// ── Tool Executors ──────────────────────────────────────────────────────────

export async function executeTool(
  toolName: string,
  toolInput: Record<string, unknown>
): Promise<string> {
  const db = createAdminClient();

  try {
    switch (toolName) {

      case "get_live_standings": {
        const { event_key, top_n = 20 } = toolInput as { event_key: string; top_n?: number };
        const { data } = await db
          .from("team_stats_cache")
          .select("*, ftc_teams(team_name)")
          .eq("event_key", event_key)
          .order("rank", { nullsFirst: false })
          .limit(top_n);

        if (!data?.length) return `No standings data found for event ${event_key}.`;

        const lines = data.map((t: Record<string, unknown>) => {
          const name = (t.ftc_teams as { team_name: string | null } | null)?.team_name ?? "Unknown";
          return `#${t.rank ?? "?"} Team ${t.team_number} (${name}) — OPR: ${Number(t.opr ?? 0).toFixed(1)}, W-L: ${t.wins}-${t.losses}, High: ${t.high_score ?? "?"}`;
        });

        return `## Live Standings — ${event_key}\n${lines.join("\n")}`;
      }

      case "get_team_profile": {
        const { team_number, org_id, event_key } = toolInput as { team_number: string; org_id: string; event_key: string };

        const [scoutRes, pitRes, statsRes] = await Promise.all([
          db.from("scouting_entries")
            .select("*, ftc_teams(team_name)")
            .eq("org_id", org_id)
            .eq("event_key", event_key)
            .eq("team_number", team_number)
            .single(),
          db.from("pit_scouting")
            .select("*")
            .eq("org_id", org_id)
            .eq("event_key", event_key)
            .eq("team_number", team_number)
            .single(),
          db.from("team_stats_cache")
            .select("*")
            .eq("event_key", event_key)
            .eq("team_number", team_number)
            .single(),
        ]);

        const parts: string[] = [`## Team ${team_number} Profile`];

        if (scoutRes.data) {
          const e = scoutRes.data;
          const fd = e.form_data as unknown as Record<string, unknown>;
          parts.push(`**Scout Data**: Tier: ${e.tier ?? "unranked"}, Alliance target: ${e.alliance_target ? "YES" : "no"}, DNP: ${e.dnp ? `YES (${e.dnp_reason})` : "no"}`);
          parts.push(`**Auto**: close range: ${fd.autoCloseRange}, far range: ${fd.autoFarRange}, avg balls: ${fd.avgBallsAuto}`);
          parts.push(`**Teleop**: avg balls: ${fd.avgBallsTeleop}, high: ${fd.highBallsTeleop}`);
          parts.push(`**Endgame**: ${fd.endgamePlan ?? "none"}`);
          if (fd.generalNotes) parts.push(`**Notes**: ${fd.generalNotes}`);
        } else {
          parts.push("No match scouting entry for this team.");
        }

        if (pitRes.data) {
          const p = pitRes.data;
          parts.push(`**Pit Scouting**: Drivetrain: ${p.drivetrain ?? "unknown"}, Auto: ${p.auto_capable ? "yes" : "no"}, Mechanical risk: ${p.mechanical_risk ?? "?"}/5`);
          if (p.general_notes) parts.push(`**Pit notes**: ${p.general_notes}`);
        }

        if (statsRes.data) {
          const s = statsRes.data;
          parts.push(`**Event stats**: Rank #${s.rank ?? "?"}, OPR: ${Number(s.opr ?? 0).toFixed(1)}, W-L: ${s.wins}-${s.losses}`);
        }

        return parts.join("\n");
      }

      case "get_match_history": {
        const { org_id, event_key, team_number, limit = 20 } = toolInput as { org_id: string; event_key: string; team_number?: string; limit?: number };

        let query = db
          .from("match_scouting")
          .select("*")
          .eq("org_id", org_id)
          .eq("event_key", event_key)
          .order("match_number", { ascending: true })
          .limit(limit);

        if (team_number) query = query.eq("team_number", team_number);

        const { data } = await query;
        if (!data?.length) return "No match scouting data found.";

        const lines = data.map((m: Record<string, unknown>) =>
          `Team ${m.team_number} Q${m.match_number} (${m.alliance}): auto=${m.auto_score}, teleop=${m.teleop_score}, endgame=${m.endgame_score}, total=${m.total_score}`
        );

        return `## Match History${team_number ? ` — Team ${team_number}` : ""}\n${lines.join("\n")}`;
      }

      case "search_teams": {
        const { query, limit = 5 } = toolInput as { query: string; limit?: number };
        const isNumber = /^\d+$/.test(query.trim());

        let dbQuery = db.from("ftc_teams").select("team_number, team_name, city, state_province, country").limit(limit);

        if (isNumber) {
          dbQuery = dbQuery.eq("team_number", query.trim());
        } else {
          dbQuery = dbQuery.ilike("team_name", `%${query}%`);
        }

        const { data } = await dbQuery;
        if (!data?.length) return `No teams found matching "${query}".`;

        return data.map((t: Record<string, unknown>) =>
          `Team ${t.team_number}: ${t.team_name ?? "Unknown"} — ${[t.city, t.state_province, t.country].filter(Boolean).join(", ")}`
        ).join("\n");
      }

      case "run_forge_simulation": {
        const { red_alliance, blue_alliance, org_id, event_key } = toolInput as {
          red_alliance: string[]; blue_alliance: string[];
          org_id: string; event_key: string;
        };

        // Delegate to the real Monte Carlo simulator in @coolfTC/ftc-api.
        // Uses actual per-team match history from FTCScout to fit score distributions.
        const season = Number(event_key.match(/^(\d{4})-/)?.[1] ?? 2025);
        const { monteCarloMatchSim } = await import("@coolfTC/ftc-api");
        const mc = await monteCarloMatchSim(
          red_alliance.map(Number),
          blue_alliance.map(Number),
          season,
          500
        );
        if (!mc.dataAvailable) {
          return `## Forge Simulation — no data

Not enough FTCScout match history for these teams in season ${season} to simulate. Ask the user to run the simulator once teams have played a few matches, or fall back to OPR summation via the predictMatchOutcome tool.

${mc.teamsWithoutData.length ? `Teams without data: ${mc.teamsWithoutData.join(", ")}` : ""}`;
        }
        return `## Forge Monte Carlo Result (${mc.iterations} iterations, real FTCScout data)

**Red Alliance** (${red_alliance.join(", ")}): mean ${mc.red.meanScore} ± ${mc.red.stdDev}
  • 10th / 50th / 90th percentile: ${mc.red.p10} / ${mc.red.median} / ${mc.red.p90}
  • Win probability: ${Math.round(mc.redWinPct * 100)}%

**Blue Alliance** (${blue_alliance.join(", ")}): mean ${mc.blue.meanScore} ± ${mc.blue.stdDev}
  • 10th / 50th / 90th percentile: ${mc.blue.p10} / ${mc.blue.median} / ${mc.blue.p90}
  • Win probability: ${Math.round(mc.blueWinPct * 100)}%

${mc.teamsWithoutData.length ? `⚠ No FTCScout data for: ${mc.teamsWithoutData.join(", ")} — they contributed 0 to the simulation.` : ""}

${mc.basis}`;
      }

      default:
        return `Unknown tool: ${toolName}`;
    }
  } catch (err) {
    return `Tool error (${toolName}): ${err instanceof Error ? err.message : String(err)}`;
  }
}
