import "server-only";
import { deleteField, doc, getDocFromServer, updateDoc, type UpdateData, type DocumentData } from "firebase/firestore";
import type { CalendarClient } from "./calendarFake";
import type { PipelineEntry } from "./clientTypes";
import { USE_EMULATOR } from "./emulator";
import { db } from "./firebase";
import { clientsDb } from "./firebaseClients";
import { calendarEventId, calendarKey, taskEventBody } from "./taskCalendar";
import type { Task } from "./types";

export interface CalendarSyncResult {
  taskId: string;
  status: "off" | "synced" | "removed" | "failed";
  link?: string;
  error?: string;
}

export function calendarWritesEnabled(): boolean {
  if (!process.env.GOOGLE_EVENTS_CALENDAR_ID) return false;
  if (USE_EMULATOR) return process.env.CALENDAR_FAKE === "1";
  return process.env.CALENDAR_FAKE !== "1";
}

export async function getCalendarClient(): Promise<CalendarClient | null> {
  if (!calendarWritesEnabled()) return null;
  if (USE_EMULATOR) return (await import("./calendarFake")).getFakeCalendarClient();
  const { google } = await import("googleapis");
  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_SERVICE_ACCOUNT_KEY?.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/calendar.events"],
  });
  const events = google.calendar({ version: "v3", auth }).events;
  const common = { calendarId: process.env.GOOGLE_EVENTS_CALENDAR_ID!, sendUpdates: "none" };
  return {
    update: async (eventId, requestBody) => (await events.update({ ...common, eventId, requestBody })).data,
    insert: async (id, requestBody) => (await events.insert({ ...common, requestBody: { ...requestBody, id } })).data,
    delete: async (eventId) => { await events.delete({ ...common, eventId }); },
  };
}

function code(error: unknown): number | string | undefined {
  if (!error || typeof error !== "object") return;
  const e = error as { code?: number | string; response?: { status?: number } };
  return e.response?.status ?? e.code;
}

// The save retry uses the same current task/parent/company key as the sync itself.
export async function readTaskCalendarState(taskId: string) {
  const snapshot = await getDocFromServer(doc(db, "tasks", taskId));
  const task = snapshot.exists() ? { ...snapshot.data(), id: snapshot.id } as Task : null;
  if (!task?.calendar) return { task, parent: null, company: null, key: undefined };
  const [parentDoc, companyDoc] = await Promise.all([
    task.parentId && task.parentId !== task.id ? getDocFromServer(doc(db, "tasks", task.parentId)) : null,
    task.linkedClientId != null ? getDocFromServer(doc(clientsDb, "pipeline", String(task.linkedClientId))) : null,
  ]);
  const parent = parentDoc?.exists() ? { ...parentDoc.data(), id: parentDoc.id } as Task : null;
  const company = companyDoc?.exists() ? companyDoc.data() as PipelineEntry : null;
  return { task, parent, company, key: calendarKey(task, parent, company) };
}

async function updateSync(taskId: string, patch: UpdateData<DocumentData>) {
  try {
    await updateDoc(doc(db, "tasks", taskId), patch);
  } catch (error) {
    if (code(error) !== "not-found") throw error; // A deleted task must never be recreated.
  }
}

const SYNC_ERROR = "The calendar couldn't be updated. Try again.";
async function failed(taskId: string, error = SYNC_ERROR): Promise<CalendarSyncResult> {
  try { await updateSync(taskId, { "calendarSync.error": error }); }
  catch { /* Even a Firestore failure must leave the task intact and return a plain per-ID failure. */ }
  return { taskId, status: "failed", error };
}

async function sync(taskId: string, origin: string): Promise<CalendarSyncResult> {
  try {
    const client = await getCalendarClient();
    if (!client) return { taskId, status: "off" };
    const eventId = await calendarEventId(taskId);
    for (let attempt = 0; attempt < 2; attempt++) {
      const { task, parent, company, key } = await readTaskCalendarState(taskId);
      let result: CalendarSyncResult;
      if (task?.calendar) {
        const body = taskEventBody(task, parent, company, origin);
        let event;
        try { event = await client.update(eventId, body); }
        catch (error) {
          if (code(error) !== 404 && code(error) !== 410) throw error;
          try { event = await client.insert(eventId, body); }
          catch (insertError) {
            if (code(insertError) !== 409) throw insertError;
            event = await client.update(eventId, body);
          }
        }
        await updateSync(taskId, {
          "calendarSync.synced": key,
          "calendarSync.link": event.htmlLink || deleteField(),
          "calendarSync.error": deleteField(),
        });
        result = { taskId, status: "synced", ...(event.htmlLink && { link: event.htmlLink }) };
      } else {
        try { await client.delete(eventId); }
        catch (error) { if (code(error) !== 404 && code(error) !== 410) throw error; }
        if (task) await updateSync(taskId, { calendarSync: deleteField() });
        result = { taskId, status: "removed" };
      }
      // A second pass handles edits, removing the mark, deletion, and changed parent/company context in flight.
      if ((await readTaskCalendarState(taskId)).key === key) return result;
    }
    return failed(taskId, "The task changed again while syncing. Try again.");
  } catch {
    return failed(taskId);
  }
}

// Calls in this server process run in order for each task; other tasks remain independent.
const pending = new Map<string, Promise<CalendarSyncResult>>();
export async function syncTaskCalendar(taskId: string, origin: string): Promise<CalendarSyncResult> {
  if (!calendarWritesEnabled()) return { taskId, status: "off" };
  const previous = pending.get(taskId);
  const current = (previous ?? Promise.resolve()).then(() => sync(taskId, origin));
  pending.set(taskId, current);
  try { return await current; }
  finally { if (pending.get(taskId) === current) pending.delete(taskId); }
}
