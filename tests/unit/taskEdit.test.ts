import { describe, expect, it } from "vitest";
import { buildTaskChanges, taskSeen, validateTaskChanges, type TaskEditContext, type TaskEditFields } from "@/lib/taskEdit";
import type { Task } from "@/lib/types";

const TODAY = "2026-11-11";
const NOW = Date.parse("2026-11-11T08:30:00Z");
const task = (id = "a", fields: Partial<Task> = {}): Task => ({
  id, task: `Task ${id}`, startDate: "2026-11-12", endDate: "2026-11-20", keyPoints: "Original notes",
  responsible: ["Greg"], informed: [{ name: "Thania", note: "recipient" }], order: 5, ...fields,
});
const context = (tasks: Task[] = [task()], extra: Partial<TaskEditContext> = {}): TaskEditContext => ({
  tasks, companies: [], names: ["Bu Sovie"], today: TODAY, calendarOn: true, now: NOW, ...extra,
});
const build = (set: TaskEditFields, current = task(), extra: Partial<TaskEditContext> = {}) =>
  buildTaskChanges([{ taskId: current.id, set }], context([current], extra));
const codes = (preview: ReturnType<typeof buildTaskChanges>) => preview.warnings.map((warning) => warning.code);

describe("validateTaskChanges", () => {
  it.each([null, {}, [], Array.from({ length: 51 }, (_, i) => ({ taskId: `t${i}`, set: { task: "Renamed" } }))])(
    "rejects a non-list or a list outside 1–50 changes (%#)", (input) => {
      expect(validateTaskChanges(input)).toMatchObject({ changes: null, errors: [expect.stringContaining("1 to 50")] });
    },
  );

  it("accepts 50 distinct changes, and rejects repeated task IDs", () => {
    const input = Array.from({ length: 50 }, (_, i) => ({ taskId: `t${i}`, set: { task: "Renamed" } }));
    expect(validateTaskChanges(input).changes).toHaveLength(50);
    expect(validateTaskChanges([input[0], input[0]]).errors.join(" ")).toContain("one change per task");
  });

  it.each(["", " a", "a/child", ".", "..", "__reserved__", "x".repeat(1501), "\ud800"])("rejects invalid document IDs (%#)", (taskId) => {
    expect(validateTaskChanges([{ taskId, set: { task: "Renamed" } }]).changes).toBeNull();
  });

  it.each([
    null, { taskId: "a" }, { taskId: "a", set: {} }, { taskId: "a", set: [] },
    { taskId: "a", set: { task: "x" }, other: true }, { taskId: "a", set: { task: " " } },
    { taskId: "a", set: { status: "Done" } }, { taskId: "a", set: { responsible: "Greg" } },
    { taskId: "a", set: { responsible: ["Greg", " "] } }, { taskId: "a", set: { informed: ["Greg"] } },
    { taskId: "a", set: { informed: [{ name: "Greg", note: 3 }] } },
    { taskId: "a", set: { informed: [{ name: "Greg", email: "greg@example.test" }] } },
    { taskId: "a", set: { informed: [{ name: " " }] } }, { taskId: "a", set: { keyPoints: null } },
    { taskId: "a", set: { calendar: false } }, { taskId: "a", set: { calendar: { eventId: "other" } } },
    { taskId: "a", set: { calendar: { startTime: null } } }, { taskId: "a", set: { parked: true } },
    { taskId: "a", set: { parked: {} } }, { taskId: "a", set: { parked: { until: null, reason: "later" } } },
    { taskId: "a", set: { task: undefined } },
  ])("rejects malformed or unknown fields without a partial validated list (%#)", (change) => {
    expect(validateTaskChanges([change]).changes).toBeNull();
  });

  it.each(["id", "taskType", "priority", "touchPoint", "linkedClientId", "taskGroup", "completed", "completedAt", "startedAt", "lastActionDate", "parentId", "calendarSync"])(
    "refuses changing %s directly", (field) => {
      expect(validateTaskChanges([{ taskId: "a", set: { [field]: "changed" } }]).errors).toContain(`changes[0].set.${field} is not a supported field.`);
    },
  );

  it.each(["2026-02-29", "2026-13-01", "11/12/2026", "", null])("rejects bad dates (%#)", (date) => {
    for (const field of ["startDate", "endDate"] as const) {
      expect(validateTaskChanges([{ taskId: "a", set: { [field]: date } }]).changes).toBeNull();
    }
    expect(validateTaskChanges([{ taskId: "a", set: { parked: { until: date } } }]).changes === null).toBe(date !== null);
  });

  it.each([
    { startTime: "24:00", endTime: "25:00" }, { startTime: "9:00", endTime: "10:00" },
    { startTime: "09:00" }, { endTime: "10:00" }, { startTime: "09:60", endTime: "10:00" },
  ])("rejects invalid times and incomplete pairs (%#)", (calendar) => {
    expect(validateTaskChanges([{ taskId: "a", set: { calendar } }]).changes).toBeNull();
  });
});

