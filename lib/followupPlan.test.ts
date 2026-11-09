import { describe, expect, it } from "vitest";
import { FOLLOWUP_COMPANY_FIXTURE as company, SIX_STEP_FOLLOWUP_FIXTURE as fixture } from "../tests/fixtures/followupPlan";
import { DEAL_DONE_STATUS, companyGroup } from "./companies";
import { buildFollowupPlan, findCompanies, validateFollowupPlan } from "./followupPlan";
import type { FollowupPlanContext, FollowupPlanInput, FollowupStepInput } from "./followupPlan";
import { companiesById, kindOf } from "./kinds";
import type { Task } from "./types";

const TODAY = "2026-11-09";
const plan = (): FollowupPlanInput => structuredClone(fixture);
const context = (overrides: Partial<FollowupPlanContext> = {}): FollowupPlanContext => ({
  companies: [company], tasks: [], parentId: "new-parent", today: TODAY, order: 100, ...overrides,
});
const parent = (overrides: Partial<Task> = {}): Task => ({
  id: "existing-parent", task: `${company.company} Follow Up`, taskType: "Follow Up", linkedClientId: company.id,
  startDate: "2026-10-01", endDate: "2026-11-01", order: 500, keyPoints: "Original meeting notes",
  responsible: ["Existing owner"], informed: [{ name: "Existing observer" }], ...overrides,
});
const previewStep = (changes: Partial<FollowupStepInput>) => buildFollowupPlan({
  ...plan(), steps: [{ ...fixture.steps[0], ...changes }],
}, context());

describe("follow-up input validation", () => {
  it("accepts the explicit selected company and six dated Path steps", () => {
    expect(validateFollowupPlan(plan())).toEqual({ plan: fixture, errors: [] });
  });

  it.each([null, undefined, "plan", [], 5])("rejects a non-object input (%j)", (input) => {
    expect(buildFollowupPlan(input, context())).toMatchObject({ canWrite: false, parent: null, subtasks: [], errors: [expect.any(String)] });
  });

  it.each(["901", -1, 1.5, NaN, Infinity, undefined])("requires a selected numeric company ID (%s)", (companyId) => {
    expect(validateFollowupPlan({ ...plan(), companyId }).plan).toBeNull();
  });

  it.each(["", " ", undefined, 42])("requires a short answer (%s)", (shortAnswer) => {
    expect(validateFollowupPlan({ ...plan(), shortAnswer }).plan).toBeNull();
  });

  it.each([[], undefined, {}, [null], Array(1)])("requires actual step objects (%j)", (steps) => {
    expect(validateFollowupPlan({ ...plan(), steps }).plan).toBeNull();
  });

  it.each<keyof FollowupStepInput>(["name", "startDate", "endDate", "owners", "what", "why", "bring", "watch", "doneWhen"])("requires step %s rather than guessing it", (key) => {
    expect(validateFollowupPlan({ ...plan(), steps: [{ ...fixture.steps[0], [key]: " " }] })).toEqual({
      plan: null, errors: [`steps[0].${key} must be non-empty text.`],
    });
  });

  it.each(["not a link", "javascript:alert(1)", "file:///tmp/plan", "", 42])("rejects an invalid Claude Doc link (%s)", (docUrl) => {
    expect(validateFollowupPlan({ ...plan(), docUrl }).plan).toBeNull();
  });

  it.each(["", 123, null])("rejects a malformed existing parent selection (%s)", (existingParentId) => {
    expect(validateFollowupPlan({ ...plan(), existingParentId }).plan).toBeNull();
  });
});

