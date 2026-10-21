// 4.5: runs axe (WCAG 2.2 AA plus best practice) on every state of the new app that the prototype's map.html lists
// (every screen, menu, sheet and dialog, with the same data and clicks as the compare tool), at 1440 and 390 wide.
// Writes redesign/a11y/report.json (git-ignored) and prints the violations grouped by rule.
//
//   node scripts/a11y/axe.mjs [--only <regex on the state id>] [--size desktop|phone] [--servers] [--stress] [--distinct]
//
// With --servers it starts the Firestore emulator and `next dev`, and stops them after. Without it, they must be
// running already (emulator 8180, app 3100). Stress states are left out unless --stress is given. With --distinct, states
// that differ only in data or filters (the same screen, menu or sheet) are shot once: axe finds structure, not content.
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { openClientTrackerRules, seed } from "../../tests/support/emulator.ts";
import { convert, protoData, seedAll } from "../compare/seed.mjs";
import { parseMap, plan } from "../compare/states.mjs";
import { dataFor, recipe, tweakData, colleagueChange } from "../compare/recipes.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");
const OUT = path.join(ROOT, "redesign/a11y");
const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : null);
const only = opt("only") ? new RegExp(opt("only")) : null;
const SIZES = { desktop: { width: 1440, height: 900 }, phone: { width: 390, height: 844 } };
const sizes = opt("size") ? [opt("size")] : ["desktop", "phone"];
const APP = "http://localhost:3100";
const TODAY = new Date("2026-10-20T09:00:00+07:00");
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const children = [];
async function startServers() {
  const run = (argv, env = {}) => children.push(spawn("npx", argv, { cwd: ROOT, env: { ...process.env, ...env }, stdio: "ignore", detached: true }));
  run(["firebase", "emulators:start", "--only", "firestore", "--project", "demo-deus"]);
  run(["next", "dev", "--port", "3100"], { NEXT_PUBLIC_USE_EMULATOR: "1" });
  for (const url of ["http://127.0.0.1:8180", APP]) for (let i = 0; i < 120; i++) { try { if ((await fetch(url)).status < 500) break; } catch {} await sleep(1000); }
}
const stopServers = () => children.forEach((c) => { try { process.kill(-c.pid, "SIGTERM"); } catch {} });

let seeded = null;
let current = null;
async function ensureData(p) {
  const key = JSON.stringify([p.stress, dataFor(p)]);
  if (key === seeded) return;
  const db = protoData(p.stress);
  const tweaked = dataFor(p) === "empty" ? { ...db, tasks: [], groups: [], companies: [], notes: [], past: [], flows: [] } : dataFor(p) === "all" ? db : tweakData(db, p);
  const converted = convert(tweaked);
  await seedAll(converted);
  current = { db: tweaked, converted };
  seeded = key;
}

// A suggestion list has no tab stop of its own: the field drives it with the arrow keys (aria-activedescendant), so axe's
// "scrollable region must have keyboard access" is dropped for lists marked data-keys-via-input.
function skipKeysViaInput(v) {
  if (v.id !== "scrollable-region-focusable") return v;
  const nodes = v.nodes.filter((n) => !/data-keys-via-input/.test(n.html));
  return nodes.length ? { ...v, nodes } : null;
}