describe("field previews", () => {
  it("shows exact before/after, replacement text and only the requested patch", () => {
    const current = task("a", { taskType: "Follow Up", priority: "High", touchPoint: "Email", taskGroup: "Ops", linkedClientId: 7 });
    const result = build({ task: "  New name  ", keyPoints: "  Full text\nwith breaks  ", responsible: [], informed: [] }, current);
    expect(result.errors).toEqual([]);
    expect(result.canWrite).toBe(true);
    const preview = result.tasks[0];
    expect(preview.before).toEqual(current);
    expect(preview.patch).toEqual({ task: "New name", keyPoints: "  Full text\nwith breaks  ", responsible: [], informed: [] });
    expect(preview.after).toEqual({ ...current, ...preview.patch });
    expect(current.task).toBe("Task a");
  });

  it("can clear all Key points", () => {
    expect(build({ keyPoints: "" }).tasks[0].after!.keyPoints).toBe("");
  });

  it("uses stored people spelling, including names found on tasks and supplied extra names", () => {
    const result = build({ responsible: [" greg ", "bu   sovie"], informed: [{ name: "THANIA", note: "  Backup\nrecipient " }] });
    expect(result.tasks[0].patch).toEqual({ responsible: ["Greg", "Bu Sovie"], informed: [{ name: "Thania", note: "  Backup\nrecipient " }] });
    expect(result.warnings).toEqual([]);
  });

  it("warns once per new spelling with a stable new-person ID", () => {
    const result = build({ responsible: [" New   Person "], informed: [{ name: "New Person" }] });
    expect(result.tasks[0].after!.responsible).toEqual(["New Person"]);
    expect(result.warnings).toEqual([expect.objectContaining({ id: "new-person:New Person", code: "new-person" })]);
    expect(result.tasks[0].warnings).toHaveLength(1);
  });

  it("marks Done, records the supplied time, keeps the start, and clears parking", () => {
    const current = task("a", { startedAt: 12, parkedAt: 15, parkedUntil: "2026-12-01" });
    const preview = build({ status: "done" }, current).tasks[0];
    expect(preview.patch).toEqual({ completed: true, startedAt: 12, completedAt: NOW, parkedAt: undefined, parkedUntil: undefined });
    expect(preview.after).toMatchObject({ completed: true, completedAt: NOW, startedAt: 12 });
    expect(preview.after).not.toHaveProperty("parkedAt");
    expect(preview.after).not.toHaveProperty("parkedUntil");
  });

  it("keeps an existing finish date and warns before editing a done task", () => {
    const result = build({ status: "done", task: "Renamed" }, task("a", { completed: true, completedAt: 123 }));
    expect(result.tasks[0].after!.completedAt).toBe(123);
    expect(result.warnings).toEqual([expect.objectContaining({ id: "done-task:a", message: expect.stringContaining("Task a") })]);
  });

  it("does not invent a finish date for an old done task", () => {
    expect(build({ status: "done" }, task("a", { completed: true })).tasks[0].after).not.toHaveProperty("completedAt");
  });

  it("To Do clears both status timestamps; In Progress keeps the original start", () => {
    const current = task("a", { completed: true, completedAt: 123, startedAt: 55 });
    expect(build({ status: "todo" }, current).tasks[0].patch).toEqual({ completed: false, startedAt: undefined, completedAt: undefined });
    expect(build({ status: "inProgress" }, current).tasks[0].patch).toEqual({ completed: false, startedAt: 55, completedAt: undefined });
    expect(build({ status: "inProgress" }).tasks[0].patch).toEqual({ completed: false, startedAt: NOW, completedAt: undefined });
  });

  it("parks indefinitely or until a date, or brings a task back", () => {
    expect(build({ parked: { until: null } }).tasks[0].patch).toEqual({ parkedAt: NOW, parkedUntil: undefined });
    expect(build({ parked: { until: "2026-12-01" } }).tasks[0].patch).toEqual({ parkedAt: NOW, parkedUntil: "2026-12-01" });
    const back = build({ parked: false }, task("a", { parkedAt: 4, parkedUntil: "2026-12-01" })).tasks[0];
    expect(back.patch).toEqual({ parkedAt: undefined, parkedUntil: undefined });
    expect(back.after).not.toHaveProperty("parkedAt");
    expect(back.after).not.toHaveProperty("parkedUntil");
  });

  it("refuses parking a done task, including a combined request to finish and park", () => {
    for (const result of [build({ parked: { until: null } }, task("a", { completed: true })), build({ status: "done", parked: { until: null } })]) {
      expect(result.canWrite).toBe(false);
      expect(result.errors.join(" ")).toContain("cannot be parked");
    }
    const reopen = build({ status: "todo", parked: { until: null } }, task("a", { completed: true, completedAt: 1 }));
    expect(reopen.canWrite).toBe(true);
    expect(reopen.tasks[0].after).toMatchObject({ completed: false, parkedAt: NOW });
  });

  it("warns about past explicit dates and parking dates without refusing them", () => {
    const result = build({ startDate: "2026-11-01", endDate: "2026-11-10", parked: { until: "2026-11-10" } });
    expect(result.canWrite).toBe(true);
    expect(result.warnings.map((warning) => warning.id)).toEqual(["past-date:a:startDate", "past-date:a:endDate", "past-date:a:parkedUntil"]);
  });

  it("checks start/end against stored dates, allowing undated legacy tasks to be renamed", () => {
    const result = build({ endDate: "2026-11-01" });
    expect(result.canWrite).toBe(false);
    expect(result.errors.join(" ")).toContain("startDate must not be after endDate");
    expect(build({ task: "Renamed" }, task("a", { startDate: "", endDate: "" })).canWrite).toBe(true);
    expect(build({ startDate: "2026-11-22", endDate: "2026-11-21" }).errors.join(" ")).toContain("startDate must not be after endDate");
  });

  it("still checks explicitly supplied dates that match the stored dates", () => {
    const past = task("a", { startDate: "2026-11-01", endDate: "2026-11-10" });
    expect(build({ startDate: past.startDate }, past).warnings.map((warning) => warning.id)).toEqual(["past-date:a:startDate"]);
    expect(build({ task: "Renamed" }, past).warnings).toEqual([]);
    const reversed = task("a", { startDate: "2026-11-22", endDate: "2026-11-21" });
    expect(build({ startDate: reversed.startDate }, reversed).canWrite).toBe(false);
  });

  it("adds timed/all-day calendar marks, replaces times, and clears the mark", () => {
    expect(build({ calendar: { startTime: "09:00", endTime: "10:00" } }).tasks[0].patch).toEqual({ calendar: { startTime: "09:00", endTime: "10:00" } });
    const marked = task("a", { calendar: { startTime: "09:00", endTime: "10:00" }, calendarSync: { link: "event" } });
    expect(build({ calendar: {} }, marked).tasks[0].patch).toEqual({ calendar: {} });
    expect(build({ calendar: { startTime: "", endTime: "" } }, marked).tasks[0].after!.calendar).toEqual({});
    const removed = build({ calendar: null }, marked).tasks[0];
    expect(removed.patch).toEqual({ calendar: undefined });
    expect(removed.after).not.toHaveProperty("calendar");
    expect(removed.after!.calendarSync).toEqual(marked.calendarSync);
  });

  it("refuses both adding and removing calendar marks when calendar writes are off", () => {
    for (const calendar of [{}, null]) {
      const result = build({ calendar }, task(), { calendarOn: false });
      expect(result.canWrite).toBe(false);
      expect(result.errors.join(" ")).toContain("calendar isn't connected");
    }
    expect(build({ task: "Renamed" }, task("a", { calendar: {} }), { calendarOn: false }).canWrite).toBe(true);
  });

  it("uses the final calendar range for same-day times, multi-day times and date-only edits", () => {
    const sameDay = task("a", { endDate: "2026-11-12" });
    expect(build({ calendar: { startTime: "10:00", endTime: "10:00" } }, sameDay).canWrite).toBe(false);
    expect(build({ calendar: { startTime: "23:00", endTime: "01:00" } }, sameDay).canWrite).toBe(false);
    expect(build({ calendar: { startTime: "23:00", endTime: "01:00" } }).canWrite).toBe(true);
    const overnight = task("a", { calendar: { startTime: "23:00", endTime: "01:00" } });
    expect(build({ endDate: overnight.startDate }, overnight).errors.join(" ")).toContain("end time must be after");
    expect(build({ calendar: {} }, task("a", { startDate: "" })).canWrite).toBe(false);
  });

  it("reports unknown tasks and invalid clock inputs as errors", () => {
    const missing = buildTaskChanges([{ taskId: "missing", set: { task: "Renamed" } }], context());
    expect(missing).toMatchObject({ canWrite: false, tasks: [], errors: [expect.stringContaining("not found")] });
    expect(build({ task: "Renamed" }, task(), { today: "invalid" }).canWrite).toBe(false);
    expect(build({ task: "Renamed" }, task(), { now: NaN }).canWrite).toBe(false);
  });
});

