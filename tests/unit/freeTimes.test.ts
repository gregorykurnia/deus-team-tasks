import { afterEach, describe, expect, it, vi } from "vitest";
import { freeTimeDates, freeTimeDays, freeTimeWindow } from "@/lib/freeTimes";
import { findFreeTimes, type BusyQuery } from "@/lib/freeTimeServer";

// Jakarta is UTC+7: 10:00 local is 03:00Z.
const at = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00+07:00`).toISOString();

describe("free times per Jakarta day", () => {
  it("lists every day, and refuses bad, reversed or long ranges", () => {
    expect(freeTimeDates("2026-11-30", "2026-12-02")).toEqual({ dates: ["2026-11-30", "2026-12-01", "2026-12-02"] });
    expect(freeTimeDates("2026-02-30", "2026-03-01")).toEqual({ error: "Use real yyyy-mm-dd dates." });
    expect(freeTimeDates("2026-11-20", "2026-11-19")).toHaveProperty("error");
    expect(freeTimeDates("2026-11-01", "2026-11-15")).toHaveProperty("error");
    expect(freeTimeDates("2026-11-01", "2026-11-14")).toHaveProperty("dates");
  });

  it("asks the calendar from Jakarta midnight to the end of the last day", () => {
    expect(freeTimeWindow(["2026-11-16", "2026-11-17"])).toEqual({
      timeMin: "2026-11-15T17:00:00.000Z", timeMax: "2026-11-17T17:00:00.000Z",
    });
  });

  it("merges overlapping busy blocks and leaves the free gaps inside 09:00–17:00", () => {
    const [day] = freeTimeDays(["2026-11-16"], [
      { start: at("2026-11-16", "10:00"), end: at("2026-11-16", "11:00") },
      { start: at("2026-11-16", "10:30"), end: at("2026-11-16", "12:00") },
      { start: at("2026-11-16", "12:10"), end: at("2026-11-16", "13:00") },
      { start: at("2026-11-16", "19:00"), end: at("2026-11-16", "20:00") },
    ]);
    expect(day).toEqual({
      date: "2026-11-16", weekday: "Monday",
      busy: ["10:00–12:00", "12:10–13:00", "19:00–20:00"],
      // The 10-minute gap at 12:00 is too short to offer.
      free: ["09:00–10:00", "13:00–17:00"],
    });
  });

  it("splits a block across midnight between its days and shows a fully busy day as no free time", () => {
    const days = freeTimeDays(["2026-11-16", "2026-11-17", "2026-11-18"], [
      { start: at("2026-11-16", "22:00"), end: at("2026-11-17", "09:30") },
      { start: at("2026-11-18", "08:00"), end: at("2026-11-18", "18:00") },
    ]);
    expect(days[0].busy).toEqual(["22:00–24:00"]);
    expect(days[1]).toMatchObject({ busy: ["00:00–09:30"], free: ["09:30–17:00"] });
    expect(days[2]).toMatchObject({ busy: ["08:00–18:00"], free: [] });
  });
});

describe("findFreeTimes", () => {
  afterEach(() => vi.unstubAllEnvs());
  const range = { startDate: "2026-11-16", endDate: "2026-11-16" };

  it("combines both connected calendars, asking each once", async () => {
    vi.stubEnv("GOOGLE_EVENTS_CALENDAR_ID", "events@example.test");
    vi.stubEnv("GOOGLE_CALENDAR_ID", "team@example.test");
    const query = vi.fn<BusyQuery>(async () => ({
      "events@example.test": { busy: [{ start: at("2026-11-16", "09:00"), end: at("2026-11-16", "10:00") }], failed: false },
      "team@example.test": { busy: [{ start: at("2026-11-16", "15:00"), end: at("2026-11-16", "16:00") }], failed: false },
    }));
    const result = await findFreeTimes(range, query);
    expect(query).toHaveBeenCalledWith(["events@example.test", "team@example.test"], "2026-11-15T17:00:00.000Z", "2026-11-16T17:00:00.000Z");
    expect(result).toMatchObject({ status: "ok", days: [{ busy: ["09:00–10:00", "15:00–16:00"], free: ["10:00–15:00", "16:00–17:00"] }] });
    expect(JSON.stringify(result)).not.toContain("example.test");
  });

  it("checks one calendar once when both settings name it", async () => {
    vi.stubEnv("GOOGLE_EVENTS_CALENDAR_ID", "same@example.test");
    vi.stubEnv("GOOGLE_CALENDAR_ID", "same@example.test");
    const query = vi.fn<BusyQuery>(async () => ({ "same@example.test": { busy: [], failed: false } }));
    expect(await findFreeTimes(range, query)).toMatchObject({ status: "ok", calendars: [{ name: "Task events calendar", checked: true }] });
    expect(query.mock.calls[0][0]).toEqual(["same@example.test"]);
  });

  it("says when a calendar couldn't be read, or none could", async () => {
    vi.stubEnv("GOOGLE_EVENTS_CALENDAR_ID", "events@example.test");
    vi.stubEnv("GOOGLE_CALENDAR_ID", "team@example.test");
    const partial = await findFreeTimes(range, async () => ({
      "events@example.test": { busy: [], failed: false }, "team@example.test": { busy: [], failed: true },
    }));
    expect(partial).toMatchObject({ status: "partial", calendars: [{ checked: true }, { checked: false }] });
    expect(await findFreeTimes(range, async () => { throw new Error("network"); })).toMatchObject({ status: "failed" });
  });

  it("is off without a connected calendar, never reaching Google, and refuses a bad range", async () => {
    vi.stubEnv("GOOGLE_EVENTS_CALENDAR_ID", "");
    vi.stubEnv("GOOGLE_CALENDAR_ID", "");
    const query = vi.fn<BusyQuery>();
    expect(await findFreeTimes(range, query)).toMatchObject({ status: "off" });
    expect(query).not.toHaveBeenCalled();
    expect(await findFreeTimes({ startDate: "2026-11-16", endDate: "2026-12-31" }, query)).toMatchObject({ status: "invalid" });
  });
});
