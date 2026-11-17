// jiti runs the same server-only helpers as Next; only this Node entry point aliases the boundary marker.
import { createJiti } from "jiti";
import { fileURLToPath } from "node:url";
import { deleteApp } from "firebase-admin/app";

const jiti = createJiti(import.meta.url, { alias: {
  "server-only": fileURLToPath(new URL("../node_modules/next/dist/compiled/server-only/empty.js", import.meta.url)),
} });
let admin;
try {
  const [command, ...args] = process.argv.slice(2);
  const apply = args.includes("--apply");
  const positional = args.filter((arg) => arg !== "--apply");
  if (args.some((arg) => arg.startsWith("--") && arg !== "--apply") ||
      (command === "add" ? positional.length !== 2 : command !== "remove" || positional.length !== 1)) {
    throw new Error("Usage: npm run people:add -- <email> <name> [--apply], or npm run people:remove -- <email> [--apply]. Quote names containing spaces. Dry run is the default.");
  }
  // Validate before initializing any Firebase handle.
  const { personEmail, personName } = await jiti.import("../lib/peopleInput.ts");
  const email = personEmail(positional[0]);
  const name = command === "add" ? personName(positional[1]) : null;
  admin = await jiti.import("../lib/admin.ts");
  const people = await jiti.import("../lib/people.server.ts");
  if (command === "add") {
    const preview = await people.previewPersonAddition(email, name);
    const prefix = apply ? "Preview" : "DRY RUN";
    console.log(`${prefix}: ${preview.total ? `${preview.total} tasks carry ${name} in Responsible; ${preview.open} open.` : `No tasks carry ${name} in Responsible. Closest names: ${preview.closest.join(", ") || "none in use"}.`}`);
    console.log(preview.existing?.active
      ? `${email} is already active as ${name}; this add changes nothing.`
      : `Would link ${email} to ${name}, mark existing assignments as already told, and activate access. Task names and dates stay as they are.`);
    if (apply) {
      await people.addPerson(email, name);
      console.log(`Applied: ${email} is active as ${name}; the notice backfill is confirmed (an already-active link is unchanged).`);
    }
  } else {
    const preview = await people.previewPersonRemoval(email);
    console.log(`${apply ? "Preview" : "DRY RUN"}: ${email}${preview.person ? ` (${preview.person.name}, ${preview.person.active ? "active" : "inactive"})` : " (no person record)"}. Would disable access, delete ${preview.devices} devices and revoke refresh tokens if the account exists.`);
    if (apply) {
      await people.deactivatePerson(email);
      console.log(`Applied: access removed for ${email}; device cleanup and token revocation are confirmed.`);
    }
  }
  if (!apply) console.log("Nothing written. Run again with --apply to make these changes.");
} catch (error) {
  console.error(error instanceof Error ? error.message : "People command failed.");
  process.exitCode = 1;
} finally {
  if (admin) await deleteApp(admin.adminApp);
}
