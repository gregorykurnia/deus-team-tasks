import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PipelineEntry } from "@/lib/clientTypes";
import type { NewTask, Task } from "@/lib/types";

const io = vi.hoisted(() => ({
  fetch: vi.fn(), add: vi.fn(), update: vi.fn(), remove: vi.fn(), commit: vi.fn(), online: vi.fn(),
}));
vi.mock("@/lib/firebase", () => ({ db: "tasks-db" }));
vi.mock("@/lib/firebaseClients", () => ({ clientsDb: "clients-db" }));
vi.mock("@/lib/connection", () => ({ assertOnline: io.online }));
const own = vi.hoisted(() => vi.fn());
vi.mock("@/lib/liveChanges", () => ({ expectOwnWrite: own }));
vi.mock("firebase/firestore", () => ({
  doc: (db: string, collection: string, id: string) => ({ db, collection, id }),
  collection: (db: string, name: string) => ({ db, name }),
  deleteField: () => "DELETE_FIELD",
  addDoc: io.add,
  updateDoc: io.update,
  deleteDoc: io.remove,
  writeBatch: (db: string) => ({
    update: vi.fn(), delete: vi.fn(),
    commit: () => io.commit(db),
  }),
  runTransaction: async (_db: unknown, action: (tx: unknown) => Promise<unknown>) => action({
    get: async () => ({ data: () => ({ next: 10 }) }), set: vi.fn(),
  }),
}));

import { requestCalendarSync } from "@/lib/calendarRequests";
import {
  addTask, deleteTask, deleteTasks, moveTasksToGroup, PartlyChanged, setTasksDone, setTasksParked, updateTask,
} from "@/lib/taskWrites";
import {
  addTaskKeptInStep, deleteCompany, moveCompany, parkCompanies, saveTaskKeptInStep, saveTaskWithUndo,
} from "@/lib/companyWrites";

const task = (id = "marked", fields: Partial<NewTask> = {}): Task => ({
  id, task: "Meeting", responsible: [], informed: [], keyPoints: "Notes", order: 1,
  startDate: "2026-11-12", endDate: "2026-11-13", calendar: {}, ...fields,
});
const company: PipelineEntry = { id: 7, company: "Test company", date: "2026-11-01", target: "2026-11-15" };
const companies = new Map([[company.id, company]]);
const requests = () => io.fetch.mock.calls.map(([url, init]) => {
  expect(url).toBe("/api/calendar/sync");
  expect(init).toMatchObject({ method: "POST", headers: { "Content-Type": "application/json" } });
  return JSON.parse(init.body).taskIds as string[];
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("fetch", io.fetch);
  io.fetch.mockResolvedValue({ ok: true });
  io.add.mockResolvedValue({ id: "created" });
  io.update.mockResolvedValue(undefined);
  io.remove.mockResolvedValue(undefined);
  io.commit.mockResolvedValue(undefined);
});
afterEach(() => { vi.unstubAllGlobals(); });

describe("nonblocking calendar requests", () => {
  it("deduplicates IDs, skips empty lists and sends at most 50 IDs per request", () => {
    requestCalendarSync([]);
    expect(requests()).toEqual([]);
    const ids = Array.from({ length: 120 }, (_, i) => `t${i}`);
    requestCalendarSync([...ids, ...ids]);
    expect(requests()).toEqual([ids.slice(0, 50), ids.slice(50, 100), ids.slice(100)]);
  });

  it("counts the server's calendarSync write as this device's own change, not a colleague's (R1)", () => {
    requestCalendarSync(["a", "b", "a"]);
    expect(own.mock.calls).toEqual([["tasks", "a"], ["tasks", "b"]]);
  });

  it("asks the browser to finish the request if the page closes right after a delete (R1)", () => {
    requestCalendarSync(["a"]);
    requestCalendarSync([`${"x".repeat(1500)}`, ...Array.from({ length: 49 }, (_, i) => `${i}${"y".repeat(1400)}`)]);
    expect(io.fetch.mock.calls.map(([, init]) => init.keepalive)).toEqual([true, false]); // over the 64 KB keepalive limit
  });

  it("keeps sending the other chunks after a synchronous throw or rejected fetch", async () => {
    io.fetch.mockImplementationOnce(() => { throw new Error("offline"); }).mockRejectedValueOnce(new Error("offline"));
    const ids = Array.from({ length: 120 }, (_, i) => `t${i}`);
    expect(() => requestCalendarSync(ids)).not.toThrow();
    await Promise.resolve();
    expect(requests().flat()).toEqual(ids);
  });

  it.each(["pending", "http-error", "rejected", "throw"])("a %s request never fails or holds up a saved task", async (mode) => {
    if (mode === "pending") io.fetch.mockImplementation(() => new Promise(() => {}));
    if (mode === "http-error") io.fetch.mockResolvedValue({ ok: false, status: 503 });
    if (mode === "rejected") io.fetch.mockRejectedValue(new Error("offline"));
    if (mode === "throw") io.fetch.mockImplementation(() => { throw new Error("offline"); });
    await expect(addTask(task())).resolves.toBe("created");
    await expect(updateTask("marked", { task: "New name" }, task())).resolves.toBeUndefined();
    const { undo } = await saveTaskWithUndo(task(), { endDate: "2026-12-01" }, companies);
    await expect(undo()).resolves.toBeUndefined();
    await expect(deleteTask(task())).resolves.toBeUndefined();
    expect(requests()).toEqual([["created"], ["marked"], ["marked"], ["marked"], ["marked"]]);
  });
});

