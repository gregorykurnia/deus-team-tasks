// Turns the prototype's mock data (redesign/design/prototype/assets/data.js) into the app's stored shape and writes it
// to the Firestore emulator, so a prototype screen and the matching new screen show the same people, tasks and companies.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { clearAll, seed } from "../../tests/support/emulator.ts";

const ROOT = path.resolve(import.meta.dirname, "../..");
const PROTO = path.join(ROOT, "redesign/design/prototype");

// The prototype's data, run in a sandbox with its own fixed "today" (Tuesday 20 October 2026).
export function protoData(stress) {
  const sandbox = { window: {}, Date };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(PROTO, "assets/data.js"), "utf8"), sandbox);
  return stress ? sandbox.window.PROTO_DATA.stress() : sandbox.window.PROTO_DATA.normal();
}

const GROUP = { lead: "toApproach", active: "active", done: "dealDone", hold: "noOrNotNow" };
const KEY = { contact: "pic", type: "type", status: "status", answer: "answer", prio: "priority", products: "product", reason: "reason",
  outreach: "reach", last: "date", target: "target", trial: "trial", industry: "industry", source: "sourcing" };
const TASK_TYPE = { "Follow-up": "Follow Up", Proposal: "Send Proposal/Quote", Demo: "Our Action", Trial: "Trial Pending", Review: "Our Action",
  Renewal: "Contract/Paperwork", Admin: "Our Action", Hiring: "Our Action" };
const LIKELY = { vhigh: "Very High", high: "High", med: "Medium", mlow: "Moderately Low", low: "Low" };
// The options the app's rules depend on keep the app's own names (lib/companies.ts).
const LOCKED_NAME = { won: "Client / Partner Done Deal", fu: "To Follow Up", later: "Not now", no: "No", high: "High" };
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const ms = (iso) => (iso ? new Date(iso + "T10:00:00+07:00").getTime() : 1760000000000);

