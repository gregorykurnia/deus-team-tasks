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
import { checkLegacyProtocol } from "./legacy-smoke.mjs";
import { checkGeneralProtocol, checkDisabledTools } from "./protocol-smoke.mjs";

const selection = process.argv[2] ?? "--only=all";
assert.ok(process.argv.length <= 3 && /^--only=(all|protocol|browser|task-plan-browser|task-plan-visual|task-plan-reachability)$/.test(selection),
  "Usage: npm run mcp:smoke -- [--only=all|--only=protocol|--only=browser|--only=task-plan-browser|--only=task-plan-visual|--only=task-plan-reachability]");
const protocol = ["--only=all", "--only=protocol"].includes(selection);
const browser = ["--only=all", "--only=browser"].includes(selection);
const planOnly = selection === "--only=task-plan-visual";
const reachabilityOnly = selection === "--only=task-plan-reachability";
const taskPlanBrowser = browser || selection === "--only=task-plan-browser" || planOnly || reachabilityOnly;

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
const jiti = createJiti(import.meta.url, {
  alias: { "server-only": path.join(ROOT, "node_modules/next/dist/compiled/server-only/empty.js") },
});
const { FOLLOWUP_COMPANY_FIXTURE: company, SIX_STEP_FOLLOWUP_FIXTURE: plan } = await jiti.import("../../tests/fixtures/followupPlan.ts");
const { openClientTrackerRules, seed, readAll, clearAll } = await jiti.import("../../tests/support/emulator.ts");
const logs = await mkdtemp(path.join(tmpdir(), "mcp-smoke-"));
const children = new Set();
const clients = new Set();
let snapshots = 0;

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
    env: { ...process.env, NODE_ENV: "development", NEXT_PUBLIC_USE_EMULATOR: "1", NEXT_TELEMETRY_DISABLED: "1", MCP_TASK_PLANS_ENABLED: "0", CALENDAR_FAKE: "1", GOOGLE_EVENTS_CALENDAR_ID: "test-calendar", ...env },
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

let stopping;
function stopAll() {
  return stopping ??= (async () => {
    try { await Promise.all([...clients].map((client) => client.close())); }
    finally { for (const entry of [...children].reverse()) await stop(entry); }
  })();
}
for (const [signal, code] of [["SIGINT", 130], ["SIGTERM", 143]]) {
  process.once(signal, () => { void stopAll().finally(() => process.exit(code)); });
}

function startNext(name, secret, flag = "0") {
  return start(name, ["node_modules/next/dist/bin/next", "dev", "--hostname", HOST, "--port", String(PORT)], { MCP_SECRET: secret, MCP_TASK_PLANS_ENABLED: flag });
}

const headers = { "Content-Type": "application/json", Accept: "application/json, text/event-stream" };
async function raw(body, url = ENDPOINT, method = "POST") {
  const response = await fetch(url, { method, headers, ...(method === "POST" && { body }), signal: AbortSignal.timeout(30_000) });
  const text = await response.text();
  safe(text);
  if (response.status === 404 || method === "HEAD") return { response };
  const data = response.headers.get("content-type")?.includes("text/event-stream")
    ? JSON.parse(text.split("\n").find((line) => line.startsWith("data: ")).slice(6)) : JSON.parse(text);
  return { response, data };
}

function safe(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  assert.ok(!text.includes(SECRET), "A response exposed the secret.");
  assert.doesNotMatch(text, /node:internal|\bat \S+ \([^\n]*:\d+:\d+\)/, "A response exposed a stack trace.");
}
async function snapshot() {
  return Promise.all([["tasks", "tasks"], ["tasks", "settings"], ["tasks", "flows"], ["tasks", "taskGroups"], ["clients", "pipeline"]]
    .map(async ([project, collection]) => (await readAll(project, collection)).sort((a, b) => a.id.localeCompare(b.id))));
}
async function unchanged(label, work) {
  const before = await snapshot();
  try { return await work(); }
  finally {
    assert.deepEqual(await snapshot(), before, `${label}: database changed`);
    snapshots++;
  }
}
async function connect() {
  const client = new Client({ name: "deus-mcp-smoke", version: "1.0.0" });
  clients.add(client);
  await client.connect(new StreamableHTTPClientTransport(new URL(ENDPOINT), {
    fetch: async (url, init) => {
      const response = await fetch(url, { ...init, signal: AbortSignal.any([...(init?.signal ? [init.signal] : []), AbortSignal.timeout(30_000)]) });
      assert.equal(response.headers.get("mcp-session-id"), null, "The connector must stay stateless.");
      safe(await response.clone().text());
      return response;
    },
  }));
  return client;
}

