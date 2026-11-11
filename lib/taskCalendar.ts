// Pure task-to-event mapping, shared by the sheet and the server. No calendar or database calls.
import type { calendar_v3 } from "googleapis";
import { TEAM_TIME_ZONE } from "./calendarEvents";
import type { PipelineEntry } from "./clientTypes";
import { addDays, isIsoDay } from "./dates";
import type { Task } from "./types";

type CalendarTask = Pick<Task, "startDate" | "endDate" | "calendar">;
export type CalendarTimeErrors = Partial<Record<"startDate" | "endDate" | "startTime" | "endTime", string>>;
type Parent = Pick<Task, "id" | "task"> | null | undefined;
type Company = Pick<PipelineEntry, "company"> | null | undefined;

// Empty time inputs mean all day. Unmarked tasks need no dates or times.
export function validateCalendarTimes(task: CalendarTask): CalendarTimeErrors {
  const errors: CalendarTimeErrors = {};
  if (!task.calendar) return errors;
  if (!isIsoDay(task.startDate)) errors.startDate = "Choose a real start date for the calendar event.";
  if (!isIsoDay(task.endDate)) errors.endDate = "Choose a real end date for the calendar event.";
  if (!errors.startDate && !errors.endDate && task.endDate < task.startDate) {
    errors.endDate = "The end date must be on or after the start date.";
  }

  const start = task.calendar.startTime ?? "";
  const end = task.calendar.endTime ?? "";
  const time = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (typeof start !== "string" || (start !== "" && (start.length !== 5 || !time.test(start)))) errors.startTime = "Start time must use HH:MM (00:00–23:59).";
  if (typeof end !== "string" || (end !== "" && (end.length !== 5 || !time.test(end)))) errors.endTime = "End time must use HH:MM (00:00–23:59).";
  if (start !== "" && end === "") errors.endTime = "Add an end time to go with the start time.";
  if (end !== "" && start === "") errors.startTime = "Add a start time to go with the end time.";
  if (start && end && Object.keys(errors).length === 0 && `${task.endDate}T${end}` <= `${task.startDate}T${start}`) {
    errors.endTime = "The end time must be after the start time.";
  }
  return errors;
}

// Web Crypto keeps this module usable in the browser too; SHA-256 hashes UTF-8 task IDs without I/O.
export async function calendarEventId(taskId: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(taskId));
  return `dt${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

export function taskEventBody(task: Task, parent: Parent, company: Company, origin: string): calendar_v3.Schema$Event {
  if (!task.calendar) throw new Error("Task is not marked for the calendar.");
  const errors = validateCalendarTimes(task);
  if (Object.keys(errors).length) throw new Error(Object.entries(errors).map(([field, error]) => `${field}: ${error}`).join(" "));

  const mainTask = task.parentId !== task.id && parent?.id === task.parentId ? parent : undefined;
  const description = [
    mainTask ? `Main task: ${mainTask.task}` : undefined,
    company ? `Company: ${company.company}` : undefined,
    task.keyPoints ? `Key points:\n${task.keyPoints}` : undefined,
    `${origin.replace(/\/+$/, "")}/tasks?task=${encodeURIComponent(task.id)}`,
  ].filter((line) => line !== undefined).join("\n\n");
  const timed = !!task.calendar.startTime;
  return {
    summary: task.task,
    description,
    status: "confirmed",
    start: timed
      ? { dateTime: `${task.startDate}T${task.calendar.startTime}:00`, timeZone: TEAM_TIME_ZONE }
      : { date: task.startDate },
    end: timed
      ? { dateTime: `${task.endDate}T${task.calendar.endTime}:00`, timeZone: TEAM_TIME_ZONE }
      : { date: addDays(task.endDate, 1) },
    reminders: { useDefault: true },
    extendedProperties: { private: { deusTaskId: task.id } },
  };
}

// The event's content is its key; origin is deployment configuration, so the link is relative here.
// Sharing the mapper means sync metadata, done/parked and unrelated task fields cannot affect the key.
export function calendarKey(task: Task, parent: Parent, company: Company): string | undefined {
  return task.calendar ? JSON.stringify(taskEventBody(task, parent, company, "")) : undefined;
}

export type CalendarStatus = "on" | "adding" | "stale";

// What task details says about a saved, marked task (C04): on the calendar, a sync in flight, or not up to date when the
// calendar holds an older version of the task or the last sync failed. Unmarked tasks have no status.
export function calendarStatus(task: Task, parent: Parent, company: Company, pending: boolean): CalendarStatus | undefined {
  if (!task.calendar) return undefined;
  if (pending) return "adding";
  let key: string | undefined;
  try { key = calendarKey(task, parent, company); } catch { return "stale"; }
  return task.calendarSync?.error || !task.calendarSync?.synced || key !== task.calendarSync.synced ? "stale" : "on";
}
