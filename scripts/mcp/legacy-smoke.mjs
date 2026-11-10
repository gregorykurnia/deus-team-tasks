// Preserve the original six-step contract through the real MCP client.
import assert from "node:assert/strict";

export function payload(result) {
  const text = result.content.find((part) => part.type === "text")?.text;
  assert.equal(result.isError, undefined, text);
  const value = JSON.parse(text);
  if (result.structuredContent) assert.deepEqual(result.structuredContent, value);
  return value;
}

export async function checkLegacyProtocol({ client, company, plan, readAll, unchanged, origin: ORIGIN, protocol = true }) {
  if (!protocol) {
    // The browser selector only prepares its fixture; protocol assertions run separately.
    payload(await client.callTool({ name: "preview_followup_plan", arguments: { plan } }));
    return payload(await client.callTool({ name: "add_followup_plan", arguments: { plan } }));
  }
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((tool) => tool.name).sort(), ["add_followup_plan", "find_company", "preview_followup_plan"]);
  assert.match(tools.find((tool) => tool.name === "add_followup_plan").description, /ONLY AFTER.*confirmed.*company.*EACH step, one step at a time in chat.*start and end date.*skip it.*only the steps the owner chose/);
  const found = payload(await client.callTool({ name: "find_company", arguments: { query: "contOH aurora fiktif" } }));
  assert.deepEqual(found.companies, [{ id: company.id, name: company.company, group: "Active", pic: company.pic, followups: [] }]);

  const preview = payload(await client.callTool({ name: "preview_followup_plan", arguments: { plan } }));
  assert.equal(preview.canWrite, true);
  assert.equal(preview.parent.task, `${company.company} Follow Up`);
  assert.equal(preview.subtasks.length, 6);
  assert.deepEqual(await readAll("tasks", "tasks"), [], "Finding and previewing must not write.");
  const invalid = { ...plan, steps: [{ ...plan.steps[0], startDate: "tomorrow" }] };
  const warning = payload(await client.callTool({ name: "preview_followup_plan", arguments: { plan: invalid } }));
  assert.equal(warning.canWrite, false);
  assert.ok(warning.warnings.some((item) => item.code === "invalid-date"));
  const refused = await unchanged("legacy invalid add", () => client.callTool({ name: "add_followup_plan", arguments: { plan: invalid } }));
  assert.equal(refused.isError, true);
  assert.match(refused.content[0].text, /yyyy-mm-dd/);
  assert.deepEqual(await readAll("tasks", "tasks"), []);

  const added = payload(await client.callTool({ name: "add_followup_plan", arguments: { plan } }));
  assert.equal(added.url, `${ORIGIN}/tasks?task=${added.parentId}`);
  assert.equal(added.subtaskIds.length, 6);
  const saved = await readAll("tasks", "tasks");
  assert.equal(saved.length, 7);
  assert.deepEqual(saved.find((task) => task.id === added.parentId), { ...preview.parent, id: added.parentId, order: saved.find((task) => task.id === added.parentId).order });
  for (const [index, id] of added.subtaskIds.entries()) {
    const task = saved.find((doc) => doc.id === id);
    assert.deepEqual(task, { ...preview.subtasks[index], id, parentId: added.parentId, order: task.order });
    assert.deepEqual(task.responsible, []);
    assert.deepEqual(task.informed, []);
  }
  const retried = payload(await client.callTool({ name: "add_followup_plan", arguments: { plan } }));
  assert.deepEqual(retried, { ...added, alreadySaved: true });
  assert.equal((await readAll("tasks", "tasks")).length, 7);
  const existing = payload(await client.callTool({ name: "find_company", arguments: { query: company.company } }));
  assert.equal(existing.companies[0].followups[0].parent.id, added.parentId);
  assert.equal(existing.companies[0].followups[0].subtasks.length, 6);

  return added;
}
