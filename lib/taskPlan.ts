// Pure general task-plan validation, discovery and previews. I/O belongs to server modules.
import type { PipelineEntry } from "./clientTypes";
import { companyGroup, normalizeKey } from "./companies";
import type { CompanyGroup } from "./companies";
import { matchingCompanies } from "./companySearch";
import { isIsoDay } from "./dates";
import { isDealDone, KIND_LABELS, kindOf } from "./kinds";
import type { Kind } from "./kinds";
import { isParked } from "./parking";
import { newSubtask } from "./subtasks";
import type { NewTask, Task } from "./types";

export const MAX_TASK_PLAN_STEPS = 499;
// UTF-8 bytes of the complete JSON input, before trimming. Reject, never truncate.
// 512 KiB leaves room for long notes while staying below a single Firestore document's limit.
export const MAX_TASK_PLAN_INPUT_BYTES = 512 * 1024;

export interface TaskPlanStepInput {
  name: string;
  startDate: string;
  endDate: string;
  keyPoints?: string;
  owners?: string; // Supplied prose only; never an assignment to app people.
}

export interface TaskPlanNewParentInput {
  title: string;
  taskType?: "Our Action" | "Follow Up";
  keyPoints?: string;
  sourceUrl?: string; // Later stored as a labelled line in the parent's Key points.
}

export type TaskPlanDestination =
  | { kind: Exclude<Kind, "internal">; companyId: number }
  | { kind: "internal"; companyId?: never };

export type TaskPlanInput = TaskPlanDestination & (
  | { newParent: TaskPlanNewParentInput; existingParentId?: never }
  | { existingParentId: string; newParent?: never }
) & { steps: TaskPlanStepInput[] };

export type TaskPlanValidation = { plan: TaskPlanInput | null; errors: string[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    && [Object.prototype, null].includes(Object.getPrototypeOf(value));
}

function isTaskDocumentId(value: string): boolean {
  const bytes = new TextEncoder().encode(value);
  return !!value.trim() && !value.includes("/") && ![".", ".."].includes(value)
    && !/^__.*__$/.test(value) && bytes.byteLength <= 1500
    && new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes) === value;
}

export interface TaskDestinationQuery {
  kind: Kind;
  companyQuery?: string;
  companyId?: number;
  parentQuery?: string;
}

export interface TaskCompanyMatch {
  id: number;
  name: string;
  kind: Exclude<Kind, "internal">;
  group: CompanyGroup;
  status: string;
  pic: string;
  eligible: boolean;
  reason?: string;
}

export interface TaskParentMatch {
  id: string;
  name: string;
  kind: Kind;
  companyId?: number;
  companyName?: string;
  taskGroup: string;
  taskType: string;
  startDate: string;
  endDate: string;
}

export interface TaskDestinationMatches {
  companies: TaskCompanyMatch[];
  parents: TaskParentMatch[];
  hasMore: { companies: boolean; parents: boolean };
  guidance: string[];
  errors: string[];
}

export interface TaskDestinationContext {
  companies?: readonly PipelineEntry[]; // Internal work never needs company data.
  tasks: readonly Task[];
  today: string; // Explicit Asia/Jakarta day; no clock or database access in discovery.
}

