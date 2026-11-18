import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { deleteApp as deleteClientApp, initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth, signInWithCustomToken, signOut } from "firebase/auth";
import { getDocFromServer, doc, terminate } from "firebase/firestore";
import { deleteApp } from "firebase-admin/app";
import { adminApp, adminDataApp, adminAuth, adminDb } from "./admin";
import { notifyAssignedTask } from "./assignNotify.server";
import * as dispatch from "./assignNotifyDispatch.server";
import { db } from "./firebase";
import { clientsDb } from "./firebaseClients";
import { addPerson } from "./people.server";
import { savePushDevice } from "./push.server";
import * as transport from "./pushTransport.server";
import { applyTaskChanges, previewTaskChanges } from "./taskEditServer";
import { addTaskPlan, previewTaskPlan } from "./taskPlanServer";
import { POST } from "../app/api/notify/assigned/route";
import { clearAll, seed } from "../tests/support/emulator";
import { PUSH_EMAIL as EMAIL, subscription } from "../tests/support/push";
import type { TaskChange } from "./taskEdit";
import type { Task } from "./types";

const client = initializeApp({ projectId: "demo-deus", apiKey: "fake-emulator-key" }, "assignment-data");
const auth = getAuth(client);
connectAuthEmulator(auth, "http://127.0.0.1:9199", { disableWarnings: true });
const GREG = "gregory.kurnia@deushcs.com";
const task: Task = { id: "task", task: "Send the quote", responsible: ["Audrey"], informed: [], keyPoints: "", startDate: "", endDate: "2027-11-20", order: 1 };
const storeTask = (fields: Partial<Task> = {}) => { const { id, ...data } = { ...task, ...fields }; return adminDb.doc(`tasks/${id}`).set(data); };
const pushes = async () => (await adminDb.collection("_fakePush").get()).docs.map((d) => d.data());
const notice = async (id = task.id) => (await adminDb.doc(`assignNotices/${id}`).get()).data()?.notified;
const ping = (ids = [task.id], token?: string, signal?: AbortSignal) => POST(new Request("http://localhost/api/notify/assigned", {
  method: "POST", body: JSON.stringify({ taskIds: ids }), ...(token && { headers: { Authorization: `Bearer ${token}` } }), signal,
}));

