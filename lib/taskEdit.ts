// Pure chat-edit validation and previews. No database, calendar calls or clock reads.
import { createHash } from "node:crypto";
import type { PipelineEntry } from "./clientTypes";
import { isIsoDay } from "./dates";
import { namesInUse } from "./people";
import { validateCalendarTimes } from "./taskCalendar";
import { statusPatch, withCompletedAt, type TaskStatus } from "./taskStatus";
import type { InformedPerson, NewTask, Task } from "./types";

export const MAX_TASK_CHANGES = 50;

export interface TaskEditFields {
  task?: string;
  startDate?: string;
  endDate?: string;
  keyPoints?: string;
  status?: TaskStatus;
  parked?: { until: string | null } | false;
  responsible?: string[];
  informed?: InformedPerson[];
  calendar?: Task["calendar"] | null;
}

export interface TaskChange {
  taskId: string;
  set: TaskEditFields;
}

export interface TaskChangesValidation {
  changes: TaskChange[] | null;
  errors: string[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const tidyName = (name: string) => name.trim().replace(/\s+/g, " ");
const nameKey = (name: string) => tidyName(name).toLowerCase();

export function validateTaskChanges(input: unknown): TaskChangesValidation {
  const errors: string[] = [];
  const changes: TaskChange[] = [];
  if (!Array.isArray(input) || input.length < 1 || input.length > MAX_TASK_CHANGES) {
    return { changes: null, errors: [`changes must contain 1 to ${MAX_TASK_CHANGES} task changes.`] };
  }
  const knownFields = (record: Record<string, unknown>, fields: string[], path: string) => {
    for (const field of Object.keys(record)) {
      if (!fields.includes(field)) errors.push(`${path}.${field} is not a supported field.`);
    }
  };
  const text = (value: unknown, path: string, allowEmpty = false): value is string => {
    if (typeof value === "string" && (allowEmpty || value.trim())) return true;
    errors.push(`${path} must be ${allowEmpty ? "" : "non-empty "}text.`);
    return false;
  };
  const ids = new Set<string>();
  for (const [index, change] of input.entries()) {
    const path = `changes[${index}]`;
    if (!isRecord(change)) { errors.push(`${path} must be an object.`); continue; }
    knownFields(change, ["taskId", "set"], path);
    if (text(change.taskId, `${path}.taskId`)) {
      const id = change.taskId;
      const bytes = new TextEncoder().encode(id);
      if (id !== id.trim() || id.includes("/") || [".", ".."].includes(id) || /^__.*__$/.test(id)
        || bytes.length > 1500 || new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes) !== id) {
        errors.push(`${path}.taskId must be a single valid task document ID.`);
      }
      if (ids.has(id)) errors.push(`${path}.taskId repeats task ${id}; use one change per task.`);
      ids.add(id);
    }
    if (!isRecord(change.set) || Object.keys(change.set).length === 0) {
      errors.push(`${path}.set must contain at least one field change.`);
      continue;
    }
    const fields = change.set;
    const set: TaskEditFields = {};
    const fieldPath = `${path}.set`;
    knownFields(fields, ["task", "startDate", "endDate", "keyPoints", "status", "parked", "responsible", "informed", "calendar"], fieldPath);
    if (Object.hasOwn(fields, "task") && text(fields.task, `${fieldPath}.task`)) set.task = fields.task.trim();
    // Key points are a whole-text replacement, including intentional spaces and line breaks.
    if (Object.hasOwn(fields, "keyPoints") && text(fields.keyPoints, `${fieldPath}.keyPoints`, true)) set.keyPoints = fields.keyPoints;
    for (const field of ["startDate", "endDate"] as const) {
      if (!Object.hasOwn(fields, field)) continue;
      if (!isIsoDay(fields[field])) errors.push(`${fieldPath}.${field} must be a real yyyy-mm-dd calendar day.`);
      else set[field] = fields[field];
    }
    if (set.startDate && set.endDate && set.startDate > set.endDate) errors.push(`${fieldPath}.startDate must not be after endDate.`);
    if (Object.hasOwn(fields, "status")) {
      if (fields.status === "todo" || fields.status === "inProgress" || fields.status === "done") set.status = fields.status;
      else errors.push(`${fieldPath}.status must be todo, inProgress or done.`);
    }
    if (Object.hasOwn(fields, "parked")) {
      if (fields.parked === false) set.parked = false;
      else if (isRecord(fields.parked)) {
        knownFields(fields.parked, ["until"], `${fieldPath}.parked`);
        if (fields.parked.until === null || isIsoDay(fields.parked.until)) set.parked = { until: fields.parked.until };
        else errors.push(`${fieldPath}.parked.until must be a real yyyy-mm-dd calendar day or null.`);
      } else errors.push(`${fieldPath}.parked must be false or an object with until.`);
    }
    if (Object.hasOwn(fields, "responsible")) {
      if (!Array.isArray(fields.responsible)) errors.push(`${fieldPath}.responsible must be a list of names.`);
      else set.responsible = fields.responsible.filter((name, i): name is string => text(name, `${fieldPath}.responsible[${i}]`)).map(tidyName);
    }
    if (Object.hasOwn(fields, "informed")) {
      if (!Array.isArray(fields.informed)) errors.push(`${fieldPath}.informed must be a list of people.`);
      else {
        set.informed = [];
        for (const [i, person] of fields.informed.entries()) {
          const personPath = `${fieldPath}.informed[${i}]`;
          if (!isRecord(person)) { errors.push(`${personPath} must be an object.`); continue; }
          knownFields(person, ["name", "note"], personPath);
          if (!text(person.name, `${personPath}.name`)) continue;
          const informed: InformedPerson = { name: tidyName(person.name) };
          if (Object.hasOwn(person, "note") && text(person.note, `${personPath}.note`, true)) informed.note = person.note;
          set.informed.push(informed);
        }
      }
    }
    if (Object.hasOwn(fields, "calendar")) {
      if (fields.calendar === null) set.calendar = null;
      else if (isRecord(fields.calendar)) {
        knownFields(fields.calendar, ["startTime", "endTime"], `${fieldPath}.calendar`);
        const calendar: NonNullable<Task["calendar"]> = {};
        for (const field of ["startTime", "endTime"] as const) {
          if (Object.hasOwn(fields.calendar, field) && text(fields.calendar[field], `${fieldPath}.calendar.${field}`, true)) {
            if (fields.calendar[field]) calendar[field] = fields.calendar[field];
          }
        }
        // Different placeholder days check time syntax/pairs here; the builder checks the actual dates.
        for (const [field, error] of Object.entries(validateCalendarTimes({ startDate: "2000-01-01", endDate: "2000-01-02", calendar }))) {
          errors.push(`${fieldPath}.calendar.${field}: ${error}`);
        }
        set.calendar = calendar;
      } else errors.push(`${fieldPath}.calendar must be a calendar mark object or null.`);
    }
    changes.push({ taskId: change.taskId as string, set });
  }
  return { changes: errors.length ? null : changes, errors };
}

// Stored JSON fields only: absent/undefined fields match, object order does not matter, array order does.
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value).filter(([, entry]) => entry !== undefined)
      .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function taskSeen(task: Task): string {
  const { id: _id, ...stored } = task;
  void _id;
  return createHash("sha256").update(canonicalJson(stored)).digest("hex");
}

