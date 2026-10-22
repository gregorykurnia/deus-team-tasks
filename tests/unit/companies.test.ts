import { describe, expect, it } from "vitest";
import type { PipelineEntry } from "@/lib/clientTypes";
import {
  choicesOf,
  companyGroup,
  DEAL_DONE_STATUS,
  defaultCompanySort,
  filterCompanies,
  followUpTaskFor,
  groupSizes,
  matchesCompanySearch,
  productOptions,
  productsOf,
  sortCompanies,
  toggleChoice,
  whereToActCounts,
} from "@/lib/companies";

const TODAY = "2026-10-20";
const co = (id: number, fields: Partial<PipelineEntry> = {}): PipelineEntry => ({ id, company: `Company ${id}`, ...fields });

describe("company groups (B2)", () => {
  it("puts each company in exactly one of four groups", () => {
    expect(companyGroup(co(1, { _raw: true }))).toBe("toApproach");
    expect(companyGroup(co(2, { _hold: true }))).toBe("noOrNotNow");
    expect(companyGroup(co(3, { status: DEAL_DONE_STATUS }))).toBe("dealDone");
    expect(companyGroup(co(4, { status: "To Follow Up" }))).toBe("active");
    expect(companyGroup(co(5))).toBe("active");
    // Moved to To approach with its old status still stored.
    expect(companyGroup(co(6, { _raw: true, status: DEAL_DONE_STATUS }))).toBe("toApproach");
  });
  it("counts each group", () => {
    expect(groupSizes([co(1, { _raw: true }), co(2), co(3)])).toEqual({ toApproach: 1, active: 2, dealDone: 0, noOrNotNow: 0 });
  });
});

describe("search and filters (B8, D-012)", () => {
  it("searches name, contact, source and products, plus industry and notes for leads, and the reason on hold", () => {
    expect(matchesCompanySearch(co(1, { pic: "Dewi Lestari" }), "dewi")).toBe(true);
    expect(matchesCompanySearch(co(1, { product: "Fleet tracking" }), "fleet")).toBe(true);
    expect(matchesCompanySearch(co(1, { industry: "Retail" }), "retail")).toBe(false);
    expect(matchesCompanySearch(co(1, { _raw: true, industry: "Retail" }), "retail")).toBe(true);
    expect(matchesCompanySearch(co(1, { _hold: true, reason: "Budget frozen" }), "budget")).toBe(true);
    // Fields aren't run together: "Company 1" + "Dewi" doesn't match "1Dewi".
    expect(matchesCompanySearch(co(1, { pic: "Dewi" }), "1dewi")).toBe(false);
  });
  it("splits products on commas and merges spellings, most used first", () => {
    expect(productsOf(co(1, { product: "Fleet tracking,  Analytics , " }))).toEqual(["Fleet tracking", "Analytics"]);
    const options = productOptions([
      co(1, { product: "Point of sale, Analytics" }),
      co(2, { product: "point of sale " }),
      co(3, { product: "Point of sale" }),
    ]);
    expect(options).toEqual([
      { key: "point of sale", label: "Point of sale", count: 3 },
      { key: "analytics", label: "Analytics", count: 1 },
    ]);
    const rows = [co(1, { product: "Point of sale, Analytics" }), co(2, { product: "Analytics" })];
    expect(filterCompanies(rows, { productKey: "point of sale" }, TODAY).map((c) => c.id)).toEqual([1]);
  });
  it("narrows by status, priority and where to act", () => {
    const rows = [co(1, { status: "To Follow Up", priority: "High" }), co(2, { date: "2026-10-01" })];
    expect(filterCompanies(rows, { status: "To Follow Up" }, TODAY).map((c) => c.id)).toEqual([1]);
    expect(filterCompanies(rows, { priority: "High" }, TODAY).map((c) => c.id)).toEqual([1]);
    expect(filterCompanies(rows, { whereToAct: "goneCold" }, TODAY).map((c) => c.id)).toEqual([2]);
  });
});

