/**
 * CoolFTC — Forge simulation queries
 * packages/db/src/queries/forge.ts
 */

import { supabase } from "../client";
import type { ForgeSimulation, ForgeResults } from "@coolfTC/types";

export async function saveSimulation(sim: {
  org_id: string;
  event_key: string;
  red_alliance: string[];
  blue_alliance: string[];
  iterations: number;
  results: ForgeResults;
  label?: string;
  created_by: string;
}): Promise<ForgeSimulation> {
  const { data, error } = await supabase
    .from("forge_simulations")
    .insert(sim)
    .select()
    .single();

  if (error) throw error;
  return data as ForgeSimulation;
}

export async function getSimulationHistory(orgId: string, eventKey: string, limit = 10) {
  const { data, error } = await supabase
    .from("forge_simulations")
    .select("*")
    .eq("org_id", orgId)
    .eq("event_key", eventKey)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data as ForgeSimulation[];
}

export async function getLastSimulation(orgId: string, eventKey: string) {
  const { data } = await supabase
    .from("forge_simulations")
    .select("*")
    .eq("org_id", orgId)
    .eq("event_key", eventKey)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  return data as ForgeSimulation | null;
}
