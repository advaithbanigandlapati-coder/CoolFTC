import { supabase } from "../client";
import type { Event } from "@coolfTC/types";

export async function getEvents(seasonYear = 2025): Promise<Event[]> {
  const { data, error } = await supabase
    .from("events").select("*").eq("season_year", seasonYear).order("start_date");
  if (error) throw error;
  return data as Event[];
}

export async function getEvent(eventKey: string): Promise<Event | null> {
  const { data } = await supabase.from("events").select("*").eq("event_key", eventKey).single();
  return data as Event | null;
}

export async function upsertEvent(event: Omit<Event, never>) {
  const { error } = await supabase.from("events").upsert(event, { onConflict: "event_key" });
  if (error) throw error;
}
