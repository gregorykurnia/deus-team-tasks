// Pure chat-edit validation and previews. No database, calendar calls or clock reads.
import { createHash } from "node:crypto";
import type { PipelineEntry } from "./clientTypes";
import { isIsoDay } from "./dates";
import { isParked } from "./parking";
import { namesInUse } from "./people";
import { newSubtask } from "./subtasks";
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
  set?: TaskEditFields;
  move?: { toParentId: string | null };
  delete?: true;
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
  const documentId = (value: unknown, path: string): value is string => {
    if (!text(value, path)) return false;
    const bytes = new TextEncoder().encode(value);
    if (value !== value.trim() || value.includes("/") || [".", ".."].includes(value) || /^__.*__$/.test(value)
      || bytes.length > 1500 || new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes) !== value) {
      errors.push(`${path} must be a single valid task document ID.`);
      return false;
    }
    return true;
  };
  for (const [index, change] of input.entries()) {
    const path = `changes[${index}]`;
    if (!isRecord(change)) { errors.push(`${path} must be an object.`); continue; }
    knownFields(change, ["taskId", "set", "move", "delete"], path);
    if (documentId(change.taskId, `${path}.taskId`)) {
      const id = change.taskId;
      if (ids.has(id)) errors.push(`${path}.taskId repeats task ${id}; use one change per task.`);
      ids.add(id);
    }
    const validated: TaskChange = { taskId: change.taskId as string };
    if (Object.hasOwn(change, "delete")) {
      if (change.delete !== true) errors.push(`${path}.delete must be true.`);
      if (Object.hasOwn(change, "set") || Object.hasOwn(change, "move")) errors.push(`${path}.delete must be used alone, without set or move.`);
      changes.push({ ...validated, delete: true });
      continue;
    }
    if (Object.hasOwn(change, "move")) {
      if (!isRecord(change.move)) errors.push(`${path}.move must be an object with toParentId.`);
      else {
        knownFields(change.move, ["toParentId"], `${path}.move`);
        if (change.move.toParentId === null || documentId(change.move.toParentId, `${path}.move.toParentId`)) {
          validated.move = { toParentId: change.move.toParentId };
        }
      }
    }
    if (!Object.hasOwn(change, "set")) {
      if (!Object.hasOwn(change, "move")) errors.push(`${path} must contain set, move or delete.`);
      changes.push(validated);
      continue;
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
    changes.push({ ...validated, set });
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
  code: "past-date" | "outside-parent-range" | "subtasks-outside-range" | "new-person" | "done-task" | "company-deadline" | "company-change" | "delete";
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
  after: Task | null; // Null means delete; freed subtasks appear here too, with their own patch and seen stamp.
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

function patchedTask(task: Task, patch: Partial<NewTask>): Task {
  return Object.fromEntries(Object.entries({ ...task, ...patch }).filter(([, value]) => value !== undefined)) as unknown as Task;
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
    if (change.delete) {
      result.tasks.push({ taskId: before.id, before: structuredClone(before), after: null, patch: {}, seen: taskSeen(before), warnings });
      continue;
    }
    const set = change.set ?? {};
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
    const after = patchedTask(before, patch);
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
    result.tasks.push({ taskId: before.id, before: structuredClone(before), after, patch, seen: taskSeen(before), warnings });
  }

  const previews = new Map(result.tasks.map((preview) => [preview.taskId, preview]));
  const mergePatch = (preview: TaskChangePreview, patch: Partial<NewTask>) => {
    Object.assign(preview.patch, patch);
    preview.after = patchedTask(preview.before, preview.patch);
  };
  const companyName = (id: number | undefined) => id == null ? "Internal"
    : context.companies.find((company) => company.id === id)?.company ?? `company ${id}`;
  for (const change of changes) {
    const preview = previews.get(change.taskId);
    if (!preview || !change.move) continue;
    const { before, warnings } = preview;
    const parentId = change.move.toParentId;
    if (parentId === null) { mergePatch(preview, { parentId: undefined }); continue; }
    const parent = byId.get(parentId);
    if (!parent) { errors.push(`Main task ${parentId} was not found. Find the main task again.`); continue; }
    if (parent.id === before.id) errors.push(`Task "${before.task}" cannot move under itself.`);
    if (parent.parentId != null || parent.completed || isParked(parent, context.today)) {
      errors.push(`Task "${parent.task}" must be an open, unparked, top-level main task (even if its parent is missing).`);
    }
    if (context.tasks.some((task) => task.parentId === before.id)) errors.push(`Task "${before.task}" has subtasks and cannot become a subtask; only one level is allowed.`);
    const { linkedClientId, taskGroup } = newSubtask(parent, before.task, before.order);
    mergePatch(preview, { parentId, linkedClientId, taskGroup });
    if ((before.linkedClientId ?? null) !== (linkedClientId ?? null)) warnings.push({
      id: `company-change:${encodeURIComponent(before.id)}`, code: "company-change", taskId: before.id, relatedTaskId: parentId,
      message: `Task "${before.task}" takes main task "${parent.task}"'s company: ${companyName(before.linkedClientId)} → ${companyName(linkedClientId)}. Confirm this company change.`,
    });
  }

  const next = new Map(byId);
  for (const preview of result.tasks) {
    if (preview.after) next.set(preview.taskId, preview.after);
    else next.delete(preview.taskId);
  }
  // A listed edit combines with the unlink; an explicit move to another parent takes precedence.
  for (const deleted of result.tasks.filter((preview) => preview.after === null)) {
    let freed = 0;
    for (const child of [...next.values()].filter((task) => task.parentId === deleted.taskId).sort((a, b) => a.id.localeCompare(b.id))) {
      let preview = previews.get(child.id);
      if (!preview) {
        const before = byId.get(child.id)!;
        preview = { taskId: child.id, before: structuredClone(before), after: child, patch: {}, seen: taskSeen(before), warnings: [] };
        previews.set(child.id, preview);
        result.tasks.push(preview);
      }
      mergePatch(preview, { parentId: undefined });
      next.set(child.id, preview.after!);
      freed++;
    }
    // An explicitly freed child was already unlinked above, but belongs in the delete's warning count.
    freed += changes.filter((change) => change.move?.toParentId === null && byId.get(change.taskId)?.parentId === deleted.taskId).length;
    deleted.warnings.push({ id: `delete:${encodeURIComponent(deleted.taskId)}`, code: "delete", taskId: deleted.taskId,
      message: `Delete task "${deleted.before.task}" (${deleted.taskId}). This frees ${freed} subtask${freed === 1 ? "" : "s"} as tasks of their own. There is no Undo; confirm this task by name.`,
    });
  }
  // Check the final destinations too: another listed change may delete, nest, finish or park a parent.
  for (const change of changes) {
    if (!change.move || change.move.toParentId === null) continue;
    const parent = next.get(change.move.toParentId);
    if (!parent || parent.parentId != null || parent.completed || isParked(parent, context.today)) {
      errors.push(`Task ${change.taskId}: the destination must remain an open, unparked, top-level main task after all changes.`);
    }
  }

  // Compare the final relationships and requested ranges, even when both a parent and child are listed.
  const outside = (child: Task, parent: Task) => [child.startDate, child.endDate].some((date) =>
    isIsoDay(date) && ((isIsoDay(parent.startDate) && date < parent.startDate) || (isIsoDay(parent.endDate) && date > parent.endDate)));
  for (const preview of result.tasks) {
    const { before, after, warnings } = preview;
    if (!after) continue;
    const company = after.linkedClientId == null ? undefined : context.companies.find((entry) => entry.id === after.linkedClientId);
    if (company && !after.completed && after.endDate !== before.endDate && company.target !== after.endDate) warnings.push({
      id: `company-deadline:${encodeURIComponent(before.id)}:${company.id}`, code: "company-deadline", taskId: before.id,
      message: `Company "${company.company}" target will follow this task's deadline: ${company.target || "no target"} → ${after.endDate}. Its last action follows this task's last action when present; other tasks keep their dates.`,
    });
    const datesChanged = before.startDate !== after.startDate || before.endDate !== after.endDate;
    if (!datesChanged && before.parentId === after.parentId) continue;
    const parent = after.parentId ? next.get(after.parentId) : undefined;
    if (parent && parent.id !== after.id && outside(after, parent)) warnings.push({
      id: `outside-parent-range:${encodeURIComponent(after.id)}:${encodeURIComponent(parent.id)}`, code: "outside-parent-range", taskId: after.id, relatedTaskId: parent.id,
      message: `Task "${after.task}" (${after.startDate} to ${after.endDate}) falls outside main task "${parent.task}" (${parent.startDate || "no start"} to ${parent.endDate || "no end"}). Only listed tasks change.`,
    });
    const children = datesChanged ? [...next.values()].filter((task) => task.id !== after.id && task.parentId === after.id).sort((a, b) => a.id.localeCompare(b.id)) : [];
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
