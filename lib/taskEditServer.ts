import "server-only";
import { notifyAssignments } from "./assignNotifyDispatch.server";
import { collection, deleteField, doc, getDocsFromServer, runTransaction, updateDoc, type DocumentData, type DocumentReference, type Transaction } from "firebase/firestore";
import { createHash, randomBytes } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type { PipelineEntry } from "./clientTypes";
import { calendarWritesEnabled, syncTaskCalendar, type CalendarSyncResult } from "./calendarSync";
import { companyPatchFrom } from "./companyDates";
import { db } from "./firebase";
import { refuseOnQuota } from "./firestoreQuota";
import { clientsDb } from "./firebaseClients";
import { rolesIn } from "./flows";
import { wibToday } from "./followupServer";
import { isParked } from "./parking";
import { namesInUse } from "./people";
import { buildTaskChanges, editsResponsibleMembership, editsTaskGroup, TASK_EDIT_SEEN, taskEditGuardIds, taskSeen, validateTaskChanges,
  type TaskChange, type TaskChangePreview, type TaskEditContext } from "./taskEdit";
import { groupNamesInUse, isTaskGroupName, requireTaskGroupName, TASK_GROUPS } from "./taskGroupModel";
import { taskStatus } from "./taskStatus";
import { toTaskUpdate } from "./taskWriteFields";
import type { Flow, NewTask, Task } from "./types";

export interface FindTasksInput {
  query?: string;
  companyId?: number;
  parentId?: string;
  group?: string | null;
  includeDone?: boolean;
  offset?: number;
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

async function readTaskGroupRecords(transaction?: Transaction) {
  const { docs } = await getDocsFromServer(collection(db, TASK_GROUPS));
  // Guard existing group names and deletions with the same transaction that writes the task.
  const snapshots = transaction ? await Promise.all(docs.map((record) => transaction.get(record.ref))) : docs;
  return snapshots.flatMap((record) => {
    const name: unknown = record.data()?.name;
    return isTaskGroupName(name) ? [{ id: record.id, name }] : [];
  });
}

type TaskGroupRecord = Awaited<ReturnType<typeof readTaskGroupRecords>>[number];
const taskGroupNames = (groups: TaskGroupRecord[], tasks: Task[]) =>
  [...new Set(groupNamesInUse(groups, tasks.filter((task) => isTaskGroupName(task.taskGroup))))];

function groupTargetsStamp(changes: TaskChange[], groups: TaskGroupRecord[], names: readonly string[]) {
  const targets = changes.flatMap(({ taskId, set }) => {
    if (set?.taskGroup === undefined) return [];
    const name = set.taskGroup === null ? null : requireTaskGroupName(set.taskGroup, names);
    return [{ taskId, name, records: groups.filter((group) => group.name === name).map((group) => group.id).sort() }];
  });
  // A case-only rename still matches the input. Bind the preview to the spelling and records it showed.
  return createHash("sha256").update(JSON.stringify(targets)).digest("hex");
}

export async function findTasks(input: FindTasksInput) {
  const [tasks, companies, groups] = await Promise.all([readTasks(), readCompanies(),
    typeof input.group === "string" ? readTaskGroupRecords() : []]);
  const group = typeof input.group === "string" ? requireTaskGroupName(input.group, taskGroupNames(groups, tasks)) : input.group;
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const byCompany = new Map(companies.map((company) => [company.id, company]));
  const today = wibToday();
  const query = input.query?.trim().toLowerCase();
  const visible = tasks.filter((task) => input.includeDone || !task.completed);
  const matches = visible.filter((task) =>
    (!query || `${task.task}\n${task.keyPoints}`.toLowerCase().includes(query))
    && (input.companyId === undefined || task.linkedClientId === input.companyId)
    && (input.parentId === undefined || task.parentId === input.parentId)
    && (group === undefined || (group === null ? !isTaskGroupName(task.taskGroup) : task.taskGroup === group)))
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
  const offset = input.offset ?? 0;
  const page = matches.slice(offset, offset + 10);
  return {
    tasks: page.map((task) => ({
      ...summary(task), subtasks: visible.filter((child) => child.parentId === task.id)
        .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)).map(summary),
    })),
    hasMore: offset + page.length < matches.length,
    total: matches.length,
  };
}

