/**
 * CoolFTC — Alliance board queries (War Room)
 * packages/db/src/queries/allianceBoard.ts
 */

import { supabase } from "../client";
import type { AllianceBoard, AllianceBoardState } from "@coolfTC/types";

export async function getOrCreateActiveBoard(orgId: string, eventKey: string, createdBy: string): Promise<AllianceBoard> {
  // Try to fetch existing active board
  const { data: existing } = await supabase
    .from("alliance_boards")
    .select("*")
    .eq("org_id", orgId)
    .eq("event_key", eventKey)
    .eq("is_active", true)
    .single();

  if (existing) return existing as AllianceBoard;

  // Create a fresh one
  const { data, error } = await supabase
    .from("alliance_boards")
    .insert({
      org_id: orgId,
      event_key: eventKey,
      name: "Alliance board",
      state: { alliances: Array.from({ length: 4 }, (_, i) => ({ id: i + 1, captain: null, first: null, second: null })), dnp: [], priorities: [] },
      is_active: true,
      created_by: createdBy,
    })
    .select()
    .single();

  if (error) throw error;
  return data as AllianceBoard;
}

export async function updateBoardState(boardId: string, state: AllianceBoardState) {
  const { error } = await supabase
    .from("alliance_boards")
    .update({ state, updated_at: new Date().toISOString() })
    .eq("id", boardId);

  if (error) throw error;
}

export async function saveBoardSnapshot(orgId: string, eventKey: string, state: AllianceBoardState, label: string, createdBy: string) {
  const { data, error } = await supabase
    .from("alliance_boards")
    .insert({
      org_id: orgId,
      event_key: eventKey,
      name: label,
      state,
      is_active: false,
      created_by: createdBy,
    })
    .select()
    .single();

  if (error) throw error;
  return data as AllianceBoard;
}

export async function getBoardHistory(orgId: string, eventKey: string) {
  const { data, error } = await supabase
    .from("alliance_boards")
    .select("id, name, is_active, created_at, state")
    .eq("org_id", orgId)
    .eq("event_key", eventKey)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
}
