// E1: real MCP HTTP saves, checked through the task sheet and emulator-backed fake calendar. No screenshots.
import type { Page } from "@playwright/test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import type { calendar_v3 } from "googleapis";
import type { TaskChange, TaskChangesPreview } from "../../lib/taskEdit";
import type { FindTasksInput, TaskChangesSaved, findTasks } from "../../lib/taskEditServer";
import { EMULATOR_HOST } from "../support/emulator";
import { test as base, expect } from "./fixtures";
import { isoDay, seedTasks, stored, storedById, task } from "./data";

const test = base.extend<{ edits: Client }>({
  edits: async ({ baseURL }, use) => {
    // Refuse a remote target before connecting or seeding any test data.
    expect(baseURL).toBe("http://localhost:3100");
    expect(EMULATOR_HOST).toBe("127.0.0.1:8180");
    const client = new Client({ name: "chat-task-edits-e1", version: "1.0.0" });
    try {
      await client.connect(new StreamableHTTPClientTransport(new URL("/api/mcp/mcp-smoke-emulator-only", baseURL)));
      await use(client);
    } finally {
      await client.close();
    }
  },
});

async function call<T>(client: Client, name: string, args: Record<string, unknown>): Promise<T> {
  const result = CallToolResultSchema.parse(await client.callTool({ name, arguments: args }));
  const content = result.content.find((part) => part.type === "text");
  expect(result.isError, content?.text).not.toBe(true);
  if (!content) throw new Error(`${name} returned no text result.`);
  return JSON.parse(content.text) as T;
}

const find = (client: Client, input: FindTasksInput) =>
  call<Awaited<ReturnType<typeof findTasks>>>(client, "find_tasks", { ...input });

async function save(client: Client, changes: TaskChange[]) {
  const before = await stored("tasks", "tasks");
  const preview = await call<TaskChangesPreview>(client, "preview_task_changes", { changes });
  expect(preview.errors).toEqual([]);
  expect(preview.canWrite).toBe(true);
  expect(await stored("tasks", "tasks"), "preview must not save").toEqual(before);
  // These are fictional, explicitly confirmed fixtures; acknowledge the exact warnings returned by HTTP.
  const saved = await call<TaskChangesSaved>(client, "apply_task_changes", {
    changes,
    seen: Object.fromEntries(preview.tasks.map((row) => [row.taskId, row.seen])),
    acknowledgedWarnings: preview.warnings.map((warning) => warning.id),
  });
  expect(saved.alreadySaved).toBe(false);
  for (const change of changes) {
    expect(saved.tasks).toContainEqual(expect.objectContaining({
      taskId: change.taskId, saved: true, deleted: change.delete === true,
      url: `http://localhost:3100/tasks?task=${change.taskId}`,
    }));
  }
  expect(saved.tasks.flatMap((row) => row.calendar ? [row.calendar.status] : [])).not.toContain("failed");
  return { preview, saved };
}

async function openTask(page: Page, id: string, title = "Task") {
  await page.goto(`/tasks?task=${id}`);
  await expect(page.getByText("Live, everyone's up to date").first()).toBeAttached();
  const sheet = page.getByRole("dialog", { name: title, exact: true });
  await expect(sheet).toBeVisible();
  return sheet;
}

async function events() {
  return (await stored("tasks", "testCalendarEvents"))
    .map((doc) => JSON.parse(doc.event as string) as calendar_v3.Schema$Event);
}

// Warm only the HTTP routes that Next compiles on first use, outside the per-scenario timeout.
test.beforeAll(async ({ request }) => {
  test.setTimeout(120_000);
  expect((await request.get("/api/mcp/wrong-secret", { timeout: 110_000 })).status()).toBe(404);
  expect((await request.get("/api/calendar/sync", { timeout: 110_000 })).ok()).toBe(true);
});

