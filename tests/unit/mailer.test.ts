import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { createTransport, deliver, close, add, mode } = vi.hoisted(() => ({
  createTransport: vi.fn(), deliver: vi.fn(), close: vi.fn(), add: vi.fn(), mode: { emulator: false },
}));
vi.mock("nodemailer", () => ({ default: { createTransport } }));
vi.mock("../../lib/emulator", () => ({ get USE_EMULATOR() { return mode.emulator; } }));
vi.mock("../../lib/admin", () => ({ adminDb: { collection: () => ({ add }) } }));
import { sendSignInMail } from "../../lib/mailer";
const EMAIL = "audrey.wijaya@deushcs.com";
beforeEach(() => {
  vi.resetAllMocks(); mode.emulator = false;
  for (const key of ["NEXT_PUBLIC_USE_EMULATOR", "FIRESTORE_EMULATOR_HOST", "FIREBASE_AUTH_EMULATOR_HOST"]) vi.stubEnv(key, "");
  for (const [key, value] of Object.entries({ SMTP_HOST: "smtp.titan.email", SMTP_PORT: "465", SMTP_USER: "noreply@deushcs.com", SMTP_PASS: "test-only", MAIL_FROM: "DEUS Space <noreply@deushcs.com>" })) vi.stubEnv(key, value);
  createTransport.mockReturnValue({ sendMail: deliver, close });
  deliver.mockResolvedValue({ accepted: [EMAIL] });
});
afterEach(() => vi.unstubAllEnvs());

describe("sign-in mail transport", () => {
  it("sends the approved plain text over authenticated TLS and closes the connection", async () => {
    await sendSignInMail(EMAIL, "001234");
    expect(createTransport).toHaveBeenCalledWith(expect.objectContaining({ host: "smtp.titan.email", port: 465, secure: true, requireTLS: true, debug: false, logger: false }));
    expect(deliver).toHaveBeenCalledWith({ from: "DEUS Space <noreply@deushcs.com>", to: EMAIL, subject: "001234 is your DEUS Space code", text: "Your code to sign in to DEUS Space:\n\n001234\n\nIt works for 10 minutes, once. If you didn’t ask for it, you can ignore this email: nobody can sign in without the code.\n\nDEUS Space · the DEUS team’s tasks and companies" });
    expect(close).toHaveBeenCalledOnce();
    expect(add).not.toHaveBeenCalled();
  });
  it("requires STARTTLS on port 587", async () => {
    vi.stubEnv("SMTP_PORT", "587");
    await sendSignInMail(EMAIL, "001234");
    expect(createTransport).toHaveBeenCalledWith(expect.objectContaining({ secure: false, requireTLS: true }));
  });
  it("writes only a fake mail on the emulator even with SMTP credentials present", async () => {
    mode.emulator = true;
    vi.stubEnv("NEXT_PUBLIC_USE_EMULATOR", "1");
    await sendSignInMail(EMAIL, "001234");
    expect(add).toHaveBeenCalledWith({ to: EMAIL, subject: "001234 is your DEUS Space code", code: "001234" });
    expect(createTransport).not.toHaveBeenCalled();
  });
  it("refuses a fake in production and never falls back to SMTP for emulator hosts", async () => {
    vi.stubEnv("NEXT_PUBLIC_USE_EMULATOR", "1");
    await expect(sendSignInMail(EMAIL, "001234")).rejects.toThrow("non-production");
    vi.stubEnv("NEXT_PUBLIC_USE_EMULATOR", "");
    vi.stubEnv("FIRESTORE_EMULATOR_HOST", "127.0.0.1:8180");
    await expect(sendSignInMail(EMAIL, "001234")).rejects.toThrow("SMTP is disabled");
    expect(createTransport).not.toHaveBeenCalled();
  });
  it.each(["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "MAIL_FROM"])("fails closed without %s", async (key) => {
    vi.stubEnv(key, "");
    await expect(sendSignInMail(EMAIL, "001234")).rejects.toThrow("Configure SMTP");
    expect(createTransport).not.toHaveBeenCalled();
  });
  it("does not report success for a rejection or timeout, and closes after either", async () => {
    deliver.mockResolvedValueOnce({ accepted: [] });
    await expect(sendSignInMail(EMAIL, "001234")).rejects.toThrow("not accepted");
    deliver.mockRejectedValueOnce(new Error("timeout"));
    await expect(sendSignInMail(EMAIL, "001234")).rejects.toThrow("timeout");
    expect(close).toHaveBeenCalledTimes(2);
  });
});