describe("company matching", () => {
  it.each(["CONTOH AURORA FIKTIF", "pt. Contoh Aurora Fiktif tbk.", "P.T. Contoh-Aurora, Fiktif Tbk", "Contoh.Aurora/Fiktif", "  Contoh   Aurora Fiktif  "])("ignores case, PT, Tbk and punctuation (%s)", (query) => {
    expect(findCompanies(query, [company])).toEqual([{
      id: company.id, name: company.company, group: "Active", pic: "Test contact", followups: [],
    }]);
  });

  it("ranks exact names, prefixes and substrings in that order and returns at most five", () => {
    const names = ["Other Aurora", "Aurora West", "Aurora", "Another Aurora", "Aurora East", "More Aurora", "Unrelated"];
    const companies = names.map((name, i) => ({ id: i, company: name }));
    expect(findCompanies("Aurora", companies).map((c) => c.name)).toEqual([
      "Aurora", "Aurora East", "Aurora West", "Another Aurora", "More Aurora",
    ]);
    expect(findCompanies("Aurora", [...companies].reverse())).toEqual(findCompanies("Aurora", companies));
  });

  it("uses ID to break identical-name ties", () => {
    expect(findCompanies("Aurora", [{ id: 2, company: "Aurora" }, { id: 1, company: "PT Aurora Tbk" }]).map((c) => c.id)).toEqual([1, 2]);
  });

  it.each(["", " ", "PT. Tbk", "???", "Missing"])("returns no candidates for an empty or unmatched name (%s)", (query) => {
    expect(findCompanies(query, [company])).toEqual([]);
  });

  it("does not remove PT or Tbk inside a name", () => {
    expect(findCompanies("PTara Tbkarya", [{ id: 1, company: "PTara Tbkarya" }])).toMatchObject([{ id: 1, name: "PTara Tbkarya" }]);
    expect(findCompanies("pt ara tbk arya", [{ id: 1, company: "PTara Tbkarya" }])).toEqual([]);
  });

  it("reports all four pipeline groups using companyGroup's precedence", () => {
    const companies = [company, { ...company, id: 902, _raw: true, status: DEAL_DONE_STATUS },
      { ...company, id: 903, _hold: true, status: DEAL_DONE_STATUS }, { ...company, id: 904, status: DEAL_DONE_STATUS }];
    expect(findCompanies("Contoh", companies).map((c) => [c.id, c.group])).toEqual([
      [901, "Active"], [902, "Raw"], [903, "On hold"], [904, "Deal done"],
    ]);
  });

  it("includes open follow-up parents and all their subtasks in order, without unrelated or completed parents", () => {
    const open = parent();
    const children = [parent({ id: "second", parentId: open.id, order: 2, completed: true }), parent({ id: "first", parentId: open.id, order: 1 })];
    const tasks = [open, ...children, parent({ id: "closed", completed: true }), parent({ id: "other", linkedClientId: 2 }), parent({ id: "different-title", task: "A different task" })];
    expect(findCompanies("Contoh", [company], tasks)[0].followups).toEqual([{ parent: open, subtasks: [children[1], children[0]] }]);
  });
});

