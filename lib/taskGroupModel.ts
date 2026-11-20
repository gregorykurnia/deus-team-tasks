import type { Task } from "./types";

export const TASK_GROUPS = "taskGroups";
export const TASK_GROUP_ACTIONS = ["create", "rename", "star", "unstar", "delete"] as const;

export interface TaskGroup {
  id: string;
  name: string;
  starred: boolean;
}

// A task can still name a group that has no record of its own.
export interface GroupRef {
  id?: string;
  name: string;
}

export type GroupNameProblem = "missing" | "taken";

export class GroupNameError extends Error {
  constructor(public problem: GroupNameProblem) {
    super(problem === "missing" ? "Enter a name." : "A group with that name already exists.");
  }
}

export const groupNameKey = (name: string) => name.trim().toLowerCase();

// A group's name is required and unique, ignoring case (guide 5.5).
export function groupNameProblem(name: string, groups: GroupRef[], exceptId?: string): GroupNameProblem | null {
  const key = groupNameKey(name);
  if (!key) return "missing";
  return groups.some((group) => (exceptId === undefined || group.id !== exceptId) && groupNameKey(group.name) === key)
    ? "taken" : null;
}

// Important groups first, then in the order they were made.
export function sortGroups<G extends Pick<TaskGroup, "starred">>(groups: G[]): G[] {
  return [...groups].sort((a, b) => (a.starred === b.starred ? 0 : a.starred ? -1 : 1));
}

// Group names to show: every group, plus names that only tasks still carry.
export function groupNamesInUse(groups: GroupRef[], tasks: Pick<Task, "taskGroup">[]): string[] {
  const names = groups.map((group) => group.name);
  const seen = new Set(names);
  for (const task of tasks) {
    if (!task.taskGroup || seen.has(task.taskGroup)) continue;
    names.push(task.taskGroup);
    seen.add(task.taskGroup);
  }
  return names;
}
