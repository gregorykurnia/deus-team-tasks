import "server-only";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { MAX_TASK_CHANGES, validateTaskChanges } from "./taskEdit";
import { applyTaskChanges, findTasks, previewTaskChanges, TaskEditError } from "./taskEditServer";

export const taskEditsEnabled = () => process.env.MCP_TASK_EDITS_ENABLED === "1";

// Repeat this in every description: clients may omit initialize instructions.
export const TASK_EDIT_CHAT_GUIDANCE = "Use find_tasks to find the task and show what it holds now; show each proposed change as before → after, one task at a time. Never guess dates, times, people or which task is meant: ask for missing details or show matches for the owner to select by ID. Use confirmed yyyy-mm-dd dates and, for timed calendar events, both HH:MM times in Asia/Jakarta. To put a task on the calendar or change its time, you may propose all day or start and end times labelled Suggested; set calendar only to what the owner confirmed. The saved change updates the task and its Google Calendar event together; never use a separate calendar connector for a task's event. Call preview_task_changes with only explicitly listed tasks; a preview writes nothing and is not consent. Show every warning and get explicit confirmation of the exact changes and every warning, naming every task to delete one by one. Then call apply_task_changes with the unchanged list, all preview seen stamps (including freed subtasks) and acknowledgedWarnings IDs. If a task changed since preview, preview again and get confirmation again. Retry an uncertain save with the exact same list and stamps. Report each task's save/delete result and calendar result honestly, including failures; a calendar failure leaves task changes saved. Edits and new plans are separate saves.";

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
  apply_task_changes: z.object({
    changes,
    seen: z.record(z.string().refine((id) => !!validateTaskChanges([{ taskId: id, delete: true }]).changes, "Use a valid task ID."), z.string().regex(/^[a-f0-9]{64}$/))
      .describe("Map every previewed task ID to its seen stamp, including subtasks freed by deletion."),
    acknowledgedWarnings: z.array(z.string()).describe("Only warning IDs the owner has explicitly confirmed."),
  }).strict().refine((input) => input.changes.every((change) => Object.hasOwn(input.seen, change.taskId)), "Include the seen stamp for every listed task."),
};

export function isTaskEditTool(name: unknown): name is keyof typeof taskEditToolInputs {
  return typeof name === "string" && Object.hasOwn(taskEditToolInputs, name);
}

async function runTool(work: () => Promise<object>, failure: string): Promise<CallToolResult> {
  if (!taskEditsEnabled()) return { isError: true, content: [{ type: "text", text: "Tool not found." }] };
  try {
    const value = await work();
    return { content: [{ type: "text", text: JSON.stringify(value) }], structuredContent: { ...value } };
  } catch (error) {
    return { isError: true, content: [{ type: "text", text: error instanceof TaskEditError ? error.message : failure }] };
  }
}

export function registerTaskEditTools(server: McpServer, origin: string) {
  if (!taskEditsEnabled()) return;
  const annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
  server.registerTool("find_tasks", {
    description: `Find up to 10 tasks or subtasks by name/Key points text, company ID and/or main-task ID. Includes stored fields, main task, company, group, dates, status, parking, people, Key points, calendar mark and subtasks. Done tasks are omitted unless includeDone is true. Refine the search when hasMore is true. Reads only; nothing is saved. ${TASK_EDIT_CHAT_GUIDANCE}`,
    inputSchema: taskEditToolInputs.find_tasks, annotations,
  }, (input) => runTool(() => findTasks(input), "Could not read tasks and companies. Try again shortly."));
  server.registerTool("preview_task_changes", {
    description: `Preview 1–50 explicitly listed task edits, moves or deletes without saving. One change per task ID. Returns before/after records, seen stamps, errors and stable warning IDs, including subtasks freed by a main task's deletion. Show the exact changes and warnings to the owner; a preview never saves or confirms consent. ${TASK_EDIT_CHAT_GUIDANCE}`,
    inputSchema: taskEditToolInputs.preview_task_changes, annotations,
  }, ({ changes }) => runTool(() => previewTaskChanges(changes), "Could not preview task changes. Try again shortly."));
  server.registerTool("apply_task_changes", {
    description: `Save ONLY AFTER preview_task_changes and the owner's confirmation of the exact edits, every deleted task by name, and every warning. Pass the same changes, all preview seen stamps (including freed subtasks), and confirmed warning IDs. Saves the list atomically; a changed task refuses the whole list. Open company tasks' deadline changes update their company; a company failure restores the task changes. Calendar sync runs after saving and reports failures per task without undoing saved changes. Retrying the same saved list returns alreadySaved and retries calendar work. Never save an unlisted task or infer consent from a preview. ${TASK_EDIT_CHAT_GUIDANCE}`,
    inputSchema: taskEditToolInputs.apply_task_changes,
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  }, ({ changes, seen, acknowledgedWarnings }) => runTool(() => applyTaskChanges(changes, seen, acknowledgedWarnings, origin),
    "Could not confirm whether the task changes were saved. Find and preview the tasks before trying again."));
}
