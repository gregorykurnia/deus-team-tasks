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

export async function stored(project: ProjectKey, collection: string) {
  return readAll(project, collection);
}

export async function storedById(project: ProjectKey, collection: string, id: string | number) {
  const docs = await readAll(project, collection);
  return docs.find((d) => d.id === String(id)) as StoredDoc | undefined;
}

// Once the browser is back online, Firestore restarts its streams, which can turn the app offline again for a moment
// right after "Back online". A test that presses Try again waits until the app has stayed live for a while, as a person
// glancing at the live status would.
export async function settledOnline(page: Page, forMs = 1500) {
  await page.evaluate(() => delete (window as { notLiveAt?: number }).notLiveAt);
  await page.waitForFunction(
    (ms) => {
      const w = window as { notLiveAt?: number };
      const now = performance.now();
      const live = [...document.querySelectorAll('[role="status"]')].some((el) => el.textContent?.includes("Live, everyone's up to date"));
      if (!live || w.notLiveAt === undefined) w.notLiveAt = now;
      return live && now - w.notLiveAt >= ms;
    },
    forMs,
    { polling: 100 }
  );
}
