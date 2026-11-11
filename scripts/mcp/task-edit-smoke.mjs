// HTTP edit checks only; smoke.mjs owns the emulator, fake calendar and server PIDs.
import assert from "node:assert/strict";
import { toolsFor } from "./protocol-smoke.mjs";

const EDITS = ["find_tasks", "preview_task_changes", "apply_task_changes"];

export async function checkDisabledTaskEdits(context) {
  const { tools } = await context.client.listTools();
  assert.ok(tools.every((tool) => !EDITS.includes(tool.name)), "Unset edit flag must hide every edit tool.");
  assert.doesNotMatch(context.client.getInstructions() ?? "", /find_tasks|preview_task_changes|apply_task_changes/);
  const { refuse } = toolsFor(context);
  for (const name of EDITS) await refuse(`edit flag unset/${name}`, name, {}, /Tool not found/);
}

export async function checkTaskEditProtocol(context) {
  const { client, jiti, readAll, seed, unchanged, origin, emulatorHost } = context;
  assert.equal(emulatorHost, "127.0.0.1:8180", "Edit smoke requires the local emulator.");
  const { call, read, refuse } = toolsFor(context);
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((tool) => tool.name).sort(), [
    "find_company", "preview_followup_plan", "add_followup_plan",
    "find_task_destinations", "preview_task_plan", "add_task_plan", ...EDITS,
  ].sort());
  assert.match(client.getInstructions(), /category → company → main task → individual steps → preview → save/);
  for (const guidance of [client.getInstructions(), ...tools.filter((tool) => EDITS.includes(tool.name)).map((tool) => tool.description)]) {
    assert.match(guidance, /find_tasks.*before → after, one task at a time/);
    assert.match(guidance, /Never guess dates, times, people or which task is meant/);
    assert.match(guidance, /every warning, naming every task to delete one by one/);
    assert.match(guidance, /Edits and new plans are separate saves/);
  }

  const { TASK_PLAN_INTERNAL_PARENT: base } = await jiti.import("../../tests/fixtures/taskPlan.ts");
  const first = { ...base, id: "mcp-edit-first", task: "Fictional edit smoke first" };
  const second = { ...base, id: "mcp-edit-second", task: "Fictional edit smoke second", parentId: first.id, order: 101 };
  await seed("tasks", "tasks", [first, second]);
  const found = await read("find_tasks", { query: "Fictional edit smoke" });
  assert.equal(found.hasMore, false);
  assert.deepEqual(found.tasks.map((task) => task.id), [first.id, second.id]);
  assert.equal(found.tasks[0].subtasks[0].id, second.id);
  assert.deepEqual(found.tasks[1].mainTask, { id: first.id, task: first.task });
  for (const stored of [first, second]) {
    const match = found.tasks.find((task) => task.id === stored.id);
    for (const [field, value] of Object.entries(stored)) assert.deepEqual(match[field], value);
  }

  const changes = [
    { taskId: first.id, set: { task: "Fictional edit smoke renamed", responsible: ["Fictional edit smoke owner"] } },
    { taskId: second.id, set: { keyPoints: "Confirmed replacement\n  Keep the indentation." } },
  ];
  const preview = () => read("preview_task_changes", { changes });
  const argsFor = (shown) => ({ changes, seen: Object.fromEntries(shown.tasks.map((row) => [row.taskId, row.seen])),
    acknowledgedWarnings: shown.warnings.map((warning) => warning.id) });
  const original = await preview();
  assert.equal(original.canWrite, true);
  assert.deepEqual(original.errors, []);
  assert.deepEqual(original.tasks.map((row) => row.before), [first, second]);
  assert.ok(original.warnings.some((warning) => warning.code === "new-person"));
  for (const row of original.tasks) assert.match(row.seen, /^[a-f0-9]{64}$/);
  await refuse("edit warnings need confirmation", "apply_task_changes", { ...argsFor(original), acknowledgedWarnings: [] }, /Confirm these warnings/);

  // A concurrent app edit after preview must refuse the entire list, including the untouched first task.
  const concurrent = { ...second, keyPoints: "Fictional owner's edit after preview" };
  await seed("tasks", "tasks", [concurrent]);
  await refuse("edit changed-since refuses whole list", "apply_task_changes", argsFor(original), /changed since the preview.*preview again/i);
  const refreshed = await preview();
  assert.equal(refreshed.canWrite, true);
  assert.deepEqual(refreshed.tasks.find((row) => row.taskId === second.id).before, concurrent);
  const before = await readAll("tasks", "tasks");
  const saved = await call("apply_task_changes", argsFor(refreshed));
  assert.equal(saved.alreadySaved, false);
  assert.deepEqual(saved.tasks, [first, second].map(({ id }) => ({ taskId: id, saved: true, deleted: false,
    url: `${origin}/tasks?task=${id}`, calendar: null })));
  const after = await readAll("tasks", "tasks");
  assert.equal(after.length, before.length);
  for (const old of before) {
    const row = refreshed.tasks.find((entry) => entry.taskId === old.id);
    assert.deepEqual(after.find((task) => task.id === old.id), row ? row.after : old, "Only the previewed fields may change.");
  }

  // Compare Firestore update times as well as values: an identical rewrite must fail this retry check.
  async function updateTimes() {
    const response = await fetch(`http://${emulatorHost}/v1/projects/deus-team-tasks/databases/(default)/documents/tasks?pageSize=1000`, {
      headers: { Authorization: "Bearer owner" },
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.nextPageToken, undefined, "Retry check must inspect every fixture task.");
    return Object.fromEntries((body.documents ?? []).map((doc) => [doc.name, doc.updateTime]));
  }
  const timestamps = await updateTimes();
  await unchanged("edit lost-response retry writes nothing", async () => {
    assert.deepEqual(await call("apply_task_changes", argsFor(refreshed)), { ...saved, alreadySaved: true });
    assert.deepEqual(await updateTimes(), timestamps, "An already-saved retry must not rewrite tasks.");
  });
  console.log("Task edits MCP: find/current fields, read-only previews, warning confirmation, whole-list stale refusal, exact save and no-write retry passed.");
}
