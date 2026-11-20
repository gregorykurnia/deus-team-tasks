import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDocsFromServer, terminate } from "firebase/firestore";
import { deleteApp } from "firebase-admin/app";
import { TASK_PLAN_INTERNAL_PARENT } from "../tests/fixtures/taskPlan";
import { clearAll, EMULATOR_HOST, readAll, readFields, seed } from "../tests/support/emulator";
import { adminApp, adminDataApp, adminDb } from "./admin";
import { USE_EMULATOR } from "./emulator";
import { db } from "./firebase";
import { clientsDb } from "./firebaseClients";
import { applyTaskChanges, previewTaskChanges } from "./taskEditServer";
import { changeTaskGroup, listTaskGroups } from "./taskGroupServer";
import type { Task } from "./types";
import { taskGroupsQuery, toTaskGroup } from "./useTaskGroups";

const group = { id: "first", name: "Partners", order: 1, starred: false };
const duplicate = { ...group, id: "second", order: 2 };
const main: Task = { ...TASK_PLAN_INTERNAL_PARENT, id: "main", taskGroup: group.name, linkedClientId: 42, calendar: {} };
const done: Task = { ...main, id: "done", parentId: main.id, completed: true, calendar: undefined };
const rename = { action: "rename", name: group.name, newName: "Allies", taskCount: 2 } as const;
const remove = { action: "delete", name: group.name, taskCount: 2 } as const;

