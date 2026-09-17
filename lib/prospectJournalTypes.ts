export const PROSPECT_JOURNAL_FIELDS = [
  { key: "clientNeed", label: "Client Need" },
  { key: "currentSituation", label: "Current Situation" },
  { key: "painAndBusinessImpact", label: "Pain and Business Impact" },
  { key: "solutionFit", label: "Solution Fit" },
  { key: "urgencyAndTiming", label: "Urgency and Timing" },
  { key: "stakeholdersAndDecisionProcess", label: "Stakeholders and Decision Process" },
  { key: "commercialReadiness", label: "Commercial Readiness" },
  { key: "nextStepAndOwnership", label: "Next Step and Ownership" },
  { key: "potentialBlockersAnalysis", label: "Potential Blockers Analysis" },
  { key: "opportunityStatus", label: "Opportunity Status" },
  { key: "detailedRemarks", label: "Detailed Remarks" },
] as const;

export type ProspectJournalField = (typeof PROSPECT_JOURNAL_FIELDS)[number]["key"];

export type ProspectJournalEntry = {
  id: string;
  pipelineEntryId?: number;
  prospectName: string;
  updatedAt: number;
} & Record<ProspectJournalField, string>;

export function createEmptyProspectJournalEntry(id: string): ProspectJournalEntry {
  return {
    id,
    prospectName: "",
    updatedAt: Date.now(),
    clientNeed: "",
    currentSituation: "",
    painAndBusinessImpact: "",
    solutionFit: "",
    urgencyAndTiming: "",
    stakeholdersAndDecisionProcess: "",
    commercialReadiness: "",
    nextStepAndOwnership: "",
    potentialBlockersAnalysis: "",
    opportunityStatus: "",
    detailedRemarks: "",
  };
}