// Company name searches only suggest matches. Only an explicit companyId enables parent lookup.
export function findTaskDestinations(input: unknown, context: TaskDestinationContext): TaskDestinationMatches {
  const result: TaskDestinationMatches = {
    companies: [], parents: [], hasMore: { companies: false, parents: false }, guidance: [], errors: [],
  };
  if (!isRecord(input)) return { ...result, errors: ["Destination query must be an object."] };
  for (const field of Object.keys(input)) {
    if (!["kind", "companyQuery", "companyId", "parentQuery"].includes(field)) {
      result.errors.push(`${field} is not a supported destination field.`);
    }
  }
  const { kind, companyId } = input;
  if (kind !== "prospect" && kind !== "client" && kind !== "internal") {
    result.errors.push("kind must be prospect, client or internal.");
  }
  for (const field of ["companyQuery", "parentQuery"] as const) {
    if (Object.hasOwn(input, field) && (typeof input[field] !== "string" || !input[field].trim())) {
      result.errors.push(`${field} must be non-empty text when supplied.`);
    }
  }
  if (kind === "internal") {
    if (Object.hasOwn(input, "companyId") || Object.hasOwn(input, "companyQuery")) {
      result.errors.push("Internal work forbids companyId and companyQuery.");
    }
  } else {
    if (Object.hasOwn(input, "companyId") && (typeof companyId !== "number" || !Number.isSafeInteger(companyId) || companyId < 0)) {
      result.errors.push("companyId must be the selected company's non-negative safe integer ID.");
    }
    if (!Object.hasOwn(input, "companyId") && !Object.hasOwn(input, "companyQuery")) {
      result.errors.push("Supply companyQuery or an explicitly selected companyId for company work.");
    }
  }
  if (result.errors.length) return result;

  let company: PipelineEntry | undefined;
  if (kind !== "internal") {
    const companies = context.companies ?? [];
    // An explicit ID takes precedence over a previous name query; never fall back to a name on a missing ID.
    company = typeof companyId === "number" ? companies.find((c) => c.id === companyId) : undefined;
    const matches = typeof companyId === "number"
      ? (company ? [company] : []) : matchingCompanies(input.companyQuery as string, companies);
    result.hasMore.companies = matches.length > 5;
    result.companies = matches.slice(0, 5).map((candidate) => {
      const actualKind = isDealDone(candidate) ? "client" : "prospect";
      const eligible = actualKind === kind;
      return {
        id: candidate.id, name: candidate.company, kind: actualKind, group: companyGroup(candidate),
        status: candidate.status ?? "", pic: candidate.pic ?? "", eligible,
        ...(!eligible && { reason: `${candidate.company} belongs to ${KIND_LABELS[actualKind]}, not ${KIND_LABELS[kind as Kind]}. Choose that category or another company; no company was moved.` }),
      };
    });
    if (typeof companyId === "number" && !company) {
      result.errors.push(`Company ${companyId} was not found. Search again and select an existing company ID.`);
      return result;
    }
    if (company && !result.companies[0].eligible) {
      result.guidance.push(result.companies[0].reason!);
      return result;
    }
    if (!company) {
      result.guidance.push(matches.length
        ? "Select a company by its numeric ID and matching category before searching main tasks; no destination was selected."
        : "No companies matched. Refine companyQuery; no company was created or selected.");
      if (result.hasMore.companies) result.guidance.push("More companies match; refine companyQuery to see the remaining matches.");
      return result;
    }
  }

  const companyMap = new Map(company ? [[company.id, company]] : []);
  const key = typeof input.parentQuery === "string" ? normalizeKey(input.parentQuery) : "";
  const parents = context.tasks.filter((task) =>
    !task.completed && task.parentId == null && !isParked(task, context.today)
    && (kind === "internal" ? task.linkedClientId == null : task.linkedClientId === companyId)
    && kindOf(task, companyMap) === kind,
  ).map((task) => {
    const name = normalizeKey(task.task);
    return { task, name, rank: !key || name === key ? 0 : name.startsWith(key) ? 1 : name.includes(key) ? 2 : 3 };
  }).filter(({ rank }) => rank < 3)
    .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name) || a.task.id.localeCompare(b.task.id));
  result.hasMore.parents = parents.length > 5;
  result.parents = parents.slice(0, 5).map(({ task }) => ({
    id: task.id, name: task.task, kind: kind as Kind,
    ...(company && { companyId: company.id, companyName: company.company }),
    taskGroup: task.taskGroup ?? "", taskType: task.taskType ?? "", startDate: task.startDate, endDate: task.endDate,
  }));
  if (result.hasMore.parents) result.guidance.push("More main tasks match; refine parentQuery to see the remaining matches.");
  result.guidance.push(result.parents.length
    ? "Select an existing main task by ID, or supply a title for a new main task; no main task was selected."
    : "No eligible main tasks matched. Refine parentQuery or supply a title for a new main task.");
  return result;
}

