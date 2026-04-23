import { supabase } from "../client";
import type { FTCTeam, TeamStats } from "@coolfTC/types";

export async function getEventTeams(eventKey: string): Promise<TeamStats[]> {
  const { data, error } = await supabase
    .from("team_stats_cache")
    .select("*, ftc_teams(team_number,team_name,city,state_province,country)")
    .eq("event_key", eventKey)
    .order("rank", { nullsFirst: false });
  if (error) throw error;
  return data as TeamStats[];
}

export async function getTeam(teamNumber: string): Promise<FTCTeam | null> {
  const { data } = await supabase.from("ftc_teams").select("*").eq("team_number", teamNumber).single();
  return data as FTCTeam | null;
}

export async function upsertTeamStats(stats: Omit<TeamStats, "id" | "ftc_teams">[]) {
  const { error } = await supabase
    .from("team_stats_cache")
    .upsert(stats, { onConflict: "event_key,team_number" });
  if (error) throw error;
}

export async function searchTeams(query: string, limit = 20): Promise<FTCTeam[]> {
  const { data, error } = await supabase
    .from("ftc_teams")
    .select("*")
    .or(`team_number.ilike.%${query}%,team_name.ilike.%${query}%`)
    .limit(limit);
  if (error) throw error;
  return data as FTCTeam[];
}

export async function getWatchlist(orgId: string) {
  const { data, error } = await supabase
    .from("watchlist")
    .select("*, ftc_teams(team_number,team_name)")
    .eq("org_id", orgId);
  if (error) throw error;
  return data;
}

export async function toggleWatchlist(orgId: string, teamNumber: string, userId: string, reason?: string) {
  const { data: existing } = await supabase
    .from("watchlist").select("team_number").eq("org_id", orgId).eq("team_number", teamNumber).single();
  if (existing) {
    await supabase.from("watchlist").delete().eq("org_id", orgId).eq("team_number", teamNumber);
    return false;
  }
  await supabase.from("watchlist").insert({ org_id: orgId, team_number: teamNumber, added_by: userId, reason });
  return true;
}
