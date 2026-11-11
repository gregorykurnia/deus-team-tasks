import "server-only";
import {
  collection, doc, getDocsFromServer, runTransaction,
  type DocumentData, type Transaction,
} from "firebase/firestore";
import type { PipelineEntry } from "./clientTypes";
import { calendarWritesEnabled, readTaskCalendarState, syncTaskCalendar } from "./calendarSync";
import { db } from "./firebase";
import { clientsDb } from "./firebaseClients";
import { wibToday } from "./followupServer";
import {
  buildTaskPlan, findTaskDestinations, taskPlanCalendarPreview, TASK_PLAN_CALENDAR_OFF, validateTaskPlan,
  type TaskPlanDestinationState, type TaskPlanInput, type TaskPlanPreview,
} from "./taskPlan";
import {
  assertTaskPlanPreview, createTaskPlanToken, taskPlanFingerprint, verifyTaskPlanToken,
  type TaskPlanTokenOptions,
} from "./taskPlanToken";
import type { NewTask, Task } from "./types";

export class TaskPlanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TaskPlanError";
  }
}

export class TaskPlanConflictError extends TaskPlanError {
  constructor() {
    super("Saved task plan conflicts with missing, moved or unrelated records. Nothing was recreated or overwritten. Review the destination before starting a different plan.");
    this.name = "TaskPlanConflictError";
  }
}

export interface TaskPlanWriteResult {
  parentId: string;
  subtaskIds: string[];
  alreadySaved: boolean;
  destination: TaskPlanDestinationState;
  url: string; // The MCP layer resolves this same-origin path against its request origin.
  subtasks?: {
    taskId: string;
    calendar?: { status: "added"; link?: string } | { status: "failed"; error: string };
  }[]; // Input step order; omitted entirely for plans without calendar requests.
}

export interface TaskPlanServerPreview extends TaskPlanPreview {
  previewToken?: string;
  alreadySaved?: TaskPlanWriteResult;
}

function operationIds(plan: TaskPlanInput) {
  const operation = taskPlanFingerprint(plan);
  const base = `task-plan-${operation}`;
  return {
    operation, parentId: plan.existingParentId ?? base,
    subtaskIds: plan.steps.map((_, i) => `${base}-${i + 1}`),
  };
}
type OperationIds = ReturnType<typeof operationIds>;

