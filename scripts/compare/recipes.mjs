// How each prototype state is reached in the new app: which data it needs, the clicks that open a menu or sheet,
// and what a colleague's live change is. Names are the visible words and accessible names of the new screens.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function dataFor(p) {
  if (p.data === "empty") return "empty";
  return ["no-clients", "quiet", "empty-group", "one-parent", "umbrella-only", "free-today"].includes(p.state) ? p.state + ":" + (p.entry.href.match(/[?&]g=(\w+)/)?.[1] ?? "") : "all";
}

// The data tweaks the prototype's own pages make for a state (app.js, companies.js, past.js).
export function tweakData(db, p) {
  const d = { ...db };
  const diff = (iso) => Math.round((new Date(iso + "T00:00:00") - new Date("2026-10-20T00:00:00")) / 864e5);
  if (p.state === "no-clients") d.tasks = db.tasks.filter((t) => { const c = t.co && db.companies.find((x) => x.id === t.co); return !(c && c.stage === "done"); });
  if (p.state === "quiet") d.tasks = db.tasks.filter((t) => t.done || (t.end && diff(t.end) > 3));
  if (p.state === "empty-group") d.companies = db.companies.filter((c) => c.stage !== (p.entry.href.match(/[?&]g=(\w+)/)?.[1] || "hold"));
  if (p.state === "one-parent") d.past = db.past.filter((x) => x.id === "p3" || x.parent === "p3");
  if (p.state === "umbrella-only") d.past = db.past.filter((x) => x.id === "p2");
  return d;
}

/* ---------- Steps ---------- */
const ROLES = ["button", "menuitem", "menuitemradio", "menuitemcheckbox", "link", "tab", "radio", "option", "checkbox"];
const re = (x) => (x instanceof RegExp ? x : new RegExp(x, "i"));

// Clicks the first visible thing with these words, whatever it is.
const click = (name, o = {}) => async (page) => {
  const scope = o.within ? page.locator(o.within).last() : page;
  for (const role of o.role ? [o.role] : ROLES) {
    const loc = scope.getByRole(role, { name: re(name) });
    if (await loc.count()) {
      await (o.nth === "last" ? loc.last() : loc.first()).click({ timeout: 4000 });
      await sleep(o.wait ?? 500);
      return;
    }
  }
  await scope.getByText(re(name)).first().click({ timeout: 4000 });
  await sleep(o.wait ?? 500);
};
// A filter or sort control: on phones it sits behind the toolbar's own button.
const tool = (name, behind = /^(Filter|Search)/) => async (page, ctx) => {
  if (ctx.phone) {
    const b = page.getByRole("button", { name: /^Filter/ }).first();
    if (await b.count()) { await b.click(); await sleep(500); }
  }
  await click(name)(page, ctx);
};
const type = (label, text, o = {}) => async (page) => {
  const loc = o.role ? page.getByRole(o.role, { name: re(label) }).first() : page.getByLabel(re(label)).first();
  await loc.fill(text);
  await sleep(o.wait ?? 400);
};
const wait = (ms) => async () => sleep(ms);
const press = (key) => async (page) => { await page.keyboard.press(key); await sleep(300); };
const first = (...fns) => async (page, ctx) => { let e; for (const f of fns) { try { await f(page, ctx); return; } catch (x) { e = x; } } throw e; };

