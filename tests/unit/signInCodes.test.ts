import { describe, expect, it } from "vitest";
import {
  CODE_COOLDOWN, CODE_LIFETIME, CODE_WINDOW, currentSignInCodeState, decideCodeRequest, decideCodeVerify,
  hashSignInCode, makeSignInCode, readSignInCodeState, signInEmail, type SignInCodeState,
} from "../../lib/signInCodes";

const EMAIL = "audrey.wijaya@deushcs.com", SECRET = "a-test-only-secret-with-32-characters", NOW = 10 * CODE_WINDOW;
const empty = (): SignInCodeState => ({ codes: [], requests: [], wrongAttempts: [] });
function withCode(code = "001234", at = NOW): SignInCodeState {
  return { ...empty(), requests: [at], codes: [{ id: "one", hash: hashSignInCode(SECRET, EMAIL, "one", code), createdAt: at, expiresAt: at + CODE_LIFETIME, used: false }] };
}
const verify = (state: SignInCodeState, code = "001234", now = NOW) => decideCodeVerify(state, EMAIL, code, SECRET, now);

describe("sign-in code rules", () => {
  it("generates six digits, including leading zeroes, and binds the HMAC to its secret, email and record", () => {
    for (let i = 0; i < 100; i++) expect(makeSignInCode()).toMatch(/^\d{6}$/);
    const hash = hashSignInCode(SECRET, EMAIL, "one", "001234");
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).not.toBe("001234");
    for (const args of [["other", EMAIL, "one", "001234"], [SECRET, "gregory@deushcs.com", "one", "001234"], [SECRET, EMAIL, "two", "001234"], [SECRET, EMAIL, "one", "001235"]]) {
      expect(hashSignInCode(...args as [string, string, string, string])).not.toBe(hash);
    }
  });

  it.each([undefined, null, {}, "", "   ", "a@example.com", "a@deushcs.com.evil.test", "a\n@deushcs.com", `${"a".repeat(117)}@deushcs.com`])("refuses malformed or foreign email %j", (email) => {
    expect(signInEmail(email)).toBeNull();
    expect(decideCodeRequest(email, true, empty(), NOW)).toEqual({ status: "wrongDomain" });
  });

  it("normalizes case/space and distinguishes a missing/inactive person from an eligible request", () => {
    expect(signInEmail(`  ${EMAIL.toUpperCase()} `)).toBe(EMAIL);
    expect(decideCodeRequest(EMAIL, false, empty(), NOW)).toEqual({ status: "notAdded" });
    expect(decideCodeRequest(EMAIL, true, empty(), NOW)).toEqual({ status: "sent" });
  });

  it("enforces the exact 60-second boundary and rounds remaining seconds up", () => {
    const state = withCode();
    expect(decideCodeRequest(EMAIL, true, state, NOW)).toEqual({ status: "wait", seconds: 60 });
    expect(decideCodeRequest(EMAIL, true, state, NOW + CODE_COOLDOWN - 1)).toEqual({ status: "wait", seconds: 1 });
    expect(decideCodeRequest(EMAIL, true, state, NOW + CODE_COOLDOWN)).toEqual({ status: "sent" });
  });

  it("limits five requests across an hour even after codes expire or are consumed, and releases the oldest slot", () => {
    const state = { ...empty(), requests: [0, 1, 2, 3, 4].map((i) => NOW + i * CODE_COOLDOWN) };
    expect(decideCodeRequest(EMAIL, true, state, NOW + 45 * 60_000)).toEqual({ status: "tooMany", minutes: 15 });
    expect(decideCodeRequest(EMAIL, true, state, NOW + CODE_WINDOW - 1)).toEqual({ status: "tooMany", minutes: 5 });
    expect(decideCodeRequest(EMAIL, true, state, NOW + CODE_WINDOW)).toEqual({ status: "sent" });
  });

  it("expires exactly at ten minutes and consumes a matching code just once", () => {
    expect(verify(withCode(), "001234", NOW + CODE_LIFETIME - 1).answer).toEqual({ status: "ok" });
    expect(verify(withCode(), "001234", NOW + CODE_LIFETIME).answer).toEqual({ status: "expired" });
    const used = verify(withCode());
    expect(used.answer).toEqual({ status: "ok" });
    expect(verify(used.state).answer).toEqual({ status: "noCode" });
    expect(verify(empty()).answer).toEqual({ status: "noCode" });
  });

  it("accepts an older unexpired code after a resend, keeping the other code and histories", () => {
    const old = withCode("001234", NOW - CODE_COOLDOWN);
    const newer = withCode("987654");
    newer.codes[0] = { ...newer.codes[0], id: "two", hash: hashSignInCode(SECRET, EMAIL, "two", "987654") };
    const state = { codes: [...old.codes, ...newer.codes], requests: [...old.requests, ...newer.requests], wrongAttempts: [NOW - 1] };
    const oldResult = verify(state);
    expect(oldResult.answer).toEqual({ status: "ok" });
    expect(verify(oldResult.state, "987654").answer).toEqual({ status: "ok" });
    expect(oldResult.state.requests).toEqual(state.requests);
    expect(oldResult.state.wrongAttempts).toEqual(state.wrongAttempts);
  });

  it("counts malformed guesses, locks on the fifth wrong try across codes, and preserves the real hourly wait", () => {
    let state = withCode();
    for (let i = 0; i < 4; i++) {
      const result = verify(state, ["", "abc", "1234567", "000000"][i], NOW + i);
      expect(result.answer).toEqual({ status: "wrong", triesLeft: 4 - i });
      state = result.state;
    }
    const fifth = verify(state, "111111", NOW + 4);
    expect(fifth.answer).toEqual({ status: "tooMany", minutes: 60 });
    expect(fifth.state.wrongAttempts).toHaveLength(5);
    const blocked = verify(fifth.state, "001234", NOW + 5);
    expect(blocked.answer).toEqual({ status: "tooMany", minutes: 60 });
    expect(blocked.state.wrongAttempts).toHaveLength(5);
    expect(decideCodeRequest(EMAIL, true, fifth.state, NOW + 46 * 60_000)).toEqual({ status: "tooMany", minutes: 15 });
    expect(decideCodeRequest(EMAIL, true, fifth.state, NOW + CODE_WINDOW)).toEqual({ status: "sent" });
    // The oldest try expires at the boundary; a new live code is no longer locked.
    const refreshed = { ...withCode("001234", NOW + CODE_WINDOW), wrongAttempts: fifth.state.wrongAttempts };
    expect(verify(refreshed, "001234", NOW + CODE_WINDOW).answer).toEqual({ status: "ok" });
  });

  it("waits for both exhausted limits, with five-minute rounding, and still lets the fifth requested code sign in", () => {
    const state = { ...withCode(), requests: [0, 1, 2, 3, 4].map((i) => NOW - 20 * 60_000 + i * CODE_COOLDOWN), wrongAttempts: [0, 1, 2, 3, 4].map((i) => NOW - 9 * 60_000 + i) };
    expect(decideCodeRequest(EMAIL, true, state, NOW)).toEqual({ status: "tooMany", minutes: 55 });
    expect(verify({ ...state, wrongAttempts: [] }).answer).toEqual({ status: "ok" });
  });

  it("does not count expired/no-code attempts, prunes old history and rejects damaged records", () => {
    expect(verify(withCode(), "000000", NOW + CODE_LIFETIME).state.wrongAttempts).toEqual([]);
    expect(verify(empty(), "000000").state.wrongAttempts).toEqual([]);
    expect(currentSignInCodeState(withCode(), NOW + CODE_WINDOW)).toEqual(empty());
    expect(readSignInCodeState(undefined)).toEqual(empty());
    expect(readSignInCodeState(withCode())).toEqual(withCode());
    for (const bad of [null, {}, { ...empty(), wrongAttempts: Array(6).fill(NOW) }, { ...empty(), requests: [NaN] }, { ...withCode(), codes: [{ hash: "plaintext" }] }]) {
      expect(() => readSignInCodeState(bad)).toThrow("Invalid sign-in code record");
    }
  });
});
