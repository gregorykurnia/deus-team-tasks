import { describe, expect, it } from "vitest";
import {
  TASK_PLAN_CLIENT, TASK_PLAN_CLIENT_NEW, TASK_PLAN_CLIENT_PARENT, TASK_PLAN_COMPLETED_PARENT,
  TASK_PLAN_DEAL_SKILL, TASK_PLAN_INTERNAL_APPEND, TASK_PLAN_INTERNAL_NEW, TASK_PLAN_INTERNAL_PARENT,
  TASK_PLAN_LONG_TEXT, TASK_PLAN_PARKED_PARENT, TASK_PLAN_PROSPECT, TASK_PLAN_PROSPECT_NEW,
  TASK_PLAN_PROSPECT_PARENT,
} from "../tests/fixtures/taskPlan";
import { companiesById, isDealDone, kindOf } from "./kinds";
import { MAX_TASK_PLAN_INPUT_BYTES, MAX_TASK_PLAN_STEPS, validateTaskPlan } from "./taskPlan";
import type { TaskPlanInput } from "./taskPlan";

const plan = () => structuredClone(TASK_PLAN_PROSPECT_NEW);
const oneStep = (changes: Record<string, unknown>) => ({ ...plan(), steps: [{ ...plan().steps[0], ...changes }] });
const rejects = (input: unknown, field: string) => {
  const result = validateTaskPlan(input);
  expect(result.plan).toBeNull();
  expect(result.errors.some((error) => error.includes(field))).toBe(true);
};

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
