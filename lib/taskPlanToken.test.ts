import { createHmac, timingSafeEqual } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  TASK_PLAN_CLIENT, TASK_PLAN_CLIENT_NEW, TASK_PLAN_CLIENT_PARENT, TASK_PLAN_INTERNAL_APPEND,
  TASK_PLAN_INTERNAL_NEW, TASK_PLAN_INTERNAL_PARENT, TASK_PLAN_PROSPECT, TASK_PLAN_PROSPECT_NEW,
  TASK_PLAN_PROSPECT_PARENT, TASK_PLAN_TODAY,
} from "../tests/fixtures/taskPlan";
import { buildTaskPlan, type TaskPlanContext, type TaskPlanInput } from "./taskPlan";
import {
  assertTaskPlanPreview, createTaskPlanToken, TASK_PLAN_TOKEN_TTL_MS, taskPlanFingerprint,
  TaskPlanTokenError, verifyTaskPlanToken,
} from "./taskPlanToken";

vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  return { ...actual, timingSafeEqual: vi.fn(actual.timingSafeEqual) };
});

const SECRET = "fictional-task-plan-test-secret-only";
const NOW = Date.parse("2026-11-10T16:59:59Z");
const options = { secret: SECRET, now: NOW };
const context = (changes: Partial<TaskPlanContext> = {}): TaskPlanContext => ({
  companies: [TASK_PLAN_PROSPECT, TASK_PLAN_CLIENT],
  tasks: [TASK_PLAN_INTERNAL_PARENT, TASK_PLAN_PROSPECT_PARENT, TASK_PLAN_CLIENT_PARENT],
  today: TASK_PLAN_TODAY, parentId: "new-fictional-parent", ...changes,
});
const build = (input: unknown = TASK_PLAN_INTERNAL_NEW, changes: Partial<TaskPlanContext> = {}) => buildTaskPlan(input, context(changes));
const decode = (token: string) => JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString("utf8"));
// Independently sign deliberately invalid wire payloads; this key is fictional.
const signEncoded = (encoded: string) => `${encoded}.${createHmac("sha256", SECRET).update("task-plan-preview:v1:").update(encoded).digest("base64url")}`;
const reseal = (payload: unknown) => signEncoded(Buffer.from(JSON.stringify(payload)).toString("base64url"));
const reverseKeys = (value: unknown): unknown => Array.isArray(value) ? value.map(reverseKeys)
  : value !== null && typeof value === "object" ? Object.fromEntries(Object.entries(value).reverse().map(([key, entry]) => [key, reverseKeys(entry)])) : value;

