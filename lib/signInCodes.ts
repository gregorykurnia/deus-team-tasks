import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { personEmail } from "./peopleInput";

export const CODE_LIFETIME = 10 * 60_000;
export const CODE_WINDOW = 60 * 60_000;
export const CODE_COOLDOWN = 60_000;
const LIMIT = 5;

export interface StoredSignInCode {
  id: string;
  hash: string;
  createdAt: number;
  expiresAt: number;
  used: boolean;
}
export interface SignInCodeState {
  codes: StoredSignInCode[];
  requests: number[];
  wrongAttempts: number[];
}
export type RequestCodeAnswer = { status: "sent" | "wrongDomain" | "notAdded" }
  | { status: "wait"; seconds: number } | { status: "tooMany"; minutes: number };
export type VerifyCodeAnswer = { status: "ok" } | { status: "wrong"; triesLeft: number }
  | { status: "expired" | "noCode" } | { status: "tooMany"; minutes: number };

export function signInEmail(raw: unknown): string | null {
  try { return typeof raw === "string" ? personEmail(raw) : null; }
  catch { return null; }
}

export function makeSignInCode(): string {
  return randomInt(1_000_000).toString().padStart(6, "0");
}

export function hashSignInCode(secret: string, email: string, id: string, code: string): string {
  return createHmac("sha256", secret).update(JSON.stringify([email, id, code])).digest("hex");
}

export function matchesSignInCode(secret: string, email: string, entry: StoredSignInCode, code: string): boolean {
  const candidate = Buffer.from(hashSignInCode(secret, email, entry.id, code), "hex");
  const stored = Buffer.from(entry.hash, "hex");
  return candidate.length === stored.length && timingSafeEqual(candidate, stored);
}

// Reject damaged server data rather than silently reset somebody's rate limits.
export function readSignInCodeState(data: unknown): SignInCodeState {
  if (data === undefined) return { codes: [], requests: [], wrongAttempts: [] };
  const state = data as SignInCodeState | null;
  const times = (value: unknown): value is number[] => Array.isArray(value) && value.length <= LIMIT
    && value.every((n) => Number.isSafeInteger(n) && n >= 0);
  if (!state || !times(state.requests) || !times(state.wrongAttempts) || !Array.isArray(state.codes)
    || state.codes.length > LIMIT || !state.codes.every((c) => c && typeof c.id === "string"
      && /^[a-f0-9]{64}$/.test(c.hash) && Number.isSafeInteger(c.createdAt)
      && c.expiresAt === c.createdAt + CODE_LIFETIME && typeof c.used === "boolean")) {
    throw new Error("Invalid sign-in code record.");
  }
  return state;
}

export function currentSignInCodeState(state: SignInCodeState, now: number): SignInCodeState {
  const recent = (at: number) => at > now - CODE_WINDOW;
  return {
    // Keep expired/consumed hashes within this bounded hour to recognize expiry and avoid reissuing a used code.
    codes: state.codes.filter((code) => recent(code.createdAt)),
    requests: state.requests.filter(recent).sort((a, b) => a - b),
    wrongAttempts: state.wrongAttempts.filter(recent).sort((a, b) => a - b),
  };
}

function limitMinutes(histories: number[][], now: number): number | null {
  const until = histories.filter((times) => times.length >= LIMIT).map((times) => times[0] + CODE_WINDOW);
  return until.length ? Math.max(5, Math.ceil((Math.max(...until) - now) / 300_000) * 5) : null;
}

export function decideCodeRequest(rawEmail: unknown, active: boolean, stored: SignInCodeState, now: number): RequestCodeAnswer {
  if (!signInEmail(rawEmail)) return { status: "wrongDomain" };
  if (!active) return { status: "notAdded" };
  const state = currentSignInCodeState(stored, now);
  const minutes = limitMinutes([state.requests, state.wrongAttempts], now);
  if (minutes !== null) return { status: "tooMany", minutes };
  const last = state.requests.at(-1);
  if (last !== undefined && now < last + CODE_COOLDOWN) {
    return { status: "wait", seconds: Math.ceil((last + CODE_COOLDOWN - now) / 1000) };
  }
  return { status: "sent" };
}

export function decideCodeVerify(stored: SignInCodeState, email: string, code: string, secret: string, now: number): {
  answer: VerifyCodeAnswer; state: SignInCodeState;
} {
  const state = currentSignInCodeState(stored, now);
  const minutes = limitMinutes([state.wrongAttempts], now);
  if (minutes !== null) return { answer: { status: "tooMany", minutes }, state };
  const unused = state.codes.filter((c) => !c.used);
  if (!unused.length) return { answer: { status: "noCode" }, state };
  const live = unused.filter((c) => c.expiresAt > now);
  if (!live.length) return { answer: { status: "expired" }, state };
  const match = /^\d{6}$/.test(code) ? live.find((c) => matchesSignInCode(secret, email, c, code)) : undefined;
  if (match) return {
    answer: { status: "ok" },
    state: { ...state, codes: state.codes.map((c) => c.id === match.id ? { ...c, used: true } : c) },
  };
  const wrongAttempts = [...state.wrongAttempts, now];
  const locked = limitMinutes([wrongAttempts], now);
  return {
    answer: locked === null ? { status: "wrong", triesLeft: LIMIT - wrongAttempts.length } : { status: "tooMany", minutes: locked },
    state: { ...state, wrongAttempts },
  };
}
