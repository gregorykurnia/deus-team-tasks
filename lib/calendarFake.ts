import "server-only";
import type { calendar_v3 } from "googleapis";
import { USE_EMULATOR } from "./emulator";

export interface CalendarClient {
  update(id: string, body: calendar_v3.Schema$Event): Promise<calendar_v3.Schema$Event>;
  insert(id: string, body: calendar_v3.Schema$Event): Promise<calendar_v3.Schema$Event>;
  delete(id: string): Promise<void>;
}

// Fixed local endpoint, with the emulator's owner token. No test-only production rules are needed.
const BASE = "http://127.0.0.1:8180/v1/projects/deus-team-tasks/databases/(default)/documents";
const headers = { Authorization: "Bearer owner", "Content-Type": "application/json" };
type Stored = { fields?: { event?: { stringValue: string }; fail?: { integerValue: string }; failEventId?: { stringValue: string } } };

function assertFake() {
  if (!USE_EMULATOR || process.env.CALENDAR_FAKE !== "1") throw new Error("The fake calendar requires the local emulator and CALENDAR_FAKE=1.");
}

function failure(code: number): never {
  throw Object.assign(new Error("Fake calendar request failed."), { code });
}

async function read(path: string): Promise<Stored | null> {
  assertFake();
  const response = await fetch(`${BASE}/${path}`, { headers, cache: "no-store" });
  if (response.status === 404) return null;
  if (!response.ok) failure(response.status);
  return response.json();
}

async function beforeRequest(id: string) {
  const control = await read("settings/test-calendar");
  const code = Number(control?.fields?.fail?.integerValue);
  const failEventId = control?.fields?.failEventId?.stringValue;
  if (code && (!failEventId || failEventId === id)) failure(code);
  const stored = await read(`testCalendarEvents/${id}`);
  return stored?.fields?.event ? JSON.parse(stored.fields.event.stringValue) as calendar_v3.Schema$Event : null;
}

async function write(id: string, body: calendar_v3.Schema$Event, insert = false) {
  assertFake();
  const event = { ...body, id, htmlLink: `https://calendar.example.test/event/${id}` };
  // The full Google resource is serialized in `event`; `status` is directly readable by browser checks.
  const response = await fetch(`${BASE}/testCalendarEvents/${id}${insert ? "?currentDocument.exists=false" : ""}`, {
    method: "PATCH", headers,
    body: JSON.stringify({ fields: { event: { stringValue: JSON.stringify(event) }, status: { stringValue: event.status } } }),
  });
  if (!response.ok) failure(response.status === 409 ? 409 : response.status);
  return event;
}

const fake: CalendarClient = {
  async update(id, body) {
    const previous = await beforeRequest(id);
    if (!previous) failure(404);
    return write(id, body);
  },
  async insert(id, body) {
    if (await beforeRequest(id)) failure(409); // Cancelled IDs remain reserved, too.
    return write(id, body, true);
  },
  async delete(id) {
    const previous = await beforeRequest(id);
    if (!previous) failure(404);
    if (previous.status === "cancelled") failure(410);
    await write(id, { ...previous, status: "cancelled" });
  },
};

export function getFakeCalendarClient(): CalendarClient {
  assertFake();
  return fake;
}
