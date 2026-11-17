import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Firestore, WriteBatch } from "firebase/firestore";
import type { Task } from "@/lib/types";
const io = vi.hoisted(() => ({ notify: vi.fn(), add: vi.fn(), update: vi.fn(), commit: vi.fn(), remove: vi.fn(), online: vi.fn() }));
vi.mock("@/lib/assignNotifyRequests", () => ({ requestAssignNotify: io.notify }));
vi.mock("@/lib/firebase", () => ({ db: "tasks-db" }));
vi.mock("@/lib/firebaseClients", () => ({ clientsDb: "clients-db" }));
vi.mock("@/lib/connection", () => ({ assertOnline: io.online }));
vi.mock("@/lib/calendarRequests", () => ({ requestCalendarSync: vi.fn(), taskCalendarChanged: () => false }));
vi.mock("@/lib/calendarContextRequests", () => ({ requestCalendarContextSync: vi.fn() }));
vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, collection: string, id: string) => ({ path: `${collection}/${id}` }),
  collection: (_db: unknown, name: string) => ({ name }), deleteField: () => "DELETE",
  addDoc: io.add, updateDoc: io.update, deleteDoc: io.remove,
  writeBatch: () => {
    const batch = { set: () => batch, update: () => batch, delete: () => batch, commit: io.commit };
    return batch;
  },
}));
import { addTask, updateTask } from "@/lib/taskWrites";
import { addTaskKeptInStep, saveTaskKeptInStep, saveTaskWithUndo } from "@/lib/companyWrites";
import { commitEach, commitInChunks, PartlyCommitted } from "@/lib/batches";
const task: Task = { id: "task", task: "Quote", responsible: ["Audrey"], informed: [], keyPoints: "", startDate: "", endDate: "", order: 1 };
const db = {} as Firestore;
const ref = (path: string) => ({ path }) as Parameters<WriteBatch["set"]>[0];
beforeEach(() => { vi.resetAllMocks(); io.add.mockResolvedValue({ id: "created" }); io.update.mockResolvedValue(undefined); io.commit.mockResolvedValue(undefined); });
afterEach(() => vi.restoreAllMocks());

describe("assignment pings follow confirmed shared writes", () => {
  it("announces add/update only after saving Responsible, including a clear", async () => {
    let finish!: (value: { id: string }) => void;
    io.add.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    const pending = addTask(task); expect(io.notify).not.toHaveBeenCalled(); finish({ id: "created" });
    await pending; expect(io.notify).toHaveBeenCalledWith(["created"]);
    await updateTask("task", { responsible: [] }); expect(io.notify).toHaveBeenLastCalledWith(["task"]);
    io.notify.mockClear(); await updateTask("task", { keyPoints: "new notes" }); expect(io.notify).not.toHaveBeenCalled();
  });
  it("never announces a rejected or offline task write", async () => {
    io.add.mockRejectedValueOnce(new Error("offline")); await expect(addTask(task)).rejects.toThrow("offline");
    io.update.mockRejectedValueOnce(new Error("offline")); await expect(updateTask("task", { responsible: ["Audrey"] })).rejects.toThrow("offline");
    io.online.mockImplementationOnce(() => { throw new Error("offline"); }); await expect(addTask(task)).rejects.toThrow("offline");
    expect(io.notify).not.toHaveBeenCalled();
  });
  it("observes responsible set/update/clear and chained writes in any confirmed task batch", async () => {
    await commitInChunks(db, [
      (b) => b.set(ref("tasks/a"), { responsible: ["Audrey"] }).update(ref("tasks/b"), { responsible: [] }),
      (b) => b.update(ref("tasks/c"), "responsible", []),
      (b) => b.update(ref("tasks/a"), { responsible: "DELETE" }),
      (b) => b.update(ref("tasks/notes"), { keyPoints: "notes" }),
      (b) => b.set(ref("pipeline/company"), { responsible: ["Audrey"] }),
      (b) => b.delete(ref("tasks/deleted")),
    ]);
    expect(io.notify).toHaveBeenCalledExactlyOnceWith(["a", "b", "c"]);
  });
  it("announces only committed chunks on a partial failure, with no ping for a failed first chunk", async () => {
    io.commit.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("offline"));
    const write = (b: WriteBatch, id: string) => b.set(ref(`tasks/${id}`), { responsible: ["Audrey"] });
    await expect(commitEach(db, ["a", "b", "c"], write, undefined, 2)).rejects.toBeInstanceOf(PartlyCommitted);
    expect(io.notify).toHaveBeenCalledExactlyOnceWith(["a", "b"]);
    io.notify.mockClear(); io.commit.mockRejectedValueOnce(new Error("offline"));
    await expect(commitEach(db, ["d"], write)).rejects.toThrow("offline"); expect(io.notify).not.toHaveBeenCalled();
  });
  it("waits for a company side write, then covers direct saves and undo", async () => {
    const company = { id: 7, company: "Company", date: "", target: "" }, companies = new Map([[7, company]]);
    let finish!: () => void; io.update.mockReturnValueOnce(new Promise<void>((resolve) => { finish = resolve; }));
    const pending = saveTaskWithUndo({ ...task, linkedClientId: 7 }, { responsible: ["Gregory"], endDate: "2027-01-01" }, companies);
    await vi.waitFor(() => expect(io.update).toHaveBeenCalledOnce()); expect(io.notify).not.toHaveBeenCalled(); finish();
    const saved = await pending; expect(io.notify).toHaveBeenCalledExactlyOnceWith(["task"]);
    await saved.undo(); expect(io.notify).toHaveBeenCalledTimes(2);
  });
  it("does not announce a new task rolled back after a company failure, and a retry announces only its survivor", async () => {
    const company = { id: 7, company: "Company", date: "", target: "" }, companies = new Map([[7, company]]);
    io.update.mockRejectedValueOnce(new Error("company failed"));
    await expect(addTaskKeptInStep({ ...task, linkedClientId: 7, endDate: "2027-01-01" }, companies)).rejects.toThrow("company failed");
    expect(io.remove).toHaveBeenCalled(); expect(io.notify).not.toHaveBeenCalled();
    io.add.mockResolvedValueOnce({ id: "survivor" });
    await addTaskKeptInStep({ ...task, linkedClientId: 7, endDate: "2027-01-01" }, companies);
    expect(io.notify).toHaveBeenCalledExactlyOnceWith(["survivor"]);
  });
  it("covers new internal tasks and ordinary company-task saves without changing other fields", async () => {
    await addTaskKeptInStep(task, new Map()); expect(io.notify).toHaveBeenCalledWith(["created"]);
    await saveTaskKeptInStep(task, { responsible: [] }, new Map()); expect(io.notify).toHaveBeenLastCalledWith(["task"]);
    io.notify.mockClear(); await saveTaskKeptInStep(task, { keyPoints: "note" }, new Map()); expect(io.notify).not.toHaveBeenCalled();
  });
});