export function convert(db) {
  const coNum = new Map();
  db.companies.forEach((c, i) => coNum.set(c.id, i + 1));
  const fieldKey = (f) => (f.own ? "cx_" + f.id : f.id === "next" || f.id === "notes" ? "notes" : KEY[f.id] ?? f.id);
  const optName = (fid, id) => {
    const o = (db.coOptions[fid] ?? []).find((x) => x.id === id);
    return !o ? id : LOCKED_NAME[id] && ["status", "answer", "prio"].includes(fid) ? LOCKED_NAME[id] : o.label;
  };
  const choiceFields = new Set(db.coFields.filter((f) => f.kind === "choice").map((f) => f.id));

  // Company settings: options by field key, fields by group, the shown ones first in the prototype's order.
  const options = {};
  for (const [fid, list] of Object.entries(db.coOptions)) {
    const f = db.coFields.find((x) => x.id === fid);
    options[f ? fieldKey(f) : fid] = list.map((o) => ({ name: optName(fid, o.id), colour: o.color }));
  }
  const fields = {};
  for (const [stage, group] of Object.entries(GROUP)) {
    const mine = db.coFields.filter((f) => f.groups.includes(stage));
    const shown = db.coShown[stage] ?? [];
    const order = [...shown.filter((id) => mine.some((f) => f.id === id)), ...mine.map((f) => f.id).filter((id) => !shown.includes(id))];
    fields[group] = order.map((id) => {
      const f = mine.find((x) => x.id === id);
      return { key: fieldKey(f), label: f.label, type: f.kind, shown: shown.includes(id), own: !!f.own };
    });
  }

  const pipeline = db.companies.map((c) => {
    const e = { id: coNum.get(c.id), company: c.name };
    for (const f of db.coFields) {
      let v = c[f.id];
      if (f.id === "next" && !v) continue;
      if (v === undefined || v === null || v === "" ) continue;
      if (choiceFields.has(f.id)) v = optName(f.id, v);
      e[fieldKey(f)] = v;
    }
    if (c.notes && !c.next) e.notes = c.notes;
    if (c.next) e.notes = c.next;
    if (c.stage === "lead") e._raw = true;
    if (c.stage === "hold") e._hold = true;
    if (c.stage === "done" && !e.status) e.status = LOCKED_NAME.won;
    return e;
  });

  const groupName = new Map(db.groups.map((g) => [g.id, g.name]));
  const tasks = db.tasks.map((t, i) => {
    const o = { id: t.id, task: t.desc, responsible: t.resp ?? [], informed: (t.inf ?? []).map((p) => ({ name: p.name, ...(p.note ? { note: p.note } : {}) })),
      keyPoints: t.key ?? "", startDate: t.start ?? "", endDate: t.end ?? "", order: i + 1 };
    if (t.type) o.taskType = TASK_TYPE[t.type] ?? "Our Action";
    if (t.prio) o.priority = cap(t.prio);
    if (t.touch) o.touchPoint = t.touch;
    if (t.co) o.linkedClientId = coNum.get(t.co);
    if (t.group) o.taskGroup = groupName.get(t.group);
    if (t.last) o.lastActionDate = t.last;
    if (t.done) { o.completed = true; if (t.doneAt) o.completedAt = ms(t.doneAt); }
    return o;
  });
  const taskGroups = db.groups.map((g, i) => ({ id: g.id, name: g.name, order: i + 1, starred: !!g.important }));

  const role = (r) => ({ id: r.id, label: r.label, names: r.names });
  const flows = db.flows.map((f, i) => ({ id: f.id, name: f.name, description: f.desc ?? "", order: i + 1, updatedAt: ms(f.edited),
    steps: f.steps.map((s) => ({ id: s.id, title: s.title, description: s.desc ?? "", roles: s.roles.map(role) })),
    decision: f.decision ? { label: f.decision.q, description: f.decision.desc ?? "", branches: f.decision.outcomes.map((o) => ({
      id: o.id, label: "", tone: o.good ? "good" : "bad", title: o.title, description: o.desc ?? "", roles: o.roles.map(role), ...(o.back ? { loopTo: o.back } : {}) })) } : null }));

  const H = { need: "clientNeed", situation: "currentSituation", pain: "painAndBusinessImpact", fit: "solutionFit", urgency: "urgencyAndTiming",
    stake: "stakeholdersAndDecisionProcess", ready: "commercialReadiness", next: "nextStepAndOwnership", block: "potentialBlockersAnalysis" };
  const journal = db.notes.map((n) => {
    const e = { id: n.id, prospectName: n.co ? db.companies.find((c) => c.id === n.co)?.name ?? "" : n.name, updatedAt: ms(n.edited),
      clientNeed: "", currentSituation: "", painAndBusinessImpact: "", solutionFit: "", urgencyAndTiming: "", stakeholdersAndDecisionProcess: "",
      commercialReadiness: "", nextStepAndOwnership: "", potentialBlockersAnalysis: "", opportunityStatus: LIKELY[n.likely] ?? "", detailedRemarks: n.remarks ?? "" };
    for (const [k, v] of Object.entries(n.h ?? {})) if (H[k]) e[H[k]] = v;
    if (n.co) e.pipelineEntryId = coNum.get(n.co);
    return e;
  });

  const past = db.past.map((p, i) => ({ id: p.id, name: p.name, parentId: p.parent ?? null, sector: p.parent ? (p.sector || null) : p.sector || null,
    countHead: p.counted !== false, createdAt: 1760000000000 + i }));

  const events = db.events.map((e, i) => ({ id: "ev" + i, title: e.title, start: e.date, end: e.date, allDay: !!e.allDay,
    ...(e.start ? { startTime: e.start, endTime: e.end } : {}), link: "https://calendar.google.com/" }));

  return { tasks, taskGroups, flows, pipeline, journal, past, events, settings: { id: "companies", options, fields }, coNum };
}

async function chunked(project, collection, docs, opts) {
  for (let i = 0; i < docs.length; i += 400) await seed(project, collection, docs.slice(i, i + 400), opts);
}

// Clears both emulator projects and writes the converted data.
export async function seedAll(converted) {
  await clearAll();
  await chunked("tasks", "tasks", converted.tasks);
  await chunked("tasks", "taskGroups", converted.taskGroups);
  await chunked("tasks", "flows", converted.flows);
  await chunked("tasks", "settings", [converted.settings]);
  await chunked("clients", "pipeline", converted.pipeline, { keepIdField: true });
  await chunked("clients", "prospectJournal", converted.journal);
  await chunked("clients", "historicalClients", converted.past);
}
