import { describe, expect, it } from "vitest";
import {
  TASK_PLAN_CLIENT, TASK_PLAN_CLIENT_NEW, TASK_PLAN_CLIENT_PARENT, TASK_PLAN_COMPLETED_PARENT,
  TASK_PLAN_DEAL_SKILL, TASK_PLAN_INTERNAL_APPEND, TASK_PLAN_INTERNAL_NEW, TASK_PLAN_INTERNAL_PARENT,
  TASK_PLAN_LONG_TEXT, TASK_PLAN_PARKED_PARENT, TASK_PLAN_PROSPECT, TASK_PLAN_PROSPECT_NEW,
  TASK_PLAN_PROSPECT_PARENT, TASK_PLAN_TODAY,
} from "../tests/fixtures/taskPlan";
import type { PipelineEntry } from "./clientTypes";
import { DEAL_DONE_STATUS } from "./companies";
import { findCompanies } from "./followupPlan";
import { companiesById, isDealDone, kindOf } from "./kinds";
import { buildTaskPlan, findTaskDestinations, MAX_TASK_PLAN_INPUT_BYTES, MAX_TASK_PLAN_STEPS, TASK_PLAN_CALENDAR_OFF, validateTaskPlan } from "./taskPlan";
import type { TaskDestinationContext, TaskPlanContext, TaskPlanInput } from "./taskPlan";
import type { Task } from "./types";

const plan = () => structuredClone(TASK_PLAN_PROSPECT_NEW);
const oneStep = (changes: Record<string, unknown>) => ({ ...plan(), steps: [{ ...plan().steps[0], ...changes }] });
const rejects = (input: unknown, field: string) => {
  const result = validateTaskPlan(input);
  expect(result.plan).toBeNull();
  expect(result.errors.some((error) => error.includes(field))).toBe(true);
};

describe("M01 per-step calendar choices", () => {
  const step = { name: "Confirm the meeting", startDate: "2026-12-05", endDate: "2026-12-05", keyPoints: "Keep these notes." };
  const input = (calendar: unknown) => ({ ...TASK_PLAN_INTERNAL_NEW, steps: [{ ...step, calendar }] });
  const context: TaskPlanContext = { tasks: [], today: TASK_PLAN_TODAY, parentId: "calendar-preview", calendarEnabled: true };

  it.each([{}, { startTime: "14:00", endTime: "15:00" }])("validates and preserves a calendar choice (%j)", (calendar) => {
    const result = validateTaskPlan(input(calendar));
    expect(result.errors).toEqual([]);
    expect(result.plan?.steps[0].calendar).toEqual(calendar);
  });

  it("normalizes empty time inputs to an all-day mark and accepts overnight meetings on separate days", () => {
    expect(validateTaskPlan(input({ startTime: " ", endTime: "" })).plan?.steps[0].calendar).toEqual({});
    const overnight = { ...step, endDate: "2026-12-06", calendar: { startTime: "23:00", endTime: "01:00" } };
    expect(validateTaskPlan({ ...TASK_PLAN_INTERNAL_NEW, steps: [overnight] }).errors).toEqual([]);
  });

  it.each([
    null, [], "14:00", { attendees: [] }, { calendarSync: {} },
    { startTime: 14, endTime: "15:00" }, { startTime: "14:00", endTime: null },
    { startTime: "14:00" }, { endTime: "15:00" }, { startTime: "", endTime: "15:00" },
    { startTime: "24:00", endTime: "25:00" }, { startTime: "2:00", endTime: "15:00" },
    { startTime: "14:60", endTime: "15:00" }, { startTime: "14:00", endTime: "14:00" },
    { startTime: "15:00", endTime: "14:00" },
  ])("rejects invalid or non-strict calendar input without dropping the step (%j)", (calendar) => {
    const result = validateTaskPlan(input(calendar));
    expect(result.plan).toBeNull();
    expect(result.errors.join(" ")).toContain("plan.steps[0].calendar");
    // Time errors identify the affected action as well as its field.
    if (calendar && typeof calendar === "object" && "startTime" in calendar) {
      expect(result.errors.join(" ")).toContain(step.name);
    }
  });

  it("previews task-only, all-day and timed steps together without changing notes or the main task", () => {
    const selected: TaskPlanInput = { ...TASK_PLAN_INTERNAL_NEW, steps: [
      { ...step, name: "Task only" },
      { ...step, name: "All-day visit", calendar: {} },
      { ...step, name: "Timed meeting", calendar: { startTime: "14:00", endTime: "15:00" } },
    ] };
    const before = structuredClone(selected);
    const shown = buildTaskPlan(selected, context);
    expect(shown.canWrite).toBe(true);
    expect(shown.calendarPreview).toEqual([
      'Step 1 "Task only": Task only',
      'Step 2 "All-day visit": Team calendar: all day',
      'Step 3 "Timed meeting": Team calendar: 14:00–15:00',
    ]);
    expect(shown.parent).not.toHaveProperty("calendar");
    expect(shown.subtasks[0]).not.toHaveProperty("calendar");
    expect(shown.subtasks[1].calendar).toEqual({});
    expect(shown.subtasks[2].calendar).toEqual(selected.steps[2].calendar);
    expect(shown.subtasks.map((task) => task.keyPoints)).toEqual(Array(3).fill(step.keyPoints));
    shown.subtasks[2].calendar!.startTime = "10:00";
    expect(shown.plan?.steps[2].calendar?.startTime).toBe("14:00");
    expect(selected).toEqual(before);
  });

  it.each([undefined, false])("refuses marked steps when calendar writes are off (%s)", (calendarEnabled) => {
    const shown = buildTaskPlan(input({}), { ...context, calendarEnabled });
    expect(shown.errors).toEqual([TASK_PLAN_CALENDAR_OFF]);
    expect(shown.canWrite).toBe(false);
    expect(shown.parent).toBeNull();
    expect(shown.subtasks).toEqual([]);
    expect(shown).not.toHaveProperty("calendarPreview");
  });

  it("keeps task-only plans available while calendar writes are off", () => {
    const shown = buildTaskPlan(TASK_PLAN_INTERNAL_NEW, { ...context, calendarEnabled: false });
    expect(shown.canWrite).toBe(true);
    expect(shown).not.toHaveProperty("calendarPreview");
    expect(shown.plan?.steps.every((step) => !Object.hasOwn(step, "calendar"))).toBe(true);
  });
});

const destinationContext = (overrides: Partial<TaskDestinationContext> = {}): TaskDestinationContext => ({
  companies: [TASK_PLAN_PROSPECT, TASK_PLAN_CLIENT],
  tasks: [TASK_PLAN_PROSPECT_PARENT, TASK_PLAN_CLIENT_PARENT, TASK_PLAN_INTERNAL_PARENT],
  today: TASK_PLAN_TODAY, ...overrides,
});

