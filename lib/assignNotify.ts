import { isIsoDay } from "./dates";
import type { Kind } from "./kinds";
import { hasTaskPerson, personNameKey, taskPersonKeys } from "./peopleInput";
import type { Task } from "./types";

export interface AssignmentPerson { email: string; name: string; active: boolean }

export function assignmentRecipients(responsible: unknown, notified: unknown, people: readonly AssignmentPerson[], senderEmail?: string) {
  const seen = new Set<string>(), linked: string[] = [], owed: AssignmentPerson[] = [];
  for (const person of people) {
    const key = personNameKey(person.name);
    if (!person.active || seen.has(key)) continue;
    const keys = taskPersonKeys(person.name, person.email);
    if (!hasTaskPerson(responsible, keys)) continue;
    seen.add(key);
    linked.push(keys.has(key) ? person.name : person.email);
    if (person.email !== senderEmail && !hasTaskPerson(notified, keys)) owed.push(person);
  }
  return { owed, notified: linked };
}

// Keep each name to 60 characters and one line, including the ellipsis.
export function noticeName(value: unknown): string {
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
