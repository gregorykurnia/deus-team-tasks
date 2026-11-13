import "server-only";
import { TEAM_TIME_ZONE } from "./calendarEvents";
import { USE_EMULATOR } from "./emulator";
import { freeTimeDates, freeTimeDays, freeTimeWindow, WORK_END, WORK_START, type BusyBlock, type FreeTimeDay } from "./freeTimes";

type CalendarBusy = Record<string, { busy: BusyBlock[]; failed: boolean }>;
export type BusyQuery = (calendarIds: string[], timeMin: string, timeMax: string) => Promise<CalendarBusy>;

export type FreeTimesResult =
  | { status: "off" | "failed"; message: string }
  | { status: "invalid"; message: string }
  | {
    status: "ok" | "partial"; timeZone: string; workingHours: string; days: FreeTimeDay[];
    calendars: { name: string; checked: boolean }[]; message?: string;
  };

// Busy times only: Google's free/busy answer carries no titles, guests or notes.
const googleBusy: BusyQuery = async (calendarIds, timeMin, timeMax) => {
  const { google } = await import("googleapis");
  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_SERVICE_ACCOUNT_KEY?.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
  });
  const response = await google.calendar({ version: "v3", auth }).freebusy.query({
    requestBody: { timeMin, timeMax, timeZone: TEAM_TIME_ZONE, items: calendarIds.map((id) => ({ id })) },
  });
  return Object.fromEntries(calendarIds.map((id) => {
    const found = response.data.calendars?.[id];
    const busy = (found?.busy ?? []).flatMap(({ start, end }) => (start && end ? [{ start, end }] : []));
    return [id, { busy, failed: !found || !!found.errors?.length }];
  }));
};

function calendars() {
  const list = [
    { id: process.env.GOOGLE_EVENTS_CALENDAR_ID, name: "Task events calendar" },
    { id: process.env.GOOGLE_CALENDAR_ID, name: "Team calendar" },
  ].filter((calendar): calendar is { id: string; name: string } => !!calendar.id);
  return list.filter((calendar, index) => list.findIndex((other) => other.id === calendar.id) === index);
}

/** Busy and free working-hours times for each day, from every calendar the app is connected to. */
export async function findFreeTimes(input: { startDate: string; endDate: string }, query?: BusyQuery): Promise<FreeTimesResult> {
  const range = freeTimeDates(input.startDate, input.endDate);
  if ("error" in range) return { status: "invalid", message: range.error };
  const connected = calendars();
  const ask = query ?? (USE_EMULATOR || !process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_SERVICE_ACCOUNT_KEY ? null : googleBusy);
  if (!connected.length || !ask) {
    return { status: "off", message: "No calendar is connected, so free times can't be checked. Suggest a time and say it wasn't checked." };
  }
  const { timeMin, timeMax } = freeTimeWindow(range.dates);
  let answer: CalendarBusy;
  try {
    answer = await ask(connected.map(({ id }) => id), timeMin, timeMax);
  } catch {
    return { status: "failed", message: "The calendar couldn't be read just now. Suggest a time and say it wasn't checked, or try again." };
  }
  const checked = connected.map(({ id, name }) => ({ name, checked: !!answer[id] && !answer[id].failed }));
  if (!checked.some((calendar) => calendar.checked)) {
    return { status: "failed", message: "The calendar couldn't be read just now. Suggest a time and say it wasn't checked, or try again." };
  }
  const busy = connected.flatMap(({ id }) => (answer[id] && !answer[id].failed ? answer[id].busy : []));
  const partial = checked.some((calendar) => !calendar.checked);
  return {
    status: partial ? "partial" : "ok",
    timeZone: TEAM_TIME_ZONE,
    workingHours: `${WORK_START}–${WORK_END}`,
    days: freeTimeDays(range.dates, busy),
    calendars: checked,
    ...(partial && { message: "One calendar couldn't be read; its busy times are missing. Say so when suggesting a time." }),
  };
}
