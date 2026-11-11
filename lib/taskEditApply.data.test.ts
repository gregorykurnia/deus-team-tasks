import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as firestore from "firebase/firestore";
import { clearAll, EMULATOR_HOST, openClientTrackerRules, PROJECTS, readAll, readFields, seed } from "../tests/support/emulator";
import { TASK_PLAN_INTERNAL_PARENT, TASK_PLAN_PROSPECT } from "../tests/fixtures/taskPlan";
import { syncTaskCalendar } from "./calendarSync";
import { USE_EMULATOR } from "./emulator";
import { db } from "./firebase";
import { clientsDb } from "./firebaseClients";
import { calendarEventId } from "./taskCalendar";
import type { TaskChange, TaskChangesPreview } from "./taskEdit";
import { applyTaskChanges, previewTaskChanges, TaskEditError } from "./taskEditServer";
import type { Task } from "./types";

vi.mock("./connection", () => { throw new Error("Server saves must not import browser write guards."); });
vi.mock("googleapis", () => { throw new Error("Save tests must never load Google clients."); });
vi.mock("firebase/firestore", async (original) => {
  const actual = await original<typeof import("firebase/firestore")>();
  return { ...actual, runTransaction: vi.fn(actual.runTransaction), getDocsFromServer: vi.fn(actual.getDocsFromServer) };
});
const real = await vi.importActual<typeof import("firebase/firestore")>("firebase/firestore");
const ORIGIN = "https://tasks.example.test";
const now = Date.UTC(2026, 10, 11, 18);
const company = { ...TASK_PLAN_PROSPECT, date: "2026-11-01", target: "2027-01-31" };
const parent: Task = { ...TASK_PLAN_INTERNAL_PARENT, id: "parent", task: "Main task", linkedClientId: company.id, lastActionDate: "2026-11-10" };
const child: Task = { ...parent, id: "child", task: "Child task", parentId: parent.id, order: 101 };
const done: Task = { ...child, id: "done", completed: true, completedAt: 20, task: "Done task", order: 102 };
const freed: Task = { ...child, id: "freed", task: "Freed task", order: 103 };
const parked: Task = { ...parent, id: "parked", task: "Parked task", parkedAt: 30, parkedUntil: "2027-03-01" };
const internal: Task = { ...TASK_PLAN_INTERNAL_PARENT, id: "internal", task: "Internal task" };
const unrelated: Task = { ...parent, id: "unrelated", task: "Independent dates", endDate: "2028-12-31" };
const initial = [parent, child, done, freed, parked, internal, unrelated];

beforeEach(async () => {
  if (!USE_EMULATOR || EMULATOR_HOST !== "127.0.0.1:8180") throw new Error("Local Firestore emulator required.");
  vi.mocked(firestore.runTransaction).mockImplementation(real.runTransaction);
  vi.mocked(firestore.getDocsFromServer).mockImplementation(real.getDocsFromServer);
  vi.spyOn(Date, "now").mockReturnValue(now);
  vi.stubEnv("GOOGLE_EVENTS_CALENDAR_ID", "test-calendar");
  vi.stubEnv("CALENDAR_FAKE", "1");
  await clearAll();
  await seed("tasks", "tasks", initial);
  await seed("clients", "pipeline", [company], { keepIdField: true });
});
afterEach(async () => { await openClientTrackerRules(); vi.restoreAllMocks(); vi.unstubAllEnvs(); });
afterAll(async () => { await Promise.all([firestore.terminate(db), firestore.terminate(clientsDb)]); });

const stamps = (preview: TaskChangesPreview) => Object.fromEntries(preview.tasks.map((row) => [row.taskId, row.seen]));
const save = (changes: TaskChange[], preview: TaskChangesPreview) =>
  applyTaskChanges(changes, stamps(preview), preview.warnings.map((warning) => warning.id), ORIGIN);
