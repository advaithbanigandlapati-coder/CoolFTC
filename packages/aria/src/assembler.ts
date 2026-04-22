/**
 * CoolFTC — ARIA Context Assembler
 * packages/aria/src/assembler.ts
 *
 * This is the synergy engine. Every feature module registers itself as a
 * context provider. When ARIA is called, the assembler collects the active
 * modules' context blocks and builds a single rich system prompt.
 *
 * The "combine features" UI is just the user choosing which modules are active.
 * The intelligence comes from Claude having all that context simultaneously.
 */

import Anthropic from "@anthropic-ai/sdk";
import { systemBase } from "./prompts/systemBase";
import type { ARIAMessage, ARIAContext, ARIAResponse } from "@coolfTC/types";

// ============================================================
// TYPES
// ============================================================

export interface AssembledContext {
  systemPrompt: string;
  contextSummary: string; // human-readable summary of active context
  activeModuleIds: string[];
  tokenEstimate: number;
}

export interface ARIACallOptions {
  orgId: string;
  eventKey: string;
  userQuery: string;
  messages: ARIAMessage[];
  activeModules: string[]; // e.g. ['scout', 'forge', 'warroom']
  context: ARIAContext;    // all data from db, passed in by the caller
  streamCallback?: (chunk: string) => void;
}

// ============================================================
// MODULE REGISTRY
// Each module is a pure function: (context) => string block
// ============================================================

type ContextProvider = (context: ARIAContext) => string | null;

const MODULE_REGISTRY: Record<string, ContextProvider> = {

  scout: (ctx) => {
    if (!ctx.scoutingEntries?.length) return null;
    const teams = ctx.scoutingEntries.map((e) => {
      const fd = e.form_data as unknown as Record<string, unknown>;
      return [
        `  Team ${e.team_number} (${e.ftc_teams?.team_name ?? "Unknown"}):`,
        `    Tier: ${e.tier ?? "unranked"} | Target: ${e.alliance_target ? "YES" : "no"} | DNP: ${e.dnp ? `YES — ${e.dnp_reason}` : "no"}`,
        fd.hasAuto       ? `    Auto: capable | Close range: ${fd.autoCloseRange} | Far range: ${fd.autoFarRange}` : `    Auto: none`,
        fd.avgBallsAuto  ? `    Avg balls auto: ${fd.avgBallsAuto} | High: ${fd.highBallsAuto}` : null,
        fd.avgBallsTeleop ? `    Avg balls teleop: ${fd.avgBallsTeleop} | High: ${fd.highBallsTeleop}` : null,
        fd.endgamePlan   ? `    Endgame: ${fd.endgamePlan}` : null,
        e.ai_analysis?.notes ? `    Notes: ${e.ai_analysis.notes}` : null,
      ]
        .filter(Boolean)
        .join("\n");
    });

    return `## SCOUTED TEAM DATA (${ctx.scoutingEntries.length} teams)\n${teams.join("\n\n")}`;
  },

  stats: (ctx) => {
    if (!ctx.teamStats?.length) return null;
    const lines = ctx.teamStats.map((s) =>
      `  ${s.team_number}: Rank ${s.rank ?? "?"} | OPR ${s.opr?.toFixed(1) ?? "?"} | EPA ${s.epa?.toFixed(1) ?? "?"} | W-L-T ${s.wins}-${s.losses}-${s.ties} | High ${s.high_score ?? "?"}`
    );
    return `## LIVE EVENT STATS\n${lines.join("\n")}`;
  },

  forge: (ctx) => {
    if (!ctx.lastSimulation) return null;
    const sim = ctx.lastSimulation;
    const r = sim.results as unknown as Record<string, unknown>;
    return [
      `## LAST FORGE SIMULATION`,
      `  Red alliance: ${sim.red_alliance.join(", ")}`,
      `  Blue alliance: ${sim.blue_alliance.join(", ")}`,
      `  Iterations: ${sim.iterations.toLocaleString()}`,
      `  Red projected score: ${(r.redMean as number)?.toFixed(1)} ± ${(r.redStdDev as number)?.toFixed(1)}`,
      `  Blue projected score: ${(r.blueMean as number)?.toFixed(1)} ± ${(r.blueStdDev as number)?.toFixed(1)}`,
      `  Red win probability: ${((r.redWinPct as number) * 100)?.toFixed(1)}%`,
      r.label ? `  Label: ${r.label}` : null,
    ]
      .filter(Boolean)
      .join("\n");
  },

  warroom: (ctx) => {
    if (!ctx.activeBoard) return null;
    const state = ctx.activeBoard.state as {
      alliances: Array<{ captain: string; first?: string; second?: string }>;
      dnp: Array<{ team: string; reason?: string }>;
      priorities: string[];
    };

    const alliances = state.alliances
      .map((a, i) => `  Alliance ${i + 1}: ${[a.captain, a.first, a.second].filter(Boolean).join(" + ")}`)
      .join("\n");

    const dnp = state.dnp.length
      ? `  DNP: ${state.dnp.map((d) => `${d.team}${d.reason ? ` (${d.reason})` : ""}`).join(", ")}`
      : "  DNP list: empty";

    const priorities = state.priorities.length
      ? `  Priority queue: ${state.priorities.join(" → ")}`
      : "  Priority queue: empty";

    return `## WAR ROOM STATE\n${alliances}\n${dnp}\n${priorities}`;
  },

  live: (ctx) => {
    if (!ctx.liveEvent) return null;
    const ev = ctx.liveEvent;
    return [
      `## LIVE EVENT: ${ev.name}`,
      `  Status: ${ev.status ?? "in progress"}`,
      `  Matches completed: ${ev.matchesCompleted ?? "?"}`,
      `  Matches remaining: ${ev.matchesRemaining ?? "?"}`,
      ctx.upcomingMatch
        ? `  Your next match: #${ctx.upcomingMatch.matchNumber} (${ctx.upcomingMatch.matchesAway} away)`
        : null,
    ]
      .filter(Boolean)
      .join("\n");
  },

  myrobot: (ctx) => {
    if (!ctx.myRobot) return null;
    const r = ctx.myRobot;
    return [
      `## YOUR ROBOT (Team ${ctx.myTeamNumber})`,
      `  Strengths: ${r.strengths || "not set"}`,
      `  Weaknesses: ${r.weaknesses || "not set"}`,
      `  Strategy: ${r.strategy || "not set"}`,
      r.opr   ? `  OPR: ${r.opr}` : null,
      r.epa   ? `  EPA: ${r.epa}` : null,
      r.wlt   ? `  W-L-T: ${r.wlt}` : null,
    ]
      .filter(Boolean)
      .join("\n");
  },

  season: (ctx) => {
    if (!ctx.seasonStandings) return null;
    const top5 = ctx.seasonStandings.slice(0, 5);
    const lines = top5.map(
      (t, i) => `  ${i + 1}. Team ${t.team_number} — season OPR ${t.opr?.toFixed(1)}`
    );
    return `## SEASON STANDINGS (top 5 in your region)\n${lines.join("\n")}`;
  },
};

