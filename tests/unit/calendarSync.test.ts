import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { calendar, jwt, update, insert, remove } = vi.hoisted(() => {
  const update = vi.fn(), insert = vi.fn(), remove = vi.fn();
  return { update, insert, remove, jwt: vi.fn(function () {}), calendar: vi.fn(() => ({ events: { update, insert, delete: remove } })) };
});
vi.mock("googleapis", () => ({ google: { calendar, auth: { JWT: jwt } } }));
vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/lib/firebaseClients", () => ({ clientsDb: {} }));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("NEXT_PUBLIC_USE_EMULATOR", "1");
  vi.stubEnv("CALENDAR_FAKE", "1");
  vi.stubEnv("GOOGLE_EVENTS_CALENDAR_ID", "test-calendar");
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("calendar write safety and client selection", () => {
  it.each([
    { mode: "test", emulator: "1", fake: "1", id: "test-calendar", enabled: true, real: false },
    { mode: "development", emulator: "1", fake: "1", id: "test-calendar", enabled: true, real: false },
    { mode: "test", emulator: "1", fake: "", id: "test-calendar", enabled: false, real: false },
    { mode: "test", emulator: "1", fake: "1", id: "", enabled: false, real: false },
    { mode: "test", emulator: "", fake: "1", id: "test-calendar", enabled: false, real: false },
    { mode: "production", emulator: "1", fake: "1", id: "test-calendar", enabled: false, real: false },
    { mode: "production", emulator: "", fake: "1", id: "test-calendar", enabled: false, real: false },
    { mode: "production", emulator: "1", fake: "", id: "", enabled: false, real: false },
    { mode: "production", emulator: "", fake: "", id: "test-calendar", enabled: true, real: true },
  ])("selects safely: $mode / emulator=$emulator / fake=$fake / id=$id", async ({ mode, emulator, fake, id, enabled, real }) => {
    vi.stubEnv("NODE_ENV", mode);
    vi.stubEnv("NEXT_PUBLIC_USE_EMULATOR", emulator);
    vi.stubEnv("CALENDAR_FAKE", fake);
    vi.stubEnv("GOOGLE_EVENTS_CALENDAR_ID", id);
    const { calendarWritesEnabled, getCalendarClient } = await import("@/lib/calendarSync");
    expect(calendarWritesEnabled()).toBe(enabled);
    const client = await getCalendarClient();
    expect(!!client).toBe(enabled);
    expect(calendar).toHaveBeenCalledTimes(real ? 1 : 0);
    const { getFakeCalendarClient } = await import("@/lib/calendarFake");
    if (mode !== "production" && emulator === "1" && fake === "1") expect(getFakeCalendarClient()).toBeTruthy();
    else expect(() => getFakeCalendarClient()).toThrow("requires the local emulator");
  });

  it("uses the events scope, target calendar, supplied IDs and no notifications (mocked Google only)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_USE_EMULATOR", "");
    vi.stubEnv("CALENDAR_FAKE", "");
    vi.stubEnv("GOOGLE_SERVICE_ACCOUNT_EMAIL", "fake@example.test");
    vi.stubEnv("GOOGLE_SERVICE_ACCOUNT_KEY", "fake-key\\nsecond-line");
    update.mockResolvedValue({ data: { htmlLink: "updated" } });
    insert.mockResolvedValue({ data: { htmlLink: "inserted" } });
    remove.mockResolvedValue({});
    const { getCalendarClient } = await import("@/lib/calendarSync");
    const client = (await getCalendarClient())!;
    expect(jwt).toHaveBeenCalledWith({ email: "fake@example.test", key: "fake-key\nsecond-line", scopes: ["https://www.googleapis.com/auth/calendar.events"] });
    const body = { summary: "Meeting", status: "confirmed" };
    expect(await client.update("dt12345", body)).toEqual({ htmlLink: "updated" });
    expect(await client.insert("dt12345", body)).toEqual({ htmlLink: "inserted" });
    await client.delete("dt12345");
    const common = { calendarId: "test-calendar", sendUpdates: "none" };
    expect(update).toHaveBeenCalledWith({ ...common, eventId: "dt12345", requestBody: body });
    expect(insert).toHaveBeenCalledWith({ ...common, requestBody: { ...body, id: "dt12345" } });
    expect(remove).toHaveBeenCalledWith({ ...common, eventId: "dt12345" });
  });

  it("a retained fake client refuses requests if the fake is turned off", async () => {
    const { getFakeCalendarClient } = await import("@/lib/calendarFake");
    const client = getFakeCalendarClient();
    vi.stubEnv("CALENDAR_FAKE", "");
    const fetch = vi.spyOn(globalThis, "fetch");
    await expect(client.delete("dt12345")).rejects.toThrow("requires the local emulator");
    expect(fetch).not.toHaveBeenCalled();
  });
});
