import "server-only";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { MAX_TASK_CHANGES, validateTaskChanges } from "./taskEdit";
import { findTasks, previewTaskChanges } from "./taskEditServer";

export const taskEditsEnabled = () => process.env.MCP_TASK_EDITS_ENABLED === "1";

const text = z.string().trim().min(1, "Enter non-empty text.");
const changes = z.array(z.object({
  taskId: z.string().describe("The exact task ID returned by find_tasks."),
  set: z.object({
    task: z.string().optional(),
    startDate: z.string().optional().describe("Confirmed yyyy-mm-dd start date."),
    endDate: z.string().optional().describe("Confirmed yyyy-mm-dd deadline."),
    keyPoints: z.string().optional().describe("The whole replacement text, preserving supplied prose."),
    status: z.enum(["todo", "inProgress", "done"]).optional(),
    parked: z.union([z.literal(false), z.object({ until: z.string().nullable() }).strict()]).optional(),
    responsible: z.array(z.string()).optional(),
    informed: z.array(z.object({ name: z.string(), note: z.string().optional() }).strict()).optional(),
    calendar: z.object({ startTime: z.string().optional(), endTime: z.string().optional() }).strict().nullable().optional()
      .describe("{} for all day, both confirmed HH:MM times in Asia/Jakarta, or null to take off the calendar."),
  }).strict().optional(),
  move: z.object({ toParentId: z.string().nullable() }).strict().optional()
    .describe("An eligible main-task ID, or null to free a subtask."),
  delete: z.literal(true).optional().describe("Delete alone, without set or move."),
}).strict()).min(1).max(MAX_TASK_CHANGES).superRefine((input, context) => {
  for (const message of validateTaskChanges(input).errors) context.addIssue({ code: "custom", message });
});

export const taskEditToolInputs = {
  find_tasks: z.object({
    query: text.optional().describe("Case-insensitive text in task names or Key points."),
    companyId: z.number().int().nonnegative().optional().describe("The stored numeric company ID."),
    parentId: text.optional().describe("Find subtasks of this exact main-task ID."),
    includeDone: z.boolean().optional().default(false),
  }).strict().refine((input) => input.query !== undefined || input.companyId !== undefined || input.parentId !== undefined,
    "Supply query, companyId or parentId; combine them to narrow the search."),
  preview_task_changes: z.object({ changes }).strict(),
};

export function isTaskEditTool(name: unknown): name is keyof typeof taskEditToolInputs {
  return typeof name === "string" && Object.hasOwn(taskEditToolInputs, name);
}

async function runTool(work: () => Promise<object>, failure: string): Promise<CallToolResult> {
  if (!taskEditsEnabled()) return { isError: true, content: [{ type: "text", text: "Tool not found." }] };
  try {
    const value = await work();
    return { content: [{ type: "text", text: JSON.stringify(value) }], structuredContent: { ...value } };
  } catch {
    return { isError: true, content: [{ type: "text", text: failure }] };
  }
}

export function registerTaskEditTools(server: McpServer) {
  if (!taskEditsEnabled()) return;
  const annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
  server.registerTool("find_tasks", {
    description: "Find up to 10 tasks or subtasks by name/Key points text, company ID and/or main-task ID. Includes stored fields, main task, company, group, dates, status, parking, people, Key points, calendar mark and subtasks. Done tasks are omitted unless includeDone is true. Refine the search when hasMore is true. Reads only; nothing is saved.",
    inputSchema: taskEditToolInputs.find_tasks, annotations,
  }, (input) => runTool(() => findTasks(input), "Could not read tasks and companies. Try again shortly."));
  server.registerTool("preview_task_changes", {
    description: "Preview 1–50 explicitly listed task edits, moves or deletes without saving. One change per task ID. Returns before/after records, seen stamps, errors and stable warning IDs, including subtasks freed by a main task's deletion. Show the exact changes and warnings to the owner; a preview never saves or confirms consent.",
    inputSchema: taskEditToolInputs.preview_task_changes, annotations,
  }, ({ changes }) => runTool(() => previewTaskChanges(changes), "Could not preview task changes. Try again shortly."));
}