export interface TaskEditWarning {
  id: string;
  code: "past-date" | "outside-parent-range" | "subtasks-outside-range" | "new-person" | "done-task" | "company-deadline";
  message: string;
  taskId: string;
  relatedTaskId?: string;
  field?: "startDate" | "endDate" | "parkedUntil";
}

export interface TaskEditContext {
  tasks: readonly Task[];
  companies: readonly PipelineEntry[];
  names: Iterable<string>;
  today: string;
  calendarOn: boolean;
  now: number; // Caller-supplied epoch ms so timestamp patches are deterministic and use the save's clock.
}

export interface TaskChangePreview {
  taskId: string;
  before: Task;
  after: Task;
  patch: Partial<NewTask>; // Undefined clears a field through toTaskUpdate at the write boundary.
  seen: string;
  warnings: TaskEditWarning[];
}

export interface TaskChangesPreview {
  changes: TaskChange[] | null;
  tasks: TaskChangePreview[];
  warnings: TaskEditWarning[];
  errors: string[];
  canWrite: boolean;
}

export function buildTaskChanges(input: unknown, context: TaskEditContext): TaskChangesPreview {
  const { changes, errors } = validateTaskChanges(input);
  const result: TaskChangesPreview = { changes, tasks: [], warnings: [], errors, canWrite: false };
  if (!changes) return result;
  if (!isIsoDay(context.today)) errors.push("today must be a real yyyy-mm-dd Asia/Jakarta calendar day.");
  if (!Number.isFinite(context.now) || context.now <= 0) errors.push("now must be positive epoch milliseconds.");
  if (errors.length) return result;
  const byId = new Map(context.tasks.map((task) => [task.id, task]));
  const names = new Map<string, string>();
  for (const name of namesInUse([...context.tasks], context.names)) {
    if (!names.has(nameKey(name))) names.set(nameKey(name), name);
  }
  for (const change of changes) {
    const before = byId.get(change.taskId);
    if (!before) { errors.push(`Task ${change.taskId} was not found. Find the task again.`); continue; }
    const warnings: TaskEditWarning[] = [];
    const set = change.set;
    const patch: Partial<NewTask> = {};
    const person = (name: string) => {
      const stored = names.get(nameKey(name));
      if (stored) return stored;
      warnings.push({ id: `new-person:${name}`, code: "new-person", taskId: before.id,
        message: `"${name}" is not a name already in use. Confirm this spelling before adding a new person.` });
      return name;
    };
    for (const field of ["task", "startDate", "endDate", "keyPoints"] as const) {
      if (set[field] !== undefined) patch[field] = set[field];
    }
    if (set.responsible) patch.responsible = set.responsible.map(person);
    if (set.informed) patch.informed = set.informed.map((entry) => ({ ...entry, name: person(entry.name) }));
    if (set.status !== undefined) Object.assign(patch, withCompletedAt(statusPatch(set.status, before, context.now), before, context.now));
    if (set.parked !== undefined) {
      if (set.parked !== false && (patch.completed ?? before.completed)) errors.push(`Task "${before.task}" is done and cannot be parked.`);
      else Object.assign(patch, set.parked === false
        ? { parkedAt: undefined, parkedUntil: undefined }
        : { parkedAt: context.now, parkedUntil: set.parked.until ?? undefined });
    }
    if (Object.hasOwn(set, "calendar")) {
      if (!context.calendarOn) errors.push(`Task "${before.task}": the team calendar isn't connected; calendar changes are unavailable.`);
      patch.calendar = set.calendar ?? undefined;
    }
    const after = Object.fromEntries(Object.entries({ ...before, ...patch }).filter(([, value]) => value !== undefined)) as unknown as Task;
    const datesSet = set.startDate !== undefined || set.endDate !== undefined;
    if (datesSet && isIsoDay(after.startDate) && isIsoDay(after.endDate) && after.startDate > after.endDate) {
      errors.push(`Task "${before.task}": startDate must not be after endDate.`);
    }
    if (datesSet || Object.hasOwn(set, "calendar")) {
      for (const [field, message] of Object.entries(validateCalendarTimes(after))) errors.push(`Task "${before.task}" ${field}: ${message}`);
    }
    for (const field of ["startDate", "endDate", "parkedUntil"] as const) {
      const date = after[field];
      if (date && Object.hasOwn(patch, field) && date < context.today) warnings.push({
        id: `past-date:${encodeURIComponent(before.id)}:${field}`, code: "past-date", taskId: before.id, field,
        message: `Task "${before.task}" ${field} (${date}) is in the past. Confirm this exact date or preview again.`,
      });
    }
    if (before.completed) warnings.push({ id: `done-task:${encodeURIComponent(before.id)}`, code: "done-task", taskId: before.id,
      message: `Task "${before.task}" is done. Confirm the changes to this finished task.` });
    const company = after.linkedClientId == null ? undefined : context.companies.find((entry) => entry.id === after.linkedClientId);
    if (company && !after.completed && after.endDate !== before.endDate && company.target !== after.endDate) warnings.push({
      id: `company-deadline:${encodeURIComponent(before.id)}:${company.id}`, code: "company-deadline", taskId: before.id,
      message: `Company "${company.company}" target will follow this task's deadline: ${company.target || "no target"} → ${after.endDate}. Its last action follows this task's last action when present; other tasks keep their dates.`,
    });
    result.tasks.push({ taskId: before.id, before: structuredClone(before), after, patch, seen: taskSeen(before), warnings });
  }

  // Compare the final requested ranges, even when both a parent and its child are listed.
  const next = new Map(byId);
  for (const preview of result.tasks) next.set(preview.taskId, preview.after);
  const outside = (child: Task, parent: Task) => [child.startDate, child.endDate].some((date) =>
    isIsoDay(date) && ((isIsoDay(parent.startDate) && date < parent.startDate) || (isIsoDay(parent.endDate) && date > parent.endDate)));
  for (const preview of result.tasks) {
    const { before, after, warnings } = preview;
    if (before.startDate === after.startDate && before.endDate === after.endDate) continue;
    const parent = after.parentId ? next.get(after.parentId) : undefined;
    if (parent && parent.id !== after.id && outside(after, parent)) warnings.push({
      id: `outside-parent-range:${encodeURIComponent(after.id)}:${encodeURIComponent(parent.id)}`, code: "outside-parent-range", taskId: after.id, relatedTaskId: parent.id,
      message: `Task "${after.task}" (${after.startDate} to ${after.endDate}) falls outside main task "${parent.task}" (${parent.startDate || "no start"} to ${parent.endDate || "no end"}). Only listed tasks change.`,
    });
    const children = [...next.values()].filter((task) => task.id !== after.id && task.parentId === after.id).sort((a, b) => a.id.localeCompare(b.id));
    for (const child of children) {
      if (outside(child, after)) warnings.push({
        id: `subtasks-outside-range:${encodeURIComponent(after.id)}:${encodeURIComponent(child.id)}`, code: "subtasks-outside-range", taskId: after.id, relatedTaskId: child.id,
        message: `Main task "${after.task}" new dates (${after.startDate} to ${after.endDate}) leave subtask "${child.task}" (${child.startDate || "no start"} to ${child.endDate || "no end"}) outside its range. The subtask keeps its own dates unless explicitly listed.`,
      });
    }
  }
  for (const preview of result.tasks) preview.warnings = [...new Map(preview.warnings.map((warning) => [warning.id, warning])).values()];
  result.warnings = [...new Map(result.tasks.flatMap((preview) => preview.warnings).map((warning) => [warning.id, warning])).values()];
  result.canWrite = errors.length === 0;
  return result;
}
