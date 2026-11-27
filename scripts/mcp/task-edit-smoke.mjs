// HTTP task checks only; smoke.mjs owns the emulators, fake services and server PIDs.
import assert from "node:assert/strict";
import { toolsFor } from "./protocol-smoke.mjs";

const EDITS = ["find_tasks", "preview_task_changes", "apply_task_changes"];
const GROUPS = ["list_task_groups", "change_task_group"];
const COMPANIES = ["list_companies", "preview_company_changes", "apply_company_changes"];

const editSaveArgs = (changes, shown) => ({
  changes, seen: shown.seen ?? Object.fromEntries(shown.tasks.map((row) => [row.taskId, row.seen])),
  acknowledgedWarnings: shown.warnings.map((warning) => warning.id),
});

export async function checkDisabledTaskEdits(context) {
  const { tools } = await context.client.listTools();
  const disabled = [...EDITS, ...GROUPS, ...COMPANIES];
  assert.ok(tools.every((tool) => !disabled.includes(tool.name)), "Unset edit flag must hide the edit, group and company tools.");
  assert.doesNotMatch(context.client.getInstructions() ?? "", new RegExp(disabled.join("|")));
  const { refuse } = toolsFor(context);
  for (const name of disabled) await refuse(`edit flag unset/${name}`, name, {}, /Tool not found/);
}

