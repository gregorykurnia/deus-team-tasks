import "server-only";
import nodemailer from "nodemailer";
import { USE_EMULATOR } from "./emulator";

export async function sendSignInMail(to: string, code: string): Promise<void> {
  const subject = `${code} is your DEUS Space code`;
  if (process.env.NEXT_PUBLIC_USE_EMULATOR === "1" && !USE_EMULATOR) {
    throw new Error("The fake mailer requires a non-production emulator process.");
  }
  if (USE_EMULATOR) {
    const { adminDb } = await import("./admin");
    await adminDb.collection("_fakeMail").add({ to, subject, code });
    return;
  }
  if (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    throw new Error("SMTP is disabled when Firebase emulators are configured.");
  }
  const { SMTP_HOST: host, SMTP_PORT, SMTP_USER: user, SMTP_PASS: pass, MAIL_FROM: from } = process.env;
  const port = Number(SMTP_PORT);
  if (!host || !user || !pass || !from || ![465, 587].includes(port)) {
    throw new Error("Configure SMTP_HOST, SMTP_PORT (465 or 587), SMTP_USER, SMTP_PASS and MAIL_FROM.");
  }
  const transport = nodemailer.createTransport({
    host, port, secure: port === 465, requireTLS: true,
    auth: { user, pass }, connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000,
    disableFileAccess: true, disableUrlAccess: true, logger: false, debug: false,
  });
  try {
    const receipt = await transport.sendMail({
      from, to, subject,
      text: `Your code to sign in to DEUS Space:\n\n${code}\n\nIt works for 10 minutes, once. If you didn’t ask for it, you can ignore this email: nobody can sign in without the code.\n\nDEUS Space · the DEUS team’s tasks and companies`,
    });
    if (!receipt.accepted.includes(to)) throw new Error("The sign-in email was not accepted.");
  } finally { transport.close(); }
}
