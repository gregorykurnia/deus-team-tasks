// Emulator-only MCP check. Own every server PID; never attach to or stop an existing server.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { closeSync, openSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createJiti } from "jiti";
import { checkFollowupUI } from "./ui-smoke.mjs";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const HOST = "127.0.0.1";
const PORT = 3100;
const ORIGIN = `http://${HOST}:${PORT}`;
const SECRET = "mcp-smoke-emulator-only";
const METHODS = ["GET", "POST", "DELETE", "HEAD", "OPTIONS", "PUT", "PATCH"];
const ENDPOINT = `${ORIGIN}/api/mcp/${SECRET}`;
const EMULATOR_HOST = `${HOST}:8180`;
// Ignore caller overrides: every data helper and server must use this local emulator.
process.env.FIRESTORE_EMULATOR_HOST = EMULATOR_HOST;
const jiti = createJiti(import.meta.url);
const { FOLLOWUP_COMPANY_FIXTURE: company, SIX_STEP_FOLLOWUP_FIXTURE: plan } = await jiti.import("../../tests/fixtures/followupPlan.ts");
const { openClientTrackerRules, seed, readAll } = await jiti.import("../../tests/support/emulator.ts");
const logs = await mkdtemp(path.join(tmpdir(), "mcp-smoke-"));
const children = new Set();
const client = new Client({ name: "deus-mcp-smoke", version: "1.0.0" });

async function assertPortFree(port) {
  const probe = createServer();
  await new Promise((resolve, reject) => {
    probe.once("error", () => reject(new Error(`Port ${port} is busy or unavailable. Stop its server before running mcp:smoke.`)));
    probe.listen(port, HOST, resolve);
  });
  await new Promise((resolve, reject) => probe.close((error) => error ? reject(error) : resolve()));
}

function start(name, args, env = {}) {
  const fd = openSync(path.join(logs, `${name}.log`), "w");
  const child = spawn(process.execPath, args, {
    cwd: ROOT, detached: true, stdio: ["ignore", fd, fd],
    env: { ...process.env, NODE_ENV: "development", NEXT_PUBLIC_USE_EMULATOR: "1", NEXT_TELEMETRY_DISABLED: "1", ...env },
  });
  closeSync(fd);
  const entry = { name, child, failure: null };
  entry.exited = new Promise((resolve) => {
    child.once("exit", resolve);
    child.once("error", (error) => { entry.failure = error; resolve(); });
  });
  children.add(entry);
  return entry;
}

async function ready(entry, url, status = 200) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (entry.failure) throw entry.failure;
    if (entry.child.exitCode !== null || entry.child.signalCode !== null) throw new Error(`${entry.name} stopped before it was ready.`);
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
      await response.body?.cancel();
      if (response.status === status) return;
    } catch { /* The server is still starting. */ }
    await delay(300);
  }
  throw new Error(`${entry.name} did not become ready within two minutes.`);
}

async function stop(entry) {
  const signal = (name) => {
    try { if (entry.child.pid) process.kill(-entry.child.pid, name); }
    catch (error) { if (error.code !== "ESRCH") throw error; }
  };
  signal("SIGTERM");
  await Promise.race([entry.exited, delay(5000)]);
  // Stop any remaining descendants in this process group, even if its leader exited first.
  signal("SIGKILL");
  await entry.exited;
  children.delete(entry);
}

async function stopAll() {
  try {
    await client.close();
  } finally {
    for (const entry of [...children].reverse()) await stop(entry);
  }
}
for (const [signal, code] of [["SIGINT", 130], ["SIGTERM", 143]]) {
  process.once(signal, () => { void stopAll().finally(() => process.exit(code)); });
}

function startNext(name, secret) {
  return start(name, ["node_modules/next/dist/bin/next", "dev", "--hostname", HOST, "--port", String(PORT)], { MCP_SECRET: secret });
}

const headers = { "Content-Type": "application/json", Accept: "application/json, text/event-stream" };
async function raw(body, url = ENDPOINT, method = "POST") {
  const response = await fetch(url, { method, headers, ...(method === "POST" && { body }), signal: AbortSignal.timeout(30_000) });
  const text = await response.text();
  if (response.status === 404) return { response };
  const data = response.headers.get("content-type")?.includes("text/event-stream")
    ? JSON.parse(text.split("\n").find((line) => line.startsWith("data: ")).slice(6)) : JSON.parse(text);
  return { response, data };
}