export async function checkTaskEditProtocol(context) {
  const { client, jiti, readAll, seed, unchanged, origin, emulatorHost } = context;
  assert.equal(emulatorHost, "127.0.0.1:8180", "Edit smoke requires the local emulator.");
  const { call, read, refuse } = toolsFor(context);
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((tool) => tool.name).sort(), [
    "find_company", "preview_followup_plan", "add_followup_plan",
    "find_free_times", "find_task_destinations", "preview_task_plan", "add_task_plan", ...EDITS, ...GROUPS, ...COMPANIES,
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
  const argsFor = (shown) => editSaveArgs(changes, shown);
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
  await checkCompanyResponsible(context, base);
  await checkCompanyGroups(context, base);
}

export async function checkCompanyChatProtocol(context) {
  const { client, seed } = context;
  const { read, refuse } = toolsFor(context);
  const { tools } = await client.listTools();
  const apply = tools.find((tool) => tool.name === "apply_company_changes");
  assert.equal(apply.annotations.readOnlyHint, false);
  assert.equal(apply.annotations.destructiveHint, true);
  assert.match(apply.description, /owner's explicit yes/);
  assert.match(client.getInstructions(), /Create companies only with preview_company_changes and apply_company_changes/);
  await refuse("company tools reject unknown keys", "preview_company_changes", { unknown: true }, /Check the tool inputs.*unknown/);
  await refuse("company tools reject 201 PIC changes", "apply_company_changes", { setPic: [
    { pic: null, companyIds: Array.from({ length: 200 }, (_, i) => i) }, { pic: null, companyIds: [200] },
  ] }, /Check the tool inputs.*split it/);

  const docs = Array.from({ length: 250 }, (_, i) => ({
    id: 5000 + i,
    company: `Fictional C2 ${String(i).padStart(3, "0")}${i < 3 ? " Alpha" : ""}`,
    ...(i === 0 ? { _hold: true, industry: "Solar Power", pic: "Company Contact", teamPic: "Maya Chen" } : {}),
    ...(i === 1 ? { _hold: true, industry: "Banking", teamPic: "Maya  Chen" } : {}),
    ...(i === 2 ? { _raw: true, industry: "Solar Power", teamPic: "  " } : {}),
    ...(i === 3 ? { _hold: true, industry: "Solar Power" } : {}),
    ...(i === 4 ? { status: "Client / Partner Done Deal" } : {}),
  }));
  const [legacy, ...current] = docs;
  await seed("clients", "pipeline", [legacy]);
  await seed("clients", "pipeline", current, { keepIdField: true });

  const query = "fictional c2";
  for (const offset of [0, 100, 200, 300]) {
    const page = await read("list_companies", { query, offset });
    assert.equal(page.total, 250);
    assert.equal(page.hasMore, offset < 200);
    assert.deepEqual(page.companies.map(({ id }) => id), docs.slice(offset, offset + 100).map(({ id }) => id));
  }
  const unset = await read("list_companies", { query, pic: null, offset: 200 });
  assert.equal(unset.total, 248);
  assert.equal(unset.companies.length, 48);
  assert.ok(unset.companies.every(({ pic }) => pic === null));
  const blank = await read("list_companies", { query: "002 Alpha", pic: null });
  assert.deepEqual(blank.companies.map(({ id }) => id), [5002]);
  const maya = await read("list_companies", { query, pic: "maya  CHEN" });
  assert.deepEqual(maya.companies.map(({ id }) => id), [5000, 5001]);
  const filtered = await read("list_companies", { query: "ALPHA", industry: "solar", group: "No or not now" });
  assert.deepEqual(filtered, { total: 1, hasMore: false, companies: [{
    id: 5000, company: docs[0].company, group: "No or not now", pic: "Maya Chen",
    contactPerson: "Company Contact", status: null, industry: "Solar Power",
  }] });
  const clients = await read("list_companies", { query, group: "Active clients and partners" });
  assert.deepEqual(clients.companies.map(({ id, group }) => [id, group]), [[5004, "Active clients and partners"]]);
  console.log("Company MCP: flag, input errors, 250 results in 100-row pages, combined filters, legacy ID and app group names checked.");
}

async function checkCompanyGroups(context, base) {
  const { origin, readAll, seed, unchanged } = context;
  const { call, read, refuse } = toolsFor(context);
  const name = "Smoke Partners";
  const newName = "Smoke Allies";
  const company = { id: 9355, company: "PT Fiktif MCP Groups" };
  const companyTask = { ...base, linkedClientId: company.id, responsible: ["Audrey"] };
  delete companyTask.taskGroup;
  const main = Array.from({ length: 50 }, (_, index) => {
    const suffix = String(index + 1).padStart(2, "0");
    return { ...companyTask, id: `mcp-group-main-${suffix}`, task: `Fictional group main ${suffix}`, order: 600 + index,
      ...(index === 0 ? { parkedAt: Date.UTC(2026, 10, 1), parkedUntil: null } : {}) };
  });
  const children = main.slice(0, 5).map((parent, index) => ({
    ...companyTask, id: `${parent.id}-child`, task: `Fictional group step ${index + 1}`, parentId: parent.id,
    order: 650 + index, ...(index === 0 ? { calendar: {} } : {}),
  }));
  const done = { ...companyTask, id: "mcp-group-done", task: "Fictional group finished action", completed: true };
  await seed("clients", "pipeline", [company], { keepIdField: true });
  await seed("tasks", "tasks", [...main, ...children, done]);
  const sideEffects = () => Promise.all([readAll("tasks", "_fakePush"), readAll("tasks", "testCalendarEvents"),
    readAll("clients", "pipeline")]);
  const originalSideEffects = await sideEffects();

  async function findAll(filters, total) {
    const tasks = [];
    for (let offset = 0; offset < total; offset += 10) {
      const page = await read("find_tasks", { companyId: company.id, ...filters, offset });
      assert.equal(page.total, total);
      assert.equal(page.tasks.length, Math.min(10, total - offset));
      assert.equal(page.hasMore, offset + page.tasks.length < total);
      tasks.push(...page.tasks);
    }
    return tasks;
  }

  async function apply(changes, patch) {
    const shown = await read("preview_task_changes", { changes });
    assert.equal(shown.canWrite, true);
    assert.deepEqual(shown.errors, []);
    assert.deepEqual(shown.warnings, []);
    assert.deepEqual(shown.unchanged ?? [], []);
    assert.deepEqual(shown.tasks.map(({ taskId, patch: shownPatch }) => ({ taskId, patch: shownPatch })),
      changes.map(({ taskId }) => ({ taskId, patch })));
    const args = editSaveArgs(changes, shown);
    const saved = await call("apply_task_changes", args);
    assert.equal(saved.alreadySaved, false);
    assert.deepEqual(saved.tasks, changes.map(({ taskId }) => ({ taskId, saved: true, deleted: false,
      url: `${origin}/tasks?task=${taskId}`, calendar: null })));
    return { args, saved };
  }

  const created = await call("change_task_group", { action: "create", name });
  assert.equal(created.created, true);
  assert.ok(created.id);
  const groups = async () => (await read("list_task_groups", {})).groups;
  const groupRow = async () => (await groups()).find(({ id }) => id === created.id);
  assert.deepEqual(await groupRow(), { id: created.id, name, starred: false, openTasks: 0, taskCount: 0 });
  await refuse("group name already taken, ignoring case", "change_task_group", { action: "create", name: name.toLowerCase() }, /already exists/);

  const found = await findAll({}, 55);
  assert.deepEqual(found.map(({ id }) => id), [...main, ...children].map(({ id }) => id));
  assert.deepEqual(found.filter(({ parked }) => parked).map(({ id }) => id), [main[0].id]);
  const foundMain = found.filter(({ mainTask }) => mainTask === null);
  for (const parent of foundMain) {
    assert.deepEqual(parent.subtasks.map(({ id }) => id), children.filter(({ parentId }) => parentId === parent.id).map(({ id }) => id));
  }
  const picked = [...foundMain, ...foundMain.flatMap(({ subtasks }) => subtasks)].map(({ id }) => id);
  assert.deepEqual(picked, found.map(({ id }) => id));
  const move = (ids, taskGroup) => apply(ids.map((taskId) => ({ taskId, set: { taskGroup } })),
    taskGroup === null ? {} : { taskGroup: name });
  const firstBatch = await move(picked.slice(0, 50), name.toLowerCase());
  await move(picked.slice(50), name);

  const grouped = await findAll({ group: name, includeDone: true }, 55);
  assert.deepEqual(grouped.map(({ id }) => id), picked);
  assert.ok(grouped.every(({ taskGroup }) => taskGroup === name));
  assert.deepEqual(grouped.filter(({ parked }) => parked).map(({ id }) => id), [main[0].id]);
  assert.deepEqual(grouped.flatMap(({ subtasks }) => subtasks.map(({ id, taskGroup }) => ({ id, taskGroup }))),
    children.map(({ id }) => ({ id, taskGroup: name })));
  const parkedCount = await groupRow();
  assert.deepEqual(parkedCount, { id: created.id, name, starred: false, openTasks: 54, taskCount: 55 });

  // Search includes parked tasks for bulk moves; the app's open count includes them once unparked.
  await apply([{ taskId: main[0].id, set: { parked: false } }], {});
  const allOpen = await groupRow();
  assert.deepEqual(allOpen, { ...parkedCount, openTasks: 55 });
  const cleared = picked.slice(0, 2);
  await move(cleared, null);
  assert.deepEqual((await findAll({ group: null }, 2)).map(({ id }) => id), cleared);

  const remaining = await groupRow();
  assert.deepEqual(remaining, { ...allOpen, openTasks: 53, taskCount: 53 });
  const rename = { action: "rename", name, newName, taskCount: remaining.taskCount };
  assert.deepEqual(await call("change_task_group", rename), { renamed: true, name: newName, tasksMoved: 53 });
  assert.deepEqual(await groupRow(), { ...remaining, name: newName });
  assert.ok((await groups()).every((group) => group.name !== name));
  assert.deepEqual((await findAll({ group: newName }, 53)).map(({ id }) => id), picked.slice(2));
  await unchanged("group move retry after rename and clearing", async () => {
    assert.deepEqual(await call("apply_task_changes", firstBatch.args), { ...firstBatch.saved, alreadySaved: true });
  });

  const deletion = { action: "delete", name: newName, taskCount: remaining.taskCount };
  await refuse("stale group deletion", "change_task_group", { ...deletion, taskCount: allOpen.taskCount }, /count.*changed from 55 to 53/);
  assert.deepEqual(await call("change_task_group", deletion), { deleted: true, name: newName, tasksUngrouped: 53 });
  assert.ok((await groups()).every((group) => group.id !== created.id && group.name !== newName));
  assert.deepEqual((await findAll({ group: null }, 55)).map(({ id }) => id), picked);
  await unchanged("group delete retry", async () => {
    assert.deepEqual(await call("change_task_group", deletion), { alreadyDone: true });
  });
  const stored = new Map((await readAll("tasks", "tasks")).map((task) => [task.id, task]));
  const unparked = { ...main[0] };
  delete unparked.parkedAt;
  delete unparked.parkedUntil;
  for (const task of [unparked, ...main.slice(1), ...children, done]) assert.deepEqual(stored.get(task.id), task, task.id);
  assert.deepEqual(await sideEffects(), originalSideEffects, "Group edits must preserve push, calendar and company data.");
  console.log("Company groups MCP: moved 55 in two batches, kept subtasks and company links, renamed 53, refused stale deletion, and ungrouped all 53 on delete.");
}

async function checkCompanyResponsible(context, base) {
  const { jiti, readAll, seed, unchanged } = context;
  const { call, read } = toolsFor(context);
  const { subscription } = await jiti.import("../../tests/support/push.ts");
  const { pushDeviceId } = await jiti.import("../../lib/pushInput.server.ts");
  const email = "mcp-smoke-audrey@deushcs.com";
  const device = subscription("mcp-smoke");
  await seed("tasks", "people", [{ id: email, email, name: "Audrey", active: true }]);
  await seed("tasks", `people/${email}/devices`, [{ id: pushDeviceId(device.endpoint), ...device }]);

  const company = { id: 9323, company: "PT Fiktif MCP Responsible" };
  const companyTask = { ...base, linkedClientId: company.id, responsible: ["Greg"] };
  const mainId = "mcp-responsible-00";
  const open = Array.from({ length: 23 }, (_, i) => {
    const suffix = String(i).padStart(2, "0");
    return {
      ...companyTask, id: `mcp-responsible-${suffix}`, order: 500 + i,
      task: `Fictional company action ${i === 10 ? "09" : suffix}`,
      responsible: i % 2 ? ["Greg"] : [],
      ...(i >= 20 ? { parentId: mainId } : {}),
      ...(i === 21 ? { parkedAt: Date.UTC(2026, 10, 1), parkedUntil: null } : {}),
      ...(i === 0 ? { calendar: {} } : {}),
    };
  });
  const done = { ...companyTask, id: "mcp-responsible-done", task: "Fictional company finished action", completed: true };
  const unrelated = { ...base, id: "mcp-responsible-unlinked", keyPoints: company.company, responsible: ["Audrey"] };
  await seed("clients", "pipeline", [company], { keepIdField: true });
  await seed("tasks", "tasks", [...open, done, unrelated]);

  const destination = await read("find_task_destinations", { kind: "prospect", companyQuery: company.company });
  assert.deepEqual(destination.errors, []);
  assert.deepEqual(destination.companies.map(({ id, eligible }) => ({ id, eligible })), [{ id: company.id, eligible: true }]);
  const companyId = destination.companies[0].id;
  const original = new Map(open.map((task) => [task.id, task]));
  const assigned = (task) => [...task.responsible, "Audrey"];
  const existing = (task) => task.responsible;

  async function findOpen(responsibleFor) {
    const tasks = [];
    for (const size of [10, 10, 3]) {
      const page = await read("find_tasks", { companyId, offset: tasks.length });
      assert.equal(page.tasks.length, size);
      assert.equal(page.total, open.length);
      assert.equal(page.hasMore, tasks.length + size < open.length);
      tasks.push(...page.tasks);
    }
    assert.deepEqual(tasks.map(({ id }) => id), open.map(({ id }) => id));
    assert.deepEqual(tasks.filter(({ parked }) => parked).map(({ id }) => id), [open[21].id]);
    const childIds = open.slice(20).map(({ id }) => id);
    assert.deepEqual(tasks.filter(({ mainTask }) => mainTask?.id === mainId).map(({ id }) => id), childIds);
    assert.deepEqual(tasks[0].subtasks.map(({ id, responsible }) => ({ id, responsible })),
      childIds.map((id) => ({ id, responsible: responsibleFor(original.get(id)) })));
    for (const { id, responsible } of tasks) assert.deepEqual(responsible, responsibleFor(original.get(id)), id);
    return tasks;
  }

  async function checkStored(responsibleFor) {
    const stored = new Map((await readAll("tasks", "tasks")).map((task) => [task.id, task]));
    for (const task of open) assert.deepEqual(stored.get(task.id), { ...task, responsible: responsibleFor(task) }, task.id);
    assert.deepEqual(stored.get(done.id), done, "The done task must stay untouched.");
    assert.deepEqual(stored.get(unrelated.id), unrelated, "Mentioning a company does not link a task to it.");
  }

  const pushes = () => readAll("tasks", "_fakePush");
  let delivered = await pushes();
  async function checkPush(count) {
    const after = await pushes();
    const priorIds = new Set(delivered.map(({ id }) => id));
    assert.deepEqual(after.filter(({ id }) => priorIds.has(id)), delivered);
    assert.deepEqual(after.filter(({ id }) => !priorIds.has(id)).map(({ email, title, body, url }) => ({ email, title, body, url })), [
      { email, title: `${count} new tasks for you`, body: company.company, url: "/" },
    ]);
    delivered = after;
  }

  async function saveBatch(tasks, action, before, after) {
    const changes = tasks.map(({ id }) => ({ taskId: id, set: { [action]: [" audrey ", "AUDREY"] } }));
    const shown = await read("preview_task_changes", { changes });
    assert.equal(shown.canWrite, true);
    assert.deepEqual(shown.errors, []);
    assert.deepEqual(shown.warnings, []);
    assert.deepEqual(shown.unchanged, []);
    assert.deepEqual(shown.tasks.map(({ taskId }) => taskId), tasks.map(({ id }) => id));
    for (const row of shown.tasks) {
      assert.deepEqual(row.before.responsible, before(original.get(row.taskId)));
      assert.deepEqual(row.after.responsible, after(original.get(row.taskId)));
    }
    const args = editSaveArgs(changes, shown);
    const saved = await call("apply_task_changes", args);
    assert.equal(saved.alreadySaved, false);
    assert.deepEqual(saved.tasks, tasks.map(({ id }) => ({
      taskId: id, saved: true, deleted: false, url: `${context.origin}/tasks?task=${id}`, calendar: null,
    })));
    return { args, saved };
  }

  const tasks = await findOpen(existing);
  const batches = [tasks.slice(0, 20), tasks.slice(20)];
  const calendarBefore = await readAll("tasks", "testCalendarEvents");
  await saveBatch(batches[0], "addResponsible", existing, assigned);
  await checkPush(20);
  const addLast = await saveBatch(batches[1], "addResponsible", existing, assigned);
  await checkPush(3);
  await findOpen(assigned);
  await checkStored(assigned);

  for (const batch of batches) await saveBatch(batch, "removeResponsible", assigned, existing);
  await unchanged("old Responsible add retried after removal", async () => {
    assert.deepEqual(await call("apply_task_changes", addLast.args), { ...addLast.saved, alreadySaved: true });
  });
  await findOpen(existing);
  await checkStored(existing);
  assert.deepEqual(await pushes(), delivered, "Removal and retry must send no additional push.");
  assert.deepEqual(await readAll("tasks", "testCalendarEvents"), calendarBefore);

  const plan = {
    kind: "prospect", companyId,
    newParent: { title: "Fictional Responsible follow-up", responsible: ["Audrey"] },
    steps: ["Confirm the fictional scope", "Send the fictional outline"].map((name, i) => ({
      name, startDate: `2030-01-0${i + 7}`, endDate: `2030-01-0${i + 7}`, responsible: ["Audrey"],
    })),
  };
  const shown = await read("preview_task_plan", { plan });
  assert.equal(shown.canWrite, true);
  assert.deepEqual(shown.errors, []);
  assert.deepEqual(shown.warnings, []);
  assert.deepEqual(shown.parent.responsible, ["Audrey"]);
  assert.deepEqual(shown.subtasks.map(({ responsible }) => responsible), [["Audrey"], ["Audrey"]]);
  const args = { plan, previewToken: shown.previewToken, acknowledgedWarnings: [] };
  const saved = await call("add_task_plan", args);
  assert.equal(saved.alreadySaved, false);
  assert.equal(new Set([saved.parentId, ...saved.subtaskIds]).size, 3);
  const stored = new Map((await readAll("tasks", "tasks")).map((task) => [task.id, task]));
  assert.deepEqual(stored.get(saved.parentId).responsible, ["Audrey"]);
  assert.equal(stored.get(saved.parentId).linkedClientId, companyId);
  assert.deepEqual(saved.subtaskIds.map((id) => {
    const { task, parentId, linkedClientId, responsible } = stored.get(id);
    return { task, parentId, linkedClientId, responsible };
  }), plan.steps.map(({ name, responsible }) => ({ task: name, parentId: saved.parentId, linkedClientId: companyId, responsible })));
  await checkPush(3);
  await unchanged("Responsible plan lost-response retry", async () => {
    assert.deepEqual(await call("add_task_plan", args), { ...saved, alreadySaved: true });
  });
  assert.deepEqual(await pushes(), delivered, "Repeating a plan save must preserve its one push.");
  console.log("Company Responsible MCP: 23 open tasks in three pages, parked included, 20+3 adds with one push each, removals preserve Greg, plan parent and steps save with one push, retries safe.");
}