describe("independent dates and company deadline warnings", () => {
  const parent = task("parent");
  const child = task("child", { parentId: parent.id, startDate: "2026-11-13", endDate: "2026-11-19" });

  it("patches only the main task and warns about a child outside its new range", () => {
    const tasks = [parent, child];
    const original = structuredClone(tasks);
    const result = buildTaskChanges([{ taskId: parent.id, set: { endDate: "2026-11-15" } }], context(tasks));
    expect(result.canWrite).toBe(true);
    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0].patch).toEqual({ endDate: "2026-11-15" });
    expect(result.warnings).toEqual([expect.objectContaining({ id: "subtasks-outside-range:parent:child", relatedTaskId: child.id })]);
    expect(tasks).toEqual(original);
  });

  it("warns about a child's dates outside its main task and keeps the main task unchanged", () => {
    const result = buildTaskChanges([{ taskId: child.id, set: { startDate: "2026-11-11" } }], context([child, parent]));
    expect(result.tasks.map((preview) => preview.taskId)).toEqual([child.id]);
    expect(result.warnings).toEqual([expect.objectContaining({ id: "outside-parent-range:child:parent", relatedTaskId: parent.id })]);
  });

  it("compares final requested dates when parent and child both change, independent of input order", () => {
    const changes = [{ taskId: parent.id, set: { endDate: "2026-11-15" } }, { taskId: child.id, set: { endDate: "2026-11-14" } }];
    expect(buildTaskChanges(changes, context([parent, child])).warnings).toEqual([]);
    expect(buildTaskChanges([...changes].reverse(), context([child, parent])).warnings).toEqual([]);
  });

  it("keeps warning IDs stable when stored tasks or changes are reordered", () => {
    const otherChild = task("other", { parentId: parent.id });
    const changes = [{ taskId: parent.id, set: { endDate: "2026-11-15" } }, { taskId: child.id, set: { startDate: "2026-11-11" } }];
    const ids = (tasks: Task[], input = changes) => buildTaskChanges(input, context(tasks)).warnings.map((warning) => warning.id).sort();
    expect(ids([parent, child, otherChild])).toEqual(ids([otherChild, child, parent], [...changes].reverse()));
  });

  it("warns when an open company task's deadline will change the company target", () => {
    const current = task("a", { linkedClientId: 7, lastActionDate: "2026-11-05" });
    const companies = [{ id: 7, company: "DEUS", target: "2026-11-20", date: "2026-11-01" }];
    const original = structuredClone(companies);
    const result = build({ endDate: "2026-11-25" }, current, { companies });
    expect(result.tasks[0].patch).toEqual({ endDate: "2026-11-25" });
    expect(result.warnings).toEqual([expect.objectContaining({ id: "company-deadline:a:7", message: expect.stringContaining("2026-11-20 → 2026-11-25") })]);
    expect(companies).toEqual(original);
    expect(codes(build({ startDate: "2026-11-13" }, current, { companies }))).not.toContain("company-deadline");
    expect(codes(build({ endDate: "2026-11-25", status: "done" }, current, { companies }))).not.toContain("company-deadline");
    expect(codes(build({ endDate: "2026-11-25" }, current, { companies: [{ ...companies[0], target: "2026-11-25" }] }))).not.toContain("company-deadline");
  });
});

