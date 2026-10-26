// What task details (guide 6.3) holds while it's open, and what it writes: a new task in full, or only the
// fields that changed, so a colleague's change to another field is never written over.
import { linkedCompany, type CompaniesById } from "@/lib/kinds";
import { statusPatch, taskStatus, type TaskStatus } from "@/lib/taskStatus";
import type { InformedPerson, NewTask, Task, TaskPriority, TaskType } from "@/lib/types";

export type About = "company" | "internal";

export interface TaskDraft {
  task: string;
  status: TaskStatus;
  about: About;
  companyId: number | null;
  group: string; // a task group's name, "" for none
  taskType: TaskType | "";
  priority: TaskPriority | null;
  touchPoint: string;
  startDate: string; // yyyy-mm-dd or ""
  endDate: string;
  lastActionDate: string;
  responsible: string[];
  informed: InformedPerson[];
  keyPoints: string;
}

export function emptyDraft(group = ""): TaskDraft {
  return {
    task: "",
    status: "todo",
    about: "internal",
    companyId: null,
    group,
    taskType: "",
    priority: null,
    touchPoint: "",
    startDate: "",
    endDate: "",
    lastActionDate: "",
    responsible: [],
    informed: [],
    keyPoints: "",
  };
}

// A task whose company was deleted reads as internal work, as everywhere else (guide 5.2).
export function draftFromTask(t: Task, companies: CompaniesById): TaskDraft {
  const company = linkedCompany(t, companies);
  return {
    task: t.task,
    status: taskStatus(t),
    about: company ? "company" : "internal",
    companyId: company?.id ?? null,
    group: t.taskGroup ?? "",
    taskType: t.taskType ?? "",
    priority: t.priority ?? null,
    touchPoint: t.touchPoint ?? "",
    startDate: t.startDate || "",
    endDate: t.endDate || "",
    lastActionDate: t.lastActionDate || "",
    responsible: [...t.responsible],
    informed: t.informed.map((p) => ({ ...p })),
    keyPoints: t.keyPoints ?? "",
  };
}

// The stored fields a draft stands for, apart from its status (lib/taskStatus). Undefined clears a field.
function fieldsOf(d: TaskDraft): Omit<NewTask, "order" | "completed" | "completedAt" | "startedAt"> {
  const company = d.about === "company" && d.companyId != null;
  return {
    task: d.task.trim(),
    linkedClientId: company ? d.companyId! : undefined,
    taskGroup: d.group || undefined,
    taskType: d.taskType || undefined,
    priority: d.priority ?? undefined,
    touchPoint: d.touchPoint.trim() || undefined,
    startDate: d.startDate,
    endDate: d.endDate,
    lastActionDate: d.lastActionDate || undefined,
    responsible: d.responsible,
    informed: d.informed.map((p) => (p.note?.trim() ? { name: p.name, note: p.note.trim() } : { name: p.name })),
    keyPoints: d.keyPoints.trim(),
  };
}

export function newTaskFromDraft(d: TaskDraft, order = Date.now()): NewTask {
  return { ...fieldsOf(d), ...(d.status === "todo" ? {} : statusPatch(d.status, undefined, order)), order };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

// Only what changed between the draft as it opened and as it is now. A new status writes what it stands for, keeping
// the task's own start date (pass the task as it is).
export function patchFromDraft(opened: TaskDraft, now: TaskDraft, current?: Task): Partial<NewTask> {
  const before = fieldsOf(opened);
  const after = fieldsOf(now);
  const patch: Record<string, unknown> = {};
  for (const key of Object.keys(after) as (keyof typeof after)[]) {
    if (!same(before[key], after[key])) patch[key] = after[key];
  }
  if (opened.status !== now.status) Object.assign(patch, statusPatch(now.status, current));
  return patch as Partial<NewTask>;
}

export const hasDescription = (d: TaskDraft) => d.task.trim().length > 0;
