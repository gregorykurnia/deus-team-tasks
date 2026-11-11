import "server-only";
import { collection, deleteField, doc, getDocsFromServer, runTransaction, type DocumentData } from "firebase/firestore";
import { isDeepStrictEqual } from "node:util";
import type { PipelineEntry } from "./clientTypes";
import { calendarWritesEnabled, syncTaskCalendar, type CalendarSyncResult } from "./calendarSync";
import { companyPatchFrom } from "./companyDates";
import { db } from "./firebase";
import { clientsDb } from "./firebaseClients";
import { rolesIn } from "./flows";
import { wibToday } from "./followupServer";
import { isParked } from "./parking";
import { namesInUse } from "./people";
import { buildTaskChanges, taskSeen, validateTaskChanges, type TaskChange, type TaskChangePreview, type TaskEditContext } from "./taskEdit";
import { taskStatus } from "./taskStatus";
import type { Flow, NewTask, Task } from "./types";

export interface FindTasksInput {
  query?: string;
  companyId?: number;
  parentId?: string;
  includeDone?: boolean;
}

async function readTasks(): Promise<Task[]> {
  const snapshot = await getDocsFromServer(collection(db, "tasks"));
  return snapshot.docs.map((entry) => ({ ...entry.data() as NewTask, id: entry.id }));
}

async function readCompanies(): Promise<PipelineEntry[]> {
  const snapshot = await getDocsFromServer(collection(clientsDb, "pipeline"));
  return snapshot.docs.map((entry) => {
    const data = entry.data() as PipelineEntry;
    return typeof data.id === "number" ? data : { ...data, id: Number(entry.id) };
  });
}

export async function findTasks(input: FindTasksInput) {
  const [tasks, companies] = await Promise.all([readTasks(), readCompanies()]);
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const byCompany = new Map(companies.map((company) => [company.id, company]));
  const today = wibToday();
  const query = input.query?.trim().toLowerCase();
  const visible = tasks.filter((task) => input.includeDone || !task.completed);
  const matches = visible.filter((task) =>
    (!query || `${task.task}\n${task.keyPoints}`.toLowerCase().includes(query))
    && (input.companyId === undefined || task.linkedClientId === input.companyId)
    && (input.parentId === undefined || task.parentId === input.parentId))
    .sort((a, b) => a.task.localeCompare(b.task) || a.id.localeCompare(b.id));
  const summary = (task: Task) => {
    const parent = task.parentId ? byId.get(task.parentId) : undefined;
    const company = task.linkedClientId === undefined ? undefined : byCompany.get(task.linkedClientId);
    return {
      ...task,
      mainTask: parent ? { id: parent.id, task: parent.task } : null,
      company: company ? { id: company.id, name: company.company } : null,
      status: taskStatus(task), parked: isParked(task, today), calendar: task.calendar ?? null,
    };
  };
  return {
    tasks: matches.slice(0, 10).map((task) => ({
      ...summary(task), subtasks: visible.filter((child) => child.parentId === task.id)
        .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)).map(summary),
    })),
    hasMore: matches.length > 10,
  };
}

// Shared read context for previews; no browser listeners, cached reads or write helpers.
export async function readTaskEditData() {
  const [tasks, companies, snapshot] = await Promise.all([
    readTasks(), readCompanies(), getDocsFromServer(collection(db, "flows")),
  ]);
  const flows = snapshot.docs.map((entry) => ({ ...entry.data(), id: entry.id } as Flow));
  return { tasks, companies, names: namesInUse(tasks, [], rolesIn(flows)) };
}

export async function previewTaskChanges(changes: unknown) {
  const data = await readTaskEditData();
  const now = Date.now();
  return buildTaskChanges(changes, {
    ...data, now, today: wibToday(new Date(now)), calendarOn: calendarWritesEnabled(),
  });
}

export class TaskEditError extends Error {}

export interface TaskChangesSaved {
  alreadySaved: boolean;
  tasks: { taskId: string; saved: true; deleted: boolean; url: string; calendar: CalendarSyncResult | null }[];
}

function fields(task: Task): DocumentData {
  const { id: _id, ...stored } = task;
  void _id;
  return stored;
}

function updateFields(patch: DocumentData): DocumentData {
  return Object.fromEntries(Object.entries(patch).map(([key, value]) => [key, value === undefined ? deleteField() : value]));
}