describe("move and delete input validation", () => {
  it.each([
    { taskId: "a", move: { toParentId: "parent" } },
    { taskId: "a", move: { toParentId: null } },
    { taskId: "a", move: { toParentId: "parent" }, set: { task: "New name" } },
    { taskId: "a", delete: true },
  ])("accepts moves, freeing, combined edits and deletes (%#)", (change) => {
    expect(validateTaskChanges([change])).toEqual({ changes: [change], errors: [] });
  });

  it.each([
    { move: null }, { move: [] }, { move: {} }, { move: { toParentId: undefined } },
    { move: { toParentId: "parent", company: 7 } }, { move: { toParentId: 7 } },
    { delete: false }, { delete: null }, { delete: undefined },
    { delete: true, set: { task: "Rename" } }, { delete: true, set: undefined },
    { delete: true, move: { toParentId: null } }, { delete: true, move: undefined },
    { move: { toParentId: null }, set: {} }, { move: { toParentId: null }, set: null },
  ])("rejects malformed operations and delete combinations (%#)", (operation) => {
    expect(validateTaskChanges([{ taskId: "a", ...operation }]).changes).toBeNull();
  });

  it.each(["", " parent", "a/child", ".", "..", "__reserved__", "x".repeat(1501), "\ud800"])("validates destination document IDs (%#)", (toParentId) => {
    expect(validateTaskChanges([{ taskId: "a", move: { toParentId } }]).changes).toBeNull();
  });

  it("keeps one operation per task even across moves and deletes", () => {
    expect(validateTaskChanges([{ taskId: "a", move: { toParentId: null } }, { taskId: "a", delete: true }]).errors.join(" ")).toContain("one change per task");
  });
});

