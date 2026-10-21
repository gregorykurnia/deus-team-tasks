// The launch data step (task 4.8): imports the owner's company options and fields into the shared settings, and gives
// each subsidiary with no sector its parent's. Steps for the owner: scripts/launch/README.md.
//
//   npm run launch-data -- backup  --live | --emulator
//   npm run launch-data -- import  --live | --emulator  --settings FILE  [--write]
//   npm run launch-data -- restore --live | --emulator  DIR | --latest  [--write]
//   npm run launch-data -- seed    --emulator  DIR      (puts a backup into the emulator, as the copy to dry-run on)
//
// Nothing is written without --write. Every import with --write saves a backup first, in launch-data/.
// A live write asks to type "live" (or takes --yes when there's no terminal).
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const BACKUPS = path.join(ROOT, "launch-data");
const EMULATOR_HOST = "127.0.0.1:8180"; // firebase.json

const args = process.argv.slice(2);
const command = args[0];
const has = (flag: string) => args.includes(flag);
const valueOf = (flag: string) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};
const positional = args.slice(1).filter((a, i, all) => !a.startsWith("--") && all[i - 1] !== "--settings");

function fail(message: string): never {
  console.error(`\n${message}\n`);
  process.exit(1);
}

const live = has("--live");
const emulator = has("--emulator");
const write = has("--write");
if (!["backup", "import", "restore", "seed"].includes(command ?? "")) {
  fail("Say what to do: backup, import, restore or seed. See the top of scripts/launch/data.ts.");
}
if (live === emulator) fail("Say where: --live (the real projects) or --emulator (the local copy).");
if (command === "seed" && live) fail("seed only fills the emulator.");

// The app's Firestore handles read this when they're first imported, below.
if (emulator) process.env.NEXT_PUBLIC_USE_EMULATOR = "1";
else delete process.env.NEXT_PUBLIC_USE_EMULATOR;

const stamp = () => new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
const where = live ? "LIVE (deus-team-tasks and deus-client-tracker)" : `the emulator at ${EMULATOR_HOST}`;

async function confirmLive() {
  if (!live || !write) return;
  if (has("--yes")) return;
  if (!process.stdin.isTTY) fail("A live write needs a terminal to confirm in, or --yes.");
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`\nThis writes to the LIVE data. Type "live" to go on: `);
  rl.close();
  if (answer.trim() !== "live") fail("Stopped. Nothing was written.");
}

async function latestBackup(): Promise<string> {
  const prefix = live ? "live-" : "emulator-";
  const dirs = (await readdir(BACKUPS).catch(() => [] as string[])).filter((d) => d.startsWith(prefix)).sort();
  if (!dirs.length) fail(`No ${prefix}* backup in ${BACKUPS}.`);
  return path.join(BACKUPS, dirs[dirs.length - 1]);
}

function list(title: string, lines: string[]) {
  console.log(`\n${title}${lines.length ? "" : ": none"}`);
  for (const l of lines) console.log(`  - ${l}`);
}

