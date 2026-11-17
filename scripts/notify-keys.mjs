import { createECDH, randomBytes } from "node:crypto";

// stdout only: the owner runs this locally and pastes the values into Vercel.
const vapid = createECDH("prime256v1");
vapid.generateKeys();
process.stdout.write([
  `CODE_SECRET=${randomBytes(32).toString("base64url")}`,
  `CRON_SECRET=${randomBytes(32).toString("base64url")}`,
  `NEXT_PUBLIC_VAPID_PUBLIC_KEY=${vapid.getPublicKey().toString("base64url")}`,
  `VAPID_PRIVATE_KEY=${Buffer.from(vapid.getPrivateKey().toString("hex").padStart(64, "0"), "hex").toString("base64url")}`,
  "VAPID_SUBJECT=mailto:<the mailbox>",
  "",
].join("\n"));
