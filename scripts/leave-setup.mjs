import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
import { deleteApp } from "firebase-admin/app";

// Use the same validation and transactions as the app from this Node entry point.
const jiti = createJiti(import.meta.url, { alias: {
  "server-only": fileURLToPath(new URL("../node_modules/next/dist/compiled/server-only/empty.js", import.meta.url)),
} });

let admin;
try {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const [input, ...other] = args.filter((arg) => arg !== "--apply");
  const seed = input === "--holidays";
  if (!input || other.length || (input.startsWith("--") && !seed) || args.length > 2) {
    throw new Error("Usage: npm run leave:setup -- <file.json> [--apply] or npm run leave:setup -- --holidays [--apply]. Dry run is the default.");
  }
  const content = JSON.parse(await readFile(seed ? new URL("../lib/leaveHolidays.json", import.meta.url) : input, "utf8"));
  admin = await jiti.import("../lib/admin.ts");
  const { setupLeaveProfiles, seedLeaveHolidays } = await jiti.import("../lib/leave.server.ts");

  if (seed) {
    const rows = await seedLeaveHolidays(content, apply);
    console.log(content.source);
    console.table(rows.map(({ date, before, after }) => ({ date, old: before?.name ?? "—", new: after?.name ?? "—" })));
  } else {
    const rows = await setupLeaveProfiles(content, apply);
    console.table(rows.map(({ before, after }) => {
      const change = (field) => `${before?.[field] ?? "—"} → ${after[field] ?? "—"}`;
      return {
        email: after.email, name: after.name, joinDate: change("joinDate"), accrualStart: change("accrualStart"),
        openingBalance: change("openingBalance"), openingDate: change("openingDate"), openingCarried: change("openingCarried"),
      };
    }));
  }
  console.log(apply ? "Apply confirmed." : "DRY RUN. Nothing written. Run again with --apply to make these changes.");
} catch (error) {
  console.error(error instanceof Error ? error.message : "Leave setup failed.");
  process.exitCode = 1;
} finally {
  if (admin) {
    if (admin.adminDataApp !== admin.adminApp) await deleteApp(admin.adminDataApp);
    await deleteApp(admin.adminApp);
  }
}
