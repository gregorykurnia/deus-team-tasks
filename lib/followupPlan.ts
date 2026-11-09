// Pure connector planning: no database access, and no dates or owners guessed from prose.
import type { PipelineEntry } from "./clientTypes";
import { companyGroup } from "./companies";
import { isIsoDay, todayIso } from "./dates";
import { isDealDone } from "./kinds";
import { newSubtask, subtasksOf } from "./subtasks";
import type { NewTask, Task } from "./types";

export interface FollowupStepInput {
  name: string;
  startDate: string;
  endDate: string;
  owners: string;
  what: string;
  why: string;
  bring: string;
  watch: string;
  doneWhen: string;
}

export interface FollowupPlanInput {
  companyId: number;
  shortAnswer: string;
  docUrl?: string;
  steps: FollowupStepInput[]; // Only the dated Path steps, not slips or side opportunities.
  existingParentId?: string; // Set only after confirmation to append to this open follow-up.
}

type Validation = { plan: FollowupPlanInput | null; errors: string[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Shape errors stop planning. Date problems are separate warnings so preview can explain each one.
export function validateFollowupPlan(input: unknown): Validation {
  if (!isRecord(input)) return { plan: null, errors: ["The plan must be an object."] };
  const errors: string[] = [];
  const text = (value: unknown, field: string): string => {
    if (typeof value !== "string" || !value.trim()) {
      errors.push(`${field} must be non-empty text.`);
      return "";
    }
    return value.trim();
  };
  const companyId = input.companyId;
  if (typeof companyId !== "number" || !Number.isSafeInteger(companyId) || companyId < 0) {
    errors.push("companyId must be the selected company's numeric ID.");
  }
  const shortAnswer = text(input.shortAnswer, "shortAnswer");
  let docUrl: string | undefined;
  if (input.docUrl !== undefined) {
    docUrl = text(input.docUrl, "docUrl");
    try {
      if (!["http:", "https:"].includes(new URL(docUrl).protocol)) throw new Error();
    } catch {
      errors.push("docUrl must be an http or https link.");
    }
  }
  const existingParentId = input.existingParentId === undefined ? undefined : text(input.existingParentId, "existingParentId");
  const steps: FollowupStepInput[] = [];
  if (!Array.isArray(input.steps) || input.steps.length === 0) {
    errors.push("steps must contain at least one dated Path step.");
  } else {
    for (const [i, step] of input.steps.entries()) {
      if (!isRecord(step)) {
        errors.push(`steps[${i}] must be an object.`);
        continue;
      }
      const field = (key: keyof FollowupStepInput) => text(step[key], `steps[${i}].${key}`);
      steps.push({
        name: field("name"), startDate: field("startDate"), endDate: field("endDate"), owners: field("owners"),
        what: field("what"), why: field("why"), bring: field("bring"), watch: field("watch"), doneWhen: field("doneWhen"),
      });
    }
  }
  if (errors.length) return { plan: null, errors };
  return { plan: { companyId: companyId as number, shortAnswer, steps, ...(docUrl && { docUrl }), ...(existingParentId && { existingParentId }) }, errors: [] };
}

// Drop legal suffixes as whole words, preserving names such as "PTara" and "Tbkarya".
function companyKey(name: string): string {
  return name.toLowerCase().replace(/\./g, "").replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim().split(/\s+/).filter((word) => word !== "pt" && word !== "tbk").join("");
}

function openFollowups(company: PipelineEntry, tasks: readonly Task[]): Task[] {
  const title = companyKey(`${company.company} Follow Up`);
  return tasks.filter((t) => !t.completed && !t.parentId && t.linkedClientId === company.id && companyKey(t.task) === title)
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

export interface FollowupCompanyMatch {
  id: number;
  name: string;
  group: "Active" | "Raw" | "On hold" | "Deal done";
  pic: string;
  followups: { parent: Task; subtasks: Task[] }[];
}

// Exact names first, then prefixes, then other substrings; ties are stable by name and ID.
export function findCompanies(query: string, companies: readonly PipelineEntry[], tasks: readonly Task[] = []): FollowupCompanyMatch[] {
  const key = companyKey(query);
  if (!key) return [];
  const groups: Record<ReturnType<typeof companyGroup>, FollowupCompanyMatch["group"]> = {
    active: "Active", toApproach: "Raw", noOrNotNow: "On hold", dealDone: "Deal done",
  };
  return companies.map((company) => {
    const name = companyKey(company.company);
    const rank = name === key ? 0 : name.startsWith(key) ? 1 : name.includes(key) ? 2 : 3;
    return { company, name, rank };
  }).filter(({ rank }) => rank < 3)
    .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name) || a.company.id - b.company.id)
    .slice(0, 5)
    .map(({ company }) => ({
      id: company.id, name: company.company, group: groups[companyGroup(company)], pic: company.pic ?? "",
      followups: openFollowups(company, tasks).map((parent) => ({ parent, subtasks: subtasksOf(tasks, parent.id) })),
    }));
}

export interface FollowupPlanWarning {
  code: "invalid-date" | "start-after-end" | "past-date" | "deal-done" | "followup-exists";
  message: string;
  step?: number; // Zero-based index in the input; the message uses the human step number.
  field?: "startDate" | "endDate";
  taskId?: string;
}

export interface FollowupPlanContext {
  companies: readonly PipelineEntry[];
  tasks: readonly Task[];
  parentId: string; // The caller allocates the new ID; existingParentId takes precedence when appending.
  today?: string;
  order?: number;
}

export interface FollowupPlanPreview {
  errors: string[];
  warnings: FollowupPlanWarning[];
  canWrite: boolean;
  parentId: string;
  parent: NewTask | null; // New parent only; never replaces an existing parent.
  parentUpdate: Pick<NewTask, "endDate"> | null; // Appending can only extend its deadline.
  subtasks: NewTask[];
}

export function buildFollowupPlan(input: unknown, context: FollowupPlanContext): FollowupPlanPreview {
  const { plan, errors } = validateFollowupPlan(input);
  const result: FollowupPlanPreview = {
    errors, warnings: [], canWrite: false, parentId: context.parentId, parent: null, parentUpdate: null, subtasks: [],
  };
  if (!plan) return result;
  const company = context.companies.find((c) => c.id === plan.companyId);
  if (!company) {
    errors.push("Company not found. Add it under Prospects first, then retry.");
    return result;
  }
  const today = context.today ?? todayIso();
  if (!isIsoDay(today)) {
    errors.push("today must be a valid yyyy-mm-dd date.");
    return result;
  }
  const { warnings } = result;
  plan.steps.forEach((step, i) => {
    for (const field of ["startDate", "endDate"] as const) {
      const date = step[field];
      if (!isIsoDay(date)) {
        warnings.push({ code: "invalid-date", message: `Step ${i + 1} ${field} must be a real date in yyyy-mm-dd format.`, step: i, field });
      } else if (date < today) {
        warnings.push({ code: "past-date", message: `Step ${i + 1} ${field} (${date}) is in the past. Confirm this date.`, step: i, field });
      }
    }
    if (isIsoDay(step.startDate) && isIsoDay(step.endDate) && step.startDate > step.endDate) {
      warnings.push({ code: "start-after-end", message: `Step ${i + 1} starts after it ends. Correct its dates.`, step: i });
    }
  });
  if (isDealDone(company)) {
    warnings.push({ code: "deal-done", message: `${company.company} is Deal done; these tasks will appear under Clients.` });
  }
  const followups = openFollowups(company, context.tasks);
  for (const parent of followups) {
    warnings.push({ code: "followup-exists", message: `Follow-up task "${parent.task}" already exists (${parent.id}). Confirm adding the new steps to it.`, taskId: parent.id });
  }
  const existing = followups.find((parent) => parent.id === plan.existingParentId);
  if (plan.existingParentId && !existing) {
    errors.push("existingParentId must name an open follow-up parent for the selected company.");
  }
  if (existing) result.parentId = existing.id;
  if (!existing && (!context.parentId.trim() || context.tasks.some((t) => t.id === context.parentId))) {
    errors.push("parentId must be an unused, non-empty task ID.");
  }
  // Preview explains all warnings, but exposes no write documents until dates are valid and the parent is chosen.
  if (errors.length || warnings.some((w) => w.code === "invalid-date" || w.code === "start-after-end") || (followups.length > 0 && !existing)) {
    return result;
  }
  const startDate = plan.steps.reduce((date, step) => step.startDate < date ? step.startDate : date, plan.steps[0].startDate);
  const endDate = plan.steps.reduce((date, step) => step.endDate > date ? step.endDate : date, plan.steps[0].endDate);
  const order = context.tasks.reduce((next, task) => Math.max(next, task.order + 1), context.order ?? Date.now());
  if (existing) {
    if (!isIsoDay(existing.endDate) || endDate > existing.endDate) result.parentUpdate = { endDate };
  } else {
    result.parent = {
      task: `${company.company} Follow Up`, taskType: "Follow Up", linkedClientId: company.id,
      responsible: [], informed: [], keyPoints: plan.shortAnswer + (plan.docUrl ? `\n\nClaude Doc: ${plan.docUrl}` : ""),
      startDate, endDate, order,
    };
  }
  const parent = existing ?? { ...result.parent!, id: result.parentId };
  result.subtasks = plan.steps.map((step, i) => ({
    ...newSubtask(parent, step.name, order + i + (existing ? 0 : 1)),
    startDate: step.startDate,
    endDate: step.endDate,
    keyPoints: [
      `Owner: ${step.owners}`, `What: ${step.what}`, `Why: ${step.why}`,
      `Bring: ${step.bring}`, `Watch: ${step.watch}`, `Done when: ${step.doneWhen}`,
    ].join("\n\n"),
  }));
  result.canWrite = true;
  return result;
}