describe("order (B9)", () => {
  const rows = [co(1, { date: "2026-10-01" }), co(2), co(3, { date: "2026-10-18" })];
  it("sorts any field either way, empty values last", () => {
    expect(sortCompanies(rows, "date", "desc").map((c) => c.id)).toEqual([3, 1, 2]);
    expect(sortCompanies(rows, "date", "asc").map((c) => c.id)).toEqual([1, 3, 2]);
    expect(sortCompanies([co(1, { cx_size: "10" }), co(2, { cx_size: "9" }), co(3)], "cx_size", "asc", { numeric: true }).map((c) => c.id)).toEqual([2, 1, 3]);
    expect(sortCompanies([co(1, { priority: "Low" }), co(2, { priority: "High" }), co(3)], "priority", "asc").map((c) => c.id)).toEqual([2, 1, 3]);
  });
  it("opens on the most recent action, or the soonest planned outreach for leads", () => {
    expect(defaultCompanySort("active")).toEqual({ key: "date", dir: "desc" });
    expect(defaultCompanySort("toApproach")).toEqual({ key: "reach", dir: "asc" });
  });
});

describe("where to act (B6)", () => {
  it("counts gone cold, waiting on our follow-up, high priority and target date close, of the whole", () => {
    const rows = [
      co(1, { date: "2026-10-06" }), // 14 days: gone cold
      co(2, { date: "2026-10-07", status: "To Follow Up" }),
      co(3, { priority: "High", target: "2026-10-23" }),
      co(4, { target: "2026-10-10" }), // missed
    ];
    expect(whereToActCounts(rows, TODAY)).toEqual({ goneCold: 1, followUp: 1, highPriority: 1, targetClose: 2, of: 4 });
  });
});

describe("follow-up task (B11)", () => {
  it("is ready to save, from what the company knows", () => {
    const task = followUpTaskFor(co(7, { company: "Pelita Foods", target: "2026-10-25", date: "2026-10-15", notes: "Send the deck", priority: "High" }), TODAY);
    expect(task).toMatchObject({
      task: "Follow up with Pelita Foods",
      taskType: "Follow Up",
      priority: "High",
      startDate: "2026-10-25",
      endDate: "2026-10-25",
      lastActionDate: "2026-10-15",
      keyPoints: "Send the deck",
      linkedClientId: 7,
    });
    expect(followUpTaskFor(co(8), TODAY)).toMatchObject({ endDate: TODAY, priority: undefined, lastActionDate: undefined });
  });
});

describe("GBA trials: several options in one value (N22)", () => {
  const order = ["Personality", "Cognitive", "Neuroscience", "Simulation"];

  it("reads the options a value holds", () => {
    expect(choicesOf("Personality, Cognitive")).toEqual(["Personality", "Cognitive"]);
    expect(choicesOf(" Simulation ,")).toEqual(["Simulation"]);
    expect(choicesOf(undefined)).toEqual([]);
    expect(choicesOf("")).toEqual([]);
  });

  it("ticks and unticks an option, keeping the options' order, and leaves nothing when none is left", () => {
    expect(toggleChoice(undefined, "Simulation", order)).toBe("Simulation");
    expect(toggleChoice("Simulation", "Personality", order)).toBe("Personality, Simulation");
    expect(toggleChoice("Personality, Simulation", "Personality", order)).toBe("Simulation");
    expect(toggleChoice("Simulation", "Simulation", order)).toBeUndefined();
    expect(toggleChoice("Old module", "Cognitive", order)).toBe("Cognitive, Old module"); // one no longer an option goes last
  });

  it("filters by a module, or by none trialled", () => {
    const companies = [co(1, { gbaTrials: "Personality, Cognitive" }), co(2, { gbaTrials: "Cognitive" }), co(3)];
    expect(filterCompanies(companies, { trial: "Cognitive" }, TODAY).map((c) => c.id)).toEqual([1, 2]);
    expect(filterCompanies(companies, { trial: "Personality" }, TODAY).map((c) => c.id)).toEqual([1]);
    expect(filterCompanies(companies, { trial: "-" }, TODAY).map((c) => c.id)).toEqual([3]);
  });
});
