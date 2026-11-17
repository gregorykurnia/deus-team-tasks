import "server-only";
import { randomUUID } from "node:crypto";
import { adminAuth, adminDb } from "./admin";
import { readPerson } from "./people.server";
import { sendSignInMail } from "./mailer";
import {
  CODE_LIFETIME, currentSignInCodeState, decideCodeRequest, decideCodeVerify,
  hashSignInCode, makeSignInCode, matchesSignInCode, readSignInCodeState, signInEmail,
  type RequestCodeAnswer, type VerifyCodeAnswer,
} from "./signInCodes";

function codeSecret(): string {
  const secret = process.env.CODE_SECRET;
  if (!secret || secret.length < 32) throw new Error("CODE_SECRET must have at least 32 characters.");
  return secret;
}

export async function requestSignInCode(rawEmail: unknown): Promise<RequestCodeAnswer> {
  const email = signInEmail(rawEmail);
  if (!email) return { status: "wrongDomain" };
  const secret = codeSecret();
  const reservation = await adminDb.runTransaction(async (tx) => {
    const ref = adminDb.collection("signInCodes").doc(email);
    const [personDoc, stored] = await tx.getAll(adminDb.collection("people").doc(email), ref);
    const now = Date.now();
    const state = readSignInCodeState(stored.data());
    const answer = decideCodeRequest(email, readPerson(personDoc)?.active === true, state, now);
    if (answer.status !== "sent") return { answer, code: null };
    const current = currentSignInCodeState(state, now);
    let code: string;
    do { code = makeSignInCode(); }
    while (current.codes.some((c) => matchesSignInCode(secret, email, c, code)));
    const id = randomUUID();
    tx.set(ref, {
      ...current, requests: [...current.requests, now],
      codes: [...current.codes, { id, hash: hashSignInCode(secret, email, id, code), createdAt: now, expiresAt: now + CODE_LIFETIME, used: false }],
    });
    return { answer, code };
  }, { maxAttempts: 20 });
  // Never send inside a retried transaction. An uncertain SMTP outcome keeps the code valid
  // and its limits intact; a retry cannot flood the mailbox or invalidate a delivered code.
  if (reservation.code !== null) await sendSignInMail(email, reservation.code);
  return reservation.answer;
}

export async function verifySignInCode(rawEmail: unknown, code: string): Promise<Exclude<VerifyCodeAnswer, { status: "ok" }> | { token: string }> {
  const email = signInEmail(rawEmail);
  if (!email) return { status: "noCode" };
  const secret = codeSecret();
  return adminDb.runTransaction(async (tx) => {
    const ref = adminDb.collection("signInCodes").doc(email);
    const [personDoc, stored] = await tx.getAll(adminDb.collection("people").doc(email), ref);
    const person = readPerson(personDoc);
    if (!person?.active) return { status: "noCode" };
    const { answer, state } = decideCodeVerify(readSignInCodeState(stored.data()), email, code, secret, Date.now());
    if (answer.status === "ok") {
      // Signing has no external write. If it fails, the transaction leaves the code usable.
      // A token only escapes after commit, so parallel successes cannot reuse a code.
      const token = await adminAuth.createCustomToken(email, { name: person.name });
      tx.set(ref, state);
      return { token };
    }
    if (stored.exists) tx.set(ref, state);
    return answer;
  }, { maxAttempts: 20 });
}