// Compare requested after states, keeping the first save's generated parking/status timestamps.
// Deleted records are deliberately absent on retries; they must not make the builder fail.
function matchesSaved(changes: TaskChange[], context: TaskEditContext, stamps: Record<string, string>): boolean {
  const byId = new Map(context.tasks.map((task) => [task.id, task]));
  if (changes.some((change) => change.delete ? byId.has(change.taskId) : !byId.has(change.taskId))) return false;
  const remaining = changes.filter((change) => !change.delete);
  const preview = remaining.length ? buildTaskChanges(remaining, context) : null;
  if (preview?.errors.length) return false;
  for (const row of preview?.tasks ?? []) {
    const change = changes.find((entry) => entry.taskId === row.taskId)!;
    const patch = { ...row.patch };
    if (change.set?.parked && row.before.parkedAt) patch.parkedAt = row.before.parkedAt;
    if (Object.entries(patch).some(([key, value]) => !isDeepStrictEqual(row.before[key as keyof Task], value))) return false;
  }
  // Preview stamps retain freed subtask IDs after the deleted parent is gone (no receipt needed).
  const listed = new Set(changes.map((change) => change.taskId));
  return Object.keys(stamps).every((id) => listed.has(id) || (changes.some((change) => change.delete)
    && byId.has(id) && byId.get(id)!.parentId == null));
}

async function followCompanies(rows: TaskChangePreview[]) {
  const dated = rows.filter((row) => row.after && !row.after.completed && row.after.linkedClientId != null
    && row.after.endDate !== row.before.endDate);
  if (!dated.length) return;
  // The company project is separate. Commit its updates together, so one failure cannot leave half the companies moved.
  await runTransaction(clientsDb, async (transaction) => {
    const ids = [...new Set(dated.map((row) => row.after!.linkedClientId!))];
    const snapshots = await Promise.all(ids.map((id) => transaction.get(doc(clientsDb, "pipeline", String(id)))));
    const companies = new Map(snapshots.filter((entry) => entry.exists()).map((entry) => [Number(entry.id), entry.data() as PipelineEntry]));
    const patches = new Map<number, DocumentData>();
    for (const row of dated) {
      const task = row.after!;
      const company = companies.get(task.linkedClientId!);
      if (!company) continue;
      const patch = companyPatchFrom(company, task);
      if (patch) {
        patches.set(task.linkedClientId!, { ...patches.get(task.linkedClientId!), ...patch });
        companies.set(task.linkedClientId!, { ...company, ...patch });
      }
    }
    for (const [id, patch] of patches) transaction.update(doc(clientsDb, "pipeline", String(id)), updateFields(patch));
  });
}

async function restoreTaskChanges(rows: TaskChangePreview[]) {
  await runTransaction(db, async (transaction) => {
    const snapshots = await Promise.all(rows.map((row) => transaction.get(doc(db, "tasks", row.taskId))));
    for (const [index, snapshot] of snapshots.entries()) {
      const expected = rows[index].after;
      const current = snapshot.exists() ? { ...snapshot.data(), id: snapshot.id } as Task : null;
      if (expected ? !current || taskSeen(current) !== taskSeen(expected) : current !== null) {
        throw new TaskEditError(`The company update failed, and task ${snapshot.id} changed again before it could be restored. Find the tasks and check them before retrying.`);
      }
    }
    for (const row of rows) transaction.set(doc(db, "tasks", row.taskId), fields(row.before));
  });
}

