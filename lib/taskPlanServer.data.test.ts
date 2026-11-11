// Actual Node/Firestore transactions against invented emulator data only.
import { readFileSync } from "node:fs";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as firestore from "firebase/firestore";
import * as calendarSync from "./calendarSync";
import {
  TASK_PLAN_CLIENT, TASK_PLAN_CLIENT_NEW, TASK_PLAN_CLIENT_PARENT, TASK_PLAN_DEAL_SKILL,
  TASK_PLAN_INTERNAL_NEW, TASK_PLAN_INTERNAL_PARENT, TASK_PLAN_PROSPECT,
  TASK_PLAN_PROSPECT_NEW, TASK_PLAN_PROSPECT_PARENT,
} from "../tests/fixtures/taskPlan";
import { clearAll, EMULATOR_HOST, PROJECTS, readAll, readFields, seed } from "../tests/support/emulator";
import { USE_EMULATOR } from "./emulator";
import { db } from "./firebase";
import { clientsDb } from "./firebaseClients";
import { TASK_PLAN_CALENDAR_OFF, type TaskPlanInput } from "./taskPlan";
import {
  addTaskPlan, findTaskPlanDestinations, previewTaskPlan, TaskPlanConflictError,
  type TaskPlanServerPreview,
} from "./taskPlanServer";
import { TASK_PLAN_TOKEN_TTL_MS } from "./taskPlanToken";
import { calendarEventId, calendarKey, taskEventBody } from "./taskCalendar";
import type { Task } from "./types";

vi.mock("./connection", () => { throw new Error("Server code must not import browser connection guards."); });
vi.mock("googleapis", () => { throw new Error("Data tests must never load Google clients."); });
vi.mock("firebase/firestore", async (original) => {
  const actual = await original<typeof import("firebase/firestore")>();
  return { ...actual, runTransaction: vi.fn(actual.runTransaction), getDocsFromServer: vi.fn(actual.getDocsFromServer) };
});
const real = await vi.importActual<typeof import("firebase/firestore")>("firebase/firestore");
const options = { secret: "task-plan-emulator-only", now: Date.UTC(2026, 10, 10, 12), origin: "https://tasks.example.test" };
const originalRules = readFileSync(new URL("../firestore.rules", import.meta.url), "utf8");
const parents = [TASK_PLAN_PROSPECT_PARENT, TASK_PLAN_CLIENT_PARENT, TASK_PLAN_INTERNAL_PARENT];
const oldChild: Task = {
  ...TASK_PLAN_INTERNAL_PARENT, id: "old-child", parentId: TASK_PLAN_INTERNAL_PARENT.id,
  task: "Existing completed action", completed: true, completedAt: 42, order: 101,
};
const unrelated: Task = { ...TASK_PLAN_INTERNAL_PARENT, id: "unrelated", task: "Independent dates", endDate: "2028-12-31", order: 900 };
const cases = [TASK_PLAN_PROSPECT_NEW, TASK_PLAN_CLIENT_NEW, TASK_PLAN_INTERNAL_NEW].flatMap((plan, i) => [
  { name: `${plan.kind}/new`, plan },
  { name: `${plan.kind}/append`, plan: {
    kind: plan.kind, ...(plan.kind !== "internal" && { companyId: plan.companyId }),
    existingParentId: parents[i].id, steps: plan.steps,
  } as TaskPlanInput },
]);