describe("calendar sync after task writes", () => {
  it("creates marked tasks through both entry points; plain tasks never send a request", async () => {
    await addTask(task());
    await addTaskKeptInStep(task("company-task", { linkedClientId: 7 }), companies);
    await addTask(task("plain", { calendar: undefined }));
    await addTaskKeptInStep(task("plain-company", { calendar: undefined, linkedClientId: 7 }), companies);
    expect(requests()).toEqual([["created"], ["created"]]);
  });

  it("only requests sync after the database acknowledges a write", async () => {
    let acknowledge!: () => void;
    io.update.mockReturnValueOnce(new Promise<void>((resolve) => { acknowledge = resolve; }));
    const saving = updateTask("marked", { startDate: "2026-11-10" }, task());
    expect(requests()).toEqual([]);
    acknowledge();
    await saving;
    expect(requests()).toEqual([["marked"]]);
  });

  it.each([
    { task: "Renamed" }, { startDate: "2026-11-10" }, { endDate: "2026-11-20" },
    { keyPoints: "New notes" }, { parentId: "main" }, { linkedClientId: 7 },
    { calendar: { startTime: "14:00", endTime: "15:00" } }, { calendar: undefined },
  ])("edits marked event content: %j", async (patch) => {
    await updateTask("marked", patch, task());
    expect(requests()).toEqual([["marked"]]);
  });

  it("marks an existing task through updateTask even when no current snapshot is supplied", async () => {
    await updateTask("plain", { calendar: {} });
    expect(requests()).toEqual([["plain"]]);
  });

  it("saves and undoes edits, including switching the mark on or off", async () => {
    for (const [before, patch] of [
      [task(), { task: "New name" }],
      [task(), { calendar: undefined }],
      [task("plain", { calendar: undefined }), { calendar: {} }],
    ] as [Task, Partial<NewTask>][]) {
      const { undo } = await saveTaskWithUndo(before, patch, companies);
      await undo();
    }
    expect(requests()).toEqual([["marked"], ["marked"], ["marked"], ["marked"], ["plain"], ["plain"]]);
  });

  it("a failed company write syncs both the saved task and its rollback", async () => {
    const before = task("company-task", { linkedClientId: 7 });
    io.update.mockRejectedValueOnce(new Error("company write failed"));
    await expect(saveTaskKeptInStep(before, { endDate: "2026-12-01", calendar: undefined }, companies)).rejects.toThrow("company write failed");
    expect(io.commit).toHaveBeenCalledTimes(2);
    expect(requests()).toEqual([[before.id], [before.id]]);
  });

  it("a failed company write removes the new task and syncs that rollback deletion", async () => {
    io.update.mockRejectedValueOnce(new Error("company write failed"));
    await expect(addTaskKeptInStep(task("new", { linkedClientId: 7 }), companies)).rejects.toThrow("company write failed");
    expect(io.remove).toHaveBeenCalledTimes(1);
    expect(requests()).toEqual([["created"], ["created"]]);
  });

  it("still attempts creation cleanup when the company write fails after going offline", async () => {
    io.update.mockImplementationOnce(async () => {
      io.online.mockImplementation(() => { throw new Error("offline"); });
      throw new Error("company write failed");
    });
    await expect(addTaskKeptInStep(task("new", { linkedClientId: 7 }), companies)).rejects.toThrow("company write failed");
    expect(io.remove).toHaveBeenCalledWith({ db: "tasks-db", collection: "tasks", id: "created" });
    expect(requests()).toEqual([["created"], ["created"]]);
  });

  it("deletes a marked task and syncs marked subtasks freed by an unmarked parent", async () => {
    await deleteTask(task());
    await deleteTask(task("parent", { calendar: undefined }), [
      task("child", { parentId: "parent" }), task("plain-child", { parentId: "parent", calendar: undefined }),
    ]);
    expect(requests()).toEqual([["marked"], ["child"]]);
  });

  it("bulk-deletes 120 marked tasks in exactly three requests", async () => {
    const tasks = Array.from({ length: 120 }, (_, i) => task(`t${i}`));
    await deleteTasks(tasks);
    expect(requests().map((ids) => ids.length)).toEqual([50, 50, 20]);
    expect(requests().flat()).toEqual(tasks.map((t) => t.id));
  });

  it("syncs bulk deletes and freed marked subtasks once, leaving out skipped tasks", async () => {
    const parent = task("parent", { calendar: undefined });
    await deleteTasks([parent, task("deleted"), task("skipped"), task("plain", { calendar: undefined })],
      (id) => id !== "skipped", [task("child", { parentId: parent.id })]);
    expect(requests()).toEqual([["deleted", "child"]]);
  });

  it("syncs the saved portion of a partial delete, including a subtask whose unlink failed", async () => {
    const tasks = Array.from({ length: 451 }, (_, i) => task(`t${i}`));
    io.commit.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("second batch failed"));
    await expect(deleteTasks(tasks, undefined, [task("child", { parentId: "t0" })])).rejects.toBeInstanceOf(PartlyChanged);
    expect(requests().flat()).toEqual([...tasks.slice(0, 450).map((t) => t.id), "child"]);
  });

  it("a company deletion syncs tasks losing their company, and its rollback syncs them again", async () => {
    const own = task("own", { linkedClientId: 7 });
    io.commit.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("company delete failed"));
    await expect(deleteCompany(company, [own], [])).rejects.toThrow("company delete failed");
    expect(requests()).toEqual([[own.id], [own.id]]);
  });

  it("partial company unlinking syncs only the tasks actually saved", async () => {
    const tasks = Array.from({ length: 451 }, (_, i) => task(`t${i}`, { linkedClientId: 7 }));
    io.commit.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("second batch failed"));
    await expect(deleteCompany(company, tasks, [])).rejects.toBeInstanceOf(PartlyChanged);
    expect(requests().flat()).toEqual(tasks.slice(0, 450).map((t) => t.id));
  });

  it("failed database writes never request a sync", async () => {
    io.add.mockRejectedValueOnce(new Error("write failed"));
    await expect(addTask(task())).rejects.toThrow("write failed");
    io.update.mockRejectedValueOnce(new Error("write failed"));
    await expect(updateTask("marked", { task: "New" }, task())).rejects.toThrow("write failed");
    io.commit.mockRejectedValueOnce(new Error("write failed"));
    await expect(saveTaskKeptInStep(task(), { task: "New" }, companies)).rejects.toThrow("write failed");
    io.commit.mockRejectedValueOnce(new Error("write failed"));
    await expect(deleteTask(task())).rejects.toThrow("write failed");
    expect(requests()).toEqual([]);
  });

  it("unmarked edits, Undo, rollback and deletes never request a sync", async () => {
    const plain = task("plain", { calendar: undefined });
    await updateTask(plain.id, { task: "New name" }, plain);
    const { undo } = await saveTaskWithUndo(plain, { startDate: "2026-11-01" }, companies);
    await undo();
    io.update.mockRejectedValueOnce(new Error("company write failed"));
    await expect(saveTaskKeptInStep({ ...plain, linkedClientId: 7 }, { endDate: "2026-12-01" }, companies)).rejects.toThrow("company write failed");
    await deleteTask(plain);
    await deleteTasks([plain]);
    expect(requests()).toEqual([]);
  });

  it("done, parking, group moves and their Undo leave marked events alone", async () => {
    const marked = task();
    await updateTask(marked.id, { completed: true, startedAt: 3 }, marked);
    await saveTaskKeptInStep(marked, { parkedAt: 3, taskGroup: "Work" }, companies);
    await saveTaskKeptInStep(marked, { calendar: {}, task: marked.task }, companies);
    const { undo: cellUndo } = await saveTaskWithUndo(marked, { priority: "High" }, companies);
    await cellUndo();
    await (await setTasksDone([marked], true))();
    await (await setTasksParked([marked], true))();
    await (await moveTasksToGroup([marked], "Work")).undo();
    await (await parkCompanies([company], null, [{ ...marked, linkedClientId: 7 }])).undo();
    await (await moveCompany(company, "active", {}, [marked])).undo();
    expect(requests()).toEqual([]);
  });
});
