// Reads every state out of the prototype's map.html and works out how to reach the same state in the new app:
// the route and address params, the data set, the network or calendar condition, and the clicks that open a menu or sheet.
// Nothing here is shared with the app: it only reads the prototype's map and writes addresses.
import fs from "node:fs";
import path from "node:path";

const PROTO = path.resolve(import.meta.dirname, "../../redesign/design/prototype");

const slug = (s) => s.toLowerCase().replace(/&amp;/g, "and").replace(/<[^>]+>/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
const decode = (s) => s.replace(/&amp;/g, "&").replace(/<[^>]+>/g, "").trim();

// Every link on the map: its section, the row it sits in and its words.
export function parseMap() {
  const html = fs.readFileSync(path.join(PROTO, "map.html"), "utf8");
  const out = [];
  let n = 0;
  for (const sec of html.split("<section").slice(1)) {
    const section = decode(sec.match(/<h2>(.*?)<\/h2>/)?.[1] ?? "");
    for (const row of sec.split("<tr>").slice(1)) {
      const label = decode(row.match(/<td>(.*?)<\/td>/)?.[1] ?? "");
      for (const m of row.matchAll(/<a href="([^"]+)">(.*?)<\/a>/g)) {
        n++;
        const href = m[1].replace(/&amp;/g, "&");
        out.push({ n, section, label, text: decode(m[2]), href, id: `${String(n).padStart(3, "0")}-${slug(section)}-${slug(m[2])}` });
      }
    }
  }
  return out;
}

const KIND = { pro: "prospect", cli: "client", int: "internal" };
const GROUPS = { lead: "to-approach", active: "active", done: "deal-done", hold: "no-or-not-now" };
const ACT = { cold: "gone-cold", fu: "follow-up", high: "high-priority", due: "target-close" };

export function plan(entry) {
  const [file, query = ""] = entry.href.split("?");
  const page = file.replace(".html", "");
  const q = new URLSearchParams(query);
  const get = (k) => q.get(k) ?? "";
  const p = {
    entry, page, stress: q.has("stress"), state: get("state"), open: get("open"),
    // What the new address looks like, and what the data, network and calendar do.
    path: "/", params: new URLSearchParams(), steps: [], data: "all", calendar: "ok", net: "online", tweak: null,
    proto: entry.href + (query ? "&" : "?") + "clean",
  };
  const state = p.state;
  if (state === "empty" || state === "offline-empty") p.data = "empty";
  if (state === "loading") p.net = "hold";
  if (state === "offline") p.net = "drop";
  if (state === "offline-empty") p.net = "blocked";
  if (state === "events-loading" || state === "loading" || state === "offline-empty") p.calendar = "hold";
  if (state === "events-off") p.calendar = "off";
  if (state === "events-fail" || state === "offline") p.calendar = "failed";
  if (state === "back-online") p.net = "back";
  if (state === "live") p.net = "live";
  if (state) p.tweak = state;

  const set = (k, v) => v !== undefined && v !== null && v !== "" && p.params.set(k, v);
  switch (page) {
    case "index":
      p.path = "/";
      if (get("kind")) p.steps.push({ chip: KIND[get("kind")] });
      break;
    case "tasks":
      p.path = get("group") ? `/tasks/groups/${get("group")}` : "/tasks";
      if (!get("group")) set("kind", KIND[get("kind")]);
      for (const k of ["idle", "due", "view", "range", "q", "type", "sort", "dir"]) set(k, get(k));
      break;
    case "plan":
      p.path = "/plan";
      for (const k of ["view", "person", "rows", "show", "from", "date", "month"]) set(k, get(k));
      if (get("work")) {
        const w = get("work");
        if (KIND[w]) set("kind", KIND[w]);
        else if (w.startsWith("g:")) set("group", w.slice(2) === "q4" ? "Q4 planning" : w.slice(2));
      }
      break;
    case "companies":
      p.path = "/companies";
      set("group", GROUPS[get("g")]);
      set("act", ACT[get("act")]);
      set("q", get("q"));
      set("sort", get("sort") === "name" ? "company" : get("sort"));
      set("dir", get("dir"));
      if (get("prio")) set("priority", get("prio").charAt(0).toUpperCase() + get("prio").slice(1));
      if (get("co")) p.company = get("co");
      break;
    case "notes":
      p.path = get("n") ? `/notes/${get("n")}` : "/notes";
      for (const k of ["lk", "q", "sort", "track"]) set(k, k === "lk" && get(k) === "-" ? "none" : get(k)); // "none" is the app's own word for not rated
      if (get("co")) p.company = get("co");
      break;
    case "past":
      p.path = "/past";
      for (const k of ["q", "sec", "sort", "view"]) set(k, get(k));
      if (q.has("nc")) p.params.set("nc", "1");
      if (get("x")) p.steps.push({ expand: get("x") });
      break;
    case "flows":
      p.path = get("f") ? `/flows/${get("f")}` : "/flows";
      if (q.has("edit")) p.params.set("edit", "1");
      break;
    case "install":
      p.path = "/";
      p.skip = "install.html is the board for the home screen and launch screen, shot by hand in 4.1";
      break;
  }
  return p;
}
