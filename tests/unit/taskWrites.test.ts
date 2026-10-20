// Task and task group writes, against the Firestore emulator.
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { terminate } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { companiesById } from "@/lib/kinds";
import { addTask, moveTasksToGroup, setTasksDone, updateTask } from "@/lib/taskWrites";
import { createTaskGroup, deleteTaskGroup, GroupNameError, renameTaskGroup } from "@/lib/taskGroups";
import { addFlow, updateFlow } from "@/lib/flowWrites";
import { OfflineError } from "@/lib/connection";
import type { PipelineEntry } from "@/lib/clientTypes";
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

  it("moves only internal work to a group, with undo", async () => {
    const companies = companiesById([{ id: 1, company: "Pelita Foods" } as PipelineEntry]);
    const tasks = [asTask("int", { taskGroup: "Old" }), asTask("co", { linkedClientId: 1 })];
    await seedTasks(tasks);
    const { moved, skipped, undo } = await moveTasksToGroup(tasks, "Hiring", companies);
    expect({ moved, skipped }).toEqual({ moved: 1, skipped: 1 });
    expect(await readFields("tasks", "tasks/int")).toMatchObject({ taskGroup: "Hiring" });
    expect(await readFields("tasks", "tasks/co")).not.toHaveProperty("taskGroup");
    await undo();
    expect(await readFields("tasks", "tasks/int")).toMatchObject({ taskGroup: "Old" });
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
  });

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

  it("puts the finished date back on Undo", async () => {
    const t = { ...asTask("t"), completed: true, completedAt: 1234 };
    await seedTasks([t]);
    const undo = await setTasksDone([t], false);
    expect(await readFields("tasks", "tasks/t")).not.toHaveProperty("completedAt");
    await undo();
    expect(await readFields("tasks", "tasks/t")).toMatchObject({ completed: true, completedAt: 1234 });
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
