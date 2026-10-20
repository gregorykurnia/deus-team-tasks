import { describe, expect, it } from "vitest";
import type { PipelineEntry } from "@/lib/clientTypes";
import { sortCompanies } from "@/lib/companies";
import { DEFAULT_COMPANY_SETTINGS } from "@/lib/companySettings";
import {
  appliedFilters,
  cellOf,
  clearedFilters,
  directionLabels,
  effectiveSort,
  emptyCase,
  filtersOn,
  gridOf,
  listCompanies,
  parseCompanyView,
  sortedByHead,
  sortSummary,
  subline,
  viewParams,
} from "@/lib/companyView";

const TODAY = "2026-10-20";
const co = (id: number, fields: Partial<PipelineEntry> = {}): PipelineEntry => ({ id, company: `Company ${id}`, status: "To Follow Up", ...fields });
const settings = DEFAULT_COMPANY_SETTINGS;
const fieldsOf = (g: keyof typeof settings.fields) => settings.fields[g];
const field = (g: keyof typeof settings.fields, key: string) => fieldsOf(g).find((f) => f.key === key)!;
const state = (query: string) => parseCompanyView(new URLSearchParams(query));

describe("the view in the address (guide 6.5)", () => {
  it("opens on Active with nothing narrowed", () => {
    expect(state("")).toEqual({ group: "active", q: "", status: null, priority: null, product: null, act: null, sort: null, dir: null });
    expect(viewParams(state("")).toString()).toBe("");
  });

  it("round-trips the group, search, filters and sort, and leaves other params alone", () => {
    const params = "group=no-or-not-now&q=pelita&priority=High&product=wifi&sort=reason&dir=desc&company=7";
    const s = state(params);
    expect(s).toMatchObject({ group: "noOrNotNow", q: "pelita", priority: "High", product: "wifi", sort: "reason", dir: "desc" });
    const back = viewParams(s, new URLSearchParams("company=7"));
    expect(Object.fromEntries(back)).toEqual({ group: "no-or-not-now", q: "pelita", priority: "High", product: "wifi", sort: "reason", dir: "desc", company: "7" });
  });

  it("lets go of what doesn't fit: an unknown group, where-to-act outside Active, a direction with no sort", () => {
    expect(state("group=elsewhere").group).toBe("active");
    expect(state("group=deal-done&act=gone-cold").act).toBeNull();
    expect(state("act=gone-cold").act).toBe("goneCold");
    expect(state("dir=desc").dir).toBeNull();
  });
});

describe("filters", () => {
  it("counts only the filters the group has a field for", () => {
    // To approach has Priority but no Status or Product; a link made for Active doesn't narrow it by them.
    const s = state("group=to-approach&status=Drop&priority=High&product=wifi");
    expect(appliedFilters(s, fieldsOf("toApproach"))).toMatchObject({ status: null, priority: "High", productKey: null });
    expect(filtersOn(state("group=to-approach&status=Drop"), fieldsOf("toApproach"))).toBe(false);
    expect(filtersOn(state("q=acme"), fieldsOf("active"))).toBe(true);
  });

  it("clears every filter and the search, and keeps the group and the sort", () => {
    const cleared = clearedFilters(state("q=a&status=Drop&priority=High&product=x&act=gone-cold&sort=target&dir=asc"));
    expect(cleared).toMatchObject({ group: "active", q: "", status: null, priority: null, product: null, act: null, sort: "target", dir: "asc" });
  });
});

