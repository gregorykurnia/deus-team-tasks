// Changing a task in place on All tasks (the quick editor of guide 4.9, on the task list): which details open an editor
// from their cell, what the editor offers, and what a change writes. Pure; the screen saves it (lib/companyWrites).
import type { ChoiceOption, FieldType } from "./companySettings";
import type { ColumnId } from "./taskColumns";
import { STATUS_LABELS, TASK_STATUSES, taskStatus, type TaskStatus } from "./taskStatus";
import { TASK_PRIORITIES, TASK_TYPES, TOUCH_POINTS, type NewTask, type Task, type TaskPriority, type TaskType } from "./types";

export type EditableColumn = "status" | "type" | "touch" | "prio" | "start" | "end" | "last" | "key";

export interface CellField {
  key: string; // the stored field, "status" for the status (completed and startedAt)
  label: string;
  type: Extract<FieldType, "choice" | "date" | "long">;
}

const FIELDS: Record<EditableColumn, CellField> = {
  status: { key: "status", label: "Status", type: "choice" },
  type: { key: "taskType", label: "Task type", type: "choice" },
  touch: { key: "touchPoint", label: "Touch point", type: "choice" },
  prio: { key: "priority", label: "Priority", type: "choice" },
  start: { key: "startDate", label: "Start", type: "date" },
  end: { key: "endDate", label: "Deadline", type: "date" },
  last: { key: "lastActionDate", label: "Last action", type: "date" },
  key: { key: "keyPoints", label: "Key points", type: "long" },
};

// Company, group, and the people stay in task details. So does the deadline of a finished or parked task: its cell
// shows when it was finished or comes back instead.
export function cellEditable(id: ColumnId, state: { done: boolean; parked: boolean }): id is EditableColumn {
  if (!(id in FIELDS)) return false;
  return id !== "end" || (!state.done && !state.parked);
}

export const cellField = (id: EditableColumn): CellField => FIELDS[id];

const STATUS_TONES: Record<TaskStatus, ChoiceOption["colour"]> = { todo: "slate", inProgress: "blue", done: "green" };
const PRIORITY_TONES: Record<TaskPriority, ChoiceOption["colour"]> = { High: "red", Medium: "amber", Low: "slate" };

// The options a choice offers, as option chips. A touch point written before there were chips is offered too.
export function cellOptions(id: EditableColumn, task: Task): ChoiceOption[] {
  switch (id) {
    case "status":
      return TASK_STATUSES.map((s) => ({ name: STATUS_LABELS[s], colour: STATUS_TONES[s] }));
    case "type":
      return TASK_TYPES.map((t) => ({ name: t, colour: "violet" }));
    case "touch": {
      const own = task.touchPoint && !(TOUCH_POINTS as readonly string[]).includes(task.touchPoint) ? [task.touchPoint] : [];
      return [...TOUCH_POINTS, ...own].map((t) => ({ name: t, colour: "sky" }));
    }
    case "prio":
      return TASK_PRIORITIES.map((p) => ({ name: p, colour: PRIORITY_TONES[p] }));
    default:
      return [];
  }
}

// What the editor starts from: the status by its label, empty values as nothing.
export function cellValue(id: EditableColumn, task: Task): string | undefined {
  const v = id === "status" ? STATUS_LABELS[taskStatus(task)] : task[FIELDS[id].key as keyof Task];
  return typeof v === "string" && v ? v : undefined;
}

// The status a label names, for a pick from the status editor.
export function statusFromLabel(label: string | undefined): TaskStatus | undefined {
  return TASK_STATUSES.find((s) => STATUS_LABELS[s] === label);
}

// What a new value writes to every field but the status. Dates and key points are stored empty; the rest are cleared.
export function cellPatch(id: Exclude<EditableColumn, "status">, value: string | number | undefined): Partial<NewTask> {
  const v = value === undefined ? "" : String(value).trim();
  switch (id) {
    case "type":
      return { taskType: (v || undefined) as TaskType | undefined };
    case "touch":
      return { touchPoint: v || undefined };
    case "prio":
      return { priority: (v || undefined) as TaskPriority | undefined };
    case "start":
      return { startDate: v };
    case "end":
      return { endDate: v };
    case "last":
      return { lastActionDate: v || undefined };
    case "key":
      return { keyPoints: v };
  }
}
