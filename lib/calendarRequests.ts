import type { NewTask } from "./types";

// Tasks with a sync request in flight, so task details can say "Adding to the team calendar…" (C04). A request that
// settled stays pending a moment longer, for the server's write to reach this device before the status is judged.
const inFlight = new Map<string, number>();
const listeners = new Set<() => void>();
const SETTLE_MS = 2000;

function mark(ids: readonly string[], by: 1 | -1) {
  for (const id of ids) {
    const count = (inFlight.get(id) ?? 0) + by;
    if (count > 0) inFlight.set(id, count);
    else inFlight.delete(id);
  }
  for (const listener of listeners) listener();
}

export const calendarSyncPending = (id: string): boolean => inFlight.has(id);

export function subscribeCalendarPending(listener: () => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

// Calendar work follows a saved task; it must never hold up or fail that save.
export function requestCalendarSync(ids: readonly string[]): void {
  const taskIds = [...new Set(ids)];
  for (let i = 0; i < taskIds.length; i += 50) {
    const chunk = taskIds.slice(i, i + 50);
    mark(chunk, 1);
    const settle = () => void setTimeout(() => mark(chunk, -1), SETTLE_MS);
    try {
      void fetch("/api/calendar/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskIds: chunk }),
      }).catch(() => {}).finally(settle);
    } catch {
      // A missing/offline fetch must not prevent the remaining requests or the task write.
      settle();
    }
  }
}

// Only event content matters: status, parking and group changes leave it alone.
export function taskCalendarChanged(current: Partial<NewTask> | undefined, patch: Partial<NewTask>): boolean {
  const before = current?.calendar;
  const after = "calendar" in patch ? patch.calendar : before;
  if (!before && !after) return false;
  const markChanged = "calendar" in patch && (!!before !== !!after
    || before?.startTime !== after?.startTime || before?.endTime !== after?.endTime);
  const fields = ["task", "startDate", "endDate", "keyPoints", "parentId", "linkedClientId"] as const;
  return markChanged || fields.some((field) => field in patch && current?.[field] !== patch[field]);
}
