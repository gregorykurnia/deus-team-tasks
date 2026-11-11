import type { NewTask } from "./types";

// Calendar work follows a saved task; it must never hold up or fail that save.
export function requestCalendarSync(ids: readonly string[]): void {
  const taskIds = [...new Set(ids)];
  for (let i = 0; i < taskIds.length; i += 50) {
    try {
      void fetch("/api/calendar/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskIds: taskIds.slice(i, i + 50) }),
      }).catch(() => {});
    } catch {
      // A missing/offline fetch must not prevent the remaining requests or the task write.
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