beforeEach(async () => {
  if (!USE_EMULATOR || EMULATOR_HOST !== "127.0.0.1:8180" || adminDataApp.options.projectId !== db.app.options.projectId) {
    throw new Error("Group tests require the local shared tasks emulator.");
  }
  vi.stubEnv("NEXT_PUBLIC_SIGN_IN_ENABLED", "1");
  vi.stubEnv("GOOGLE_EVENTS_CALENDAR_ID", "test-calendar");
  vi.stubEnv("CALENDAR_FAKE", "1");
  await clearAll();
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
afterAll(async () => {
  await Promise.all([terminate(db), terminate(clientsDb), deleteApp(adminApp), deleteApp(adminDataApp)]);
});

const rows = () => readAll("tasks", "tasks");
const records = () => readAll("tasks", "taskGroups");
const appGroups = async () => (await getDocsFromServer(taskGroupsQuery())).docs.map(toTaskGroup);

async function seedPartners() {
  await seed("tasks", "taskGroups", [group, duplicate]);
  await seed("tasks", "tasks", [main, done]);
}

describe("G1 task group transactions", () => {
  it("creates the app's record, trims the name and refuses case-insensitive duplicates", async () => {
    const created = await changeTaskGroup({ action: "create", name: " Partners " });
    expect(created).toMatchObject({ created: true, id: expect.any(String), name: "Partners", starred: false });
    const snapshot = await getDocsFromServer(taskGroupsQuery());
    expect(snapshot.docs.map(toTaskGroup)).toEqual([{ id: created.id, name: "Partners", starred: false }]);
    expect(snapshot.docs[0].data()).toEqual({ name: "Partners", order: expect.any(Number), starred: false });
    await expect(changeTaskGroup({ action: "create", name: "partners", starred: true })).rejects.toThrow("A group with that name already exists.");
    expect(await records()).toHaveLength(1);
  }, 20_000);

  it("lists important groups first in creation order and counts open, parked and done members", async () => {
    const starred = await changeTaskGroup({ action: "create", name: "Events", starred: true });
    await seed("tasks", "taskGroups", [group, duplicate, { id: "third", name: "Zebra", order: 3 }]);
    await seed("tasks", "tasks", [main, done, { ...main, id: "parked", parkedAt: 10 }]);
    expect((await listTaskGroups()).groups).toEqual([
      { id: starred.id, name: "Events", starred: true, openTasks: 0, taskCount: 0 },
      { id: group.id, name: group.name, starred: false, openTasks: 1, taskCount: 3 },
      { id: "third", name: "Zebra", starred: false, openTasks: 0, taskCount: 0 },
    ]);
    await seed("tasks", "taskGroups", [{ ...duplicate, starred: true }]);
    expect((await listTaskGroups()).groups[0]).toMatchObject({ id: group.id, name: group.name, starred: true });
    await changeTaskGroup({ action: "star", name: "partners" });
    expect((await records()).filter((record) => record.name === group.name).map((record) => record.starred)).toEqual([true, true]);
    expect((await listTaskGroups()).groups[0]).toMatchObject({ name: group.name, starred: true });
    await changeTaskGroup({ action: "unstar", name: "PARTNERS" });
    expect((await records()).filter((record) => record.name === group.name).map((record) => record.starred)).toEqual([false, false]);
  });

  it("renames and deletes every member and duplicate record, keeps company and dates, and leaves calendar and push alone", async () => {
    await seedPartners();
    const before = await rows();
    await expect(changeTaskGroup(rename)).resolves.toMatchObject({ renamed: true, tasksMoved: 2 });
    expect(await records()).toEqual([group, duplicate].map((record) => ({ ...record, name: "Allies" })));
    expect(await appGroups()).toEqual([group, duplicate].map(({ id }) => ({ id, name: "Allies", starred: false })));
    expect(await rows()).toEqual(before.map((task) => ({ ...task, taskGroup: "Allies" })));
    expect(await readAll("tasks", "testCalendarEvents")).toEqual([]);
    expect(await readAll("tasks", "_fakePush")).toEqual([]);

    const request = { ...remove, name: "Allies" };
    await expect(changeTaskGroup(request)).resolves.toMatchObject({ deleted: true, tasksUngrouped: 2 });
    expect(await records()).toEqual([]);
    expect(await appGroups()).toEqual([]);
    expect(await rows()).toEqual(before.map((task) => Object.fromEntries(Object.entries(task).filter(([key]) => key !== "taskGroup"))));
    expect(await readAll("tasks", "testCalendarEvents")).toEqual([]);
    expect(await readAll("tasks", "_fakePush")).toEqual([]);
    await expect(changeTaskGroup(request)).resolves.toEqual({ alreadyDone: true });
  });

  it("makes a previously shown task edit stale after the group name moves", async () => {
    await seedPartners();
    const changes = [{ taskId: main.id, set: { task: "New title" } }];
    const preview = await previewTaskChanges(changes);
    expect(preview.canWrite).toBe(true);
    await changeTaskGroup(rename);
    await expect(applyTaskChanges(changes, { [main.id]: preview.tasks[0].seen }, [], "https://tasks.example.test"))
      .rejects.toThrow(/changed since the preview/);
    expect(await readFields("tasks", `tasks/${main.id}`)).toMatchObject({ task: main.task, taskGroup: "Allies" });
  });

  it.each([rename, remove])("refuses a stale $action after a task arrives and preserves every document", async (request) => {
    await seedPartners();
    const taskCount = (await listTaskGroups()).groups[0].taskCount;
    await seed("tasks", "tasks", [{ ...main, id: "arrived" }]);
    const before = await rows();
    await expect(changeTaskGroup({ ...request, taskCount })).rejects.toThrow(/task count .* changed from 2 to 3/);
    expect(await rows()).toEqual(before);
    expect(await records()).toEqual([group, duplicate]);
  });

  it("discards all staged writes when the transaction fails, then supports retry after an unconfirmed commit", async () => {
    await seedPartners();
    const before = await rows();
    const runTransaction = adminDb.runTransaction.bind(adminDb);
    const run = vi.spyOn(adminDb, "runTransaction");
    run.mockImplementationOnce((work) => runTransaction(async (transaction) => {
      expect(await work(transaction)).toMatchObject({ renamed: true, tasksMoved: 2 });
      throw new Error("Forced failure before commit");
    }));
    await expect(changeTaskGroup(rename)).rejects.toThrow("Forced failure before commit");
    expect(await rows()).toEqual(before);
    expect(await records()).toEqual([group, duplicate]);

    run.mockImplementationOnce(async (work) => {
      await runTransaction(work);
      throw new Error("Lost reply after commit");
    });
    await expect(changeTaskGroup(rename)).rejects.toThrow("Lost reply after commit");
    const committed = await rows();
    expect(committed).toEqual(before.map((task) => ({ ...task, taskGroup: "Allies" })));
    await expect(changeTaskGroup(rename)).resolves.toEqual({ alreadyDone: true });
    expect(await rows()).toEqual(committed);
    await changeTaskGroup({ ...rename, name: "Allies", newName: "Operations" });
    await expect(changeTaskGroup(rename)).rejects.toThrow(/could not be found/);
    expect(await rows()).toEqual(before.map((task) => ({ ...task, taskGroup: "Operations" })));
  });

  it("resolves stored spelling, allows a case-only rename and refuses other groups including task-only names", async () => {
    await seed("tasks", "taskGroups", [{ ...group, name: "ops" }, { ...duplicate, name: "ops" }]);
    await seed("tasks", "tasks", [{ ...main, taskGroup: "ops" }, { ...done, taskGroup: "Existing" }]);
    const request = { ...rename, name: "ops", taskCount: 1 };
    await expect(changeTaskGroup({ ...request, newName: "eXISTING" })).rejects.toThrow("A group with that name already exists.");
    await expect(changeTaskGroup({ action: "create", name: "existing" })).rejects.toThrow("A group with that name already exists.");
    expect(await records()).toEqual([{ ...group, name: "ops" }, { ...duplicate, name: "ops" }]);
    expect(await readFields("tasks", `tasks/${main.id}`)).toMatchObject({ taskGroup: "ops" });
    const caseRename = { ...request, newName: "Ops" };
    await expect(changeTaskGroup(caseRename)).resolves.toMatchObject({ renamed: true, name: "Ops", tasksMoved: 1 });
    await expect(changeTaskGroup(caseRename)).resolves.toEqual({ alreadyDone: true });
    expect(await records()).toEqual([{ ...group, name: "Ops" }, { ...duplicate, name: "Ops" }]);
    expect(await readFields("tasks", `tasks/${main.id}`)).toMatchObject({ taskGroup: "Ops" });
  });

  it("asks for the exact spelling if legacy names differ only by case", async () => {
    await seed("tasks", "taskGroups", [{ ...group, name: "OPS" }, { ...duplicate, name: "Ops" }]);
    await expect(changeTaskGroup({ action: "star", name: "ops" })).rejects.toThrow(/Use the stored spelling/);
    await changeTaskGroup({ action: "star", name: "OPS" });
    expect((await listTaskGroups()).groups).toMatchObject([{ name: "OPS", starred: true }, { name: "Ops", starred: false }]);
  });

  it("handles task-only groups, missing and blank group fields, and a long name", async () => {
    const long = "夥".repeat(700);
    await seed("tasks", "taskGroups", [{ id: "blank", name: " ", order: 1 }, { id: "missing", order: 2 }]);
    await seed("tasks", "tasks", [main, { ...done, taskGroup: " " }, { ...main, id: "ungrouped", taskGroup: undefined }]);
    expect((await listTaskGroups()).groups).toEqual([{ id: null, name: group.name, starred: false, openTasks: 1, taskCount: 1 }]);
    await expect(changeTaskGroup({ action: "create", name: " \t " })).rejects.toThrow("Enter a name.");
    await expect(changeTaskGroup({ ...rename, name: "partners", newName: long, taskCount: 1 })).resolves.toMatchObject({ tasksMoved: 1 });
    expect((await listTaskGroups()).groups).toEqual([{ id: null, name: long, starred: false, openTasks: 1, taskCount: 1 }]);
    await changeTaskGroup({ action: "star", name: long });
    const starred = (await listTaskGroups()).groups[0];
    expect(starred).toMatchObject({ id: expect.any(String), name: long, starred: true, taskCount: 1 });
    expect(await readFields("tasks", `tasks/${main.id}`)).toMatchObject({ taskGroup: long });
    expect(await readFields("tasks", `tasks/${done.id}`)).toMatchObject({ taskGroup: " " });
  });

  it("refuses 401 members and can rename exactly 400 atomically", async () => {
    await seed("tasks", "taskGroups", [group]);
    await seed("tasks", "tasks", Array.from({ length: 401 }, (_, index) => ({ ...main, id: `member-${index}` })));
    for (const request of [rename, remove]) {
      await expect(changeTaskGroup({ ...request, taskCount: 401 })).rejects.toThrow("Rename or delete this group in the app.");
    }
    expect((await listTaskGroups()).groups).toEqual([{ id: group.id, name: group.name, starred: false, openTasks: 401, taskCount: 401 }]);
    await adminDb.doc("tasks/member-400").delete();
    await expect(changeTaskGroup({ ...rename, taskCount: 400 })).resolves.toMatchObject({ tasksMoved: 400 });
    expect((await listTaskGroups()).groups).toMatchObject([{ name: "Allies", taskCount: 400 }]);
  }, 20_000);

  it("serializes concurrent creates of the same name and concurrent renames of the same group", async () => {
    const creates = await Promise.allSettled([
      changeTaskGroup({ action: "create", name: "Partners" }),
      changeTaskGroup({ action: "create", name: "partners" }),
    ]);
    expect(creates.map(({ status }) => status).sort()).toEqual(["fulfilled", "rejected"]);
    expect(creates.find((outcome) => outcome.status === "rejected")?.reason).toMatchObject({ message: "A group with that name already exists." });
    expect(await records()).toHaveLength(1);
    const name = creates.find((outcome) => outcome.status === "fulfilled")?.value.name;
    if (!name) throw new Error("Expected one created group.");
    await seed("tasks", "tasks", [main, done].map((task) => ({ ...task, taskGroup: name })));

    const renames = await Promise.allSettled([changeTaskGroup(rename), changeTaskGroup({ ...rename, newName: "Other name" })]);
    expect(renames.map(({ status }) => status).sort()).toEqual(["fulfilled", "rejected"]);
    expect(renames.find((outcome) => outcome.status === "rejected")?.reason).toMatchObject({ message: expect.stringContaining("could not be found") });
    const [current] = await records();
    expect((await listTaskGroups()).groups).toMatchObject([{ name: current.name, openTasks: 1, taskCount: 2 }]);
    expect((await rows()).map((task) => task.taskGroup)).toEqual([current.name, current.name]);
  }, 25_000);
});