export async function readFlowRoles(transaction?: Transaction) {
  const { docs } = await getDocsFromServer(collection(db, "flows"));
  const snapshots = transaction ? await Promise.all(docs.map(({ ref }) => transaction.get(ref))) : docs;
  const flows = snapshots.filter((entry) => entry.exists()).map((entry) => ({ ...entry.data(), id: entry.id } as Flow));
  return rolesIn(flows);
}

// Shared read context for previews; no browser listeners, cached reads or write helpers.
export async function readTaskEditData() {
  const [tasks, companies, roles] = await Promise.all([readTasks(), readCompanies(), readFlowRoles()]);
  return { tasks, companies, names: namesInUse(tasks, [], roles) };
}

export async function previewTaskChanges(changes: unknown) {
  const groupEdit = validateTaskChanges(changes).changes?.some(editsTaskGroup);
  const [data, groups] = await Promise.all([readTaskEditData(), groupEdit ? readTaskGroupRecords() : []]);
  const groupNames = groupEdit ? taskGroupNames(groups, data.tasks) : [];
  const now = Date.now();
  const preview = buildTaskChanges(changes, {
    ...data, groupNames, now, today: wibToday(new Date(now)), calendarOn: calendarWritesEnabled(),
  });
  if (preview.seen) {
    // A fresh preview can repeat an earlier intent after it was undone, even with identical task data.
    const nonce = randomBytes(16).toString("hex");
    const groupStamp = groupEdit && preview.canWrite ? `.${groupTargetsStamp(preview.changes!, groups, groupNames)}` : "";
    for (const [id, stamp] of Object.entries(preview.seen)) preview.seen[id] = `${stamp}.${nonce}${groupStamp}`;
    for (const row of preview.tasks) row.seen = preview.seen[row.taskId];
  }
  return preview;
}

export class TaskEditError extends Error {}

export interface TaskChangesSaved {
  alreadySaved: boolean;
  tasks: { taskId: string; saved: true; deleted: boolean; url: string; calendar: CalendarSyncResult | null }[];
}

