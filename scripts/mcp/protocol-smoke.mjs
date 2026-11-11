// Real HTTP/tool behavior only; the shared smoke harness owns servers and secrets.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { payload } from "./legacy-smoke.mjs";

const GENERAL = ["add_task_plan", "find_task_destinations", "preview_task_plan"];
const LEGACY = ["add_followup_plan", "find_company", "preview_followup_plan"];

export function toolsFor({ client, unchanged, safe }) {
  const call = async (name, args) => payload(await client.callTool({ name, arguments: args }));
  const read = (name, args) => unchanged(name, () => call(name, args));
  async function refuse(label, name, args, pattern) {
    return unchanged(label, async () => {
      let message;
      try {
        const result = await client.callTool({ name, arguments: args });
        assert.equal(result.isError, true, `${label}: a refused call must report an error`);
        message = result.content.find((part) => part.type === "text")?.text;
      } catch (error) {
        // Input/schema errors are JSON-RPC errors; storage/token errors are tool results.
        if (typeof error.code !== "number") throw error;
        message = error.message;
      }
      safe(message);
      assert.match(message, pattern, label);
    });
  }
  return { call, read, refuse };
}

export async function checkDisabledTools(context) {
  const { client } = context;
  const { refuse } = toolsFor(context);
  assert.equal(client.getInstructions(), undefined);
  const plan = { kind: "internal", newParent: { title: "Disabled fictional plan" },
    steps: [{ name: "Disabled step", startDate: "2027-01-01", endDate: "2027-01-02" }] };
  for (const [name, args] of [
    ["find_task_destinations", { kind: "internal" }],
    ["preview_task_plan", { plan }],
    ["add_task_plan", { plan, previewToken: "unused", acknowledgedWarnings: [] }],
  ]) await refuse(`flag off/${name}`, name, args, /Tool not found/);
}