describe("preview warnings", () => {
  it.each(["11/10/2026", "2026-1-10", "around Feb 8", "2026-02-29", "2026-04-31", "2026-13-01", "2026-00-10", "2026-11-00", "2026-11-10T00:00:00Z"])("warns and blocks invalid calendar/ISO dates (%s)", (startDate) => {
    expect(previewStep({ startDate })).toMatchObject({
      canWrite: false, parent: null, subtasks: [],
      warnings: [{ code: "invalid-date", step: 0, field: "startDate", message: expect.stringContaining("yyyy-mm-dd") }],
    });
  });

  it("also checks the end date, without deriving it from the start date", () => {
    expect(previewStep({ endDate: "next week" }).warnings).toMatchObject([{ code: "invalid-date", field: "endDate" }]);
  });

  it("accepts a real leap day", () => {
    expect(previewStep({ startDate: "2028-02-29", endDate: "2028-02-29" })).toMatchObject({ canWrite: true, warnings: [] });
  });

  it("warns and blocks a start after the end, including across the year end", () => {
    expect(previewStep({ startDate: "2027-01-01", endDate: "2026-12-31" })).toMatchObject({
      canWrite: false, parent: null, subtasks: [], warnings: [{ code: "start-after-end", step: 0, message: expect.any(String) }],
    });
  });

  it("warns about each date in the past without silently moving it", () => {
    const result = previewStep({ startDate: "2026-11-07", endDate: "2026-11-08" });
    expect(result.warnings.map((w) => [w.code, w.field])).toEqual([["past-date", "startDate"], ["past-date", "endDate"]]);
    expect(result.subtasks[0]).toMatchObject({ startDate: "2026-11-07", endDate: "2026-11-08" });
    expect(result.canWrite).toBe(true);
  });

  it("does not call today a past date", () => {
    expect(previewStep({ startDate: TODAY, endDate: TODAY }).warnings).toEqual([]);
  });

  it("warns when a Deal done company's tasks will appear under Clients", () => {
    const result = buildFollowupPlan(plan(), context({ companies: [{ ...company, status: DEAL_DONE_STATUS }] }));
    expect(result.warnings).toEqual([{ code: "deal-done", message: expect.stringContaining("under Clients") }]);
    expect(kindOf(result.parent!, companiesById([{ ...company, status: DEAL_DONE_STATUS }]))).toBe("client");
    expect(result.canWrite).toBe(true);
  });

  it("does not misclassify raw or held companies with a Deal done status", () => {
    for (const flags of [{ _raw: true }, { _hold: true }]) {
      const c = { ...company, ...flags, status: DEAL_DONE_STATUS };
      expect(companyGroup(c)).not.toBe("dealDone");
      expect(buildFollowupPlan(plan(), context({ companies: [c] })).warnings).toEqual([]);
    }
  });

  it("warns about an existing follow-up and exposes no write docs until explicitly selected", () => {
    const result = buildFollowupPlan(plan(), context({ tasks: [parent()] }));
    expect(result).toMatchObject({ canWrite: false, parent: null, parentUpdate: null, subtasks: [], errors: [] });
    expect(result.warnings).toEqual([{ code: "followup-exists", taskId: "existing-parent", message: expect.stringContaining("Ask the owner whether to add") }]);
  });

  it("collects all applicable warnings in one preview", () => {
    const result = buildFollowupPlan({ ...plan(), steps: [
      { ...fixture.steps[0], startDate: "not a date" },
      { ...fixture.steps[0], startDate: "2026-11-08", endDate: "2026-11-07" },
    ] }, context({ companies: [{ ...company, status: DEAL_DONE_STATUS }], tasks: [parent()] }));
    expect(new Set(result.warnings.map((w) => w.code))).toEqual(new Set(["invalid-date", "past-date", "start-after-end", "deal-done", "followup-exists"]));
  });
});