interface TaskEditReceipt {
  ids: string[];
  deletedIds: string[];
  calendarIds: string[];
  assignmentIds: string[];
  companyPending: boolean;
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

async function followCompanies(dated: Task[]) {
  if (!dated.length) return;
  // The company project is separate. Commit its updates together, so one failure cannot leave half the companies moved.
  await runTransaction(clientsDb, async (transaction) => {
    const ids = [...new Set(dated.map((task) => task.linkedClientId!))];
    const snapshots = await Promise.all(ids.map((id) => transaction.get(doc(clientsDb, "pipeline", String(id)))));
    const companies = new Map(snapshots.filter((entry) => entry.exists()).map((entry) => [Number(entry.id), entry.data() as PipelineEntry]));
    const patches = new Map<number, DocumentData>();
    for (const task of dated) {
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

interface TaskGroupSource {
  name: string;
  recordIds: string[];
  memberIds: string[];
}

function groupSourcesForRestore(rows: TaskChangePreview[], groups: TaskGroupRecord[], tasks: Task[]): TaskGroupSource[] {
  const written = new Set(rows.map((row) => row.taskId));
  const names = new Set(rows.flatMap(({ before, after }) =>
    isTaskGroupName(before.taskGroup) && before.taskGroup !== after?.taskGroup ? [before.taskGroup] : []));
  // If all the old members moved in this save, its rollback can restore their legacy group.
  return [...names].map((name) => ({ name,
    recordIds: groups.filter((group) => group.name === name).map((group) => group.id),
    memberIds: tasks.filter((task) => task.taskGroup === name && !written.has(task.id)).map((task) => task.id),
  })).filter(({ recordIds, memberIds }) => recordIds.length || memberIds.length);
}

async function restoreTaskChanges(rows: TaskChangePreview[], receipt: DocumentReference | null, sourceGroups: TaskGroupSource[] = []) {
  await runTransaction(db, async (transaction) => {
    const snapshots = await Promise.all(rows.map((row) => transaction.get(doc(db, "tasks", row.taskId))));
    for (const [index, snapshot] of snapshots.entries()) {
      const expected = rows[index].after;
      const current = snapshot.exists() ? { ...snapshot.data(), id: snapshot.id } as Task : null;
      if (expected ? !current || taskSeen(current) !== taskSeen(expected) : current !== null) {
        throw new TaskEditError(`The company update failed, and task ${snapshot.id} changed again before it could be restored. Find the tasks and check them before retrying.`);
      }
    }
    for (const { name, recordIds, memberIds } of sourceGroups) {
      const savedNames = await Promise.all([
        ...recordIds.map(async (id) => (await transaction.get(doc(db, TASK_GROUPS, id))).data()?.name),
        ...memberIds.map(async (id) => (await transaction.get(doc(db, "tasks", id))).data()?.taskGroup),
      ]);
      if (!savedNames.includes(name)) {
        throw new TaskEditError(`The company update failed, and source group “${name}” changed before the tasks could be restored. Find the tasks and check them before retrying.`);
      }
    }
    for (const row of rows) transaction.set(doc(db, "tasks", row.taskId), fields(row.before));
    if (receipt) transaction.delete(receipt);
  });
}

export async function applyTaskChanges(
  input: unknown, seen: unknown, acknowledgedWarnings: unknown, origin: string,
): Promise<TaskChangesSaved> {
  const validated = validateTaskChanges(input);
  if (!validated.changes) throw new TaskEditError(validated.errors.join(" "));
  const changes = validated.changes;
  const groupEdit = changes.some(editsTaskGroup);
  if (!seen || typeof seen !== "object" || Array.isArray(seen)
    || Object.entries(seen).some(([id, stamp]) => !validateTaskChanges([{ taskId: id, delete: true }]).changes
      || typeof stamp !== "string" || !TASK_EDIT_SEEN.test(stamp) || (!groupEdit && stamp.split(".").length > 2))
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
  const membershipEdit = changes.some(editsResponsibleMembership);
  const recordedEdit = membershipEdit || groupEdit;
  const stampEntries = Object.entries(stamps);
  const suffix = recordedEdit ? stampEntries[0][1].slice(64) : "";
  const [, nonce, groupStamp] = suffix.split(".");
  if (recordedEdit && (!nonce || (groupEdit && !groupStamp) || stampEntries.some(([, stamp]) => stamp.slice(64) !== suffix))) {
    throw new TaskEditError(`Use the complete seen map from one preview before saving ${groupEdit ? "task group" : "Responsible"} changes.`);
  }
  const operation = recordedEdit ? createHash("sha256").update(JSON.stringify([changes,
    [...stampEntries].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0),
  ])).digest("hex") : null;
  const receiptRef = operation ? doc(db, "settings", `task-edit-${operation}`) : null;
  const replacementIds = changes.filter((change) => change.set?.responsible !== undefined).map((change) => change.taskId);
  const notSaved = (message: string) => new TaskEditError(message);
  // Quota refusals stop at once: the SDK would otherwise retry them, re-reading the collection each time.
  const written = await refuseOnQuota(() => runTransaction(db, (transaction) => refuseOnQuota(async () => {
    // Re-enumerate from the server on each transaction retry, then guard with transaction.get the records the checks
    // depend on. Group and Responsible edits compare across all tasks, and deletes and moves change the task tree, so a
    // task moved under one of them meanwhile must abort the commit: those guard every task. Plain field edits guard the
    // listed tasks, their main tasks and their subtasks (taskEditGuardIds).
    // Include missing listed/destination IDs as reads too; a cache must never decide what can be saved.
    const data = await readTaskEditData();
    const ids = recordedEdit || changes.some((change) => change.delete || change.move)
      ? [...new Set([...data.tasks.map((task) => task.id), ...Object.keys(stamps),
        ...changes.flatMap((change) => change.move?.toParentId ? [change.move.toParentId] : [])])]
      : taskEditGuardIds(changes, Object.keys(stamps), data.tasks);
    const [snapshots, groups] = await Promise.all([Promise.all(ids.map((id) => transaction.get(doc(db, "tasks", id)))),
      groupEdit ? readTaskGroupRecords(transaction) : []]);
    // An identical save can commit while these optimistic reads are in flight.
    // Check its receipt after reading the tasks so it takes precedence over a stale preview.
    if (receiptRef) {
      const saved = (await transaction.get(receiptRef)).data() as TaskEditReceipt | undefined;
      if (saved?.companyPending) {
        throw new TaskEditError("The company update for this save is still unconfirmed. Retry shortly, then check the tasks and company if this persists.");
      }
      if (saved) return { alreadySaved: true, rows: [], companyTasks: [], saved };
    }
    // Guarded records replace their server copies (or drop out if deleted); unguarded tasks keep the fresh server copy.
    const guarded = new Map(snapshots.map((entry) => [entry.id, entry.exists() ? { ...entry.data() as NewTask, id: entry.id } : null]));
    const tasks = [
      ...data.tasks.flatMap((task) => guarded.has(task.id) ? guarded.get(task.id) ?? [] : [task]),
      ...[...guarded.values()].filter((task): task is Task => task !== null && !data.tasks.some((entry) => entry.id === task.id)),
    ];
    const groupNames = groupEdit ? taskGroupNames(groups, tasks) : [];
    const now = Date.now();
    const context = { ...data, tasks, groupNames, now, today: wibToday(new Date(now)), calendarOn: calendarWritesEnabled() };
    const byId = new Map(tasks.map((task) => [task.id, task]));
    if (!recordedEdit && matchesSaved(changes, context, stamps)) {
      const ids = Object.keys(stamps);
      const calendarIds = ids.filter((id) => {
        const task = byId.get(id);
        return !task || task.calendar || task.calendarSync || changes.some((change) => change.taskId === id && change.set && Object.hasOwn(change.set, "calendar"));
      });
      return { alreadySaved: true, rows: [], companyTasks: [], saved: { ids, calendarIds,
        deletedIds: ids.filter((id) => !byId.has(id)), assignmentIds: replacementIds, companyPending: false } };
    }
    const changed = stampEntries.filter(([id, stamp]) => !byId.has(id) || taskSeen(byId.get(id)!) !== stamp.slice(0, 64)).map(([id]) => id);
    if (changed.length) throw new TaskEditError(`Tasks changed since the preview: ${changed.join(", ")}. Preview again; nothing was saved.`);
    const preview = buildTaskChanges(changes, context);
    if (preview.errors.length) throw new TaskEditError(preview.errors.join(" ") + (groupEdit ? " Preview again; nothing was saved." : ""));
    if (groupEdit && groupStamp !== groupTargetsStamp(changes, groups, groupNames)) {
      throw new TaskEditError("A destination group changed since the preview. Preview again; nothing was saved.");
    }
    const previewSeen = preview.seen ?? Object.fromEntries(preview.tasks.map((row) => [row.taskId, row.seen]));
    if (Object.keys(previewSeen).length !== stampEntries.length
      || Object.entries(previewSeen).some(([id, stamp]) => stamps[id] !== `${stamp}${suffix}`)) {
      throw new TaskEditError("The affected tasks changed since the preview. Preview again; nothing was saved.");
    }
    const unacknowledged = preview.warnings.filter((warning) => !acknowledgedWarnings.includes(warning.id));
    if (unacknowledged.length) throw new TaskEditError(`Confirm these warnings before saving: ${unacknowledged.map((warning) => warning.id).join(", ")}. Nothing was saved.`);
    for (const row of preview.tasks) {
      const ref = doc(db, "tasks", row.taskId);
      if (row.after) transaction.update(ref, toTaskUpdate(row.patch));
      else transaction.delete(ref);
    }
    // A renamed main task changes its marked subtasks' event descriptions, as requestCalendarContextSync does in the app.
    const renamed = new Set(preview.tasks.filter((row) => row.after && row.after.task !== row.before.task).map((row) => row.taskId));
    const listed = new Set(preview.tasks.map((row) => row.taskId));
    const dependents = tasks.filter((task) => task.calendar && task.parentId && renamed.has(task.parentId) && !listed.has(task.id)).map((task) => task.id);
    const companyTasks = preview.tasks.flatMap(({ before, after }) =>
      after && !after.completed && after.linkedClientId != null && after.endDate !== before.endDate ? [after] : []);
    const calendarRows = preview.tasks.filter((row) => (row.before.calendar || row.after?.calendar || row.before.calendarSync)
      && (!recordedEdit || !row.after || Object.keys(row.patch).some((field) => field !== "taskGroup" && (!membershipEdit || field !== "responsible"))));
    const saved: TaskEditReceipt = {
      ids: preview.tasks.map((row) => row.taskId),
      deletedIds: preview.tasks.filter((row) => !row.after).map((row) => row.taskId),
      assignmentIds: membershipEdit ? preview.tasks.filter(({ before, after }) =>
        after && !isDeepStrictEqual(before.responsible, after.responsible)).map((row) => row.taskId) : replacementIds,
      calendarIds: [...calendarRows.map((row) => row.taskId), ...dependents],
      companyPending: companyTasks.length > 0,
    };
    // An exact retry must return the original changed IDs, even if someone subsequently edits the tasks.
    if (receiptRef && saved.ids.length) transaction.set(receiptRef, saved);
    const sourceGroups = groupEdit && companyTasks.length ? groupSourcesForRestore(preview.tasks, groups, tasks) : [];
    return { alreadySaved: false, rows: preview.tasks, companyTasks, saved, sourceGroups };
  }, notSaved)), notSaved);
  if (!written.alreadySaved) {
    try { await followCompanies(written.companyTasks); }
    catch {
      try { await restoreTaskChanges(written.rows, receiptRef, written.sourceGroups); }
      catch (error) {
        if (error instanceof TaskEditError) throw error;
        throw new TaskEditError("The company update failed and the task changes could not be restored. Find the tasks and check them before retrying.");
      }
      throw new TaskEditError("The company update failed. All task changes were restored; nothing was saved. Preview again before retrying.");
    }
    if (receiptRef && written.saved.companyPending) await updateDoc(receiptRef, { companyPending: false });
  }
  await notifyAssignments(written.saved.assignmentIds);
  const calendars = new Map<string, CalendarSyncResult>();
  for (const id of written.saved.calendarIds) {
    try { calendars.set(id, await syncTaskCalendar(id, origin)); }
    catch { calendars.set(id, { taskId: id, status: "failed", error: "The calendar couldn't be updated. Try again." }); }
  }
  const deleted = new Set(written.saved.deletedIds);
  return { alreadySaved: written.alreadySaved, tasks: written.saved.ids.map((taskId) => ({
    taskId, saved: true, deleted: deleted.has(taskId), url: new URL(`/tasks?task=${encodeURIComponent(taskId)}`, origin).href,
    calendar: calendars.get(taskId) ?? null,
  })) };
}