describe("sort (guide 5.6)", () => {
  it("uses the group's default until one is chosen", () => {
    expect(effectiveSort(state(""), fieldsOf("active"))).toEqual({ key: "date", dir: "desc" });
    expect(effectiveSort(state("group=to-approach"), fieldsOf("toApproach"))).toEqual({ key: "reach", dir: "asc" });
  });

  it("ignores a sort by a field the group doesn't have", () => {
    expect(effectiveSort(state("sort=reach"), fieldsOf("active"))).toEqual({ key: "date", dir: "desc" });
    expect(effectiveSort(state("sort=company"), fieldsOf("active"))).toEqual({ key: "company", dir: "asc" });
  });

  it("turns the order round when the head in use is pressed again", () => {
    const first = sortedByHead(state(""), fieldsOf("active"), "target");
    expect(first).toMatchObject({ sort: "target", dir: "asc" });
    expect(sortedByHead(first, fieldsOf("active"), "target")).toMatchObject({ dir: "desc" });
    // The last action starts with the most recent.
    expect(sortedByHead(state("sort=target"), fieldsOf("active"), "date")).toMatchObject({ sort: "date", dir: "desc" });
  });

  it("says the direction in words for each kind of field", () => {
    expect(directionLabels("company", undefined)).toEqual(["A to Z", "Z to A"]);
    expect(directionLabels("date", field("active", "date"))).toEqual(["Longest ago first", "Most recent first"]);
    expect(directionLabels("target", field("active", "target"))).toEqual(["Earliest first", "Latest first"]);
    expect(directionLabels("priority", field("active", "priority"))).toEqual(["High first", "Low first"]);
    expect(directionLabels("status", field("active", "status"))).toEqual(["In option order", "Reverse order"]);
    expect(sortSummary({ key: "date", dir: "desc" }, fieldsOf("active"))).toBe("Last action, most recent first");
  });

  it("sorts a choice field by the order of its options, with empty values last either way round", () => {
    const list = [co(1, { type: "Partner" }), co(2), co(3, { type: "Client" }), co(4, { type: "Individual Partner" }), co(5, { type: "Gone" })];
    const order = ["Client", "Partner", "Individual Partner"];
    expect(sortCompanies(list, "type", "asc", { order }).map((c) => c.id)).toEqual([3, 1, 4, 2, 5]);
    expect(sortCompanies(list, "type", "desc", { order }).map((c) => c.id)).toEqual([4, 1, 3, 2, 5]);
  });
});

describe("the list", () => {
  const companies = [
    co(1, { company: "Acme", date: "2026-10-01", product: "Wifi, CCTV" }),
    co(2, { company: "Borneo", date: "2026-10-18", priority: "High", product: "wifi" }),
    co(3, { company: "Citra", _raw: true, reach: "2026-10-25", industry: "Acme supplies" }),
    co(4, { company: "Delta", status: "Client / Partner Done Deal" }),
    co(5, { company: "Epsilon", _hold: true, reason: "Too early" }),
  ];

  it("lists the group, most recent action first, and narrows it", () => {
    expect(listCompanies(companies, state(""), settings, TODAY).sorted.map((c) => c.company)).toEqual(["Borneo", "Acme"]);
    expect(listCompanies(companies, state("priority=High"), settings, TODAY).sorted.map((c) => c.company)).toEqual(["Borneo"]);
    expect(listCompanies(companies, state("product=wifi"), settings, TODAY).sorted).toHaveLength(2); // spellings merged
    expect(listCompanies(companies, state("act=gone-cold"), settings, TODAY).sorted.map((c) => c.company)).toEqual(["Acme"]);
  });

  it("names the other groups a search finds something in", () => {
    const listing = listCompanies(companies, state("q=acme&group=deal-done"), settings, TODAY);
    expect(listing.sorted).toEqual([]);
    expect(listing.elsewhere).toEqual([
      { group: "toApproach", count: 1 },
      { group: "active", count: 1 },
    ]);
    expect(listCompanies(companies, state("group=deal-done"), settings, TODAY).elsewhere).toEqual([]);
  });

  it("puts To approach in order of planned outreach and sorts by a field's own order", () => {
    const sorted = (query: string) => listCompanies(companies, state(query), settings, TODAY).sorted.map((c) => c.company);
    expect(sorted("group=to-approach")).toEqual(["Citra"]);
    expect(sorted("sort=company&dir=desc")).toEqual(["Borneo", "Acme"]);
    expect(sorted("sort=priority")).toEqual(["Borneo", "Acme"]); // High first, none last
  });

  it("finds the companies without a status or priority with None", () => {
    expect(listCompanies(companies, state("priority=-"), settings, TODAY).sorted.map((c) => c.company)).toEqual(["Acme"]);
    const noStatus = [co(6, { company: "Fajar", status: "" }), co(7, { company: "Gita", status: undefined }), co(8, { company: "Hana" })];
    expect(listCompanies(noStatus, state("status=-&sort=company"), settings, TODAY).sorted.map((c) => c.company)).toEqual(["Fajar", "Gita"]);
  });

  it("sorts priority by the order of its options, as the team set them", () => {
    const team = { ...settings, options: { ...settings.options, priority: [{ name: "Urgent", colour: "pink" as const }, ...settings.options.priority] } };
    const rows = [co(1, { company: "Low one", priority: "Low" }), co(2, { company: "None" }), co(3, { company: "Urgent one", priority: "Urgent" }), co(4, { company: "High one", priority: "High" })];
    const sorted = (query: string) => listCompanies(rows, state(query), team, TODAY).sorted.map((c) => c.company);
    expect(sorted("sort=priority")).toEqual(["Urgent one", "High one", "Low one", "None"]);
    expect(sorted("sort=priority&dir=desc")).toEqual(["Low one", "High one", "Urgent one", "None"]);
  });

  it("tells the empty states apart", () => {
    expect(emptyCase(0, 0)).toBe("nothingYet");
    expect(emptyCase(0, 12)).toBe("groupEmpty");
    expect(emptyCase(4, 12)).toBe("nothingMatches");
  });
});