describe("move previews", () => {
  const oldParent = task("old", { linkedClientId: 7, taskGroup: "Old group" });
  const parent = task("parent", { linkedClientId: 8, taskGroup: "New group" });
  const child = task("child", { parentId: oldParent.id, linkedClientId: 7, taskGroup: "Old group", calendar: {} });
  const move = (toParentId: string | null, tasks = [oldParent, parent, child]) =>
    buildTaskChanges([{ taskId: child.id, move: { toParentId } }], context(tasks));

  it("moves a subtask with exactly its new parent's company/group and warns about the company", () => {
    const result = move(parent.id);
    expect(result.canWrite).toBe(true);
    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0]).toMatchObject({ before: child, seen: taskSeen(child), patch: { parentId: parent.id, linkedClientId: 8, taskGroup: "New group" } });
    expect(result.tasks[0].after).toEqual({ ...child, parentId: parent.id, linkedClientId: 8, taskGroup: "New group" });
    expect(result.warnings).toEqual([expect.objectContaining({ id: "company-change:child", relatedTaskId: parent.id, message: expect.stringContaining("company 7 → company 8") })]);
  });

  it("clears company and group when the new main task has neither", () => {
    const result = move(parent.id, [child, task(parent.id)]);
    expect(result.canWrite).toBe(true);
    expect(result.tasks[0].patch).toEqual({ parentId: parent.id, linkedClientId: undefined, taskGroup: undefined });
    expect(result.tasks[0].after).not.toHaveProperty("linkedClientId");
    expect(result.tasks[0].after).not.toHaveProperty("taskGroup");
    expect(codes(result)).toEqual(["company-change"]);
  });

  it("can nest a main task without children, with no company warning for a group-only change", () => {
    const current = task(child.id, { linkedClientId: 8, taskGroup: "Old group" });
    const result = move(parent.id, [current, parent]);
    expect(result.canWrite).toBe(true);
    expect(result.tasks[0].after).toEqual({ ...current, parentId: parent.id, taskGroup: "New group" });
    expect(result.warnings).toEqual([]);
  });

  it.each([
    { completed: true }, { parkedAt: NOW }, { parkedAt: NOW, parkedUntil: "2026-11-12" },
    { parentId: "old" }, { parentId: "missing" },
  ])("rejects a done, parked or nested destination, including an orphan (%#)", (fields) => {
    const result = move(parent.id, [child, oldParent, task(parent.id, fields)]);
    expect(result.canWrite).toBe(false);
    expect(result.errors.join(" ")).toContain("open, unparked, top-level");
  });

  it("accepts a main task whose parking expired today", () => {
    expect(move(parent.id, [child, task(parent.id, { parkedAt: NOW, parkedUntil: TODAY })]).canWrite).toBe(true);
  });

  it("rejects missing destinations, self-parenting, and a main task with children", () => {
    expect(move("missing").errors.join(" ")).toContain("not found");
    expect(move(child.id).errors.join(" ")).toContain("under itself");
    const result = move(parent.id, [parent, child, task("grandchild", { parentId: child.id })]);
    expect(result.canWrite).toBe(false);
    expect(result.errors.join(" ")).toContain("has subtasks");
  });

  it("frees a subtask while keeping all other stored fields, including its calendar mark", () => {
    const result = move(null);
    expect(result.canWrite).toBe(true);
    expect(result.tasks[0].patch).toEqual({ parentId: undefined });
    const { parentId: _parent, ...freed } = child;
    void _parent;
    expect(result.tasks[0].after).toEqual(freed);
    expect(result.warnings).toEqual([]);
  });

  it("combines a move and field edits in one patch and warns for the new company's deadline", () => {
    const result = buildTaskChanges([{ taskId: child.id, move: { toParentId: parent.id }, set: { task: "Renamed", endDate: "2026-11-25" } }], context([parent, child], {
      companies: [{ id: 7, company: "Old company", target: "2026-11-20" }, { id: 8, company: "New company", target: "2026-11-20" }],
    }));
    expect(result.canWrite).toBe(true);
    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0].patch).toEqual({ task: "Renamed", endDate: "2026-11-25", parentId: parent.id, linkedClientId: 8, taskGroup: "New group" });
    expect(result.warnings.map((warning) => warning.id)).toContain("company-deadline:child:8");
    expect(result.warnings.map((warning) => warning.id)).not.toContain("company-deadline:child:7");
  });

  it("warns about an unchanged date outside the new main task's final range", () => {
    const changes = [{ taskId: child.id, move: { toParentId: parent.id } }, { taskId: parent.id, set: { endDate: "2026-11-15" } }];
    for (const input of [changes, [...changes].reverse()]) {
      const result = buildTaskChanges(input, context([parent, child]));
      expect(result.canWrite).toBe(true);
      expect(result.warnings.map((warning) => warning.id)).toContain("outside-parent-range:child:parent");
      expect(result.tasks.find((preview) => preview.taskId === child.id)!.patch).not.toHaveProperty("endDate");
    }
  });

  it.each([
    { set: { status: "done" } }, { set: { parked: { until: null } } },
    { move: { toParentId: "old" } }, { delete: true },
  ])("rejects a destination that another listed operation makes ineligible, in either order (%#)", (operation) => {
    const changes = [{ taskId: child.id, move: { toParentId: parent.id } }, { taskId: parent.id, ...operation }];
    for (const input of [changes, [...changes].reverse()]) {
      const result = buildTaskChanges(input, context([oldParent, parent, child]));
      expect(result.canWrite).toBe(false);
      expect(result.errors.join(" ")).toContain("destination must remain");
    }
  });

  it("rejects cycles and chains assembled from otherwise eligible main tasks", () => {
    for (const destination of ["a", "c"]) {
      const result = buildTaskChanges([{ taskId: "a", move: { toParentId: "b" } }, { taskId: "b", move: { toParentId: destination } }], context([task("a"), task("b"), task("c")]));
      expect(result.canWrite).toBe(false);
    }
  });
});

