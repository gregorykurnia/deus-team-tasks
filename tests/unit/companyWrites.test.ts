// Company, notes and past client writes, against the Firestore emulator.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { terminate } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { clientsDb } from "@/lib/firebaseClients";
import { companiesById } from "@/lib/kinds";
import { DEAL_DONE_STATUS } from "@/lib/companies";
import {
  addCompany,
  allocateCompanyId,
  deleteCompany,
  moveCompany,
  replaceFieldValue,
  saveTaskKeptInStep,
  updateCompany,
  updateCompanyKeptInStep,
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

  it("brings its open tasks in step with its dates; finished tasks keep theirs", async () => {
    const c = co(1, { date: "2026-10-01", target: "2026-10-30" });
    const tasks = [
      task("open", { linkedClientId: 1, lastActionDate: "2026-10-01", endDate: "2026-10-30" }),
      task("done", { linkedClientId: 1, lastActionDate: "2026-10-01", endDate: "2026-10-30", completed: true }),
      task("other", { linkedClientId: 2, lastActionDate: "2026-09-01" }),
    ];
    await seedCompanies([c]);
    await seedTasks(tasks);
    const { tasksChanged, undo } = await updateCompanyKeptInStep(c, { date: "2026-10-19", target: "2026-10-25" }, tasks);
    expect(tasksChanged).toBe(1);
    expect(await readFields("tasks", "tasks/open")).toMatchObject({ lastActionDate: "2026-10-19", endDate: "2026-10-25" });
    expect(await readFields("tasks", "tasks/done")).toMatchObject({ lastActionDate: "2026-10-01", endDate: "2026-10-30" });
    await undo();
    expect(await readFields("tasks", "tasks/open")).toMatchObject({ lastActionDate: "2026-10-01", endDate: "2026-10-30" });
    expect(await readFields("clients", "pipeline/1")).toMatchObject({ date: "2026-10-01", target: "2026-10-30" });
  });

  it("brings the company and its other open tasks in step when a task's dates change", async () => {
    const c = co(1, { date: "2026-10-01", target: "2026-10-30" });
    const tasks = [
      task("mine", { linkedClientId: 1, lastActionDate: "2026-10-01", endDate: "2026-10-30" }),
      task("sibling", { linkedClientId: 1, lastActionDate: "2026-10-01", endDate: "2026-10-30" }),
    ];
    await seedCompanies([c]);
    await seedTasks(tasks);
    const result = await saveTaskKeptInStep(tasks[0], { lastActionDate: "2026-10-18", endDate: "2026-10-24" }, companiesById([c]), tasks);
    expect(result).toEqual({ companyChanged: true, tasksChanged: 1 });
    expect(await readFields("clients", "pipeline/1")).toMatchObject({ date: "2026-10-18", target: "2026-10-24" });
    expect(await readFields("tasks", "tasks/sibling")).toMatchObject({ lastActionDate: "2026-10-18", endDate: "2026-10-24" });
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
});
