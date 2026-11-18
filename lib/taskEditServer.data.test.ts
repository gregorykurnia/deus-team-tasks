import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { terminate } from "firebase/firestore";
import { clearAll, EMULATOR_HOST, PROJECTS, readAll, readFields, seed } from "../tests/support/emulator";
import { TASK_PLAN_INTERNAL_PARENT, TASK_PLAN_PROSPECT } from "../tests/fixtures/taskPlan";
import { USE_EMULATOR } from "./emulator";
import { db } from "./firebase";
import { clientsDb } from "./firebaseClients";
import { taskSeen, type TaskChange } from "./taskEdit";
import { applyTaskChanges, findTasks, previewTaskChanges } from "./taskEditServer";
import type { Task } from "./types";

vi.mock("./connection", () => { throw new Error("Server reads must not import browser connection guards."); });
vi.mock("googleapis", () => { throw new Error("Read-only previews must never load Google clients."); });

const now = Date.UTC(2026, 10, 11, 18); // November 12 in Asia/Jakarta.
const ORIGIN = "https://tasks.example.test";
const parent: Task = { ...TASK_PLAN_INTERNAL_PARENT, id: "parent", task: "Fictional launch", linkedClientId: TASK_PLAN_PROSPECT.id };
const child: Task = { ...parent, id: "child", parentId: parent.id, task: "Draft memo", keyPoints: "Needle in notes", startedAt: 10, order: 101 };
const done: Task = { ...child, id: "done", task: "Completed memo", completed: true, completedAt: 20 };
const parked: Task = { ...parent, id: "parked", task: "Waiting memo", parkedAt: 30, parkedUntil: "2026-12-01" };
const internal: Task = { ...TASK_PLAN_INTERNAL_PARENT, id: "internal", task: "Internal memo" };
const flow = { id: "flow", steps: [{ roles: [{ names: ["Flow Only"] }] }], decision: { branches: [{ roles: [{ names: ["Outcome Only"] }] }] } };

