import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { terminate } from "firebase/firestore";
import { POST } from "../app/api/calendar/sync/route";
import { clearAll, EMULATOR_HOST, readFields, seed } from "../tests/support/emulator";
import { addTaskKeptInStep, saveTaskKeptInStep, saveTaskWithUndo } from "./companyWrites";
import { USE_EMULATOR } from "./emulator";
import { db } from "./firebase";
import { clientsDb } from "./firebaseClients";
import { calendarEventId } from "./taskCalendar";
import { addTask, deleteTask } from "./taskWrites";
import type { Task } from "./types";

vi.mock("googleapis", () => { throw new Error("Data tests must never load Google clients."); });

const ORIGIN = "https://tasks.example.test";
const nativeFetch = globalThis.fetch;
const pending: Promise<Response>[] = [];
const task: Task = {
  id: "app-calendar-task", task: "Meeting", responsible: [], informed: [], keyPoints: "Notes", order: 1,
  startDate: "2026-11-12", endDate: "2026-11-13", calendar: {},
};
const sync = async () => {
  const replies = await Promise.all(pending.splice(0));
  for (const reply of replies) expect(reply.ok).toBe(true);
};
async function event(id: string) {
  const stored = await readFields("tasks", `testCalendarEvents/${await calendarEventId(id)}`);
  return stored ? JSON.parse(stored.event as string) : null;
}

beforeEach(async () => {
  if (!USE_EMULATOR || EMULATOR_HOST !== "127.0.0.1:8180") throw new Error("The local Firestore emulator is required.");
  vi.stubEnv("CALENDAR_FAKE", "1");
  vi.stubEnv("GOOGLE_EVENTS_CALENDAR_ID", "test-calendar");
  await clearAll();
  vi.stubGlobal("fetch", vi.fn((input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    if (input !== "/api/calendar/sync") return nativeFetch(input, init);
    const reply = POST(new Request(`${ORIGIN}${input}`, init));
    pending.push(reply);
    return reply;
  }));
});
afterEach(async () => {
  try { await Promise.all(pending.splice(0)); }
  finally { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); }
});
afterAll(async () => { await Promise.all([terminate(db), terminate(clientsDb)]); });

describe("app writes through the sync route to the emulator calendar", () => {
  it("creates, edits, undoes and deletes a marked task without a manual sync call", async () => {
    const id = await addTask(task);
    await sync();
    expect(await event(id)).toMatchObject({ summary: "Meeting", status: "confirmed" });
    const { undo } = await saveTaskWithUndo({ ...task, id }, {
      task: "Moved meeting", startDate: "2026-12-01", endDate: "2026-12-01",
      calendar: { startTime: "14:00", endTime: "15:00" },
    }, new Map());
    await sync();
    expect(await event(id)).toMatchObject({ summary: "Moved meeting", start: { dateTime: "2026-12-01T14:00:00" } });
    await undo();
    await sync();
    expect(await event(id)).toMatchObject({ summary: "Meeting", start: { date: task.startDate } });
    await deleteTask({ ...task, id });
    await sync();
    expect(await event(id)).toMatchObject({ status: "cancelled" });
    expect(await readFields("tasks", `tasks/${id}`)).toBeNull();
  }, 20_000); // A cold emulator connection plus four complete task/calendar round trips.

  it("keeps the marked subtask's event when its unmarked parent is deleted, removing parent context", async () => {
    const parent = { ...task, id: "parent", task: "Main task", calendar: undefined };
    const child = { ...task, parentId: parent.id };
    await seed("tasks", "tasks", [parent, child]);
    await saveTaskKeptInStep(child, { keyPoints: "Changed notes" }, new Map());
    await sync();
    expect((await event(child.id)).description).toContain("Main task: Main task");
    await deleteTask(parent, [child]);
    await sync();
    expect(await event(child.id)).toMatchObject({ status: "confirmed" });
    expect((await event(child.id)).description).not.toContain("Main task:");
    expect(await readFields("tasks", `tasks/${child.id}`)).not.toHaveProperty("parentId");
  });

  it("rolls a failed company edit back and resyncs the restored calendar mark", async () => {
    const linked = { ...task, linkedClientId: 7 };
    const id = await addTask(linked);
    await sync();
    const company = { id: 7, company: "Missing company", target: task.endDate };
    await expect(saveTaskKeptInStep({ ...linked, id }, { endDate: "2026-12-01", calendar: undefined },
      new Map([[7, company]]))).rejects.toMatchObject({ code: "not-found" });
    await sync();
    expect(await readFields("tasks", `tasks/${id}`)).toMatchObject({ calendar: {}, endDate: task.endDate });
    expect(await event(id)).toMatchObject({ status: "confirmed", end: { date: "2026-11-14" } });
  });

  it("rolls back a new company task and cancels any event made while its company write failed", async () => {
    const company = { id: 7, company: "Missing company", target: "2026-10-01" };
    await expect(addTaskKeptInStep({ ...task, linkedClientId: 7 }, new Map([[7, company]]))).rejects.toMatchObject({ code: "not-found" });
    await sync();
    const calls = vi.mocked(globalThis.fetch).mock.calls.filter(([input]) => input === "/api/calendar/sync")
      .flatMap(([, init]) => JSON.parse(init!.body as string).taskIds as string[]);
    expect(calls).toHaveLength(2);
    expect(calls[0]).toBe(calls[1]);
    expect((await event(calls[0]))?.status).not.toBe("confirmed");
    expect(await readFields("tasks", `tasks/${calls[0]}`)).toBeNull();
  });
});