describe("task destination company discovery", () => {
  it.each([
    "LENTERA CONTOH FIKTIF", "pt. Lentera Contoh Fiktif tbk.", "P.T. Lentera-Contoh, Fiktif Tbk",
    "Lentera.Contoh/Fiktif", "  Lentera   Contoh Fiktif  ", "Lentera Contoh Fik",
  ])("matches exact, partial and legal-suffix company names (%s)", (companyQuery) => {
    const result = findTaskDestinations({ kind: "prospect", companyQuery }, destinationContext());
    expect(result.companies).toEqual([{
      id: TASK_PLAN_PROSPECT.id, name: TASK_PLAN_PROSPECT.company, kind: "prospect", group: "active",
      status: "", pic: TASK_PLAN_PROSPECT.pic, eligible: true,
    }]);
    expect(result.errors).toEqual([]);
    expect(result.parents).toEqual([]); // Even a single exact match needs explicit selection.
    expect(result.guidance.join(" ")).toContain("numeric ID");
  });

  it("ranks exact, prefix and substring matches stably and reports truncation", () => {
    const companies = ["Other Lentera", "Lentera West", "Lentera", "Another Lentera", "Lentera East", "More Lentera", "Unrelated"]
      .map((company, id) => ({ id, company }));
    const query = { kind: "prospect", companyQuery: "Lentera" };
    const result = findTaskDestinations(query, destinationContext({ companies }));
    expect(result.companies.map(({ name }) => name)).toEqual([
      "Lentera", "Lentera East", "Lentera West", "Another Lentera", "More Lentera",
    ]);
    expect(result).toEqual(findTaskDestinations(query, destinationContext({ companies: [...companies].reverse() })));
    expect(result.hasMore).toEqual({ companies: true, parents: false });
    expect(result.guidance.join(" ")).toContain("refine companyQuery");
    expect(result.parents).toEqual([]);
  });

  it("keeps duplicate names distinct, breaks normalized-name ties by numeric ID and lets ID disambiguate", () => {
    const companies = [
      { id: 10, company: "Lentera" }, { id: 2, company: "PT Lentera Tbk" }, { id: 3, company: "Lentera" },
    ];
    const result = findTaskDestinations({ kind: "prospect", companyQuery: "Lentera" }, destinationContext({ companies }));
    expect(result.companies.map(({ id }) => id)).toEqual([2, 3, 10]);
    expect(result.parents).toEqual([]);
    const task = { ...TASK_PLAN_PROSPECT_PARENT, linkedClientId: 3 };
    const selected = findTaskDestinations({ kind: "prospect", companyId: 3 }, destinationContext({ companies, tasks: [task] }));
    expect(selected.companies.map(({ id }) => id)).toEqual([3]);
    expect(selected.parents.map(({ id }) => id)).toEqual([task.id]);
    expect(result.hasMore.companies).toBe(false);
  });

  it("does not remove PT/Tbk inside real words", () => {
    const context = destinationContext({ companies: [{ id: 1, company: "PTara Tbkarya" }] });
    expect(findTaskDestinations({ kind: "prospect", companyQuery: "PTara Tbkarya" }, context).companies).toHaveLength(1);
    expect(findTaskDestinations({ kind: "prospect", companyQuery: "pt ara tbk arya" }, context).companies).toEqual([]);
  });

  it.each(["PT. Tbk", "???", "Missing"])("returns refine guidance for unmatched or suffix-only queries (%s)", (companyQuery) => {
    expect(findTaskDestinations({ kind: "prospect", companyQuery }, destinationContext())).toMatchObject({
      companies: [], parents: [], hasMore: { companies: false, parents: false }, errors: [],
      guidance: [expect.stringContaining("Refine companyQuery")],
    });
  });

  it.each(["prospect", "client"])("reports wrong-category matches as ineligible for %s", (kind) => {
    const wrongCompany = kind === "prospect" ? TASK_PLAN_CLIENT : TASK_PLAN_PROSPECT;
    const queryResult = findTaskDestinations({ kind, companyQuery: wrongCompany.company }, destinationContext());
    expect(queryResult.companies).toMatchObject([{
      id: wrongCompany.id, kind: kind === "prospect" ? "client" : "prospect", eligible: false,
      reason: expect.stringContaining("belongs to"),
    }]);
    const selectedResult = findTaskDestinations({ kind, companyId: wrongCompany.id }, destinationContext());
    expect(selectedResult.parents).toEqual([]);
    expect(selectedResult.guidance.join(" ")).toContain("no company was moved");
  });

  it("uses companyGroup precedence for raw/held companies even when status says deal done", () => {
    const companies: PipelineEntry[] = [
      { ...TASK_PLAN_PROSPECT, id: 1, _raw: true, _hold: true, status: DEAL_DONE_STATUS },
      { ...TASK_PLAN_PROSPECT, id: 2, _hold: true, status: DEAL_DONE_STATUS },
      { ...TASK_PLAN_PROSPECT, id: 3, parkedAt: 1 },
      { ...TASK_PLAN_PROSPECT, id: 4, status: DEAL_DONE_STATUS },
    ];
    const result = findTaskDestinations({ kind: "prospect", companyQuery: "Lentera" }, destinationContext({ companies }));
    expect(result.companies.map(({ id, kind, group, eligible }) => ({ id, kind, group, eligible }))).toEqual([
      { id: 1, kind: "prospect", group: "toApproach", eligible: true },
      { id: 2, kind: "prospect", group: "noOrNotNow", eligible: true },
      { id: 3, kind: "prospect", group: "active", eligible: true },
      { id: 4, kind: "client", group: "dealDone", eligible: false },
    ]);
  });

  it("never falls back to a name when the selected company ID is missing", () => {
    const result = findTaskDestinations({ kind: "prospect", companyId: 999, companyQuery: "Lentera" }, destinationContext());
    expect(result.companies).toEqual([]);
    expect(result.parents).toEqual([]);
    expect(result.errors).toEqual([expect.stringContaining("Company 999 was not found")]);
  });

  it("uses an explicit ID over an old query and accepts company ID zero", () => {
    const company = { ...TASK_PLAN_PROSPECT, id: 0 };
    const task = { ...TASK_PLAN_PROSPECT_PARENT, linkedClientId: 0 };
    const result = findTaskDestinations({ kind: "prospect", companyId: 0, companyQuery: "unrelated" }, destinationContext({ companies: [company], tasks: [task] }));
    expect(result.companies).toMatchObject([{ id: 0 }]);
    expect(result.parents).toMatchObject([{ id: task.id, companyId: 0 }]);
    expect(result.errors).toEqual([]);
  });

  it("keeps the legacy company result shape and ranking intact", () => {
    expect(findCompanies("Lentera", [TASK_PLAN_PROSPECT], [TASK_PLAN_PROSPECT_PARENT])).toEqual([{
      id: TASK_PLAN_PROSPECT.id, name: TASK_PLAN_PROSPECT.company, group: "Active", pic: TASK_PLAN_PROSPECT.pic, followups: [],
    }]);
  });
});

