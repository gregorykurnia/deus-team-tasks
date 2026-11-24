import { addDays, isWeekend, shortDate } from "./dates";
import { AWAY_WINDOW_DAYS, type AwayDay } from "./leave";
import { personNameKey } from "./peopleInput";
import { monthGridDays } from "./planCalendar";
import { SPARK_DAYS } from "./planPeople";
import { monthOf, weekStart, type PlanState } from "./planView";

export function planAwayWindow(state: PlanState, today: string) {
  if (state.view === "month") return monthGridDays(monthOf(state, today));
  if (state.view === "people") return { from: today, to: addDays(today, SPARK_DAYS - 1) };
  if (state.view !== "day") return null;
  if (!state.date) return { from: today, to: addDays(today, AWAY_WINDOW_DAYS - 1) };
  const from = weekStart(state.date);
  return { from, to: addDays(from, 6) };
}

export function awayByDate(days: readonly AwayDay[], person: string | null): Map<string, AwayDay[]> {
  const byDate = new Map<string, AwayDay[]>();
  const key = person ? personNameKey(person) : null;
  for (const day of days) {
    if (key && key !== personNameKey(day.name)) continue;
    const entries = byDate.get(day.date) ?? [];
    entries.push(day);
    byDate.set(day.date, entries);
  }
  return byDate;
}

export function awayName(day: AwayDay, compact = false): string {
  const time = day.part === "hours" ? ` ${day.from}–${day.to}`
    : day.part === "day" ? "" : compact ? " ½" : ` ½ ${day.part}`;
  return `${day.name}${time}${day.waiting ? " (Waiting)" : ""}`;
}

export function awayForPeople(days: readonly AwayDay[], names: string[]): Map<string, AwayDay[]> {
  const namesByKey = new Map(names.map((name) => [personNameKey(name), name]));
  const exactNames = new Set(names);
  const byPerson = new Map<string, AwayDay[]>();
  for (const day of days) {
    const key = personNameKey(day.name);
    const name = exactNames.has(day.name) ? day.name : namesByKey.get(key) ?? day.name;
    namesByKey.set(key, name);
    const entries = byPerson.get(name) ?? [];
    entries.push(day);
    byPerson.set(name, entries);
  }
  return byPerson;
}

// The next weekday after a date: full days off on a Friday and the Monday after are one period.
function nextWeekday(iso: string): string {
  let next = addDays(iso, 1);
  while (isWeekend(next)) next = addDays(next, 1);
  return next;
}

export function awayPeriods(days: readonly AwayDay[], today: string) {
  const periods: { from: string; to: string; waiting?: true; part: string }[] = [];
  for (const day of [...days].sort((a, b) => a.date.localeCompare(b.date))) {
    const previous = periods.at(-1);
    // Only whole days join a period; half days and hours keep their own label with the part of the day.
    const part = day.part === "hours" ? ` ${day.from}–${day.to}` : day.part === "day" ? "" : ` ½ ${day.part}`;
    if (previous && !part && !previous.part && previous.waiting === day.waiting && day.date <= nextWeekday(previous.to)) previous.to = day.date;
    else periods.push({ from: day.date, to: day.date, waiting: day.waiting, part });
  }
  return periods.map(({ from, to, waiting, part }) => {
    const end = shortDate(to, today);
    const start = from.slice(0, 7) === to.slice(0, 7) ? Number(from.slice(8)) : shortDate(from, today);
    return { label: `Away ${from === to ? end : `${start}–${end}`}${part}${waiting ? " (Waiting)" : ""}`, waiting };
  });
}