async function runOne(browser, entry, sizeName, report) {
  const p = plan(entry);
  if (p.skip) return;
  const size = SIZES[sizeName];
  await ensureData(p);
  const events = current.converted.events;
  const opts = { viewport: size, timezoneId: "Asia/Jakarta", reducedMotion: "reduce", ...(sizeName === "phone" ? { isMobile: true, hasTouch: true } : {}) };
  const r = recipe(p, { db: current.db, coNum: current.converted.coNum, phone: sizeName === "phone" });
  const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
  const ctx = await browser.newContext(r.iphone ? { ...opts, userAgent: IPHONE } : opts);
  if (r.standalone) await ctx.addInitScript(() => Object.defineProperty(navigator, "standalone", { get: () => true }));
  await ctx.clock.install({ time: TODAY });
  if (r.offer) await ctx.addInitScript(() => {
    const send = () => { const e = new Event("beforeinstallprompt", { cancelable: true }); e.prompt = async () => {}; e.userChoice = new Promise(() => {}); window.dispatchEvent(e); };
    for (const ms of [800, 1600, 2600, 4000]) setTimeout(send, ms);
  });
  const page = await ctx.newPage();
  const errors = [];
  await page.route("**/api/calendar?**", async (route) => {
    if (p.calendar === "hold") return;
    const body = p.calendar === "ok" ? { status: "ok", events } : p.calendar === "off" ? { status: "off", events: [], error: "Google Calendar not configured" } : { status: "failed", events: [], error: "Failed to fetch Google Calendar events" };
    await route.fulfill({ json: body });
  });
  if (p.net === "hold") await page.route(/127\.0\.0\.1:8180/, () => {});
  if (p.net === "blocked") await page.route(/127\.0\.0\.1:8180/, (r) => r.abort());
  const url = APP + r.path + (r.params.toString() ? "?" + r.params : "");
  await page.goto(url);
  if (p.net === "hold") await sleep(1800);
  else if (p.net === "blocked") await page.getByText("No connection.").first().waitFor({ timeout: 25000 }).catch(() => {});
  else await page.getByText("Live, everyone's up to date").first().waitFor({ state: "attached", timeout: 30000 }).catch(() => errors.push("never went live"));
  if (["online", "live", "drop", "back"].includes(p.net)) {
    await page.waitForFunction(() => !/Loading (tasks|companies|task groups|past clients|flows|qualification notes|prospects|notes)/i.test(document.body.innerText), null, { timeout: 90000 }).catch(() => errors.push("still loading"));
    let last = "", same = 0;
    for (let i = 0; i < 40 && same < 3; i++) {
      const now = await page.evaluate(() => document.body.innerText.length + ":" + document.body.innerText.slice(0, 400));
      same = now === last ? same + 1 : 0;
      last = now;
      await sleep(400);
    }
  }
  if (p.net === "drop" || p.net === "back") {
    await ctx.setOffline(true);
    await page.route(/127\.0\.0\.1:8180/, (route) => route.abort());
    await page.getByText("No connection.").first().waitFor({ timeout: 25000 }).catch(() => errors.push("no offline banner"));
    if (p.net === "back") {
      await page.unroute(/127\.0\.0\.1:8180/);
      await ctx.setOffline(false);
      await page.getByText("Back online").first().waitFor({ timeout: 25000 }).catch(() => errors.push("no back-online toast"));
    }
  }
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  await sleep(500);
  for (const step of r.steps) {
    try { await step(page, { sleep, phone: sizeName === "phone" }); } catch (e) { errors.push("step: " + String(e.message).slice(0, 300)); }
  }
  if (p.net === "live") { await colleagueChange(p, seed, current.converted); seeded = null; await sleep(900); }
  await sleep(300);
  const res = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  await ctx.close();
  if (p.open && !p.stress) seeded = null;
  report.push({
    id: `${entry.id}-${sizeName}`, url, errors,
    violations: res.violations.map(skipKeysViaInput).filter(Boolean).map((v) => ({ rule: v.id, impact: v.impact, help: v.help, nodes: v.nodes.map((n) => ({ target: n.target.join(" "), html: n.html.slice(0, 160), why: (n.any[0] ?? n.all[0] ?? n.none[0])?.message?.slice(0, 200) })) })),
  });
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  if (flag("servers")) await startServers();
  await openClientTrackerRules();
  const browser = await chromium.launch();
  const report = [];
  const keyOf = (e) => { const p = plan(e); return JSON.stringify([p.stress, dataFor(p)]); };
  const once = new Set();
  const distinct = (e) => {
    if (!flag("distinct")) return true;
    const p = plan(e);
    const key = [p.page, p.open, p.state, p.path.replace(/\/[a-z]\d+$/, "")].join("|");
    return !once.has(key) && !!once.add(key);
  };
  const entries = parseMap().filter((e) => (flag("stress") || !plan(e).stress) && (!only || only.test(e.id)) && distinct(e)).sort((a, b) => (keyOf(a) < keyOf(b) ? -1 : keyOf(a) > keyOf(b) ? 1 : a.n - b.n));
  try {
    for (const entry of entries) for (const s of sizes) {
      try { await runOne(browser, entry, s, report); }
      catch (e) { report.push({ id: `${entry.id}-${s}`, failed: String(e.message).split("\n")[0].slice(0, 200) }); console.log("FAILED", entry.id, s, String(e.message).split("\n")[0]); }
      fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 1));
    }
  } finally {
    await browser.close();
    if (flag("servers")) stopServers();
  }
  // Summary: each rule and impact, with the distinct elements (by selector) and the states that show them.
  const byRule = new Map();
  for (const st of report) for (const v of st.violations ?? []) {
    const e = byRule.get(v.rule) ?? { impact: v.impact, help: v.help, targets: new Map() };
    for (const n of v.nodes) { const t = e.targets.get(n.target) ?? { html: n.html, why: n.why, states: [] }; t.states.push(st.id); e.targets.set(n.target, t); }
    byRule.set(v.rule, e);
  }
  const order = { critical: 0, serious: 1, moderate: 2, minor: 3 };
  for (const [rule, e] of [...byRule].sort((a, b) => order[a[1].impact] - order[b[1].impact])) {
    console.log(`\n## ${e.impact} ${rule}: ${e.help} (${e.targets.size} elements)`);
    for (const [t, d] of [...e.targets].slice(0, 12)) console.log(`  ${t}\n    ${d.html}\n    ${d.why ?? ""}\n    in ${d.states.length} states, e.g. ${d.states.slice(0, 2).join(", ")}`);
  }
  console.log(`\n${report.length} state runs, ${report.filter((r) => r.failed).length} failed, ${byRule.size} rules hit`);
}
main();
