import { supabase } from "../client";

export interface Note {
  id: string; org_id: string; event_key: string; team_number: string | null;
  match_number: number | null; author_id: string; content: Record<string, unknown>;
  tags: string[]; audio_url: string | null; is_pinned: boolean;
  created_at: string; updated_at: string;
  profiles?: { display_name: string };
}

export async function getNotes(orgId: string, eventKey: string, teamNumber?: string): Promise<Note[]> {
  let q = supabase.from("notes").select("*, profiles(display_name)")
    .eq("org_id", orgId).eq("event_key", eventKey).order("is_pinned", { ascending: false }).order("created_at", { ascending: false });
  if (teamNumber) q = q.eq("team_number", teamNumber);
  const { data, error } = await q;
  if (error) throw error;
  return data as Note[];
}

export async function upsertNote(note: Omit<Note, "id" | "created_at" | "updated_at" | "profiles">) {
  const { data, error } = await supabase.from("notes")
    .insert({ ...note, updated_at: new Date().toISOString() }).select().single();
  if (error) throw error;
  return data as Note;
}

export async function updateNote(id: string, updates: Partial<Pick<Note, "content" | "tags" | "is_pinned" | "audio_url">>) {
  const { error } = await supabase.from("notes").update({ ...updates, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}

export async function deleteNote(id: string) {
  const { error } = await supabase.from("notes").delete().eq("id", id);
  if (error) throw error;
}