export function recipe(p, ctx = {}) {
  const r = { path: p.path, params: new URLSearchParams(p.params), steps: [...(p.steps || [])] };
  const open = p.open;
  const num = (id) => ctx.coNum?.get(id);
  const taskId = (...ids) => ids.find((id) => ctx.db?.tasks.some((t) => t.id === id)) ?? ctx.db?.tasks.find((t) => !t.done)?.id;
  const S = (...x) => r.steps.push(...x);
  const P = (k, v = "1") => r.params.set(k, v);

  // Prototype steps from the map's own address (the "kind" chip, "x" expanded parent).
  r.steps = r.steps.map((s) => {
    if (s.chip) return click(new RegExp(`^${s.chip === "prospect" ? "Prospects" : s.chip === "client" ? "Clients" : "Internal"}`), { role: "radio" });
    if (s.expand) return click(new RegExp(`Show .*subsidiaries of ${ctx.db?.past.find((x) => x.id === s.expand)?.name ?? ""}`));
    return s;
  });

  // The company record, from a company in the prototype's own ids.
  if (p.company) { P("company", String(num(p.company))); }
  if (p.page === "notes" && p.company) { r.params.delete("company"); P("company", String(num(p.company))); }

  switch (p.page + ":" + open) {
    case "index:install": P("install"); r.offer = true; break;
    case "index:install-ios": P("install"); r.iphone = true; break;
    case "index:install-done": P("install"); r.standalone = true; break;
    case "index:more": P("more"); break;

    case "tasks:columns": S(tool(/Details shown/)); break;
    case "tasks:sort": S(tool(/^Sort/)); break;
    case "tasks:idle": S(tool(/No action for/)); break;
    case "tasks:select-none": P("select"); break;
    case "tasks:select": P("select"); S(selectRows(3)); break;
    case "tasks:select-all": P("select"); S(click(/Select all/)); break;
    case "tasks:select-move": P("select"); S(selectRows(3), click(/Move to group/)); break;
    case "tasks:select-delete": P("select"); S(selectRows(3), click(/^Delete/, { within: '[aria-label="Selected tasks"]' })); break;
    case "tasks:group-new": P("newGroup"); break;
    case "tasks:group-empty": P("newGroup"); S(click(/Create group/, { role: "button" })); break;
    case "tasks:group-dup": P("newGroup"); S(type(/Group name|Name/, "Hiring"), click(/Create group/, { role: "button" })); break;
    case "tasks:group-fail": P("newGroup"); S(type(/Group name|Name/, "Partner events"), goOffline, click(/Create group/, { role: "button" }), wait(1200)); break;
    case "tasks:group-rename": S(click(/^Options for/), click(/Rename group/)); break;
    case "tasks:group-delete": S(click(/^Options for/), click(/Delete group/)); break;
    case "tasks:task-new": P("task", "new"); break;
    case "tasks:task-new-full": P("task", "new"); S(click(/Add details/)); break;
    case "tasks:task-required": P("task", "new"); S(click(/Add details/), click(/^(Add task|Save|Add)/, { within: '[role="dialog"]' })); break;
    case "tasks:task-edit": P("task", taskId("t1", "s1")); break;
    case "tasks:task-edit-int": P("task", taskId("t7", "s8")); break;
    case "tasks:task-done": P("task", ctx.db?.tasks.find((t) => t.done)?.id); break;
    case "tasks:task-names": P("task", taskId("t5", "s1")); S(type(/Responsible/, "ra", { role: "combobox" })); break;
    case "tasks:task-names-new": P("task", taskId("t5", "s1")); S(async (page) => { await page.getByPlaceholder(/keep informed/i).fill("Nadia"); await sleep(400); }); break;
    case "tasks:task-delete": P("task", taskId("t1", "s1")); S(click(/Delete task|Delete/, { within: '[role="dialog"]' })); break;

    case "plan:rows": S(tool(/Rows/)); break;
    case "plan:person": S(tool(/Person/)); break;
    case "plan:work": S(tool(/Work/)); break;

    case "companies:sort": S(tool(/^Sort/)); break;
    case "companies:edit-status": S(click(/^Status: .*Change/, { role: "button" })); break;
    case "companies:edit-date": S(click(/^Target date: .*Change/, { role: "button" })); break;
    case "companies:edit-text": S(click(/^Next actions: .*Change/, { role: "button" })); break;
    case "companies:row-menu": S(click(/^More for /)); break;
    case "companies:record-cold": P("company", num("sem")); break;
    case "companies:record-lead": r.params.set("group", "to-approach"); P("company", num("bal")); break;
    case "companies:record-hold": r.params.set("group", "no-or-not-now"); P("company", num("jas")); break;
    case "companies:followup": S(click(/^More for /), click(/follow-up task/i)); break;
    case "companies:delete": P("company", num("hal")); S(click(/^More for Halcyon/), click(/Delete company/)); break;
    case "companies:new": P("newCompany"); break;
    case "companies:new-required": P("newCompany"); S(click(/^(Add company|Create|Add|Save)/, { within: '[role="dialog"]' })); break;
    case "companies:move": r.params.set("group", "to-approach"); S(click(/^More for Lumen/), click(/^Move/)); break;
    case "companies:move-hold": S(click(/^More for Halcyon/), click(/^Move/)); break;
    case "companies:fields": P("fields", ({ lead: "toApproach", active: "active", done: "dealDone", hold: "noOrNotNow" })[p.entry.href.match(/[?&]g=(\w+)/)?.[1] ?? "active"]); break;
    case "companies:field-new": P("fields", "active"); S(click(/Add a field/)); break;
    case "companies:field-remove": P("fields", "active"); S(click(/Remove field|^Remove/, { nth: "last" })); break;
    case "companies:options": P("fields", "active"); S(click(/Options/)); break;
    case "companies:option-remove": P("fields", "active"); S(click(/Options/), click(/^Remove /, { role: "button" })); break;
    case "companies:export": S(tool(/Export/)); break;

    case "notes:remarks": r.path = "/notes/n1"; S(click(/Show all remarks/)); break;
    case "notes:link": r.path = "/notes/n9"; S(click(/Link to a tracked company|Link/)); break;
    case "notes:new": P("newNotes"); break;
    case "notes:new-untracked": P("newNotes"); S(click(/Not tracked yet/)); break;
    case "notes:new-required": P("newNotes"); S(click(/Not tracked yet/), click(/^Start notes/)); break;
    case "notes:delete": r.path = "/notes/n1"; S(click(/More for these notes/), click(/Delete these notes/)); break;
    case "notes:export": S(tool(/Export/)); break;

    case "past:sort": S(tool(/Order/)); break;
    case "past:add": P("add"); break;
    case "past:add-sub": P("add"); S(click(/A subsidiary of/)); break;
    case "past:add-sector": P("add"); S(type(/Company name/, "Nusa Outlet"), async (page) => { await page.getByPlaceholder(/Pick a sector/).fill(" retail"); await sleep(500); }); break;
    case "past:add-required": P("add"); S(click(/^Add past client/, { within: '[role="dialog"]' })); break;
    case "past:sector": S(click(/Show the subsidiaries of Nusantara/), click(/Change the sector of Nusa Mart/)); break;
    case "past:rename": S(click(/^Rename Meridian Bank/)); break;
    case "past:move": S(click(/Show the subsidiaries of Nusantara/), click(/^More for Nusa Mart/), click(/Move/)); break;
    case "past:menu": S(click(/^More for Meridian Bank/)); break;
    case "past:delete-blocked": S(click(/^More for Nusantara Retail/), click(/Delete/)); break;
    case "past:delete-sub": S(click(/Show the subsidiaries of Nusantara/), click(/^More for Nusa Mart/), click(/Delete subsidiary|Delete/)); break;
    case "past:delete": S(click(/^More for Garuda Air/), click(/Delete/)); break;
    case "past:export": S(tool(/Export/)); break;

    case "flows:edit": r.path = "/flows/f1"; P("edit"); break;
    case "flows:names": r.path = "/flows/f1"; P("edit"); S(async (page) => { await page.getByPlaceholder("Type a name").first().fill("a"); await sleep(500); }); break;
    case "flows:decision-new": r.path = "/flows/f5"; P("edit"); S(click(/Add a decision|Decision/)); break;
    case "flows:no-steps": r.path = "/flows/f6"; break;
    case "flows:new": P("newFlow"); break;
    case "flows:new-required": P("newFlow"); S(click(/Create flow/)); break;
    case "flows:menu": r.path = "/flows/f1"; S(click(/More for this flow/)); break;
    case "flows:delete": r.path = "/flows/f1"; S(click(/More for this flow/), click(/Delete flow/)); break;
  }
  // The state's own conditions that need a click.
  if (p.state === "saving" && p.page === "flows") { r.path = "/flows/f1"; P("edit"); }
  return r;
}

