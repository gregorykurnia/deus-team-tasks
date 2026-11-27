import { describe, expect, it } from "vitest";
import type { PipelineEntry } from "@/lib/clientTypes";
import { buildCompanyChanges, type CompanyChangesContext } from "@/lib/companyChat";
import { companyGroup, DEAL_DONE_STATUS, picOptions } from "@/lib/companies";
import { newCompanyData, newCompanyFields } from "@/lib/companyEdit";
import { readCompanySettings } from "@/lib/companySettingsModel";

const today = "2026-11-26";
const settings = readCompanySettings(undefined);
const companies: PipelineEntry[] = [
  { id: 1, company: "North Paper", _raw: true, teamPic: "Maya Chen" },
  { id: 2, company: "Harbor Studio", teamPic: "Former Teammate" },
  { id: 3, company: "P.T. Lake-View, Tbk", status: DEAL_DONE_STATUS, pic: "Customer Contact" },
  { id: 4, company: "Lakeview Services", _hold: true, teamPic: "   " },
];
const context: CompanyChangesContext = {
  companies,
  today,
  settings,
  tasks: [{ responsible: ["Maya Chen", "Full Team"], informed: [{ name: "William Tan" }] }],
  flows: [{
    id: "flow", name: "Qualify", description: "", order: 0,
    steps: [{ id: "step", title: "Review", description: "", roles: [{ label: "Backup", names: ["Alia Shaw", "maya chen"] }] }],
    decision: {
      label: "Ready?",
      branches: [{ id: "yes", label: "Yes", tone: "good", title: "Contact", description: "", roles: [{ label: "Responsible", names: ["Audrey Rusli"] }] }],
    },
  }],
};

