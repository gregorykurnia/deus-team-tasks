import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deleteDoc, deleteField, doc, getDocFromServer, terminate, updateDoc } from "firebase/firestore";
import type { calendar_v3 } from "googleapis";
import { GET, POST } from "../app/api/calendar/sync/route";
import { clearAll, EMULATOR_HOST, readAll, readFields, seed } from "../tests/support/emulator";
import { getCalendarClient, syncTaskCalendar } from "./calendarSync";
import { USE_EMULATOR } from "./emulator";
import { db } from "./firebase";
import { clientsDb } from "./firebaseClients";
import { calendarEventId, calendarKey, taskEventBody } from "./taskCalendar";
import type { Task } from "./types";

vi.mock("googleapis", () => { throw new Error("Data tests must never load Google clients."); });
vi.mock("./connection", () => { throw new Error("Server sync must not import browser connection state."); });

const ORIGIN = "https://tasks.example.test";
const parent: Task = { id: "calendar-parent", task: "Main task", keyPoints: "Keep", responsible: [], informed: [], startDate: "2027-01-01", endDate: "2027-02-01", order: 1 };
const task: Task = { ...parent, id: "calendar-task", parentId: parent.id, linkedClientId: 7, task: "Calendar step", keyPoints: "Bring notes", startDate: "2026-11-12", endDate: "2026-11-13", calendar: {}, order: 2 };
const company = { id: 7, company: "Test company" };
const taskRef = () => doc(db, "tasks", task.id);
const request = (body: unknown) => new Request(`${ORIGIN}/api/calendar/sync`, { method: "POST", body: JSON.stringify(body) });
const fields = () => readFields("tasks", `tasks/${task.id}`);
async function event(id = task.id): Promise<calendar_v3.Schema$Event | null> {
  const stored = await readFields("tasks", `testCalendarEvents/${await calendarEventId(id)}`);
  return stored ? JSON.parse(stored.event as string) : null;
}
const withoutSync = (data: Record<string, unknown> | null) => {
  const copy = { ...data };
  delete copy.calendarSync;
  return copy;
};