async function snapshot() {
  return Promise.all([readAll("tasks", "tasks"), readAll("clients", "pipeline"), readAll("tasks", "settings"), readAll("tasks", "testCalendarEvents")]
    .map(async (records) => (await records).sort((a, b) => a.id.localeCompare(b.id))));
}
async function event(id: string) {
  const stored = await readFields("tasks", `testCalendarEvents/${await calendarEventId(id)}`);
  return stored ? JSON.parse(stored.event as string) : null;
}
async function updateTimes() {
  const response = await fetch(`http://${EMULATOR_HOST}/v1/projects/${PROJECTS.tasks}/databases/(default)/documents/tasks`, { headers: { Authorization: "Bearer owner" } });
  if (!response.ok) throw new Error(`Emulator read failed: ${response.status}`);
  const body = await response.json() as { documents: { name: string; updateTime: string }[] };
  return Object.fromEntries(body.documents.map((entry) => [entry.name, entry.updateTime]));
}

describe("T04 atomic task edits", () => {
  const mixed: TaskChange[] = [
    { taskId: internal.id, set: { task: "New name", startDate: "2026-12-02", endDate: "2027-02-01", keyPoints: "  Whole replacement\n", status: "inProgress",
      responsible: ["fictional existing owner"], informed: [{ name: "New Person", note: "  Keep note  " }] } },
    { taskId: child.id, set: { status: "done" }, move: { toParentId: internal.id } },
    { taskId: parked.id, set: { parked: false } },
    { taskId: unrelated.id, set: { parked: { until: null } } },
    { taskId: parent.id, delete: true }, { taskId: done.id, delete: true },
  ];

  it("saves the exact mixed preview, including a deleted parent's unlisted subtask, and touches nothing else", async () => {
    const preview = await previewTaskChanges(mixed);
    expect(preview.canWrite).toBe(true);
    expect(preview.tasks.find((row) => row.taskId === freed.id)?.after).not.toHaveProperty("parentId");
    const expected = new Map(initial.map((task) => [task.id, task]));
    for (const row of preview.tasks) {
      if (row.after) expected.set(row.taskId, row.after);
      else expected.delete(row.taskId);
    }
    const result = await save(mixed, preview);
    expect(result.alreadySaved).toBe(false);
    expect(result.tasks.map((row) => row.taskId)).toEqual(preview.tasks.map((row) => row.taskId));
    expect(result.tasks.every((row) => row.saved && row.url === `${ORIGIN}/tasks?task=${row.taskId}`)).toBe(true);
    expect(result.tasks.filter((row) => row.deleted).map((row) => row.taskId)).toEqual([parent.id, done.id]);
    expect((await readAll("tasks", "tasks")).sort((a, b) => a.id.localeCompare(b.id)))
      .toEqual([...expected.values()].sort((a, b) => a.id.localeCompare(b.id)));
    expect(await readFields("clients", `pipeline/${company.id}`)).toEqual(company);
    expect(await readAll("tasks", "settings")).toEqual([]);
  });

  it("retries a mixed saved list without a single document write or moved timestamps", async () => {
    const preview = await previewTaskChanges(mixed);
    await save(mixed, preview);
    const before = await snapshot();
    const times = await updateTimes();
    vi.mocked(Date.now).mockReturnValue(now + 100_000);
    const retry = await save(mixed, preview);
    expect(retry.alreadySaved).toBe(true);
    expect(retry.tasks.find((row) => row.taskId === freed.id)).toMatchObject({ saved: true, deleted: false });
    expect(await snapshot()).toEqual(before);
    expect(await updateTimes()).toEqual(times);
  });

  it.each([parent.id, child.id, freed.id])("refuses the whole list and names changed task %s", async (id) => {
    const preview = await previewTaskChanges(mixed);
    const current = initial.find((task) => task.id === id)!;
    await seed("tasks", "tasks", [{ ...current, keyPoints: "Someone else edited this" }]);
    const before = await snapshot();
    await expect(save(mixed, preview)).rejects.toThrow(`Tasks changed since the preview: ${id}`);
    expect(await snapshot()).toEqual(before);
  });

  it("guards fresh transaction reads rather than the earlier collection enumeration", async () => {
    const changes: TaskChange[] = [{ taskId: internal.id, set: { task: "Requested name" } }];
    const preview = await previewTaskChanges(changes);
    vi.mocked(firestore.getDocsFromServer).mockImplementationOnce(async (query) => {
      const old = await real.getDocsFromServer(query);
      await seed("tasks", "tasks", [{ ...internal, task: "Edited after enumeration" }]);
      return old;
    });
    await expect(save(changes, preview)).rejects.toThrow(internal.id);
    expect(await readFields("tasks", `tasks/${internal.id}`)).toMatchObject({ task: "Edited after enumeration" });
  });

  it("rechecks the preview on a real transaction retry after a concurrent edit", async () => {
    const changes: TaskChange[] = [{ taskId: internal.id, set: { task: "Requested name" } }];
    const preview = await previewTaskChanges(changes);
    let attempts = 0;
    vi.mocked(firestore.runTransaction).mockImplementationOnce((database, work, options) => real.runTransaction(database, async (transaction) => {
      const result = await work(transaction);
      if (++attempts === 1) await seed("tasks", "tasks", [{ ...internal, keyPoints: "Concurrent edit" }]);
      return result;
    }, options));
    await expect(save(changes, preview)).rejects.toThrow(internal.id);
    expect(await readFields("tasks", `tasks/${internal.id}`)).toMatchObject({ task: internal.task, keyPoints: "Concurrent edit" });
  });

  it("handles simultaneous identical saves as one save and one retry", async () => {
    const changes: TaskChange[] = [{ taskId: internal.id, set: { task: "Saved once", status: "done" } }];
    const preview = await previewTaskChanges(changes);
    const results = await Promise.all([save(changes, preview), save(changes, preview)]);
    expect(results.map((result) => result.alreadySaved).sort()).toEqual([false, true]);
    expect(await readFields("tasks", `tasks/${internal.id}`)).toMatchObject({ task: "Saved once", completedAt: now });
  });

  it("refuses a newly discovered subtask without its preview stamp", async () => {
    const changes: TaskChange[] = [{ taskId: parent.id, delete: true }];
    const preview = await previewTaskChanges(changes);
    await seed("tasks", "tasks", [{ ...child, id: "new-child" }]);
    const before = await snapshot();
    await expect(save(changes, preview)).rejects.toThrow("affected tasks changed");
    expect(await snapshot()).toEqual(before);
  });

  it("rechecks move destinations and refuses when the destination becomes ineligible", async () => {
    const changes: TaskChange[] = [{ taskId: child.id, move: { toParentId: internal.id } }];
    const preview = await previewTaskChanges(changes);
    await seed("tasks", "tasks", [{ ...internal, completed: true }]);
    const before = await snapshot();
    await expect(save(changes, preview)).rejects.toThrow("open, unparked, top-level");
    expect(await snapshot()).toEqual(before);
  });

  it("refuses every write when warnings are not acknowledged", async () => {
    const preview = await previewTaskChanges(mixed);
    const before = await snapshot();
    await expect(applyTaskChanges(mixed, stamps(preview), [], ORIGIN)).rejects.toThrow("Confirm these warnings");
    expect(await snapshot()).toEqual(before);
  });

  it.each([{}, { internal: "bad" }, { "bad/id": "a".repeat(64) }])("refuses invalid stamps without writes: %j", async (seen) => {
    const before = await snapshot();
    await expect(applyTaskChanges([{ taskId: internal.id, set: { task: "New" } }], seen, [], ORIGIN)).rejects.toBeInstanceOf(TaskEditError);
    expect(await snapshot()).toEqual(before);
  });
});

