// Task and task group writes, against the Firestore emulator.
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { terminate } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { addTask, deleteTask, deleteTasks, moveTasksToGroup, putBackDone, setTasksDone, setTasksParked, updateTask } from "@/lib/taskWrites";
import { statusPatch } from "@/lib/taskStatus";
import { createTaskGroup, deleteTaskGroup, GroupNameError, renameTaskGroup } from "@/lib/taskGroups";
import { addFlow, updateFlow, withoutUnset } from "@/lib/flowWrites";
import { OfflineError } from "@/lib/connection";
import type { NewTask, Task } from "@/lib/types";
import { clearProject, readAll, readFields, seed } from "../support/emulator";

function newTask(fields: Partial<NewTask> = {}): NewTask {
  return { task: "A task", responsible: [], informed: [], keyPoints: "", startDate: "", endDate: "", order: 1, ...fields };
}

function asTask(id: string, fields: Partial<NewTask> = {}): Task {
  return { id, ...newTask(fields) };
}

async function seedTasks(tasks: Task[]) {
  for (let i = 0; i < tasks.length; i += 400) await seed("tasks", "tasks", tasks.slice(i, i + 400));
}

beforeEach(async () => {
  await clearProject("tasks");
});

afterAll(async () => {
  await terminate(db);
});

describe("task writes", () => {
  it("stores a new task without empty values or an id field", async () => {
    const id = await addTask({ ...newTask({ taskType: undefined, priority: "High" }), id: "x" } as NewTask);
    const fields = await readFields("tasks", `tasks/${id}`);
    expect(fields).toMatchObject({ task: "A task", priority: "High" });
    expect(fields).not.toHaveProperty("taskType");
    expect(fields).not.toHaveProperty("id");
  });

  it("clears a field set to undefined and never stores the id", async () => {
    await seedTasks([asTask("t1", { taskType: "Follow Up", taskGroup: "Hiring", lastActionDate: "2026-10-01" })]);
    await updateTask("t1", { id: "t1", taskType: undefined, taskGroup: undefined, keyPoints: "Updated" } as Partial<NewTask>);
    const fields = await readFields("tasks", "tasks/t1");
    expect(fields).toMatchObject({ keyPoints: "Updated", lastActionDate: "2026-10-01" });
    expect(fields).not.toHaveProperty("taskType");
    expect(fields).not.toHaveProperty("taskGroup");
    expect(fields).not.toHaveProperty("id");
  });

  it("marks tasks done and undoes it", async () => {
    const tasks = [asTask("a"), asTask("b", { completed: true })];
    await seedTasks(tasks);
    const undo = await setTasksDone(tasks, true);
    expect((await readAll("tasks", "tasks")).map((t) => t.completed)).toEqual([true, true]);
    await undo();
    expect(Object.fromEntries((await readAll("tasks", "tasks")).map((t) => [t.id, t.completed]))).toEqual({ a: false, b: true });
  });

  it("moves internal and company tasks to a group, keeping their companies, with undo", async () => {
    const tasks = [asTask("int", { taskGroup: "Old" }), asTask("co", { linkedClientId: 1 })];
    await seedTasks(tasks);
    const { moved, undo } = await moveTasksToGroup(tasks, "Hiring");
    expect(moved).toBe(2);
    expect(await readFields("tasks", "tasks/int")).toMatchObject({ taskGroup: "Hiring" });
    expect(await readFields("tasks", "tasks/co")).toMatchObject({ taskGroup: "Hiring", linkedClientId: 1 });
    await undo();
    expect(await readFields("tasks", "tasks/int")).toMatchObject({ taskGroup: "Old" });
    expect(await readFields("tasks", "tasks/co")).not.toHaveProperty("taskGroup");
  });

  it("leaves out a task deleted meanwhile, so the rest of its batch still saves", async () => {
    const tasks = [asTask("a"), asTask("gone"), asTask("b")];
    await seedTasks([tasks[0], tasks[2]]);
    const undo = await setTasksDone(tasks, true, (id) => id !== "gone");
    expect((await readAll("tasks", "tasks")).map((t) => [t.id, t.completed])).toEqual([["a", true], ["b", true]]);
    await undo();
    expect((await readAll("tasks", "tasks")).map((t) => t.completed)).toEqual([false, false]);
  });
});

