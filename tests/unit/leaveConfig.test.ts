import { afterEach, expect, it, vi } from "vitest";
import { leaveToday } from "@/lib/leave.server";

vi.hoisted(() => { vi.stubEnv("NEXT_PUBLIC_USE_EMULATOR", "0"); });
vi.mock("@/lib/admin", () => ({ adminDb: { collection: vi.fn() } }));

afterEach(() => vi.unstubAllEnvs());

it("ignores LEAVE_TEST_DATE when the emulator is off", () => {
  vi.stubEnv("LEAVE_TEST_DATE", "2030-01-01");
  expect(leaveToday(new Date("2027-02-10T17:00:00Z"))).toBe("2027-02-11");
});