// ============================================================
// ASSEMBLER
// ============================================================

export function assembleContext(
  activeModuleIds: string[],
  context: ARIAContext
): AssembledContext {
  const blocks: string[] = [];
  const activeNames: string[] = [];

  for (const id of activeModuleIds) {
    const provider = MODULE_REGISTRY[id];
    if (!provider) continue;
    const block = provider(context);
    if (block) {
      blocks.push(block);
      activeNames.push(id);
    }
  }

  // Always include stats if available (lightweight context)
  if (!activeModuleIds.includes("stats") && context.teamStats?.length) {
    const statsBlock = MODULE_REGISTRY.stats(context);
    if (statsBlock) blocks.push(statsBlock);
  }

  const contextBody = blocks.join("\n\n");
  const systemPrompt = contextBody
    ? `${systemBase}\n\n---\n\n# CURRENT CONTEXT\n\n${contextBody}`
    : systemBase;

  return {
    systemPrompt,
    contextSummary: activeNames.length
      ? `Active modules: ${activeNames.join(", ")}`
      : "No module context",
    activeModuleIds: activeNames,
    tokenEstimate: Math.ceil(systemPrompt.length / 4),
  };
}

// ============================================================
// ARIA CLIENT
// ============================================================

const anthropic = new Anthropic();

export async function callARIA(options: ARIACallOptions): Promise<ARIAResponse> {
  const { systemPrompt } = assembleContext(options.activeModules, options.context);

  const messages: Anthropic.MessageParam[] = options.messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));
  messages.push({ role: "user", content: options.userQuery });

  if (options.streamCallback) {
    // Streaming response
    let fullText = "";
    const stream = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1500,
      system: systemPrompt,
      messages,
      stream: true,
    });

    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        options.streamCallback(event.delta.text);
        fullText += event.delta.text;
      }
    }
    return { text: fullText, usage: null };
  } else {
    // Non-streaming
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1500,
      system: systemPrompt,
      messages,
    });

    const text =
      response.content[0]?.type === "text" ? response.content[0].text : "";
    return { text, usage: response.usage };
  }
}

// ============================================================
// CONVENIENCE: register a custom module at runtime
// (for future community-contributed context providers)
// ============================================================

export function registerModule(id: string, provider: ContextProvider): void {
  if (MODULE_REGISTRY[id]) {
    console.warn(`[ARIA] Module "${id}" already registered — overwriting.`);
  }
  MODULE_REGISTRY[id] = provider;
}