export async function applyTaskChanges(
  input: unknown, seen: unknown, acknowledgedWarnings: unknown, origin: string,
): Promise<TaskChangesSaved> {
  const validated = validateTaskChanges(input);
  if (!validated.changes) throw new TaskEditError(validated.errors.join(" "));
  const changes = validated.changes;
  if (!seen || typeof seen !== "object" || Array.isArray(seen)
    || Object.entries(seen).some(([id, stamp]) => !validateTaskChanges([{ taskId: id, delete: true }]).changes
      || typeof stamp !== "string" || !/^[a-f0-9]{64}$/.test(stamp))
    || changes.some((change) => !Object.hasOwn(seen, change.taskId))) {
    throw new TaskEditError("Supply each task's seen stamp from preview_task_changes. Preview again before saving.");
  }
  if (!Array.isArray(acknowledgedWarnings) || acknowledgedWarnings.some((id) => typeof id !== "string")) {
    throw new TaskEditError("acknowledgedWarnings must be a list of confirmed warning IDs.");
  }
  if (!calendarWritesEnabled() && changes.some((change) => change.set && Object.hasOwn(change.set, "calendar"))) {
    throw new TaskEditError("The team calendar isn't connected; calendar changes are unavailable.");
  }
  const stamps = seen as Record<string, string>;
  const written = await runTransaction(db, async (transaction) => {
    // Re-enumerate on each transaction retry, then guard every context record with transaction.get.
    // Include missing listed/destination IDs as reads too; a cache must never decide what can be saved.
    const data = await readTaskEditData();
    const ids = [...new Set([...data.tasks.map((task) => task.id), ...Object.keys(stamps),
      ...changes.flatMap((change) => change.move?.toParentId ? [change.move.toParentId] : [])])];
    const snapshots = await Promise.all(ids.map((id) => transaction.get(doc(db, "tasks", id))));
    const tasks = snapshots.filter((entry) => entry.exists()).map((entry) => ({ ...entry.data() as NewTask, id: entry.id }));
    const now = Date.now();
    const context = { ...data, tasks, now, today: wibToday(new Date(now)), calendarOn: calendarWritesEnabled() };
    const byId = new Map(tasks.map((task) => [task.id, task]));
    const alreadySaved = matchesSaved(changes, context, stamps);
    if (alreadySaved) {
      return { alreadySaved, rows: [] as TaskChangePreview[], ids: Object.keys(stamps), calendarIds: Object.keys(stamps).filter((id) => {
        const task = byId.get(id);
        return !task || task.calendar || task.calendarSync || changes.some((change) => change.taskId === id && change.set && Object.hasOwn(change.set, "calendar"));
      }), byId };
    }
    const changed = Object.keys(stamps).filter((id) => !byId.has(id) || taskSeen(byId.get(id)!) !== stamps[id]);
    if (changed.length) throw new TaskEditError(`Tasks changed since the preview: ${changed.join(", ")}. Preview again; nothing was saved.`);
    const preview = buildTaskChanges(changes, context);
    if (preview.errors.length) throw new TaskEditError(preview.errors.join(" "));
    const unstamped = preview.tasks.filter((row) => stamps[row.taskId] !== row.seen);
    if (unstamped.length || Object.keys(stamps).some((id) => !preview.tasks.some((row) => row.taskId === id))) {
      throw new TaskEditError("The affected tasks changed since the preview. Preview again; nothing was saved.");
    }
    const unacknowledged = preview.warnings.filter((warning) => !acknowledgedWarnings.includes(warning.id));
    if (unacknowledged.length) throw new TaskEditError(`Confirm these warnings before saving: ${unacknowledged.map((warning) => warning.id).join(", ")}. Nothing was saved.`);
    for (const row of preview.tasks) {
      const ref = doc(db, "tasks", row.taskId);
      if (row.after) transaction.update(ref, updateFields(row.patch));
      else transaction.delete(ref);
    }
    return { alreadySaved, rows: preview.tasks, ids: preview.tasks.map((row) => row.taskId),
      calendarIds: preview.tasks.filter((row) => row.before.calendar || row.after?.calendar || row.before.calendarSync).map((row) => row.taskId),
      byId: new Map(preview.tasks.filter((row) => row.after).map((row) => [row.taskId, row.after!])) };
  });
  if (!written.alreadySaved) {
    try { await followCompanies(written.rows); }
    catch {
      try { await restoreTaskChanges(written.rows); }
      catch (error) {
        if (error instanceof TaskEditError) throw error;
        throw new TaskEditError("The company update failed and the task changes could not be restored. Find the tasks and check them before retrying.");
      }
      throw new TaskEditError("The company update failed. All task changes were restored; nothing was saved. Preview again before retrying.");
    }
  }
  const calendars = new Map<string, CalendarSyncResult>();
  for (const id of written.calendarIds) {
    try { calendars.set(id, await syncTaskCalendar(id, origin)); }
    catch { calendars.set(id, { taskId: id, status: "failed", error: "The calendar couldn't be updated. Try again." }); }
  }
  return { alreadySaved: written.alreadySaved, tasks: written.ids.map((taskId) => ({
    taskId, saved: true, deleted: !written.byId.has(taskId), url: new URL(`/tasks?task=${encodeURIComponent(taskId)}`, origin).href,
    calendar: calendars.get(taskId) ?? null,
  })) };
}