try {
  // Refuse existing ports before opening rules or seeding anything.
  for (const port of [8180, 4400, 4500, 9150, PORT]) await assertPortFree(port);
  const emulator = start("firestore", ["node_modules/firebase-tools/lib/bin/firebase.js", "emulators:start", "--only", "firestore", "--project", "demo-deus", "--log-verbosity", "QUIET"]);
  await ready(emulator, `http://${EMULATOR_HOST}`);
  await openClientTrackerRules();
  await seed("clients", "pipeline", [company], { keepIdField: true });

  if (protocol) {
    const disabled = startNext("next-disabled", "");
    await ready(disabled, ENDPOINT, 404);
    for (const method of METHODS) await unchanged(`missing secret/${method}`, async () => {
      assert.equal((await raw("{", ENDPOINT, method)).response.status, 404);
    });
    await stop(disabled);
  }

  if (protocol || browser) {
    console.log("Checking legacy MCP with task-plan activation explicitly off (emulator only).");
    const enabled = startNext("next-enabled", SECRET);
    await ready(enabled, `${ORIGIN}/api/mcp/wrong-secret`, 404);
    const client = await connect();
    if (protocol) {
      for (const method of METHODS) {
        for (const wrong of ["wrong-secret", `${SECRET}x`]) await unchanged(`wrong secret/${method}`, async () => {
          assert.equal((await raw("{", `${ORIGIN}/api/mcp/${wrong}`, method)).response.status, 404);
        });
      }
      for (const method of METHODS.filter((method) => method !== "POST")) await unchanged(`unsupported HTTP/${method}`, async () => {
        assert.equal((await raw(undefined, ENDPOINT, method)).response.status, 405);
      });
      await checkDisabledTools({ client, unchanged, safe, plan });
    }
    const added = await checkLegacyProtocol({ client, company, plan, readAll, unchanged, origin: ORIGIN, protocol });
    if (browser) {
      console.log("Checking the returned task link on desktop and phone (emulator only).");
      const { checkFollowupUI } = await import("./ui-smoke.mjs");
      await checkFollowupUI({ root: ROOT, origin: ORIGIN, added, company, plan });
    }

    if (protocol) {

      const malformed = await unchanged("invalid JSON", () => raw("{"));
      assert.equal(malformed.response.status, 400);
      assert.equal(malformed.data.error.code, -32700);
      assert.match(malformed.data.error.message, /not valid JSON/);
      for (const invalid of [{ hello: "world" }, [], [{ jsonrpc: "2.0", id: 70, method: "tools/list" }]]) {
        const invalidRpc = await unchanged("invalid JSON-RPC", () => raw(JSON.stringify(invalid)));
        assert.equal(invalidRpc.data.error.code, -32600);
      }
      const invalidInput = await unchanged("invalid legacy inputs", () => raw(JSON.stringify({ jsonrpc: "2.0", id: 71, method: "tools/call", params: { name: "find_company", arguments: { query: 12 } } })));
      assert.equal(invalidInput.data.id, 71);
      assert.equal(invalidInput.data.error.code, -32602);
      assert.match(invalidInput.data.error.message, /Check the tool inputs.*query/);
      const unknown = await unchanged("unsupported RPC method", () => raw(JSON.stringify({ jsonrpc: "2.0", id: 72, method: "unknown_method" })));
      assert.equal(unknown.data.error.code, -32601);
      assert.match(unknown.data.error.message, /not found/i);
    }
    await client.close();
    clients.delete(client);
    await stop(enabled);
  }
  if (protocol || taskPlanBrowser) {
    console.log("Checking all general-task categories with task-plan activation explicitly on.");
    const general = startNext("next-general", SECRET, "1");
    await ready(general, `${ORIGIN}/api/mcp/wrong-secret`, 404);
    const generalClient = await connect();
    if (protocol) await checkGeneralProtocol({ client: generalClient, jiti, readAll, seed, unchanged, safe,
      root: ROOT, origin: ORIGIN, emulatorHost: EMULATOR_HOST, secret: SECRET });
    if (taskPlanBrowser) {
      const { checkTaskPlanUI } = await import("./task-plan-ui.mjs");
      await checkTaskPlanUI({ client: generalClient, jiti, readAll, seed, clearAll,
        root: ROOT, origin: ORIGIN, emulatorHost: EMULATOR_HOST, planOnly, reachabilityOnly });
    }
  }
  console.log(`MCP smoke passed (${selection.slice(7)}); ${snapshots} database-preservation comparisons; owned servers only.`);
} catch (error) {
  console.error(error.stack?.replaceAll(SECRET, "[redacted]") ?? error.message);
  for (const name of ["firestore", "next-disabled", "next-enabled", "next-general"]) {
    const text = await readFile(path.join(logs, `${name}.log`), "utf8").catch(() => "");
    if (text) console.error(`${name}:\n${text.replaceAll(SECRET, "[redacted]").trim().split("\n").slice(-12).join("\n")}`);
  }
  console.error(`Failure logs retained in ${logs}`);
  process.exitCode = 1;
} finally {
  await stopAll();
  if (!process.exitCode) await rm(logs, { recursive: true, force: true });
}
