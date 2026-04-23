/**
 * Supabase Realtime hook — scouting entries
 * Call inside a React component to get live updates from all scouts.
 */
import { useEffect, useCallback } from "react";
import { supabase } from "../client";

export function useScoutingSync(
  orgId: string,
  eventKey: string,
  onUpdate: (payload: { new: Record<string, unknown>; old: Record<string, unknown>; eventType: string }) => void
) {
  useEffect(() => {
    if (!orgId || !eventKey) return;
    const channel = supabase
      .channel(`scouting:${orgId}:${eventKey}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "scouting_entries",
        filter: `org_id=eq.${orgId}`,
      }, (payload) => onUpdate({ new: payload.new as Record<string, unknown>, old: payload.old as Record<string, unknown>, eventType: payload.eventType }))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [orgId, eventKey, onUpdate]);
}
