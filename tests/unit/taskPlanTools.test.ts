import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult, Tool } from "@modelcontextprotocol/sdk/types.js";
import { POST, GET, DELETE, HEAD, OPTIONS, PUT, PATCH } from "@/app/api/mcp/[secret]/route";
import { MAX_TASK_PLAN_INPUT_BYTES } from "@/lib/taskPlan";
import { TaskPlanError } from "@/lib/taskPlanServer";
import { TaskPlanTokenError } from "@/lib/taskPlanToken";
import { registerTaskPlanTools, TASK_PLAN_CHAT_GUIDANCE, taskPlanToolInputs } from "@/lib/taskPlanTools";
import { registerTaskEditTools, TASK_EDIT_CHAT_GUIDANCE, taskEditToolInputs } from "@/lib/taskEditTools";
import { TaskEditError } from "@/lib/taskEditServer";
import { TASK_PLAN_INTERNAL_NEW, TASK_PLAN_PROSPECT_NEW, TASK_PLAN_CLIENT_NEW } from "../fixtures/taskPlan";
import { SIX_STEP_FOLLOWUP_FIXTURE } from "../fixtures/followupPlan";

// Exercise the installed handler/SDK in memory. No Firebase module or network is used by these tests.
const io = vi.hoisted(() => ({
  find: vi.fn(), preview: vi.fn(), add: vi.fn(),
  legacyRead: vi.fn(), legacyPreview: vi.fn(), legacyAdd: vi.fn(),
  editFind: vi.fn(), editPreview: vi.fn(), editApply: vi.fn(), free: vi.fn(),
}));
vi.mock("@/lib/freeTimeServer", () => ({ findFreeTimes: io.free }));
vi.mock("@/lib/taskEditServer", () => ({ findTasks: io.editFind, previewTaskChanges: io.editPreview, applyTaskChanges: io.editApply,
  TaskEditError: class extends Error {},
}));
vi.mock("@/lib/taskPlanServer", () => ({
  findTaskPlanDestinations: io.find, previewTaskPlan: io.preview, addTaskPlan: io.add,
  TaskPlanError: class extends Error {},
}));
vi.mock("@/lib/followupServer", () => ({
  readFollowupData: io.legacyRead, previewFollowupPlan: io.legacyPreview, addFollowupPlan: io.legacyAdd,
  FollowupPlanError: class extends Error {},
}));

const SECRET = "g06-fake-secret-only";
const ORIGIN = "https://tasks.example.test";
const NEW_TOOLS = Object.keys(taskPlanToolInputs);
const OLD_TOOLS = ["find_company", "preview_followup_plan", "add_followup_plan"];
const plan = TASK_PLAN_INTERNAL_NEW;
const FREE_RANGE = { startDate: "2026-11-16", endDate: "2026-11-20" };
const saved = {
  parentId: "fictional-parent", subtaskIds: ["fictional-step"], alreadySaved: false,
  destination: { kind: "internal", parent: { id: "fictional-parent", title: "Fictional main task", mode: "new" } },
  url: "/tasks?task=fictional-parent",
};

interface Reply {
  result?: { tools?: Tool[]; instructions?: string; structuredContent?: Record<string, unknown>; isError?: boolean };
  error?: { code: number; message: string };
}