export async function checkGeneralProtocol(context) {
  const { client, jiti, readAll, seed, unchanged, root, origin, emulatorHost, secret } = context;
  const { call, read, refuse } = toolsFor(context);
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((tool) => tool.name).sort(), [...GENERAL, ...LEGACY].sort());
  assert.match(client.getInstructions(), /category → company → main task → individual steps → preview → save/);
  for (const name of GENERAL) {
    const tool = tools.find((entry) => entry.name === name);
    assert.equal(tool.annotations.readOnlyHint, name !== "add_task_plan");
    assert.equal(tool.annotations.idempotentHint, true);
    assert.match(tool.description, /EACH step separately.*change dates, or skip/s);
    assert.match(tool.description, /token proves input integrity, not human consent/);
  }
  const f = await jiti.import("../../tests/fixtures/taskPlan.ts");
  const companies = [f.TASK_PLAN_PROSPECT, f.TASK_PLAN_CLIENT];
  const parents = [f.TASK_PLAN_PROSPECT_PARENT, f.TASK_PLAN_CLIENT_PARENT, f.TASK_PLAN_INTERNAL_PARENT];
  const bases = [f.TASK_PLAN_PROSPECT_NEW, f.TASK_PLAN_CLIENT_NEW, f.TASK_PLAN_INTERNAL_NEW];
  await seed("clients", "pipeline", companies, { keepIdField: true });
  const oldChildren = parents.map((parent) => ({ ...parent, id: `${parent.id}-old-child`,
    parentId: parent.id, task: "Existing fictional child", completed: true, order: parent.order + 1 }));
  await seed("tasks", "tasks", [...parents, ...oldChildren]);
  const storedCompanies = await readAll("clients", "pipeline");
  const stripMarker = ({ taskPlanOperation, ...record }) => {
    assert.match(taskPlanOperation.hash, /^[a-f0-9]{64}$/);
    return record;
  };
  const argsFor = (plan, shown) => ({ plan, previewToken: shown.previewToken,
    acknowledgedWarnings: shown.warnings.map((warning) => warning.id) });
  const preview = (plan) => read("preview_task_plan", { plan });
  const save = (plan, shown) => call("add_task_plan", argsFor(plan, shown));

  for (const [index, base] of bases.entries()) {
    const selection = { kind: base.kind, ...(base.companyId !== undefined && { companyId: base.companyId }) };
    if (base.companyId !== undefined) {
      const search = await read("find_task_destinations", { kind: base.kind, companyQuery: companies[index].company });
      assert.equal(search.companies[0].id, base.companyId);
      assert.equal(search.companies[0].eligible, true);
      assert.deepEqual(search.parents, [], "A name search must not silently select a company.");
    }
    const found = await read("find_task_destinations", selection);
    assert.deepEqual(found.errors, []);
    assert.deepEqual(found.parents.map((parent) => parent.id), [parents[index].id]);

    for (const mode of ["new", "append"]) {
      // Simulate individual add/skip choices: the middle candidate never enters the wire plan.
      const candidates = [0, 1, 2].map((n) => ({ ...base.steps[n % base.steps.length],
        name: `Fictional ${base.kind} ${mode} action ${n + 1}` }));
      const plan = { ...selection,
        ...(mode === "new" ? { newParent: { ...base.newParent, title: `Fictional ${base.kind} protocol main` } }
          : { existingParentId: parents[index].id }),
        steps: [candidates[0], candidates[2]],
      };
      const before = await readAll("tasks", "tasks");
      const receipts = await readAll("tasks", "settings");
      const shown = await preview(plan);
      assert.equal(shown.canWrite, true);
      assert.deepEqual(shown.errors, []);
      assert.equal(typeof shown.previewToken, "string");
      assert.equal(shown.destination.kind, base.kind);
      assert.equal(shown.destination.company?.id ?? null, base.companyId ?? null);
      assert.equal(shown.subtasks.length, 2);
      if (mode === "new") {
        assert.equal(shown.parent.taskType, "Our Action");
        assert.equal(shown.parent.startDate, "2026-12-28");
        assert.equal(shown.parent.endDate, "2027-01-04");
      } else {
        assert.equal(shown.parent, null);
        assert.match(shown.preservationNotes.join(" "), /unchanged|preserv/i);
      }
      const results = await Promise.all([save(plan, shown), save(plan, shown)]);
      assert.equal(results.filter((result) => !result.alreadySaved).length, 1, "Concurrent calls create exactly once.");
      const added = results.find((result) => !result.alreadySaved);
      assert.deepEqual(results.find((result) => result.alreadySaved), { ...added, alreadySaved: true });
      assert.equal(added.url, `${origin}/tasks?task=${added.parentId}`);
      assert.equal(added.destination.kind, base.kind);
      assert.equal(added.destination.parent.name, shown.destination.parent.name);
      const after = await readAll("tasks", "tasks");
      assert.equal(after.length, before.length + (mode === "new" ? 3 : 2));
      for (const old of before) assert.deepEqual(after.find((task) => task.id === old.id), old);
      assert.deepEqual(await readAll("clients", "pipeline"), storedCompanies);
      const newReceipts = await readAll("tasks", "settings");
      assert.equal(newReceipts.length, receipts.length + 1);
      for (const old of receipts) assert.deepEqual(newReceipts.find((receipt) => receipt.id === old.id), old);
      if (shown.parent) assert.deepEqual(stripMarker(after.find((task) => task.id === added.parentId)), { ...shown.parent, id: added.parentId });
      for (const [n, id] of added.subtaskIds.entries()) {
        const task = after.find((entry) => entry.id === id);
        assert.deepEqual(stripMarker(task), { ...shown.subtasks[n], id, parentId: added.parentId });
        assert.equal(task.taskPlanOperation.index, n);
        assert.deepEqual(task.responsible, []);
        assert.deepEqual(task.informed, []);
        assert.equal(task.linkedClientId ?? null, base.companyId ?? null);
        assert.equal(task.taskGroup, mode === "append" ? parents[index].taskGroup : shown.parent.taskGroup);
      }
      assert.ok(!after.some((task) => task.task === candidates[1].name), "A skipped candidate was saved.");
      // Treat the successful response as lost and retry the original wire request.
      await unchanged(`${base.kind}/${mode} lost-response retry`, async () => {
        assert.deepEqual(await save(plan, shown), { ...added, alreadySaved: true });
      });
      const refreshed = await preview(plan);
      assert.equal(refreshed.alreadySaved.parentId, added.parentId);
      assert.deepEqual(refreshed.alreadySaved.subtaskIds, added.subtaskIds);
      assert.deepEqual(refreshed.warnings, []);
      await unchanged(`${base.kind}/${mode} refreshed retry`, async () => {
        assert.deepEqual(await save(plan, refreshed), { ...added, alreadySaved: true });
      });
    }
  }
  console.log("General MCP: six create/append destinations, selected steps, exact records, concurrent/lost-response/refreshed retries passed.");

  const calendarPlan = { kind: "internal", newParent: { title: "Fictional calendar protocol plan" }, steps: [
    { name: "Fictional timed meeting", startDate: "2027-02-01", endDate: "2027-02-01", calendar: { startTime: "14:00", endTime: "15:00" } },
    { name: "Fictional all-day visit", startDate: "2027-02-02", endDate: "2027-02-03", calendar: {} },
    { name: "Fictional task only", startDate: "2027-02-04", endDate: "2027-02-04" },
  ] };
  const calendarPreview = await preview(calendarPlan);
  const { calendarEventId } = await jiti.import("../../lib/taskCalendar.ts");
  const failedTaskId = `${calendarPreview.parentId}-2`;
  await seed("tasks", "settings", [{ id: "test-calendar", fail: 503, failEventId: await calendarEventId(failedTaskId) }]);
  const calendarSaved = await save(calendarPlan, calendarPreview);
  assert.equal(calendarSaved.alreadySaved, false);
  assert.deepEqual(calendarSaved.subtasks, [
    { taskId: calendarSaved.subtaskIds[0], calendar: { status: "added", link: `https://calendar.example.test/event/${await calendarEventId(calendarSaved.subtaskIds[0])}` } },
    { taskId: failedTaskId, calendar: { status: "failed", error: "The calendar couldn't be updated. Try again." } },
    { taskId: calendarSaved.subtaskIds[2] },
  ]);
  const beforeCalendarRetry = await readAll("tasks", "tasks");
  assert.equal(beforeCalendarRetry.filter((task) => [calendarSaved.parentId, ...calendarSaved.subtaskIds].includes(task.id)).length, 4);
  const fakeEvents = async () => (await readAll("tasks", "testCalendarEvents")).map((entry) => JSON.parse(entry.event));
  const timedEvent = (await fakeEvents())[0];
  assert.equal((await fakeEvents()).length, 1);
  assert.deepEqual(timedEvent.start, { dateTime: "2027-02-01T14:00:00", timeZone: "Asia/Jakarta" });
  assert.deepEqual(timedEvent.end, { dateTime: "2027-02-01T15:00:00", timeZone: "Asia/Jakarta" });
  assert.match(timedEvent.description, new RegExp(`${origin}/tasks\\?task=${calendarSaved.subtaskIds[0]}`));
  for (const [i, id] of calendarSaved.subtaskIds.entries()) {
    const task = beforeCalendarRetry.find((task) => task.id === id);
    assert.deepEqual(task.calendar, calendarPlan.steps[i].calendar);
  }
  // Failing the previously successful event proves that the exact retry leaves it alone.
  await seed("tasks", "settings", [{ id: "test-calendar", fail: 503, failEventId: timedEvent.id }]);
  const calendarRetried = await save(calendarPlan, calendarPreview);
  assert.deepEqual(calendarRetried, { ...calendarSaved, alreadySaved: true, subtasks: [
    calendarSaved.subtasks[0],
    { taskId: failedTaskId, calendar: { status: "added", link: `https://calendar.example.test/event/${await calendarEventId(failedTaskId)}` } },
    calendarSaved.subtasks[2],
  ] });
  const calendarEvents = await fakeEvents();
  assert.equal(calendarEvents.length, 2);
  assert.deepEqual(calendarEvents.find((event) => event.id === timedEvent.id), timedEvent);
  const allDayEvent = calendarEvents.find((event) => event.id !== timedEvent.id);
  assert.deepEqual(allDayEvent.start, { date: "2027-02-02" });
  assert.deepEqual(allDayEvent.end, { date: "2027-02-04" });
  const withoutSync = (task) => {
    const fields = { ...task };
    delete fields.calendarSync;
    return fields;
  };
  assert.deepEqual((await readAll("tasks", "tasks")).map(withoutSync), beforeCalendarRetry.map(withoutSync));
  await seed("tasks", "settings", [{ id: "test-calendar", fail: 503 }]);
  const refreshedCalendarPreview = await preview(calendarPlan);
  await unchanged("calendar retry skips current events", async () => {
    assert.deepEqual(await save(calendarPlan, refreshedCalendarPreview), calendarRetried);
  });
  assert.deepEqual(await fakeEvents(), calendarEvents);
  await seed("tasks", "settings", [{ id: "test-calendar", fail: 0 }]);
  console.log("General MCP: mixed calendar plan, partial failure, per-step results, exact retry, preserved task data and duplicate-free calendar events passed.");

  const fresh = { kind: "internal", newParent: { title: "Fictional protocol refusal target" },
    steps: [{ name: "Fictional selected refusal action", startDate: "2027-03-01", endDate: "2027-03-02", owners: "Fictional person", keyPoints: "Keep this prose.\n  And its indentation." }] };
  // An all-skipped chat must make no calls; reject an accidental empty wire plan too.
  const shown = await preview(fresh);
  const addArgs = argsFor(fresh, shown);
  const malformed = [
    ["empty selection", { ...fresh, steps: [] }, /1|small|least/i],
    ["impossible date", { ...fresh, steps: [{ ...fresh.steps[0], startDate: "2027-02-30" }] }, /real yyyy-mm-dd/],
    ["reversed dates", { ...fresh, steps: [{ ...fresh.steps[0], startDate: "2027-03-03" }] }, /must not be after/],
    ["relative date", { ...fresh, steps: [{ ...fresh.steps[0], startDate: "tomorrow" }] }, /real yyyy-mm-dd/],
    ["internal company", { ...fresh, companyId: companies[0].id }, /forbidden/],
    ["company omitted", { ...fresh, kind: "prospect" }, /companyId/],
    ["both main tasks", { ...fresh, existingParentId: parents[2].id }, /exactly one/],
    ["unknown field", { ...fresh, unexpected: true }, /unrecognized|supported/i],
  ];
  for (const [label, plan, error] of malformed) {
    await refuse(`${label}/preview`, "preview_task_plan", { plan }, error);
    await refuse(`${label}/add`, "add_task_plan", { ...addArgs, plan }, error);
  }
  for (const [label, plan, error] of [
    ["category mismatch", { ...fresh, kind: "client", companyId: companies[0].id }, /belongs to Prospects/],
    ["missing company", { ...fresh, kind: "prospect", companyId: 999999 }, /Company .*not found/],
    ["missing parent", { kind: "internal", existingParentId: "fictional-missing-parent", steps: fresh.steps }, /Main task .*not found/],
    ["parent category mismatch", { kind: "internal", existingParentId: parents[0].id, steps: fresh.steps }, /no longer belongs/],
  ]) {
    const invalid = await preview(plan);
    assert.equal(invalid.canWrite, false);
    assert.match(invalid.errors.join(" "), error);
    assert.equal(invalid.previewToken, undefined);
    // An invalid preview never grants authority to reuse another input's token.
    await refuse(`${label}/add`, "add_task_plan", { ...addArgs, plan, previewToken: shown.previewToken }, /changed after preview/);
  }
  const mismatch = await read("find_task_destinations", { kind: "client", companyId: companies[0].id });
  assert.equal(mismatch.companies[0].eligible, false);
  assert.match(mismatch.companies[0].reason, /belongs to Prospects/);
  assert.deepEqual(mismatch.parents, []);
  const missing = await read("find_task_destinations", { kind: "prospect", companyId: 999999 });
  assert.match(missing.errors.join(" "), /not found/);
  await refuse("invalid Internal discovery", "find_task_destinations", { kind: "internal", companyId: companies[0].id }, /forbids/);

  await refuse("missing preview token", "add_task_plan", { plan: fresh, acknowledgedWarnings: [] }, /previewToken/);
  await refuse("missing acknowledgements", "add_task_plan", { plan: fresh, previewToken: shown.previewToken }, /acknowledgedWarnings/);
  const [encoded, signature] = shown.previewToken.split(".");
  const tampered = `${encoded}.${signature[0] === "A" ? "B" : "A"}${signature.slice(1)}`;
  await refuse("tampered token", "add_task_plan", { ...addArgs, previewToken: tampered }, /missing or invalid/);
  const { createTaskPlanToken } = await jiti.import("../../lib/taskPlanToken.ts");
  const expired = createTaskPlanToken(shown, { secret, now: Date.now() - 31 * 60_000 });
  await refuse("authentic expired token", "add_task_plan", { ...addArgs, previewToken: expired }, /expired/);
  await refuse("changed input", "add_task_plan", { ...addArgs, plan: { ...fresh, steps: [{ ...fresh.steps[0], name: "Changed after preview" }] } }, /changed after preview/);
  const warned = { ...fresh, newParent: { title: "Fictional past date warning" },
    steps: [{ ...fresh.steps[0], startDate: "2000-01-01", endDate: "2000-01-02" }] };
  const warning = await preview(warned);
  assert.ok(warning.warnings.length > 0);
  await refuse("unacknowledged warnings", "add_task_plan", { ...argsFor(warned, warning), acknowledgedWarnings: [] }, /Unacknowledged preview warnings/);
  await refuse("unknown warning", "add_task_plan", { ...argsFor(warned, warning), acknowledgedWarnings: ["not-a-warning"] }, /only warning IDs/);
  assert.equal((await save(warned, warning)).alreadySaved, false, "Explicit warning acknowledgement must permit saving.");

  const stale = { kind: "internal", existingParentId: parents[2].id, steps: fresh.steps };
  const stalePreview = await preview(stale);
  await seed("tasks", "tasks", [{ ...parents[2], task: "Fictional parent renamed after preview" }]);
  await refuse("destination changed", "add_task_plan", argsFor(stale, stalePreview), /destination or warnings changed/);
  await seed("tasks", "tasks", [parents[2]]);

  async function removeFixture(project, collection, id) {
    assert.equal(emulatorHost, "127.0.0.1:8180");
    const response = await fetch(`http://${emulatorHost}/v1/projects/${project}/databases/(default)/documents/${collection}/${id}`, {
      method: "DELETE", headers: { Authorization: "Bearer owner" },
    });
    assert.equal(response.status, 200);
  }
  await removeFixture("deus-team-tasks", "tasks", parents[2].id);
  await refuse("parent deleted since preview", "add_task_plan", argsFor(stale, stalePreview), /Main task .*not found/);
  await seed("tasks", "tasks", [parents[2]]);
  const companyPlan = { ...fresh, kind: "prospect", companyId: companies[0].id };
  const companyPreview = await preview(companyPlan);
  await seed("clients", "pipeline", [{ ...companies[0], status: companies[1].status }], { keepIdField: true });
  await refuse("company category changed since preview", "add_task_plan", argsFor(companyPlan, companyPreview), /belongs to Clients/);
  await removeFixture("deus-client-tracker", "pipeline", companies[0].id);
  await refuse("company deleted since preview", "add_task_plan", argsFor(companyPlan, companyPreview), /Company .*not found/);
  await seed("clients", "pipeline", [companies[0]], { keepIdField: true });

  const rules = await readFile(path.join(root, "firestore.rules"), "utf8");
  async function taskRules(content) {
    assert.equal(emulatorHost, "127.0.0.1:8180");
    const response = await fetch(`http://${emulatorHost}/emulator/v1/projects/deus-team-tasks:securityRules`, {
      method: "PUT", headers: { Authorization: "Bearer owner", "Content-Type": "application/json" },
      body: JSON.stringify({ rules: { files: [{ name: "firestore.rules", content }] } }),
    });
    assert.equal(response.status, 200, "Set emulator-only failure rules.");
  }
  // Reject one child at commit time, while allowing the parent, other child and receipt.
  // No production hook or route exists for this failure injection.
  const failurePlan = { ...fresh, newParent: { title: "Fictional atomic failure" },
    steps: [...fresh.steps, { ...fresh.steps[0], name: "FICTIONAL_DENIED_CHILD" }] };
  const failurePreview = await preview(failurePlan);
  try {
    await taskRules(`rules_version = '2'; service cloud.firestore { match /databases/{db}/documents/{document=**} {
      allow read: if true; allow write: if request.resource.data.get('task', '') != 'FICTIONAL_DENIED_CHILD';
    } }`);
    await refuse("controlled child write failure/atomic rollback", "add_task_plan", argsFor(failurePlan, failurePreview), /Could not confirm that the task plan was saved/);
  } finally {
    await taskRules(rules);
  }
  const recovered = await save(failurePlan, failurePreview);
  assert.equal(recovered.alreadySaved, false, "A refused transaction must leave no completed receipt or member.");
  const saved = await readAll("tasks", "tasks");
  const child = saved.find((task) => task.id === recovered.subtaskIds[0]);
  await seed("tasks", "tasks", [{ ...child, task: "Fictional owner edit after lost response", completed: true }]);
  await unchanged("retry preserves later edits", async () => {
    assert.deepEqual(await save(failurePlan, failurePreview), { ...recovered, alreadySaved: true });
  });
  // Legacy lookup is still usable with the new tools switched on and all six old steps intact.
  const legacy = await read("find_company", { query: "PT Contoh Aurora Fiktif Tbk" });
  assert.equal(legacy.companies[0].followups[0].subtasks.length, 6);
  console.log("General MCP: schema/destination failures, skip/no-write, warning gates, token expiry/tampering, stale state, atomic failure/recovery and preserved edits passed.");
}
