// Every company write goes through here. Updates merge only the fields that
// change (so a company's own fields are never lost), a field set to undefined
// is cleared, and new ids are never reused.
import { deleteDoc, deleteField, doc, runTransaction, updateDoc, type UpdateData } from "firebase/firestore";
import { commitInChunks, PartlyCommitted, type BatchOp } from "./batches";
import { assertOnline } from "./connection";
import { db } from "./firebase";
import { clientsDb } from "./firebaseClients";
import { companyGroup, DEAL_DONE_STATUS, groupFlags, taskDatesFromCompany, type CompanyGroup } from "./companies";
import { NOTES } from "./noteWrites";
import { addTask, PartlyChanged, TASKS, toTaskUpdate, withCompletedAt, type Undo } from "./taskWrites";
import type { CompaniesById } from "./kinds";
import type { PipelineEntry } from "./clientTypes";
import type { ProspectJournalEntry } from "./prospectJournalTypes";
import type { NewTask, Task } from "./types";

export const PIPELINE = "pipeline";

// The next company id lives in the tasks project (its rules are in this repo, Q6).
const ID_COUNTER = () => doc(db, "settings", "companyIds");

type CompanyPatch = Partial<Omit<PipelineEntry, "id">>;

function companyRef(id: number) {
  return doc(clientsDb, PIPELINE, String(id));
}

export function toCompanyUpdate(patch: CompanyPatch & { id?: unknown }): UpdateData<PipelineEntry> {
  const { id: _id, ...rest } = patch;
  void _id;
  return Object.fromEntries(Object.entries(rest).map(([k, v]) => [k, v === undefined ? deleteField() : v])) as UpdateData<PipelineEntry>;
}

// What the fields in `patch` were before, so Undo can put them back.
function previousValues(current: PipelineEntry, patch: CompanyPatch): CompanyPatch {
  return Object.fromEntries(Object.keys(patch).map((k) => [k, current[k]])) as CompanyPatch;
}

/* ---------- New companies ---------- */

// Hands out the next id from a counter, never below `knownMaxId + 1`. The
// counter only goes up, so a deleted company's id never comes back.
export async function allocateCompanyId(knownMaxId: number): Promise<number> {
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ID_COUNTER());
    const next = Math.max(Number(snap.data()?.next ?? 1), knownMaxId + 1);
    tx.set(ID_COUNTER(), { next: next + 1 }, { merge: true });
    return next;
  });
}

// Raises the counter above a company's id, so the id can't be handed out again
// once the company is deleted, even if the counter never gave it out.
async function retireCompanyId(id: number): Promise<void> {
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ID_COUNTER());
    const next = Number(snap.data()?.next ?? 1);
    if (next <= id) tx.set(ID_COUNTER(), { next: id + 1 }, { merge: true });
  });
}

// Adds a company with a fresh id. If that id is somehow taken (the old app on
// main still counts from the highest id), it takes the next one.
export async function addCompany(fields: CompanyPatch, knownMaxId: number): Promise<number> {
  assertOnline("No connection. The company wasn't added.");
  let floor = knownMaxId;
  for (let attempt = 0; attempt < 5; attempt++) {
    const id = await allocateCompanyId(floor);
    const created = await runTransaction(clientsDb, async (tx) => {
      const ref = companyRef(id);
      if ((await tx.get(ref)).exists()) return false;
      const data = Object.fromEntries(Object.entries({ ...fields, id }).filter(([, v]) => v !== undefined));
      tx.set(ref, data);
      return true;
    });
    if (created) return id;
    floor = id;
  }
  throw new Error("Couldn't find a free id for the new company.");
}

/* ---------- Changing a company ---------- */

export async function updateCompany(current: PipelineEntry, patch: CompanyPatch): Promise<Undo> {
  assertOnline("No connection. The change wasn't saved.");
  const before = previousValues(current, patch);
  await updateDoc(companyRef(current.id), toCompanyUpdate(patch));
  return async () => {
    assertOnline("No connection. The change wasn't undone.");
    await updateDoc(companyRef(current.id), toCompanyUpdate(before));
  };
}

function openTasksOf(companyId: number, tasks: Task[]) {
  return tasks.filter((t) => t.linkedClientId === companyId && !t.completed);
}

// Puts back the fields each task had before `patch` was written to it.
function restoreTasks(changes: { t: Task; p: Partial<NewTask> }[]): Promise<void> {
  return commitInChunks(
    db,
    changes.map(({ t, p }) => (b) =>
      b.update(
        doc(db, TASKS, t.id),
        toTaskUpdate(Object.fromEntries(Object.keys(p).map((k) => [k, t[k as keyof Task]])) as Partial<NewTask>)
      )
    )
  );
}

