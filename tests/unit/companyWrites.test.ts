// Company, notes and past client writes, against the Firestore emulator.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { terminate } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { clientsDb } from "@/lib/firebaseClients";
import { companiesById } from "@/lib/kinds";
import { DEAL_DONE_STATUS } from "@/lib/companies";
import {
  addCompany,
  addTaskKeptInStep,
  allocateCompanyId,
  bringBackCompanies,
  bringBackCompany,
  deleteCompany,
  moveCompany,
  parkCompanies,
  parkCompany,
  replaceFieldValue,
  saveTaskKeptInStep,
  saveTaskWithUndo,
  updateCompany,
} from "@/lib/companyWrites";
import { saveNotes, startNotesForCompany } from "@/lib/noteWrites";
import { deletePastClient, HasSubsidiariesError, setCounted, setPastClientSector } from "@/lib/pastClientWrites";
import { createEmptyProspectJournalEntry, type ProspectJournalEntry } from "@/lib/prospectJournalTypes";
import type { PipelineEntry } from "@/lib/clientTypes";
import type { HistoricalClient } from "@/lib/historicalClientTypes";
import type { NewTask, Task } from "@/lib/types";
import { clearAll, readAll, readFields, seed } from "../support/emulator";

const co = (id: number, fields: Partial<PipelineEntry> = {}): PipelineEntry => ({ id, company: `Company ${id}`, ...fields });
const task = (id: string, fields: Partial<NewTask> = {}): Task => ({
  id,
  task: id,
  responsible: [],
  informed: [],
  keyPoints: "",
  startDate: "",
  endDate: "",
  order: 1,
  ...fields,
});
const seedCompanies = (rows: PipelineEntry[]) => seed("clients", "pipeline", rows, { keepIdField: true });
const seedTasks = (rows: Task[]) => seed("tasks", "tasks", rows);

beforeEach(async () => {
  await clearAll();
});

afterAll(async () => {
  await Promise.all([terminate(db), terminate(clientsDb)]);
});

