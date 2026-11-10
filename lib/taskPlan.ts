// Pure general task-plan inputs. Destination lookups and writes belong to the server modules.
import { isIsoDay } from "./dates";
import type { Kind } from "./kinds";

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
    const bytes = encoder.encode(existingParentId);
    if (!existingParentId || existingParentId.includes("/") || [".", ".."].includes(existingParentId)
      || /^__.*__$/.test(existingParentId) || bytes.byteLength > 1500
      || new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes) !== existingParentId) {
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