describe("T04 company dates and rollback", () => {
  it("moves the company's target and last action, leaving sibling dates untouched", async () => {
    const changes: TaskChange[] = [{ taskId: parent.id, set: { endDate: "2027-04-01" } }];
    const preview = await previewTaskChanges(changes);
    await save(changes, preview);
    expect(await readFields("clients", `pipeline/${company.id}`)).toEqual({ ...company, target: "2027-04-01", date: parent.lastActionDate });
    for (const task of [child, done, freed, parked, unrelated]) {
      expect(await readFields("tasks", `tasks/${task.id}`)).toMatchObject({ startDate: task.startDate, endDate: task.endDate });
    }
    const before = await snapshot();
    expect((await save(changes, preview)).alreadySaved).toBe(true);
    expect(await snapshot()).toEqual(before);
  });

  it("does not move the company when a deadline belongs to a done task or becomes Done", async () => {
    const changes: TaskChange[] = [
      { taskId: done.id, set: { endDate: "2027-04-01" } },
      { taskId: child.id, set: { endDate: "2027-05-01", status: "done" } },
    ];
    await save(changes, await previewTaskChanges(changes));
    expect(await readFields("clients", `pipeline/${company.id}`)).toEqual(company);
  });

  it("uses the last listed open deadline for one company, like consecutive app saves", async () => {
    const changes: TaskChange[] = [
      { taskId: parent.id, set: { endDate: "2027-04-01" } }, { taskId: unrelated.id, set: { endDate: "2027-05-01" } },
    ];
    await save(changes, await previewTaskChanges(changes));
    expect(await readFields("clients", `pipeline/${company.id}`)).toMatchObject({ target: "2027-05-01" });
  });

  it("restores the entire task list, deletions and freed subtasks when the real company write fails", async () => {
    const changes: TaskChange[] = [
      { taskId: parked.id, set: { endDate: "2027-04-01" } },
      { taskId: parent.id, delete: true }, { taskId: done.id, delete: true },
      { taskId: internal.id, set: { task: "Must roll back too" } },
    ];
    const preview = await previewTaskChanges(changes);
    const before = await snapshot();
    const response = await fetch(`http://${EMULATOR_HOST}/emulator/v1/projects/${PROJECTS.clients}:securityRules`, {
      method: "PUT", headers: { Authorization: "Bearer owner", "Content-Type": "application/json" },
      body: JSON.stringify({ rules: { files: [{ name: "clients.rules", content: "rules_version = '2'; service cloud.firestore { match /databases/{database}/documents { match /{document=**} { allow read: if true; allow write: if false; } } }" }] } }),
    });
    if (!response.ok) throw new Error(`Emulator rules failed: ${response.status}`);
    await expect(save(changes, preview)).rejects.toThrow("All task changes were restored");
    expect(await snapshot()).toEqual(before);
  });
});