describe("changing a company", () => {
  it("changes only the fields given, so own fields are kept, and undoes it", async () => {
    const c = co(1, { pic: "Dewi", cx_region: "North" });
    await seedCompanies([c]);
    const undo = await updateCompany(c, { pic: "Dewi Lestari", notes: undefined });
    expect(await readFields("clients", "pipeline/1")).toMatchObject({ pic: "Dewi Lestari", cx_region: "North", id: 1 });
    await undo();
    expect(await readFields("clients", "pipeline/1")).toMatchObject({ pic: "Dewi", cx_region: "North" });
  });

  it("changes its dates without touching its tasks, which keep their own (B12)", async () => {
    const c = co(1, { date: "2026-10-01", target: "2026-10-30" });
    const tasks = [
      task("open", { linkedClientId: 1, lastActionDate: "2026-10-01", endDate: "2026-10-30" }),
      task("done", { linkedClientId: 1, lastActionDate: "2026-10-01", endDate: "2026-10-30", completed: true }),
      task("other", { linkedClientId: 2, lastActionDate: "2026-09-01" }),
    ];
    await seedCompanies([c]);
    await seedTasks(tasks);
    const undo = await updateCompany(c, { date: "2026-10-19", target: "2026-10-25" });
    expect(await readFields("clients", "pipeline/1")).toMatchObject({ date: "2026-10-19", target: "2026-10-25" });
    expect(await readFields("tasks", "tasks/open")).toMatchObject({ lastActionDate: "2026-10-01", endDate: "2026-10-30" });
    expect(await readFields("tasks", "tasks/done")).toMatchObject({ lastActionDate: "2026-10-01", endDate: "2026-10-30" });
    await undo();
    expect(await readFields("clients", "pipeline/1")).toMatchObject({ date: "2026-10-01", target: "2026-10-30" });
  });

  it("brings the company in step when a task's dates change, and leaves its other tasks' dates alone", async () => {
    const c = co(1, { date: "2026-10-01", target: "2026-10-30" });
    const tasks = [
      task("mine", { linkedClientId: 1, lastActionDate: "2026-10-01", endDate: "2026-10-30" }),
      task("sibling", { linkedClientId: 1, lastActionDate: "2026-10-01", endDate: "2026-10-30" }),
    ];
    await seedCompanies([c]);
    await seedTasks(tasks);
    const result = await saveTaskKeptInStep(tasks[0], { lastActionDate: "2026-10-18", endDate: "2026-10-24" }, companiesById([c]));
    expect(result).toEqual({ companyChanged: true });
    expect(await readFields("clients", "pipeline/1")).toMatchObject({ date: "2026-10-18", target: "2026-10-24" });
    expect(await readFields("tasks", "tasks/mine")).toMatchObject({ lastActionDate: "2026-10-18", endDate: "2026-10-24" });
    expect(await readFields("tasks", "tasks/sibling")).toMatchObject({ lastActionDate: "2026-10-01", endDate: "2026-10-30" });
  });

  it("leaves the company alone when a company task is saved without changing its dates", async () => {
    const c = co(1, { date: "2026-10-05", target: "2026-10-30" });
    const tasks = [task("mine", { linkedClientId: 1, lastActionDate: "2026-10-01", endDate: "2026-10-20" })];
    await seedCompanies([c]);
    await seedTasks(tasks);
    const result = await saveTaskKeptInStep(tasks[0], { keyPoints: "Bring the pricing sheet" }, companiesById([c]));
    expect(result).toEqual({ companyChanged: false });
    expect(await readFields("clients", "pipeline/1")).toMatchObject({ date: "2026-10-05", target: "2026-10-30" });
    expect(await readFields("tasks", "tasks/mine")).toMatchObject({ keyPoints: "Bring the pricing sheet", endDate: "2026-10-20" });
  });

  it("changes a company task from its cell, and Undo puts back the task and the company it brought in step", async () => {
    const c = co(1, { date: "2026-10-05", target: "2026-10-30" });
    const tasks = [task("mine", { linkedClientId: 1, lastActionDate: "2026-10-01", endDate: "2026-10-20" })];
    await seedCompanies([c]);
    await seedTasks(tasks);
    const { companyChanged, undo } = await saveTaskWithUndo(tasks[0], { endDate: "2026-10-24" }, companiesById([c]));
    expect(companyChanged).toBe(true);
    expect(await readFields("clients", "pipeline/1")).toMatchObject({ date: "2026-10-01", target: "2026-10-24" });
    await undo();
    expect(await readFields("tasks", "tasks/mine")).toMatchObject({ endDate: "2026-10-20", lastActionDate: "2026-10-01" });
    expect(await readFields("clients", "pipeline/1")).toMatchObject({ date: "2026-10-05", target: "2026-10-30" });
  });

  it("clears a field from its cell, and Undo writes it back", async () => {
    const tasks = [task("mine", { priority: "High" })];
    await seedTasks(tasks);
    const { companyChanged, undo } = await saveTaskWithUndo(tasks[0], { priority: undefined }, companiesById([]));
    expect(companyChanged).toBe(false);
    expect(await readFields("tasks", "tasks/mine")).not.toHaveProperty("priority");
    await undo();
    expect(await readFields("tasks", "tasks/mine")).toMatchObject({ priority: "High" });
  });

  it("adds a dated company task and brings the company in step, and leaves its other tasks' dates alone", async () => {
    const c = co(1, { date: "2026-10-01", target: "2026-10-30" });
    const tasks = [task("sibling", { linkedClientId: 1, lastActionDate: "2026-10-01", endDate: "2026-10-30" })];
    await seedCompanies([c]);
    await seedTasks(tasks);
    const { id: _id, ...fresh } = task("new", { linkedClientId: 1, lastActionDate: "2026-10-18", endDate: "2026-10-24" });
    void _id;
    const result = await addTaskKeptInStep(fresh, companiesById([c]));
    expect(result).toMatchObject({ companyChanged: true });
    expect(await readFields("tasks", `tasks/${result.id}`)).toMatchObject({ task: "new", linkedClientId: 1 });
    expect(await readFields("clients", "pipeline/1")).toMatchObject({ date: "2026-10-18", target: "2026-10-24" });
    expect(await readFields("tasks", "tasks/sibling")).toMatchObject({ lastActionDate: "2026-10-01", endDate: "2026-10-30" });
  });

  it("adds an undated company task without touching the company", async () => {
    const c = co(1, { date: "2026-10-01", target: "2026-10-30" });
    await seedCompanies([c]);
    const { id: _id, ...fresh } = task("new", { linkedClientId: 1 });
    void _id;
    const result = await addTaskKeptInStep(fresh, companiesById([c]));
    expect(result).toMatchObject({ companyChanged: false });
    expect(await readFields("clients", "pipeline/1")).toMatchObject({ date: "2026-10-01", target: "2026-10-30" });
  });

  it("moves a company to another group keeping everything known, and says when tasks switch kind", async () => {
    const c = co(1, { status: "To Follow Up", pic: "Dewi", product: "Fleet tracking" });
    const tasks = [task("open", { linkedClientId: 1 })];
    await seedCompanies([c]);
    await seedTasks(tasks);
    const toHold = await moveCompany(c, "noOrNotNow", { reason: "Chose another vendor", answer: "No" }, tasks);
    expect(toHold.tasksSwitchKind).toBe(0);
    expect(await readFields("clients", "pipeline/1")).toMatchObject({
      pic: "Dewi",
      product: "Fleet tracking",
      reason: "Chose another vendor",
      answer: "No",
      _hold: true,
      _raw: false,
    });
    const toDone = await moveCompany({ ...c, _hold: true }, "dealDone", {}, tasks);
    expect(toDone.tasksSwitchKind).toBe(1);
    expect(await readFields("clients", "pipeline/1")).toMatchObject({ status: DEAL_DONE_STATUS, _hold: false });
    // Leaving Deal done for any group lets go of its status.
    await moveCompany({ ...c, status: DEAL_DONE_STATUS }, "noOrNotNow", {}, tasks);
    expect(await readFields("clients", "pipeline/1")).not.toHaveProperty("status");
  });

  it("N20: parks a company with its open tasks, brings back only those, and leaving Active ends parking", async () => {
    const c = co(1, { status: "To Follow Up" });
    const tasks = [
      task("open", { linkedClientId: 1 }),
      task("own", { linkedClientId: 1, parkedAt: 5, parkedUntil: "2026-12-01" }), // parked on its own already
      task("done", { linkedClientId: 1, completed: true }),
      task("other", { linkedClientId: 2 }),
    ];
    await seedCompanies([c]);
    await seedTasks(tasks);
    const parked = await parkCompany(c, "2026-11-03", tasks, 1000);
    expect(parked.tasksChanged).toBe(1);
    expect(await readFields("clients", "pipeline/1")).toMatchObject({ parkedAt: 1000, parkedUntil: "2026-11-03" });
    expect(await readFields("tasks", "tasks/open")).toMatchObject({ parkedAt: 1000, parkedUntil: "2026-11-03" });
    expect(await readFields("tasks", "tasks/own")).toMatchObject({ parkedAt: 5, parkedUntil: "2026-12-01" });
    expect(await readFields("tasks", "tasks/done")).not.toHaveProperty("parkedAt");

    await parked.undo();
    expect(await readFields("clients", "pipeline/1")).not.toHaveProperty("parkedAt");
    expect(await readFields("tasks", "tasks/open")).not.toHaveProperty("parkedAt");

    await parkCompany(c, null, tasks, 1000);
    const now = { ...c, parkedAt: 1000 };
    const withParked = tasks.map((t) => (t.id === "open" ? { ...t, parkedAt: 1000 } : t));
    const back = await bringBackCompany(now, withParked);
    expect(back.tasksChanged).toBe(1);
    expect(await readFields("clients", "pipeline/1")).not.toHaveProperty("parkedAt");
    expect(await readFields("tasks", "tasks/open")).not.toHaveProperty("parkedAt");
    expect(await readFields("tasks", "tasks/own")).toMatchObject({ parkedAt: 5 });

    await parkCompany(c, null, tasks, 2000);
    await moveCompany({ ...c, parkedAt: 2000 }, "noOrNotNow", { answer: "Not now" }, tasks);
    expect(await readFields("clients", "pipeline/1")).not.toHaveProperty("parkedAt");
  });

  it("N20: parks several companies at once with their open tasks, and Undo or Bring back puts each as it was", async () => {
    const rows = [co(1), co(2, { parkedAt: 7, parkedUntil: "2026-12-01" }), co(3)];
    const tasks = [task("a", { linkedClientId: 1 }), task("b", { linkedClientId: 3 }), task("c", { linkedClientId: 4 })];
    await seedCompanies(rows);
    await seedTasks(tasks);
    const parked = await parkCompanies(rows, "2026-11-03", tasks, 1000);
    expect(parked.tasksChanged).toBe(2);
    expect((await readAll("clients", "pipeline")).map((r) => r.parkedUntil)).toEqual(["2026-11-03", "2026-11-03", "2026-11-03"]);
    expect(await readFields("tasks", "tasks/c")).not.toHaveProperty("parkedAt");
    await parked.undo();
    expect((await readAll("clients", "pipeline")).map((r) => r.parkedUntil)).toEqual([undefined, "2026-12-01", undefined]);

    await parkCompanies(rows, null, tasks, 1000);
    const now = rows.map((c) => ({ ...c, parkedAt: 1000 }));
    const back = await bringBackCompanies(now, tasks.map((t) => ({ ...t, parkedAt: 1000 })));
    expect(back.tasksChanged).toBe(2);
    expect((await readAll("clients", "pipeline")).every((r) => r.parkedAt === undefined)).toBe(true);
    expect(await readFields("tasks", "tasks/a")).not.toHaveProperty("parkedAt");
  });

  it("renames or clears an option's value on every company using it", async () => {
    const rows = [co(1, { status: "Meeting Soon" }), co(2, { status: "Meeting Soon" }), co(3, { status: "Drop" })];
    await seedCompanies(rows);
    expect(await replaceFieldValue(rows, "status", "Meeting Soon", "Meeting booked")).toBe(2);
    expect((await readAll("clients", "pipeline")).map((r) => r.status)).toEqual(["Meeting booked", "Meeting booked", "Drop"]);
    expect(await replaceFieldValue(rows.slice(2), "status", "Drop", undefined)).toBe(1);
    expect(await readFields("clients", "pipeline/3")).not.toHaveProperty("status");
  });
});

