import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { validateTaskPlan, type TaskPlanPreview } from "./taskPlan";

export const TASK_PLAN_TOKEN_TTL_MS = 30 * 60 * 1000;
const DOMAIN = "task-plan-preview:v1:";
const TOKEN_KEYS = ["version", "issuedAt", "expiresAt", "planHash", "warningsHash", "destinationHash"];
const INVALID_TOKEN = "Preview token is missing or invalid. Preview the plan again before saving.";

export interface TaskPlanTokenOptions {
  secret?: string; // Tests supply a fake value; production uses the route's server-only MCP_SECRET.
  now?: number; // Epoch milliseconds, for a controlled test clock.
}

export interface VerifiedTaskPlanToken {
  readonly version: 1;
  readonly issuedAt: number;
  readonly expiresAt: number;
  readonly planHash: string;
  readonly warningsHash: string;
  readonly destinationHash: string;
}

export class TaskPlanTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TaskPlanTokenError";
  }
}

// Object key order is irrelevant; array order and all validated text remain significant.
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value).filter(([, entry]) => entry !== undefined)
      .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

const hash = (value: string) => createHash("sha256").update(value).digest("hex");

// Shared by signing, verification and G05's stable operation IDs; never hash token timestamps for retries.
// Use the preview builder's validator, including its trimming, rather than a second input normalizer.
export function taskPlanFingerprint(input: unknown): string {
  const { plan, errors } = validateTaskPlan(input);
  if (!plan) throw new TaskPlanTokenError(`Invalid task plan. ${errors.join(" ")}`);
  return hash(canonicalJson(plan));
}

function settings(options: TaskPlanTokenOptions) {
  const secret = options.secret ?? process.env.MCP_SECRET;
  if (!secret) throw new TaskPlanTokenError("Preview signing is unavailable. MCP_SECRET must be configured on the server.");
  const now = options.now ?? Date.now();
  if (!Number.isSafeInteger(now) || now < 0 || !Number.isSafeInteger(now + TASK_PLAN_TOKEN_TTL_MS)) {
    throw new TaskPlanTokenError("The preview clock is invalid.");
  }
  return { secret, now };
}

function checkPreview(preview: TaskPlanPreview) {
  if (!preview.canWrite || preview.errors.length || !preview.plan || !preview.destination) {
    throw new TaskPlanTokenError(`Invalid task preview. ${preview.errors.join(" ")} Nothing can be saved.`);
  }
}

const warningHash = (preview: TaskPlanPreview) => hash(canonicalJson([...new Set(preview.warnings.map((warning) => warning.id))].sort()));
const destinationHash = (preview: TaskPlanPreview) => hash(canonicalJson(preview.destination));
const signature = (payload: string, secret: string) => createHmac("sha256", secret).update(DOMAIN).update(payload).digest("base64url");

export function createTaskPlanToken(preview: TaskPlanPreview, options: TaskPlanTokenOptions = {}): string {
  checkPreview(preview);
  const { secret, now } = settings(options);
  const payload: VerifiedTaskPlanToken = {
    version: 1, issuedAt: now, expiresAt: now + TASK_PLAN_TOKEN_TTL_MS,
    planHash: taskPlanFingerprint(preview.plan), warningsHash: warningHash(preview), destinationHash: destinationHash(preview),
  };
  // Only hashes and times travel in the token, never the secret or the owner's notes.
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${signature(encoded, secret)}`;
}

function isPayload(value: unknown): value is VerifiedTaskPlanToken {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const payload = value as Record<string, unknown>;
  return Object.keys(payload).length === TOKEN_KEYS.length && TOKEN_KEYS.every((key) => Object.hasOwn(payload, key))
    && payload.version === 1
    && typeof payload.issuedAt === "number" && Number.isSafeInteger(payload.issuedAt) && payload.issuedAt >= 0
    && typeof payload.expiresAt === "number" && Number.isSafeInteger(payload.expiresAt)
    && payload.expiresAt - payload.issuedAt === TASK_PLAN_TOKEN_TTL_MS
    && [payload.planHash, payload.warningsHash, payload.destinationHash].every((digest) => typeof digest === "string" && /^[a-f0-9]{64}$/.test(digest));
}

// This checks authenticity, expiry and input integrity BEFORE G05 looks for a completed operation.
// Do not check current warnings/state here: a successful lost-response retry creates its own duplicates.
export function verifyTaskPlanToken(input: unknown, token: unknown, options: TaskPlanTokenOptions = {}): VerifiedTaskPlanToken {
  const { secret, now } = settings(options);
  if (typeof token !== "string" || token.length > 1024 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) {
    throw new TaskPlanTokenError(INVALID_TOKEN);
  }
  const [encoded, supplied] = token.split(".");
  // Fixed-length hashes also send unequal-length signatures through the constant-time comparison,
  // as the route's secret guard does. Compare before parsing any caller-controlled payload.
  if (!timingSafeEqual(Buffer.from(hash(signature(encoded, secret)), "hex"), Buffer.from(hash(supplied), "hex"))) {
    throw new TaskPlanTokenError(INVALID_TOKEN);
  }
  let payload: unknown;
  try {
    const bytes = Buffer.from(encoded, "base64url");
    if (bytes.toString("base64url") !== encoded) throw new Error();
    payload = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new TaskPlanTokenError(INVALID_TOKEN);
  }
  if (!isPayload(payload) || payload.issuedAt > now) throw new TaskPlanTokenError(INVALID_TOKEN);
  if (now >= payload.expiresAt) throw new TaskPlanTokenError("Preview token expired. Preview the plan again before saving.");
  if (taskPlanFingerprint(input) !== payload.planHash) throw new TaskPlanTokenError("The task plan changed after preview. Preview it again before saving.");
  return Object.freeze(payload);
}

// For a NEW save, re-read/build the current preview then apply this gate before writing.
// A completed retry is returned earlier by G05, after verifyTaskPlanToken, without editing its records.
export function assertTaskPlanPreview(
  verified: VerifiedTaskPlanToken, preview: TaskPlanPreview, acknowledgedWarnings: unknown,
): void {
  checkPreview(preview);
  if (taskPlanFingerprint(preview.plan) !== verified.planHash) throw new TaskPlanTokenError("The task plan changed after preview. Preview it again before saving.");
  if (destinationHash(preview) !== verified.destinationHash || warningHash(preview) !== verified.warningsHash) {
    throw new TaskPlanTokenError("The preview destination or warnings changed. Preview the plan again before saving.");
  }
  const current = new Set(preview.warnings.map((warning) => warning.id));
  if (!Array.isArray(acknowledgedWarnings) || acknowledgedWarnings.some((id) => typeof id !== "string" || !current.has(id))) {
    throw new TaskPlanTokenError("acknowledgedWarnings must be an array containing only warning IDs from this preview.");
  }
  const acknowledged = new Set(acknowledgedWarnings);
  const missing = [...current].filter((id) => !acknowledged.has(id));
  if (missing.length) throw new TaskPlanTokenError(`Unacknowledged preview warnings: ${missing.join(", ")}. Confirm them before saving.`);
}
