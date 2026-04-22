/**
 * CoolFTC — Match scouting queries
 * packages/db/src/queries/matchScouting.ts
 */

import { supabase } from "../client";
import type { MatchScoutingEntry, DecodeMatchFormData } from "@coolfTC/types";

export async function getMatchScouting(orgId: string, eventKey: string, teamNumber?: string) {
  let query = supabase
    .from("match_scouting")
    .select("*, profiles(display_name)")
    .eq("org_id", orgId)
    .eq("event_key", eventKey)
    .order("match_number");

  if (teamNumber) query = query.eq("team_number", teamNumber);

  const { data, error } = await query;
  if (error) throw error;
  return data as (MatchScoutingEntry & { profiles: { display_name: string } | null })[];
}

export async function upsertMatchScouting(entry: {
  org_id: string;
  event_key: string;
  match_number: number;
  match_type: "qual" | "semi" | "final";
  team_number: string;
  alliance: "red" | "blue";
  form_data: DecodeMatchFormData;
  auto_score: number;
  teleop_score: number;
  endgame_score: number;
  total_score: number;
  scouted_by: string;
}) {
  const { data, error } = await supabase
    .from("match_scouting")
    .upsert(entry, { onConflict: "org_id,event_key,match_number,team_number" })
    .select()
    .single();

  if (error) throw error;
  return data as MatchScoutingEntry;
}

/** Aggregate averages per team from match scouting */
export async function getTeamAggregates(orgId: string, eventKey: string) {
  const { data, error } = await supabase
    .from("match_scouting")
    .select("team_number, auto_score, teleop_score, endgame_score, total_score")
    .eq("org_id", orgId)
    .eq("event_key", eventKey);

  if (error) throw error;

  // Group and average client-side
  const grouped: Record<string, { auto: number[]; teleop: number[]; endgame: number[]; total: number[] }> = {};
  for (const row of data) {
    if (!grouped[row.team_number]) grouped[row.team_number] = { auto: [], teleop: [], endgame: [], total: [] };
    grouped[row.team_number].auto.push(row.auto_score);
    grouped[row.team_number].teleop.push(row.teleop_score);
    grouped[row.team_number].endgame.push(row.endgame_score);
    grouped[row.team_number].total.push(row.total_score);
  }

  const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const max = (arr: number[]) => Math.max(...arr);

  return Object.entries(grouped).map(([team_number, d]) => ({
    team_number,
    matches: d.total.length,
    avg_auto: avg(d.auto),
    avg_teleop: avg(d.teleop),
    avg_endgame: avg(d.endgame),
    avg_total: avg(d.total),
    high_total: max(d.total),
  }));
}
