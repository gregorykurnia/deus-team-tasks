import "server-only";
import { collection, getDocsFromServer } from "firebase/firestore";
import type { PipelineEntry } from "./clientTypes";
import { calendarWritesEnabled } from "./calendarSync";
import { db } from "./firebase";
import { clientsDb } from "./firebaseClients";
import { rolesIn } from "./flows";
import { wibToday } from "./followupServer";
import { isParked } from "./parking";
import { namesInUse } from "./people";
import { buildTaskChanges } from "./taskEdit";
import { taskStatus } from "./taskStatus";
import type { Flow, NewTask, Task } from "./types";

export interface FindTasksInput {
  query?: string;
  companyId?: number;
  parentId?: string;
  includeDone?: boolean;
}

async function readTasks(): Promise<Task[]> {
  const snapshot = await getDocsFromServer(collection(db, "tasks"));
  return snapshot.docs.map((entry) => ({ ...entry.data() as NewTask, id: entry.id }));
}

async function readCompanies(): Promise<PipelineEntry[]> {
  const snapshot = await getDocsFromServer(collection(clientsDb, "pipeline"));
  return snapshot.docs.map((entry) => {
    const data = entry.data() as PipelineEntry;
    return typeof data.id === "number" ? data : { ...data, id: Number(entry.id) };
  });
}

export async function findTasks(input: FindTasksInput) {
  const [tasks, companies] = await Promise.all([readTasks(), readCompanies()]);
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const byCompany = new Map(companies.map((company) => [company.id, company]));
  const today = wibToday();
  const query = input.query?.trim().toLowerCase();
  const visible = tasks.filter((task) => input.includeDone || !task.completed);
  const matches = visible.filter((task) =>
    (!query || `${task.task}\n${task.keyPoints}`.toLowerCase().includes(query))
    && (input.companyId === undefined || task.linkedClientId === input.companyId)
    && (input.parentId === undefined || task.parentId === input.parentId))
    .sort((a, b) => a.task.localeCompare(b.task) || a.id.localeCompare(b.id));
  const summary = (task: Task) => {
    const parent = task.parentId ? byId.get(task.parentId) : undefined;
    const company = task.linkedClientId === undefined ? undefined : byCompany.get(task.linkedClientId);
    return {
      ...task,
      mainTask: parent ? { id: parent.id, task: parent.task } : null,
      company: company ? { id: company.id, name: company.company } : null,
      status: taskStatus(task), parked: isParked(task, today), calendar: task.calendar ?? null,
    };
  };
  return {
    tasks: matches.slice(0, 10).map((task) => ({
      ...summary(task), subtasks: visible.filter((child) => child.parentId === task.id)
        .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)).map(summary),
    })),
    hasMore: matches.length > 10,
  };
}

// Shared read context for previews; no browser listeners, cached reads or write helpers.
export async function readTaskEditData() {
  const [tasks, companies, snapshot] = await Promise.all([
    readTasks(), readCompanies(), getDocsFromServer(collection(db, "flows")),
  ]);
  const flows = snapshot.docs.map((entry) => ({ ...entry.data(), id: entry.id } as Flow));
  return { tasks, companies, names: namesInUse(tasks, [], rolesIn(flows)) };
}

export async function previewTaskChanges(changes: unknown) {
  const data = await readTaskEditData();
  const now = Date.now();
  return buildTaskChanges(changes, {
    ...data, now, today: wibToday(new Date(now)), calendarOn: calendarWritesEnabled(),
  });
}