function writeResult(ids: OperationIds, destination: TaskPlanDestinationState, alreadySaved: boolean): TaskPlanWriteResult {
  return {
    parentId: ids.parentId, subtaskIds: ids.subtaskIds, alreadySaved, destination,
    url: `/tasks?task=${encodeURIComponent(ids.parentId)}`,
  };
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

export async function findTaskPlanDestinations(input: unknown) {
  const internal = input !== null && typeof input === "object" && "kind" in input && input.kind === "internal";
  const tasks = await readTasks();
  return findTaskDestinations(input, { tasks, today: wibToday(), ...(!internal && { companies: await readCompanies() }) });
}

// Read every reserved ID before any create. These reads become transaction preconditions, including missing IDs.
// Provenance survives ordinary task edits; retry recognition must not compare mutable prose/dates/status.
async function readOperation(transaction: Transaction, plan: TaskPlanInput, ids: OperationIds) {
  const [receipt, ...snapshots] = await Promise.all([
    transaction.get(doc(db, "settings", `task-plan-${ids.operation}`)),
    ...[ids.parentId, ...ids.subtaskIds].map((id) => transaction.get(doc(db, "tasks", id))),
  ]);
  const [parent, ...children] = snapshots;
  const members = plan.newParent ? snapshots : children;
  const conflict = () => { throw new TaskPlanConflictError(); };
  if (!receipt.exists()) {
    if (members.some((entry) => entry.exists())) {
      // Parallel document reads can straddle another save's commit. A changed receipt makes the SDK
      // abort/retry this transaction; a still-absent receipt means a genuine occupied-ID conflict.
      await transaction.get(receipt.ref);
      conflict();
    }
    return { snapshots, saved: null };
  }
  if (receipt.data()!.version !== 1 || receipt.data()!.hash !== ids.operation) conflict();
  if (!parent.exists() || members.some((entry) => !entry.exists())) conflict();
  const companyId = plan.companyId ?? null;
  if (parent.data()!.parentId != null || (parent.data()!.linkedClientId ?? null) !== companyId) conflict();
  for (const [i, member] of members.entries()) {
    const data = member.data()!;
    const index = plan.newParent ? i - 1 : i;
    if (data.taskPlanOperation?.hash !== ids.operation || data.taskPlanOperation?.index !== index
      || (data.linkedClientId ?? null) !== companyId || (index >= 0 && data.parentId !== ids.parentId)) conflict();
  }
  // A receipt in the existing settings collection survives deletion of every created task. It is created
  // atomically with the tasks, and preserves the original summary when a task is renamed or finished.
  const destination = receipt.data()!.destination as TaskPlanDestinationState | undefined;
  if (!destination || destination.kind !== plan.kind || destination.parent?.id !== ids.parentId
    || destination.parent.mode !== (plan.newParent ? "new" : "existing")
    || (destination.company?.id ?? null) !== companyId) conflict();
  return { snapshots, saved: writeResult(ids, destination!, true) };
}

async function completedOperation(plan: TaskPlanInput, ids: OperationIds) {
  return runTransaction(db, async (transaction) => (await readOperation(transaction, plan, ids)).saved);
}

export async function previewTaskPlan(input: unknown, options: TaskPlanTokenOptions = {}): Promise<TaskPlanServerPreview> {
  const { plan } = validateTaskPlan(input);
  const calendarEnabled = calendarWritesEnabled();
  if (!plan || (!calendarEnabled && plan.steps.some((step) => step.calendar))) {
    return buildTaskPlan(input, { tasks: [], today: wibToday(), calendarEnabled });
  }
  const ids = operationIds(plan);
  const saved = await completedOperation(plan, ids);
  const calendarPreview = taskPlanCalendarPreview(plan);
  const preview: TaskPlanServerPreview = saved ? {
    plan, errors: [], warnings: [], canWrite: true, destination: saved.destination,
    parentId: saved.parentId, parent: null, subtasks: [], alreadySaved: saved,
    preservationNotes: [calendarPreview
      ? "This exact plan is already saved. Existing task details will be preserved; saving again retries calendar steps that aren't up to date."
      : "This exact plan is already saved. Return the original task link; no existing record will be changed."],
    ...(calendarPreview && { calendarPreview }),
  } : buildTaskPlan(plan, {
    tasks: await readTasks(), today: wibToday(), parentId: ids.parentId, calendarEnabled,
    ...(plan.kind !== "internal" && { companies: await readCompanies() }),
  });
  if (preview.canWrite) preview.previewToken = createTaskPlanToken(preview, options);
  return preview;
}

function taskDocument(task: NewTask, ids: OperationIds, index: number): DocumentData {
  return {
    ...Object.fromEntries(Object.entries(task).filter(([, value]) => value !== undefined)),
    taskPlanOperation: { hash: ids.operation, index },
  };
}

async function calendarStep(taskId: string, alreadySaved: boolean, origin: string): Promise<NonNullable<TaskPlanWriteResult["subtasks"]>[number]> {
  const failed = { taskId, calendar: { status: "failed" as const, error: "The calendar couldn't be updated. Try again." } };
  try {
    if (alreadySaved) {
      const { task, key } = await readTaskCalendarState(taskId);
      // An app edit owns the current mark and event content. Never replay the original plan over it.
      if (!task?.calendar) return { taskId };
      if (key === task.calendarSync?.synced && !task.calendarSync?.error) {
        return { taskId, calendar: { status: "added", ...(task.calendarSync?.link && { link: task.calendarSync.link }) } };
      }
    }
    const synced = await syncTaskCalendar(taskId, origin);
    if (synced.status === "synced") return { taskId, calendar: { status: "added", ...(synced.link && { link: synced.link }) } };
    if (synced.status === "removed") return { taskId };
    return synced.error ? { taskId, calendar: { status: "failed", error: synced.error } } : failed;
  } catch {
    // Calendar/read failures happen after commit and must never turn a saved task plan into a tool error.
    return failed;
  }
}

async function calendarResults(plan: TaskPlanInput, saved: TaskPlanWriteResult, origin: string): Promise<TaskPlanWriteResult> {
  if (!plan.steps.some((step) => step.calendar)) return saved;
  const subtasks: NonNullable<TaskPlanWriteResult["subtasks"]> = [];
  for (let offset = 0; offset < saved.subtaskIds.length; offset += 10) {
    subtasks.push(...await Promise.all(saved.subtaskIds.slice(offset, offset + 10).map((taskId, index) =>
      plan.steps[offset + index].calendar ? calendarStep(taskId, saved.alreadySaved, origin) : { taskId })));
  }
  return { ...saved, subtasks };
}

export async function addTaskPlan(
  input: unknown, previewToken: unknown, acknowledgedWarnings: unknown, options: TaskPlanTokenOptions & { origin?: string } = {},
): Promise<TaskPlanWriteResult> {
  // Authenticity, expiry and exact normalized input come before the already-saved fast path.
  const verified = verifyTaskPlanToken(input, previewToken, options);
  const plan = validateTaskPlan(input).plan!;
  if (!calendarWritesEnabled() && plan.steps.some((step) => step.calendar)) throw new TaskPlanError(TASK_PLAN_CALENDAR_OFF);
  const ids = operationIds(plan);
  const saved = await completedOperation(plan, ids);
  if (saved) return calendarResults(plan, saved, options.origin ?? "");

  const written = await runTransaction(db, async (transaction) => {
    const operation = await readOperation(transaction, plan, ids);
    if (operation.saved) return operation.saved; // A simultaneous request may have finished after the fast path.

    // A retry must discover new tasks and recheck company state, not reuse the first attempt's snapshots.
    // Company reads are still not atomic with writes in the separate tasks project. Internal never reads them.
    const tasks = await readTasks();
    const companies = plan.kind === "internal" ? undefined : await readCompanies();
    // The web SDK transacts document reads, not queries. Guard each enumerated record against edits/deletion,
    // and always include the selected parent (even if absent from the earlier collection read).
    const reserved = new Map(operation.snapshots.map((entry) => [entry.id, entry]));
    const snapshots = await Promise.all(tasks.map((task) => reserved.get(task.id) ?? transaction.get(doc(db, "tasks", task.id))));
    const current = new Map(snapshots.filter((entry) => entry.exists()).map((entry) => [entry.id, { ...entry.data() as NewTask, id: entry.id }]));
    const parent = operation.snapshots[0];
    if (parent.exists()) current.set(parent.id, { ...parent.data() as NewTask, id: parent.id });
    const preview = buildTaskPlan(plan, { tasks: [...current.values()], companies, today: wibToday(), parentId: ids.parentId,
      calendarEnabled: calendarWritesEnabled() });
    assertTaskPlanPreview(verified, preview, acknowledgedWarnings);

    // Keep the 499-step input cap. Firestore removed its old 500-write transaction cap on 2023-03-29;
    // the 499-step new-parent boundary is 501 writes including this receipt, all in one transaction.
    // https://cloud.google.com/firestore/docs/release-notes#March_29_2023
    transaction.set(doc(db, "settings", `task-plan-${ids.operation}`), { version: 1, hash: ids.operation, destination: preview.destination });
    if (preview.parent) transaction.set(doc(db, "tasks", ids.parentId), taskDocument(preview.parent, ids, -1));
    preview.subtasks.forEach((task, i) => transaction.set(doc(db, "tasks", ids.subtaskIds[i]),
      taskDocument(task, ids, i)));
    return writeResult(ids, preview.destination!, false);
  });
  return calendarResults(plan, written, options.origin ?? "");
}