describe("task group writes", () => {
  it("refuses a missing or taken name, ignoring case", async () => {
    await expect(createTaskGroup("  ", [])).rejects.toThrow(GroupNameError);
    await expect(createTaskGroup("hiring", [{ id: "g1", name: "Hiring" }])).rejects.toMatchObject({ problem: "taken" });
    const id = await createTaskGroup(" Office move ", [{ id: "g1", name: "Hiring" }]);
    expect(await readFields("tasks", `taskGroups/${id}`)).toMatchObject({ name: "Office move", starred: false });
  });

  it("deletes a group and leaves its tasks ungrouped, past one batch", async () => {
    await seed("tasks", "taskGroups", [{ id: "g1", name: "Office move", order: 1 }]);
    const members = Array.from({ length: 460 }, (_, i) => asTask(`m${i}`, { taskGroup: "Office move" }));
    const other = asTask("other", { taskGroup: "Hiring" });
    await seedTasks([...members, other]);

    expect(await deleteTaskGroup({ id: "g1", name: "Office move" }, [...members, other])).toBe(460);
    expect(await readAll("tasks", "taskGroups")).toEqual([]);
    const stored = await readAll("tasks", "tasks");
    expect(stored.filter((t) => "taskGroup" in t).map((t) => t.id)).toEqual(["other"]);
    expect(stored).toHaveLength(461);
  }, 20_000); // 460 writes take a few seconds on a busy machine

  it("renames a group and every task in it", async () => {
    await seed("tasks", "taskGroups", [
      { id: "g1", name: "Ofice move", order: 1 },
      { id: "g2", name: "Hiring", order: 2 },
    ]);
    const tasks = [asTask("a", { taskGroup: "Ofice move" }), asTask("b", { taskGroup: "Hiring" })];
    await seedTasks(tasks);
    const groups = [
      { id: "g1", name: "Ofice move" },
      { id: "g2", name: "Hiring" },
    ];
    await expect(renameTaskGroup(groups[0], "HIRING", groups, tasks)).rejects.toMatchObject({ problem: "taken" });
    expect(await renameTaskGroup(groups[0], "Office move", groups, tasks)).toBe(1);
    expect(await readFields("tasks", "taskGroups/g1")).toMatchObject({ name: "Office move" });
    expect(await readFields("tasks", "tasks/a")).toMatchObject({ taskGroup: "Office move" });
    expect(await readFields("tasks", "tasks/b")).toMatchObject({ taskGroup: "Hiring" });
  });
});

describe("task group writes before the groups have loaded", () => {
  it("finds the group's record by name", async () => {
    await seed("tasks", "taskGroups", [{ id: "g1", name: "Office move", order: 1 }]);
    const tasks = [asTask("a", { taskGroup: "Office move" })];
    await seedTasks(tasks);
    expect(await deleteTaskGroup({ name: "Office move" }, tasks)).toBe(1);
    expect(await readAll("tasks", "taskGroups")).toEqual([]);
    expect(await readFields("tasks", "tasks/a")).not.toHaveProperty("taskGroup");
  });

  it("deletes every record of the group's name, as older data may hold two", async () => {
    await seed("tasks", "taskGroups", [
      { id: "g1", name: "Office move", order: 1 },
      { id: "g2", name: "Office move", order: 2 },
    ]);
    expect(await deleteTaskGroup({ id: "g1", name: "Office move" }, [])).toBe(0);
    expect(await readAll("tasks", "taskGroups")).toEqual([]);
  });
});

describe("flow steps", () => {
  it("saves a decision branch that loops back to nothing", async () => {
    const id = await addFlow({ name: "Onboarding", description: "", order: 1, steps: [] });
    const steps = [{ id: "s1", title: "Qualify", decision: { question: "Fit?", branches: [{ id: "b1", label: "No", loopTo: undefined }] } }];
    await updateFlow(id, { steps } as never);
    expect(await readFields("tasks", `flows/${id}`)).toMatchObject({
      steps: [{ id: "s1", decision: { branches: [{ id: "b1", label: "No" }] } }],
    });
    expect(withoutUnset({ a: [{ b: undefined, c: 1 }], d: null })).toEqual({ a: [{ c: 1 }], d: null });
  });
});

