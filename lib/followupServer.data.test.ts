// Real Node reads and atomic writes against the emulator, never either live project.
import { readFileSync } from "node:fs";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { terminate } from "firebase/firestore";
import { FOLLOWUP_COMPANY_FIXTURE as company, SIX_STEP_FOLLOWUP_FIXTURE as fixture } from "../tests/fixtures/followupPlan";
import { clearAll, EMULATOR_HOST, PROJECTS, readAll, readFields, seed } from "../tests/support/emulator";
import { USE_EMULATOR } from "./emulator";
import { db } from "./firebase";
import { clientsDb } from "./firebaseClients";
import { addFollowupPlan, FollowupPlanError, previewFollowupPlan, readFollowupData } from "./followupServer";
import type { Task } from "./types";

// Importing taskWrites or a browser data hook would pull in this module and fail the suite.
vi.mock("./connection", () => { throw new Error("The server path must not import browser connection state."); });

const parent: Task = {
  id: "existing-parent", task: `${company.company} Follow Up`, taskType: "Follow Up", linkedClientId: company.id,
  responsible: ["Existing owner"], informed: [{ name: "Existing observer" }], keyPoints: "Keep the original summary",
  startDate: "2026-10-01", endDate: "2026-11-01", order: 10, taskGroup: "Original group", lastActionDate: "2026-10-02",
};
const oldSubtask: Task = {
  ...parent, id: "old-subtask", task: "Already finished step", parentId: parent.id, order: 11,
  startDate: "2026-10-03", endDate: "2026-10-04", completed: true, completedAt: 123,
};

beforeEach(async () => {
  if (!USE_EMULATOR || EMULATOR_HOST !== "127.0.0.1:8180") throw new Error("These tests require the local Firestore emulator.");
  await clearAll();
  await seed("clients", "pipeline", [company], { keepIdField: true });
});

afterEach(() => vi.unstubAllGlobals());

afterAll(async () => {
  await Promise.all([terminate(db), terminate(clientsDb)]);
});

async function taskRules(content: string) {
  const response = await fetch(`http://${EMULATOR_HOST}/emulator/v1/projects/${PROJECTS.tasks}:securityRules`, {
    method: "PUT",
    headers: { Authorization: "Bearer owner", "Content-Type": "application/json" },
    body: JSON.stringify({ rules: { files: [{ name: "firestore.rules", content }] } }),
  });
  if (!response.ok) throw new Error(`Emulator rules failed: ${response.status} ${await response.text()}`);
}