function payload(result) {
  const text = result.content.find((part) => part.type === "text")?.text;
  assert.equal(result.isError, undefined, text);
  return JSON.parse(text);
}

try {
  // Refuse existing ports before opening rules or seeding anything.
  for (const port of [8180, 4400, 4500, 9150, PORT]) await assertPortFree(port);
  const emulator = start("firestore", ["node_modules/firebase-tools/lib/bin/firebase.js", "emulators:start", "--only", "firestore", "--project", "demo-deus", "--log-verbosity", "QUIET"]);
  await ready(emulator, `http://${EMULATOR_HOST}`);
  await openClientTrackerRules();
  await seed("clients", "pipeline", [company], { keepIdField: true });

  console.log("Checking the disabled endpoint, then starting the enabled endpoint on the emulator.");
  const disabled = startNext("next-disabled", "");
  await ready(disabled, ENDPOINT, 404);
  for (const method of METHODS) assert.equal((await raw("{", ENDPOINT, method)).response.status, 404);
  await stop(disabled);

  const enabled = startNext("next-enabled", SECRET);
  await ready(enabled, `${ORIGIN}/api/mcp/wrong-secret`, 404);
  for (const method of METHODS) {
    for (const wrong of ["wrong-secret", `${SECRET}x`]) {
      assert.equal((await raw("{", `${ORIGIN}/api/mcp/${wrong}`, method)).response.status, 404);
    }
  }
  for (const method of ["GET", "DELETE"]) assert.equal((await raw(undefined, ENDPOINT, method)).response.status, 405);

  await client.connect(new StreamableHTTPClientTransport(new URL(ENDPOINT), {
    fetch: async (url, init) => {
      const response = await fetch(url, { ...init, signal: AbortSignal.any([...(init?.signal ? [init.signal] : []), AbortSignal.timeout(30_000)]) });
      assert.equal(response.headers.get("mcp-session-id"), null, "The connector must stay stateless.");
      return response;
    },
  }));
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((tool) => tool.name).sort(), ["add_followup_plan", "find_company", "preview_followup_plan"]);
  assert.match(tools.find((tool) => tool.name === "add_followup_plan").description, /ONLY AFTER.*confirmed.*company.*EACH start and end date.*chat/);
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
  const refused = await client.callTool({ name: "add_followup_plan", arguments: { plan: invalid } });
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
  const existing = payload(await client.callTool({ name: "find_company", arguments: { query: company.company } }));
  assert.equal(existing.companies[0].followups[0].parent.id, added.parentId);
  assert.equal(existing.companies[0].followups[0].subtasks.length, 6);

  console.log("Checking the returned task link and subtask details on desktop and phone (emulator only).");
  await checkFollowupUI({ root: ROOT, origin: ORIGIN, added, company, plan });

  const malformed = await raw("{");
  assert.equal(malformed.response.status, 400);
  assert.equal(malformed.data.error.code, -32700);
  assert.match(malformed.data.error.message, /not valid JSON/);
  for (const invalid of [{ hello: "world" }, [], [{ jsonrpc: "2.0", id: 70, method: "tools/list" }]]) {
    const invalidRpc = await raw(JSON.stringify(invalid));
    assert.equal(invalidRpc.data.error.code, -32600);
  }
  const invalidInput = await raw(JSON.stringify({ jsonrpc: "2.0", id: 71, method: "tools/call", params: { name: "find_company", arguments: { query: 12 } } }));
  assert.equal(invalidInput.data.id, 71);
  assert.equal(invalidInput.data.error.code, -32602);
  assert.match(invalidInput.data.error.message, /Check the tool inputs.*query/);
  const unknown = await raw(JSON.stringify({ jsonrpc: "2.0", id: 72, method: "unknown_method" }));
  assert.equal(unknown.data.error.code, -32601);
  assert.match(unknown.data.error.message, /not found/i);
  console.log("MCP smoke passed: three tools, read-only preview, six-step write, desktop/phone task details, secret gate, stateless HTTP, and readable errors.");
} catch (error) {
  console.error(error.message);
  for (const name of ["firestore", "next-disabled", "next-enabled"]) {
    const text = await readFile(path.join(logs, `${name}.log`), "utf8").catch(() => "");
    if (text) console.error(`${name}:\n${text.trim().split("\n").slice(-12).join("\n")}`);
  }
  process.exitCode = 1;
} finally {
  await stopAll();
  await rm(logs, { recursive: true, force: true });
}
