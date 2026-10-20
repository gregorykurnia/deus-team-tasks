// Test data builders and helpers shared by the smoke specs.
import type { Page } from "@playwright/test";
import { readAll, seed, type ProjectKey, type StoredDoc } from "../support/emulator";

export function isoDay(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

let order = 1;

export function task(id: string, fields: Record<string, unknown> = {}) {
  return {
    id,
    task: `Task ${id}`,
    responsible: [],
    informed: [],
    keyPoints: "",
    startDate: "",
    endDate: "",
    order: order++,
    ...fields,
  };
}

export function company(id: number, fields: Record<string, unknown> = {}) {
  return { id, company: `Company ${id}`, status: "To Follow Up", ...fields };
}

export function flow(id: string, fields: Record<string, unknown> = {}) {
  return {
    id,
    name: `Flow ${id}`,
    description: "",
    order: order++,
    steps: [{ id: `${id}-s1`, title: "First step", description: "", roles: [] }],
    decision: null,
    ...fields,
  };
}

export const seedTasks = (docs: ReturnType<typeof task>[]) => seed("tasks", "tasks", docs);
export const seedGroups = (docs: { id: string; name: string; order: number; starred?: boolean }[]) =>
  seed("tasks", "taskGroups", docs);
export const seedFlows = (docs: ReturnType<typeof flow>[]) => seed("tasks", "flows", docs);
export const seedCompanies = (docs: ReturnType<typeof company>[]) =>
  seed("clients", "pipeline", docs, { keepIdField: true });

// One record in each of tasks, companies and flows, which some specs count on.
export async function seedBaseline() {
  await Promise.all([
    seedTasks([task("baseline", { task: "Baseline task" })]),
    seedCompanies([company(900, { company: "Baseline company" })]),
    seedFlows([flow("baseline", { name: "Baseline flow" })]),
  ]);
}

export async function stored(project: ProjectKey, collection: string) {
  return readAll(project, collection);
}

export async function storedById(project: ProjectKey, collection: string, id: string | number) {
  const docs = await readAll(project, collection);
  return docs.find((d) => d.id === String(id)) as StoredDoc | undefined;
}

// The old app asks with window.confirm; these tests always say yes.
export function acceptDialogs(page: Page) {
  page.on("dialog", (dialog) => void dialog.accept());
}
