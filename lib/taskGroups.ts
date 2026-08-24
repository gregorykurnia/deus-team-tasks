const KEY = "task_groups";

export function loadTaskGroups(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const s = window.localStorage.getItem(KEY);
    return s ? JSON.parse(s) : [];
  } catch {
    return [];
  }
}

export function saveTaskGroups(groups: string[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(groups));
}