beforeEach(async () => {
  if (!USE_EMULATOR || EMULATOR_HOST !== "127.0.0.1:8180") throw new Error("Local Firestore emulator required.");
  vi.mocked(firestore.runTransaction).mockImplementation(real.runTransaction);
  vi.mocked(firestore.getDocsFromServer).mockImplementation(real.getDocsFromServer);
  await clearAll();
  await seed("clients", "pipeline", [TASK_PLAN_PROSPECT, TASK_PLAN_CLIENT], { keepIdField: true });
  await seed("tasks", "tasks", [...parents, oldChild, unrelated]);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
afterAll(async () => { await Promise.all([firestore.terminate(db), firestore.terminate(clientsDb)]); });

async function taskRules(content: string) {
  const response = await fetch(`http://${EMULATOR_HOST}/emulator/v1/projects/${PROJECTS.tasks}:securityRules`, {
    method: "PUT", headers: { Authorization: "Bearer owner", "Content-Type": "application/json" },
    body: JSON.stringify({ rules: { files: [{ name: "firestore.rules", content }] } }),
  });
  if (!response.ok) throw new Error(`Emulator rules failed: ${response.status} ${await response.text()}`);
}

const preview = (plan: TaskPlanInput, clock = options) => previewTaskPlan(plan, clock);
const save = (plan: TaskPlanInput, shown: TaskPlanServerPreview, clock = options) =>
  addTaskPlan(plan, shown.previewToken, shown.warnings.map((warning) => warning.id), clock);

describe("M01 calendar preview activation", () => {
  const plan: TaskPlanInput = { ...TASK_PLAN_INTERNAL_NEW, steps: [
    { name: "All-day visit", startDate: "2026-12-05", endDate: "2026-12-05", calendar: {} },
    { name: "Meeting", startDate: "2026-12-06", endDate: "2026-12-06", calendar: { startTime: "14:00", endTime: "15:00" } },
    { name: "Task only", startDate: "2026-12-07", endDate: "2026-12-07" },
  ] };

  it("returns calendar choices and a bound token without writing, including on a saved-plan preview", async () => {
    vi.stubEnv("GOOGLE_EVENTS_CALENDAR_ID", "test-calendar");
    vi.stubEnv("CALENDAR_FAKE", "1");
    const before = await readAll("tasks", "tasks");
    const shown = await preview(plan);
    expect(shown.canWrite).toBe(true);
    expect(shown.previewToken).toEqual(expect.any(String));
    expect(shown.calendarPreview).toEqual([
      'Step 1 "All-day visit": Team calendar: all day',
      'Step 2 "Meeting": Team calendar: 14:00–15:00',
      'Step 3 "Task only": Task only',
    ]);
    expect(await readAll("tasks", "tasks")).toEqual(before);
    const added = await save(plan, shown);
    const stored = await readAll("tasks", "tasks");
    expect(stored.find((task) => task.id === added.subtaskIds[0])?.calendar).toEqual({});
    expect(stored.find((task) => task.id === added.subtaskIds[1])?.calendar).toEqual(plan.steps[1].calendar);
    expect(stored.find((task) => task.id === added.subtaskIds[2])).not.toHaveProperty("calendar");
    const repeated = await preview(plan);
    expect(repeated.alreadySaved?.alreadySaved).toBe(true);
    expect(repeated.calendarPreview).toEqual(shown.calendarPreview);
  });

  it.each([false, true])("refuses calendar plans before any database call when writes are off (already saved: %s)", async (alreadySaved) => {
    vi.stubEnv("GOOGLE_EVENTS_CALENDAR_ID", "test-calendar");
    vi.stubEnv("CALENDAR_FAKE", "1");
    const shown = await preview(plan);
    if (alreadySaved) await save(plan, shown);
    vi.stubEnv("GOOGLE_EVENTS_CALENDAR_ID", "");
    vi.mocked(firestore.runTransaction).mockClear();
    vi.mocked(firestore.getDocsFromServer).mockClear();
    const refused = await preview(plan);
    expect(refused.errors).toEqual([TASK_PLAN_CALENDAR_OFF]);
    expect(refused.canWrite).toBe(false);
    expect(refused.previewToken).toBeUndefined();
    expect(refused.calendarPreview).toBeUndefined();
    await expect(save(plan, shown)).rejects.toThrow(TASK_PLAN_CALENDAR_OFF);
    expect(firestore.runTransaction).not.toHaveBeenCalled();
    expect(firestore.getDocsFromServer).not.toHaveBeenCalled();
  });
});

describe("M02 calendar save and retry", () => {
  const plan: TaskPlanInput = { ...TASK_PLAN_INTERNAL_NEW, steps: [
    { name: "Meeting", startDate: "2026-12-05", endDate: "2026-12-05", calendar: { startTime: "14:00", endTime: "15:00" } },
    { name: "All-day visit", startDate: "2026-12-06", endDate: "2026-12-07", calendar: {} },
    { name: "Task only", startDate: "2026-12-08", endDate: "2026-12-08" },
  ] };
  const taskFields = (tasks: Record<string, unknown>[]) => tasks.map((task) => {
    const fields = { ...task };
    delete fields.calendarSync;
    return fields;
  });
  const events = async () => (await readAll("tasks", "testCalendarEvents")).map((entry) => JSON.parse(entry.event as string));
  beforeEach(() => { vi.stubEnv("GOOGLE_EVENTS_CALENDAR_ID", "test-calendar"); vi.stubEnv("CALENDAR_FAKE", "1"); });

  it("commits all tasks with their marks before adding exact timed/all-day events and per-step links", async () => {
    const shown = await preview(plan);
    const priorTasks = await readAll("tasks", "tasks");
    const added = await save(plan, shown);
    const stored = await readAll("tasks", "tasks");
    const parent = stored.find((task) => task.id === added.parentId) as unknown as Task;
    const calendarEvents = await events();
    expect(added.subtasks).toEqual(added.subtaskIds.map((taskId, i) => ({ taskId, ...(i < 2 && {
      calendar: { status: "added", link: expect.stringMatching(/^https:\/\/calendar\.example\.test\//) },
    }) })));
    expect(calendarEvents).toHaveLength(2);
    expect(stored).toHaveLength(priorTasks.length + 4);
    for (const old of priorTasks) expect(stored.find((task) => task.id === old.id)).toEqual(old);
    for (const [i, id] of added.subtaskIds.entries()) {
      const task = stored.find((task) => task.id === id) as unknown as Task;
      const sync = task.calendarSync;
      const details = { ...stored.find((task) => task.id === id)! };
      delete details.calendarSync;
      delete details.taskPlanOperation;
      const { id: taskId, ...fields } = details;
      expect(taskId).toBe(id);
      expect(fields).toEqual(shown.subtasks[i]);
      if (i === 2) { expect(task).not.toHaveProperty("calendar"); expect(sync).toBeUndefined(); continue; }
      const eventId = await calendarEventId(id);
      expect(calendarEvents.find((event) => event.id === eventId)).toEqual({
        ...taskEventBody(task, parent, null, options.origin), id: eventId, htmlLink: sync!.link,
      });
      expect(sync!.synced).toBe(calendarKey(task, parent, null));
      expect(sync).not.toHaveProperty("error");
    }
    expect(await preview(plan)).toMatchObject({ alreadySaved: { parentId: added.parentId }, calendarPreview: shown.calendarPreview });
  });

  it("keeps a mixed plan saved on one failure and the identical retry touches only the failed calendar step", async () => {
    const shown = await preview(plan);
    const failedTaskId = `${shown.parentId}-2`;
    await seed("tasks", "settings", [{ id: "test-calendar", fail: 503, failEventId: await calendarEventId(failedTaskId) }]);
    const added = await save(plan, shown);
    expect(added.alreadySaved).toBe(false);
    expect(added.subtasks).toEqual([
      { taskId: added.subtaskIds[0], calendar: { status: "added", link: expect.any(String) } },
      { taskId: failedTaskId, calendar: { status: "failed", error: "The calendar couldn't be updated. Try again." } },
      { taskId: added.subtaskIds[2] },
    ]);
    const beforeRetry = await readAll("tasks", "tasks");
    expect(added.subtaskIds.every((id) => beforeRetry.some((task) => task.id === id))).toBe(true);
    const beforeEvents = await events();
    expect(beforeEvents).toHaveLength(1);
    // Fail the successful step now: retry must skip it, and only repair the previously failed event.
    await seed("tasks", "settings", [{ id: "test-calendar", fail: 503, failEventId: await calendarEventId(added.subtaskIds[0]) }]);
    const retried = await save(plan, shown);
    expect(retried).toMatchObject({ ...added, alreadySaved: true, subtasks: [
      { taskId: added.subtaskIds[0], calendar: added.subtasks![0].calendar },
      { taskId: failedTaskId, calendar: { status: "added", link: expect.any(String) } },
      { taskId: added.subtaskIds[2] },
    ] });
    const afterRetry = await readAll("tasks", "tasks");
    expect(taskFields(afterRetry)).toEqual(taskFields(beforeRetry));
    for (const task of beforeRetry.filter((task) => task.id !== failedTaskId)) {
      expect(afterRetry.find((current) => current.id === task.id)).toEqual(task);
    }
    expect(await events()).toHaveLength(2);
    expect(await events()).toContainEqual(beforeEvents[0]);
    await seed("tasks", "settings", [{ id: "test-calendar", fail: 503 }]);
    const refreshed = await preview(plan); // Preview itself must not retry or write.
    expect(await save(plan, refreshed)).toEqual(retried);
    expect(await readAll("tasks", "tasks")).toEqual(afterRetry);
  });

  it.each(["step", "parent", "company"])("retries a changed saved %s using current data without replaying task fields", async (change) => {
    const selected: TaskPlanInput = { ...TASK_PLAN_PROSPECT_NEW, steps: plan.steps };
    const shown = await preview(selected);
    const added = await save(selected, shown);
    if (change === "step") await firestore.updateDoc(firestore.doc(db, "tasks", added.subtaskIds[0]), {
      task: "Owner's changed meeting", startDate: "2027-01-05", endDate: "2027-01-05", calendar: { startTime: "10:00", endTime: "11:00" }, completed: true,
    });
    if (change === "parent") await firestore.updateDoc(firestore.doc(db, "tasks", added.parentId), { task: "Owner's renamed main task" });
    if (change === "company") await firestore.updateDoc(firestore.doc(clientsDb, "pipeline", String(selected.companyId)), { company: "Renamed company" });
    const beforeRetry = await readAll("tasks", "tasks");
    const result = await save(selected, shown);
    expect(result.alreadySaved).toBe(true);
    const stored = await readAll("tasks", "tasks");
    expect(taskFields(stored)).toEqual(taskFields(beforeRetry));
    const parent = stored.find((task) => task.id === added.parentId) as unknown as Task;
    const company = (await readFields("clients", `pipeline/${selected.companyId}`))! as unknown as typeof TASK_PLAN_PROSPECT;
    const calendarEvents = await events();
    expect(calendarEvents).toHaveLength(2);
    for (const id of added.subtaskIds.slice(0, 2)) {
      const task = stored.find((task) => task.id === id) as unknown as Task;
      expect(calendarEvents.find((event) => event.id === task.calendarSync?.link?.split("/").pop())).toMatchObject(taskEventBody(task, parent, company, options.origin));
    }
  });

  it("does not restore a calendar mark removed in the app, and retries errors even when the last synced key matches", async () => {
    const shown = await preview(plan);
    const added = await save(plan, shown);
    const [removedId, failedId] = added.subtaskIds;
    await firestore.updateDoc(firestore.doc(db, "tasks", removedId), { calendar: firestore.deleteField() });
    await calendarSync.syncTaskCalendar(removedId, options.origin);
    await seed("tasks", "settings", [{ id: "test-calendar", fail: 503, failEventId: await calendarEventId(failedId) }]);
    expect((await calendarSync.syncTaskCalendar(failedId, options.origin)).status).toBe("failed");
    const before = await readAll("tasks", "tasks");
    const failed = before.find((task) => task.id === failedId) as unknown as Task;
    const parent = before.find((task) => task.id === added.parentId) as unknown as Task;
    expect(failed.calendarSync?.synced).toBe(calendarKey(failed, parent, null));
    expect(failed.calendarSync?.error).toEqual(expect.any(String));
    await seed("tasks", "settings", [{ id: "test-calendar", fail: 0 }]);
    const retried = await save(plan, shown);
    expect(retried.subtasks).toEqual([
      { taskId: removedId }, { taskId: failedId, calendar: { status: "added", link: expect.any(String) } }, { taskId: added.subtaskIds[2] },
    ]);
    expect(await readFields("tasks", `tasks/${removedId}`)).not.toHaveProperty("calendar");
    expect((await readFields("tasks", `tasks/${failedId}`))!.calendarSync).not.toHaveProperty("error");
    expect(taskFields(await readAll("tasks", "tasks"))).toEqual(taskFields(before));
    expect((await events()).filter((event) => event.status === "confirmed")).toHaveLength(1);
  });

  it("syncs large plans in parallel with at most ten steps in flight", async () => {
    const selected: TaskPlanInput = { ...plan, steps: Array.from({ length: 21 }, (_, i) => ({ ...plan.steps[1], name: `Calendar step ${i + 1}` })) };
    const shown = await preview(selected);
    const originalSync = calendarSync.syncTaskCalendar;
    let active = 0, peak = 0;
    vi.spyOn(calendarSync, "syncTaskCalendar").mockImplementation(async (...args) => {
      active++; peak = Math.max(peak, active);
      try { return await originalSync(...args); } finally { active--; }
    });
    const result = await save(selected, shown);
    expect(peak).toBe(10);
    expect(result.subtasks).toHaveLength(21);
    expect(result.subtasks!.every((task) => task.calendar?.status === "added")).toBe(true);
    expect(await events()).toHaveLength(21);
  });
});
const withoutProvenance = (data: Record<string, unknown> | null) => {
  const copy = { ...data };
  delete copy.taskPlanOperation;
  return copy;
};
async function removeTask(id: string) {
  // Uses the same emulator-connected SDK, never a production endpoint.
  await firestore.deleteDoc(firestore.doc(db, "tasks", id));
}

describe("general task-plan transactions", () => {
  it.each(cases)("previews with zero writes then saves exact records and preserves all prior data: $name", async ({ plan }) => {
    vi.stubGlobal("navigator", { onLine: false });
    const before = await readAll("tasks", "tasks");
    const companies = await readAll("clients", "pipeline");
    const shown = await preview(plan);
    expect(shown).toMatchObject({ canWrite: true, errors: [], previewToken: expect.any(String) });
    expect(await readAll("tasks", "tasks")).toEqual(before);
    expect(await readAll("clients", "pipeline")).toEqual(companies);
    expect(await readAll("tasks", "settings")).toEqual([]);
    const result = await save(plan, shown);
    expect(result).toMatchObject({ parentId: shown.parentId, alreadySaved: false, destination: shown.destination,
      url: `/tasks?task=${shown.parentId}` });
    const saved = await readAll("tasks", "tasks");
    const created = new Set([...(plan.newParent ? [result.parentId] : []), ...result.subtaskIds]);
    expect(saved.filter((entry) => !created.has(entry.id))).toEqual(before);
    expect(await readAll("clients", "pipeline")).toEqual(companies);
    if (shown.parent) expect(withoutProvenance(await readFields("tasks", `tasks/${result.parentId}`))).toEqual(shown.parent);
    for (const [i, id] of result.subtaskIds.entries()) {
      const stored = await readFields("tasks", `tasks/${id}`);
      expect(withoutProvenance(stored)).toEqual(withoutProvenance(shown.subtasks[i] as unknown as Record<string, unknown>));
      expect(stored).toMatchObject({ responsible: [], informed: [], parentId: result.parentId });
      expect(stored!.order).toBeGreaterThan(unrelated.order);
      if (i) expect(stored!.order).toBeGreaterThan((await readFields("tasks", `tasks/${result.subtaskIds[i - 1]}`))!.order as number);
    }
    expect(await readAll("tasks", "settings")).toEqual([expect.objectContaining({
      id: result.subtaskIds[0].slice(0, -2),
      version: 1, destination: result.destination,
    })]);
  });

  it("preserves deal-skill title, type, source, supplied people and all What/Why/Bring/Watch text", async () => {
    const shown = await preview(TASK_PLAN_DEAL_SKILL);
    const result = await save(TASK_PLAN_DEAL_SKILL, shown);
    expect(await readFields("tasks", `tasks/${result.parentId}`)).toMatchObject({
      task: TASK_PLAN_DEAL_SKILL.newParent!.title, taskType: "Follow Up",
      keyPoints: `${TASK_PLAN_DEAL_SKILL.newParent!.keyPoints}\n\nSource: ${TASK_PLAN_DEAL_SKILL.newParent!.sourceUrl}`,
    });
    expect(await readFields("tasks", `tasks/${result.subtaskIds[0]}`)).toMatchObject({
      keyPoints: `${TASK_PLAN_DEAL_SKILL.steps[0].keyPoints}\n\nOwner: ${TASK_PLAN_DEAL_SKILL.steps[0].owners}`,
    });
  });

  it.each(cases.filter(({ name }) => name.startsWith("internal")))("rolls back every task if the last subtask is refused: $name", async ({ plan }) => {
    const shown = await preview(plan);
    const before = await readAll("tasks", "tasks");
    const companies = await readAll("clients", "pipeline");
    await taskRules(`rules_version = '2'; service cloud.firestore { match /databases/{database}/documents {
      match /tasks/{id} { allow read: if true; allow write: if request.resource.data.task != '${plan.steps.at(-1)!.name}'; }
      match /settings/{id} { allow read, write: if true; }
    } }`);
    try {
      await expect(save(plan, shown)).rejects.toMatchObject({ code: "permission-denied" });
      expect(await readAll("tasks", "tasks")).toEqual(before);
      expect(await readAll("clients", "pipeline")).toEqual(companies);
      expect(await readAll("tasks", "settings")).toEqual([]);
    } finally { await taskRules(originalRules); }
    // A refused transaction leaves no occupied IDs and can be retried after the rules are restored.
    expect(await save(plan, shown)).toMatchObject({ alreadySaved: false });
  });

  it.each(cases)("simultaneous identical saves create one group: $name", async ({ plan }) => {
    const shown = await preview(plan);
    const [a, b] = await Promise.all([save(plan, shown), save(plan, shown)]);
    expect(a.parentId).toBe(b.parentId);
    expect(a.subtaskIds).toEqual(b.subtaskIds);
    expect([a.alreadySaved, b.alreadySaved].sort()).toEqual([false, true]);
    expect(await readAll("tasks", "tasks")).toHaveLength(5 + plan.steps.length + (plan.newParent ? 1 : 0));
  });

  it("retries when an identical save commits between the receipt and member reads", async () => {
    const plan = cases.find(({ name }) => name === "internal/append")!.plan;
    const shown = await preview(plan);
    let intervened = false;
    vi.mocked(firestore.runTransaction).mockImplementation((database, update, settings) => real.runTransaction(database, async (transaction) => {
      if (intervened) return update(transaction);
      const get = transaction.get.bind(transaction);
      let committed: ReturnType<typeof get> | undefined;
      transaction.get = ((reference) => {
        if (!intervened && reference.path.startsWith("settings/task-plan-")) {
          intervened = true;
          committed = get(reference).then(async (snapshot) => {
            // Return the earlier absent receipt only after the other save has created every member.
            await save(plan, shown);
            return snapshot;
          });
          return committed;
        }
        return Promise.resolve(committed).then(() => get(reference));
      }) as typeof transaction.get;
      return update(transaction);
    }, settings));
    expect(await save(plan, shown)).toMatchObject({ alreadySaved: true, parentId: shown.parentId });
    expect(intervened).toBe(true);
    expect(await readAll("tasks", "tasks")).toHaveLength(5 + plan.steps.length);
    expect(await readAll("tasks", "settings")).toHaveLength(1);
  });

  it.each(cases)("lost-response retry precedes its own duplicate warnings and keeps subsequent edits: $name", async ({ plan }) => {
    const shown = await preview(plan);
    let responseLost = false;
    vi.mocked(firestore.runTransaction).mockImplementation(async (database, update, settings) => {
      const result = await real.runTransaction(database, update, settings);
      if (result && typeof result === "object" && "alreadySaved" in result && result.alreadySaved === false) {
        responseLost = true;
        throw new Error("Simulated response lost after commit");
      }
      return result;
    });
    await expect(save(plan, shown)).rejects.toThrow("response lost after commit");
    expect(responseLost).toBe(true);
    const records = await readAll("tasks", "tasks");
    const child = records.find((entry) => entry.parentId === shown.parentId && !entry.completed)!;
    await seed("tasks", "tasks", [{ ...child, task: "Edited after the lost response", keyPoints: "Do not reset", completed: true, order: 2 }]);
    const beforeRetry = await readAll("tasks", "tasks");
    const retry = await save(plan, shown); // Same token and same original acknowledgement list.
    expect(retry).toMatchObject({ parentId: shown.parentId, alreadySaved: true, destination: shown.destination });
    expect(await readAll("tasks", "tasks")).toEqual(beforeRetry);
    const refreshed = await preview(plan);
    expect(refreshed).toMatchObject({ alreadySaved: retry, warnings: [], parent: null, subtasks: [] });
    expect(await save(plan, refreshed)).toEqual(retry);
    expect(await readAll("tasks", "tasks")).toEqual(beforeRetry);
  });

  it("expired saved-operation tokens still require a refreshed preview", async () => {
    const plan = TASK_PLAN_INTERNAL_NEW;
    const shown = await preview(plan);
    const first = await save(plan, shown);
    const later = { ...options, now: options.now + TASK_PLAN_TOKEN_TTL_MS };
    await expect(save(plan, shown, later)).rejects.toThrow(/expired/);
    const refreshed = await preview(plan, later);
    expect(refreshed.previewToken).not.toBe(shown.previewToken);
    expect(await save(plan, refreshed, later)).toEqual({ ...first, alreadySaved: true });
  });

  it("authenticates token/input before returning an already-saved result", async () => {
    const plan = TASK_PLAN_INTERNAL_NEW;
    const shown = await preview(plan);
    await save(plan, shown);
    vi.mocked(firestore.runTransaction).mockRejectedValue(new Error("Token rejection must precede database reads"));
    await expect(addTaskPlan(plan, undefined, [], options)).rejects.toThrow(/token.*invalid/);
    await expect(addTaskPlan(plan, shown.previewToken, [], { ...options, secret: "wrong" })).rejects.toThrow(/token.*invalid/);
    await expect(save({ ...plan, steps: [{ ...plan.steps[0], owners: "Changed supplied owner" }] }, shown)).rejects.toThrow(/changed after preview/);
  });

  it("canonical trimming keeps IDs stable while different prose creates a distinct operation", async () => {
    const plan = TASK_PLAN_INTERNAL_NEW;
    const shown = await preview(plan);
    const first = await save(plan, shown);
    const spaced = { ...plan, newParent: { title: ` ${plan.newParent!.title} ` } } as TaskPlanInput;
    expect(await save(spaced, shown)).toEqual({ ...first, alreadySaved: true });
    const changed = { ...plan, steps: plan.steps.map((step) => ({ ...step, keyPoints: "Different exact notes" })) };
    const differentPreview = await preview(changed);
    expect(differentPreview.warnings.some((warning) => warning.code === "similar-parent")).toBe(true);
    const second = await save(changed, differentPreview);
    expect(second.parentId).not.toBe(first.parentId);
    expect(second.subtaskIds.some((id) => first.subtaskIds.includes(id))).toBe(false);
  });

  it.each([
    { label: "deleted", change: null },
    { label: "reparented", change: { parentId: "some-other-parent" } },
    { label: "completed", change: { completed: true } },
    { label: "company changed", change: { linkedClientId: TASK_PLAN_CLIENT.id } },
    { label: "group changed", change: { taskGroup: "Changed group" } },
    { label: "dates changed", change: { endDate: "2029-12-31" } },
    { label: "renamed", change: { task: "Different parent" } },
    { label: "parked", change: { parkedAt: 42, parkedUntil: "2099-01-01" } },
  ])("rejects a parent $label between preview and save without touching any records", async ({ change }) => {
    const plan = cases.find(({ name }) => name === "internal/append")!.plan;
    const shown = await preview(plan);
    if (change) await seed("tasks", "tasks", [{ ...TASK_PLAN_INTERNAL_PARENT, ...change }]);
    else await removeTask(plan.existingParentId!);
    const before = await readAll("tasks", "tasks");
    await expect(save(plan, shown)).rejects.toThrow(/Invalid task preview|changed/);
    expect(await readAll("tasks", "tasks")).toEqual(before);
  });

  it.each(["delete", "reparent", "complete", "edit-notes"])("reads and validates the parent inside the transaction during a concurrent %s", async (change) => {
    const plan = cases.find(({ name }) => name === "internal/append")!.plan;
    const shown = await preview(plan);
    let intervened = false;
    let writesPrepared = 0;
    vi.mocked(firestore.runTransaction).mockImplementation((database, update, settings) => real.runTransaction(database, async (transaction) => {
      const result = await update(transaction);
      if (result && typeof result === "object" && "alreadySaved" in result && result.alreadySaved === false) {
        writesPrepared++;
        if (!intervened) {
          intervened = true;
          if (change === "delete") await removeTask(plan.existingParentId!);
          else await seed("tasks", "tasks", [{ ...TASK_PLAN_INTERNAL_PARENT,
            ...(change === "reparent" ? { parentId: "other" } : change === "complete" ? { completed: true } : { keyPoints: "New concurrent notes" }),
          }]);
        }
      }
      return result;
    }, settings));
    if (change === "edit-notes") {
      expect(await save(plan, shown)).toMatchObject({ alreadySaved: false });
      expect(writesPrepared).toBe(2);
      expect(await readFields("tasks", `tasks/${plan.existingParentId}`)).toMatchObject({ keyPoints: "New concurrent notes" });
    } else {
      await expect(save(plan, shown)).rejects.toThrow(/Invalid task preview/);
      expect(await readAll("tasks", "tasks")).toHaveLength(change === "delete" ? 4 : 5);
    }
    expect(intervened).toBe(true);
  });

  it.each(["duplicate step", "similar parent", "company category"])("refreshes save context after a transaction retry: %s", async (change) => {
    const plan = change === "duplicate step" ? cases.find(({ name }) => name === "internal/append")!.plan
      : change === "similar parent" ? TASK_PLAN_INTERNAL_NEW : TASK_PLAN_PROSPECT_NEW;
    const shown = await preview(plan);
    expect(shown.warnings).toEqual([]);
    let intervened = false;
    let expectedTasks: Awaited<ReturnType<typeof readAll>> | undefined;
    let expectedCompanies: Awaited<ReturnType<typeof readAll>> | undefined;
    vi.mocked(firestore.runTransaction).mockImplementation((database, update, settings) => real.runTransaction(database, async (transaction) => {
      const result = await update(transaction);
      if (!intervened && result && typeof result === "object" && "alreadySaved" in result && result.alreadySaved === false) {
        intervened = true;
        if (change === "company category") {
          await seed("clients", "pipeline", [{ ...TASK_PLAN_PROSPECT, status: TASK_PLAN_CLIENT.status }], { keepIdField: true });
        } else {
          await seed("tasks", "tasks", [{ ...TASK_PLAN_INTERNAL_PARENT, id: "concurrent-task",
            ...(change === "similar parent" ? { task: plan.newParent!.title } : {
              parentId: plan.existingParentId, task: plan.steps[0].name,
              startDate: plan.steps[0].startDate, endDate: plan.steps[0].endDate,
            }),
          }]);
        }
        // Invalidate a document read by the first attempt, forcing a real SDK retry.
        await seed("tasks", "tasks", [{ ...unrelated, keyPoints: "Concurrent owner edit must survive" }]);
        expectedTasks = await readAll("tasks", "tasks");
        expectedCompanies = await readAll("clients", "pipeline");
      }
      return result;
    }, settings));
    await expect(save(plan, shown)).rejects.toThrow(/Invalid task preview|destination or warnings changed/);
    expect(intervened).toBe(true);
    expect(await readAll("tasks", "tasks")).toEqual(expectedTasks);
    expect(await readAll("clients", "pipeline")).toEqual(expectedCompanies);
    expect(await readAll("tasks", "settings")).toEqual([]);
  });

  it.each(cases.filter(({ name }) => name.startsWith("internal")))("conflicts on partial deletion rather than repairing a saved group: $name", async ({ plan }) => {
    const shown = await preview(plan);
    const result = await save(plan, shown);
    await removeTask(result.subtaskIds[1]);
    const before = await readAll("tasks", "tasks");
    await expect(save(plan, shown)).rejects.toBeInstanceOf(TaskPlanConflictError);
    await expect(preview(plan)).rejects.toBeInstanceOf(TaskPlanConflictError);
    expect(await readAll("tasks", "tasks")).toEqual(before);
  });

  it.each(cases.filter(({ name }) => name.startsWith("internal")))("does not recreate a group when every created task was deleted: $name", async ({ plan }) => {
    const shown = await preview(plan);
    const result = await save(plan, shown);
    for (const id of [...(plan.newParent ? [result.parentId] : []), ...result.subtaskIds]) await removeTask(id);
    const before = await readAll("tasks", "tasks");
    await expect(save(plan, shown)).rejects.toBeInstanceOf(TaskPlanConflictError);
    await expect(preview(plan)).rejects.toBeInstanceOf(TaskPlanConflictError);
    expect(await readAll("tasks", "tasks")).toEqual(before);
  });

  it("does not recreate the only appended step after deletion", async () => {
    const plan: TaskPlanInput = { kind: "internal", existingParentId: TASK_PLAN_INTERNAL_PARENT.id, steps: TASK_PLAN_INTERNAL_NEW.steps.slice(0, 1) };
    const shown = await preview(plan);
    const result = await save(plan, shown);
    await removeTask(result.subtaskIds[0]);
    await expect(save(plan, shown)).rejects.toBeInstanceOf(TaskPlanConflictError);
    expect(await readAll("tasks", "tasks")).toHaveLength(5);
  });

  it.each(["deleted", "conflicting"])("never repairs a %s operation receipt", async (change) => {
    const plan = TASK_PLAN_INTERNAL_NEW;
    const shown = await preview(plan);
    await save(plan, shown);
    const [receipt] = await readAll("tasks", "settings");
    if (change === "deleted") await firestore.deleteDoc(firestore.doc(db, "settings", receipt.id));
    else await seed("tasks", "settings", [{ ...receipt, hash: "unrelated" }]);
    const before = await readAll("tasks", "tasks");
    await expect(save(plan, shown)).rejects.toBeInstanceOf(TaskPlanConflictError);
    expect(await readAll("tasks", "tasks")).toEqual(before);
  });

  it("does not replace an occupied deterministic receipt even when no task IDs are occupied", async () => {
    const plan = TASK_PLAN_INTERNAL_NEW;
    const shown = await preview(plan);
    await seed("tasks", "settings", [{ id: shown.parentId, hash: "foreign receipt", version: 1 }]);
    const before = await readAll("tasks", "tasks");
    await expect(save(plan, shown)).rejects.toBeInstanceOf(TaskPlanConflictError);
    expect(await readAll("tasks", "tasks")).toEqual(before);
    expect(await readFields("tasks", `settings/${shown.parentId}`)).toEqual({ hash: "foreign receipt", version: 1 });
  });

  it.each(["parent-deleted", "parent-reparented", "child-reparented", "child-company-changed", "provenance-changed"])("conflicts on saved target identity: %s", async (change) => {
    const plan = TASK_PLAN_INTERNAL_NEW;
    const shown = await preview(plan);
    const result = await save(plan, shown);
    if (change === "parent-deleted") await removeTask(result.parentId);
    else {
      const id = change === "parent-reparented" ? result.parentId : result.subtaskIds[0];
      const data = (await readFields("tasks", `tasks/${id}`))!;
      await seed("tasks", "tasks", [{ id, ...data,
        ...(change.includes("reparented") ? { parentId: "somewhere-else" }
          : change === "child-company-changed" ? { linkedClientId: TASK_PLAN_CLIENT.id } : { taskPlanOperation: { hash: "unrelated", index: 0 } }),
      }]);
    }
    const before = await readAll("tasks", "tasks");
    await expect(save(plan, shown)).rejects.toBeInstanceOf(TaskPlanConflictError);
    expect(await readAll("tasks", "tasks")).toEqual(before);
  });

  it.each(["parent", "child"])("does not overwrite an unrelated deterministic %s ID occupied after preview", async (member) => {
    const plan = TASK_PLAN_INTERNAL_NEW;
    const shown = await preview(plan);
    const id = member === "parent" ? shown.parentId : `${shown.parentId}-1`;
    await seed("tasks", "tasks", [{ ...unrelated, id }]);
    const before = await readAll("tasks", "tasks");
    await expect(save(plan, shown)).rejects.toBeInstanceOf(TaskPlanConflictError);
    expect(await readAll("tasks", "tasks")).toEqual(before);
  });

  it("the missing-ID transaction precondition prevents overwriting an ID claimed during the commit", async () => {
    const plan = TASK_PLAN_INTERNAL_NEW;
    const shown = await preview(plan);
    let claimed = false;
    vi.mocked(firestore.runTransaction).mockImplementation((database, update, settings) => real.runTransaction(database, async (transaction) => {
      const result = await update(transaction);
      if (!claimed && result && typeof result === "object" && "alreadySaved" in result && result.alreadySaved === false) {
        claimed = true;
        await seed("tasks", "tasks", [{ ...unrelated, id: shown.parentId, task: "Concurrent independent work" }]);
      }
      return result;
    }, settings));
    await expect(save(plan, shown)).rejects.toBeInstanceOf(TaskPlanConflictError);
    expect(claimed).toBe(true);
    expect(await readFields("tasks", `tasks/${shown.parentId}`)).toMatchObject({ task: "Concurrent independent work" });
    expect(await readAll("tasks", "tasks")).toHaveLength(6);
  });

  it("returns a renamed/completed saved parent and original summary without resetting it", async () => {
    const plan = TASK_PLAN_INTERNAL_NEW;
    const shown = await preview(plan);
    const result = await save(plan, shown);
    const data = await readFields("tasks", `tasks/${result.parentId}`);
    await seed("tasks", "tasks", [{ id: result.parentId, ...data, task: "Renamed and completed", completed: true, endDate: "2029-12-31" }]);
    const before = await readAll("tasks", "tasks");
    expect(await save(plan, shown)).toEqual({ ...result, alreadySaved: true });
    expect((await preview(plan)).alreadySaved).toEqual({ ...result, alreadySaved: true });
    expect(await readAll("tasks", "tasks")).toEqual(before);
  });

  it.each(["deleted", "changed status", "renamed"])("rechecks a company %s after preview, without writing tasks or company data", async (change) => {
    const plan = TASK_PLAN_PROSPECT_NEW;
    const shown = await preview(plan);
    if (change === "deleted") await firestore.deleteDoc(firestore.doc(clientsDb, "pipeline", String(TASK_PLAN_PROSPECT.id)));
    else await seed("clients", "pipeline", [{ ...TASK_PLAN_PROSPECT,
      ...(change === "changed status" ? { status: TASK_PLAN_CLIENT.status } : { company: "Changed name" }),
    }], { keepIdField: true });
    const before = await readAll("tasks", "tasks");
    const companies = await readAll("clients", "pipeline");
    await expect(save(plan, shown)).rejects.toThrow(/Invalid task preview|changed/);
    expect(await readAll("tasks", "tasks")).toEqual(before);
    expect(await readAll("clients", "pipeline")).toEqual(companies);
  });

  it("internal discovery, preview, create, append and retries work when every company read throws", async () => {
    vi.mocked(firestore.getDocsFromServer).mockImplementation((query) => {
      if (query.firestore === clientsDb) throw new Error("Company project unavailable");
      return real.getDocsFromServer(query);
    });
    expect(await findTaskPlanDestinations({ kind: "internal" })).toMatchObject({
      errors: [], parents: expect.arrayContaining([expect.objectContaining({ id: TASK_PLAN_INTERNAL_PARENT.id })]),
    });
    for (const { plan } of cases.filter(({ name }) => name.startsWith("internal"))) {
      const shown = await preview(plan);
      const result = await save(plan, shown);
      expect(await save(plan, shown)).toEqual({ ...result, alreadySaved: true });
      expect((await preview(plan)).alreadySaved).toEqual({ ...result, alreadySaved: true });
    }
  });

  it("a completed company save retries before unavailable or changed company state", async () => {
    const plan = TASK_PLAN_PROSPECT_NEW;
    const shown = await preview(plan);
    const result = await save(plan, shown);
    await firestore.deleteDoc(firestore.doc(clientsDb, "pipeline", String(TASK_PLAN_PROSPECT.id)));
    vi.mocked(firestore.getDocsFromServer).mockRejectedValue(new Error("No new preview-state reads allowed"));
    expect(await save(plan, shown)).toEqual({ ...result, alreadySaved: true });
    expect((await preview(plan)).alreadySaved).toEqual({ ...result, alreadySaved: true });
  });

  it("requires the exact warning acknowledgements before writing any records", async () => {
    const plan = { ...TASK_PLAN_INTERNAL_NEW, steps: [{ name: "Old action", startDate: "2001-01-01", endDate: "2001-01-01" }] };
    const shown = await preview(plan);
    const before = await readAll("tasks", "tasks");
    await expect(addTaskPlan(plan, shown.previewToken, [], options)).rejects.toThrow(/Unacknowledged/);
    await expect(addTaskPlan(plan, shown.previewToken, ["unknown"], options)).rejects.toThrow(/only warning IDs/);
    expect(await readAll("tasks", "tasks")).toEqual(before);
    expect(await save(plan, shown)).toMatchObject({ alreadySaved: false });
  });

  it("rejects newly introduced duplicate warnings instead of using an old warning-free preview", async () => {
    const plan = cases.find(({ name }) => name === "internal/append")!.plan;
    const shown = await preview(plan);
    expect(shown.warnings).toEqual([]);
    await seed("tasks", "tasks", [{ ...oldChild, id: "duplicate", task: plan.steps[0].name,
      startDate: plan.steps[0].startDate, endDate: plan.steps[0].endDate }]);
    const before = await readAll("tasks", "tasks");
    await expect(save(plan, shown)).rejects.toThrow(/warnings changed/);
    expect(await readAll("tasks", "tasks")).toEqual(before);
  });

  it("invalid input previews and saves fail before database access", async () => {
    vi.mocked(firestore.runTransaction).mockRejectedValue(new Error("No transaction allowed"));
    vi.mocked(firestore.getDocsFromServer).mockRejectedValue(new Error("No reads allowed"));
    const invalid = { ...TASK_PLAN_INTERNAL_NEW, steps: [] };
    expect(await previewTaskPlan(invalid, options)).toMatchObject({ canWrite: false, parent: null, subtasks: [] });
    await expect(addTaskPlan(invalid, "invalid", [], options)).rejects.toThrow(/token.*invalid/);
  });

  it("saves 499 steps, the parent and a durable receipt in one transaction", async () => {
    const plan: TaskPlanInput = { kind: "internal", newParent: { title: "Full fictional group" }, steps: Array.from({ length: 499 }, (_, i) => ({
      name: `Selected step ${i + 1}`, startDate: "2099-01-01", endDate: "2099-01-01",
    })) };
    const shown = await preview(plan);
    const result = await save(plan, shown);
    expect(result.subtaskIds).toHaveLength(499);
    expect(await readAll("tasks", "tasks")).toHaveLength(505);
    expect(await readAll("tasks", "settings")).toHaveLength(1);
  }, 20_000);
});
