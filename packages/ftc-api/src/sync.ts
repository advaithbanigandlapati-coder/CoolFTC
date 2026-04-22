/**
 * Batch sync FTC data → Supabase cache
 * packages/ftc-api/src/sync.ts
 * Run via cron job or on-demand from admin panel
 */

import { getEventRankings, getMatchResults } from "./ftcEvents";
import { upsertTeamStats } from "@coolfTC/db";

export async function syncEventStats(season: number, eventCode: string) {
  const eventKey = `${season}-${eventCode}`;
  const { Rankings } = await getEventRankings(season, eventCode);

  const stats = (Rankings as Record<string, unknown>[]).map((r) => ({
    event_key: eventKey,
    team_number: String(r.teamNumber),
    season_year: season,
    rank: r.rank as number,
    ranking_score: r.sortOrder1 as number,
    rp: r.rankingPoints as number,
    match_points: r.matchPoints as number,
    wins: (r.wins as number) ?? 0,
    losses: (r.losses as number) ?? 0,
    ties: (r.ties as number) ?? 0,
    plays: ((r.wins as number) + (r.losses as number) + (r.ties as number)) || 0,
    high_score: r.highScore as number | null,
    opr: null, dpr: null, epa: null,
    fetched_at: new Date().toISOString(),
  }));

  await upsertTeamStats(stats as unknown as Parameters<typeof upsertTeamStats>[0]);
  return stats.length;
}
