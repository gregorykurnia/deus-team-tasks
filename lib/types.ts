export interface InformedPerson {
  name: string;
  note?: string; // e.g. "recipient", "backup", "observer"
}

export const TASK_TYPES = [
  "Our Action",
  "Follow Up",
  "Send Proposal/Quote",
  "Contract/Paperwork",
  "Finalize Scheduling",
] as const;

export type TaskType = (typeof TASK_TYPES)[number];

export interface Task {
  id: string;
  task: string;
  taskType?: TaskType;
  responsible: string[];
  informed: InformedPerson[];
  keyPoints: string;
  startDate: string; // yyyy-mm-dd
  endDate: string; // yyyy-mm-dd
  order: number;
  completed?: boolean;
  linkedClientId?: number; // links to a PipelineEntry.id in the client pipeline
}

export type NewTask = Omit<Task, "id">;

export interface FlowRole {
  label: string;
  names: string[];
}

export interface FlowStep {
  id: string;
  title: string;
  description: string;
  roles: FlowRole[];
}

export interface FlowBranch {
  id: string;
  label: string;
  tone: "bad" | "good";
  title: string;
  description: string;
  roles: FlowRole[];
  loopTo?: string;
}

export interface FlowDecision {
  label: string;
  branches: FlowBranch[];
}

export interface Flow {
  id: string;
  name: string;
  description: string;
  order: number;
  steps: FlowStep[];
  decision?: FlowDecision | null;
}

export type NewFlow = Omit<Flow, "id">;

export const KNOWN_NAMES = [
  "Greg",
  "David",
  "Fir",
  "Ko Will",
  "Bu Sovie",
  "Thania",
  "Yuli",
  "Mba Lida",
];
