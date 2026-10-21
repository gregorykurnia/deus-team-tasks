// 4.4: shoots every state on the prototype's map.html and the matching screen of the new app, at 1440 and 390 wide,
// side by side, into redesign/compare/ (git-ignored). It also writes what the two screens say (their visible words) into
// redesign/compare/report.json, so differences in copy and structure show without opening every picture.
//
//   node scripts/compare/run.mjs [--only <regex on the state id>] [--size desktop|phone] [--force] [--servers]
//
// With --servers it starts the Firestore emulator, `next dev` and a static server for the prototype, and stops them after.
// Without it, they must be running already (emulator 8180, app 3100, prototype 4100).
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { chromium } from "@playwright/test";
import { openClientTrackerRules, seed } from "../../tests/support/emulator.ts";
import { convert, protoData, seedAll } from "./seed.mjs";
import { parseMap, plan } from "./states.mjs";
import { dataFor, recipe, colleagueChange } from "./recipes.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");
const OUT = path.join(ROOT, "redesign/compare");
const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : null);
const only = opt("only") ? new RegExp(opt("only")) : null;
const SIZES = { desktop: { width: 1440, height: 900 }, phone: { width: 390, height: 844 } };
const sizes = opt("size") ? [opt("size")] : ["desktop", "phone"];
const APP = "http://localhost:3100";
const PROTO = "http://localhost:4100";
const TODAY = new Date("2026-10-20T09:00:00+07:00");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const children = [];
async function startServers() {
  const run = (cmd, argv, env = {}, cwd = ROOT) => {
    const c = spawn(cmd, argv, { cwd, env: { ...process.env, ...env }, stdio: "ignore", detached: true });
    children.push(c);
  };
  run("npx", ["firebase", "emulators:start", "--only", "firestore", "--project", "demo-deus"]);
  run("npx", ["next", "dev", "--port", "3100"], { NEXT_PUBLIC_USE_EMULATOR: "1" });
  run("python3", ["-m", "http.server", "4100"], {}, path.join(ROOT, "redesign/design/prototype"));
  for (const url of ["http://127.0.0.1:8180", APP, PROTO]) for (let i = 0; i < 120; i++) { try { if ((await fetch(url)).status < 500) break; } catch {} await sleep(1000); }
}
const stopServers = () => children.forEach((c) => { try { process.kill(-c.pid, "SIGTERM"); } catch {} });

const textOf = (page) => page.evaluate(() => document.body.innerText.split("\n").map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean));

async function settle(page) {
  await page.evaluate(() => document.fonts.ready);
  await sleep(500);
}

// A menu or sheet is shot at the window's size: a full-page shot resizes the window, which closes menus.
async function shoot(page, file, size, overlay) {
  if (overlay) return page.screenshot({ path: file });
  const height = await page.evaluate(() => Math.max(document.documentElement.scrollHeight, document.body.scrollHeight));
  await page.screenshot({ path: file, fullPage: true, clip: { x: 0, y: 0, width: size.width, height: Math.min(Math.max(height, size.height), 1800) } });
}

async function sideBySide(browser, a, b, file, title, size) {
  const page = await browser.newPage({ viewport: { width: size.width * 2 + 60, height: 400 } });
  const img = (f) => `data:image/png;base64,${fs.readFileSync(f).toString("base64")}`;
  await page.setContent(`<body style="margin:0;background:#6b7280;font:600 22px system-ui;color:#fff"><div style="padding:14px 20px">${title}</div>
    <div style="display:flex;gap:20px;padding:0 20px 20px;align-items:flex-start">
      <div><div style="padding:6px 0">Prototype</div><img src="${img(a)}" style="display:block"></div>
      <div><div style="padding:6px 0">New</div><img src="${img(b)}" style="display:block"></div></div></body>`);
  await page.screenshot({ path: file, fullPage: true });
  await page.close();
}

