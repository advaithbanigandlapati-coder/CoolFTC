import { useEffect } from "react";
import { supabase } from "../client";

export function useNotesSync(orgId: string, eventKey: string, teamNumber: string | null, onUpdate: () => void) {
  useEffect(() => {
    if (!orgId || !eventKey) return;
    const channel = supabase
      .channel(`notes:${orgId}:${eventKey}:${teamNumber ?? "all"}`)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "notes",
        filter: `org_id=eq.${orgId}`,
      }, () => onUpdate())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [orgId, eventKey, teamNumber, onUpdate]);
}
