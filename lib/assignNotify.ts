import { isIsoDay } from "./dates";
import type { Kind } from "./kinds";
import { personNameKey } from "./peopleInput";
import type { Task } from "./types";

export interface AssignmentPerson { email: string; name: string; active: boolean }

export function assignmentRecipients(responsible: unknown, notified: unknown, people: readonly AssignmentPerson[], senderEmail?: string) {
  const keys = (value: unknown) => new Set((Array.isArray(value) ? value : [])
    .filter((name): name is string => typeof name === "string" && !!name.trim()).map(personNameKey));
  const assigned = keys(responsible), told = keys(notified), seen = new Set<string>();
  const linked = people.filter((person) => {
    const key = personNameKey(person.name);
    if (!person.active || !key || key === "full team" || !assigned.has(key) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return {
    owed: linked.filter((person) => !told.has(personNameKey(person.name)) && person.email !== senderEmail),
    notified: linked.map((person) => person.name),
  };
}

// Keep each name to 60 characters and one line, including the ellipsis.
function noticeName(value: unknown): string {
  const text = typeof value === "string" ? value.replace(/\s+/gu, " ").trim() : "";
  const chars = Array.from(text || "Untitled task");
  return chars.length > 60 ? chars.slice(0, 59).join("") + "…" : chars.join("");
}

export function assignmentMessage(task: Pick<Task, "id" | "task" | "endDate">, parentName?: string, kind: Kind = "internal") {
  const deadline = isIsoDay(task.endDate)
    ? `Deadline ${new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jakarta", weekday: "short", day: "numeric", month: "short" })
      .format(new Date(`${task.endDate}T00:00:00+07:00`)).replace(",", "")}`
    : "No deadline";
  const words = { internal: "Internal", prospect: "Prospect work", client: "Client work" };
  return {
    title: "New task for you",
    body: `${noticeName(task.task)}\n${parentName === undefined ? `${deadline} · ${words[kind]}` : `Subtask of ${noticeName(parentName)} · ${deadline}`}`,
    url: `/?task=${encodeURIComponent(task.id)}`,
  };
}

export function assignmentTaskId(id: unknown): id is string {
  return typeof id === "string" && id.length > 0 && new TextEncoder().encode(id).length <= 1500
    && !/[\/\u0000-\u001f\u007f\ud800-\udfff]/u.test(id) && id !== "." && id !== ".." && !/^__.*__$/.test(id);
}