describe("previewing new companies from chat", () => {
  it("previews two To approach companies in the app's format with the team's stored PIC spelling", () => {
    const input = {
      add: [
        { company: "  Cedar Labs ", teamPic: "maya chen", reach: "2026-12-04", priority: " High ", sourcing: " Referral " },
        { company: "Orchid Press", group: "To approach", teamPic: "  MAYA   CHEN ", industry: "Print", notes: "  " },
      ],
    };
    const { preview, errors } = buildCompanyChanges(input, context);
    expect(errors).toEqual([]);
    expect(preview?.add).toStrictEqual([
      { group: "To approach", data: { company: "Cedar Labs", _raw: true, _hold: false, teamPic: "Maya Chen", reach: "2026-12-04", priority: "High", sourcing: "Referral" } },
      { group: "To approach", data: { company: "Orchid Press", _raw: true, _hold: false, teamPic: "Maya Chen", industry: "Print" } },
    ]);
    const form = newCompanyFields(settings, "toApproach");
    expect(preview?.add.map(({ data }) => data)).toStrictEqual(input.add.map(({ company, ...details }) =>
      newCompanyData(company, "toApproach", form, { ...details, teamPic: "Maya Chen" }),
    ));
    expect(preview?.add.map(({ data }) => companyGroup(data))).toEqual(["toApproach", "toApproach"]);
    expect(picOptions(preview!.add.map(({ data }, id) => ({ ...data, id })))).toEqual([{ name: "Maya Chen", count: 2 }]);
  });

  it.each([
    ["active", "Active", { status: "Meeting Soon", date: today }],
    ["noOrNotNow", "No or not now", { answer: "Not now" }],
  ] as const)("fills %s defaults and serializes like the sheet", (group, label, defaults) => {
    const details = { teamPic: "Audrey Rusli", pic: "Reception", product: "Trial" };
    const { preview, errors } = buildCompanyChanges({ add: [{ company: "Spruce", group: label, ...details }] }, context);
    expect(errors).toEqual([]);
    const expected = { company: "Spruce", _raw: false, _hold: group === "noOrNotNow", ...details, ...defaults };
    expect(preview?.add).toStrictEqual([{ group: label, data: expected }]);
    expect(preview?.add[0].data).toStrictEqual(newCompanyData("Spruce", group, newCompanyFields(settings, group), { ...details, ...defaults }));
    expect(companyGroup(expected)).toBe(group);
  });

  it("preserves allowed details across hidden columns and long notes, and keeps contact person separate", () => {
    const notes = "Long note. ".repeat(2_000).trimEnd();
    const { preview, errors } = buildCompanyChanges({ add: [
      { company: "Spruce", group: "active", status: "To Follow Up", notes: ` ${notes} `, type: "Partner", industry: "Retail", sourcing: "Referral" },
      { company: "Pine", teamPic: "  ", pic: "Contact Person", product: "Survey" },
    ] }, context);
    expect(errors).toEqual([]);
    expect(preview?.add.map(({ data }) => data)).toStrictEqual([
      { company: "Spruce", _raw: false, _hold: false, status: "To Follow Up", notes, type: "Partner", industry: "Retail", sourcing: "Referral" },
      { company: "Pine", _raw: true, _hold: false, pic: "Contact Person", product: "Survey" },
    ]);
  });

  it.each([
    [{ group: "dealDone" }, ".group"],
    [{ group: "Active clients and partners" }, ".group"],
    [{ group: "active", status: DEAL_DONE_STATUS }, ".status"],
    [{ status: "Meeting Soon" }, "only allowed for Active"],
    [{ group: "active", reach: "2026-12-04" }, "only allowed for companies in To approach"],
    [{ reach: "2026-02-29" }, "calendar date"],
    [{ reach: "12/04/2026" }, "calendar date"],
    [{ reach: "   " }, "calendar date"],
    [{ date: today }, 'unknown field "date"'],
    [{ company: "  " }, "needs a company name"],
    [{ company: "PT . Tbk" }, "needs a company name"],
    [{ product: false }, ".product must be text"],
    [{ allowDuplicate: "yes" }, ".allowDuplicate must be a boolean"],
  ])("refuses invalid details %j", (fields, message) => {
    const result = buildCompanyChanges({ add: [{ company: "Spruce", ...fields }] }, context);
    expect(result.preview).toBeNull();
    expect(result.errors.join(" ")).toContain(message);
  });

  it("uses the current settings' options, including renamed choices and the available Active statuses", () => {
    const custom = readCompanySettings({
      options: { type: [{ name: " Reseller " }], priority: [{ name: "Urgent" }], status: [{ name: "In talks" }] },
    });
    const useCustom = { ...context, settings: custom };
    const invalid = buildCompanyChanges({ add: [{ company: "Spruce", group: "Active", type: "Partner", priority: "Medium", status: "Meeting Soon" }] }, useCustom);
    expect(invalid.preview).toBeNull();
    expect(invalid.errors).toEqual([
      expect.stringContaining("Choose from Reseller."),
      expect.stringContaining("Choose from High, Urgent."),
      expect.stringContaining("Choose from To Follow Up, In talks."),
    ]);
    const missingStatus = buildCompanyChanges({ add: [{ company: "Spruce", group: "Active" }] }, useCustom);
    expect(missingStatus.preview).toBeNull();
    expect(missingStatus.errors[0]).toBe('add[0].status is needed for an Active company because "Meeting Soon" isn\'t a status option. Choose from To Follow Up, In talks.');
    const valid = buildCompanyChanges({ add: [{ company: "Spruce", group: "Active", type: "Reseller", priority: "Urgent", status: "In talks" }] }, useCustom);
    expect(valid.preview?.add[0].data).toMatchObject({ type: "Reseller", priority: "Urgent", status: "In talks" });
  });

  it("rejects an unknown PIC with the three closest team names", () => {
    const result = buildCompanyChanges({ add: [{ company: "Spruce", teamPic: "Mya Chen" }] }, context);
    expect(result.preview).toBeNull();
    expect(result.errors[0]).toMatch(/unknown team name\. Closest team names are Maya Chen, [^,]+, [^,]+\.$/);
    expect(buildCompanyChanges({ add: [{ company: "Spruce", teamPic: "full   TEAM" }] }, context).preview).toBeNull();
  });

  it("catches an existing client despite case, spacing and punctuation and allows an explicitly confirmed duplicate", () => {
    const row = { company: "L A K E—V I E W" };
    const duplicate = buildCompanyChanges({ add: [row] }, context);
    expect(duplicate.preview).toBeNull();
    expect(duplicate.errors[0]).toContain('"P.T. Lake-View, Tbk" in Active clients and partners (company 3)');
    const allowed = buildCompanyChanges({ add: [{ ...row, allowDuplicate: true }] }, context);
    expect(allowed.errors).toEqual([]);
    expect(allowed.preview?.add[0].data).toStrictEqual({ company: row.company, _raw: true, _hold: false });
    expect(allowed.preview?.warnings).toEqual([{ company: row.company, matches: [
      { id: 3, company: "P.T. Lake-View, Tbk", group: "Active clients and partners" },
      { id: 4, company: "Lakeview Services", group: "No or not now" },
    ] }]);
  });

  it("warns about close matches, refuses repeat names in one call, and reports exact matches on apply", () => {
    const close = buildCompanyChanges({ add: [{ company: "Lake" }] }, context);
    expect(close.errors).toEqual([]);
    expect(close.preview?.warnings).toEqual([{ company: "Lake", matches: [
      { id: 3, company: "P.T. Lake-View, Tbk", group: "Active clients and partners" },
      { id: 4, company: "Lakeview Services", group: "No or not now" },
    ] }]);
    expect(buildCompanyChanges({ add: [{ company: "Sun Rise" }, { company: "sun-rise", allowDuplicate: true }] }, context).errors[0]).toContain("appears twice");

    const input = { add: [{ company: "North-Paper", type: "Client" }, { company: "Spruce" }] };
    const before = { ...context, companies: companies.filter(({ id }) => id !== 1) };
    expect(buildCompanyChanges(input, before).preview?.add).toHaveLength(2);
    const apply = buildCompanyChanges(input, context, "apply");
    expect(apply.errors).toEqual([]);
    expect(apply.preview?.alreadyExists).toEqual([{ id: 1, company: "North Paper", group: "To approach", requestedCompany: "North-Paper" }]);
    expect(apply.preview?.add.map(({ data }) => data.company)).toEqual(["Spruce"]);
    expect(buildCompanyChanges(input, context, "apply")).toEqual(apply);
    const typeRemoved = { ...context, settings: readCompanySettings({ options: { type: [] } }) };
    expect(buildCompanyChanges(input, typeRemoved, "apply")).toEqual(apply);
  });
});