beforeAll(() => {
  if (adminDataApp.options.projectId !== db.app.options.projectId || adminApp.options.projectId !== "demo-deus"
    || process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8180" || process.env.FIREBASE_AUTH_EMULATOR_HOST !== "127.0.0.1:9199") throw new Error("Assignment tests require the local shared tasks database and Auth emulator.");
});
beforeEach(async () => {
  vi.stubEnv("NEXT_PUBLIC_SIGN_IN_ENABLED", "1"); await signOut(auth); await clearAll();
  await adminDb.doc(`people/${EMAIL}`).set({ email: EMAIL, name: "Audrey", active: true });
  await adminDb.doc(`people/${GREG}`).set({ email: GREG, name: "Gregory", active: true });
  await savePushDevice(EMAIL, subscription()); await savePushDevice(GREG, subscription("greg"));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
afterAll(async () => {
  await Promise.all([terminate(db), terminate(clientsDb)]); await deleteClientApp(client);
  await deleteApp(adminApp); await deleteApp(adminDataApp);
});

describe("server assignment claims and real fake-push delivery", () => {
  it("sees app-written tasks and sends once despite duplicate pings and re-saves", async () => {
    await seed("tasks", "tasks", [task]);
    expect((await getDocFromServer(doc(db, "tasks", task.id))).data()?.task).toBe(task.task);
    expect((await ping([task.id, task.id])).status).toBe(200);
    await storeTask({ responsible: ["audrey", " AUDREY ", "Full Team", "Unlinked"] });
    expect((await ping()).status).toBe(200); expect(await notice()).toEqual(["Audrey"]);
    expect(await pushes()).toEqual([{ email: EMAIL, title: "New task for you", body: "Send the quote\nDeadline Sat 20 Nov · Internal", url: "/?task=task" }]);
  });
  it("sends again only after removal has cleared the name, then re-addition", async () => {
    await storeTask(); await ping(); await storeTask({ responsible: [] }); await ping(); expect(await notice()).toEqual([]);
    await storeTask(); await ping(); await ping(); expect(await pushes()).toHaveLength(2);
  });
  it("excludes unlinked/inactive/no-device names; a later device does not announce old tasks", async () => {
    await adminDb.doc(`people/${GREG}`).update({ active: false });
    await adminDb.recursiveDelete(adminDb.doc(`people/${EMAIL}`).collection("devices"));
    await storeTask({ responsible: ["audrey", "Gregory", "Unlinked", "Full Team"] }); await ping();
    expect(await pushes()).toEqual([]); expect(await notice()).toEqual(["Audrey"]);
    await savePushDevice(EMAIL, subscription()); await ping(); expect(await pushes()).toEqual([]);
  });
  it("suppresses only the verified sender while recording their name", async () => {
    const signed = await signInWithCustomToken(auth, await adminAuth.createCustomToken(EMAIL));
    await storeTask({ responsible: ["Audrey", "Gregory"] });
    expect((await ping(undefined, await signed.user.getIdToken())).status).toBe(200);
    await ping(); expect((await pushes()).map((p) => p.email)).toEqual([GREG]); expect(await notice()).toEqual(["Audrey", "Gregory"]);
  });
  it("honors the people:add backfill even with case/spacing differences", async () => {
    await adminDb.doc(`people/${EMAIL}`).delete(); await storeTask({ responsible: [" AUDREY "] });
    await addPerson(EMAIL, "Audrey"); await savePushDevice(EMAIL, subscription()); await ping();
    expect(await notice()).toEqual(["Audrey"]); expect(await pushes()).toEqual([]);
  });
  it("does nothing for missing, deleted or oddly shaped tasks", async () => {
    expect(await notifyAssignedTask("deleted")).toBe("missing");
    for (const responsible of [null, "Audrey", [null, " ", "Full Team", "Unlinked"]]) {
      await adminDb.doc("tasks/odd").set({ responsible }); await ping(["odd"]);
    }
    await storeTask(); await adminDb.doc("tasks/task").delete(); await ping(); expect(await pushes()).toEqual([]);
  });
  it("claims once under simultaneous independent requests", async () => {
    await storeTask(); const responses = await Promise.all([ping(), ping(), ping()]);
    expect(responses.map((r) => r.status)).toEqual([200, 200, 200]); expect(await pushes()).toHaveLength(1);
  }, 20_000);
  it("uses current parent names and company kinds, including a missing company", async () => {
    await seed("clients", "pipeline", [{ id: 7, company: "Company", status: "Deal Done" }], { keepIdField: true });
    await storeTask({ id: "parent", task: "Renamed main task", responsible: [] });
    await storeTask({ parentId: "parent", linkedClientId: 7 }); await ping();
    expect((await pushes())[0].body).toBe("Send the quote\nSubtask of Renamed main task · Deadline Sat 20 Nov");
    await storeTask({ id: "orphan", parentId: "deleted", linkedClientId: 999, endDate: "" }); await ping(["orphan"]);
    expect((await pushes()).find((p) => p.url === "/?task=orphan")?.body).toBe("Send the quote\nNo deadline · Internal");
  });
  it("a failed claim is retryable without a partial record", async () => {
    await storeTask(); vi.spyOn(adminDb, "runTransaction").mockRejectedValueOnce(new Error("unavailable"));
    expect((await ping()).status).toBe(503); expect(await notice()).toBeUndefined(); expect(await pushes()).toEqual([]);
    expect((await ping()).status).toBe(200); expect(await pushes()).toHaveLength(1);
  });
  it("does not resend a delivery that landed but lost its response, or starve another recipient", async () => {
    const deliver = transport.deliverPush;
    vi.spyOn(transport, "deliverPush").mockImplementationOnce(async (...args) => { await deliver(...args); throw new Error("reply lost"); });
    await storeTask({ responsible: ["Audrey", "Gregory"] }); expect((await ping()).status).toBe(503);
    expect(await pushes()).toHaveLength(2); expect(await notice()).toEqual(["Audrey", "Gregory"]);
    expect((await ping()).status).toBe(200); expect(await pushes()).toHaveLength(2);
  });
  it("a late old delivery cannot overwrite a newer assignment, and a received request survives closing the page", async () => {
    await storeTask(); const deliver = transport.deliverPush;
    let finish!: () => void;
    vi.spyOn(transport, "deliverPush").mockImplementationOnce(async (...args) => {
      await new Promise<void>((resolve) => { finish = resolve; }); await deliver(...args);
    });
    const controller = new AbortController(); const first = ping(undefined, undefined, controller.signal);
    await vi.waitFor(() => expect(finish).toBeTypeOf("function")); controller.abort();
    await storeTask({ responsible: ["Gregory"] }); expect((await ping()).status).toBe(200); expect(await notice()).toEqual(["Gregory"]);
    finish(); expect((await first).status).toBe(200); await ping();
    expect(await notice()).toEqual(["Gregory"]); expect((await adminDb.doc("tasks/task").get()).data()?.responsible).toEqual(["Gregory"]);
    expect((await pushes()).map((p) => p.email).sort()).toEqual([EMAIL, GREG].sort());
  });
  it("stays off on direct calls, dispatch and routes", async () => {
    await storeTask(); vi.stubEnv("NEXT_PUBLIC_SIGN_IN_ENABLED", "0");
    expect(await dispatch.notifyAssignments([task.id])).toEqual([]); await notifyAssignedTask(task.id);
    expect((await ping()).status).toBe(404); expect(await pushes()).toEqual([]); expect(await notice()).toBeUndefined();
  });
  it("chat edits notify from the shared server service after commit and do not repeat on retry", async () => {
    await storeTask({ id: "parent", task: "Main task", responsible: [] }); await storeTask({ responsible: [], parentId: "parent" });
    const changes: TaskChange[] = [{ taskId: task.id, set: { responsible: ["Audrey"] } }];
    const preview = await previewTaskChanges(changes); expect(preview.errors).toEqual([]);
    const stamps = Object.fromEntries(preview.tasks.map((t) => [t.taskId, t.seen]));
    const warnings = preview.warnings.map((w) => w.id);
    await applyTaskChanges(changes, stamps, warnings, "http://localhost");
    await applyTaskChanges(changes, stamps, warnings, "http://localhost");
    expect(await pushes()).toHaveLength(1); expect((await pushes())[0].body).toContain("Subtask of Main task");
  });
  it("recovers assignment delivery after a lost bulk reply and only claims changed tasks", async () => {
    await storeTask({ responsible: ["Greg"] });
    await storeTask({ id: "already", responsible: ["Audrey"] });
    const changes = [task.id, "already"].map((taskId) => ({ taskId, set: { addResponsible: ["audrey"] } }));
    const shown = await previewTaskChanges(changes);
    expect(shown.unchanged).toEqual(["already"]);
    const save = () => applyTaskChanges(changes, shown.seen, [], "http://localhost");
    vi.spyOn(dispatch, "notifyAssignments").mockRejectedValueOnce(new Error("Interrupted after saving"));
    await expect(save()).rejects.toThrow("Interrupted after saving");
    expect(await pushes()).toEqual([]);
    expect((await save()).alreadySaved).toBe(true);
    expect((await save()).alreadySaved).toBe(true);
    expect(await pushes()).toEqual([expect.objectContaining({ email: EMAIL, url: `/?task=${task.id}` })]);
    expect(await notice("already")).toBeUndefined();

    const remove = [{ taskId: task.id, set: { removeResponsible: ["AUDREY"] } }];
    const removal = await previewTaskChanges(remove);
    await applyTaskChanges(remove, removal.seen, [], "http://localhost");
    expect(await notice()).toEqual([]);
    expect(await pushes()).toHaveLength(1);
  });
  it("chat plans report newly created task IDs after commit and safely revisit them on retry", async () => {
    const plan = { kind: "internal", newParent: { title: "Main task" }, steps: [{ name: "Next action", startDate: "2027-11-19", endDate: "2027-11-20" }] };
    const options = { secret: "assignment-test-secret", now: Date.UTC(2026, 10, 17) };
    const shown = await previewTaskPlan(plan, options); expect(shown.errors).toEqual([]);
    const observe = vi.spyOn(dispatch, "notifyAssignments");
    const saved = await addTaskPlan(plan, shown.previewToken, shown.warnings.map((w) => w.id), options);
    expect(observe).toHaveBeenCalledWith([saved.parentId, ...saved.subtaskIds]);
    expect((await adminDb.doc(`assignNotices/${saved.subtaskIds[0]}`).get()).exists).toBe(true);
    const retry = await addTaskPlan(plan, shown.previewToken, shown.warnings.map((w) => w.id), options);
    expect(retry.alreadySaved).toBe(true); expect(observe).toHaveBeenCalledTimes(2); expect(await pushes()).toEqual([]);
  });
});