let seeded = null;
let current = null; // the prototype's data for the state now shot, and its converted form
async function ensureData(p) {
  const key = JSON.stringify([p.stress, dataFor(p)]);
  if (key === seeded) return;
  const db = protoData(p.stress);
  const tweaked = dataFor(p) === "empty" ? { ...db, tasks: [], groups: [], companies: [], notes: [], past: [], flows: [] } : dataFor(p) === "all" ? db : (await import("./recipes.mjs")).tweakData(db, p);
  const converted = convert(tweaked);
  await seedAll(converted);
  current = { db: tweaked, converted };
  seeded = key;
}

async function runOne(browser, entry, sizeName, report) {
  const p = plan(entry);
  const size = SIZES[sizeName];
  const base = `${entry.id}-${sizeName}`;
  const files = { proto: path.join(OUT, "proto", base + ".png"), now: path.join(OUT, "new", base + ".png"), both: path.join(OUT, "both", base + ".png") };
  if (p.skip) return report.push({ id: base, skipped: p.skip });
  if (!flag("force") && fs.existsSync(files.both)) return;
  await ensureData(p);
  const events = current.converted.events;
  const opts = { viewport: size, timezoneId: "Asia/Jakarta", reducedMotion: "reduce", deviceScaleFactor: 1, ...(sizeName === "phone" ? { isMobile: true, hasTouch: true } : {}) };

  // The prototype.
  const pctx = await browser.newContext(opts);
  const pp = await pctx.newPage();
  await pp.goto(`${PROTO}/${p.proto}`);
  await settle(pp);
  if (p.state === "live" || p.state === "back-online") await sleep(1800);
  const protoText = await textOf(pp);
  await shoot(pp, files.proto, size, !!p.open);
  await pctx.close();

  // The new app.
  const r = recipe(p, { db: current.db, coNum: current.converted.coNum, phone: sizeName === "phone" });
  const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
  const ctx = await browser.newContext(r.iphone ? { ...opts, userAgent: IPHONE } : opts);
  if (r.standalone) await ctx.addInitScript(() => Object.defineProperty(navigator, "standalone", { get: () => true }));
  await ctx.clock.install({ time: TODAY }); // time keeps flowing from this day: a frozen clock would stop the app's own timeouts
  if (r.offer) await ctx.addInitScript(() => { // a browser that offers its own install (headless Chromium never does)
    const send = () => { const e = new Event("beforeinstallprompt", { cancelable: true }); e.prompt = async () => {}; e.userChoice = new Promise(() => {}); window.dispatchEvent(e); };
    for (const ms of [800, 1600, 2600, 4000]) setTimeout(send, ms);
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  await page.route("**/api/calendar?**", async (route) => {
    if (p.calendar === "hold") return; // never answers
    const body = p.calendar === "ok" ? { status: "ok", events } : p.calendar === "off" ? { status: "off", events: [], error: "Google Calendar not configured" } : { status: "failed", events: [], error: "Failed to fetch Google Calendar events" };
    await route.fulfill({ json: body });
  });
  if (p.net === "hold") await page.route(/127\.0\.0\.1:8180/, () => {});
  if (p.net === "blocked") await page.route(/127\.0\.0\.1:8180/, (r) => r.abort());
  const url = APP + r.path + (r.params.toString() ? "?" + r.params : "");
  await page.goto(url);
  const live = page.getByText("Live, everyone's up to date").first();
  if (p.net === "hold") await sleep(1800);
  else if (p.net === "blocked") await page.getByText("No connection.").first().waitFor({ timeout: 25000 }).catch(() => {});
  else await live.waitFor({ state: "attached", timeout: 30000 }).catch(() => errors.push("never went live"));
  if (["online", "live", "drop", "back"].includes(p.net)) {
    // Big data sets arrive after "Live": wait until the screens' own loading notes are gone (a calendar still loading is a state).
    await page.waitForFunction(() => !/Loading (tasks|companies|task groups|past clients|flows|qualification notes|prospects|notes)/i.test(document.body.innerText), null, { timeout: 90000 }).catch(() => errors.push("still loading after 90s"));
  }
  if (["online", "live", "drop", "back"].includes(p.net)) {
    // Plan draws grey rows, not a "Loading" line, while its tasks arrive: wait until those rows are gone.
    if (p.page === "plan") await page.waitForFunction(() => !document.querySelector('[class*="lane"] [class*="Skeleton"], [aria-label="Loading tasks"] [class*="Skeleton"]'), null, { timeout: 90000 }).catch(() => errors.push("plan rows still loading after 90s"));
    // The sources arrive one after another (3,200 companies come after the tasks): wait until the words stop changing.
    let last = "", same = 0;
    for (let i = 0; i < 80 && same < 4; i++) {
      const now = await page.evaluate(() => document.body.innerText.length + ":" + document.body.innerText.slice(0, 400));
      same = now === last ? same + 1 : 0;
      last = now;
      await sleep(500);
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
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" }); // the dev server's own badge
  await settle(page);
  for (const step of r.steps) {
    try { await step(page, { sleep, phone: sizeName === "phone" }); } catch (e) { errors.push("step: " + String(e.message).slice(0, 700)); }
  }
  if (p.net === "live") { await colleagueChange(p, seed, current.converted); seeded = null; await sleep(900); }
  await sleep(300);
  const newText = await textOf(page);
  await shoot(page, files.now, size, !!p.open);
  await ctx.close();

  if (p.open && !p.stress) seeded = null; // a click may have written (a follow-up task): the next state starts from clean data
  await sideBySide(browser, files.proto, files.now, files.both, `${entry.id} · ${entry.section} · ${entry.label} · ${entry.text} · ${sizeName}`, size);
  const set = (a) => new Set(a);
  const [a, b] = [set(protoText), set(newText)];
  report.push({ id: base, href: entry.href, newUrl: url, errors, onlyProto: protoText.filter((x) => !b.has(x)).slice(0, 40), onlyNew: newText.filter((x) => !a.has(x)).slice(0, 40) });
}

async function main() {
  for (const d of ["proto", "new", "both"]) fs.mkdirSync(path.join(OUT, d), { recursive: true });
  if (flag("servers")) await startServers();
  await openClientTrackerRules();
  const browser = await chromium.launch();
  const reportFile = path.join(OUT, "report.json");
  const old = fs.existsSync(reportFile) ? JSON.parse(fs.readFileSync(reportFile, "utf8")) : [];
  const report = [];
  const saveReport = () => {
    const ids = new Set(report.map((r) => r.id));
    fs.writeFileSync(reportFile, JSON.stringify([...old.filter((o) => !ids.has(o.id)), ...report], null, 1));
  };
  const kindOnly = opt("kind"); // "base" (no open=) or "open"
  const stressOnly = opt("stress"); // "yes" or "no": the big data set slows the emulator, so it gets a run of its own
  const entries = parseMap().filter((e) => (!stressOnly || (stressOnly === "yes") === plan(e).stress) && (!only || only.test(e.id)) && (!kindOnly || (kindOnly === "open") === /[?&]open=/.test(e.href)));
  // Seeding the big data set is slow: go through the states grouped by the data they need.
  const keyOf = (e) => { const p = plan(e); return JSON.stringify([p.stress, dataFor(p)]); };
  entries.sort((a, b) => (keyOf(a) < keyOf(b) ? -1 : keyOf(a) > keyOf(b) ? 1 : a.n - b.n));
  try {
    for (const entry of entries) for (const s of sizes) {
      const t0 = Date.now();
      try { await runOne(browser, entry, s, report); }
      catch (e) { report.push({ id: `${entry.id}-${s}`, failed: String(e.message).split("\n")[0].slice(0, 200) }); console.log("FAILED", entry.id, s, String(e.message).split("\n")[0]); }
      console.log(entry.id, s, Math.round((Date.now() - t0) / 1000) + "s");
      saveReport();
    }
  } finally {
    saveReport();
    await browser.close();
    if (flag("servers")) stopServers();
  }
}
main();
