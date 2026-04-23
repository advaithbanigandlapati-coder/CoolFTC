import { supabase } from "../client";
import { getPendingWrites, dequeue } from "./queue";

/** Replays queued offline writes when connectivity is restored */
export async function replayQueue(): Promise<{ success: number; failed: number }> {
  const pending = getPendingWrites();
  let success = 0, failed = 0;
  for (const write of pending) {
    try {
      if (write.operation === "upsert") {
        const { error } = await supabase.from(write.table).upsert(write.payload);
        if (error) throw error;
      } else if (write.operation === "update") {
        const { id, ...rest } = write.payload as { id: string };
        const { error } = await supabase.from(write.table).update(rest).eq("id", id);
        if (error) throw error;
      } else if (write.operation === "delete") {
        const { error } = await supabase.from(write.table).delete().eq("id", write.payload.id);
        if (error) throw error;
      }
      dequeue(write.id);
      success++;
    } catch { failed++; }
  }
  return { success, failed };
}