describe("previewing PIC changes from chat", () => {
  it("previews set, clear, and unchanged across all four groups and reads only the team PIC", () => {
    const { preview, errors } = buildCompanyChanges({ setPic: [
      { pic: "maya chen", companyIds: [1] },
      { pic: null, companyIds: [2, 4] },
      { pic: " william TAN ", companyIds: [3] },
    ] }, context);
    expect(errors).toEqual([]);
    expect(preview?.setPic).toEqual([
      { id: 1, company: "North Paper", group: "To approach", before: "Maya Chen", after: "Maya Chen", unchanged: true },
      { id: 2, company: "Harbor Studio", group: "Active", before: "Former Teammate", after: null, unchanged: false },
      { id: 4, company: "Lakeview Services", group: "No or not now", before: null, after: null, unchanged: true },
      { id: 3, company: "P.T. Lake-View, Tbk", group: "Active clients and partners", before: null, after: "William Tan", unchanged: false },
    ]);
    expect(preview?.seenPics).toEqual({ 1: "Maya Chen", 2: "Former Teammate", 3: null, 4: null });
  });

  it.each([
    [[{ pic: null, companyIds: [99] }], "Company 99 could not be found"],
    [[{ pic: null, companyIds: [1, 1] }], "Company 1 appears twice"],
    [[{ pic: null, companyIds: [1] }, { pic: "Maya Chen", companyIds: [1] }], "Company 1 appears twice"],
    [[{ pic: "  ", companyIds: [1] }], "team name or null"],
    [[{ companyIds: [1] }], "team name or null"],
    [[{ pic: "Customer Contact", companyIds: [3] }], "unknown team name"],
    [[{ pic: "Alia Shaw", companyIds: ["3"] }], "numeric company IDs"],
    [[{ pic: "Alia Shaw", companyIds: [] }], "at least one company ID"],
  ])("refuses invalid PIC changes %j", (setPic, message) => {
    const result = buildCompanyChanges({ setPic }, context);
    expect(result.preview).toBeNull();
    expect(result.errors.join(" ")).toContain(message);
  });

  it("checks every seen PIC, including a cleared and an unchanged row, and refuses the whole stale batch", () => {
    const input = { add: [{ company: "Spruce" }], setPic: [
      { pic: null, companyIds: [2, 3] },
      { pic: "Maya Chen", companyIds: [1] },
    ] };
    const { preview } = buildCompanyChanges(input, context);
    const seenPics = JSON.parse(JSON.stringify(preview?.seenPics));
    expect(buildCompanyChanges({ ...input, seenPics }, context, "apply")).toEqual({ preview, errors: [] });
    expect(buildCompanyChanges({ ...input, seenPics: { 1: "Maya Chen", 2: "Former Teammate" } }, context, "apply").errors[0]).toContain("missing company 3");
    expect(buildCompanyChanges({ ...input, seenPics: [] }, context, "apply").errors[0]).toContain("keyed by company ID");
    expect(buildCompanyChanges(input, context, "apply").errors).toHaveLength(3);
    expect(buildCompanyChanges({ ...input, seenPics: { ...seenPics, 3: 0 } }, context, "apply").errors[0]).toContain("must be a name or null");
    const changed = { ...context, companies: companies.map((company) => company.id === 1 ? { ...company, teamPic: "maya chen" } : company) };
    expect(buildCompanyChanges({ ...input, seenPics }, changed, "apply")).toEqual({
      preview: null, errors: ["PIC changed since the preview for North Paper (company 1). Preview again."],
    });
  });

  it("accepts 50 adds and 200 PIC changes, and tells chat to split larger batches", () => {
    const rows = Array.from({ length: 201 }, (_, id) => ({ id, company: `Existing ${id}` }));
    const add = Array.from({ length: 51 }, (_, i) => ({ company: `Prospect ${i}` }));
    const setPic = (end: number) => [
      { pic: null, companyIds: rows.slice(0, 100).map(({ id }) => id) },
      { pic: "Alia Shaw", companyIds: rows.slice(100, end).map(({ id }) => id) },
    ];
    const atLimit = buildCompanyChanges({ add: add.slice(0, 50), setPic: setPic(200) }, { ...context, companies: rows });
    expect(atLimit.errors).toEqual([]);
    expect(atLimit.preview?.add).toHaveLength(50);
    expect(atLimit.preview?.setPic).toHaveLength(200);
    const tooMany = buildCompanyChanges({ add, setPic: setPic(201) }, { ...context, companies: rows });
    expect(tooMany.preview).toBeNull();
    expect(tooMany.errors).toEqual([expect.stringMatching(/50.*split it/), expect.stringMatching(/200.*split it/)]);
  });
});