describe("cells (guide 4.9, 5.1)", () => {
  it("shows a choice in its option's colour, and a value that's no longer an option in grey", () => {
    expect(cellOf(co(1, { status: "Meeting Soon" }), field("active", "status"), "active", settings, TODAY)).toEqual({ kind: "choice", label: "Meeting Soon", colour: "teal" });
    expect(cellOf(co(1, { status: "Old status" }), field("active", "status"), "active", settings, TODAY)).toMatchObject({ colour: "slate" });
  });

  it("says the last action in words, amber from 7 days and red from 14, in Active and Deal done only", () => {
    const last = (date: string, group: "active" | "toApproach") => cellOf(co(1, { date }), field("active", "date"), group, settings, TODAY);
    expect(last("2026-10-20", "active")).toMatchObject({ label: "Today", tone: "plain" });
    expect(last("2026-10-19", "active")).toMatchObject({ label: "Yesterday" });
    expect(last("2026-10-12", "active")).toMatchObject({ label: "8 days ago", tone: "amber" });
    expect(last("2026-10-01", "active")).toMatchObject({ label: "19 days ago", tone: "red", title: "Last action 1 Oct 2026. Gone cold" });
    expect(last("2026-10-01", "toApproach")).toMatchObject({ tone: "plain" });
  });

  it("gives a target date the tones of a deadline, and a missed planned outreach amber", () => {
    const target = (iso: string) => cellOf(co(1, { target: iso }), field("active", "target"), "active", settings, TODAY);
    expect(target("2026-10-17")).toMatchObject({ label: "Missed by 3 days", tone: "red", pill: true });
    expect(target("2026-10-21")).toMatchObject({ label: "Tomorrow", tone: "amber" });
    expect(target("2026-10-30")).toMatchObject({ label: "In 10 days", tone: "plain" });
    expect(target("2026-12-25")).toMatchObject({ label: "25 Dec", tone: "plain" });
    expect(cellOf(co(1, { reach: "2026-10-18" }), field("toApproach", "reach"), "toApproach", settings, TODAY)).toMatchObject({ label: "2 days overdue", tone: "amber" });
  });

  it("leaves empty values empty, and numbers with separators", () => {
    expect(cellOf(co(1), field("active", "target"), "active", settings, TODAY)).toEqual({ kind: "empty" });
    expect(cellOf(co(1, { cx_1: 12500 }), { key: "cx_1", label: "Budget", type: "number", shown: true, own: true }, "active", settings, TODAY)).toEqual({ kind: "number", label: "12,500" });
  });

  it("puts the industry under a name in To approach and the contact person elsewhere", () => {
    expect(subline(co(1, { industry: "Retail", pic: "Rina" }), "toApproach")).toBe("Retail");
    expect(subline(co(1, { industry: "Retail", pic: "Rina" }), "active")).toBe("Rina");
    expect(subline(co(1), "active")).toBe("");
  });

  it("builds a grid with the pinned name first and the row menu's column last", () => {
    const grid = gridOf([field("active", "status"), field("active", "notes")]);
    expect(grid.columns).toBe("minmax(230px, 1.5fr) 150px minmax(220px, 1.6fr) 40px");
    expect(grid.minWidth).toBe(230 + 150 + 220 + 40 + 14 * 3 + 28);
  });
});