async function rpc(method: string, params?: Record<string, unknown>, secret = SECRET) {
  const response = await POST(new Request(`${ORIGIN}/api/mcp/${secret}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, ...(params && { params }) }),
  }), { params: Promise.resolve({ secret }) });
  const body = await response.text();
  const data = body.split("\n").find((line) => line.startsWith("data: "))?.slice(6) ?? body;
  return { response, body, reply: response.status === 404 ? {} as Reply : JSON.parse(data) as Reply };
}

const call = (name: string, args: unknown) => rpc("tools/call", { name, arguments: args });
const initialize = () => rpc("initialize", {
  protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "g06-unit", version: "1" },
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("MCP_SECRET", SECRET);
  vi.stubEnv("MCP_TASK_PLANS_ENABLED", "1");
  vi.stubEnv("MCP_TASK_EDITS_ENABLED", undefined);
  io.find.mockResolvedValue({ companies: [], parents: [], errors: [], hasMore: { companies: false, parents: false } });
  io.preview.mockResolvedValue({ canWrite: true, warnings: [], previewToken: "fictional-token" });
  io.add.mockResolvedValue(saved);
  io.legacyRead.mockResolvedValue({ companies: [], tasks: [] });
  io.legacyPreview.mockResolvedValue({ canWrite: true });
  io.legacyAdd.mockResolvedValue({ parentId: "legacy-parent", subtaskIds: [], alreadySaved: false });
  io.editFind.mockResolvedValue({ tasks: [], hasMore: false });
  io.editPreview.mockResolvedValue({ tasks: [], warnings: [], errors: [], canWrite: true });
  io.editApply.mockResolvedValue({ tasks: [], alreadySaved: false });
});
afterEach(() => { vi.unstubAllEnvs(); });

describe("G06 activation and registration", () => {
  it.each([undefined, "", "0", "true", "01", "1 "])("keeps only legacy tools for flag %s and rejects every new direct call", async (flag) => {
    vi.stubEnv("MCP_TASK_PLANS_ENABLED", flag);
    const listed = await rpc("tools/list");
    expect(listed.reply.result?.tools?.map((tool) => tool.name)).toEqual(OLD_TOOLS);
    expect((await initialize()).reply.result?.instructions).toBeUndefined();
    for (const name of NEW_TOOLS) {
      const refused = await call(name, {});
      expect(refused.reply.error).toEqual({ code: -32602, message: "Tool not found." });
    }
    expect(io.find).not.toHaveBeenCalled();
    expect(io.preview).not.toHaveBeenCalled();
    expect(io.add).not.toHaveBeenCalled();
  });

  it("lists six with explicit schemas, annotations and standalone workflow instructions", async () => {
    const listed = await rpc("tools/list");
    const tools = listed.reply.result?.tools ?? [];
    expect(tools.map((tool) => tool.name)).toEqual([...OLD_TOOLS, ...NEW_TOOLS]);
    expect((await initialize()).reply.result?.instructions).toBe(TASK_PLAN_CHAT_GUIDANCE);
    for (const tool of tools.filter((tool) => NEW_TOOLS.includes(tool.name))) {
      expect(tool.description).toContain(TASK_PLAN_CHAT_GUIDANCE);
      expect(tool.inputSchema.type).toBe("object");
      expect(tool.inputSchema.additionalProperties).toBe(false);
      expect(tool.annotations).toEqual({
        readOnlyHint: tool.name !== "add_task_plan", destructiveHint: false, idempotentHint: true, openWorldHint: false,
      });
    }
    const write = tools.find((tool) => tool.name === "add_task_plan");
    expect(write?.inputSchema.required).toEqual(["plan", "previewToken", "acknowledgedWarnings"]);
  });

  it("also refuses retained callbacks after activation is turned off", async () => {
    const server = new McpServer({ name: "unit", version: "1" });
    const registration = vi.spyOn(server, "registerTool");
    registerTaskPlanTools(server, ORIGIN);
    expect(registration).toHaveBeenCalledTimes(NEW_TOOLS.length);
    vi.stubEnv("MCP_TASK_PLANS_ENABLED", "0");
    // Widen the generic SDK callback tuple: Vitest otherwise infers its overload as never.
    const registeredCalls: readonly (readonly unknown[])[] = registration.mock.calls;
    for (const [, , callback] of registeredCalls) {
      const result = await (callback as (input: object) => Promise<CallToolResult>)({ plan });
      expect(result.isError).toBe(true);
    }
    registerTaskPlanTools(server, ORIGIN);
    expect(registration).toHaveBeenCalledTimes(NEW_TOOLS.length);
    expect(io.find).not.toHaveBeenCalled();
    expect(io.preview).not.toHaveBeenCalled();
    expect(io.add).not.toHaveBeenCalled();
    expect(io.free).not.toHaveBeenCalled();
    await server.close();
  });

  it.each([GET, POST, DELETE, HEAD, OPTIONS, PUT, PATCH])("authenticates every supported HTTP handler before dispatch", async (handle) => {
    const response = await handle(new Request(`${ORIGIN}/api/mcp/wrong`), { params: Promise.resolve({ secret: "wrong" }) });
    expect(response.status).toBe(404);
    expect(await response.text()).toBe("Not found");
    expect(io.add).not.toHaveBeenCalled();
  });

  it("rejects an unconfigured secret", async () => {
    vi.stubEnv("MCP_SECRET", "");
    expect((await call("add_task_plan", { plan, previewToken: "fake", acknowledgedWarnings: [] })).response.status).toBe(404);
    expect(io.add).not.toHaveBeenCalled();
  });
});

describe("T03–T05 task edit tools", () => {
  const editTools = Object.keys(taskEditToolInputs);
  const changes = [{ taskId: "fictional-task", set: { task: "Updated task" } }];

  it.each([undefined, "", "0", "true", "01", "1 "])("hides and refuses all edit tools for flag %s without changing existing lists", async (flag) => {
    vi.stubEnv("MCP_TASK_EDITS_ENABLED", flag);
    for (const enabled of [false, true]) {
      vi.stubEnv("MCP_TASK_PLANS_ENABLED", enabled ? "1" : "0");
      expect((await rpc("tools/list")).reply.result?.tools?.map((tool) => tool.name))
        .toEqual([...OLD_TOOLS, ...(enabled ? NEW_TOOLS : [])]);
      expect((await initialize()).reply.result?.instructions).toBe(enabled ? TASK_PLAN_CHAT_GUIDANCE : undefined);
      for (const name of editTools) expect((await call(name, {})).reply.error)
        .toEqual({ code: -32602, message: "Tool not found." });
    }
    expect(io.editFind).not.toHaveBeenCalled();
    expect(io.editPreview).not.toHaveBeenCalled();
    expect(io.editApply).not.toHaveBeenCalled();
  });

  it.each(["0", "1"])("registers edit schemas independently of the plan flag %s", async (planFlag) => {
    vi.stubEnv("MCP_TASK_EDITS_ENABLED", "1");
    vi.stubEnv("MCP_TASK_PLANS_ENABLED", planFlag);
    const tools = (await rpc("tools/list")).reply.result?.tools ?? [];
    expect(tools.map((tool) => tool.name)).toEqual([...OLD_TOOLS, ...(planFlag === "1" ? NEW_TOOLS : []), ...editTools]);
    expect((await initialize()).reply.result?.instructions)
      .toBe(planFlag === "1" ? `${TASK_PLAN_CHAT_GUIDANCE}\n\n${TASK_EDIT_CHAT_GUIDANCE}` : TASK_EDIT_CHAT_GUIDANCE);
    for (const tool of tools.filter((tool) => editTools.includes(tool.name))) {
      expect(tool.description).toContain(TASK_EDIT_CHAT_GUIDANCE);
      expect(tool.inputSchema).toMatchObject({ type: "object", additionalProperties: false });
      expect(tool.annotations).toEqual({ readOnlyHint: tool.name !== "apply_task_changes", destructiveHint: tool.name === "apply_task_changes", idempotentHint: true, openWorldHint: false });
    }
    expect((await call("find_tasks", { query: "  Updated  " })).reply.result?.structuredContent)
      .toEqual({ tasks: [], hasMore: false });
    expect(io.editFind).toHaveBeenCalledWith({ query: "Updated", includeDone: false });
    const input = { query: "Task", companyId: 0, parentId: "parent", includeDone: true };
    await call("find_tasks", input);
    expect(io.editFind).toHaveBeenLastCalledWith(input);
    await call("preview_task_changes", { changes });
    expect(io.editPreview).toHaveBeenCalledWith(changes);
    const seen = { "fictional-task": "a".repeat(64) };
    await call("apply_task_changes", { changes, seen, acknowledgedWarnings: ["warning"] });
    expect(io.editApply).toHaveBeenCalledWith(changes, seen, ["warning"], ORIGIN);
  });

  it("guides explicit task selection, individual changes and confirmation before saving", () => {
    expect(TASK_EDIT_CHAT_GUIDANCE).not.toContain("\n");
    for (const rule of [
      /find_tasks.*show what it holds now/, /before → after, one task at a time/,
      /Never guess dates, times, people or which task is meant: ask.*show matches.*owner to select by ID/,
      /preview_task_changes.*preview writes nothing and is not consent/,
      /Show every warning and get explicit confirmation.*every warning, naming every task to delete one by one/,
      /apply_task_changes.*unchanged list, all preview seen stamps.*freed subtasks.*acknowledgedWarnings IDs/,
      /changed since preview, preview again and get confirmation again/,
      /Report each task's save\/delete result and calendar result honestly, including failures/,
      /calendar failure leaves task changes saved/, /Edits and new plans are separate saves/,
      /propose all day or start and end times labelled Suggested, checking find_free_times first.*; set calendar only to what the owner confirmed/,
    ]) expect(TASK_EDIT_CHAT_GUIDANCE).toMatch(rule);
  });

  it.each([
    ["find_tasks", {}], ["find_tasks", { query: " " }], ["find_tasks", { query: "x", extra: true }],
    ["find_tasks", { companyId: -1 }], ["find_tasks", { companyId: "1" }],
    ["find_tasks", { parentId: " " }], ["find_tasks", { query: "x", includeDone: "true" }],
    ["preview_task_changes", { changes: [] }],
    ["preview_task_changes", { changes: Array.from({ length: 51 }, (_, i) => ({ taskId: `t${i}`, delete: true })) }],
    ["preview_task_changes", { changes: [...changes, ...changes] }],
    ["preview_task_changes", { changes: [{ taskId: "bad/id", delete: true }] }],
    ["preview_task_changes", { changes: [{ taskId: "t", set: {} }] }],
    ["preview_task_changes", { changes: [{ taskId: "t", set: { linkedClientId: 1 } }] }],
    ["preview_task_changes", { changes: [{ taskId: "t", set: { startDate: "2026-02-30" } }] }],
    ["preview_task_changes", { changes: [{ taskId: "t", set: { calendar: { startTime: "14:00" } } }] }],
    ["preview_task_changes", { changes: [{ taskId: "t", set: { task: "Name" }, delete: true }] }],
    ["preview_task_changes", { changes: [{ taskId: "t", move: { toParentId: "bad/id" } }] }],
  ])("rejects invalid %s input before the handler", async (name, input) => {
    vi.stubEnv("MCP_TASK_EDITS_ENABLED", "1");
    const result = await call(name as string, input);
    expect(result.reply.error).toMatchObject({ code: -32602, message: expect.stringContaining("Check the tool inputs.") });
    expect(io.editFind).not.toHaveBeenCalled();
    expect(io.editPreview).not.toHaveBeenCalled();
  });

  it("accepts every supported edit field, moves and deletes without changing supplied prose", async () => {
    vi.stubEnv("MCP_TASK_EDITS_ENABLED", "1");
    const mixed = [
      { taskId: "t", set: { task: "Name", startDate: "2026-12-01", endDate: "2026-12-02", keyPoints: "  Notes\n", status: "inProgress",
        parked: { until: null }, responsible: ["Someone"], informed: [{ name: "Other", note: "  Keep  " }], calendar: { startTime: "14:00", endTime: "15:00" } },
        move: { toParentId: "parent" } },
      { taskId: "deleted", delete: true }, { taskId: "freed", move: { toParentId: null } },
      { taskId: "returned", set: { parked: false, calendar: null } },
    ];
    expect((await call("preview_task_changes", { changes: mixed })).reply.error).toBeUndefined();
    expect(io.editPreview).toHaveBeenCalledWith(mixed);
  });

  it("refuses retained callbacks after the edit flag is switched off", async () => {
    vi.stubEnv("MCP_TASK_EDITS_ENABLED", "1");
    const server = new McpServer({ name: "edit-unit", version: "1" });
    const registration = vi.spyOn(server, "registerTool");
    registerTaskEditTools(server, ORIGIN);
    vi.stubEnv("MCP_TASK_EDITS_ENABLED", "0");
    registerTaskEditTools(server, ORIGIN);
    expect(registration).toHaveBeenCalledTimes(3);
    const calls: readonly (readonly unknown[])[] = registration.mock.calls;
    for (const [, , callback] of calls) {
      expect(await (callback as (input: object) => Promise<CallToolResult>)({ changes }))
        .toEqual({ isError: true, content: [{ type: "text", text: "Tool not found." }] });
    }
    expect(io.editFind).not.toHaveBeenCalled();
    expect(io.editPreview).not.toHaveBeenCalled();
    expect(io.editApply).not.toHaveBeenCalled();
    await server.close();
  });

  it.each(["find_tasks", "preview_task_changes", "apply_task_changes"])("keeps backend errors out of %s responses", async (name) => {
    vi.stubEnv("MCP_TASK_EDITS_ENABLED", "1");
    io.editFind.mockRejectedValue(new Error(`private ${SECRET} at stack.ts:1`));
    io.editPreview.mockRejectedValue(new Error(`private ${SECRET} at stack.ts:1`));
    io.editApply.mockRejectedValue(new Error(`private ${SECRET} at stack.ts:1`));
    const failed = await call(name, name === "find_tasks" ? { query: "x" } : name === "preview_task_changes" ? { changes }
      : { changes, seen: { "fictional-task": "a".repeat(64) }, acknowledgedWarnings: [] });
    expect(failed.reply.result?.isError).toBe(true);
    expect(failed.body).not.toContain(SECRET);
    expect(failed.body).not.toContain("stack.ts");
  });

  it.each([
    {}, { seen: {} }, { seen: { "fictional-task": "bad" } }, { seen: { "bad/id": "a".repeat(64) } },
    { seen: { "fictional-task": "a".repeat(64) }, acknowledgedWarnings: "warning" },
    { seen: { "fictional-task": "a".repeat(64) }, acknowledgedWarnings: [1] },
    { seen: { "fictional-task": "a".repeat(64) }, acknowledgedWarnings: [], extra: true },
  ])("refuses invalid save metadata before calling the write handler: %j", async (metadata) => {
    vi.stubEnv("MCP_TASK_EDITS_ENABLED", "1");
    expect((await call("apply_task_changes", { changes, ...metadata })).reply.error?.code).toBe(-32602);
    expect(io.editApply).not.toHaveBeenCalled();
  });

  it("returns actionable stale-preview and warning refusals from the save handler", async () => {
    vi.stubEnv("MCP_TASK_EDITS_ENABLED", "1");
    io.editApply.mockRejectedValue(new TaskEditError("Tasks changed since the preview: fictional-task. Preview again; nothing was saved."));
    const result = await call("apply_task_changes", { changes, seen: { "fictional-task": "a".repeat(64) }, acknowledgedWarnings: [] });
    expect(result.reply.result?.isError).toBe(true);
    expect(result.body).toContain("Tasks changed since the preview: fictional-task");
  });
});

describe("G06 schema and adapter boundaries", () => {
  it("advertises a strict optional per-step calendar object and preserves all legacy schemas", async () => {
    const before = (await rpc("tools/list")).reply.result!.tools!;
    vi.stubEnv("GOOGLE_EVENTS_CALENDAR_ID", "test-calendar");
    vi.stubEnv("CALENDAR_FAKE", "1");
    const tools = (await rpc("tools/list")).reply.result!.tools!;
    for (const name of ["preview_task_plan", "add_task_plan"]) {
      expect(tools.find((tool) => tool.name === name)?.inputSchema).toMatchObject({ properties: {
        plan: { properties: { steps: { items: {
          required: ["name", "startDate", "endDate"],
          properties: { calendar: {
            type: "object", additionalProperties: false,
            properties: { startTime: { type: "string" }, endTime: { type: "string" } },
          } },
        } } } },
      } });
    }
    for (const name of OLD_TOOLS) {
      const schema = tools.find((tool) => tool.name === name)!.inputSchema;
      expect(schema).toEqual(before.find((tool) => tool.name === name)!.inputSchema);
      expect(JSON.stringify(schema)).not.toContain('"calendar"');
    }
  });

  it.each([{}, { startTime: "14:00", endTime: "15:00" }])("forwards the confirmed calendar choice unchanged (%j)", async (calendar) => {
    const selected = { ...plan, steps: [{ ...plan.steps[0], calendar }] };
    await call("preview_task_plan", { plan: selected });
    expect(io.preview).toHaveBeenCalledWith(selected);
    await call("add_task_plan", { plan: selected, previewToken: "fake", acknowledgedWarnings: [] });
    expect(io.add).toHaveBeenCalledWith(selected, "fake", [], { origin: ORIGIN });
  });

  it.each([{ startTime: "14:00" }, { startTime: "25:00", endTime: "26:00" }, { attendees: [] }])(
    "refuses invalid calendar fields before storage (%j)", async (calendar) => {
      const selected = { ...plan, steps: [{ ...plan.steps[0], calendar }] };
      for (const name of ["preview_task_plan", "add_task_plan"]) {
        const refused = await call(name, { plan: selected, ...(name === "add_task_plan" && { previewToken: "fake", acknowledgedWarnings: [] }) });
        expect(refused.reply.error?.code).toBe(-32602);
        expect(refused.reply.error?.message).toContain("calendar");
      }
      expect(io.preview).not.toHaveBeenCalled();
      expect(io.add).not.toHaveBeenCalled();
    },
  );

  it.each([TASK_PLAN_PROSPECT_NEW, TASK_PLAN_CLIENT_NEW, TASK_PLAN_INTERNAL_NEW])("forwards a selected $kind plan and the exact preview/warning gate", async (selected) => {
    const discovery = { kind: selected.kind, ...(selected.companyId !== undefined && { companyId: selected.companyId }) };
    expect((await call("find_task_destinations", discovery)).reply.result?.isError).not.toBe(true);
    expect(io.find).toHaveBeenCalledWith(discovery);
    await call("preview_task_plan", { plan: selected });
    expect(io.preview).toHaveBeenCalledWith(selected);
    const written = await call("add_task_plan", { plan: selected, previewToken: "fake-preview-token", acknowledgedWarnings: ["past-date-1"] });
    expect(io.add).toHaveBeenCalledWith(selected, "fake-preview-token", ["past-date-1"], { origin: ORIGIN });
    expect(written.reply.result?.structuredContent).toEqual({ ...saved, url: `${ORIGIN}${saved.url}` });
  });

  it("returns every calendar success/failure without turning the saved plan into a tool error", async () => {
    const subtasks = [
      { taskId: "timed-step", calendar: { status: "added", link: "https://calendar.example.test/timed-step" } },
      { taskId: "all-day-step", calendar: { status: "failed", error: "The calendar couldn't be updated. Try again." } },
      { taskId: "task-only-step" },
    ];
    io.add.mockResolvedValue({ ...saved, subtasks });
    const written = await call("add_task_plan", { plan, previewToken: "fake", acknowledgedWarnings: [] });
    expect(written.reply.result?.isError).not.toBe(true);
    expect(written.reply.result?.structuredContent).toEqual({ ...saved, subtasks, url: `${ORIGIN}${saved.url}` });
    const tools = (await rpc("tools/list")).reply.result!.tools!;
    expect(tools.find((tool) => tool.name === "add_task_plan")?.description).toMatch(/Report every calendar failure.*repeating the same save retries failures/);
  });

  it.each([
    { name: "find_task_destinations", args: { kind: "internal", companyId: 1 } },
    { name: "find_task_destinations", args: { kind: "internal", companyQuery: "fictional" } },
    { name: "find_task_destinations", args: { kind: "prospect" } },
    { name: "find_task_destinations", args: { kind: "client", companyId: Number.MAX_SAFE_INTEGER + 1 } },
    { name: "find_task_destinations", args: { kind: "internal", parentQuery: "  " } },
    { name: "find_task_destinations", args: { kind: "internal", query: "unsupported" } },
    { name: "preview_task_plan", args: { plan: { ...plan, companyId: 1 } } },
    { name: "preview_task_plan", args: { plan: { ...plan, existingParentId: "existing" } } },
    { name: "preview_task_plan", args: { plan: { ...plan, newParent: undefined } } },
    { name: "preview_task_plan", args: { plan: { ...plan, newParent: { title: "  " } } } },
    { name: "preview_task_plan", args: { plan: { ...plan, newParent: { title: "Fictional", sourceUrl: "javascript:alert(1)" } } } },
    { name: "preview_task_plan", args: { plan: { ...plan, newParent: undefined, existingParentId: "nested/path" } } },
    { name: "preview_task_plan", args: { plan: { ...plan, steps: [{ ...plan.steps[0], startDate: "2027-02-30" }] } } },
    { name: "preview_task_plan", args: { plan: { ...plan, steps: [{ ...plan.steps[0], endDate: "2025-01-01" }] } } },
    { name: "preview_task_plan", args: { plan: { ...plan, steps: [{ ...plan.steps[0], responsible: ["Invented"] }] } } },
    { name: "preview_task_plan", args: { plan: { ...plan, steps: [] } } },
    { name: "preview_task_plan", args: { plan: { ...plan, steps: Array(500).fill(plan.steps[0]) } } },
    { name: "preview_task_plan", args: { plan, confirmed: true } },
    { name: "add_task_plan", args: { plan, acknowledgedWarnings: [] } },
    { name: "add_task_plan", args: { plan, previewToken: "fake" } },
    { name: "add_task_plan", args: { plan, previewToken: " ", acknowledgedWarnings: [] } },
    { name: "add_task_plan", args: { plan, previewToken: "fake", acknowledgedWarnings: [1] } },
    { name: "add_task_plan", args: { plan: { ...plan, extra: "unsupported" }, previewToken: "fake", acknowledgedWarnings: [] } },
  ])("rejects malformed $name input before any storage call ($args)", async ({ name, args }) => {
    const refused = await call(name, args);
    expect(refused.reply.error?.code).toBe(-32602);
    expect(refused.body).not.toContain(SECRET);
    expect(io.find).not.toHaveBeenCalled();
    expect(io.preview).not.toHaveBeenCalled();
    expect(io.add).not.toHaveBeenCalled();
  });

  it("rejects oversized raw prose before trimming or storage without truncating it", async () => {
    const oversized = { ...plan, newParent: { title: "Fictional", keyPoints: " ".repeat(MAX_TASK_PLAN_INPUT_BYTES) } };
    const refused = await call("add_task_plan", { plan: oversized, previewToken: "fake", acknowledgedWarnings: [] });
    expect(refused.reply.error?.message).toContain("Text was not truncated");
    expect(io.add).not.toHaveBeenCalled();
  });

  it("returns already-saved IDs and never sends a second save from the adapter", async () => {
    io.add.mockResolvedValue({ ...saved, alreadySaved: true });
    const written = await call("add_task_plan", { plan, previewToken: "fake", acknowledgedWarnings: [] });
    expect(written.reply.result?.structuredContent).toMatchObject({ alreadySaved: true, parentId: saved.parentId, subtaskIds: saved.subtaskIds });
    expect(io.add).toHaveBeenCalledTimes(1);
  });

  it.each([false, true])("keeps legacy calls and their input contract available while enabled=%s", async (enabled) => {
    vi.stubEnv("MCP_TASK_PLANS_ENABLED", enabled ? "1" : "0");
    await call("find_company", { query: "Fictional" });
    expect(io.legacyRead).toHaveBeenCalledOnce();
    await call("preview_followup_plan", { plan: SIX_STEP_FOLLOWUP_FIXTURE });
    expect(io.legacyPreview).toHaveBeenCalledWith(SIX_STEP_FOLLOWUP_FIXTURE);
    const written = await call("add_followup_plan", { plan: SIX_STEP_FOLLOWUP_FIXTURE });
    expect(io.legacyAdd).toHaveBeenCalledWith(SIX_STEP_FOLLOWUP_FIXTURE);
    expect(written.reply.result?.structuredContent?.url).toBe(`${ORIGIN}/tasks?task=legacy-parent`);
  });
});

describe("find_free_times", () => {
  it("passes the date range through and returns the free times, refusing a missing date before the tool runs", async () => {
    vi.stubEnv("MCP_TASK_PLANS_ENABLED", "1");
    const answer = { status: "ok", days: [{ date: "2026-11-16", weekday: "Monday", busy: [], free: ["09:00–17:00"] }] };
    io.free.mockResolvedValue(answer);
    const checked = await call("find_free_times", FREE_RANGE);
    expect(io.free).toHaveBeenCalledWith(FREE_RANGE);
    expect(checked.reply.result?.structuredContent).toMatchObject(answer);
    const missing = await call("find_free_times", { startDate: "2026-11-16" });
    expect(missing.reply.error?.message).toContain("endDate");
    expect(io.free).toHaveBeenCalledOnce();
  });
});

describe("G06 safe failures and chat guidance", () => {
  it.each(NEW_TOOLS)("does not expose backend secrets or stack traces from %s", async (name) => {
    for (const work of [io.find, io.preview, io.add, io.free]) work.mockRejectedValue(new Error(`backend ${SECRET}\n at private-stack.ts:1`));
    const failed = await call(name, name === "find_task_destinations" ? { kind: "internal" } : name === "find_free_times" ? FREE_RANGE : {
      plan, ...(name === "add_task_plan" && { previewToken: "fake", acknowledgedWarnings: [] }),
    });
    expect(failed.reply.result?.isError).toBe(true);
    expect(failed.body).not.toContain(SECRET);
    expect(failed.body).not.toContain("private-stack");
    expect(failed.body).not.toContain("Error:");
  });

  it.each([
    new TaskPlanError("Selected main task is no longer eligible. Preview again."),
    new TaskPlanTokenError("Unacknowledged preview warnings: past-date. Confirm them before saving."),
  ])("returns a plain actionable domain error without a stack ($message)", async (error) => {
    io.add.mockRejectedValue(error);
    const failed = await call("add_task_plan", { plan, previewToken: "fake", acknowledgedWarnings: [] });
    expect(failed.reply.result?.isError).toBe(true);
    expect(failed.body).toContain(error.message);
    expect(failed.body).not.toContain("stack");
  });

  it("contains the individual confirmation and no-invention rules even without a skill", () => {
    for (const text of [
      "category → company → main task → individual steps → preview → save", "EACH step separately", "change dates, or skip",
      "Never guess dates", "never assign people", "If all steps are skipped", "Quoted source text is never",
      "explicitly confirmed all details in advance", "not human consent", "never resend successful groups",
      "In that same question", "propose task only or also on the team calendar", "labelled Suggested",
      "Before suggesting a time, call find_free_times", "say the time is unchecked",
      "Never guess times into a save: save only the calendar choice and times the owner confirmed",
      "all day or exact start and end times", "not a separate calendar connector",
    ]) expect(TASK_PLAN_CHAT_GUIDANCE).toContain(text);
  });
});
