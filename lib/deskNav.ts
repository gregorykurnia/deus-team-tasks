// What the side bar counts and lists (guide 3): open tasks (not parked), the ones Today
// shows, and the task groups with their badge and open count.
import { todayIso } from "./dates";
import { initials } from "./people";
import type { CompaniesById } from "./kinds";
import { filterTasks, isOpen } from "./taskQueries";
import type { TaskGroup } from "./taskGroups";
import type { Task } from "./types";
import { dueBucket } from "./urgency";

export interface NavCounts {
  today: number; // overdue or due within 3 days
  tasks: number; // open
}

export function navCounts(tasks: Task[], today: string = todayIso()): NavCounts {
  const open = tasks.filter((t) => isOpen(t, today));
  const urgent = open.filter((t) => {
    const bucket = dueBucket(t, today);
    return bucket === "overdue" || bucket === "soon";
  });
  return { today: urgent.length, tasks: open.length };
}

export const GROUP_HUES = 6; // --grp-0 to --grp-5

export interface GroupNavItem extends TaskGroup {
  badge: string;
  hue: number; // handed out in the order groups were made
  open: number;
}

// Groups arrive in the order they were made. Important ones come first, then A to Z.
export function groupNavItems(groups: TaskGroup[], tasks: Task[], companies: CompaniesById): GroupNavItem[] {
  return groups
    .map((g, i) => ({
      ...g,
      badge: initials(g.name),
      hue: i % GROUP_HUES,
      open: filterTasks(tasks, { view: "open", group: g.name }, { companies }).length,
    }))
    .sort((a, b) => (a.starred === b.starred ? a.name.localeCompare(b.name, "en", { sensitivity: "base" }) : a.starred ? -1 : 1));
}