// The second of two writes (one per Firebase project) failed: undo the first
// as far as possible, so a failure leaves nothing half saved, then report it.
async function rollBack(err: unknown, undoFirst: () => Promise<void>): Promise<never> {
  try {
    await undoFirst();
  } catch (undoErr) {
    console.error("Couldn't undo the first half of a failed change", undoErr);
  }
  throw err;
}

// Changes a company and keeps its open tasks in step with its last action and
// target dates (B12). The company and its tasks live in two Firebase projects,
// so this is one write for the company and one batch for the tasks.
export async function updateCompanyKeptInStep(
  current: PipelineEntry,
  patch: CompanyPatch,
  tasks: Task[]
): Promise<{ undo: Undo; tasksChanged: number }> {
  const next = { ...current, ...patch };
  const undoCompany = await updateCompany(current, patch);
  const datesChanged = (current.date || "") !== (next.date || "") || (current.target || "") !== (next.target || "");
  const changes = datesChanged
    ? openTasksOf(current.id, tasks).flatMap((t) => {
        const p = taskDatesFromCompany(next, t);
        return p ? [{ t, p }] : [];
      })
    : [];
  try {
    await commitInChunks(
      db,
      changes.map(({ t, p }) => (b) => b.update(doc(db, TASKS, t.id), toTaskUpdate(p)))
    );
  } catch (err) {
    return rollBack(err, undoCompany);
  }
  return {
    tasksChanged: changes.length,
    undo: async () => {
      await undoCompany();
      await restoreTasks(changes);
    },
  };
}

// What a company takes from one of its open tasks whose dates changed (B12): the
// task's last action, and its deadline as the target. Null when nothing moves.
function companyPatchFrom(company: PipelineEntry, task: Pick<Task, "lastActionDate" | "endDate">): CompanyPatch | null {
  const date = task.lastActionDate ?? company.date;
  const target = task.endDate || company.target;
  return date !== company.date || target !== company.target ? { date, target } : null;
}

// The company's other open tasks, brought in step with the company's new dates.
function otherTasksInStep(company: PipelineEntry, companyPatch: CompanyPatch, exceptId: string, tasks: Task[]) {
  const companyNext = { ...company, ...companyPatch };
  return openTasksOf(company.id, tasks).flatMap((other) => {
    if (other.id === exceptId) return [];
    const p = taskDatesFromCompany(companyNext, other);
    return p ? [{ t: other, p: p as Partial<NewTask> }] : [];
  });
}

// Saves a company task. When its last action or deadline changes, the company
// follows, and through it the company's other open tasks (B12). Pass only the
// fields that change: a save that leaves the dates alone never moves the company.
export async function saveTaskKeptInStep(
  task: Task,
  patch: Partial<NewTask>,
  companies: CompaniesById,
  tasks: Task[]
): Promise<{ companyChanged: boolean; tasksChanged: number }> {
  assertOnline("No connection. The task wasn't saved.");
  const next = { ...task, ...patch };
  const company = next.linkedClientId != null ? companies.get(next.linkedClientId) : undefined;
  const ownPatch = withCompletedAt(patch, task);
  const changes: { t: Task; p: Partial<NewTask> }[] = [{ t: task, p: ownPatch }];
  const datesChanged = "lastActionDate" in patch || "endDate" in patch;
  const companyPatch = company && !next.completed && datesChanged ? companyPatchFrom(company, next) : null;
  if (company && companyPatch) changes.push(...otherTasksInStep(company, companyPatch, task.id, tasks));
  await commitInChunks(
    db,
    changes.map(({ t, p }) => (b) => b.update(doc(db, TASKS, t.id), toTaskUpdate(p)))
  );
  if (company && companyPatch) {
    try {
      await updateDoc(companyRef(company.id), toCompanyUpdate(companyPatch));
    } catch (err) {
      return rollBack(err, () => restoreTasks(changes));
    }
  }
  return { companyChanged: !!companyPatch, tasksChanged: changes.length - 1 };
}