describe("follow-up server", () => {
  it("reads each project from Node, using numeric company IDs and document task IDs", async () => {
    await seed("clients", "pipeline", [{ id: 902, company: "Fallback document ID" }]);
    await seed("tasks", "tasks", [parent, oldSubtask]);
    const data = await readFollowupData();
    expect(typeof window).toBe("undefined");
    expect(data.companies).toEqual(expect.arrayContaining([company, { id: 902, company: "Fallback document ID" }]));
    expect(data.tasks).toEqual(expect.arrayContaining([parent, oldSubtask]));
  });

  it("previews the six steps without writing anything", async () => {
    const preview = await previewFollowupPlan(fixture);
    expect(preview.canWrite).toBe(true);
    expect(preview.parent).toMatchObject({ task: `${company.company} Follow Up` });
    expect(preview.subtasks).toHaveLength(6);
    expect(await readAll("tasks", "tasks")).toEqual([]);
  });

  it("commits one parent and all six complete subtasks without a browser online flag", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    const result = await addFollowupPlan(fixture);
    expect(new Set([result.parentId, ...result.subtaskIds]).size).toBe(7);
    expect(await readAll("tasks", "tasks")).toHaveLength(7);
    expect(await readFields("tasks", `tasks/${result.parentId}`)).toMatchObject({
      task: `${company.company} Follow Up`, taskType: "Follow Up", linkedClientId: company.id,
      startDate: "2026-11-10", endDate: "2027-02-08", responsible: [], informed: [],
    });
    for (const [index, id] of result.subtaskIds.entries()) {
      const step = fixture.steps[index];
      const stored = await readFields("tasks", `tasks/${id}`);
      expect(stored).toMatchObject({
        parentId: result.parentId, linkedClientId: company.id, task: step.name,
        startDate: step.startDate, endDate: step.endDate, responsible: [], informed: [],
        keyPoints: [`Owner: ${step.owners}`, `What: ${step.what}`, `Why: ${step.why}`, `Bring: ${step.bring}`,
          `Watch: ${step.watch}`, `Done when: ${step.doneWhen}`].join("\n\n"),
      });
      expect(stored).not.toHaveProperty("id");
      expect(stored).not.toHaveProperty("taskGroup");
    }
    expect(await readFields("clients", `pipeline/${company.id}`)).toEqual(company);
  });

  it("appends new steps, extends only the deadline and leaves existing tasks untouched", async () => {
    const unrelated = { ...parent, id: "other-task", task: "Independent company task", endDate: "2027-12-31", order: 20 };
    await seed("tasks", "tasks", [parent, oldSubtask, unrelated]);
    const beforeParent = await readFields("tasks", `tasks/${parent.id}`);
    const beforeOld = await readFields("tasks", `tasks/${oldSubtask.id}`);
    const beforeOther = await readFields("tasks", `tasks/${unrelated.id}`);
    const result = await addFollowupPlan({ ...fixture, existingParentId: parent.id });
    expect(result.parentId).toBe(parent.id);
    expect(await readAll("tasks", "tasks")).toHaveLength(9);
    expect(await readFields("tasks", `tasks/${parent.id}`)).toEqual({ ...beforeParent, endDate: "2027-02-08" });
    expect(await readFields("tasks", `tasks/${oldSubtask.id}`)).toEqual(beforeOld);
    expect(await readFields("tasks", `tasks/${unrelated.id}`)).toEqual(beforeOther);
    for (const id of result.subtaskIds) {
      const stored = await readFields("tasks", `tasks/${id}`);
      expect(stored).toMatchObject({ parentId: parent.id, taskGroup: parent.taskGroup, responsible: [], informed: [] });
      expect(stored!.order).toBeGreaterThan(unrelated.order);
    }
    expect(await readFields("clients", `pipeline/${company.id}`)).toEqual(company);
  });

  it("does not shorten an existing parent's later deadline", async () => {
    await seed("tasks", "tasks", [{ ...parent, endDate: "2027-12-31" }, oldSubtask]);
    const before = await readFields("tasks", `tasks/${parent.id}`);
    await addFollowupPlan({ ...fixture, existingParentId: parent.id });
    expect(await readFields("tasks", `tasks/${parent.id}`)).toEqual(before);
  });

  it.each([false, true])("rolls back the whole batch when a later subtask is refused (append: %s)", async (append) => {
    if (append) await seed("tasks", "tasks", [parent, oldSubtask]);
    const before = await readAll("tasks", "tasks");
    // The parent and earlier subtasks are allowed; only the sixth subtask fails on the server.
    const originalRules = readFileSync(new URL("../firestore.rules", import.meta.url), "utf8");
    await taskRules(`rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /tasks/{id} {
      allow read: if true;
      allow write: if request.resource.data.task != '${fixture.steps[5].name}';
    }
  }
}`);
    try {
      await expect(addFollowupPlan({ ...fixture, ...(append && { existingParentId: parent.id }) }))
        .rejects.toMatchObject({ code: "permission-denied" });
      expect(await readAll("tasks", "tasks")).toEqual(before);
      expect(await readFields("clients", `pipeline/${company.id}`)).toEqual(company);
    } finally {
      await taskRules(originalRules);
    }
  });

  it.each([
    { ...fixture, companyId: 999 },
    { ...fixture, steps: [{ ...fixture.steps[0], startDate: "not-a-date" }] },
    { ...fixture, existingParentId: "missing-parent" },
  ])("writes nothing when validation refuses the input (%j)", async (input) => {
    await expect(addFollowupPlan(input)).rejects.toBeInstanceOf(FollowupPlanError);
    expect(await readAll("tasks", "tasks")).toEqual([]);
  });

  it("rechecks live data instead of writing a previously valid preview", async () => {
    expect((await previewFollowupPlan(fixture)).canWrite).toBe(true);
    await clearAll();
    await expect(addFollowupPlan(fixture)).rejects.toThrow("Company not found");
    expect(await readAll("tasks", "tasks")).toEqual([]);
  });

  it("refuses a plan larger than one batch instead of splitting it", async () => {
    const input = { ...fixture, steps: Array.from({ length: 500 }, () => fixture.steps[0]) };
    expect(await previewFollowupPlan(input)).toMatchObject({ canWrite: false, errors: [expect.stringContaining("499")] });
    await expect(addFollowupPlan(input)).rejects.toThrow("499");
    expect(await readAll("tasks", "tasks")).toEqual([]);
  });
});