const selectRows = (n) => async (page) => {
  // Desktop has the head's tick-all box first; phones have none, so the first row is the first box.
  const boxes = page.getByRole("checkbox");
  const head = (await boxes.count()) && /^Select every/i.test((await boxes.first().getAttribute("aria-label")) || "") ? 1 : 0;
  const count = Math.min(await boxes.count(), n + head);
  for (let i = head; i < count; i++) await boxes.nth(i).click().catch(() => {});
  await sleep(400);
};
// No connection, as the app sees it: the server stops answering and the browser says it's offline.
const goOffline = async (page) => {
  await page.route(/127\.0\.0\.1:8180/, (r) => r.abort());
  await page.context().setOffline(true);
  await page.getByText("No connection.").first().waitFor({ timeout: 25000 });
  await sleep(300);
};

// A colleague's change while the page is open: the whole document again, as another device would write it.
export async function colleagueChange(p, seed, converted) {
  const c = converted;
  if (p.page === "tasks" || p.page === "index" || p.page === "plan") {
    const t = c.tasks.find((x) => !x.completed && x.endDate) ?? c.tasks[0];
    await seed("tasks", "tasks", [{ ...t, task: t.task + " (edited)", endDate: t.endDate }]);
  } else if (p.page === "companies") {
    const e = c.pipeline[0];
    await seed("clients", "pipeline", [{ ...e, pic: "Dewi Lestari" }], { keepIdField: true });
  } else if (p.page === "notes") {
    const n = c.journal.find((x) => x.id === "n3") ?? c.journal[0];
    await seed("clients", "prospectJournal", [{ ...n, clientNeed: n.clientNeed + " Updated." }]);
  } else if (p.page === "flows") {
    const f = c.flows[0];
    await seed("tasks", "flows", [{ ...f, steps: f.steps.map((s, i) => (i === 1 ? { ...s, title: s.title + " (edited)" } : s)), updatedAt: Date.now() }]);
  } else if (p.page === "past") {
    await seed("clients", "historicalClients", [{ id: "pnew", name: "Kencana Clinic Medan", parentId: "p8", sector: null, countHead: true, createdAt: Date.now() }]);
  }
}
