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
  "Trial Pending",
] as const;

export type TaskType = (typeof TASK_TYPES)[number];

export const TASK_PRIORITIES = ["High", "Medium", "Low"] as const;

export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export interface Task {
  id: string;
  task: string;
  taskType?: TaskType;
  priority?: TaskPriority;
  touchPoint?: string;
  responsible: string[];
  informed: InformedPerson[];
  keyPoints: string;
  startDate: string; // yyyy-mm-dd
  endDate: string; // yyyy-mm-dd
  order: number;
  completed?: boolean;
  linkedClientId?: number; // links to a PipelineEntry.id in the client pipeline
  taskGroup?: string; // name of the Task Group this task is organized under (Operational view)
  lastActionDate?: string; // yyyy-mm-dd
  completedAt?: number; // ms; when it was marked done (tasks finished before this was recorded have none, N1)
  startedAt?: number; // ms; when it was marked In Progress (lib/taskStatus); none is To Do
  parkedAt?: number; // ms; when it was parked: out of the open work until brought back (lib/parking)
  parkedUntil?: string; // yyyy-mm-dd; the day a parked task comes back by itself, or none to wait until brought back
}

export type NewTask = Omit<Task, "id">;

export interface FlowRole {
  id?: string; // stable while roles move (R3); an older role gets one on its flow's next save
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
  label: string; // the question
  description?: string; // how to decide (added in 3.14)
  branches: FlowBranch[];
}

export interface Flow {
  id: string;
  name: string;
  description: string;
  order: number;
  steps: FlowStep[];
  decision?: FlowDecision | null;
  updatedAt?: number; // ms; flows edited before this was recorded have none (N1)
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