test("HTTP edits show the new name, dates, Done and person in the sheet, and update then remove one calendar event", async ({ page, request, edits }) => {
  const parent = task("chat-main", { task: "Fictional chat launch", startDate: isoDay(1), endDate: isoDay(20) });
  const marked = task("chat-marked", {
    task: "Fictional chat review", parentId: parent.id, startDate: isoDay(2), endDate: isoDay(3), calendar: {},
  });
  const untouched = task("chat-untouched", { task: "Fictional chat follow-up", parentId: parent.id });
  await seedTasks([parent, marked, untouched]);
  const found = await find(edits, { query: marked.task });
  expect(found.tasks).toHaveLength(1);
  expect(found.tasks[0]).toMatchObject({ id: marked.id, mainTask: { id: parent.id, task: parent.task }, calendar: {} });

  // Sync the originally marked task via HTTP so the edit must update an existing event.
  const initial = await request.post("/api/calendar/sync", { data: { taskIds: [marked.id] } });
  expect(initial.ok()).toBe(true);
  expect((await initial.json()).results).toEqual([expect.objectContaining({ taskId: marked.id, status: "synced" })]);
  const originalEvents = await events();
  expect(originalEvents).toHaveLength(1);
  expect(originalEvents[0].summary).toBe(marked.task);

  const renamed = "Fictional chat review approved";
  const startDate = isoDay(5);
  const endDate = isoDay(7);
  const changed = await save(edits, [{ taskId: marked.id, set: {
    task: renamed, startDate, endDate, status: "done", responsible: ["Fictional Chat Owner"],
  } }]);
  expect(changed.preview.warnings).toContainEqual(expect.objectContaining({ id: "new-person:Fictional Chat Owner" }));
  expect(changed.saved.tasks[0].calendar?.status).toBe("synced");
  const sheet = await openTask(page, marked.id, "Finished task");
  await expect(sheet.getByLabel("Description")).toHaveValue(renamed);
  await expect(sheet.getByLabel("Start", { exact: true })).toHaveValue(startDate);
  await expect(sheet.getByLabel("Deadline")).toHaveValue(endDate);
  await expect(sheet.getByRole("group", { name: "Status", exact: true }).getByRole("button", { name: "Done", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(sheet.getByRole("button", { name: "Remove Fictional Chat Owner", exact: true })).toBeVisible();
  await expect(sheet.getByRole("status").filter({ hasText: "On the team calendar" })).toBeVisible();
  const updatedEvents = await events();
  expect(updatedEvents).toHaveLength(1);
  expect(updatedEvents[0]).toMatchObject({
    id: originalEvents[0].id, summary: renamed, start: { date: startDate }, end: { date: isoDay(8) },
    extendedProperties: { private: { deusTaskId: marked.id } },
  });
  expect(await storedById("tasks", "tasks", untouched.id)).toEqual(untouched);
  expect(await storedById("tasks", "tasks", parent.id)).toEqual(parent);

  const deleted = await save(edits, [{ taskId: marked.id, delete: true }]);
  expect(deleted.saved.tasks[0].calendar?.status).toBe("removed");
  const removedEvents = await events();
  // The fake mirrors Google: deletion reserves the event ID as a cancellation tombstone.
  expect(removedEvents).toEqual([expect.objectContaining({ id: originalEvents[0].id, status: "cancelled" })]);
  expect(removedEvents.filter((event) => event.status !== "cancelled")).toEqual([]);
  expect(await storedById("tasks", "tasks", marked.id)).toBeUndefined();
  expect((await find(edits, { query: renamed, includeDone: true })).tasks).toEqual([]);
  const parentSheet = await openTask(page, parent.id);
  await expect(parentSheet.getByRole("group", { name: "Subtasks" })).not.toContainText(renamed);
  await expect(parentSheet.getByRole("group", { name: "Subtasks" })).toContainText(untouched.task);
});

test("HTTP moves show the new parent, freeing makes a main task, and deleting a main task preserves its unlisted subtask", async ({ page, edits }) => {
  const parent = task("chat-source", { task: "Fictional chat source" });
  const destination = task("chat-destination", { task: "Fictional chat destination" });
  const moving = task("chat-moving", { task: "Fictional chat moving step", parentId: parent.id });
  const survivor = task("chat-survivor", { task: "Fictional chat surviving step", parentId: parent.id });
  await seedTasks([parent, moving, survivor, destination]);
  expect((await find(edits, { parentId: parent.id })).tasks.map((row) => row.id).sort()).toEqual([moving.id, survivor.id]);

  await save(edits, [{ taskId: moving.id, move: { toParentId: destination.id } }]);
  const movedSheet = await openTask(page, moving.id);
  await expect(movedSheet.getByText("Subtask of")).toBeVisible();
  await expect(movedSheet.getByRole("link", { name: destination.task, exact: true })).toBeVisible();
  await movedSheet.getByRole("link", { name: destination.task, exact: true }).click();
  await expect(movedSheet.getByRole("group", { name: "Subtasks" })).toContainText(moving.task);
  const sourceSheet = await openTask(page, parent.id);
  await expect(sourceSheet.getByRole("group", { name: "Subtasks" })).not.toContainText(moving.task);
  await expect(sourceSheet.getByRole("group", { name: "Subtasks" })).toContainText(survivor.task);

  await save(edits, [{ taskId: moving.id, move: { toParentId: null } }]);
  const freedSheet = await openTask(page, moving.id);
  await expect(freedSheet.getByText("Subtask of")).toHaveCount(0);
  await expect(freedSheet.getByRole("group", { name: "Subtasks" })).toBeVisible();
  await freedSheet.getByRole("button", { name: "Close", exact: true }).click();
  const rows = page.getByRole("main").getByRole("article");
  await expect(rows.filter({ has: page.getByRole("link", { name: moving.task, exact: true }) })).not.toHaveAttribute("data-sub");
  const emptyDestination = await openTask(page, destination.id);
  await expect(emptyDestination.getByRole("group", { name: "Subtasks" })).not.toContainText(moving.task);

  const deletion = await save(edits, [{ taskId: parent.id, delete: true }]);
  expect(deletion.preview.tasks.find((row) => row.taskId === survivor.id)?.after).toEqual({ ...survivor, parentId: undefined });
  expect(await storedById("tasks", "tasks", parent.id)).toBeUndefined();
  expect(await storedById("tasks", "tasks", survivor.id)).toEqual({ ...survivor, parentId: undefined });
  const survivorSheet = await openTask(page, survivor.id);
  await expect(survivorSheet.getByLabel("Description")).toHaveValue(survivor.task);
  await expect(survivorSheet.getByText("Subtask of")).toHaveCount(0);
  await expect(survivorSheet.getByRole("group", { name: "Subtasks" })).toBeVisible();
  await survivorSheet.getByRole("button", { name: "Close", exact: true }).click();
  await expect(rows).toHaveCount(3);
  await expect(rows.filter({ has: page.getByRole("link", { name: survivor.task, exact: true }) })).not.toHaveAttribute("data-sub");
  await expect(rows.filter({ has: page.getByRole("link", { name: parent.task, exact: true }) })).toHaveCount(0);
  expect((await find(edits, { query: survivor.task })).tasks[0].mainTask).toBeNull();
});
