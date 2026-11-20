import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { deleteApp } from "firebase-admin/app";
import { adminApp, adminDataApp, adminDb } from "./admin";
import { wibToday } from "./followupServer";
import { db } from "./firebase";
import { clientsDb } from "./firebaseClients";
import { terminate } from "firebase/firestore";
import { sendMorningSummaries } from "./morningSummary.server";
import { savePushDevice } from "./push.server";
import * as transport from "./pushTransport.server";
import { GET } from "../app/api/notify/morning/route";
import { clearAll, seed } from "../tests/support/emulator";
import { PUSH_EMAIL as EMAIL, subscription } from "../tests/support/push";
import type { Task } from "./types";

const GREG = "gregory.kurnia@deushcs.com", TUESDAY = "2026-11-17", WEDNESDAY = "2026-11-18";
const person = adminDb.collection("people").doc(EMAIL);
const task: Task = { id: "task", task: "Send the quote", responsible: ["Audrey"], informed: [], keyPoints: "", startDate: "", endDate: TUESDAY, order: 0 };
const storeTask = (fields: Partial<Task> = {}) => { const { id, ...data } = { ...task, ...fields }; return adminDb.doc(`tasks/${id}`).set(data); };
const pushes = async () => (await adminDb.collection("_fakePush").get()).docs.map((d) => d.data());
const ping = (authorization: string | null = "Bearer morning-test-secret", signal?: AbortSignal) => GET(new Request("http://localhost/api/notify/morning", {
  ...(authorization === null ? {} : { headers: { Authorization: authorization } }), signal,
}));
function clock(instant: string) { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(instant)); }