beforeEach(() => { vi.mocked(timingSafeEqual).mockClear(); });
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("signed task preview tokens", () => {
  const forms = [TASK_PLAN_PROSPECT_NEW, TASK_PLAN_CLIENT_NEW, TASK_PLAN_INTERNAL_NEW,
    { kind: "prospect", companyId: TASK_PLAN_PROSPECT.id, existingParentId: TASK_PLAN_PROSPECT_PARENT.id, steps: TASK_PLAN_PROSPECT_NEW.steps },
    { kind: "client", companyId: TASK_PLAN_CLIENT.id, existingParentId: TASK_PLAN_CLIENT_PARENT.id, steps: TASK_PLAN_CLIENT_NEW.steps }, TASK_PLAN_INTERNAL_APPEND];
  it.each(forms.map((input, i) => ({ input, label: i + 1 })))("round-trips destination form $label without mutating the preview", ({ input }) => {
    const preview = build(input);
    const original = structuredClone(preview);
    const token = createTaskPlanToken(preview, options);
    const verified = verifyTaskPlanToken(input, token, options);
    expect(verified).toMatchObject({ version: 1, issuedAt: NOW, expiresAt: NOW + 30 * 60 * 1000 });
    expect(Object.isFrozen(verified)).toBe(true);
    expect(() => assertTaskPlanPreview(verified, preview, [])).not.toThrow();
    expect(preview).toEqual(original);
    expect(token.length).toBeLessThan(1024);
    expect(token).not.toContain(SECRET);
    expect(JSON.stringify(decode(token))).not.toContain(SECRET);
    expect(JSON.stringify(decode(token))).not.toContain(input.steps[0].keyPoints);
  });

  it("uses the server secret and wall clock by default", () => {
    vi.stubEnv("MCP_SECRET", SECRET);
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const token = createTaskPlanToken(build());
    expect(verifyTaskPlanToken(TASK_PLAN_INTERNAL_NEW, token).issuedAt).toBe(NOW);
    vi.advanceTimersByTime(TASK_PLAN_TOKEN_TTL_MS);
    expect(() => verifyTaskPlanToken(TASK_PLAN_INTERNAL_NEW, token)).toThrow(/expired/);
  });

  it.each([0, TASK_PLAN_TOKEN_TTL_MS - 1])("accepts a token at age %i ms", (age) => {
    const token = createTaskPlanToken(build(), options);
    expect(() => verifyTaskPlanToken(TASK_PLAN_INTERNAL_NEW, token, { ...options, now: NOW + age })).not.toThrow();
  });
  it.each([TASK_PLAN_TOKEN_TTL_MS, TASK_PLAN_TOKEN_TTL_MS + 1])("rejects expiry at age %i ms", (age) => {
    expect(() => verifyTaskPlanToken(TASK_PLAN_INTERNAL_NEW, createTaskPlanToken(build(), options), { ...options, now: NOW + age })).toThrow(/expired/);
  });
  it("rejects a token issued in the future", () => {
    expect(() => verifyTaskPlanToken(TASK_PLAN_INTERNAL_NEW, createTaskPlanToken(build(), options), { ...options, now: NOW - 1 })).toThrow(/invalid/);
  });
  it.each([undefined, ""])("fails closed when the signing secret is unavailable (%j)", (secret) => {
    vi.stubEnv("MCP_SECRET", "");
    expect(() => createTaskPlanToken(build(), { secret, now: NOW })).toThrow(/MCP_SECRET/);
    expect(() => verifyTaskPlanToken(TASK_PLAN_INTERNAL_NEW, "unused", { secret, now: NOW })).toThrow(/MCP_SECRET/);
  });
  it.each([NaN, Infinity, -1, 1.5, Number.MAX_SAFE_INTEGER])("rejects an invalid clock (%j)", (now) => {
    expect(() => createTaskPlanToken(build(), { ...options, now })).toThrow(/clock/);
    expect(() => verifyTaskPlanToken(TASK_PLAN_INTERNAL_NEW, "unused", { ...options, now })).toThrow(/clock/);
  });

  it.each([undefined, null, 1, {}, [], "", " ", ".", "a.b.c", "a.b=", "a+.b", "a/b.c", "x".repeat(1025)].map((token, i) => ({ token, label: i + 1 })))("rejects absent or malformed token $label", ({ token }) => {
    expect(() => verifyTaskPlanToken(TASK_PLAN_INTERNAL_NEW, token, options)).toThrow(TaskPlanTokenError);
  });
  it.each(["wrong-secret", "x", SECRET + "-rotated"])("rejects a different secret (%s)", (secret) => {
    const token = createTaskPlanToken(build(), options);
    expect(() => verifyTaskPlanToken(TASK_PLAN_INTERNAL_NEW, token, { ...options, secret })).toThrow(/invalid/);
  });
  it("rejects payload and signature tampering", () => {
    const token = createTaskPlanToken(build(), options);
    const [encoded, signature] = token.split(".");
    const modified = Buffer.from(JSON.stringify({ ...decode(token), planHash: "0".repeat(64) })).toString("base64url");
    for (const changed of [`${modified}.${signature}`, `${encoded}.${signature[0] === "a" ? "b" : "a"}${signature.slice(1)}`]) {
      expect(() => verifyTaskPlanToken(TASK_PLAN_INTERNAL_NEW, changed, options)).toThrow(/invalid/);
    }
  });
  it("compares valid and wrong-length signatures through Node's constant-time primitive", () => {
    const token = createTaskPlanToken(build(), options);
    verifyTaskPlanToken(TASK_PLAN_INTERNAL_NEW, token, options);
    const encoded = token.split(".")[0];
    for (const supplied of ["a", "a".repeat(100)]) expect(() => verifyTaskPlanToken(TASK_PLAN_INTERNAL_NEW, `${encoded}.${supplied}`, options)).toThrow(/invalid/);
    expect(timingSafeEqual).toHaveBeenCalledTimes(3);
    for (const [left, right] of vi.mocked(timingSafeEqual).mock.calls) {
      expect(left.byteLength).toBe(32);
      expect(right.byteLength).toBe(32);
    }
  });
  it.each([
    { version: 2 }, { issuedAt: "now" }, { issuedAt: -1 }, { expiresAt: NOW + 1 }, { expiresAt: Number.MAX_SAFE_INTEGER + 1 },
    { planHash: null }, { warningsHash: "x".repeat(64) }, { destinationHash: "0" }, { extra: true },
  ])("rejects an authenticated but invalid token schema (%j)", (changes) => {
    const payload = { ...decode(createTaskPlanToken(build(), options)), ...changes };
    expect(() => verifyTaskPlanToken(TASK_PLAN_INTERNAL_NEW, reseal(payload), options)).toThrow(/invalid/);
  });
  it("rejects malformed JSON, missing payload fields and a non-object even with a valid signature", () => {
    const missing = decode(createTaskPlanToken(build(), options));
    delete missing.warningsHash;
    for (const token of [signEncoded(Buffer.from("{").toString("base64url")), reseal(missing), reseal(null), reseal([])]) {
      expect(() => verifyTaskPlanToken(TASK_PLAN_INTERNAL_NEW, token, options)).toThrow(/invalid/);
    }
  });
});