describe("new companies", () => {
  it("never hands out the same id twice, even after the highest is deleted", async () => {
    const a = await allocateCompanyId(9);
    const b = await allocateCompanyId(9);
    expect([a, b]).toEqual([10, 11]);
    // Company 11 is deleted: the next is still 12, and never below the known highest.
    expect(await allocateCompanyId(10)).toBe(12);
    expect(await allocateCompanyId(40)).toBe(41);
  });

  it("skips an id the old app took meanwhile", async () => {
    await seedCompanies([co(5)]);
    await allocateCompanyId(3); // the counter says 4 next
    await seedCompanies([co(4, { company: "Made on the old app" })]);
    const id = await addCompany({ company: "Fresh Start", _raw: false, _hold: false }, 3);
    expect(id).toBe(6);
    expect(await readFields("clients", "pipeline/4")).toMatchObject({ company: "Made on the old app" });
    expect(await readFields("clients", "pipeline/6")).toMatchObject({ company: "Fresh Start", id: 6 });
  });
});

describe("deleting a company (B14, D-012)", () => {
  it("keeps its tasks as internal work and its notes as not tracked yet", async () => {
    const c = co(1, { company: "Pelita Foods" });
    const tasks = [task("t", { linkedClientId: 1 })];
    const notes: ProspectJournalEntry[] = [{ ...createEmptyProspectJournalEntry("pipeline-1"), pipelineEntryId: 1, prospectName: "Pelita" }];
    await seedCompanies([c]);
    await seedTasks(tasks);
    await seed("clients", "prospectJournal", notes, { keepIdField: true });
    expect(await deleteCompany(c, tasks, notes)).toEqual({ tasks: 1, notes: 1 });
    // Its id is retired: the next company doesn't get it, though the counter never handed it out.
    expect(await allocateCompanyId(0)).toBe(2);
    expect(await readFields("clients", "pipeline/1")).toBeNull();
    expect(await readFields("tasks", "tasks/t")).not.toHaveProperty("linkedClientId");
    const n = await readFields("clients", "prospectJournal/pipeline-1");
    expect(n).not.toHaveProperty("pipelineEntryId");
    expect(n).toMatchObject({ prospectName: "Pelita Foods" });
  });
});