// Only explicit calendar days are accepted. Past dates are valid here; previews warn about them.
export function validateTaskPlan(input: unknown): TaskPlanValidation {
  if (!isRecord(input)) return { plan: null, errors: ["plan must be an object."] };
  const encoder = new TextEncoder();
  try {
    if (encoder.encode(JSON.stringify(input)).byteLength > MAX_TASK_PLAN_INPUT_BYTES) {
      return { plan: null, errors: [`plan exceeds ${MAX_TASK_PLAN_INPUT_BYTES} UTF-8 JSON bytes; split it into smaller groups. Text was not truncated.`] };
    }
  } catch {
    return { plan: null, errors: ["plan must be JSON-serializable."] };
  }

  const errors: string[] = [];
  const knownFields = (value: Record<string, unknown>, allowed: string[], path: string) => {
    for (const key of Object.keys(value)) {
      if (!allowed.includes(key)) errors.push(`${path}.${key} is not a supported field.`);
    }
  };
  const text = (value: unknown, path: string, required = true): string => {
    if (typeof value !== "string" || (required && !value.trim())) {
      errors.push(`${path} must be ${required ? "non-empty " : ""}text.`);
      return "";
    }
    return value.trim();
  };
  const optionalText = (value: Record<string, unknown>, key: string, path: string) =>
    value[key] === undefined ? {} : { [key]: text(value[key], `${path}.${key}`, false) };

  knownFields(input, ["kind", "companyId", "newParent", "existingParentId", "steps"], "plan");
  const kind = typeof input.kind === "string" ? input.kind.trim() : input.kind;
  if (kind !== "prospect" && kind !== "client" && kind !== "internal") {
    errors.push("plan.kind must be prospect, client or internal.");
  }
  if (kind === "internal") {
    if (Object.hasOwn(input, "companyId")) errors.push("plan.companyId is forbidden for internal work.");
  } else if (kind === "prospect" || kind === "client") {
    if (typeof input.companyId !== "number" || !Number.isSafeInteger(input.companyId) || input.companyId < 0) {
      errors.push("plan.companyId must be the selected company's non-negative safe integer ID.");
    }
  }

  const hasNew = Object.hasOwn(input, "newParent");
  const hasExisting = Object.hasOwn(input, "existingParentId");
  if (hasNew === hasExisting) errors.push("plan must select exactly one of newParent or existingParentId.");
  let newParent: TaskPlanNewParentInput | undefined;
  if (hasNew) {
    if (!isRecord(input.newParent)) {
      errors.push("plan.newParent must be an object.");
    } else {
      const parent = input.newParent;
      knownFields(parent, ["title", "taskType", "keyPoints", "sourceUrl"], "plan.newParent");
      newParent = { title: text(parent.title, "plan.newParent.title"), ...optionalText(parent, "keyPoints", "plan.newParent") };
      if (parent.taskType !== undefined) {
        const taskType = text(parent.taskType, "plan.newParent.taskType");
        if (taskType === "Our Action" || taskType === "Follow Up") newParent.taskType = taskType;
        else errors.push("plan.newParent.taskType must be Our Action or Follow Up.");
      }
      if (parent.sourceUrl !== undefined) {
        const sourceUrl = text(parent.sourceUrl, "plan.newParent.sourceUrl");
        try {
          const url = new URL(sourceUrl);
          if (!/^https?:\/\//i.test(sourceUrl) || /\s/.test(sourceUrl) || !url.hostname) throw new Error();
        } catch {
          errors.push("plan.newParent.sourceUrl must be an absolute http or https link.");
        }
        newParent.sourceUrl = sourceUrl;
      }
    }
  }
  let existingParentId: string | undefined;
  if (hasExisting) {
    existingParentId = text(input.existingParentId, "plan.existingParentId");
    // A single Firestore document ID, never a nested path or a reserved ID.
    if (!isTaskDocumentId(existingParentId)) {
      errors.push("plan.existingParentId must be a single valid task document ID (at most 1500 UTF-8 bytes), not a nested path.");
    }
  }

  const steps: TaskPlanStepInput[] = [];
  if (!Array.isArray(input.steps) || input.steps.length === 0 || input.steps.length > MAX_TASK_PLAN_STEPS) {
    errors.push(`plan.steps must contain 1 to ${MAX_TASK_PLAN_STEPS} dated steps.`);
  } else {
    for (const [i, step] of input.steps.entries()) {
      const path = `plan.steps[${i}]`;
      if (!isRecord(step)) {
        errors.push(`${path} must be an object.`);
        continue;
      }
      knownFields(step, ["name", "startDate", "endDate", "keyPoints", "owners"], path);
      const name = text(step.name, `${path}.name`);
      const startDate = text(step.startDate, `${path}.startDate`);
      const endDate = text(step.endDate, `${path}.endDate`);
      const validStart = isIsoDay(startDate);
      const validEnd = isIsoDay(endDate);
      if (!validStart) errors.push(`${path}.startDate must be a real yyyy-mm-dd calendar day.`);
      if (!validEnd) errors.push(`${path}.endDate must be a real yyyy-mm-dd calendar day.`);
      if (validStart && validEnd && startDate > endDate) errors.push(`${path}.startDate must not be after ${path}.endDate.`);
      steps.push({ name, startDate, endDate, ...optionalText(step, "keyPoints", path), ...optionalText(step, "owners", path) });
    }
  }
  if (errors.length) return { plan: null, errors };
  // Every discriminant and branch above has been checked; no fields are inferred from prose.
  const plan = {
    kind, ...(kind !== "internal" && { companyId: input.companyId }),
    ...(hasNew ? { newParent } : { existingParentId }), steps,
  } as TaskPlanInput;
  return { plan, errors: [] };
}

export interface TaskPlanWarning {
  id: string; // Stable for the same warning/step/record, independent of supplied record order.
  code: "past-date" | "outside-parent-range" | "duplicate-step" | "similar-parent";
  message: string;
  step?: number; // Zero-based input index; messages use human step numbers.
  field?: "startDate" | "endDate";
  taskId?: string;
  relatedStep?: number;
}

export interface TaskPlanContext extends TaskDestinationContext {
  parentId?: string; // Caller-allocated, unused document ID; only needed for a new main task.
  order?: number; // Optional order seed. No clock, random IDs or I/O in this builder.
}

// Only destination fields that affect the preview, for the later server-side integrity check.
export interface TaskPlanDestinationState {
  kind: Kind;
  category: string;
  company: { id: number; name: string; group: CompanyGroup; status: string } | null;
  parent: {
    id: string;
    name: string;
    mode: "new" | "existing";
    linkedClientId: number | null;
    taskType: string | null;
    taskGroup: string | null;
    startDate: string;
    endDate: string;
    completed: boolean;
    parkedAt: number | null;
    parkedUntil: string | null;
  };
}

export interface TaskPlanPreview {
  plan: TaskPlanInput | null; // Validated/trimmed input shared with signing and saving.
  errors: string[];
  warnings: TaskPlanWarning[];
  canWrite: boolean; // Shape/destination valid; every warning still needs acknowledgement before saving.
  destination: TaskPlanDestinationState | null;
  parentId: string;
  parent: NewTask | null; // New main task only. There is deliberately no existing-parent update.
  subtasks: NewTask[];
  preservationNotes: string[];
}

// Similarity is exact or whole-phrase containment after case/spacing/punctuation normalization.
// It only asks for a choice; it never selects a parent or removes an input step.
const titleKey = (title: string) => normalizeKey(title).replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const similarTitle = (a: string, b: string) => !!a && !!b
  && (a === b || ` ${a} `.includes(` ${b} `) || ` ${b} `.includes(` ${a} `));
const taskStepKey = (name: string, startDate: string, endDate: string) => JSON.stringify([normalizeKey(name), startDate, endDate]);

export function buildTaskPlan(input: unknown, context: TaskPlanContext): TaskPlanPreview {
  const { plan, errors } = validateTaskPlan(input);
  const result: TaskPlanPreview = {
    plan, errors, warnings: [], canWrite: false, destination: null,
    parentId: plan?.existingParentId ?? context.parentId ?? "", parent: null, subtasks: [], preservationNotes: [],
  };
  if (!plan) return result;
  if (!isIsoDay(context.today)) {
    errors.push("today must be a real yyyy-mm-dd Asia/Jakarta calendar day.");
    return result;
  }

  // Internal previews must not even access company data (which may be unavailable).
  const company = plan.kind === "internal" ? undefined : context.companies?.find((c) => c.id === plan.companyId);
  if (plan.kind !== "internal") {
    if (!company) errors.push(`Company ${plan.companyId} was not found. Search again and select an existing company ID.`);
    else {
      const actualKind = isDealDone(company) ? "client" : "prospect";
      if (actualKind !== plan.kind) errors.push(`${company.company} belongs to ${KIND_LABELS[actualKind]}, not ${KIND_LABELS[plan.kind]}. Choose that category or another company; no company was moved.`);
    }
  }
  const existing = plan.existingParentId === undefined ? undefined : context.tasks.find((task) => task.id === plan.existingParentId);
  if (plan.existingParentId !== undefined) {
    if (!existing) errors.push(`Main task ${plan.existingParentId} was not found. Search again and select an existing main task ID.`);
    else {
      if (existing.parentId != null) errors.push("existingParentId must name a top-level main task, not a subtask (even if its parent is missing).");
      if (existing.completed) errors.push(`Main task "${existing.task}" is completed. Select an open main task.`);
      if (isParked(existing, context.today)) errors.push(`Main task "${existing.task}" is parked. Select an open, unparked main task.`);
      if (plan.kind === "internal" ? existing.linkedClientId != null : existing.linkedClientId !== plan.companyId) {
        errors.push("The selected main task no longer belongs to this destination. Search again; no task or company was moved.");
      }
    }
  } else if (!isTaskDocumentId(result.parentId) || result.parentId !== result.parentId.trim() || context.tasks.some((task) => task.id === result.parentId)) {
    errors.push("parentId must be an unused, valid task document ID for the new main task.");
  }
  const order = context.tasks.reduce((next, task) => Math.max(next, task.order + 1), context.order ?? 0);
  if (!Number.isFinite(order) || order + plan.steps.length > Number.MAX_SAFE_INTEGER) {
    errors.push("Task order must be finite and leave room for every selected step.");
  }
  if (errors.length) return result;

  const sortedTasks = [...context.tasks].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const { warnings } = result;
  if (plan.newParent) {
    for (const task of sortedTasks) {
      const sameDestination = plan.kind === "internal" ? task.linkedClientId == null : task.linkedClientId === plan.companyId;
      if (sameDestination && task.parentId == null && !task.completed && !isParked(task, context.today)
        && similarTitle(titleKey(task.task), titleKey(plan.newParent.title))) {
        warnings.push({
          id: `similar-parent:${encodeURIComponent(task.id)}`, code: "similar-parent", taskId: task.id,
          message: `Similar main task "${task.task}" (${task.id}) already exists. Ask the owner to choose: keep a separate new main task, or select this existingParentId and preview again. No main task was selected automatically.`,
        });
      }
    }
  }
  const seen = new Map<string, number>();
  const children = existing ? sortedTasks.filter((task) => task.parentId === existing.id) : [];
  plan.steps.forEach((step, i) => {
    for (const field of ["startDate", "endDate"] as const) {
      const date = step[field];
      if (date < context.today) warnings.push({
        id: `past-date:${i}:${field}`, code: "past-date", step: i, field,
        message: `Step ${i + 1} ${field} (${date}) is in the past. Ask the owner to confirm this exact date or change it and preview again.`,
      });
      if (existing && ((isIsoDay(existing.startDate) && date < existing.startDate) || (isIsoDay(existing.endDate) && date > existing.endDate))) {
        warnings.push({
          id: `outside-parent-range:${i}:${field}`, code: "outside-parent-range", step: i, field, taskId: existing.id,
          message: `Step ${i + 1} ${field} (${date}) falls outside main task "${existing.task}" (${existing.startDate || "no start"} to ${existing.endDate || "no end"}). Confirm this step's dates or change them and preview again; the main task's dates will stay unchanged.`,
        });
      }
    }
    const key = taskStepKey(step.name, step.startDate, step.endDate);
    const previous = seen.get(key);
    if (previous !== undefined) warnings.push({
      id: `duplicate-step:${i}:input:${previous}`, code: "duplicate-step", step: i, relatedStep: previous,
      message: `Step ${i + 1} has the same name and dates as step ${previous + 1}. Ask the owner to choose: keep both, change the step, or skip it and preview again. Neither step was dropped.`,
    });
    else seen.set(key, i);
    for (const child of children) {
      if (key === taskStepKey(child.task, child.startDate, child.endDate)) warnings.push({
        id: `duplicate-step:${i}:task:${encodeURIComponent(child.id)}`, code: "duplicate-step", step: i, taskId: child.id,
        message: `Step ${i + 1} has the same name and dates as existing subtask "${child.task}" (${child.id}). Ask the owner to choose: add it again, change it, or skip it and preview again. The existing subtask stays unchanged and this step was not dropped.`,
      });
    }
  });

  if (plan.newParent) result.parent = {
    task: plan.newParent.title, taskType: plan.newParent.taskType ?? "Our Action",
    ...(company && { linkedClientId: company.id }), responsible: [], informed: [],
    keyPoints: [plan.newParent.keyPoints, plan.newParent.sourceUrl && `Source: ${plan.newParent.sourceUrl}`].filter(Boolean).join("\n\n"),
    startDate: plan.steps.reduce((date, step) => step.startDate < date ? step.startDate : date, plan.steps[0].startDate),
    endDate: plan.steps.reduce((date, step) => step.endDate > date ? step.endDate : date, plan.steps[0].endDate),
    order,
  };
  const parent = existing ?? { ...result.parent!, id: result.parentId };
  result.subtasks = plan.steps.map((step, i) => ({
    ...newSubtask(parent, step.name, order + i + (existing ? 0 : 1)),
    startDate: step.startDate, endDate: step.endDate,
    keyPoints: [step.keyPoints, step.owners && `Owner: ${step.owners}`].filter(Boolean).join("\n\n"),
  }));
  result.destination = {
    kind: plan.kind, category: KIND_LABELS[plan.kind],
    company: company ? { id: company.id, name: company.company, group: companyGroup(company), status: company.status ?? "" } : null,
    parent: {
      id: parent.id, name: parent.task, mode: existing ? "existing" : "new", linkedClientId: parent.linkedClientId ?? null,
      taskType: parent.taskType ?? null, taskGroup: parent.taskGroup ?? null, startDate: parent.startDate, endDate: parent.endDate,
      completed: parent.completed ?? false, parkedAt: parent.parkedAt ?? null, parkedUntil: parent.parkedUntil ?? null,
    },
  };
  result.preservationNotes = [
    "Company records and all existing subtasks stay unchanged. New records have empty Responsible and Informed; supplied owner names remain in Key points.",
    existing ? "Every existing main-task field stays unchanged, including dates, Key points, people, type, group and status. Only the previewed subtasks are added."
      : "Only the previewed new main task and subtasks are added. The main task spans the earliest selected start and latest selected end; each subtask keeps its own dates.",
  ];
  result.canWrite = true;
  return result;
}
