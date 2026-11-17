import { execFileSync } from "node:child_process";
import { createECDH } from "node:crypto";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";

it("prints fresh secrets and a valid VAPID pair without storing anything", () => {
  const folder = mkdtempSync(join(tmpdir(), "notify-keys-"));
  try {
    const run = () => Object.fromEntries(execFileSync(process.execPath, [join(process.cwd(), "scripts/notify-keys.mjs")], { cwd: folder, encoding: "utf8" }).trim().split("\n").map((line) => line.split("=")));
    const keys = run(), next = run();
    expect(Object.keys(keys)).toEqual(["CODE_SECRET", "CRON_SECRET", "NEXT_PUBLIC_VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"]);
    for (const key of ["CODE_SECRET", "CRON_SECRET"]) {
      expect(Buffer.from(keys[key], "base64url")).toHaveLength(32);
      expect(keys[key] === next[key]).toBe(false);
    }
    const publicKey = Buffer.from(keys.NEXT_PUBLIC_VAPID_PUBLIC_KEY, "base64url");
    expect(publicKey).toHaveLength(65);
    expect(Buffer.from(keys.VAPID_PRIVATE_KEY, "base64url")).toHaveLength(32);
    const ec = createECDH("prime256v1");
    ec.setPrivateKey(Buffer.from(keys.VAPID_PRIVATE_KEY, "base64url"));
    expect(ec.getPublicKey().equals(publicKey)).toBe(true);
    expect(keys.VAPID_SUBJECT).toBe("mailto:<the mailbox>");
    expect(readdirSync(folder)).toEqual([]);
  } finally { rmSync(folder, { recursive: true, force: true }); }
});
