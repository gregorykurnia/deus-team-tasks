import type { PipelineEntry } from "./clientTypes";
import type { Task } from "./types";

// B12: an open task's last action and deadline can move its company, never other tasks.
// Kept pure so browser saves and server transactions use exactly the same rule.
export function companyPatchFrom(company: PipelineEntry, task: Pick<Task, "lastActionDate" | "endDate">): Partial<Omit<PipelineEntry, "id">> | null {
  const date = task.lastActionDate ?? company.date;
  const target = task.endDate || company.target;
  return date !== company.date || target !== company.target ? { date, target } : null;
}
