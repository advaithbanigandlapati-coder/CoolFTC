/**
 * CoolFTC — Scouting queries
 * packages/db/src/queries/scouting.ts
 */

import { supabase } from "../client";
import type { ScoutingEntry, DecodeFormData, TierLevel } from "@coolfTC/types";

/** Fetch all scouting entries for an org+event, joined with team info */
export async function getScoutingEntries(orgId: string, eventKey: string) {
  const { data, error } = await supabase
    .from("scouting_entries")
    .select(`
      *,
      ftc_teams (team_number, team_name, city, state_province)
    `)
    .eq("org_id", orgId)
    .eq("event_key", eventKey)
    .order("team_number");

  if (error) throw error;
  return data as (ScoutingEntry & { ftc_teams: { team_number: string; team_name: string | null } })[];
}

/** Upsert a scouting entry (create or update) */
export async function upsertScoutingEntry(entry: {
  org_id: string;
  event_key: string;
  team_number: string;
  season_year: number;
  form_data: DecodeFormData;
  tier?: TierLevel;
  alliance_target?: boolean;
  dnp?: boolean;
  dnp_reason?: string;
  scouted_by: string;
}) {
  const { data, error } = await supabase
    .from("scouting_entries")
    .upsert(
      { ...entry, updated_at: new Date().toISOString() },
      { onConflict: "org_id,event_key,team_number" }
    )
    .select()
    .single();

  if (error) throw error;
  return data as ScoutingEntry;
}

/** Set DNP on a team */
export async function setDNP(orgId: string, eventKey: string, teamNumber: string, dnp: boolean, reason?: string) {
  const { error } = await supabase
    .from("scouting_entries")
    .update({ dnp, dnp_reason: reason ?? null, updated_at: new Date().toISOString() })
    .eq("org_id", orgId)
    .eq("event_key", eventKey)
    .eq("team_number", teamNumber);

  if (error) throw error;
}

/** Set tier level */
export async function setTier(orgId: string, eventKey: string, teamNumber: string, tier: TierLevel) {
  const { error } = await supabase
    .from("scouting_entries")
    .update({ tier, updated_at: new Date().toISOString() })
    .eq("org_id", orgId)
    .eq("event_key", eventKey)
    .eq("team_number", teamNumber);

  if (error) throw error;
}

/** Toggle alliance target */
export async function toggleAllianceTarget(orgId: string, eventKey: string, teamNumber: string, target: boolean) {
  const { error } = await supabase
    .from("scouting_entries")
    .update({ alliance_target: target, updated_at: new Date().toISOString() })
    .eq("org_id", orgId)
    .eq("event_key", eventKey)
    .eq("team_number", teamNumber);

  if (error) throw error;
}

/** Store ARIA analysis on an entry */
export async function setAIAnalysis(
  orgId: string,
  eventKey: string,
  teamNumber: string,
  analysis: Record<string, unknown>
) {
  const { error } = await supabase
    .from("scouting_entries")
    .update({
      ai_analysis: analysis,
      ai_analyzed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("org_id", orgId)
    .eq("event_key", eventKey)
    .eq("team_number", teamNumber);

  if (error) throw error;
}
