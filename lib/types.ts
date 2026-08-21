export interface InformedPerson {
  name: string;
  note?: string; // e.g. "recipient", "backup", "observer"
}

export interface Task {
  id: string;
  task: string;
  responsible: string[];
  informed: InformedPerson[];
  keyPoints: string;
  startDate: string; // yyyy-mm-dd
  endDate: string; // yyyy-mm-dd
  order: number;
}

export type NewTask = Omit<Task, "id">;

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
