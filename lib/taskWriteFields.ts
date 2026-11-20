import { deleteField } from "firebase/firestore";
import type { NewTask } from "./types";

export const TASKS = "tasks";

export type TaskPatch = Partial<NewTask> & { id?: unknown };

// Undefined clears a field. Each Firestore SDK supplies its own deletion sentinel.
export function toTaskUpdate(patch: TaskPatch, clearField: () => unknown = deleteField): Record<string, unknown> {
  const { id: _id, ...rest } = patch;
  void _id;
  return Object.fromEntries(Object.entries(rest).map(([key, value]) => [key, value === undefined ? clearField() : value]));
}
