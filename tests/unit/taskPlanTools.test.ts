import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult, Tool } from "@modelcontextprotocol/sdk/types.js";
import { POST, GET, DELETE, HEAD, OPTIONS, PUT, PATCH } from "@/app/api/mcp/[secret]/route";
import { MAX_TASK_PLAN_INPUT_BYTES } from "@/lib/taskPlan";
import { TaskPlanError } from "@/lib/taskPlanServer";
import { TaskPlanTokenError } from "@/lib/taskPlanToken";
import { registerTaskPlanTools, TASK_PLAN_CHAT_GUIDANCE, taskPlanToolInputs } from "@/lib/taskPlanTools";
import { TASK_PLAN_INTERNAL_NEW, TASK_PLAN_PROSPECT_NEW, TASK_PLAN_CLIENT_NEW } from "../fixtures/taskPlan";
import { SIX_STEP_FOLLOWUP_FIXTURE } from "../fixtures/followupPlan";

// Exercise the installed handler/SDK in memory. No Firebase module or network is used by these tests.
const io = vi.hoisted(() => ({
  find: vi.fn(), preview: vi.fn(), add: vi.fn(),
  legacyRead: vi.fn(), legacyPreview: vi.fn(), legacyAdd: vi.fn(),
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
  io.find.mockResolvedValue({ companies: [], parents: [], errors: [], hasMore: { companies: false, parents: false } });
  io.preview.mockResolvedValue({ canWrite: true, warnings: [], previewToken: "fictional-token" });
  io.add.mockResolvedValue(saved);
  io.legacyRead.mockResolvedValue({ companies: [], tasks: [] });
  io.legacyPreview.mockResolvedValue({ canWrite: true });
  io.legacyAdd.mockResolvedValue({ parentId: "legacy-parent", subtaskIds: [], alreadySaved: false });
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
    expect(registration).toHaveBeenCalledTimes(3);
    vi.stubEnv("MCP_TASK_PLANS_ENABLED", "0");
    // Widen the generic SDK callback tuple: Vitest otherwise infers its overload as never.
    const registeredCalls: readonly (readonly unknown[])[] = registration.mock.calls;
    for (const [, , callback] of registeredCalls) {
      const result = await (callback as (input: object) => Promise<CallToolResult>)({ plan });
      expect(result.isError).toBe(true);
    }
    registerTaskPlanTools(server, ORIGIN);
    expect(registration).toHaveBeenCalledTimes(3);
    expect(io.find).not.toHaveBeenCalled();
    expect(io.preview).not.toHaveBeenCalled();
    expect(io.add).not.toHaveBeenCalled();
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

describe("G06 schema and adapter boundaries", () => {
  it.each([TASK_PLAN_PROSPECT_NEW, TASK_PLAN_CLIENT_NEW, TASK_PLAN_INTERNAL_NEW])("forwards a selected $kind plan and the exact preview/warning gate", async (selected) => {
    const discovery = { kind: selected.kind, ...(selected.companyId !== undefined && { companyId: selected.companyId }) };
    expect((await call("find_task_destinations", discovery)).reply.result?.isError).not.toBe(true);
    expect(io.find).toHaveBeenCalledWith(discovery);
    await call("preview_task_plan", { plan: selected });
    expect(io.preview).toHaveBeenCalledWith(selected);
    const written = await call("add_task_plan", { plan: selected, previewToken: "fake-preview-token", acknowledgedWarnings: ["past-date-1"] });
    expect(io.add).toHaveBeenCalledWith(selected, "fake-preview-token", ["past-date-1"]);
    expect(written.reply.result?.structuredContent).toEqual({ ...saved, url: `${ORIGIN}${saved.url}` });
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

describe("G06 safe failures and chat guidance", () => {
  it.each(NEW_TOOLS)("does not expose backend secrets or stack traces from %s", async (name) => {
    for (const work of [io.find, io.preview, io.add]) work.mockRejectedValue(new Error(`backend ${SECRET}\n at private-stack.ts:1`));
    const failed = await call(name, name === "find_task_destinations" ? { kind: "internal" } : {
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
    ]) expect(TASK_PLAN_CHAT_GUIDANCE).toContain(text);
  });
});
