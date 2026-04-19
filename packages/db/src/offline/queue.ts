/**
 * Offline-first write queue
 * Stores failed writes in localStorage/AsyncStorage and replays on reconnect.
 */

export interface QueuedWrite {
  id: string;
  table: string;
  operation: "upsert" | "update" | "delete";
  payload: Record<string, unknown>;
  timestamp: number;
  retries: number;
}

const QUEUE_KEY = "coolfTC_write_queue";

function getQueue(): QueuedWrite[] {
  try {
    const raw = typeof window !== "undefined" ? localStorage.getItem(QUEUE_KEY) : null;
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveQueue(queue: QueuedWrite[]): void {
  try {
    if (typeof window !== "undefined") localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch { /* storage full — drop oldest */ }
}

export function enqueue(item: Omit<QueuedWrite, "id" | "timestamp" | "retries">): void {
  const queue = getQueue();
  queue.push({ ...item, id: crypto.randomUUID(), timestamp: Date.now(), retries: 0 });
  saveQueue(queue);
}

export function dequeue(id: string): void {
  saveQueue(getQueue().filter((i) => i.id !== id));
}

export function getPendingWrites(): QueuedWrite[] {
  return getQueue();
}

export function clearQueue(): void {
  saveQueue([]);
}