describe("canonical task-plan binding", () => {
  it.each([
    { input: TASK_PLAN_PROSPECT_NEW, hash: "b90efbfd1b89039b3d019bb83be902902a61b80a3232049524f730106667338d" },
    { input: TASK_PLAN_CLIENT_NEW, hash: "66e69bfc71a0c47be6cbd1eea3eb694f1f3e92b0460a70d79e1b6b7b230db65d" },
    { input: TASK_PLAN_INTERNAL_NEW, hash: "a688648d2858a8dcd2dc7e497919101a9e1110b5bb607ddaca3d33360acdac9d" },
    { input: TASK_PLAN_INTERNAL_APPEND, hash: "4a65a710168d170c4bf8a3a9ba3e9c7bb0acb6e60b56113157859f6761495274" },
  ])("preserves the pre-calendar fingerprint for $input.kind ($hash)", ({ input, hash }) => {
    expect(taskPlanFingerprint(input)).toBe(hash);
  });

  it("verifies an unchanged token captured before calendar support", () => {
    const token = "eyJ2ZXJzaW9uIjoxLCJpc3N1ZWRBdCI6MTc5NDMyOTk5OTAwMCwiZXhwaXJlc0F0IjoxNzk0MzMxNzk5MDAwLCJwbGFuSGFzaCI6ImE2ODg2NDhkMjg1OGE4ZGNkMmRjN2U0OTc5MTkxMDFhOWUxMTEwYjViYjYwN2RkYWNhM2QzMzM2MGFjZGFjOWQiLCJ3YXJuaW5nc0hhc2giOiI0ZjUzY2RhMThjMmJhYTBjMDM1NGJiNWY5YTNlY2JlNWVkMTJhYjRkOGUxMWJhODczYzJmMTExNjEyMDJiOTQ1IiwiZGVzdGluYXRpb25IYXNoIjoiMzcxMWI3NzMyYWM1OWZmNDhlNGI3NjEzOWIzODJlYjViNmI5NzcwZTFmNTE4MmFiMmZlOWNhM2Y2NzViNjdjMSJ9.UJZfNLlhlytZU-ZKKBHHnduLUFos77l9kM9_hB2B8qw";
    const verified = verifyTaskPlanToken(TASK_PLAN_INTERNAL_NEW, token, options);
    const shown = build(TASK_PLAN_INTERNAL_NEW, { tasks: [], parentId: "legacy-parent" });
    expect(() => assertTaskPlanPreview(verified, shown, [])).not.toThrow();
  });

  it.each([
    { from: undefined, to: {} },
    { from: {}, to: { startTime: "14:00", endTime: "15:00" } },
    { from: { startTime: "14:00", endTime: "15:00" }, to: { startTime: "14:00", endTime: "16:00" } },
    { from: {}, to: undefined },
  ])("requires a new token when only a step's calendar changes ($from → $to)", ({ from, to }) => {
    const input: TaskPlanInput = structuredClone(TASK_PLAN_INTERNAL_NEW);
    if (from) input.steps[0].calendar = from;
    const shown = build(input, { calendarEnabled: true });
    const token = createTaskPlanToken(shown, options);
    expect(verifyTaskPlanToken(input, token, options).planHash).toBe(taskPlanFingerprint(input));
    const changed = structuredClone(input);
    if (to) changed.steps[0].calendar = to;
    else delete changed.steps[0].calendar;
    expect(taskPlanFingerprint(changed)).not.toBe(taskPlanFingerprint(input));
    expect(() => verifyTaskPlanToken(changed, token, options)).toThrow(/plan changed/);
  });

  it("shares preview trimming, preserves multiline text and ignores object key order", () => {
    const input = structuredClone(TASK_PLAN_PROSPECT_NEW);
    input.newParent!.title = `  ${input.newParent!.title}\n`;
    input.steps[0].owners = `  ${input.steps[0].owners}  `;
    const preview = build(input);
    const token = createTaskPlanToken(preview, options);
    expect(taskPlanFingerprint(input)).toBe(taskPlanFingerprint(preview.plan));
    expect(taskPlanFingerprint(input)).toBe(taskPlanFingerprint(reverseKeys(input)));
    const verified = verifyTaskPlanToken(reverseKeys(input), token, options);
    expect(() => assertTaskPlanPreview(verified, build(reverseKeys(input)), [])).not.toThrow();
  });
  const edits: { label: string; edit: (plan: TaskPlanInput) => void }[] = [
    { label: "step notes", edit: (p) => { p.steps[0].keyPoints += "\nOne changed line."; } },
    { label: "owner text", edit: (p) => { p.steps[0].owners = "Different fictional owner"; } },
    { label: "start date", edit: (p) => { p.steps[0].startDate = "2026-12-29"; } },
    { label: "end date", edit: (p) => { p.steps[0].endDate = "2027-01-03"; } },
    { label: "step order", edit: (p) => { p.steps.reverse(); } },
    { label: "step name", edit: (p) => { p.steps[0].name += " changed"; } },
    { label: "removed step", edit: (p) => { p.steps.pop(); } },
    { label: "extra step", edit: (p) => { p.steps.push({ ...p.steps[0] }); } },
    { label: "company", edit: (p) => { p.companyId = 9999; } },
    { label: "category", edit: (p) => { p.kind = "client"; p.companyId = TASK_PLAN_CLIENT.id; } },
    { label: "main task title", edit: (p) => { p.newParent!.title += " changed"; } },
    { label: "main task type", edit: (p) => { p.newParent!.taskType = "Follow Up"; } },
    { label: "main task notes", edit: (p) => { p.newParent!.keyPoints += "\nChanged."; } },
    { label: "source link", edit: (p) => { p.newParent!.sourceUrl = "https://example.com/changed"; } },
  ];
  it.each(edits)("requires another preview after changing $label", ({ edit }) => {
    const input = structuredClone(TASK_PLAN_PROSPECT_NEW);
    const token = createTaskPlanToken(build(input), options);
    edit(input);
    expect(() => verifyTaskPlanToken(input, token, options)).toThrow(/plan changed/);
  });
  it("binds append selection and rejects switching from new to existing", () => {
    const input = TASK_PLAN_INTERNAL_APPEND;
    const token = createTaskPlanToken(build(input), options);
    expect(() => verifyTaskPlanToken({ ...input, existingParentId: "another-parent" }, token, options)).toThrow(/plan changed/);
    const newToken = createTaskPlanToken(build(TASK_PLAN_INTERNAL_NEW), options);
    expect(() => verifyTaskPlanToken(input, newToken, options)).toThrow(/plan changed/);
  });
  it("also binds the freshly built preview's plan at the save gate", () => {
    const verified = verifyTaskPlanToken(TASK_PLAN_INTERNAL_NEW, createTaskPlanToken(build(), options), options);
    expect(() => assertTaskPlanPreview(verified, build(TASK_PLAN_PROSPECT_NEW), [])).toThrow(/plan changed/);
  });
  it("keeps retry identity independent of the token's issue time and signing key", () => {
    const preview = build();
    const first = createTaskPlanToken(preview, options);
    const refreshed = createTaskPlanToken(preview, { secret: SECRET + "-rotated", now: NOW + 1000 });
    expect(first).not.toBe(refreshed);
    expect(decode(first).planHash).toBe(decode(refreshed).planHash);
    expect(decode(first).planHash).toBe(taskPlanFingerprint(TASK_PLAN_INTERNAL_NEW));
  });
});

