/**
 * CoolFTC — Forge Monte Carlo Engine
 * packages/ui/src/components/ForgeEngine.ts
 * Pure TS, runs in browser and Node. No dependencies.
 */

import type { TeamStats, ScoutingEntry, ForgeResults } from "@coolfTC/types";

export interface AllianceInput {
  teams: string[];           // team numbers
  stats: TeamStats[];
  entries: ScoutingEntry[];
}

function getTeamOPR(teamNumber: string, stats: TeamStats[]): number {
  return stats.find((s) => s.team_number === teamNumber)?.opr ?? 20;
}

function getEndgameScore(teamNumber: string, entries: ScoutingEntry[]): number {
  const e = entries.find((x) => x.team_number === teamNumber);
  const ep = (e?.form_data as unknown as Record<string, unknown>)?.endgamePlan as string | undefined;
  if (!ep) return 0;
  if (ep.includes("both")) return 20;
  if (ep.includes("full")) return 10;
  if (ep.includes("partial")) return 5;
  return 0;
}

function getPenaltyRate(teamNumber: string, stats: TeamStats[]): number {
  const s = stats.find((x) => x.team_number === teamNumber);
  if (!s?.penalty_opr) return 0.05;
  return Math.min(0.25, Math.max(0, (s.penalty_opr ?? 0) / 60));
}

/** Single match simulation */
function simulateMatch(
  red: AllianceInput,
  blue: AllianceInput,
  rng: () => number
): { redScore: number; blueScore: number } {
  const allianceScore = (a: AllianceInput) => {
    let score = 0;
    for (const t of a.teams) {
      const opr = getTeamOPR(t, a.stats);
      const endgame = getEndgameScore(t, a.entries);
      const penalty = getPenaltyRate(t, a.stats);
      // Gaussian noise around OPR
      const noise = (rng() + rng() - 1) * (opr * 0.28);
      const penaltyHit = rng() < penalty ? -(10 + rng() * 20) : 0;
      score += Math.max(0, opr + noise + endgame * 0.6 + penaltyHit);
    }
    return Math.round(score);
  };
  return { redScore: allianceScore(red), blueScore: allianceScore(blue) };
}

/** Seeded simple PRNG (Mulberry32) for reproducibility */
function makePRNG(seed: number) {
  let s = seed >>> 0;
  return () => {
    s |= 0; s = s + 0x6D2B79F5 | 0;
    let t = Math.imul(s ^ s >>> 15, 1 | s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export function runForge(red: AllianceInput, blue: AllianceInput, iterations = 1000, seed?: number): ForgeResults {
  const rng = makePRNG(seed ?? Date.now());
  const redScores: number[] = [];
  const blueScores: number[] = [];

  for (let i = 0; i < iterations; i++) {
    const { redScore, blueScore } = simulateMatch(red, blue, rng);
    redScores.push(redScore);
    blueScores.push(blueScore);
  }

  const mean = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const stddev = (arr: number[], m: number) => Math.sqrt(arr.reduce((a, b) => a + (b - m) ** 2, 0) / arr.length);

  const redMean = mean(redScores);
  const blueMean = mean(blueScores);
  const redWins = redScores.filter((r, i) => r > blueScores[i]).length;

  // Build histogram buckets (40 buckets covering the score range)
  const allScores = [...redScores, ...blueScores];
  const minS = Math.min(...allScores);
  const maxS = Math.max(...allScores);
  const bucketSize = Math.ceil((maxS - minS) / 40) || 5;
  const redDist: { score: number; count: number }[] = [];
  const blueDist: { score: number; count: number }[] = [];
  for (let s = minS; s <= maxS; s += bucketSize) {
    redDist.push({ score: s, count: redScores.filter((x) => x >= s && x < s + bucketSize).length });
    blueDist.push({ score: s, count: blueScores.filter((x) => x >= s && x < s + bucketSize).length });
  }

  return {
    redMean: Math.round(redMean * 10) / 10,
    blueMean: Math.round(blueMean * 10) / 10,
    redStdDev: Math.round(stddev(redScores, redMean) * 10) / 10,
    blueStdDev: Math.round(stddev(blueScores, blueMean) * 10) / 10,
    redWinPct: redWins / iterations,
    blueWinPct: (iterations - redWins) / iterations,
    redDist,
    blueDist,
    rpProbs: {
      red: {
        movementRp: redScores.filter((s) => s >= 16).length / iterations,
        goalRp: redScores.filter((s) => s >= 36).length / iterations,
        patternRp: rng() * 0.4 + 0.1, // placeholder — needs pattern data
      },
      blue: {
        movementRp: blueScores.filter((s) => s >= 16).length / iterations,
        goalRp: blueScores.filter((s) => s >= 36).length / iterations,
        patternRp: rng() * 0.4 + 0.1,
      },
    },
  } as unknown as ForgeResults;
}