describe("qualification notes", () => {
  it("never writes over notes already stored under a company's usual id", async () => {
    // Kept from a deleted company with the same id, and not on this screen.
    const kept = { ...createEmptyProspectJournalEntry("pipeline-1"), prospectName: "Old Pelita", clientNeed: "Keep me" };
    await seed("clients", "prospectJournal", [kept], { keepIdField: true });
    const id = await startNotesForCompany(co(1, { company: "Pelita Foods" }), []);
    expect(id).not.toBe("pipeline-1");
    expect(await readFields("clients", "prospectJournal/pipeline-1")).toMatchObject({ clientNeed: "Keep me" });
    expect(await readFields("clients", `prospectJournal/${id}`)).toMatchObject({ pipelineEntryId: 1, prospectName: "Pelita Foods" });
  });

  it("opens a company's notes that this screen hasn't loaded yet, instead of starting new ones", async () => {
    const own = { ...createEmptyProspectJournalEntry("pipeline-1"), pipelineEntryId: 1, prospectName: "Pelita", clientNeed: "Keep me" };
    await seed("clients", "prospectJournal", [own], { keepIdField: true });
    expect(await startNotesForCompany(co(1), [])).toBe("pipeline-1");
    expect(await readFields("clients", "prospectJournal/pipeline-1")).toMatchObject({ clientNeed: "Keep me" });
  });

  it("starts a company's notes once, and saves only what changed", async () => {
    const c = co(1, { company: "Pelita Foods" });
    const id = await startNotesForCompany(c, []);
    expect(id).toBe("pipeline-1");
    const stored = (await readAll("clients", "prospectJournal")) as unknown as ProspectJournalEntry[];
    expect(await startNotesForCompany(c, stored)).toBe("pipeline-1");
    await saveNotes(id, { clientNeed: "Visibility" });
    await saveNotes(id, { solutionFit: "Strong" });
    expect(await readFields("clients", "prospectJournal/pipeline-1")).toMatchObject({
      clientNeed: "Visibility",
      solutionFit: "Strong",
      prospectName: "Pelita Foods",
      pipelineEntryId: 1,
    });
  });
});

