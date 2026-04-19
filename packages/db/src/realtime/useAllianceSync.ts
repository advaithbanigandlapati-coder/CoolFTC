import { useEffect } from "react";
import { supabase } from "../client";

export function useAllianceSync(boardId: string, onUpdate: (state: unknown) => void) {
  useEffect(() => {
    if (!boardId) return;
    const channel = supabase
      .channel(`alliance:${boardId}`)
      .on("postgres_changes", {
        event: "UPDATE", schema: "public", table: "alliance_boards",
        filter: `id=eq.${boardId}`,
      }, (payload) => onUpdate((payload.new as Record<string, unknown>).state))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [boardId, onUpdate]);
}
