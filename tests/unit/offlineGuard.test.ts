// Every write outside qualification notes is refused with no connection (A3),
// before anything reaches Firestore.
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { terminate } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { clientsDb } from "@/lib/firebaseClients";
import { OfflineError, resetConnection } from "@/lib/connection";
import { addCompany, deleteCompany, updateCompany } from "@/lib/companyWrites";
import { addOption } from "@/lib/companySettings";
import { addPastClient } from "@/lib/pastClientWrites";
import { setGroupStarred } from "@/lib/taskGroups";
import { addTask } from "@/lib/taskWrites";
import { addFlow } from "@/lib/flowWrites";

afterEach(() => {
  vi.unstubAllGlobals();
  resetConnection();
});

afterAll(async () => {
  await Promise.all([terminate(db), terminate(clientsDb)]);
});

const company = { id: 1, company: "Pelita Foods" };

describe("writes with no connection", () => {
  it.each([
    ["a task", () => addTask({ task: "x", responsible: [], informed: [], keyPoints: "", startDate: "", endDate: "", order: 1 })],
    ["a task group", () => setGroupStarred("g", true)],
    ["a flow", () => addFlow({ name: "x", description: "", order: 1, steps: [] })],
    ["a new company", () => addCompany({ company: "x" }, 0)],
    ["a company change", () => updateCompany(company, { notes: "x" })],
    ["a company delete", () => deleteCompany(company, [], [])],
    ["a company option", () => addOption("priority", "Urgent", "red")],
    ["a past client", () => addPastClient({ name: "x", parentId: null, sector: null, countHead: true })],
  ])("refuses %s", async (_what, write) => {
    vi.stubGlobal("navigator", { onLine: false });
    await expect(write()).rejects.toBeInstanceOf(OfflineError);
  });
});
