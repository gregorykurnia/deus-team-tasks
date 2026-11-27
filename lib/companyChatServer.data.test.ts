import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FirebaseError } from "firebase/app";
import * as firestore from "firebase/firestore";
import { clearAll, EMULATOR_HOST, readAll, readFields, seed } from "../tests/support/emulator";
import type { PipelineEntry } from "./clientTypes";
import { companyGroup, DEAL_DONE_STATUS, filterCompanies, groupFlags, NO_VALUE, TEAM_PIC } from "./companies";
import { applyCompanyChanges, CompanyChangesError, previewCompanyChanges } from "./companyChatServer";
import { companyRef } from "./companyCreate";
import { addCompany } from "./companyWrites";
import { USE_EMULATOR } from "./emulator";
import { companiesCsv } from "./exports";
import { db } from "./firebase";
import { clientsDb } from "./firebaseClients";
import { companiesQuery, toCompany } from "./useClientPipeline";

vi.mock("firebase/firestore", async (original) => {
  const actual = await original<typeof import("firebase/firestore")>();
  return { ...actual, runTransaction: vi.fn(actual.runTransaction) };
});
const real = await vi.importActual<typeof firestore>("firebase/firestore");
const transactions = vi.mocked(firestore.runTransaction);

const prospect = { id: 1, company: "First prospect", ...groupFlags("toApproach"), pic: "Client contact", teamPic: " " };
const active = { id: 2, company: "Active prospect", ...groupFlags("active"), teamPic: "Maya Chen" };
const client = { id: 3, company: "Client company", ...groupFlags("dealDone"), status: DEAL_DONE_STATUS, teamPic: "Former teammate" };
const companies = [prospect, active, client];
const seedCompanies = (rows: PipelineEntry[]) => seed("clients", "pipeline", rows, { keepIdField: true });
const pipeline = () => readAll("clients", "pipeline");
const storedCompany = (id: number) => readFields("clients", `pipeline/${id}`);
const counter = () => readFields("tasks", "settings/companyIds");
const appCompanies = async () => (await firestore.getDocsFromServer(companiesQuery())).docs.map(toCompany);

