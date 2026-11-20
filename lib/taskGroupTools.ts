import "server-only";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { runTaskEditTool, taskEditsEnabled } from "./taskEditTools";
import { GroupNameError, TASK_GROUP_ACTIONS } from "./taskGroupModel";
import { changeTaskGroup, listTaskGroups, TaskGroupError } from "./taskGroupServer";

const name = z.string().refine((value) => value.trim().length > 0, "Enter a name.");
export const taskGroupToolInputs = {
  list_task_groups: z.object({}).strict().default({}),
  change_task_group: z.object({
    action: z.enum(TASK_GROUP_ACTIONS).describe("Use star to mark as important and unstar to unmark as important."),
    name: name.describe("The new group name when creating. Otherwise use the group's stored name from list_task_groups."),
    newName: name.optional().describe("Required for rename. Use the exact new spelling the owner confirmed."),
    starred: z.boolean().optional().describe("For create only. True marks the group as important. Defaults to false."),
    taskCount: z.number().int().nonnegative().optional().describe("Required for rename and delete. Pass the confirmed total task count from list_task_groups, including done tasks."),
  }).strict().superRefine((input, context) => {
    if (input.action === "rename" && input.newName === undefined) {
      context.addIssue({ code: "custom", path: ["newName"], message: "Enter the new group name." });
    }
    if ((input.action === "rename" || input.action === "delete") && input.taskCount === undefined) {
      context.addIssue({ code: "custom", path: ["taskCount"], message: "Use the total taskCount from list_task_groups." });
    }
  }),
};

export function isTaskGroupTool(name: unknown): name is keyof typeof taskGroupToolInputs {
  return typeof name === "string" && Object.hasOwn(taskGroupToolInputs, name);
}

function isGroupError(error: unknown): error is Error {
  return error instanceof TaskGroupError || error instanceof GroupNameError;
}

const confirmation = "Get the owner's explicit yes in chat to the exact action and group name before calling change_task_group. For rename, include the new name. For rename or delete, show both the open and total task counts before asking.";

export function registerTaskGroupTools(server: McpServer) {
  if (!taskEditsEnabled()) return;
  server.registerTool("list_task_groups", {
    description: `List task groups in app order, important groups first. Returns the ID (null if only tasks carry the name), name, importance (always say "important" to the owner), openTasks (excluding parked and done), and taskCount (all tasks). Reads only. ${confirmation}`,
    inputSchema: taskGroupToolInputs.list_task_groups,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, () => runTaskEditTool(listTaskGroups, "Could not read task groups. Try again shortly.", isGroupError));
  server.registerTool("change_task_group", {
    description: `Create or rename a group, mark or unmark it as important, or delete it. ${confirmation} Use list_task_groups to get taskCount for rename and delete. Renaming moves every member task to the new name. Deleting keeps the tasks and makes them ungrouped. Company tasks keep their companies. If the count changed, list the groups and confirm again.`,
    inputSchema: taskGroupToolInputs.change_task_group,
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  }, (input) => runTaskEditTool(() => changeTaskGroup(input),
    "Could not confirm whether the group change was saved. Use list_task_groups to check its current state before trying again.", isGroupError));
}
