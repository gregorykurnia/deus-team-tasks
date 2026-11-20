import { noticeName } from "./assignNotify";
import { addDays, daysBetween, isIsoDay, isWeekend, parseIso, plural } from "./dates";
import { isParked } from "./parking";
import { hasTaskPerson, taskPersonKeys } from "./peopleInput";
import type { Task } from "./types";

export function buildMorningSummary(tasks: readonly Task[], name: string, today: string, email?: string) {
  const person = taskPersonKeys(name, email);
  if (!person.size || !isIsoDay(today) || isWeekend(today)) return null;
  const friday = parseIso(today).getDay() === 5;
  const nextDay = addDays(today, 1), monday = addDays(today, 3);
  const groups: { late: Task[]; today: Task[]; tomorrow: Task[]; byMonday: Task[] } = {
    late: [], today: [], tomorrow: [], byMonday: [],
  };
  const seen = new Set<string>();
  for (const task of tasks) {
    if (seen.has(task.id)) continue;
    seen.add(task.id);
    if (task.completed || isParked(task, today) || !isIsoDay(task.endDate)
      || !hasTaskPerson(task.responsible, person)) continue;
    if (task.endDate < today) groups.late.push(task);
    else if (task.endDate === today) groups.today.push(task);
    else if (friday && task.endDate <= monday) groups.byMonday.push(task);
    else if (!friday && task.endDate === nextDay) groups.tomorrow.push(task);
  }
  const sections = [
    { tasks: groups.late, title: "late", label: "Late", late: true },
    { tasks: groups.today, title: "due today", label: "Today" },
    { tasks: friday ? groups.byMonday : groups.tomorrow, title: friday ? "due by Monday" : "tomorrow", label: friday ? "By Monday" : "Tomorrow" },
  ];
  const count = sections.reduce((sum, section) => sum + section.tasks.length, 0);
  if (!count) return null;
  let shown = 0;
  const lines: string[] = [], titles: string[] = [];
  for (const section of sections) {
    section.tasks.sort((a, b) => a.endDate.localeCompare(b.endDate) || a.id.localeCompare(b.id));
    if (!section.tasks.length) continue;
    titles.push(`${section.tasks.length.toLocaleString("en-US")} ${section.title}`);
    const names = section.tasks.slice(0, 3 - shown).map((task) => noticeName(task.task)
      + (section.late ? ` (${plural(daysBetween(task.endDate, today), "day")} late)` : ""));
    shown += names.length;
    if (names.length) lines.push(`${section.label}: ${names.join(", ")}`);
  }
  if (count > shown) lines.push(`+${(count - shown).toLocaleString("en-US")} more`);
  return { groups, count, title: titles.join(", "), body: lines.join("\n"), url: `/plan?view=people&person=${encodeURIComponent(name)}` };
}