describe("building follow-up task documents", () => {
  it("builds one parent and six subtasks with the fixture's dates, including the one-day and year-crossing steps", () => {
    const result = buildFollowupPlan(plan(), context());
    expect(result).toMatchObject({ canWrite: true, errors: [], warnings: [], parentId: "new-parent", parentUpdate: null });
    expect(result.parent).toEqual({
      task: "PT Contoh Aurora Fiktif Tbk Follow Up", taskType: "Follow Up", linkedClientId: 901,
      responsible: [], informed: [], keyPoints: `${fixture.shortAnswer}\n\nClaude Doc: ${fixture.docUrl}`,
      startDate: "2026-11-10", endDate: "2027-02-08", order: 100,
    });
    expect(result.subtasks.map((s) => [s.task, s.startDate, s.endDate])).toEqual([
      ["Confirm budget contact", "2026-11-10", "2026-11-13"],
      ["Gather pilot requirements", "2026-11-16", "2026-11-20"],
      ["Share pilot outline", "2026-11-23", "2026-11-27"],
      ["Review the pilot", "2026-12-07", "2026-12-11"],
      ["Confirm the next-year route", "2026-12-28", "2027-01-08"],
      ["Ask for a budget slot", "2027-02-08", "2027-02-08"],
    ]);
    for (const [i, subtask] of result.subtasks.entries()) {
      expect(subtask).toMatchObject({ parentId: "new-parent", linkedClientId: 901, responsible: [], informed: [], order: 101 + i });
      expect(subtask.taskType).toBeUndefined();
      expect(kindOf(subtask, companiesById([company]))).toBe("prospect");
    }
  });

  it("keeps Owner / What / Why / Bring / Watch / Done when text in Key points", () => {
    const step = fixture.steps[0];
    expect(buildFollowupPlan(plan(), context()).subtasks[0].keyPoints).toBe([
      `Owner: ${step.owners}`, `What: ${step.what}`, `Why: ${step.why}`, `Bring: ${step.bring}`,
      `Watch: ${step.watch}`, `Done when: ${step.doneWhen}`,
    ].join("\n\n"));
  });

  it("uses only explicit Path steps and never copies extra owners, slips, side opportunities or stored fields", () => {
    const result = buildFollowupPlan({ ...plan(), responsible: ["Someone"], informed: [{ name: "Observer" }],
      slips: [fixture.steps[0]], sideOpportunities: [fixture.steps[0]], completed: true,
      steps: [{ ...fixture.steps[0], responsible: ["Someone"], taskType: "Trial Pending", completed: true }],
    }, context());
    expect(result.subtasks).toHaveLength(1);
    for (const doc of [result.parent!, ...result.subtasks]) {
      expect(doc.responsible).toEqual([]);
      expect(doc.informed).toEqual([]);
      expect(doc.completed).toBeUndefined();
      expect(doc).not.toHaveProperty("slips");
    }
    expect(result.subtasks[0].taskType).toBeUndefined();
  });

  it("omits the optional Doc link cleanly", () => {
    expect(buildFollowupPlan({ ...plan(), docUrl: undefined }, context()).parent?.keyPoints).toBe(fixture.shortAnswer);
  });

  it("covers all step dates even if the supplied Path steps are not chronological", () => {
    const result = buildFollowupPlan({ ...plan(), steps: [...fixture.steps].reverse() }, context());
    expect(result.parent).toMatchObject({ startDate: "2026-11-10", endDate: "2027-02-08" });
    expect(result.subtasks[0].task).toBe(fixture.steps[5].name);
  });

  it("returns no write documents when the selected company is missing instead of picking a similar name", () => {
    expect(buildFollowupPlan({ ...plan(), companyId: 999 }, context())).toMatchObject({
      canWrite: false, parent: null, subtasks: [], errors: [expect.stringContaining("Add it under Prospects first")],
    });
  });

  it.each(["", "occupied"])("requires an unused new-parent ID (%s)", (parentId) => {
    expect(buildFollowupPlan(plan(), context({ parentId, tasks: [parent({ id: "occupied", task: "Other work" })] })).canWrite).toBe(false);
  });

  it("rejects an invalid reference day rather than silently missing past dates", () => {
    expect(buildFollowupPlan(plan(), context({ today: "tomorrow" })).canWrite).toBe(false);
  });
});

