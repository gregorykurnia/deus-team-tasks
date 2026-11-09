// Node entry points for the connector. Do not import browser hooks or write guards here.
import { collection, doc, getDocsFromServer, writeBatch } from "firebase/firestore";
import type { PipelineEntry } from "./clientTypes";
import { db } from "./firebase";
import { clientsDb } from "./firebaseClients";
import { buildFollowupPlan, type FollowupPlanContext, type FollowupPlanPreview } from "./followupPlan";
import type { NewTask, Task } from "./types";

type FollowupData = Pick<FollowupPlanContext, "companies" | "tasks">;

// Server reads must fail when unreachable, rather than plan a write from cached data.
export async function readFollowupData(): Promise<FollowupData> {
  const [companies, tasks] = await Promise.all([
    getDocsFromServer(collection(clientsDb, "pipeline")),
    getDocsFromServer(collection(db, "tasks")),
  ]);
  return {
    companies: companies.docs.map((snapshot) => {
      const data = snapshot.data() as PipelineEntry;
      return typeof data.id === "number" ? data : { ...data, id: Number(snapshot.id) };
    }),
    tasks: tasks.docs.map((snapshot) => ({ ...(snapshot.data() as NewTask), id: snapshot.id })),
  };
}

async function preparePlan(input: unknown) {
  const data = await readFollowupData();
  const parentId = doc(collection(db, "tasks")).id;
  const preview = buildFollowupPlan(input, { ...data, parentId });
  // Reserve one operation for the parent even when its end date stays the same.
  // Never split a plan across batches: a rejected plan must leave nothing behind.
  if (preview.subtasks.length > 499) {
    preview.errors.push("A follow-up plan can contain at most 499 steps in one write.");
    preview.canWrite = false;
  }
  return { preview, tasks: data.tasks };
}

export async function previewFollowupPlan(input: unknown): Promise<FollowupPlanPreview> {
  return (await preparePlan(input)).preview;
}

export class FollowupPlanError extends Error {
  constructor(readonly preview: FollowupPlanPreview) {
    super([...preview.errors, ...preview.warnings.map((warning) => warning.message)].join("\n"));
    this.name = "FollowupPlanError";
  }
}

// Match taskWrites.toNewTaskDoc without importing its browser-only assertOnline path.
function taskDoc(task: NewTask): Record<string, unknown> {
  return Object.fromEntries(Object.entries(task).filter(([, value]) => value !== undefined));
}

export interface FollowupWriteResult {
  parentId: string;
  subtaskIds: string[];
}

// Re-read and validate at write time; never trust a preview or its allocated ID from a previous request.
export async function addFollowupPlan(input: unknown): Promise<FollowupWriteResult> {
  const { preview, tasks } = await preparePlan(input);
  if (!preview.canWrite) throw new FollowupPlanError(preview);

  const batch = writeBatch(db);
  const parentRef = doc(db, "tasks", preview.parentId);
  if (preview.parent) {
    batch.set(parentRef, taskDoc(preview.parent));
  } else {
    const existing = tasks.find((task) => task.id === preview.parentId)!;
    // update (also for an unchanged deadline) requires the parent to still exist.
    // No other parent fields or old subtasks are written.
    batch.update(parentRef, preview.parentUpdate ?? { endDate: existing.endDate });
  }
  const subtaskIds = preview.subtasks.map((subtask) => {
    const ref = doc(collection(db, "tasks"));
    batch.set(ref, taskDoc(subtask));
    return ref.id;
  });
  await batch.commit();
  return { parentId: preview.parentId, subtaskIds };
}