beforeEach(async () => {
  if (!USE_EMULATOR || EMULATOR_HOST !== "127.0.0.1:8180") throw new Error("Local Firestore emulator required.");
  await clearAll();
  await seed("tasks", "tasks", [parent, child, done, parked, internal]);
  await seed("clients", "pipeline", [TASK_PLAN_PROSPECT], { keepIdField: true });
  await seed("tasks", "flows", [flow]);
  vi.spyOn(Date, "now").mockReturnValue(now);
  vi.stubEnv("GOOGLE_EVENTS_CALENDAR_ID", "test-calendar");
  vi.stubEnv("CALENDAR_FAKE", "1");
  vi.stubEnv("NEXT_PUBLIC_SIGN_IN_ENABLED", "0");
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
afterAll(async () => { await Promise.all([terminate(db), terminate(clientsDb)]); });

async function snapshot() {
  return Promise.all([
    readAll("tasks", "tasks"), readAll("clients", "pipeline"), readAll("tasks", "flows"), readAll("tasks", "settings"),
  ].map(async (records) => (await records).sort((a, b) => a.id.localeCompare(b.id))));
}

describe("T03 find tasks from the server", () => {
  it("finds case-insensitive names and Key points, combining company and main-task filters", async () => {
    expect((await findTasks({ query: "  MEMO " })).tasks.map((task) => task.id)).toEqual([child.id, internal.id, parked.id]);
    expect((await findTasks({ query: "needle", companyId: TASK_PLAN_PROSPECT.id, parentId: parent.id })).tasks.map((task) => task.id)).toEqual([child.id]);
    expect((await findTasks({ query: "needle", companyId: 0 })).tasks).toEqual([]);
    expect((await findTasks({ parentId: internal.id })).tasks).toEqual([]);
  });

  it("shows current details, parent/company context and subtasks without writing", async () => {
    const before = await snapshot();
    const result = await findTasks({ companyId: TASK_PLAN_PROSPECT.id });
    expect(result.hasMore).toBe(false);
    expect(result.tasks.find((task) => task.id === child.id)).toMatchObject({
      ...child, status: "inProgress", parked: false, calendar: null,
      mainTask: { id: parent.id, task: parent.task }, company: { id: TASK_PLAN_PROSPECT.id, name: TASK_PLAN_PROSPECT.company }, subtasks: [],
    });
    expect(result.tasks.find((task) => task.id === parent.id)?.subtasks.map((task) => task.id)).toEqual([child.id]);
    expect(result.tasks.find((task) => task.id === parked.id)?.parked).toBe(true);
    expect((await findTasks({ query: "Internal" })).tasks[0]).toMatchObject({ mainTask: null, company: null, status: "todo" });
    expect(await snapshot()).toEqual(before);
  });

  it("excludes done rows and subtasks by default and includes them when requested", async () => {
    expect((await findTasks({ parentId: parent.id })).tasks.map((task) => task.id)).toEqual([child.id]);
    expect((await findTasks({ parentId: parent.id, includeDone: true })).tasks.map((task) => task.id)).toEqual([done.id, child.id]);
    const result = await findTasks({ query: "launch", includeDone: true });
    expect(result.tasks[0].subtasks.map((task) => task.id)).toEqual([child.id, done.id]);
    expect(result.tasks[0].subtasks[1].status).toBe("done");
  });

  it("limits filtered matches to ten and sets hasMore only when another match exists", async () => {
    await seed("tasks", "tasks", Array.from({ length: 11 }, (_, i) => ({ ...internal, id: `many-${i}`, task: `Many ${String(i).padStart(2, "0")}` })));
    const result = await findTasks({ query: "Many" });
    expect(result.tasks).toHaveLength(10);
    expect(result.tasks[0].task).toBe("Many 00");
    expect(result.hasMore).toBe(true);
    expect((await findTasks({ query: "Many 00" })).hasMore).toBe(false);
    expect((await findTasks({ query: "Not present" }))).toEqual({ tasks: [], hasMore: false, total: 0 });
  });

  it("reads fresh server fields, calendar marks and numeric fallback company IDs", async () => {
    await seed("tasks", "tasks", [{ ...child, task: "Fresh memo", calendar: { startTime: "14:00", endTime: "15:00" } }]);
    await seed("clients", "pipeline", [{ id: 0, company: "Fallback company" }]);
    await seed("tasks", "tasks", [{ ...internal, linkedClientId: 0 }]);
    expect((await findTasks({ parentId: parent.id })).tasks[0]).toMatchObject({ task: "Fresh memo", calendar: { startTime: "14:00", endTime: "15:00" } });
    expect((await findTasks({ companyId: 0 })).tasks[0].company).toEqual({ id: 0, name: "Fallback company" });
  });
});

describe("M1 bulk Responsible from the server", () => {
  it("pages 23 open company matches in stable name and ID order without counting nested details", async () => {
    const companyId = TASK_PLAN_PROSPECT.id + 1;
    const mains = Array.from({ length: 20 }, (_, i) => ({ ...parent, linkedClientId: companyId,
      id: `main-${String(i).padStart(2, "0")}`, task: "Same name", ...(i === 11 ? { parkedAt: 30 } : {}) }));
    const children = Array.from({ length: 3 }, (_, i) => ({ ...mains[0], id: `sub-${i}`, parentId: mains[0].id, task: "First in name order" }));
    await seed("tasks", "tasks", [...mains, ...children, { ...mains[0], id: "finished", completed: true },
      { ...parent, id: "other-company", task: mains[0].task }]);
    const pages = await Promise.all([undefined, 10, 20].map((offset) => findTasks({ companyId, offset })));
    const matches = pages.flatMap((page) => page.tasks);
    expect(pages.map(({ total, tasks, hasMore }) => [total, tasks.length, hasMore])).toEqual([[23, 10, true], [23, 10, true], [23, 3, false]]);
    expect(matches.map((task) => task.id)).toEqual([...children, ...mains].map(({ id }) => id));
    expect(matches.find((task) => task.id === mains[0].id)?.subtasks.map((task) => task.id)).toEqual(children.map(({ id }) => id));
    expect(matches.find((task) => task.id === mains[11].id)?.parked).toBe(true);
    expect(await findTasks({ companyId, offset: 23 })).toEqual({ tasks: [], hasMore: false, total: 23 });
    expect(await findTasks({ companyId, offset: Number.MAX_SAFE_INTEGER })).toEqual({ tasks: [], hasMore: false, total: 23 });
    expect((await findTasks({ companyId, includeDone: true })).total).toBe(24);
  });

  const addAudrey = [parent, child].map(({ id }) => ({ taskId: id, set: { addResponsible: ["audrey"] } }));
  const greg = { ...parent, responsible: ["Greg"] };
  const already = { ...child, responsible: ["Audrey"] };
  const apply = (changes: TaskChange[], shown: Awaited<ReturnType<typeof previewTaskChanges>>) =>
    applyTaskChanges(changes, shown.seen, shown.warnings.map(({ id }) => id), ORIGIN);

  async function updateTimes() {
    const response = await fetch(`http://${EMULATOR_HOST}/v1/projects/${PROJECTS.tasks}/databases/(default)/documents/tasks`,
      { headers: { Authorization: "Bearer owner" } });
    if (!response.ok) throw new Error(`Emulator read failed: ${response.status}`);
    const { documents } = await response.json() as { documents: { name: string; updateTime: string }[] };
    return Object.fromEntries(documents.map(({ name, updateTime }) => [name, updateTime]));
  }

  it("saves only changed IDs and replays those exact IDs after a lost response without writing again", async () => {
    await seed("tasks", "tasks", [{ ...greg, calendar: {} }, already]);
    const beforeTimes = await updateTimes();
    const shown = await previewTaskChanges(addAudrey);
    expect(shown).toMatchObject({ canWrite: true, unchanged: [child.id], tasks: [{ taskId: parent.id, after: { responsible: ["Greg", "Audrey"] } }] });
    expect(Object.keys(shown.seen ?? {})).toEqual([parent.id, child.id]);
    const first = await apply(addAudrey, shown);
    expect(first).toMatchObject({ alreadySaved: false, tasks: [{ taskId: parent.id, saved: true, calendar: null }] });
    expect(await readFields("tasks", `tasks/${parent.id}`)).toMatchObject({ responsible: ["Greg", "Audrey"], calendar: {} });
    const times = await updateTimes();
    expect(Object.entries(times).filter(([path, time]) => time !== beforeTimes[path]).map(([path]) => path.split("/").at(-1))).toEqual([parent.id]);
    const after = await snapshot();
    expect(await apply(addAudrey, shown)).toEqual({ ...first, alreadySaved: true });
    expect(await snapshot()).toEqual(after);
    expect(await updateTimes()).toEqual(times);
    expect(await readAll("tasks", "testCalendarEvents")).toEqual([]);
  });

  it("requires confirmation for a new spelling before saving anything", async () => {
    const changes = [parent, child].map(({ id }) => ({ taskId: id, set: { addResponsible: ["Audry"] } }));
    const shown = await previewTaskChanges(changes);
    expect(shown.warnings.map(({ id }) => id)).toEqual(["new-person:Audry"]);
    const before = await snapshot();
    await expect(applyTaskChanges(changes, shown.seen, [], ORIGIN)).rejects.toThrow("Confirm these warnings");
    expect(await snapshot()).toEqual(before);
  });

  it("rejects even an unchanged listed row's new name and refuses an external edit identical to the proposed save", async () => {
    await seed("tasks", "tasks", [greg, already]);
    const shown = await previewTaskChanges(addAudrey);
    await expect(applyTaskChanges(addAudrey, { [parent.id]: shown.seen?.[parent.id] }, [], ORIGIN)).rejects.toThrow("each task's seen stamp");
    await seed("tasks", "tasks", [{ ...already, responsible: ["Audrey", "Other owner"] }]);
    const before = await snapshot();
    await expect(apply(addAudrey, shown)).rejects.toThrow(`Tasks changed since the preview: ${child.id}`);
    expect(await snapshot()).toEqual(before);

    const next = await previewTaskChanges(addAudrey);
    await seed("tasks", "tasks", [{ ...greg, responsible: ["Greg", "Audrey"] }]);
    const updated = await snapshot();
    await expect(apply(addAudrey, next)).rejects.toThrow(`Tasks changed since the preview: ${parent.id}`);
    expect(await snapshot()).toEqual(updated);
  });

  it("handles overlapping saves, retries removals and allows a fresh re-add after undo", async () => {
    await seed("tasks", "tasks", [greg, already]);
    const original = await previewTaskChanges(addAudrey);
    const results = await Promise.all([apply(addAudrey, original), apply(addAudrey, original)]);
    expect(results.map(({ alreadySaved }) => alreadySaved).sort()).toEqual([false, true]);
    expect(results.map(({ tasks }) => tasks.map(({ taskId }) => taskId))).toEqual([[parent.id], [parent.id]]);

    const removal = [{ taskId: parent.id, set: { removeResponsible: ["AUDREY"] } }];
    const undo = await previewTaskChanges(removal);
    expect((await apply(removal, undo)).tasks.map(({ taskId }) => taskId)).toEqual([parent.id]);
    const times = await updateTimes();
    expect((await apply(removal, undo)).alreadySaved).toBe(true);
    expect((await apply(addAudrey, original)).alreadySaved).toBe(true);
    expect(await updateTimes()).toEqual(times);
    expect(await readFields("tasks", `tasks/${parent.id}`)).toEqual(expect.objectContaining({ responsible: ["Greg"] }));
    expect(await readFields("tasks", `tasks/${child.id}`)).toEqual(expect.objectContaining({ responsible: ["Audrey"] }));

    const fresh = await previewTaskChanges(addAudrey);
    expect((await apply(addAudrey, fresh)).alreadySaved).toBe(false);
    expect(await readFields("tasks", `tasks/${parent.id}`)).toEqual(expect.objectContaining({ responsible: ["Greg", "Audrey"] }));
  }, 20_000);
});

describe("T03 preview changes without writes", () => {
  it("returns mixed edits, moves, deletes, stamps, warnings and freed subtasks with every collection unchanged", async () => {
    const before = await snapshot();
    const result = await previewTaskChanges([
      { taskId: child.id, set: { task: "Changed memo", responsible: ["fictional existing owner", "flow only", "outcome only", "New Person"], calendar: {} }, move: { toParentId: internal.id } },
      { taskId: parent.id, delete: true },
      { taskId: parked.id, set: { parked: false, endDate: "2027-02-01" } },
    ]);
    expect(result.errors).toEqual([]);
    expect(result.canWrite).toBe(true);
    expect(result.tasks.find((task) => task.taskId === child.id)).toMatchObject({
      before: child, after: { task: "Changed memo", parentId: internal.id, responsible: ["Fictional existing owner", "Flow Only", "Outcome Only", "New Person"], calendar: {} }, seen: taskSeen(child),
    });
    expect(result.tasks.find((task) => task.taskId === parent.id)?.after).toBeNull();
    expect(result.tasks.find((task) => task.taskId === done.id)).toMatchObject({ before: done, seen: taskSeen(done) });
    expect(result.tasks.find((task) => task.taskId === done.id)?.after).not.toHaveProperty("parentId");
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "new-person:New Person" }), expect.objectContaining({ id: "delete:parent" }),
      expect.objectContaining({ code: "company-change" }), expect.objectContaining({ code: "company-deadline" }),
    ]));
    expect(result.warnings.filter((warning) => warning.code === "new-person")).toHaveLength(1);
    expect(await snapshot()).toEqual(before);
  });

  it("uses Jakarta's current day and fresh snapshots for warnings and seen stamps", async () => {
    const first = await previewTaskChanges([{ taskId: internal.id, set: { startDate: "2026-11-11" } }]);
    expect(first.warnings).toContainEqual(expect.objectContaining({ code: "past-date", field: "startDate" }));
    const updated = { ...internal, keyPoints: "Updated in another session" };
    await seed("tasks", "tasks", [updated]);
    const next = await previewTaskChanges([{ taskId: internal.id, set: { task: "New name" } }]);
    expect(next.tasks[0].before).toEqual(updated);
    expect(next.tasks[0].seen).toBe(taskSeen(updated));
    expect(next.tasks[0].seen).not.toBe(first.tasks[0].seen);
  });

  it.each([
    [{ taskId: "missing", delete: true }],
    [{ taskId: internal.id, set: { linkedClientId: 10 } }],
    [{ taskId: child.id, set: { calendar: {} } }],
  ])("returns errors and preserves all collections for invalid or disabled changes %j", async (change) => {
    vi.stubEnv("CALENDAR_FAKE", "0");
    const before = await snapshot();
    const result = await previewTaskChanges([change]);
    expect(result.canWrite).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(await snapshot()).toEqual(before);
  });
});
