// Invented general-connector data for pure tests and later emulator/protocol checks.
import type { PipelineEntry } from "../../lib/clientTypes";
import { DEAL_DONE_STATUS } from "../../lib/companies";
import type { TaskPlanInput } from "../../lib/taskPlan";
import type { Task } from "../../lib/types";

export const TASK_PLAN_TODAY = "2026-11-10";
export const TASK_PLAN_PROSPECT: PipelineEntry = {
  id: 9201, company: "PT Lentera Contoh Fiktif Tbk", pic: "Fictional prospect contact",
};
export const TASK_PLAN_CLIENT: PipelineEntry = {
  id: 9202, company: "PT Pelangi Contoh Fiktif", status: DEAL_DONE_STATUS, pic: "Fictional client contact",
};

export const TASK_PLAN_LONG_TEXT = Array.from({ length: 80 }, (_, i) =>
  `Note ${i + 1}: Keep the fictional team's wording — budget, timing and questions.\n  Preserve this indented follow-up line.`,
).join("\n\n");

export const TASK_PLAN_INTERNAL_PARENT: Task = {
  id: "fixture-internal-parent", task: "Prepare the fictional team handover", taskType: "Our Action",
  responsible: ["Fictional existing owner"], informed: [{ name: "Fictional existing observer" }],
  keyPoints: "Existing notes must stay unchanged.\n  Keep the indentation.",
  startDate: "2026-12-01", endDate: "2027-01-31", taskGroup: "Fictional operations", order: 100,
};
export const TASK_PLAN_PROSPECT_PARENT: Task = {
  ...TASK_PLAN_INTERNAL_PARENT, id: "fixture-prospect-parent", task: "Discuss the fictional pilot",
  linkedClientId: TASK_PLAN_PROSPECT.id, taskGroup: "Fictional prospect work", order: 200,
};
export const TASK_PLAN_CLIENT_PARENT: Task = {
  ...TASK_PLAN_INTERNAL_PARENT, id: "fixture-client-parent", task: "Prepare the fictional client rollout",
  linkedClientId: TASK_PLAN_CLIENT.id, taskGroup: "Fictional client work", order: 300,
};
export const TASK_PLAN_PARKED_PARENT: Task = {
  ...TASK_PLAN_PROSPECT_PARENT, id: "fixture-parked-parent", task: "Wait for the fictional budget",
  parkedAt: Date.UTC(2026, 10, 1), parkedUntil: "2026-11-11", order: 400,
};
export const TASK_PLAN_COMPLETED_PARENT: Task = {
  ...TASK_PLAN_CLIENT_PARENT, id: "fixture-completed-parent", task: "Finished fictional preparation",
  completed: true, order: 500,
};

export const TASK_PLAN_PROSPECT_NEW: TaskPlanInput = {
  kind: "prospect", companyId: TASK_PLAN_PROSPECT.id,
  newParent: { title: "Agree the fictional pilot", keyPoints: TASK_PLAN_LONG_TEXT, sourceUrl: "https://example.com/fictional-pilot" },
  steps: [
    { name: "Confirm the pilot scope", startDate: "2026-12-28", endDate: "2027-01-04", keyPoints: TASK_PLAN_LONG_TEXT, owners: "Fictional Nara with Fictional Bima" },
    { name: "Send the agreed outline", startDate: "2027-01-05", endDate: "2027-01-05" },
  ],
};
export const TASK_PLAN_CLIENT_NEW: TaskPlanInput = {
  ...TASK_PLAN_PROSPECT_NEW, kind: "client", companyId: TASK_PLAN_CLIENT.id,
  newParent: { title: "Agree the fictional rollout", taskType: "Our Action" },
};
export const TASK_PLAN_INTERNAL_NEW: TaskPlanInput = {
  kind: "internal", newParent: { title: "Arrange the fictional handover" },
  steps: TASK_PLAN_PROSPECT_NEW.steps,
};
export const TASK_PLAN_INTERNAL_APPEND: TaskPlanInput = {
  kind: "internal", existingParentId: TASK_PLAN_INTERNAL_PARENT.id, steps: TASK_PLAN_PROSPECT_NEW.steps,
};
export const TASK_PLAN_DEAL_SKILL: TaskPlanInput = {
  kind: "prospect", companyId: TASK_PLAN_PROSPECT.id,
  newParent: {
    title: `${TASK_PLAN_PROSPECT.company} Follow Up`, taskType: "Follow Up",
    keyPoints: "Confirm the budget route, then agree a fictional pilot.", sourceUrl: "https://example.com/fictional-deal",
  },
  steps: [{
    name: "Confirm the fictional budget route", startDate: "2026-12-28", endDate: "2027-01-04",
    owners: "Fictional Nara with Fictional contact",
    keyPoints: "What: Confirm the budget route.\nWhy: Agree a concrete next step.\nBring: A fictional pilot outline.\nWatch: A changed budget window.\nDone when: The fictional contact replies in writing.",
  }],
};