describe("delete previews", () => {
  const parent = task("parent");
  const child = task("child", { parentId: parent.id, linkedClientId: 7, taskGroup: "Ops", completed: true, completedAt: 12, calendar: {} });
  const other = task("other", { parentId: parent.id, parkedAt: NOW, parkedUntil: "2026-12-01" });

  it("shows deletion and extra unlink patches with their own before/after and seen stamps, without mutations", () => {
    const tasks = [parent, child, other, task("unrelated")];
    const original = structuredClone(tasks);
    const result = buildTaskChanges([{ taskId: parent.id, delete: true }], context(tasks));
    expect(result.canWrite).toBe(true);
    expect(result.changes).toEqual([{ taskId: parent.id, delete: true }]);
    expect(result.tasks.map((preview) => preview.taskId)).toEqual([parent.id, child.id, other.id]);
    expect(result.tasks[0]).toMatchObject({ before: parent, after: null, patch: {}, seen: taskSeen(parent) });
    for (const current of [child, other]) {
      const preview = result.tasks.find((entry) => entry.taskId === current.id)!;
      expect(preview).toMatchObject({ before: current, patch: { parentId: undefined }, seen: taskSeen(current), warnings: [] });
      expect(preview.after).not.toHaveProperty("parentId");
      expect({ ...preview.after, parentId: parent.id }).toEqual(current);
    }
    expect(result.warnings).toEqual([expect.objectContaining({ id: "delete:parent", message: expect.stringContaining('"Task parent"') })]);
    expect(result.warnings[0].message).toContain("frees 2 subtasks");
    expect(tasks).toEqual(original);
  });

  it("deletes listed subtasks too, without an extra unlink or counting them as freed", () => {
    const changes = [{ taskId: parent.id, delete: true }, { taskId: child.id, delete: true }];
    for (const input of [changes, [...changes].reverse()]) {
      const result = buildTaskChanges(input, context([parent, child, other]));
      expect(result.canWrite).toBe(true);
      expect(result.tasks).toHaveLength(3);
      expect(result.tasks.find((preview) => preview.taskId === child.id)!.after).toBeNull();
      expect(result.warnings.map((warning) => warning.id).sort()).toEqual(["delete:child", "delete:parent"]);
      expect(result.warnings.find((warning) => warning.id === "delete:parent")!.message).toContain("frees 1 subtask");
    }
  });

  it("combines a listed child's field edit with freeing it when its parent is deleted", () => {
    const result = buildTaskChanges([{ taskId: parent.id, delete: true }, { taskId: child.id, set: { task: "Kept child" } }], context([parent, child]));
    expect(result.canWrite).toBe(true);
    expect(result.tasks).toHaveLength(2);
    const preview = result.tasks.find((entry) => entry.taskId === child.id)!;
    expect(preview.patch).toEqual({ task: "Kept child", parentId: undefined });
    expect(preview.after).toMatchObject({ task: "Kept child", linkedClientId: 7, taskGroup: "Ops" });
    expect(preview.after).not.toHaveProperty("parentId");
  });

  it.each([null, "destination"])("preserves an explicit child move while deleting the old parent (%#)", (toParentId) => {
    const changes = [{ taskId: parent.id, delete: true }, { taskId: child.id, move: { toParentId } }];
    for (const input of [changes, [...changes].reverse()]) {
      const result = buildTaskChanges(input, context([parent, child, task("destination")]));
      expect(result.canWrite).toBe(true);
      expect(result.tasks).toHaveLength(2);
      expect(result.tasks.find((preview) => preview.taskId === child.id)!.after?.parentId).toBe(toParentId ?? undefined);
      expect(result.warnings.find((warning) => warning.id === "delete:parent")!.message).toContain(`frees ${toParentId === null ? 1 : 0} subtask`);
    }
  });

  it("can delete a lone subtask without changing its parent or siblings", () => {
    const result = buildTaskChanges([{ taskId: child.id, delete: true }], context([parent, child, other]));
    expect(result.canWrite).toBe(true);
    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0].after).toBeNull();
    expect(result.warnings).toEqual([expect.objectContaining({ id: "delete:child", message: expect.stringContaining("frees 0 subtasks") })]);
  });

  it("does not produce date-range warnings for deleted parents or children", () => {
    const result = buildTaskChanges([{ taskId: parent.id, set: { endDate: "2026-11-15" } }, { taskId: child.id, delete: true }], context([parent, child]));
    expect(codes(result)).toEqual(["delete"]);
  });
});

