// Made-up connector fixture, shared with later emulator/smoke checks; no real deal-plan content.
import type { PipelineEntry } from "../../lib/clientTypes";
import type { FollowupPlanInput } from "../../lib/followupPlan";

export const FOLLOWUP_COMPANY_FIXTURE: PipelineEntry = {
  id: 901,
  company: "PT Contoh Aurora Fiktif Tbk",
  pic: "Test contact",
};

export const SIX_STEP_FOLLOWUP_FIXTURE: FollowupPlanInput = {
  companyId: FOLLOWUP_COMPANY_FIXTURE.id,
  shortAnswer: "Confirm the budget route, then agree a small pilot and a next-year slot.",
  docUrl: "https://example.com/fictional-followup",
  steps: [
    { name: "Confirm budget contact", startDate: "2026-11-10", endDate: "2026-11-13" },
    { name: "Gather pilot requirements", startDate: "2026-11-16", endDate: "2026-11-20" },
    { name: "Share pilot outline", startDate: "2026-11-23", endDate: "2026-11-27" },
    { name: "Review the pilot", startDate: "2026-12-07", endDate: "2026-12-11" },
    { name: "Confirm the next-year route", startDate: "2026-12-28", endDate: "2027-01-08" },
    { name: "Ask for a budget slot", startDate: "2027-02-08", endDate: "2027-02-08" },
  ].map((step) => ({
    ...step,
    owners: "Test owner with Test contact",
    what: `Discuss: ${step.name}.`,
    why: "Agree a concrete next step.",
    bring: "A fictional pilot outline.",
    watch: "A change in the budget window.",
    doneWhen: "The test contact confirms the next step in writing.",
  })),
};