async function main() {
  if (emulator) {
    const up = await fetch(`http://${EMULATOR_HOST}/`).then(
      () => true,
      () => false
    );
    if (!up) fail(`The emulator isn't running at ${EMULATOR_HOST}. Use scripts/launch/dry-run.sh, which starts it.`);
    const { openClientTrackerRules } = await import("../../tests/support/emulator");
    await openClientTrackerRules();
  }
  const { USE_EMULATOR } = await import("../../lib/emulator");
  if (USE_EMULATOR !== emulator) fail(`Stopped before reading anything: the app's Firestore points at the ${USE_EMULATOR ? "emulator" : "live projects"} (is NODE_ENV=production set?).`);
  const w = await import("./launchWrites");
  const d = await import("./launchData");

  const planOnly = !write && command !== "seed" && command !== "backup";
  console.log(`\nLaunch data step: ${command}, on ${where}${planOnly ? " (plan only: nothing is written without --write)" : ""}`);

  const backupNow = async () => {
    const dir = path.join(BACKUPS, `${live ? "live" : "emulator"}-${stamp()}`);
    const backup = await w.readBackup();
    await w.saveBackup(dir, backup, { at: new Date().toISOString(), target: live ? "live" : "emulator", command });
    console.log(
      `\nBackup saved: ${path.relative(ROOT, dir)} (${backup.settings.length} settings records, ${backup.historicalClients.length} past clients, ${backup.pipeline.length} companies)`
    );
    return { dir, backup };
  };

  if (command === "backup") {
    await backupNow();
    return;
  }

  if (command === "seed") {
    const dir = positional[0] ?? fail("Say which backup to load: seed --emulator DIR.");
    const backup = await w.loadBackup(path.resolve(dir));
    const { clearAll } = await import("../../tests/support/emulator");
    await clearAll();
    await w.seedCopy(backup);
    console.log(
      `\nThe emulator now holds ${path.relative(ROOT, path.resolve(dir))}: ${backup.settings.length} settings records, ${backup.historicalClients.length} past clients, ${backup.pipeline.length} companies.`
    );
    return;
  }

  if (command === "restore") {
    const dir = has("--latest") ? await latestBackup() : path.resolve(positional[0] ?? fail("Say which backup: DIR or --latest."));
    const backup = await w.loadBackup(dir);
    const plan = await w.restorePlan(backup);
    console.log(`\nFrom ${path.relative(ROOT, dir)}:`);
    console.log(`  settings/companies: ${plan.settingsChanged ? (plan.before ? "put back as it was" : "removed (there was none)") : "already as it was"}`);
    console.log(`  past clients whose sector goes back: ${plan.sectors.length}`);
    if (!write) return;
    await confirmLive();
    const done = await w.restore(backup);
    const after = await w.restorePlan(backup);
    if (after.settingsChanged || after.sectors.length) fail(`Restore checked and NOT complete: ${after.sectors.length} sectors still differ.`);
    console.log(`\nRestored and checked: settings ${done.settings ? "put back" : "unchanged"}, ${done.sectors} sectors put back.`);
    return;
  }

  // import
  const file = valueOf("--settings") ?? fail("Say which settings file: --settings FILE (made by export-settings.js).");
  const exported = JSON.parse(await readFile(path.resolve(file), "utf8")) as import("./launchData").OldDeviceExport;
  if (!("options" in exported) || !("columns" in exported)) fail(`${file} isn't an export from export-settings.js.`);
  const plan = d.settingsFromOldDevice(exported);
  const current = await w.readBackup();
  const backfill = w.backfillFor(current);
  console.log(`\nSettings from ${file}${exported.from ? ` (exported from ${exported.from} at ${exported.exportedAt})` : ""}`);
  list("What the import keeps from that computer", plan.notes);
  list("Look at these first", plan.warnings);
  list("In the stored settings now, and not in the import (replaced)", d.droppedByImport(w.storedSettingsIn(current), plan.settings));
  list("Company values no option has (they show as plain text)", d.valuesWithoutOption(current.pipeline.map((c) => c.data), plan.settings));
  console.log(`\nSubsidiaries that take their parent's sector: ${backfill.length} of ${current.historicalClients.filter((c) => c.data.parentId).length}`);
  for (const b of backfill.slice(0, 10)) console.log(`  - ${b.id}: ${b.sector}`);
  if (backfill.length > 10) console.log(`  - and ${backfill.length - 10} more`);
  if (!write) return;

  await confirmLive();
  const { dir } = await backupNow();
  await w.writeSettings(plan.settings);
  const sectors = await w.writeSectors(backfill);

  // Read back and check.
  const stored = await w.storedSettingsNow();
  if (w.stable(stored) !== w.stable(JSON.parse(JSON.stringify(plan.settings)))) fail("Check failed: settings/companies doesn't hold what was written.");
  const after = await w.readBackup();
  const left = w.backfillFor(after);
  const byId = new Map(after.historicalClients.map((c) => [c.id, c.data]));
  const wrong = backfill.filter((b) => byId.get(b.id)?.sector !== b.sector);
  if (left.length || wrong.length) fail(`Check failed: ${left.length} subsidiaries still without a sector, ${wrong.length} with the wrong one.`);
  console.log(`\nDone and checked: settings/companies written, ${sectors} subsidiaries given their parent's sector.`);
  console.log(`To undo: npm run launch-data -- restore ${live ? "--live" : "--emulator"} ${path.relative(ROOT, dir)} --write`);
}

main().then(
  () => process.exit(0),
  (err) => fail(`Stopped: ${err instanceof Error ? err.message : String(err)}`)
);