beforeEach(async () => {
  if (!USE_EMULATOR || EMULATOR_HOST !== "127.0.0.1:8180") throw new Error("Local Firestore emulator required.");
  transactions.mockReset().mockImplementation(real.runTransaction);
  await clearAll();
  await seed("tasks", "tasks", [{ id: "task", task: "Existing task", responsible: ["Maya Chen"], informed: [], endDate: "2026-12-01" }]);
  await seed("tasks", "flows", [{ id: "flow", name: "Example flow", description: "", order: 1, steps: [
    { id: "step", title: "Review", description: "", roles: [{ label: "Responsible", names: ["William Tan"] }] },
  ] }]);
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
afterAll(async () => { await Promise.all([firestore.terminate(db), firestore.terminate(clientsDb)]); });

async function preview(input: unknown) {
  const result = await previewCompanyChanges(input);
  expect(result.errors).toEqual([]);
  if (!result.preview) throw new Error("Expected a company preview.");
  return result.preview;
}

describe("saving companies from chat", () => {
  it("stores the previewed docs above a legacy ID and advances the counter used by the app", async () => {
    await seed("clients", "pipeline", [{ id: 40, company: "Legacy company", _raw: true }]);
    await seed("tasks", "settings", [
      { id: "companyIds", next: 2, originalField: true },
      { id: "companies", options: { type: [{ name: "Distributor", colour: "blue" }] } },
    ]);
    const notes = "Long description. ".repeat(1000).trimEnd();
    const input = { add: [
      { company: "  Juniper Works  ", teamPic: "maya CHEN", type: "Distributor", product: "  ", notes },
      { company: "Cedar Supply", teamPic: " william tan " },
    ] };
    const { add } = await preview(input);
    expect(await counter()).toEqual({ next: 2, originalField: true });
    expect(await pipeline()).toHaveLength(1);
    const saved = await applyCompanyChanges(input);
    expect(saved).toEqual({
      added: [
        { id: 41, company: "Juniper Works", group: "To approach" },
        { id: 42, company: "Cedar Supply", group: "To approach" },
      ],
      alreadyExists: [], notAdded: [], pics: { status: "none" },
    });
    expect(await storedCompany(41)).toEqual({ ...add[0].data, id: 41 });
    expect(await storedCompany(42)).toEqual({ ...add[1].data, id: 42 });
    const rows = await appCompanies();
    expect(rows.find(({ id }) => id === 41)).toMatchObject({ teamPic: "Maya Chen", type: "Distributor", notes });
    expect(rows.find(({ id }) => id === 41)).not.toHaveProperty("product");
    expect(rows.find(({ id }) => id === 42)?.[TEAM_PIC]).toBe("William Tan");
    expect(rows.map(companyGroup)).toEqual(["toApproach", "toApproach", "toApproach"]);
    expect(await counter()).toEqual({ next: 43, originalField: true });
    expect(await addCompany({ company: "Added in the app", ...groupFlags("toApproach") }, 40)).toBe(43);
    expect(await counter()).toEqual({ next: 44, originalField: true });
  });

  it("uses the next Jakarta day for the default Active date at 18:00 UTC", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-26T18:00:00Z"));
    const input = { add: [{ company: "Night shift", group: "Active" }] };
    const { add } = await preview(input);
    expect(add[0].data).toMatchObject({ date: "2026-11-27", status: "Meeting Soon" });
    expect((await applyCompanyChanges(input)).added).toEqual([{ id: 1, company: "Night shift", group: "Active" }]);
    expect(await storedCompany(1)).toEqual({ ...add[0].data, id: 1 });
  });

  it("recognizes a repeated add and normalized spelling without reserving another ID", async () => {
    const input = { add: [{ company: "Lake View" }] };
    expect((await applyCompanyChanges(input)).added).toEqual([{ id: 1, company: "Lake View", group: "To approach" }]);
    transactions.mockClear();
    for (const company of ["Lake View", "P.T. LAKE-VIEW Tbk."]) {
      expect(await applyCompanyChanges({ add: [{ company }] })).toMatchObject({
        added: [], notAdded: [], alreadyExists: [{ id: 1, company: "Lake View", group: "To approach", requestedCompany: company }],
      });
    }
    expect(transactions).not.toHaveBeenCalled();
    expect(await pipeline()).toHaveLength(1);
    expect(await counter()).toEqual({ next: 2 });
  });

  it("honors an explicitly allowed duplicate of a company in another group", async () => {
    await seedCompanies([client]);
    const input = { add: [{ company: client.company, allowDuplicate: true }] };
    expect((await preview(input)).add).toHaveLength(1);
    expect((await applyCompanyChanges(input)).added).toEqual([{ id: 4, company: client.company, group: "To approach" }]);
    expect(await storedCompany(client.id)).toEqual(client);
  });

  it("skips an occupied ID and shares reservations when the app adds another company at the same time", async () => {
    const occupied = { id: 1, company: "An older client used this ID" };
    transactions.mockImplementationOnce(async (database, work, options) => {
      const reserved = await real.runTransaction(database, work, options);
      await seedCompanies([occupied]);
      return reserved;
    });
    const [saved, appId] = await Promise.all([
      applyCompanyChanges({ add: [{ company: "From chat" }] }),
      addCompany({ company: "From the app" }, 0),
    ]);
    expect(await storedCompany(1)).toEqual(occupied);
    expect(saved.added).toHaveLength(1);
    const chatId = saved.added[0].id;
    expect([appId, chatId].sort()).toEqual([2, 3]);
    expect(await storedCompany(chatId)).toMatchObject({ id: chatId, company: "From chat" });
    expect(await storedCompany(appId)).toMatchObject({ id: appId, company: "From the app" });
    expect(await counter()).toEqual({ next: 4 });
  });

  it("recovers the same ID when a create commits and its reply is lost", async () => {
    const input = { add: [{ company: "Just once" }] };
    transactions.mockImplementationOnce(real.runTransaction).mockImplementationOnce(async (database, work, options) => {
      await real.runTransaction(database, work, options);
      return real.runTransaction(database, work, options);
    });
    expect(await applyCompanyChanges(input)).toMatchObject({ added: [{ id: 1, company: "Just once" }], notAdded: [] });
    expect(await applyCompanyChanges(input)).toMatchObject({ added: [], notAdded: [], alreadyExists: [{ id: 1, company: "Just once" }] });
    expect(await pipeline()).toHaveLength(1);
    expect(await counter()).toEqual({ next: 2 });
  });

  it("reports a failed middle add, then retries only that company", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const input = { add: [{ company: "Cedar" }, { company: "Iris" }, { company: "Maple" }] };
    let writes = 0;
    transactions.mockImplementation((database, work, options) => real.runTransaction(database, async (tx) => {
      const result = await work(tx);
      if (database === clientsDb && ++writes === 2) throw new Error("Simulated refusal before commit");
      return result;
    }, options));
    expect(await applyCompanyChanges(input)).toMatchObject({
      added: [{ id: 1, company: "Cedar" }, { id: 3, company: "Maple" }], notAdded: [{ company: "Iris" }],
    });
    expect(await storedCompany(2)).toBeNull();
    transactions.mockImplementation(real.runTransaction);
    expect(await applyCompanyChanges(input)).toMatchObject({ added: [{ id: 4, company: "Iris" }], notAdded: [], alreadyExists: [{ id: 1 }, { id: 3 }] });
    expect(await pipeline()).toHaveLength(3);
  });
});

