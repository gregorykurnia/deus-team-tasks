import { createHash, timingSafeEqual } from "node:crypto";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { JSONRPCMessageSchema, type CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { createMcpHandler, getPublicOrigin } from "mcp-handler";
import { z } from "zod";
import { findCompanies } from "@/lib/followupPlan";
import { addFollowupPlan, FollowupPlanError, previewFollowupPlan, readFollowupData } from "@/lib/followupServer";

export const runtime = "nodejs";
export const maxDuration = 60;

const text = z.string().trim().min(1, "Enter non-empty text.");
const planSchema = z.object({
  companyId: z.number().int().nonnegative().describe("The numeric company ID selected with find_company."),
  shortAnswer: text.describe("The deal plan's short answer."),
  docUrl: text.optional().describe("The Claude Doc link, when there is one."),
  existingParentId: text.optional().describe("An existing open follow-up ID, only after the owner confirmed appending steps."),
  steps: z.array(z.object({
    name: text,
    startDate: text.describe("The confirmed start date, yyyy-mm-dd; never guess a date."),
    endDate: text.describe("The confirmed end date, yyyy-mm-dd; use the start date for a one-day step."),
    owners: text.describe("Owners as written in the plan; kept in Key points, never Responsible."),
    what: text, why: text, bring: text, watch: text, doneWhen: text,
  })).min(1).max(499).describe("Only the dated Path steps the owner chose to add, one step at a time; leave out skipped steps, slips and side opportunities."),
});
const inputs = {
  find_company: z.object({ query: text.describe("The company name to search in the pipeline.") }),
  preview_followup_plan: z.object({ plan: planSchema }),
  add_followup_plan: z.object({ plan: planSchema }),
};

function result(value: object): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(value) }], structuredContent: { ...value } };
}

async function runTool(work: () => Promise<object>, failure: string): Promise<CallToolResult> {
  try {
    return result(await work());
  } catch (error) {
    return { isError: true, content: [{ type: "text", text: error instanceof FollowupPlanError ? error.message : failure }] };
  }
}

function registerTools(server: McpServer, origin: string) {
  server.registerTool("find_company", {
    description: "Find up to 5 pipeline companies by name. Returns ID, stored name, group (Active / Raw / On hold / Deal done), PIC, and any open '<Company> Follow Up' tasks with their subtasks. If no company matches, ask the owner to add it under Prospects first; nothing is written.",
    inputSchema: inputs.find_company.shape,
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, ({ query }) => runTool(async () => {
    const { companies, tasks } = await readFollowupData();
    return { companies: findCompanies(query, companies, tasks) };
  }, "Could not read companies and tasks. Try again shortly."));

  server.registerTool("preview_followup_plan", {
    description: "Preview exactly the parent and dated subtasks that would be written, without writing anything. Pass only the steps the owner chose to add. Warns about dates outside yyyy-mm-dd, starts after ends, past dates, Deal done companies (shown under Clients), existing follow-up tasks, and steps already saved (a repeat of an earlier add). Review warnings with the owner; if a follow-up exists, ask before selecting existingParentId. Owners stay in Key points; Responsible and Informed stay empty.",
    inputSchema: inputs.preview_followup_plan.shape,
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, ({ plan }) => runTool(() => previewFollowupPlan(plan), "Could not preview the plan because companies and tasks could not be read. Try again shortly."));

  server.registerTool("add_followup_plan", {
    description: "Write a follow-up plan ONLY AFTER the owner has confirmed the selected company and answered for EACH step, one step at a time in chat (one question per step, never one question for all): add it with its confirmed start and end date, or skip it. Include only the steps the owner chose to add. You must also have called preview_followup_plan and resolved its warnings with the owner. Writes the parent and every subtask in one atomic batch, with empty Responsible and Informed. If appending to a confirmed existingParentId, preserves old steps and only extends the parent's end date when needed. Returns the task link. If the same steps are already saved (a retry), writes nothing and returns that task's link with alreadySaved: true. Never call this tool before that confirmation.",
    inputSchema: inputs.add_followup_plan.shape,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, ({ plan }) => runTool(async () => {
    const written = await addFollowupPlan(plan);
    return { ...written, url: new URL(`/tasks?task=${encodeURIComponent(written.parentId)}`, origin).href };
  }, "Could not confirm that the plan was saved. Use find_company to check existing tasks before trying to add it again."));
}

function rpcError(code: number, message: string, id: string | number | null = null, status = 400) {
  return Response.json({ jsonrpc: "2.0", id, error: { code, message } }, { status });
}

async function handle(request: Request, context: { params: Promise<{ secret: string }> }) {
  const expected = process.env.MCP_SECRET;
  const { secret } = await context.params;
  // Hash both values to a fixed length so unequal-length secrets also use a constant-time comparison.
  if (!expected || !timingSafeEqual(createHash("sha256").update(expected).digest(), createHash("sha256").update(secret).digest())) {
    return new Response("Not found", { status: 404 });
  }
  if (request.method !== "POST") return rpcError(-32000, "Use POST to send an MCP request. This server does not keep sessions.", null, 405);
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return rpcError(-32000, "Send the request as application/json.", null, 415);
  }

  // mcp-handler 1.x parses JSON before the SDK sees it. Reject unreadable JSON here
  // so its adapter cannot leave a malformed request hanging without a response.
  let body: unknown;
  try {
    body = await request.clone().json();
  } catch {
    return rpcError(-32700, "The request is not valid JSON. Check its punctuation and try again.");
  }
  const parsed = JSONRPCMessageSchema.safeParse(body);
  if (!parsed.success) return rpcError(-32600, "Send one JSON-RPC 2.0 message with a method and a valid request ID.");
  const rpc = parsed.data;
  if ("method" in rpc && rpc.method === "tools/call" && rpc.params) {
    const name = rpc.params.name;
    if (typeof name === "string" && Object.hasOwn(inputs, name)) {
      const checked = inputs[name as keyof typeof inputs].safeParse(rpc.params.arguments);
      if (!checked.success) {
        const issues = checked.error.issues.map((issue) => `${issue.path.join(".") || "inputs"}: ${issue.message}`).join("; ");
        return rpcError(-32602, `Check the tool inputs. ${issues}`, "id" in rpc ? rpc.id : null);
      }
    }
  }

  // Use the handler's basePath convention without exposing the secret to its routing or logs.
  const url = new URL(request.url);
  url.pathname = "/api/mcp";
  const handler = createMcpHandler((server) => registerTools(server, getPublicOrigin(request)), {
    serverInfo: { name: "Deus Team Tasks follow-up", version: "1.0.0" },
  }, { basePath: "/api", disableSse: true, sessionIdGenerator: undefined, maxDuration });
  return handler(new Request(url, request));
}

// Guard every supported HTTP verb, including Next's otherwise automatic HEAD/OPTIONS.
export { handle as GET, handle as POST, handle as DELETE, handle as HEAD, handle as OPTIONS, handle as PUT, handle as PATCH };