describe("seen stamps", () => {
  it("is a SHA-256 hex stamp unchanged by any object key order, including nested objects", () => {
    const original = task("a", { calendar: { startTime: "09:00", endTime: "10:00" }, calendarSync: { link: "event", synced: "stamp" } });
    const reordered = Object.fromEntries(Object.entries(original).reverse()) as unknown as Task;
    reordered.calendar = { endTime: "10:00", startTime: "09:00" };
    reordered.calendarSync = { synced: "stamp", link: "event" };
    reordered.informed = [{ note: "recipient", name: "Thania" }];
    expect(taskSeen(original)).toMatch(/^[0-9a-f]{64}$/);
    expect(taskSeen(reordered)).toBe(taskSeen(original));
    expect(taskSeen({ ...original, completed: undefined })).toBe(taskSeen(original));
    expect(build({ task: "New name" }, original).tasks[0].seen).toBe(taskSeen(original));
  });

  it.each(Object.entries({
    task: "Renamed", taskType: "Follow Up", priority: "High", touchPoint: "Email", responsible: ["David"],
    informed: [{ name: "Greg" }], keyPoints: "Changed notes", startDate: "2026-11-14", endDate: "2026-11-24",
    order: 6, completed: true, linkedClientId: 7, taskGroup: "Ops", lastActionDate: "2026-11-11",
    completedAt: 12, startedAt: 13, parkedAt: 14, parkedUntil: "2026-12-01", parentId: "parent",
    calendar: {}, calendarSync: { error: "changed" }, extraStoredField: "preserved",
  }))("changes when stored %s changes", (field, value) => {
    expect(taskSeen({ ...task(), [field]: value })).not.toBe(taskSeen(task()));
  });

  it("preserves array order, and hashes stored fields rather than the injected document ID", () => {
    expect(taskSeen(task("a", { responsible: ["Greg", "David"] }))).not.toBe(taskSeen(task("a", { responsible: ["David", "Greg"] })));
    expect(taskSeen({ ...task(), id: "other" })).toBe(taskSeen(task()));
  });
});