beforeEach(async () => {
  if (!USE_EMULATOR || EMULATOR_HOST !== "127.0.0.1:8180") throw new Error("The local Firestore emulator is required.");
  vi.stubEnv("GOOGLE_EVENTS_CALENDAR_ID", "test-calendar");
  vi.stubEnv("CALENDAR_FAKE", "1");
  await clearAll();
  await seed("tasks", "tasks", [parent, task]);
  await seed("clients", "pipeline", [company], { keepIdField: true });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
afterAll(async () => { await Promise.all([terminate(db), terminate(clientsDb)]); });

describe("server calendar sync with the emulator fake", () => {
  it("creates the exact event and sync state, repeats and concurrent calls keep one event", async () => {
    const before = await fields();
    const result = await syncTaskCalendar(task.id, ORIGIN);
    expect(result).toMatchObject({ taskId: task.id, status: "synced", link: expect.any(String) });
    expect(await event()).toEqual({ ...taskEventBody(task, parent, company, ORIGIN), id: await calendarEventId(task.id), htmlLink: result.link });
    expect(await fields()).toEqual({ ...before, calendarSync: { synced: calendarKey(task, parent, company), link: result.link } });
    expect((await Promise.all(Array.from({ length: 3 }, () => syncTaskCalendar(task.id, ORIGIN)))).every((r) => r.status === "synced")).toBe(true);
    expect(await readAll("tasks", "testCalendarEvents")).toHaveLength(1);
    expect(await readFields("tasks", `tasks/${parent.id}`)).toEqual(Object.fromEntries(Object.entries(parent).filter(([key]) => key !== "id")));
    expect(await readFields("clients", "pipeline/7")).toEqual(company);
  });

  it("moves and renames a timed event, then changes it back to all day", async () => {
    await syncTaskCalendar(task.id, ORIGIN);
    const change = { task: "Moved meeting", startDate: "2026-12-01", endDate: "2026-12-02", calendar: { startTime: "14:00", endTime: "16:30" }, keyPoints: "New notes" };
    await updateDoc(taskRef(), change);
    expect((await syncTaskCalendar(task.id, ORIGIN)).status).toBe("synced");
    expect(await event()).toMatchObject({ summary: change.task, start: { dateTime: "2026-12-01T14:00:00", timeZone: "Asia/Jakarta" }, end: { dateTime: "2026-12-02T16:30:00", timeZone: "Asia/Jakarta" } });
    await updateDoc(taskRef(), { calendar: {} });
    await syncTaskCalendar(task.id, ORIGIN);
    expect(await event()).toMatchObject({ start: { date: "2026-12-01" }, end: { date: "2026-12-03" } });
    expect((await event())!.start).not.toHaveProperty("dateTime");
    expect(await readAll("tasks", "testCalendarEvents")).toHaveLength(1);
  });

  it("switches off, clears sync state, stays off on repeat, and restores the cancelled ID when switched on", async () => {
    await syncTaskCalendar(task.id, ORIGIN);
    await updateDoc(taskRef(), { calendar: deleteField() });
    expect((await syncTaskCalendar(task.id, ORIGIN)).status).toBe("removed");
    expect(await fields()).not.toHaveProperty("calendar");
    expect(await fields()).not.toHaveProperty("calendarSync");
    expect((await event())!.status).toBe("cancelled");
    expect((await syncTaskCalendar(task.id, ORIGIN)).status).toBe("removed");
    expect(await fields()).not.toHaveProperty("calendarSync");
    expect((await event())!.status).toBe("cancelled");
    const client = (await getCalendarClient())!;
    await expect(client.insert(await calendarEventId(task.id), taskEventBody(task, parent, company, ORIGIN))).rejects.toMatchObject({ code: 409 });
    await expect(client.delete(await calendarEventId(task.id))).rejects.toMatchObject({ code: 410 });
    await updateDoc(taskRef(), { calendar: {} });
    expect((await syncTaskCalendar(task.id, ORIGIN)).status).toBe("synced");
    expect((await event())!.status).toBe("confirmed");
    expect(await readAll("tasks", "testCalendarEvents")).toHaveLength(1);
  });

  it("deletes an event for a deleted task and never recreates the task", async () => {
    await syncTaskCalendar(task.id, ORIGIN);
    await deleteDoc(taskRef());
    expect((await syncTaskCalendar(task.id, ORIGIN)).status).toBe("removed");
    expect((await event())!.status).toBe("cancelled");
    expect(await fields()).toBeNull();
    expect((await syncTaskCalendar(task.id, ORIGIN)).status).toBe("removed");
    expect(await fields()).toBeNull();
  });

  it.each([404, 410])("updates again when an update gets %i and an insert finds the ID reserved", async (code) => {
    await syncTaskCalendar(task.id, ORIGIN);
    const client = (await getCalendarClient())!;
    await client.delete(await calendarEventId(task.id));
    const update = vi.spyOn(client, "update").mockRejectedValueOnce({ response: { status: code } });
    const insert = vi.spyOn(client, "insert");
    expect((await syncTaskCalendar(task.id, ORIGIN)).status).toBe("synced");
    expect(update).toHaveBeenCalledTimes(2);
    expect(insert).toHaveBeenCalledTimes(1);
    expect((await event())!.status).toBe("confirmed");
  });

  it("records a short failure without changing task fields, the last synced key or link, and retry repairs it", async () => {
    await syncTaskCalendar(task.id, ORIGIN);
    await updateDoc(taskRef(), { task: "Edited while Google is down" });
    const before = (await fields())!;
    await seed("tasks", "settings", [{ id: "test-calendar", fail: 503 }]);
    const result = await syncTaskCalendar(task.id, ORIGIN);
    expect(result).toEqual({ taskId: task.id, status: "failed", error: "The calendar couldn't be updated. Try again." });
    expect(await fields()).toEqual({ ...before, calendarSync: { ...before.calendarSync as object, error: result.error } });
    expect((await event())!.summary).toBe(task.task);
    await deleteDoc(doc(db, "settings", "test-calendar"));
    expect((await syncTaskCalendar(task.id, ORIGIN)).status).toBe("synced");
    expect((await event())!.summary).toBe("Edited while Google is down");
    expect((await fields())!.calendarSync).not.toHaveProperty("error");
  });

  it("records an initial failure without inventing a synced key, and invalid times never write an event", async () => {
    await updateDoc(taskRef(), { calendar: { startTime: "24:00", endTime: "25:00" } });
    const before = await fields();
    expect((await syncTaskCalendar(task.id, ORIGIN)).status).toBe("failed");
    expect(withoutSync(await fields())).toEqual(withoutSync(before));
    expect((await fields())!.calendarSync).toEqual({ error: "The calendar couldn't be updated. Try again." });
    expect(await readAll("tasks", "testCalendarEvents")).toEqual([]);
  });

  it.each(["edit", "unmark", "delete", "context"])("syncs once more after an in-flight %s, without overwriting the task", async (change) => {
    const client = (await getCalendarClient())!;
    const original = client.insert;
    vi.spyOn(client, "insert").mockImplementationOnce(async (id, body) => {
      const result = await original(id, body);
      if (change === "edit") await updateDoc(taskRef(), { task: "Newest title", calendar: { startTime: "10:00", endTime: "11:00" } });
      if (change === "unmark") await updateDoc(taskRef(), { calendar: deleteField() });
      if (change === "delete") await deleteDoc(taskRef());
      if (change === "context") {
        await updateDoc(doc(db, "tasks", parent.id), { task: "Newest main task" });
        await updateDoc(doc(clientsDb, "pipeline", "7"), { company: "Newest company" });
      }
      return result;
    });
    const result = await syncTaskCalendar(task.id, ORIGIN);
    if (change === "unmark" || change === "delete") {
      expect(result.status).toBe("removed");
      expect((await event())!.status).toBe("cancelled");
      if (change === "delete") expect(await fields()).toBeNull();
      else { expect(await fields()).not.toHaveProperty("calendar"); expect(await fields()).not.toHaveProperty("calendarSync"); }
    } else {
      expect(result.status).toBe("synced");
      if (change === "edit") expect(await event()).toMatchObject({ summary: "Newest title", start: { dateTime: "2026-11-12T10:00:00" } });
      else expect((await event())!.description).toContain("Main task: Newest main task\n\nCompany: Newest company");
      const current = { ...((await getDocFromServer(taskRef())).data()), id: task.id } as Task;
      const main = { ...parent, ...(change === "context" && { task: "Newest main task" }) };
      expect((await fields())!.calendarSync).toMatchObject({ synced: calendarKey(current, main, { ...company, ...(change === "context" && { company: "Newest company" }) }) });
    }
  });

  it("bounds a continuously changing task to two passes and leaves it visibly unsynced", async () => {
    await syncTaskCalendar(task.id, ORIGIN);
    const client = (await getCalendarClient())!;
    const original = client.update;
    let count = 0;
    const update = vi.spyOn(client, "update").mockImplementation(async (id, body) => {
      const result = await original(id, body);
      await updateDoc(taskRef(), { task: `Changed ${++count}` });
      return result;
    });
    expect(await syncTaskCalendar(task.id, ORIGIN)).toMatchObject({ status: "failed", error: "The task changed again while syncing. Try again." });
    expect(update).toHaveBeenCalledTimes(2);
    expect((await fields())!.task).toBe("Changed 2");
    expect((await fields())!.calendarSync).toHaveProperty("error");
  });

  it("leaves a freed subtask's event confirmed and removes its former main-task description", async () => {
    await syncTaskCalendar(task.id, ORIGIN);
    await deleteDoc(doc(db, "tasks", parent.id));
    await updateDoc(taskRef(), { parentId: deleteField() });
    await syncTaskCalendar(task.id, ORIGIN);
    expect((await event())!.status).toBe("confirmed");
    expect((await event())!.description).not.toContain("Main task:");
  });
});

describe("calendar sync route", () => {
  it("reports enabled and accepts task IDs only, returning independent results without leaking errors", async () => {
    expect(await GET().json()).toEqual({ enabled: true });
    await seed("tasks", "tasks", [{ ...task, id: "invalid-times", calendar: { startTime: "bad" } }]);
    const response = await POST(request({ taskIds: ["invalid-times", task.id, "missing"] }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ results: [
      { taskId: "invalid-times", status: "failed", error: "The calendar couldn't be updated. Try again." },
      { taskId: task.id, status: "synced", link: expect.any(String) },
      { taskId: "missing", status: "removed" },
    ] });
    expect((await event())!.description).toContain(`${ORIGIN}/tasks?task=${task.id}`);
  });

  it.each([undefined, ""])("with the activation variable unset (%s), GET is off and POST writes nothing", async (value) => {
    vi.stubEnv("GOOGLE_EVENTS_CALENDAR_ID", value);
    const before = await readAll("tasks", "tasks");
    expect(await GET().json()).toEqual({ enabled: false });
    expect(await (await POST(request({ taskIds: [task.id, "missing"] }))).json()).toEqual({ results: [{ taskId: task.id, status: "off" }, { taskId: "missing", status: "off" }] });
    expect(await readAll("tasks", "tasks")).toEqual(before);
    expect(await readAll("tasks", "testCalendarEvents")).toEqual([]);
  });

  it("emulator mode without the fake reports off and writes nothing", async () => {
    vi.stubEnv("CALENDAR_FAKE", "");
    const before = await fields();
    expect(await GET().json()).toEqual({ enabled: false });
    expect((await syncTaskCalendar(task.id, ORIGIN)).status).toBe("off");
    expect(await fields()).toEqual(before);
    expect(await readAll("tasks", "testCalendarEvents")).toEqual([]);
  });

  it.each([null, [], {}, { taskIds: [] }, { taskIds: [2] }, { taskIds: [""] }, { taskIds: ["a/b"] }, { taskIds: ["."] }, { taskIds: ["__reserved__"] }, { taskIds: ["x".repeat(1501)] }, { taskIds: Array(51).fill("x") }, { taskIds: [task.id], summary: "Untrusted event" }])("rejects invalid input without any writes (%#)", async (body) => {
    const before = await fields();
    const response = await POST(request(body));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Send a JSON object with 1–50 task IDs only." });
    expect(await fields()).toEqual(before);
    expect(await readAll("tasks", "testCalendarEvents")).toEqual([]);
  });

  it("rejects non-JSON input", async () => {
    const response = await POST(new Request(`${ORIGIN}/api/calendar/sync`, { method: "POST", body: "{" }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Send a JSON object with 1–50 task IDs." });
  });

  it("accepts the 50-ID boundary and repeats without creating duplicates", async () => {
    const response = await POST(request({ taskIds: Array(50).fill(task.id) }));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.results).toHaveLength(50);
    expect(body.results.every((result: { status: string }) => result.status === "synced")).toBe(true);
    expect(await readAll("tasks", "testCalendarEvents")).toHaveLength(1);
  });
});