describe("adding steps to an existing follow-up", () => {
  it("adds only new subtasks and an end-date extension, preserving the parent's other fields and every old step", () => {
    const oldParent = parent({ taskGroup: "Original group" });
    const oldStep = parent({ id: "old-step", parentId: oldParent.id, order: 900, completed: true, startDate: "2026-10-02", endDate: "2026-10-03" });
    const tasks = [oldParent, oldStep];
    const before = structuredClone(tasks);
    const input = { ...plan(), existingParentId: oldParent.id };
    const result = buildFollowupPlan(input, context({ tasks }));
    expect(result).toMatchObject({ canWrite: true, parentId: oldParent.id, parent: null, parentUpdate: { endDate: "2027-02-08" } });
    expect(result.subtasks).toHaveLength(6);
    for (const [i, child] of result.subtasks.entries()) {
      expect(child).toMatchObject({ parentId: oldParent.id, taskGroup: "Original group", linkedClientId: company.id, responsible: [], informed: [], order: 901 + i });
      expect(child.startDate).toBe(fixture.steps[i].startDate);
      expect(child.endDate).toBe(fixture.steps[i].endDate);
    }
    expect(tasks).toEqual(before);
    expect(input).toEqual({ ...fixture, existingParentId: oldParent.id });
  });

  it.each(["2027-02-08", "2027-05-01"])("never shortens or rewrites a deadline already covering the plan (%s)", (endDate) => {
    const oldParent = parent({ endDate });
    const result = buildFollowupPlan({ ...plan(), existingParentId: oldParent.id }, context({ tasks: [oldParent] }));
    expect(result.canWrite).toBe(true);
    expect(result.parentUpdate).toBeNull();
  });

  it("fills an existing parent's empty deadline without touching its start", () => {
    const oldParent = parent({ endDate: "" });
    expect(buildFollowupPlan({ ...plan(), existingParentId: oldParent.id }, context({ tasks: [oldParent] })).parentUpdate).toEqual({ endDate: "2027-02-08" });
    expect(oldParent.startDate).toBe("2026-10-01");
  });

  it.each([
    { linkedClientId: 123 }, { completed: true }, { parentId: "another-parent" }, { task: "Different task" },
  ])("refuses an existing target from a different company, a completed parent, a subtask or a different title (%j)", (overrides) => {
    const result = buildFollowupPlan({ ...plan(), existingParentId: "existing-parent" }, context({ tasks: [parent(overrides)] }));
    expect(result).toMatchObject({ canWrite: false, parent: null, parentUpdate: null, subtasks: [], errors: [expect.stringContaining("open follow-up parent")] });
  });

  it("refuses a missing existing parent", () => {
    expect(buildFollowupPlan({ ...plan(), existingParentId: "gone" }, context()).canWrite).toBe(false);
  });

  it("requires the selected existing parent when multiple follow-ups exist", () => {
    const tasks = [parent(), parent({ id: "second-parent" })];
    expect(buildFollowupPlan(plan(), context({ tasks })).canWrite).toBe(false);
    const result = buildFollowupPlan({ ...plan(), existingParentId: "second-parent" }, context({ tasks }));
    expect(result.parentId).toBe("second-parent");
    expect(result.subtasks.every((s) => s.parentId === "second-parent")).toBe(true);
  });

  it("allows a new parent when the previous follow-up is completed", () => {
    expect(buildFollowupPlan(plan(), context({ tasks: [parent({ completed: true })] }))).toMatchObject({ canWrite: true, warnings: [] });
  });
});

describe("a repeated add (retry)", () => {
  const savedTasks = (parentTask: Task, steps = fixture.steps) => [parentTask, ...steps.map((step, i) => parent({
    id: `saved-${i}`, task: step.name, parentId: parentTask.id, startDate: step.startDate, endDate: step.endDate, order: 600 + i,
  }))];

  it("returns the follow-up already holding every step instead of a second parent or duplicate steps", () => {
    const tasks = savedTasks(parent());
    for (const input of [plan(), { ...plan(), existingParentId: "existing-parent" }]) {
      const result = buildFollowupPlan(input, context({ tasks }));
      expect(result).toMatchObject({ canWrite: false, errors: [], parent: null, subtasks: [], parentId: "existing-parent" });
      expect(result.alreadySaved).toEqual({ parentId: "existing-parent", subtaskIds: fixture.steps.map((_, i) => `saved-${i}`) });
      expect(result.warnings.map((w) => w.code)).toEqual(["already-saved"]);
    }
  });

  it("matches names ignoring case and spacing, but not a changed date or a missing step", () => {
    const renamed = fixture.steps.map((step) => ({ ...step, name: `  ${step.name.toUpperCase()} ` }));
    expect(buildFollowupPlan({ ...plan(), steps: renamed }, context({ tasks: savedTasks(parent()) })).alreadySaved).not.toBeNull();
    const moved = fixture.steps.map((step, i) => (i === 5 ? { ...step, endDate: "2027-02-09" } : step));
    expect(buildFollowupPlan({ ...plan(), steps: moved }, context({ tasks: savedTasks(parent()) })).alreadySaved).toBeNull();
    const partial = savedTasks(parent(), fixture.steps.slice(0, 5));
    const result = buildFollowupPlan({ ...plan(), existingParentId: "existing-parent" }, context({ tasks: partial }));
    expect(result).toMatchObject({ alreadySaved: null, canWrite: true });
    expect(result.subtasks).toHaveLength(6);
  });

  it("needs one saved subtask per step when two steps share a name and dates", () => {
    const twice = [fixture.steps[0], fixture.steps[0]];
    const once = savedTasks(parent(), [fixture.steps[0]]);
    expect(buildFollowupPlan({ ...plan(), steps: twice, existingParentId: "existing-parent" }, context({ tasks: once })).alreadySaved).toBeNull();
  });
});