describe("current destination and warning gate", () => {
  it.each([
    { id: "changed-parent" }, { name: "Changed title" }, { mode: "new" }, { linkedClientId: 9999 },
    { taskType: "Follow Up" }, { taskGroup: "Different group" }, { startDate: "2026-12-02" }, { endDate: "2027-01-30" },
    { completed: true }, { parkedAt: 10 }, { parkedUntil: "2026-11-12" },
  ])("rejects changed selected main-task state (%j)", (changes) => {
    const preview = build(TASK_PLAN_INTERNAL_APPEND);
    const verified = verifyTaskPlanToken(preview.plan, createTaskPlanToken(preview, options), options);
    Object.assign(preview.destination!.parent, changes);
    expect(() => assertTaskPlanPreview(verified, preview, [])).toThrow(/destination or warnings changed/);
  });
  it.each([{ id: 9999 }, { name: "Renamed fictional company" }, { group: "raw" }, { status: "Changed status" }])("rejects changed company state (%j)", (changes) => {
    const preview = build(TASK_PLAN_PROSPECT_NEW);
    const verified = verifyTaskPlanToken(preview.plan, createTaskPlanToken(preview, options), options);
    Object.assign(preview.destination!.company!, changes);
    expect(() => assertTaskPlanPreview(verified, preview, [])).toThrow(/destination or warnings changed/);
  });
  it("accepts reordered state keys and unchanged re-read state despite unrelated edits", () => {
    const preview = build(TASK_PLAN_INTERNAL_APPEND);
    const verified = verifyTaskPlanToken(preview.plan, createTaskPlanToken(preview, options), options);
    const reread = build(TASK_PLAN_INTERNAL_APPEND, { tasks: [{ ...TASK_PLAN_INTERNAL_PARENT, keyPoints: "Edited notes", responsible: ["Changed owner"], order: 999 }] });
    reread.destination = reverseKeys(reread.destination) as typeof reread.destination;
    expect(() => assertTaskPlanPreview(verified, reread, [])).not.toThrow();
  });

  const warnedInput = { ...TASK_PLAN_INTERNAL_APPEND, steps: Array.from({ length: 2 }, () => ({ name: "Confirm fictional handover", startDate: "2026-11-09", endDate: "2026-11-09" })) };
  it("requires every current warning ID; acknowledging all keeps both duplicate steps", () => {
    const preview = build(warnedInput);
    const verified = verifyTaskPlanToken(warnedInput, createTaskPlanToken(preview, options), options);
    const ids = preview.warnings.map((warning) => warning.id);
    expect(new Set(preview.warnings.map((warning) => warning.code))).toEqual(new Set(["past-date", "outside-parent-range", "duplicate-step"]));
    for (const missing of ids) {
      expect(() => assertTaskPlanPreview(verified, preview, ids.filter((id) => id !== missing))).toThrow(missing);
    }
    expect(() => assertTaskPlanPreview(verified, preview, [...ids].reverse())).not.toThrow();
    expect(() => assertTaskPlanPreview(verified, preview, [...ids, ids[0]])).not.toThrow();
    expect(preview.subtasks).toHaveLength(2);
    preview.warnings.reverse();
    expect(() => assertTaskPlanPreview(verified, preview, ids)).not.toThrow();
  });
  it("requires acknowledgement of a similar-main-task choice", () => {
    const preview = build(TASK_PLAN_INTERNAL_NEW, { tasks: [{ ...TASK_PLAN_INTERNAL_PARENT, task: TASK_PLAN_INTERNAL_NEW.newParent!.title }] });
    const verified = verifyTaskPlanToken(preview.plan, createTaskPlanToken(preview, options), options);
    expect(preview.warnings[0].code).toBe("similar-parent");
    expect(() => assertTaskPlanPreview(verified, preview, [])).toThrow(/Unacknowledged/);
    expect(() => assertTaskPlanPreview(verified, preview, preview.warnings.map((warning) => warning.id))).not.toThrow();
  });
  it.each([undefined, null, "all", {}, [1], ["*"], ["unrelated-warning"]].map((acknowledged, i) => ({ acknowledged, label: i + 1 })))("rejects invalid acknowledgements $label", ({ acknowledged }) => {
    const preview = build(warnedInput);
    const verified = verifyTaskPlanToken(warnedInput, createTaskPlanToken(preview, options), options);
    expect(() => assertTaskPlanPreview(verified, preview, acknowledged)).toThrow(/acknowledgedWarnings/);
  });
  it("rejects invented acknowledgements even when there are no warnings", () => {
    const preview = build();
    const verified = verifyTaskPlanToken(preview.plan, createTaskPlanToken(preview, options), options);
    expect(() => assertTaskPlanPreview(verified, preview, ["past-date:0:startDate"])).toThrow(/acknowledgedWarnings/);
  });
  it("requires a fresh preview for newly arising midnight warnings within the token lifetime", () => {
    const input = { ...TASK_PLAN_INTERNAL_NEW, steps: [{ name: "Fictional action", startDate: TASK_PLAN_TODAY, endDate: TASK_PLAN_TODAY }] };
    const preview = build(input);
    expect(preview.warnings).toEqual([]);
    const token = createTaskPlanToken(preview, options);
    const verified = verifyTaskPlanToken(input, token, { ...options, now: NOW + 2000 });
    const current = build(input, { today: "2026-11-11" });
    expect(current.warnings).toHaveLength(2);
    expect(() => assertTaskPlanPreview(verified, current, current.warnings.map((warning) => warning.id))).toThrow(/warnings changed/);
  });
  it("rejects removed warnings even if all remaining warnings are acknowledged", () => {
    const preview = build(warnedInput);
    const verified = verifyTaskPlanToken(preview.plan, createTaskPlanToken(preview, options), options);
    preview.warnings.pop();
    expect(() => assertTaskPlanPreview(verified, preview, preview.warnings.map((warning) => warning.id))).toThrow(/warnings changed/);
  });
  it("cannot acknowledge invalid input, invalid destinations, or explicit preview errors away", () => {
    const good = build();
    const token = createTaskPlanToken(good, options);
    const verified = verifyTaskPlanToken(good.plan, token, options);
    const invalid = [build({ ...TASK_PLAN_INTERNAL_NEW, steps: [] }), build(TASK_PLAN_PROSPECT_NEW, { companies: [] }),
      { ...good, canWrite: false }, { ...good, errors: ["A blocking error."] }];
    for (const preview of invalid) {
      expect(() => createTaskPlanToken(preview, options)).toThrow(/Invalid task preview/);
      expect(() => assertTaskPlanPreview(verified, preview, ["all"])).toThrow(/Invalid task preview/);
    }
    expect(() => verifyTaskPlanToken({ ...TASK_PLAN_INTERNAL_NEW, steps: [] }, token, options)).toThrow(/Invalid task plan/);
    expect(() => taskPlanFingerprint({ ...TASK_PLAN_INTERNAL_NEW, unexpected: "field" })).toThrow(/Invalid task plan/);
  });
  it("separates token/input verification from fresh-state checks so G05 can inspect completed retries first", () => {
    const preview = build();
    const token = createTaskPlanToken(preview, options);
    const afterSave = build(TASK_PLAN_INTERNAL_NEW, { tasks: [{ ...preview.parent!, id: preview.parentId }] });
    const verified = verifyTaskPlanToken(TASK_PLAN_INTERNAL_NEW, token, options);
    expect(() => assertTaskPlanPreview(verified, afterSave, [])).toThrow(/Invalid task preview/);
    // G05 must return a complete matching saved operation between these two checks.
    expect(verified.planHash).toBe(taskPlanFingerprint(TASK_PLAN_INTERNAL_NEW));
  });
});