describe("when tasks and flows were finished or edited (1.6)", () => {
  it("records when a task is marked done, keeps it on later saves, and clears it when reopened", async () => {
    await seedTasks([asTask("t")]);
    const before = Date.now();
    await updateTask("t", { completed: true }, asTask("t"));
    const doneAt = (await readFields("tasks", "tasks/t"))?.completedAt as number;
    expect(doneAt).toBeGreaterThanOrEqual(before);

    await updateTask("t", { completed: true, keyPoints: "edited" }, { ...asTask("t"), completed: true, completedAt: doneAt });
    expect(await readFields("tasks", "tasks/t")).toMatchObject({ completedAt: doneAt, keyPoints: "edited" });

    await updateTask("t", { completed: false }, { ...asTask("t"), completed: true, completedAt: doneAt });
    expect(await readFields("tasks", "tasks/t")).not.toHaveProperty("completedAt");
  });

  it("parks open tasks until a day or until brought back, leaves finished ones, and undoes it (N19)", async () => {
    const tasks = [asTask("a"), asTask("b", { completed: true }), { ...asTask("c"), parkedAt: 5, parkedUntil: "2026-11-01" }];
    await seedTasks(tasks);
    const before = Date.now();
    const undo = await setTasksParked(tasks, true, "2026-12-01");
    const a = await readFields("tasks", "tasks/a");
    expect(a?.parkedAt as number).toBeGreaterThanOrEqual(before);
    expect(a).toMatchObject({ parkedUntil: "2026-12-01" });
    expect(await readFields("tasks", "tasks/b")).not.toHaveProperty("parkedAt");
    await undo();
    expect(await readFields("tasks", "tasks/a")).not.toHaveProperty("parkedAt");
    expect(await readFields("tasks", "tasks/c")).toMatchObject({ parkedAt: 5, parkedUntil: "2026-11-01" });

    await setTasksParked([tasks[2]], false);
    const c = await readFields("tasks", "tasks/c");
    expect(c).not.toHaveProperty("parkedAt");
    expect(c).not.toHaveProperty("parkedUntil");
  });

  it("ends parking when a task is marked done, and puts it back on Undo", async () => {
    const t = { ...asTask("t"), parkedAt: 5 };
    await seedTasks([t]);
    const undo = await setTasksDone([t], true);
    expect(await readFields("tasks", "tasks/t")).not.toHaveProperty("parkedAt");
    await undo();
    expect(await readFields("tasks", "tasks/t")).toMatchObject({ completed: false, parkedAt: 5 });
  });

  it("puts the finished date back on Undo", async () => {
    const t = { ...asTask("t"), completed: true, completedAt: 1234 };
    await seedTasks([t]);
    const undo = await setTasksDone([t], false);
    expect(await readFields("tasks", "tasks/t")).not.toHaveProperty("completedAt");
    await undo();
    expect(await readFields("tasks", "tasks/t")).toMatchObject({ completed: true, completedAt: 1234 });
  });

  it("starts a task, finishes it keeping its start, and Undo puts the status back as it was", async () => {
    const t = asTask("t");
    await seedTasks([t]);
    await updateTask("t", statusPatch("inProgress", t, 99), t);
    expect(await readFields("tasks", "tasks/t")).toMatchObject({ completed: false, startedAt: 99 });
    const started = { ...t, completed: false, startedAt: 99 };
    await updateTask("t", statusPatch("done", started), started);
    expect(await readFields("tasks", "tasks/t")).toMatchObject({ completed: true, startedAt: 99 });
    await putBackDone([t]);
    const back = await readFields("tasks", "tasks/t");
    expect(back).toMatchObject({ completed: false });
    expect(back).not.toHaveProperty("startedAt");
    expect(back).not.toHaveProperty("completedAt");
  });

  it("keeps a deleted task's subtasks as tasks of their own, alone or with others (N24)", async () => {
    await seedTasks([asTask("p"), asTask("s1", { parentId: "p" }), asTask("s2", { parentId: "p" }), asTask("q"), asTask("t", { parentId: "q" }), asTask("u", { parentId: "q" })]);
    await deleteTask("p", ["s1", "s2"]);
    await deleteTasks(["q", "u"], undefined, ["t"]);
    const left = await readAll("tasks", "tasks");
    expect(left.map((t) => t.id).sort()).toEqual(["s1", "s2", "t"]);
    expect(left.every((t) => !("parentId" in t))).toBe(true);
  });

  it("records when a flow was last edited", async () => {
    const before = Date.now();
    const id = await addFlow({ name: "Onboarding", description: "", order: 1, steps: [] });
    await updateFlow(id, { name: "Client onboarding" });
    const stored = await readFields("tasks", `flows/${id}`);
    expect(stored).toMatchObject({ name: "Client onboarding" });
    expect(stored?.updatedAt as number).toBeGreaterThanOrEqual(before);
  });

  it("refuses to write with no connection", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    try {
      await expect(addTask(newTask())).rejects.toThrow("No connection. The task wasn't added.");
      await expect(updateFlow("x", { name: "y" })).rejects.toBeInstanceOf(OfflineError);
    } finally {
      vi.unstubAllGlobals();
    }
    expect(await readAll("tasks", "tasks")).toEqual([]);
  });
});
