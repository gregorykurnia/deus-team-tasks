// Node entry points for the connector. Do not import browser hooks or write guards here.
import { createHash } from "node:crypto";
import { collection, doc, getDocsFromServer, writeBatch } from "firebase/firestore";
import type { PipelineEntry } from "./clientTypes";
import { db } from "./firebase";
import { clientsDb } from "./firebaseClients";
import { buildFollowupPlan, validateFollowupPlan, type FollowupPlanContext, type FollowupPlanPreview } from "./followupPlan";
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

// The team's days are WIB. Vercel runs in UTC, which would miss yesterday's dates until 07:00 WIB.
export function wibToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

// IDs derived from the plan, so two identical adds racing past the "already saved" check write the same documents
// instead of a second parent. Falls back to random IDs if any is taken, so nothing stored is ever overwritten.
function planIds(input: unknown, tasks: readonly Task[]) {
  const { plan } = validateFollowupPlan(input);
  const random = () => doc(collection(db, "tasks")).id;
  if (!plan) return { parentId: random(), subtaskIds: () => random() };
  const key = JSON.stringify([plan.companyId, plan.existingParentId ?? "", plan.steps.map((s) => [s.name.trim().toLowerCase(), s.startDate, s.endDate])]);
  const base = `followup-${createHash("sha256").update(key).digest("hex").slice(0, 20)}`;
  const taken = new Set(tasks.map((t) => t.id));
  const childIds = plan.steps.map((_, i) => `${base}-${i + 1}`);
  const childrenFree = childIds.every((id) => !taken.has(id));
  return {
    parentId: taken.has(base) ? random() : base,
    subtaskIds: (i: number) => (childrenFree ? childIds[i] : random()),
  };
}

async function preparePlan(input: unknown) {
  const data = await readFollowupData();
  const ids = planIds(input, data.tasks);
  const preview = buildFollowupPlan(input, { ...data, parentId: ids.parentId, today: wibToday() });
  // Reserve one operation for the parent even when its end date stays the same.
  // Never split a plan across batches: a rejected plan must leave nothing behind.
  if (preview.subtasks.length > 499) {
    preview.errors.push("A follow-up plan can contain at most 499 steps in one write.");
    preview.canWrite = false;
  }
  return { preview, tasks: data.tasks, subtaskIds: ids.subtaskIds };
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
  alreadySaved: boolean; // true when a retry found the same steps already saved and wrote nothing
}

// Re-read and validate at write time; never trust a preview or its allocated ID from a previous request.
export async function addFollowupPlan(input: unknown): Promise<FollowupWriteResult> {
  const { preview, tasks, subtaskIds: idFor } = await preparePlan(input);
  if (preview.alreadySaved) return { ...preview.alreadySaved, alreadySaved: true };
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
  const subtaskIds = preview.subtasks.map((subtask, i) => {
    const ref = doc(db, "tasks", idFor(i));
    batch.set(ref, taskDoc(subtask));
    return ref.id;
  });
  await batch.commit();
  return { parentId: preview.parentId, subtaskIds, alreadySaved: false };
}