describe("T04 calendar after saving", () => {
  it("renames and moves a marked event, removes it on take-off, and safely retries removal", async () => {
    await seed("tasks", "tasks", [{ ...child, calendar: {} }]);
    await syncTaskCalendar(child.id, ORIGIN);
    const changes: TaskChange[] = [{ taskId: child.id, set: { task: "Changed event", startDate: "2026-12-03", endDate: "2026-12-04" } }];
    const renamed = await save(changes, await previewTaskChanges(changes));
    expect(renamed.tasks[0]).toMatchObject({ saved: true, calendar: { status: "synced" } });
    expect(await event(child.id)).toMatchObject({ summary: "Changed event", start: { date: "2026-12-03" }, end: { date: "2026-12-05" } });
    const takeOff: TaskChange[] = [{ taskId: child.id, set: { calendar: null } }];
    const preview = await previewTaskChanges(takeOff);
    expect((await save(takeOff, preview)).tasks[0].calendar?.status).toBe("removed");
    expect((await event(child.id)).status).toBe("cancelled");
    expect(await readFields("tasks", `tasks/${child.id}`)).not.toHaveProperty("calendar");
    expect((await save(takeOff, preview)).alreadySaved).toBe(true);
  });

  it("frees and resyncs unlisted marked children, then deletes their event when they are deleted", async () => {
    await seed("tasks", "tasks", [{ ...freed, calendar: {} }]);
    await syncTaskCalendar(freed.id, ORIGIN);
    expect((await event(freed.id)).description).toContain(parent.task);
    const changes: TaskChange[] = [{ taskId: parent.id, delete: true }];
    const preview = await previewTaskChanges(changes);
    const result = await save(changes, preview);
    expect(result.tasks.find((row) => row.taskId === freed.id)?.calendar?.status).toBe("synced");
    expect((await event(freed.id)).description).not.toContain(`Main task: ${parent.task}`);
    expect(await readFields("tasks", `tasks/${freed.id}`)).not.toHaveProperty("parentId");
    expect((await save(changes, preview)).alreadySaved).toBe(true);
    const remove: TaskChange[] = [{ taskId: freed.id, delete: true }];
    expect((await save(remove, await previewTaskChanges(remove))).tasks[0].calendar?.status).toBe("removed");
    expect((await event(freed.id)).status).toBe("cancelled");
    expect((await readAll("tasks", "tasks")).some((task) => task.id === freed.id)).toBe(false);
  });

  it("updates unlisted subtasks' event descriptions when chat renames their main task, as the app does (R1)", async () => {
    await seed("tasks", "tasks", [{ ...child, calendar: {} }]);
    await syncTaskCalendar(child.id, ORIGIN);
    const changes: TaskChange[] = [{ taskId: parent.id, set: { task: "Renamed main task" } }];
    const result = await save(changes, await previewTaskChanges(changes));
    expect(result.tasks.map((row) => row.taskId)).toEqual([parent.id]);
    expect((await event(child.id)).description).toContain("Renamed main task");
    expect(await readFields("tasks", `tasks/${child.id}`)).toMatchObject({ task: child.task, endDate: child.endDate });
  });

  it("updates a moved subtask's event description to its new main task", async () => {
    await seed("tasks", "tasks", [{ ...child, calendar: {} }]);
    await syncTaskCalendar(child.id, ORIGIN);
    const changes: TaskChange[] = [{ taskId: child.id, move: { toParentId: internal.id } }];
    await save(changes, await previewTaskChanges(changes));
    expect((await event(child.id)).description).toContain(internal.task);
    expect((await event(child.id)).description).not.toContain(`Main task: ${parent.task}`);
    expect(await readFields("tasks", `tasks/${child.id}`)).not.toHaveProperty("linkedClientId");
  });

  it("keeps saved task changes when the fake calendar fails and repairs the event on retry", async () => {
    await seed("tasks", "tasks", [{ ...internal, calendar: {} }]);
    const changes: TaskChange[] = [{ taskId: internal.id, set: { task: "Saved despite calendar failure" } }];
    const preview = await previewTaskChanges(changes);
    await seed("tasks", "settings", [{ id: "test-calendar", fail: 503 }]);
    expect((await save(changes, preview)).tasks[0]).toMatchObject({ saved: true, calendar: { status: "failed", error: expect.any(String) } });
    expect(await readFields("tasks", `tasks/${internal.id}`)).toMatchObject({ task: "Saved despite calendar failure" });
    await seed("tasks", "settings", [{ id: "test-calendar", fail: 0 }]);
    const retry = await save(changes, preview);
    expect(retry).toMatchObject({ alreadySaved: true, tasks: [{ saved: true, calendar: { status: "synced" } }] });
    expect((await event(internal.id)).summary).toBe("Saved despite calendar failure");
    expect(await readAll("tasks", "testCalendarEvents")).toHaveLength(1);
  });

  it("retries failed calendar removal after deletion without recreating tasks", async () => {
    await seed("tasks", "tasks", [{ ...internal, calendar: {} }]);
    await syncTaskCalendar(internal.id, ORIGIN);
    const changes: TaskChange[] = [{ taskId: internal.id, delete: true }];
    const preview = await previewTaskChanges(changes);
    await seed("tasks", "settings", [{ id: "test-calendar", fail: 503 }]);
    expect((await save(changes, preview)).tasks[0]).toMatchObject({ saved: true, deleted: true, calendar: { status: "failed" } });
    await seed("tasks", "settings", [{ id: "test-calendar", fail: 0 }]);
    const retry = await save(changes, preview);
    expect(retry).toMatchObject({ alreadySaved: true, tasks: [{ deleted: true, calendar: { status: "removed" } }] });
    expect((await event(internal.id)).status).toBe("cancelled");
    expect(await readFields("tasks", `tasks/${internal.id}`)).toBeNull();
  });

  it("refuses calendar edits before any write when calendar writes are disabled, including retries", async () => {
    const changes: TaskChange[] = [{ taskId: internal.id, set: { calendar: {} } }];
    const preview = await previewTaskChanges(changes);
    await save(changes, preview);
    vi.stubEnv("CALENDAR_FAKE", "0");
    const before = await snapshot();
    await expect(save(changes, preview)).rejects.toThrow("calendar isn't connected");
    expect(await snapshot()).toEqual(before);
  });
});