describe("past clients", () => {
  const pc = (id: string, fields: Partial<HistoricalClient> = {}): HistoricalClient => ({
    id,
    name: id,
    parentId: null,
    sector: null,
    countHead: true,
    createdAt: 1,
    ...fields,
  });

  it("won't delete a parent that still has subsidiaries", async () => {
    const clients = [pc("p"), pc("s", { parentId: "p" })];
    await seed("clients", "historicalClients", clients, { keepIdField: true });
    await expect(deletePastClient(clients[0], clients)).rejects.toBeInstanceOf(HasSubsidiariesError);
    expect(await readAll("clients", "historicalClients")).toHaveLength(2);
  });

  it("deletes a subsidiary, and Undo brings it back as it was", async () => {
    const clients = [pc("p"), pc("s", { parentId: "p", sector: "Retail", name: "Nusa Outlet" })];
    await seed("clients", "historicalClients", clients, { keepIdField: true });
    const undo = await deletePastClient(clients[1], clients);
    expect(await readAll("clients", "historicalClients")).toHaveLength(1);
    await undo();
    expect(await readFields("clients", "historicalClients/s")).toMatchObject({ name: "Nusa Outlet", parentId: "p", sector: "Retail", countHead: true });
  });

  it("saves a sector in the spelling in use, and undoes not counted", async () => {
    const c = pc("p");
    await seed("clients", "historicalClients", [c], { keepIdField: true });
    await setPastClientSector(c, "  retail ", new Map([["retail", "Retail"]]));
    expect(await readFields("clients", "historicalClients/p")).toMatchObject({ sector: "Retail" });
    const undo = await setCounted(c, false);
    expect(await readFields("clients", "historicalClients/p")).toMatchObject({ countHead: false });
    await undo();
    expect(await readFields("clients", "historicalClients/p")).toMatchObject({ countHead: true });
  });

  it("undoes a sector on an older client that had none stored", async () => {
    const { sector: _sector, ...older } = pc("p");
    void _sector;
    await seed("clients", "historicalClients", [older], { keepIdField: true });
    const undo = await setPastClientSector(older as HistoricalClient, "Retail", new Map());
    await undo();
    expect(await readFields("clients", "historicalClients/p")).not.toHaveProperty("sector");
  });
});