describe("saving PIC changes from chat", () => {
  it("sets and clears three groups in one transaction, including a client, and skips unchanged PICs", async () => {
    await seedCompanies(companies);
    const tasks = await readAll("tasks", "tasks");
    const flows = await readAll("tasks", "flows");
    const input = { setPic: [{ pic: " william tan ", companyIds: [1, 2] }, { pic: null, companyIds: [3] }] };
    const { seenPics, setPic } = await preview(input);
    expect(seenPics).toEqual({ 1: null, 2: "Maya Chen", 3: "Former teammate" });
    expect((await applyCompanyChanges({ ...input, seenPics })).pics).toEqual({ status: "saved", changes: setPic });
    expect(transactions).toHaveBeenCalledTimes(1);
    expect(transactions.mock.calls[0][0]).toBe(clientsDb);
    expect(await storedCompany(1)).toEqual({ ...prospect, teamPic: "William Tan" });
    expect(await storedCompany(2)).toEqual({ ...active, teamPic: "William Tan" });
    const clientFields = await storedCompany(3);
    expect(clientFields).not.toHaveProperty(TEAM_PIC);
    expect(clientFields).toMatchObject({ company: client.company, status: DEAL_DONE_STATUS });
    expect(await readAll("tasks", "tasks")).toEqual(tasks);
    expect(await readAll("tasks", "flows")).toEqual(flows);
    expect(await counter()).toBeNull();
    const rows = await appCompanies();
    expect(filterCompanies(rows, { pic: "William Tan" }).map(({ id }) => id)).toEqual([1, 2]);
    expect(filterCompanies(rows, { pic: NO_VALUE }).map(({ id }) => id)).toEqual([3]);
    expect(companiesCsv(rows, [{ key: TEAM_PIC, label: "PIC" }], "All").rows).toEqual([["William Tan"], ["William Tan"], [""]]);

    const now = await preview(input);
    transactions.mockImplementationOnce((database, work, options) => real.runTransaction(database, async (tx) => {
      const updates = vi.spyOn(tx, "update");
      const result = await work(tx);
      expect(updates).not.toHaveBeenCalled();
      return result;
    }, options));
    expect(now.setPic.every(({ unchanged }) => unchanged)).toBe(true);
    expect((await applyCompanyChanges({ ...input, seenPics: now.seenPics })).pics).toEqual({ status: "saved", changes: now.setPic });
  });

  it("refuses a whole mixed save if a seen PIC is missing or stale before any writes", async () => {
    await seedCompanies(companies);
    const input = { add: [{ company: "Would be new" }], setPic: [{ pic: "William Tan", companyIds: [1, 2, 3] }] };
    const { seenPics } = await preview(input);
    await expect(applyCompanyChanges(input)).rejects.toThrow(CompanyChangesError);
    await firestore.updateDoc(companyRef(2), { [TEAM_PIC]: "William Tan" });
    await expect(applyCompanyChanges({ ...input, seenPics })).rejects.toThrow("PIC changed since the preview for Active prospect");
    expect(transactions).not.toHaveBeenCalled();
    expect(await pipeline()).toHaveLength(3);
    expect(await storedCompany(1)).toEqual(prospect);
    expect(await storedCompany(3)).toEqual(client);
    expect(await counter()).toBeNull();
  });

  it("rechecks even an unchanged PIC on a real transaction retry after a concurrent edit", async () => {
    await seedCompanies(companies);
    const input = { setPic: [{ pic: "Maya Chen", companyIds: [1, 2, 3] }] };
    const { seenPics } = await preview(input);
    let attempts = 0;
    transactions.mockImplementationOnce((database, work, options) => real.runTransaction(database, async (tx) => {
      const result = await work(tx);
      if (++attempts === 1) await firestore.updateDoc(companyRef(2), { [TEAM_PIC]: "William Tan" });
      return result;
    }, options));
    expect((await applyCompanyChanges({ ...input, seenPics })).pics).toEqual({
      status: "notSaved", errors: ["PIC changed since the preview for Active prospect (company 2). Preview again."],
    });
    expect(attempts).toBeGreaterThan(1);
    expect(await storedCompany(2)).toEqual({ ...active, teamPic: "William Tan" });
    expect(await storedCompany(1)).toEqual(prospect);
    expect(await storedCompany(3)).toEqual(client);
  });

  it("leaves the other PICs alone if a company disappears after validation", async () => {
    await seedCompanies(companies);
    const input = { setPic: [{ pic: "William Tan", companyIds: [1, 2, 3] }] };
    const { seenPics } = await preview(input);
    transactions.mockImplementationOnce(async (database, work, options) => {
      await firestore.deleteDoc(companyRef(3));
      return real.runTransaction(database, work, options);
    });
    expect((await applyCompanyChanges({ ...input, seenPics })).pics).toEqual({
      status: "notSaved", errors: ["Company 3 (Client company) could not be found. Preview again."],
    });
    expect(await storedCompany(1)).toEqual(prospect);
    expect(await storedCompany(2)).toEqual(active);
    expect(await storedCompany(3)).toBeNull();
  });

  it("reports a lost PIC reply as unconfirmed and protects a newer PIC on replay", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await seedCompanies(companies);
    const input = { setPic: [{ pic: "William Tan", companyIds: [1, 2, 3] }] };
    const { seenPics } = await preview(input);
    transactions.mockImplementationOnce(async (database, work, options) => {
      await real.runTransaction(database, work, options);
      throw new FirebaseError("unavailable", "Simulated lost commit reply");
    });
    expect((await applyCompanyChanges({ ...input, seenPics })).pics.status).toBe("unconfirmed");
    for (const company of companies) expect(await storedCompany(company.id)).toEqual({ ...company, teamPic: "William Tan" });
    await firestore.updateDoc(companyRef(2), { [TEAM_PIC]: "Maya Chen" });
    await expect(applyCompanyChanges({ ...input, seenPics })).rejects.toThrow("PIC changed since the preview");
    expect(await storedCompany(2)).toEqual(active);
  });

  it("keeps the two committed adds when the PIC transaction fails and completes the PICs on retry", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await seedCompanies(companies);
    const input = {
      add: [{ company: "Cedar" }, { company: "Maple" }],
      setPic: [{ pic: "William Tan", companyIds: [1, 2, 3] }],
    };
    const { seenPics } = await preview(input);
    let clientWrites = 0;
    transactions.mockImplementation((database, work, options) => real.runTransaction(database, async (tx) => {
      const result = await work(tx);
      if (database === clientsDb && ++clientWrites === 3) throw new Error("Simulated PIC refusal before commit");
      return result;
    }, options));
    expect(await applyCompanyChanges({ ...input, seenPics })).toMatchObject({
      added: [{ id: 4, company: "Cedar" }, { id: 5, company: "Maple" }], notAdded: [], pics: { status: "notSaved" },
    });
    expect(await pipeline()).toHaveLength(5);
    for (const company of companies) expect(await storedCompany(company.id)).toEqual(company);
    transactions.mockImplementation(real.runTransaction);
    expect(await applyCompanyChanges({ ...input, seenPics })).toMatchObject({
      added: [], alreadyExists: [{ id: 4 }, { id: 5 }], notAdded: [], pics: { status: "saved" },
    });
    expect(await pipeline()).toHaveLength(5);
    expect(await counter()).toEqual({ next: 6 });
    for (const company of companies) expect(await storedCompany(company.id)).toEqual({ ...company, teamPic: "William Tan" });
    await expect(applyCompanyChanges({ ...input, seenPics })).rejects.toThrow("PIC changed since the preview");
  });
});