// Adds a task. A new company task with a last action or deadline brings its
// company, and the company's other open tasks, in step (B12). If that fails,
// the new task goes again, so trying once more can't make two.
export async function addTaskKeptInStep(
  task: NewTask,
  companies: CompaniesById,
  tasks: Task[]
): Promise<{ id: string; companyChanged: boolean; tasksChanged: number }> {
  const id = await addTask(task);
  const company = task.linkedClientId != null ? companies.get(task.linkedClientId) : undefined;
  const dated = !!task.lastActionDate || !!task.endDate;
  const companyPatch = company && !task.completed && dated ? companyPatchFrom(company, task) : null;
  if (!company || !companyPatch) return { id, companyChanged: false, tasksChanged: 0 };
  const changes = otherTasksInStep(company, companyPatch, id, tasks);
  try {
    await commitInChunks(
      db,
      changes.map(({ t, p }) => (b) => b.update(doc(db, TASKS, t.id), toTaskUpdate(p)))
    );
    await updateDoc(companyRef(company.id), toCompanyUpdate(companyPatch));
  } catch (err) {
    return rollBack(err, async () => {
      await restoreTasks(changes);
      await deleteDoc(doc(db, TASKS, id));
    });
  }
  return { id, companyChanged: true, tasksChanged: changes.length };
}

/* ---------- Moving between groups (B5) ---------- */

// Moves a company to another group, carrying over everything already known
// and adding what the new group asks for. Returns how many open tasks switch
// between prospect and client work.
export async function moveCompany(
  current: PipelineEntry,
  to: CompanyGroup,
  fields: CompanyPatch,
  tasks: Task[]
): Promise<{ undo: Undo; tasksSwitchKind: number; tasksChanged: number }> {
  const patch: CompanyPatch = { ...fields, ...groupFlags(to) };
  if (to === "dealDone") patch.status = DEAL_DONE_STATUS;
  // Leaving Deal done lets go of its status, so the company never reads as a client again by mistake.
  if (to !== "dealDone" && ("status" in patch ? patch.status : current.status) === DEAL_DONE_STATUS) patch.status = undefined;
  const from = companyGroup(current);
  const crossesDealDone = (from === "dealDone") !== (to === "dealDone");
  const tasksSwitchKind = crossesDealDone ? openTasksOf(current.id, tasks).length : 0;
  const { undo, tasksChanged } = await updateCompanyKeptInStep(current, patch, tasks);
  return { undo, tasksSwitchKind, tasksChanged };
}

/* ---------- Choice options (C3) ---------- */

// Replaces one value of a field on every company that has it (a renamed
// option), or clears it when `to` is undefined (a removed option). Returns how
// many companies changed.
export async function replaceFieldValue(companies: PipelineEntry[], field: string, from: string, to: string | undefined): Promise<number> {
  assertOnline("No connection. The companies weren't changed.");
  const using = companies.filter((c) => c[field] === from);
  await commitInChunks(
    clientsDb,
    using.map((c) => (b) => b.update(companyRef(c.id), toCompanyUpdate({ [field]: to })))
  );
  return using.length;
}

/* ---------- Deleting (B14, D-012) ---------- */

// Deletes a company. Its tasks stay, as internal work, and its qualification
// notes stay, as notes for someone not tracked yet under the company's name.
export async function deleteCompany(
  c: PipelineEntry,
  tasks: Task[],
  notes: ProspectJournalEntry[]
): Promise<{ tasks: number; notes: number }> {
  assertOnline("No connection. The company wasn't deleted.");
  const ownNotes = notes.filter((n) => n.pipelineEntryId === c.id);
  const ownTasks = tasks.filter((t) => t.linkedClientId === c.id);
  await retireCompanyId(c.id);
  // Tasks first and the company last, so a failure part way leaves the company
  // in place to try again, never tasks pointing at a company that's gone.
  const unlink = ownTasks.map((t) => ({ t, p: { linkedClientId: undefined } as Partial<NewTask> }));
  try {
    await commitInChunks(
      db,
      unlink.map(({ t, p }) => (b) => b.update(doc(db, TASKS, t.id), toTaskUpdate(p)))
    );
  } catch (err) {
    // Stopped part way: some tasks are internal work already, and the company is still there. Deleting again finishes it.
    if (err instanceof PartlyCommitted) throw new PartlyChanged(err.done.length, err.left.length, null, err.cause);
    throw err;
  }
  try {
    await commitInChunks(clientsDb, [
      ...ownNotes.map((n): BatchOp => (b) =>
        b.update(doc(clientsDb, NOTES, n.id), { pipelineEntryId: deleteField(), prospectName: c.company })
      ),
      (b) => b.delete(companyRef(c.id)),
    ]);
  } catch (err) {
    return rollBack(err, () => restoreTasks(unlink));
  }
  return { tasks: ownTasks.length, notes: ownNotes.length };
}