describe("task destination parent discovery", () => {
  const destinations = [
    { query: { kind: "prospect", companyId: TASK_PLAN_PROSPECT.id }, parent: TASK_PLAN_PROSPECT_PARENT },
    { query: { kind: "client", companyId: TASK_PLAN_CLIENT.id }, parent: TASK_PLAN_CLIENT_PARENT },
    { query: { kind: "internal" }, parent: TASK_PLAN_INTERNAL_PARENT },
  ];

  it.each(destinations)("returns ID, category, company, group and dates for $query.kind without selecting a parent", ({ query, parent }) => {
    const result = findTaskDestinations(query, destinationContext());
    const company = query.kind === "prospect" ? TASK_PLAN_PROSPECT : query.kind === "client" ? TASK_PLAN_CLIENT : undefined;
    expect(result.parents).toEqual([{
      id: parent.id, name: parent.task, kind: query.kind,
      ...(company && { companyId: company.id, companyName: company.company }),
      taskGroup: parent.taskGroup, taskType: parent.taskType, startDate: parent.startDate, endDate: parent.endDate,
    }]);
    expect(result.guidance.join(" ")).toContain("no main task was selected");
    expect(result.hasMore).toEqual({ companies: false, parents: false });
    expect(result.errors).toEqual([]);
  });

  it.each(destinations)("excludes completed, parked, nested, orphan-linked and different-company tasks for $query.kind", ({ query, parent }) => {
    const tasks = [
      parent,
      { ...parent, id: "completed", completed: true, parkedAt: 1 },
      { ...parent, id: "parked-tomorrow", parkedAt: 1, parkedUntil: "2026-11-11" },
      { ...parent, id: "parked-indefinitely", parkedAt: 1 },
      { ...parent, id: "child", parentId: parent.id },
      { ...parent, id: "orphan-child", parentId: "missing-parent" },
      { ...parent, id: "empty-parent", parentId: "" },
      { ...parent, id: "self-parent", parentId: "self-parent" },
      { ...parent, id: "orphan-company", linkedClientId: 999 },
      { ...parent, id: "other-company", linkedClientId: query.kind === "client" ? TASK_PLAN_PROSPECT.id : TASK_PLAN_CLIENT.id },
    ];
    if (query.kind !== "internal") tasks.push({ ...parent, id: "unlinked", linkedClientId: undefined });
    const result = findTaskDestinations(query, destinationContext({ tasks }));
    expect(result.parents.map(({ id }) => id)).toEqual([parent.id]);
  });

  it.each(destinations)("includes returning-today/yesterday tasks and evaluates parking using the supplied WIB day for $query.kind", ({ query, parent }) => {
    const tasks = [
      { ...parent, id: "back-today", parkedAt: 1, parkedUntil: TASK_PLAN_TODAY },
      { ...parent, id: "back-yesterday", parkedAt: 1, parkedUntil: "2026-11-09" },
      { ...parent, id: "back-tomorrow", parkedAt: 1, parkedUntil: "2026-11-11" },
      { ...parent, id: "indefinite", parkedAt: 1 },
    ];
    const ids = (today: string) => findTaskDestinations(query, destinationContext({ tasks, today })).parents.map(({ id }) => id);
    expect(ids(TASK_PLAN_TODAY)).toEqual(["back-today", "back-yesterday"]);
    expect(ids("2026-11-11")).toEqual(["back-today", "back-tomorrow", "back-yesterday"]);
  });

  it("searches task titles with exact/prefix/substring ranking, stable duplicate IDs and refinement", () => {
    const names = ["Other Handover", "Handover West", "Handover", "Another Handover", "Handover East", "More Handover", "Unrelated", "Handover"];
    const tasks = names.map((task, i) => ({ ...TASK_PLAN_INTERNAL_PARENT, id: `parent-${i}`, task, order: 100 - i }));
    const query = { kind: "internal", parentQuery: "  HANDOVER  " };
    const result = findTaskDestinations(query, destinationContext({ tasks }));
    expect(result.parents.map(({ id }) => id)).toEqual(["parent-2", "parent-7", "parent-4", "parent-1", "parent-3"]);
    expect(result).toEqual(findTaskDestinations(query, destinationContext({ tasks: [...tasks].reverse() })));
    expect(result.hasMore).toEqual({ companies: false, parents: true });
    expect(result.guidance.join(" ")).toContain("refine parentQuery");
    const refined = findTaskDestinations({ kind: "internal", parentQuery: "handover west" }, destinationContext({ tasks }));
    expect(refined.parents.map(({ id }) => id)).toEqual(["parent-1"]);
    expect(refined.hasMore.parents).toBe(false);
  });

  it("returns up to five stable parents with no query and handles absent optional context fields", () => {
    const tasks: Task[] = Array.from({ length: 6 }, (_, i) => ({
      ...TASK_PLAN_INTERNAL_PARENT, id: `parent-${i}`, task: `Handover ${i}`, taskGroup: undefined, taskType: undefined,
    }));
    const result = findTaskDestinations({ kind: "internal" }, { tasks: [...tasks].reverse(), today: TASK_PLAN_TODAY });
    expect(result.parents.map(({ id }) => id)).toEqual(["parent-0", "parent-1", "parent-2", "parent-3", "parent-4"]);
    expect(result.parents[0]).toMatchObject({ taskGroup: "", taskType: "" });
    expect(result.hasMore.parents).toBe(true);
    expect(findTaskDestinations({ kind: "internal" }, destinationContext({ tasks: tasks.slice(0, 5) })).hasMore.parents).toBe(false);
  });

  it.each([{ tasks: [] }, { tasks: [TASK_PLAN_INTERNAL_PARENT] }])("offers refinement or a new title when no eligible parent matches (%#)", ({ tasks }) => {
    const result = findTaskDestinations({ kind: "internal", parentQuery: "Missing" }, destinationContext({ tasks }));
    expect(result.parents).toEqual([]);
    expect(result.hasMore.parents).toBe(false);
    expect(result.guidance.join(" ")).toContain("new main task");
  });

  it("does not even access company data for Internal and rejects orphan-linked work", () => {
    const context = destinationContext({ tasks: [TASK_PLAN_INTERNAL_PARENT, { ...TASK_PLAN_INTERNAL_PARENT, id: "orphan", linkedClientId: 999 }] });
    Object.defineProperty(context, "companies", { get: () => { throw new Error("Company database unavailable"); } });
    const result = findTaskDestinations({ kind: "internal" }, context);
    expect(result.parents.map(({ id }) => id)).toEqual([TASK_PLAN_INTERNAL_PARENT.id]);
    expect(result.companies).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  it("leaves frozen records and their order unchanged and returns detached summaries", () => {
    const context = structuredClone(destinationContext());
    const before = structuredClone(context);
    for (const task of context.tasks) {
      Object.freeze(task.responsible);
      Object.freeze(task.informed);
      Object.freeze(task);
    }
    context.companies?.forEach(Object.freeze);
    Object.freeze(context.tasks);
    Object.freeze(context.companies);
    Object.freeze(context);
    const result = findTaskDestinations({ kind: "prospect", companyId: TASK_PLAN_PROSPECT.id }, context);
    result.companies[0].name = "Changed summary";
    result.parents[0].startDate = "2099-01-01";
    expect(context).toEqual(before);
  });
});

describe("task destination query guards", () => {
  it.each([null, [], 42, "internal", { kind: "other" }, {}, { kind: "prospect" }, { kind: "client" },
    { kind: "internal", unsupported: true },
  ])("rejects invalid or incomplete queries without candidates (%j)", (query) => {
    const result = findTaskDestinations(query, destinationContext());
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.companies).toEqual([]);
    expect(result.parents).toEqual([]);
  });

  it.each(["", " \n ", null, 42, undefined])("rejects invalid supplied name queries (%j)", (value) => {
    for (const query of [{ kind: "prospect", companyQuery: value }, { kind: "internal", parentQuery: value }]) {
      expect(findTaskDestinations(query, destinationContext()).errors.length).toBeGreaterThan(0);
    }
  });

  it.each(["9201", -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, undefined, null])("rejects unsafe or nonnumeric selected company IDs (%j)", (companyId) => {
    const result = findTaskDestinations({ kind: "prospect", companyId, companyQuery: "Lentera" }, destinationContext());
    expect(result.errors).toEqual([expect.stringContaining("companyId")]);
    expect(result.companies).toEqual([]);
    expect(result.parents).toEqual([]);
  });

  it.each([{ companyId: TASK_PLAN_PROSPECT.id }, { companyQuery: "Lentera" }, { companyId: undefined }, { companyQuery: undefined },
    { companyId: TASK_PLAN_PROSPECT.id, companyQuery: "Lentera" },
  ])("forbids either company field on Internal even when undefined (%j)", (fields) => {
    const result = findTaskDestinations({ kind: "internal", ...fields }, destinationContext());
    expect(result.errors.join(" ")).toContain("Internal work forbids");
    expect(result.companies).toEqual([]);
    expect(result.parents).toEqual([]);
  });
});

describe("general task-plan inputs", () => {
  const forms: TaskPlanInput[] = [
    TASK_PLAN_PROSPECT_NEW, TASK_PLAN_CLIENT_NEW, TASK_PLAN_INTERNAL_NEW,
    { kind: "prospect", companyId: TASK_PLAN_PROSPECT.id, existingParentId: TASK_PLAN_PROSPECT_PARENT.id, steps: plan().steps },
    { kind: "client", companyId: TASK_PLAN_CLIENT.id, existingParentId: TASK_PLAN_CLIENT_PARENT.id, steps: plan().steps },
    TASK_PLAN_INTERNAL_APPEND,
  ];
  it.each(forms)("accepts new/append destination $kind ($existingParentId)", (input) => {
    expect(validateTaskPlan(input)).toEqual({ plan: input, errors: [] });
  });

  it("keeps one-day actions and year-crossing ranges exactly as supplied", () => {
    const result = validateTaskPlan(plan()).plan!;
    expect(result.steps.map(({ startDate, endDate }) => [startDate, endDate])).toEqual([
      ["2026-12-28", "2027-01-04"], ["2027-01-05", "2027-01-05"],
    ]);
  });

  it("trims surrounding whitespace but preserves multiline prose, indentation and owner names without mutating input", () => {
    const input = {
      kind: " prospect ", companyId: TASK_PLAN_PROSPECT.id,
      newParent: { title: "  Fictional plan \n", taskType: " Follow Up ", keyPoints: ` \n${TASK_PLAN_LONG_TEXT}\n `, sourceUrl: " https://example.com/source " },
      steps: [{ name: "  Confirm scope \n", startDate: " 2026-12-28 ", endDate: " 2027-01-04 ", keyPoints: `\n${TASK_PLAN_LONG_TEXT}\n`, owners: "  Fictional Nara\n  with Fictional Bima  " }],
    };
    const before = structuredClone(input);
    expect(validateTaskPlan(input)).toEqual({ plan: {
      kind: "prospect", companyId: TASK_PLAN_PROSPECT.id,
      newParent: { title: "Fictional plan", taskType: "Follow Up", keyPoints: TASK_PLAN_LONG_TEXT, sourceUrl: "https://example.com/source" },
      steps: [{ name: "Confirm scope", startDate: "2026-12-28", endDate: "2027-01-04", keyPoints: TASK_PLAN_LONG_TEXT, owners: "Fictional Nara\n  with Fictional Bima" }],
    }, errors: [] });
    expect(input).toEqual(before);
  });

  it("does not invent optional prose, owners, dates or task types", () => {
    const input = { kind: "internal", newParent: { title: "Handover" }, steps: [{ name: "Send notes", startDate: "2026-12-31", endDate: "2026-12-31" }] };
    expect(validateTaskPlan(input)).toEqual({ plan: input, errors: [] });
    expect(validateTaskPlan(oneStep({ keyPoints: "  ", owners: "  " })).plan?.steps[0]).toMatchObject({ keyPoints: "", owners: "" });
  });

  it.each([null, undefined, [], "plan", 42, new Date()])("rejects non-object input %j", (input) => {
    rejects(input, "plan");
  });
  it.each([undefined, "", "external", 42, null])("rejects an invalid category %j", (kind) => {
    rejects({ ...plan(), kind }, "plan.kind");
  });
  it.each(["prospect", "client"])("requires a selected safe numeric company ID for %s", (kind) => {
    const withoutCompany: Record<string, unknown> = { ...plan() };
    delete withoutCompany.companyId;
    rejects({ ...withoutCompany, kind }, "plan.companyId");
    for (const companyId of [undefined, null, "9201", -1, 1.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      rejects({ ...plan(), kind, companyId }, "plan.companyId");
    }
    for (const companyId of [0, Number.MAX_SAFE_INTEGER]) {
      expect(validateTaskPlan({ ...plan(), kind, companyId }).errors).toEqual([]);
    }
  });
  it.each([9201, null, undefined, ""])("forbids any company ID field on Internal (%j)", (companyId) => {
    rejects({ ...TASK_PLAN_INTERNAL_NEW, companyId }, "plan.companyId");
  });

  it("rejects both or neither main-task selection", () => {
    rejects({ ...plan(), existingParentId: "existing-task" }, "exactly one");
    const withoutParent: Record<string, unknown> = { ...plan() };
    delete withoutParent.newParent;
    rejects(withoutParent, "exactly one");
    rejects({ ...withoutParent, newParent: undefined }, "plan.newParent");
  });
  it.each([null, "title", [], 5])("requires a newParent object (%j)", (newParent) => {
    rejects({ ...plan(), newParent }, "plan.newParent");
  });
  it.each(["", " \n ", undefined, null, 42])("requires a nonblank main-task title (%j)", (title) => {
    rejects({ ...plan(), newParent: { title } }, "plan.newParent.title");
  });
  it.each(["", " ", null, 42, {}, ".", "..", "tasks/parent", "parent/child", "a%/b", "__reserved__", "x".repeat(1501), "界".repeat(501), "\ud800"])("rejects invalid/nested task ID case %#", (existingParentId) => {
    rejects({ ...TASK_PLAN_INTERNAL_APPEND, existingParentId }, "plan.existingParentId");
  });
  it.each(["document-id_123", "任務-一", "界".repeat(500)])("accepts a valid task document ID case %#", (existingParentId) => {
    expect(validateTaskPlan({ ...TASK_PLAN_INTERNAL_APPEND, existingParentId }).errors).toEqual([]);
  });

  it("rejects unknown fields at every level instead of silently discarding them", () => {
    rejects({ ...plan(), companyQuery: "a different company" }, "plan.companyQuery");
    rejects({ ...plan(), newParent: { title: "Title", parentId: "nested" } }, "plan.newParent.parentId");
    for (const field of ["parentId", "steps", "responsible", "informed", "completed", "taskType", "sourceUrl"]) {
      rejects(oneStep({ [field]: "unsupported" }), `plan.steps[0].${field}`);
    }
  });
  it.each([[], undefined, null, {}, [null], Array(1), Array(500).fill({ name: "Confirm", startDate: "2026-12-31", endDate: "2026-12-31" })])("rejects empty/invalid/excessive steps case %#", (steps) => {
    rejects({ ...plan(), steps }, "plan.steps");
  });
  it("allows all 499 steps within the byte limit", () => {
    const step = { name: "Confirm", startDate: "2026-12-31", endDate: "2026-12-31" };
    const result = validateTaskPlan({ ...TASK_PLAN_INTERNAL_NEW, steps: Array(MAX_TASK_PLAN_STEPS).fill(step) });
    expect(result.errors).toEqual([]);
    expect(result.plan?.steps).toHaveLength(499);
  });
  it.each(["name", "startDate", "endDate"])("names the offending step and missing %s", (field) => {
    for (const value of ["", " \n ", undefined, null, 42]) rejects(oneStep({ [field]: value }), `plan.steps[0].${field}`);
  });
  it.each(["keyPoints", "owners"])("requires optional step %s to be text when present", (field) => {
    for (const value of [null, 42, ["Fictional owner"], {}]) rejects(oneStep({ [field]: value }), `plan.steps[0].${field}`);
  });
  it("requires optional parent Key points to be text", () => {
    rejects({ ...plan(), newParent: { title: "Title", keyPoints: 42 } }, "plan.newParent.keyPoints");
  });

  it.each(["11/10/2026", "2026-1-10", "next Friday", "11-10", "2026-02-29", "2100-02-29", "2028-02-30", "2026-04-31", "2026-13-01", "2026-00-10", "2026-11-00", "2026-11-10T00:00:00Z"])("rejects impossible or inexact dates (%s)", (date) => {
    rejects(oneStep({ startDate: date }), "plan.steps[0].startDate");
    rejects(oneStep({ endDate: date }), "plan.steps[0].endDate");
  });
  it.each(["2028-02-29", "2000-02-29", "2026-11-09"])("accepts real leap days and past dates unchanged (%s)", (date) => {
    const result = validateTaskPlan(oneStep({ startDate: date, endDate: date }));
    expect(result.errors).toEqual([]);
    expect(result.plan?.steps[0]).toMatchObject({ startDate: date, endDate: date });
  });
  it.each([["2026-11-12", "2026-11-11"], ["2027-01-01", "2026-12-31"]])("rejects reversed dates %s → %s", (startDate, endDate) => {
    rejects(oneStep({ startDate, endDate }), "plan.steps[0].startDate must not be after plan.steps[0].endDate");
  });
  it("reports all offending fields with the right step index", () => {
    const result = validateTaskPlan({ ...plan(), steps: [plan().steps[0], { name: " ", startDate: "next week", endDate: "2026-02-29" }] });
    expect(result).toEqual({ plan: null, errors: [
      "plan.steps[1].name must be non-empty text.",
      "plan.steps[1].startDate must be a real yyyy-mm-dd calendar day.",
      "plan.steps[1].endDate must be a real yyyy-mm-dd calendar day.",
    ] });
  });

  it.each(["javascript:alert(1)", "file:///tmp/notes", "ftp://example.com", "//example.com", "https:", "https:example.com", "https://", "not a link", "https://example.com/bad link", "https://exam\nple.com", "", null, 42])("rejects invalid/non-http source links (%j)", (sourceUrl) => {
    rejects({ ...plan(), newParent: { title: "Title", sourceUrl } }, "plan.newParent.sourceUrl");
  });
  it.each(["http://example.com", "https://example.com/notes?q=one%20two#steps"])("accepts source link %s unchanged", (sourceUrl) => {
    const result = validateTaskPlan({ ...plan(), newParent: { title: "Title", sourceUrl } });
    expect(result.errors).toEqual([]);
    expect(result.plan?.newParent?.sourceUrl).toBe(sourceUrl);
  });
  it.each(["Trial Pending", "Follow up", "", null, 42])("rejects unsupported main-task types (%j)", (taskType) => {
    rejects({ ...plan(), newParent: { title: "Title", taskType } }, "plan.newParent.taskType");
  });

  it("accepts exactly the byte cap and rejects an extra byte without modifying or truncating input", () => {
    const input = { kind: "internal", newParent: { title: "Title", keyPoints: "" }, steps: [{ name: "Confirm", startDate: "2026-12-31", endDate: "2026-12-31" }] };
    const overhead = Buffer.byteLength(JSON.stringify(input), "utf8");
    input.newParent.keyPoints = "x".repeat(MAX_TASK_PLAN_INPUT_BYTES - overhead);
    expect(Buffer.byteLength(JSON.stringify(input), "utf8")).toBe(MAX_TASK_PLAN_INPUT_BYTES);
    const accepted = validateTaskPlan(input);
    expect(accepted.errors).toEqual([]);
    expect(accepted.plan?.newParent?.keyPoints).toBe(input.newParent.keyPoints);
    input.newParent.keyPoints += "x";
    rejects(input, "plan exceeds");
    expect(input.newParent.keyPoints).toHaveLength(MAX_TASK_PLAN_INPUT_BYTES - overhead + 1);
  });
  it("counts multibyte UTF-8 and pre-trim bytes, rather than only characters or trimmed text", () => {
    for (const keyPoints of ["界".repeat(Math.ceil(MAX_TASK_PLAN_INPUT_BYTES / 3)), " ".repeat(MAX_TASK_PLAN_INPUT_BYTES)]) {
      rejects({ ...TASK_PLAN_INTERNAL_NEW, newParent: { title: "Title", keyPoints } }, "plan exceeds");
    }
  });
  it("returns a plain error for non-JSON input", () => {
    const input: Record<string, unknown> = { ...plan() };
    input.loop = input;
    rejects(input, "JSON-serializable");
    rejects({ ...plan(), companyId: BigInt(9201) }, "JSON-serializable");
  });
});

describe("fictional shared task-plan fixtures", () => {
  it("covers a prospect, Deal done client, Internal and parked/completed parents", () => {
    const companies = companiesById([TASK_PLAN_PROSPECT, TASK_PLAN_CLIENT]);
    expect(isDealDone(TASK_PLAN_PROSPECT)).toBe(false);
    expect(isDealDone(TASK_PLAN_CLIENT)).toBe(true);
    expect(kindOf(TASK_PLAN_PROSPECT_PARENT, companies)).toBe("prospect");
    expect(kindOf(TASK_PLAN_CLIENT_PARENT, companies)).toBe("client");
    expect(kindOf(TASK_PLAN_INTERNAL_PARENT, companies)).toBe("internal");
    expect(TASK_PLAN_PARKED_PARENT.parkedAt).toBeTypeOf("number");
    expect(TASK_PLAN_COMPLETED_PARENT.completed).toBe(true);
    expect(TASK_PLAN_LONG_TEXT.length).toBeGreaterThan(8000);
    expect(TASK_PLAN_LONG_TEXT).toContain("\n  Preserve");
  });
  it("retains the legacy deal-skill title, Follow Up type and explicit detail text", () => {
    const result = validateTaskPlan(structuredClone(TASK_PLAN_DEAL_SKILL));
    expect(result).toEqual({ plan: TASK_PLAN_DEAL_SKILL, errors: [] });
    expect(result.plan?.newParent).toMatchObject({ title: `${TASK_PLAN_PROSPECT.company} Follow Up`, taskType: "Follow Up" });
    for (const label of ["What:", "Why:", "Bring:", "Watch:", "Done when:"]) expect(result.plan?.steps[0].keyPoints).toContain(label);
    expect(result.plan?.steps[0].owners).toBe("Fictional Nara with Fictional contact");
  });
});

const previewContext = (overrides: Partial<TaskPlanContext> = {}): TaskPlanContext => ({
  ...destinationContext(), parentId: "new-fictional-parent", order: 1000, ...overrides,
});
const previewForms = [
  { input: TASK_PLAN_PROSPECT_NEW, parent: TASK_PLAN_PROSPECT_PARENT, category: "Prospects" },
  { input: TASK_PLAN_CLIENT_NEW, parent: TASK_PLAN_CLIENT_PARENT, category: "Clients" },
  { input: TASK_PLAN_INTERNAL_NEW, parent: TASK_PLAN_INTERNAL_PARENT, category: "Internal" },
];

describe("exact read-only task previews", () => {
  it.each(previewForms)("builds exactly one new main task and the selected steps for $category", ({ input, category }) => {
    const preview = buildTaskPlan(input, previewContext());
    const companyId = input.companyId;
    expect(preview.errors).toEqual([]);
    expect(preview.warnings).toEqual([]);
    expect(preview.canWrite).toBe(true);
    expect(preview.parentId).toBe("new-fictional-parent");
    expect(preview.parent).toEqual({
      task: input.newParent!.title, taskType: "Our Action", ...(companyId !== undefined && { linkedClientId: companyId }),
      responsible: [], informed: [], order: 1000,
      startDate: "2026-12-28", endDate: "2027-01-05",
      keyPoints: input.kind === "prospect" ? `${TASK_PLAN_LONG_TEXT}\n\nSource: https://example.com/fictional-pilot` : "",
    } satisfies Partial<Task>);
    expect(preview.subtasks).toEqual(input.steps.map((step, i) => ({
      task: step.name, parentId: preview.parentId, linkedClientId: companyId, taskGroup: undefined,
      responsible: [], informed: [], keyPoints: [step.keyPoints, step.owners && `Owner: ${step.owners}`].filter(Boolean).join("\n\n"),
      startDate: step.startDate, endDate: step.endDate, order: 1001 + i,
    })));
    expect(preview.destination).toMatchObject({
      kind: input.kind, category,
      company: companyId === undefined ? null : { id: companyId },
      parent: { id: preview.parentId, name: input.newParent!.title, mode: "new", startDate: "2026-12-28", endDate: "2027-01-05" },
    });
    expect(preview.preservationNotes.join(" ")).toContain("each subtask keeps its own dates");
  });

  it.each(previewForms)("appends only new subtasks with independent people/dates/text for $category", ({ input, parent, category }) => {
    const oldChild: Task = { ...parent, id: "old-child", parentId: parent.id, completed: true, order: 1500 };
    const tasks = [structuredClone(parent), oldChild];
    const before = structuredClone(tasks);
    const preview = buildTaskPlan({ kind: input.kind, ...(input.companyId !== undefined && { companyId: input.companyId }),
      existingParentId: parent.id, steps: input.steps }, previewContext({ tasks, parentId: undefined }));
    expect(preview.errors).toEqual([]);
    expect(preview.warnings).toEqual([]);
    expect(preview.canWrite).toBe(true);
    expect(preview.parent).toBeNull();
    expect(preview.parentId).toBe(parent.id);
    expect(preview.subtasks).toEqual(input.steps.map((step, i) => ({
      task: step.name, parentId: parent.id, linkedClientId: parent.linkedClientId, taskGroup: parent.taskGroup,
      responsible: [], informed: [], keyPoints: [step.keyPoints, step.owners && `Owner: ${step.owners}`].filter(Boolean).join("\n\n"),
      startDate: step.startDate, endDate: step.endDate, order: 1501 + i,
    })));
    expect(preview.destination).toMatchObject({ kind: input.kind, category,
      parent: { id: parent.id, name: parent.task, mode: "existing", taskGroup: parent.taskGroup, startDate: parent.startDate, endDate: parent.endDate },
    });
    expect(preview).not.toHaveProperty("parentUpdate");
    expect(preview.preservationNotes.join(" ")).toContain("Every existing main-task field stays unchanged");
    expect(tasks).toEqual(before);
  });

  it("uses the full selected range even when steps arrive out of date order", () => {
    const steps = [...TASK_PLAN_INTERNAL_NEW.steps].reverse();
    const preview = buildTaskPlan({ ...TASK_PLAN_INTERNAL_NEW, steps }, previewContext());
    expect(preview.parent).toMatchObject({ startDate: "2026-12-28", endDate: "2027-01-05" });
    expect(preview.subtasks.map((step) => [step.task, step.startDate, step.endDate])).toEqual(steps.map((step) => [step.name, step.startDate, step.endDate]));
  });

  it("preserves deal-skill title/type, detailed prose and the parent's labelled source link", () => {
    const preview = buildTaskPlan(TASK_PLAN_DEAL_SKILL, previewContext());
    expect(preview.parent).toMatchObject({
      task: `${TASK_PLAN_PROSPECT.company} Follow Up`, taskType: "Follow Up",
      keyPoints: `${TASK_PLAN_DEAL_SKILL.newParent!.keyPoints}\n\nSource: https://example.com/fictional-deal`,
    });
    expect(preview.subtasks[0].keyPoints).toBe(`${TASK_PLAN_DEAL_SKILL.steps[0].keyPoints}\n\nOwner: ${TASK_PLAN_DEAL_SKILL.steps[0].owners}`);
    for (const label of ["What:", "Why:", "Bring:", "Watch:", "Done when:"]) expect(preview.subtasks[0].keyPoints).toContain(label);
  });

  it("trims only surrounding whitespace and adds no absent prose, owner, source or assignment", () => {
    const preview = buildTaskPlan({ kind: "internal", newParent: { title: "  Keep the wording  ", keyPoints: "  \n " },
      steps: [{ name: "  Plain action  ", startDate: "2026-11-10", endDate: "2026-11-10" },
        { name: "Notes", startDate: "2026-11-10", endDate: "2026-11-10", keyPoints: " \nFirst line\n  Indented line\n ", owners: " Fictional Nara\n  with Fictional Bima " }],
    }, previewContext());
    expect(preview.parent).toMatchObject({ task: "Keep the wording", keyPoints: "", responsible: [], informed: [] });
    expect(preview.parent).not.toHaveProperty("linkedClientId");
    expect(preview.subtasks[0]).toMatchObject({ task: "Plain action", keyPoints: "", responsible: [], informed: [] });
    expect(preview.subtasks[1].keyPoints).toBe("First line\n  Indented line\n\nOwner: Fictional Nara\n  with Fictional Bima");
    expect(preview.warnings).toEqual([]); // Today is not past.
  });

  it.each([TASK_PLAN_INTERNAL_NEW, TASK_PLAN_INTERNAL_APPEND])("does not access company data for Internal (%#)", (input) => {
    const context = previewContext();
    Object.defineProperty(context, "companies", { get() { throw new Error("company database unavailable"); } });
    expect(buildTaskPlan(input, context).canWrite).toBe(true);
  });

  it("does not mutate frozen inputs, companies, parents or old subtasks; outputs share no mutable records", () => {
    const freeze = <T>(value: T): T => {
      if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
      return value;
    };
    const input = freeze(structuredClone(TASK_PLAN_INTERNAL_APPEND));
    const context = freeze(previewContext());
    const before = structuredClone(context);
    const preview = buildTaskPlan(input, context);
    expect(preview.canWrite).toBe(true);
    preview.plan!.steps[0].keyPoints = "changed result";
    preview.subtasks[0].responsible.push("changed result");
    preview.destination!.parent.name = "changed result";
    expect(context).toEqual(before);
    expect(input).toEqual(TASK_PLAN_INTERNAL_APPEND);
  });
});

describe("task preview destination and input errors", () => {
  const noWrites = (input: unknown, context: TaskPlanContext, error: string) => {
    const preview = buildTaskPlan(input, context);
    expect(preview.errors.join(" ")).toContain(error);
    expect(preview).toMatchObject({ canWrite: false, parent: null, subtasks: [], destination: null });
  };

  it.each([TASK_PLAN_PROSPECT_NEW, TASK_PLAN_CLIENT_NEW])("rejects missing selected companies ($kind)", (input) => {
    noWrites(input, previewContext({ companies: [] }), "was not found");
  });
  it.each([TASK_PLAN_PROSPECT_NEW, TASK_PLAN_CLIENT_NEW])("rejects changed company categories instead of moving them ($kind)", (input) => {
    const company = input.kind === "prospect" ? { ...TASK_PLAN_PROSPECT, status: DEAL_DONE_STATUS } : { ...TASK_PLAN_CLIENT, status: "" };
    noWrites(input, previewContext({ companies: [company] }), "belongs to");
  });
  it("rejects a missing parent without falling back to a similar title", () => {
    noWrites(TASK_PLAN_INTERNAL_APPEND, previewContext({ tasks: [{ ...TASK_PLAN_INTERNAL_PARENT, id: "another-parent" }] }), "was not found");
  });
  it.each([
    { changes: { completed: true }, error: "completed" },
    { changes: { parkedAt: 1 }, error: "parked" },
    { changes: { parkedAt: 1, parkedUntil: "2026-11-11" }, error: "parked" },
    { changes: { parentId: "another-parent" }, error: "top-level" },
    { changes: { parentId: "missing-parent" }, error: "top-level" },
    { changes: { parentId: "" }, error: "top-level" },
    { changes: { linkedClientId: 777777 }, error: "no longer belongs" },
  ])("rejects stale/ineligible selected parents ($error, $changes)", ({ changes, error }) => {
    noWrites(TASK_PLAN_INTERNAL_APPEND, previewContext({ tasks: [{ ...TASK_PLAN_INTERNAL_PARENT, ...changes }] }), error);
  });
  it.each([undefined, TASK_PLAN_CLIENT.id, 777777])("rejects a parent moved from the selected company (%s)", (linkedClientId) => {
    const input = { kind: "prospect", companyId: TASK_PLAN_PROSPECT.id, existingParentId: TASK_PLAN_PROSPECT_PARENT.id, steps: plan().steps };
    noWrites(input, previewContext({ tasks: [{ ...TASK_PLAN_PROSPECT_PARENT, linkedClientId }] }), "no longer belongs");
  });
  it.each(["2026-11-10", "2026-11-09"])("accepts parked tasks whose return day has arrived (%s)", (parkedUntil) => {
    expect(buildTaskPlan(TASK_PLAN_INTERNAL_APPEND, previewContext({ tasks: [{ ...TASK_PLAN_INTERNAL_PARENT, parkedAt: 1, parkedUntil }] })).canWrite).toBe(true);
  });
  it.each(["", "next Friday", "2026-02-29"])("rejects an invalid supplied WIB day (%s)", (today) => {
    noWrites(TASK_PLAN_INTERNAL_NEW, previewContext({ today }), "today");
  });
  it.each([undefined, "", "   ", "tasks/nested", ".", "..", "__reserved__", "x".repeat(1501), "\ud800", "fixture-internal-parent"])("rejects invalid or occupied caller-allocated IDs (%#)", (parentId) => {
    noWrites(TASK_PLAN_INTERNAL_NEW, previewContext({ parentId }), "parentId");
  });
  it.each([NaN, Infinity, Number.MAX_SAFE_INTEGER])("rejects unusable ordering (%s)", (order) => {
    noWrites(TASK_PLAN_INTERNAL_NEW, previewContext({ order }), "Task order");
  });
  it.each([
    { steps: [] },
    { steps: [{ name: "", startDate: "", endDate: "" }] },
    { steps: [TASK_PLAN_INTERNAL_NEW.steps[0], { name: "Bad date", startDate: "2026-02-29", endDate: "2026-12-31" }] },
  ])("exposes no partial writes with zero/all/some invalid steps (%#)", ({ steps }) => {
    noWrites({ ...TASK_PLAN_INTERNAL_NEW, steps }, previewContext(), "plan.steps");
  });
});

describe("stable task preview warnings", () => {
  it("warns about each past date, preserves exact dates and still exposes the confirmable proposal", () => {
    const input = { ...TASK_PLAN_INTERNAL_NEW, steps: [{ name: "Past action", startDate: "2026-11-08", endDate: "2026-11-09" }] };
    const preview = buildTaskPlan(input, previewContext());
    expect(preview.canWrite).toBe(true);
    expect(preview.warnings).toMatchObject([
      { id: "past-date:0:startDate", code: "past-date", step: 0, field: "startDate", message: expect.stringContaining("confirm this exact date") },
      { id: "past-date:0:endDate", code: "past-date", step: 0, field: "endDate" },
    ]);
    expect(preview.subtasks[0]).toMatchObject({ startDate: "2026-11-08", endDate: "2026-11-09" });
  });

  it("warns for steps before/after an existing parent's bounds and never updates that parent", () => {
    const steps = [{ name: "Earlier", startDate: "2026-11-30", endDate: "2026-12-01" },
      { name: "Later", startDate: "2027-01-31", endDate: "2027-02-01" }];
    const preview = buildTaskPlan({ ...TASK_PLAN_INTERNAL_APPEND, steps }, previewContext());
    expect(preview.warnings).toMatchObject([
      { id: "outside-parent-range:0:startDate", code: "outside-parent-range", step: 0, field: "startDate", taskId: TASK_PLAN_INTERNAL_PARENT.id },
      { id: "outside-parent-range:1:endDate", code: "outside-parent-range", step: 1, field: "endDate", taskId: TASK_PLAN_INTERNAL_PARENT.id },
    ]);
    expect(preview.warnings.every((warning) => warning.message.includes("main task's dates will stay unchanged"))).toBe(true);
    expect(preview.parent).toBeNull();
    expect(preview.subtasks.map(({ startDate, endDate }) => [startDate, endDate])).toEqual(steps.map(({ startDate, endDate }) => [startDate, endDate]));
    expect(preview.destination!.parent).toMatchObject({ startDate: "2026-12-01", endDate: "2027-01-31" });
  });

  it.each([
    { startDate: "", endDate: "", warnings: 0 },
    { startDate: "invalid legacy date", endDate: "", warnings: 0 },
    { startDate: "2027-01-01", endDate: "", warnings: 1 },
    { startDate: "", endDate: "2026-12-31", warnings: 3 },
  ])("checks only existing parent boundaries that are real dates (%#)", ({ startDate, endDate, warnings }) => {
    const preview = buildTaskPlan(TASK_PLAN_INTERNAL_APPEND, previewContext({ tasks: [{ ...TASK_PLAN_INTERNAL_PARENT, startDate, endDate }] }));
    expect(preview.canWrite).toBe(true);
    expect(preview.warnings.filter(({ code }) => code === "outside-parent-range")).toHaveLength(warnings);
    expect(preview.destination!.parent).toMatchObject({ startDate, endDate });
  });

  it("keeps all duplicate selected steps including differing notes/owners, asking for an explicit choice", () => {
    const step = TASK_PLAN_INTERNAL_NEW.steps[0];
    const steps = [step, { ...step, name: ` ${step.name.toUpperCase().replaceAll(" ", "  ")} `, keyPoints: "Different notes", owners: "Different owner" }, { ...step }];
    const preview = buildTaskPlan({ ...TASK_PLAN_INTERNAL_NEW, steps }, previewContext());
    expect(preview.warnings).toMatchObject([
      { id: "duplicate-step:1:input:0", code: "duplicate-step", step: 1, relatedStep: 0, message: expect.stringContaining("Ask the owner to choose") },
      { id: "duplicate-step:2:input:0", code: "duplicate-step", step: 2, relatedStep: 0 },
    ]);
    expect(preview.subtasks).toHaveLength(3);
    expect(preview.subtasks[1].keyPoints).toBe("Different notes\n\nOwner: Different owner");
    expect(preview.canWrite).toBe(true);
  });

  it("warns for matching old subtasks regardless of completion, without treating them as a saved operation", () => {
    const step = TASK_PLAN_INTERNAL_NEW.steps[0];
    const matching: Task = { ...TASK_PLAN_INTERNAL_PARENT, id: "child:with:punctuation", parentId: TASK_PLAN_INTERNAL_PARENT.id,
      task: step.name.toUpperCase(), startDate: step.startDate, endDate: step.endDate, completed: true };
    const unrelated = [{ ...matching, id: "different-date", endDate: "2027-01-05" }, { ...matching, id: "another-parent-child", parentId: "other-parent" },
      { ...matching, id: "different-name", task: "A different step" }, { ...matching, id: "grandchild", parentId: matching.id }];
    const preview = buildTaskPlan(TASK_PLAN_INTERNAL_APPEND, previewContext({ tasks: [TASK_PLAN_INTERNAL_PARENT, matching, ...unrelated] }));
    expect(preview.warnings).toMatchObject([
      { id: "duplicate-step:0:task:child%3Awith%3Apunctuation", code: "duplicate-step", step: 0, taskId: matching.id, message: expect.stringContaining("add it again") },
    ]);
    expect(preview.subtasks).toHaveLength(2);
    expect(preview.canWrite).toBe(true);
    expect(preview).not.toHaveProperty("alreadySaved"); // Stable operation identity belongs to the later write path.
  });

  it.each(["Agree the fictional pilot", "AGREE  THE FICTIONAL PILOT!", "Agree the fictional pilot phase two", "Fictional pilot"])("asks about a similar new-parent title without auto-appending (%s)", (task) => {
    const existing = { ...TASK_PLAN_PROSPECT_PARENT, task };
    const preview = buildTaskPlan(TASK_PLAN_PROSPECT_NEW, previewContext({ tasks: [existing] }));
    expect(preview.warnings).toMatchObject([{ code: "similar-parent", taskId: existing.id, message: expect.stringContaining("keep a separate new main task") }]);
    expect(preview.parent?.task).toBe(TASK_PLAN_PROSPECT_NEW.newParent!.title);
    expect(preview.parentId).toBe("new-fictional-parent");
    expect(preview.subtasks.every((step) => step.parentId === preview.parentId)).toBe(true);
    expect(preview.canWrite).toBe(true);
  });

  it("only compares eligible titles in the selected destination, excluding word fragments", () => {
    const base = { ...TASK_PLAN_PROSPECT_PARENT, task: TASK_PLAN_PROSPECT_NEW.newParent!.title };
    const tasks = [{ ...base, id: "completed", completed: true }, { ...base, id: "parked", parkedAt: 1 },
      { ...base, id: "nested", parentId: "missing-parent" }, { ...base, id: "different-company", linkedClientId: TASK_PLAN_CLIENT.id },
      { ...base, id: "orphan", linkedClientId: 777777 }, { ...base, id: "internal", linkedClientId: undefined },
      { ...base, id: "unrelated", task: "Different main task" }, { ...base, id: "word-fragment", task: "pilotage" }];
    expect(buildTaskPlan(TASK_PLAN_PROSPECT_NEW, previewContext({ tasks })).warnings).toEqual([]);
    expect(buildTaskPlan(TASK_PLAN_INTERNAL_NEW, previewContext({ tasks: [{ ...tasks[4], task: TASK_PLAN_INTERNAL_NEW.newParent!.title }] })).warnings).toEqual([]);
  });

  it("keeps warning IDs/order and destination snapshots stable when supplied records are shuffled", () => {
    const task = TASK_PLAN_PROSPECT_PARENT;
    // These distinct Unicode IDs collate equally in some locales; their binary order must still be stable.
    const tasks = [{ ...task, id: "é", task: TASK_PLAN_PROSPECT_NEW.newParent!.title }, { ...task, id: "e\u0301", task: "Fictional pilot" }];
    const context = previewContext({ tasks });
    const preview = buildTaskPlan(TASK_PLAN_PROSPECT_NEW, context);
    expect(preview.warnings).toHaveLength(2);
    expect(new Set(preview.warnings.map(({ id }) => id)).size).toBe(2);
    expect(preview).toEqual(buildTaskPlan(TASK_PLAN_PROSPECT_NEW, { ...context, tasks: [...tasks].reverse(), companies: [...context.companies!].reverse() }));
    expect(preview).toEqual(buildTaskPlan(TASK_PLAN_PROSPECT_NEW, context));
  });

  it("keeps multiple existing-duplicate/date warning IDs unique and stable across record order", () => {
    const step = { name: "Past duplicated step", startDate: "2026-11-08", endDate: "2026-11-09" };
    const tasks = [TASK_PLAN_INTERNAL_PARENT, ...["child-one", "child-two"].map((id) => ({
      ...TASK_PLAN_INTERNAL_PARENT, id, parentId: TASK_PLAN_INTERNAL_PARENT.id, task: step.name, startDate: step.startDate, endDate: step.endDate,
    }))];
    const input = { ...TASK_PLAN_INTERNAL_APPEND, steps: [step, step] };
    const preview = buildTaskPlan(input, previewContext({ tasks }));
    expect(preview.warnings).toHaveLength(13); // Eight date warnings, one selected duplicate, four existing duplicates.
    expect(new Set(preview.warnings.map(({ id }) => id)).size).toBe(preview.warnings.length);
    expect(preview).toEqual(buildTaskPlan(input, previewContext({ tasks: [...tasks].reverse() })));
    expect(preview.subtasks).toHaveLength(2);
  });

  it("previews all 499 selected steps without silently dropping repeated work", () => {
    const step = { name: "Selected action", startDate: "2026-12-31", endDate: "2026-12-31" };
    const preview = buildTaskPlan({ ...TASK_PLAN_INTERNAL_NEW, steps: Array(MAX_TASK_PLAN_STEPS).fill(step) }, previewContext());
    expect(preview.canWrite).toBe(true);
    expect(preview.parent).not.toBeNull();
    expect(preview.subtasks).toHaveLength(499);
    expect(preview.warnings).toHaveLength(498);
    expect(preview.subtasks.at(-1)).toMatchObject({ task: step.name, order: 1499 });
  });
});