beforeAll(() => {
  if (adminDataApp.options.projectId !== db.app.options.projectId || adminApp.options.projectId !== "demo-deus"
    || process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8180" || process.env.FIREBASE_AUTH_EMULATOR_HOST !== "127.0.0.1:9199") throw new Error("Morning tests require only local Firestore/Auth emulators and fake push.");
});
beforeEach(async () => {
  vi.stubEnv("NEXT_PUBLIC_SIGN_IN_ENABLED", "1"); vi.stubEnv("CRON_SECRET", "morning-test-secret");
  await clearAll();
  await person.set({ email: EMAIL, name: "Audrey", active: true });
  await adminDb.doc(`people/${GREG}`).set({ email: GREG, name: "Gregory", active: true });
  await savePushDevice(EMAIL, subscription()); await savePushDevice(GREG, subscription("greg"));
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllEnvs(); });
afterAll(async () => { await Promise.all([terminate(db), terminate(clientsDb)]); await deleteApp(adminApp); await deleteApp(adminDataApp); });

describe("weekday morning summaries with real emulator claims and fake delivery", () => {
  it("requires the actual configured bearer, including when the flag is off", async () => {
    await storeTask();
    expect((await ping(null)).status).toBe(401); expect((await ping("Bearer wrong")).status).toBe(401);
    vi.stubEnv("CRON_SECRET", undefined); expect((await ping("Bearer undefined")).status).toBe(401);
    vi.stubEnv("NEXT_PUBLIC_SIGN_IN_ENABLED", "0"); expect((await ping("Bearer undefined")).status).toBe(401);
    vi.stubEnv("CRON_SECRET", "morning-test-secret"); expect((await ping()).status).toBe(404);
    expect(await pushes()).toEqual([]); expect((await person.get()).get("summaryClaimDate")).toBeUndefined();
  });
  it("sends each due-today task with its client and makes one roundup for other deadlines", async () => {
    clock("2026-11-17T01:30:00Z"); expect(wibToday()).toBe(TUESDAY);
    await seed("clients", "pipeline", [{ id: 7, company: "Mayora Indah" }], { keepIdField: true });
    await seed("tasks", "tasks", [
      { ...task, linkedClientId: 7 },
      { ...task, id: "subtask", task: "Call back", parentId: task.id, linkedClientId: 7, responsible: [EMAIL] },
      { ...task, id: "internal", task: "Update the checklist" },
      { ...task, id: "late", task: "Late quote", endDate: "2026-11-16" },
      { ...task, id: "tomorrow", task: "Plan the visit", endDate: WEDNESDAY },
    ]);
    const response = await ping(); expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ date: TUESDAY, results: [
      { email: EMAIL, count: 5, status: "sent" }, { email: GREG, count: 0, status: "skipped" },
    ] });
    const notices = await pushes();
    expect(notices).toHaveLength(4);
    expect(notices).toEqual(expect.arrayContaining([
      { email: EMAIL, title: "Due today", body: "Send the quote (Mayora Indah)", url: "/?task=task" },
      { email: EMAIL, title: "Due today", body: "Call back (Mayora Indah)", url: "/?task=subtask" },
      { email: EMAIL, title: "Due today", body: "Update the checklist", url: "/?task=internal" },
      { email: EMAIL, title: "1 late, 1 tomorrow", body: "Late: Late quote (1 day late)\nTomorrow: Plan the visit",
        url: "/plan?view=people&person=Audrey" },
    ]));
    expect((await person.get()).get("lastSummaryDate")).toBe(TUESDAY);
    expect((await ping()).status).toBe(200); expect(await pushes()).toHaveLength(4);
    expect((await adminDb.doc(`people/${GREG}`).get()).get("summaryClaimDate")).toBeUndefined();
  });
  it("resends only due-today tasks to the configured recipient once after the regular summary", async () => {
    clock("2026-11-17T05:00:00Z");
    await person.update({ lastSummaryDate: TUESDAY, summaryClaimDate: TUESDAY });
    await seed("clients", "pipeline", [{ id: 7, company: "Mayora Indah" }], { keepIdField: true });
    await storeTask({ linkedClientId: 7, responsible: [EMAIL] });
    await storeTask({ id: "tomorrow", endDate: WEDNESDAY });
    await storeTask({ id: "greg", responsible: ["Gregory"] });

    vi.stubEnv("MORNING_DUE_TODAY_RESEND", `${TUESDAY}|${Date.now() + 60_000}|${EMAIL}`);
    expect((await ping("Bearer wrong")).status).toBe(401);
    expect(await pushes()).toEqual([]);
    const sent = await ping();
    expect(sent.status).toBe(200);
    expect(await sent.json()).toEqual({ date: TUESDAY, results: [{ email: EMAIL, count: 1, status: "sent" }] });
    expect(await pushes()).toEqual([{ email: EMAIL, title: "Due today", body: "Send the quote (Mayora Indah)", url: "/?task=task" }]);
    const record = await person.get();
    expect(record.get("lastSummaryDate")).toBe(TUESDAY);
    expect(record.get("dueTodayResendResult")).toEqual({ date: TUESDAY, count: 1, accepted: 1, status: "sent" });

    const repeated = await ping();
    expect(await repeated.json()).toMatchObject({ results: [{ email: EMAIL, status: "skipped" }] });
    expect(await pushes()).toHaveLength(1);
    expect((await adminDb.doc(`people/${GREG}`).get()).get("summaryClaimDate")).toBeUndefined();

    vi.stubEnv("MORNING_DUE_TODAY_RESEND", `${TUESDAY}|${Date.now() - 1}|${EMAIL}`);
    const regular = await ping();
    expect(await regular.json()).toMatchObject({ results: [{ email: EMAIL, status: "skipped" }, { email: GREG, status: "sent" }] });
  });
  it("uses Jakarta's date across UTC midnight and skips both Jakarta weekend days", async () => {
    await storeTask({ endDate: "2026-11-21" });
    for (const instant of ["2026-11-20T18:30:00Z", "2026-11-22T01:30:00Z"]) {
      clock(instant); expect((await ping()).status).toBe(200);
      expect(await sendMorningSummaries(wibToday())).toEqual([]);
    }
    expect(await pushes()).toEqual([]);
    clock("2026-11-22T18:30:00Z");
    const response = await ping(); expect((await response.json()).date).toBe("2026-11-23");
    expect((await pushes())[0]).toMatchObject({ title: "1 late", body: "Late: Send the quote (2 days late)" });
    expect((await person.get()).get("lastSummaryDate")).toBe("2026-11-23");
  });
  it("leaves inactive, malformed, device-less, done, parked and Informed-only records out", async () => {
    await adminDb.doc(`people/${GREG}`).update({ active: false });
    await adminDb.doc("people/bad@deushcs.com").set({ email: "bad@deushcs.com", active: true, name: " " });
    await adminDb.doc("people/no-device@deushcs.com").set({ email: "no-device@deushcs.com", active: true, name: "No Device" });
    await storeTask({ id: "greg", responsible: ["Gregory"] }); await storeTask({ id: "no-device", responsible: ["No Device"] });
    await storeTask({ id: "done", completed: true }); await storeTask({ id: "parked", parkedAt: Date.UTC(2026, 10, 1) });
    await storeTask({ id: "informed", responsible: [], informed: [{ name: "Audrey" }] });
    await adminDb.doc("tasks/odd").set({ responsible: null, endDate: TUESDAY });
    expect((await sendMorningSummaries(TUESDAY)).every((r) => r.status === "skipped")).toBe(true);
    expect(await pushes()).toEqual([]); expect((await person.get()).get("summaryClaimDate")).toBeUndefined();
    // Adding a first device on a later call can still receive that day's summary.
    await savePushDevice("no-device@deushcs.com", subscription("new"));
    await sendMorningSummaries(TUESDAY); expect((await pushes()).map((p) => p.email)).toEqual(["no-device@deushcs.com"]);
  });
  it("honors an existing lastSummaryDate even without a claim and resumes the following day", async () => {
    await storeTask(); await person.update({ lastSummaryDate: TUESDAY });
    await sendMorningSummaries(TUESDAY); expect(await pushes()).toEqual([]);
    await sendMorningSummaries(WEDNESDAY); expect(await pushes()).toHaveLength(1);
    expect((await person.get()).get("lastSummaryDate")).toBe(WEDNESDAY);
  });
  it("ignores malformed old date markers instead of suppressing every future summary", async () => {
    await storeTask(); await person.update({ lastSummaryDate: "unknown", summaryClaimDate: "2026-99-99" });
    expect((await sendMorningSummaries(TUESDAY)).find((r) => r.email === EMAIL)?.status).toBe("sent");
    expect((await person.get()).get("lastSummaryDate")).toBe(TUESDAY); expect(await pushes()).toHaveLength(1);
  });
  it("claims once under overlapping independent calls", async () => {
    await storeTask();
    await storeTask({ id: "second" });
    const results = await Promise.all([sendMorningSummaries(TUESDAY), sendMorningSummaries(TUESDAY), sendMorningSummaries(TUESDAY)]);
    expect(results.flat().filter((r) => r.status === "sent")).toHaveLength(1);
    expect((await pushes()).map((p) => p.url).sort()).toEqual(["/?task=second", "/?task=task"]);
  }, 20_000);
  it("sends the other due-today notices when one fails and keeps a rerun from duplicating them", async () => {
    await storeTask();
    await storeTask({ id: "second" });
    const deliver = transport.deliverPush; vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(transport, "deliverPush").mockImplementation(async (...args) => {
      if (args[2].url === "/?task=task") throw new Error("provider unavailable");
      await deliver(...args);
    });
    expect(await sendMorningSummaries(TUESDAY)).toContainEqual({ email: EMAIL, count: 2, status: "failed" });
    expect((await person.get()).get("lastSummaryDate")).toBe(TUESDAY);
    await sendMorningSummaries(TUESDAY);
    expect((await pushes()).map((p) => p.url)).toEqual(["/?task=second"]);
  });
  it("a failed claim remains retryable without any partial marker", async () => {
    await storeTask(); vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(adminDb, "runTransaction").mockRejectedValueOnce(new Error("unavailable"));
    expect((await sendMorningSummaries(TUESDAY)).find((r) => r.email === EMAIL)?.status).toBe("failed");
    expect((await person.get()).get("summaryClaimDate")).toBeUndefined(); expect(await pushes()).toEqual([]);
    expect((await sendMorningSummaries(TUESDAY)).find((r) => r.email === EMAIL)?.status).toBe("sent"); expect(await pushes()).toHaveLength(1);
  });
  it("keeps a lost provider reply from sending twice and continues another recipient", async () => {
    clock("2026-11-17T02:00:00Z"); await storeTask({ responsible: ["Audrey", "Gregory"] });
    const deliver = transport.deliverPush; vi.spyOn(console, "error").mockImplementation(() => {});
    const sender = vi.spyOn(transport, "deliverPush").mockImplementation(async (...args) => {
      await deliver(...args); if (args[0] === EMAIL) throw new Error("reply lost");
    });
    const response = await ping(); expect(response.status).toBe(503);
    expect((await response.json()).results).toContainEqual({ email: EMAIL, count: 1, status: "failed" });
    expect(await pushes()).toHaveLength(2); expect((await person.get()).get("lastSummaryDate")).toBeUndefined();
    await ping(); expect(await pushes()).toHaveLength(2);
    sender.mockRestore();
    expect((await sendMorningSummaries(WEDNESDAY)).filter((r) => r.status === "sent")).toHaveLength(2);
    expect(await pushes()).toHaveLength(4);
  });
  it("reports a partial device failure and records only confirmed sends, without repeating the delivered device", async () => {
    await storeTask(); await savePushDevice(EMAIL, subscription("laptop"));
    const deliver = transport.deliverPush; vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(transport, "deliverPush").mockImplementation(async (...args) => {
      if (args[1].endpoint === subscription().endpoint) throw new Error("no reply");
      await deliver(...args);
    });
    expect((await sendMorningSummaries(TUESDAY)).find((r) => r.email === EMAIL)?.status).toBe("failed");
    expect((await person.get()).get("lastSummaryDate")).toBe(TUESDAY); expect(await pushes()).toHaveLength(1);
    await sendMorningSummaries(TUESDAY); expect(await pushes()).toHaveLength(1);
  });
  it("a failed completion write cannot cause a resend after delivery landed", async () => {
    await storeTask(); const deliver = transport.deliverPush;
    const tx = vi.spyOn(adminDb, "runTransaction");
    vi.spyOn(transport, "deliverPush").mockImplementationOnce(async (...args) => {
      await deliver(...args); tx.mockRejectedValueOnce(new Error("completion unavailable"));
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await sendMorningSummaries(TUESDAY)).find((r) => r.email === EMAIL)?.status).toBe("failed");
    expect((await person.get()).get("lastSummaryDate")).toBeUndefined(); expect(await pushes()).toHaveLength(1);
    tx.mockRestore(); await sendMorningSummaries(TUESDAY); expect(await pushes()).toHaveLength(1);
  });
  it("waits for a received request after closing and never lets an older day's completion replace a newer date", async () => {
    clock("2026-11-17T02:00:00Z"); await storeTask();
    const deliver = transport.deliverPush; let finish!: () => void;
    vi.spyOn(transport, "deliverPush").mockImplementationOnce(async (...args) => {
      await new Promise<void>((resolve) => { finish = resolve; }); await deliver(...args);
    });
    const controller = new AbortController(), first = ping(undefined, controller.signal);
    await vi.waitFor(() => expect(finish).toBeTypeOf("function")); controller.abort();
    expect((await person.get()).get("lastSummaryDate")).toBeUndefined();
    await sendMorningSummaries(WEDNESDAY); expect((await person.get()).get("lastSummaryDate")).toBe(WEDNESDAY);
    finish(); expect((await first).status).toBe(200);
    expect((await person.get()).get("lastSummaryDate")).toBe(WEDNESDAY);
    expect((await person.get()).get("summaryClaimDate")).toBe(WEDNESDAY); expect(await pushes()).toHaveLength(2);
  });
  it("does not overwrite unrelated person fields when a send completes", async () => {
    await storeTask(); const deliver = transport.deliverPush;
    vi.spyOn(transport, "deliverPush").mockImplementationOnce(async (...args) => {
      await person.update({ active: false, name: "Updated name" }); await deliver(...args);
    });
    await sendMorningSummaries(TUESDAY);
    expect((await person.get()).data()).toMatchObject({ name: "Updated name", active: false, lastSummaryDate: TUESDAY });
    expect((await adminDb.doc("tasks/task").get()).data()).toMatchObject({ task: "Send the quote", endDate: TUESDAY, responsible: ["Audrey"] });
  });
});
