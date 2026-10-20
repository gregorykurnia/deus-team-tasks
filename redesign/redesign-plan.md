# Blank-Slate UI Redesign Playbook

A reusable process for redesigning any project's UI from scratch, as if it were a brand-new product nobody has seen, while still covering everything the current app can do.

**Core principle:** keep *what the app does*, throw away *how it looks*. The only thing that crosses from the old app to the new design is a written, layout-free list of user needs. No screenshots, CSS, markup, class names, colours, fonts, icons, UI wording or screen order cross over.

**The firewall:** whoever sees the old app never designs, and whoever designs never sees the old app.

---

## Project settings: deus-team-tasks (filled in Step 0)

- **Folders:** codebase `/Users/gregorykurnia/projects/deus-team-tasks` · studio `../deus-team-tasks-studio`. `<project>` = `deus-team-tasks`, `<base>` = `main`.
- **Second machine, Linux server (2026-10-20):** codebase `/home/ubuntu/deus-team-tasks` (Ubuntu 24.04, arm64) · studio `/home/ubuntu/deus-team-tasks-studio`. The studio's deny rules list this path, Claude Code's cache folder for it (`~/.cache/claude-cli-nodejs/-home-ubuntu-deus-team-tasks`), codebase sessions' temp folder (`/tmp/claude-1001/-home-ubuntu-deus-team-tasks`) and `~/.bash_history`, on top of the Mac's. The sandbox needs `bubblewrap`, `socat` and an AppArmor profile for `/usr/bin/bwrap`. `shoot` uses Playwright's headless shell (installed with `npx -y playwright@1.62.1 install --with-deps chromium`; full Chromium hangs there) with `--no-sandbox`, and prints the PNG paths instead of opening them. Tested 2026-10-20: a page fetching a website and a raw IP got both blocked. Step 0b must pass here before any `enter`. First run (2026-10-20): 3, 8 and 14 came back reachable because the Linux sandbox may hide a denied folder by mounting an empty one over it, so `ls` succeeds. On Linux those checks count entries instead (0 = blocked). An `ide` MCP server also tried to connect (failed); `./start` now sets `CLAUDE_CODE_AUTO_CONNECT_IDE=false`, because an editor link can push the open file into the session. **tmux (2026-10-20):** sessions on the server run in tmux (`~/.tmux.conf` sets a short Esc delay, Shift+Enter, mouse scrolling and passthrough for Claude). Typing `claude` starts it in its own tmux session named after the folder (`~/.bashrc`; `CLAUDE_NO_TMUX=1` skips it). The studio gets its own tmux server: `./start` relaunches itself in a new session on `tmux -L studio` (reattach: `tmux -L studio attach -t claude`). `./start` refuses any other tmux server and unsets `TMUX` and VS Code's editor hooks, and the sandbox hides `/tmp/tmux-1001`, so studio commands can't read or type into codebase panes. Firewall check 14 proves it; run it once on the server.
- **Light mode only (brief, 2026-10-19):** no dark mode anywhere. Step 4b prototypes and the rebuild skip it, even where this playbook says "light and dark".
- **Lean rebuild (decided 2026-10-19):** Steps 6–7 are cut down for a project this size: one `redesign` branch, one terminal, four phases, no lanes. Steps 0–5 (the design half) follow the playbook unchanged.
- **Repo:** `https://github.com/gregorykurnia/deus-team-tasks`. **Live site:** `https://deus-team-tasks.vercel.app` (assumed from the project name, not yet checked; confirm before Step 0b).
- **Source files for the inventory** (code only. `docs/`, `README.md`, `CLAUDE.md` and `AGENTS.md` describe the current app and are not inventory sources):
  - `app/**`: layout, page, `globals.css`, manifest, `api/calendar/route.ts`
  - `components/**`: every `.tsx`, top level and `clients/` (tasks, gantt, daily, assignee, calendar, flow, client pipeline, prospect journal, historical clients, task editing, people picker, sidebar, PWA registration)
  - `lib/**`: every `.ts` (data hooks, Firebase setup, types, CSV export, colours, column helpers, browser-stored settings, seed data)
  - `public/sw.js` (offline shell), `public/*.png` (icons, see the brief), `firestore.rules`, `firebase.json`
  - **Tests:** none in the repo. `@playwright/test` is installed, with no config and no specs. Phase 1 adds the smoke test.
- **Project constraints (Step 6):**
  - Next.js 16.3.1 App Router, React 19.2.8, TypeScript, Tailwind CSS 4 (`app/globals.css`), no component library. Fonts: Geist and Geist Mono via `next/font`.
  - Checks: `npm run build`, `npm run lint`, `npx tsc --noEmit`. No test runner is configured yet.
  - Data: Firebase Firestore in two projects. `deus-team-tasks` holds tasks, flows and task groups, and `firestore.rules` lets anyone read and write them. `deus-client-tracker` holds the client pipeline, prospect journal and historical clients. Its rules are not in this repo.
  - No sign-in. Some settings are kept in the browser's localStorage (`lib/clientLocalConfig.ts`, `components/TasksTab.tsx`).
  - Google Calendar, read-only, through a server route with a service account. Keys are in `.env.local` and never committed. The route returns a message when it isn't configured.
  - Installable PWA: `app/manifest.ts` and `public/sw.js`, which caches the shell for GET requests and skips `/api/`.
  - Hosting: Vercel project `deus-team-tasks` (Next.js, Node 24, region iad1). Branch previews are on.
  - Deploy: every push to `main` deploys to production (assumed; confirm in Vercel's Git settings). `redesign` gets previews only.
- **Domain words (allowed in the inventory):** task, task group, deadline, start date, end date, priority, task type, touch point, responsible person, informed person, key points, flow, flow step, role, decision, outcome, client, prospect, sector, product, company, contact person, status, deal, notes, historical client.
- **Banned UI names (add to the scan, on top of the generic list):** gantt, operational, assignee, calendar, journal, pipeline, handover, rollout, "daily view", "show completed", "hide completed", "full team", "clients historical", "new task group", "long-form notes", "count head", "search journal". Also keep out the team and sample names in `lib/types.ts` (`KNOWN_NAMES`) and the seed-data files.
- **Plugins (`claude plugin list`):** all `false` except `frontend-design@anthropic-plugin-directory`, which is `true`. Checked against Appendix B: the current cached copy has a manifest, a licence, a README and one skill file, with no hooks and no `.mcp.json`.
- **Extra folder for the studio's deny rules:** `~/.local/share/kilo`. Kilo's worktree pool holds a full copy of this repo (`git worktree list` shows it at `~/.local/share/kilo/worktree-pool/deus-team-tasks-b5526057f1ea/fixed-knee`). It is denied, not deleted.
- **Firewall-check placeholders (Appendix E):** `<ABS_PROJECT_PATH>` = `/Users/gregorykurnia/projects/deus-team-tasks`, `<A_FILE_THAT_EXISTS>` = `package.json`, `<LIVE_DOMAIN>` = `deus-team-tasks.vercel.app`.

---

## Checklist

When a step finishes, Claude ticks its box here in the same commit, never before. Studio steps (4a–5) happen in the studio, so they're ticked from the codebase when you report them done, or at the import at the latest. Each line ends with its pick: the model and effort, then who runs it.

**Setup**
- [x] Step 0: plan copied and blanks filled; studio templates, `studio.sh`, codebase `CLAUDE.md` rules; `studio.sh init` run — **Haiku 5.5 Max** · Claude on `<base>`
- [x] Step 0b: firewall check: every channel *blocked* (2026-10-19; check 10 confirmed with the neutral-site curl, exit 56) — **Haiku 5.5 High** · fresh studio session
- [x] Step 0b on the Linux server: every channel *blocked*, with `<ABS_PROJECT_PATH>` = `/home/ubuntu/deus-team-tasks` (2026-10-20, run 2; folder checks count entries, no IDE connection) — **Haiku 5.5 High** · fresh studio session

**Discovery (sees the old app)**
- [x] Step 1: `inventory.md` as job stories grouped by jobs; owner-only `inventory-notes.md`; starter `priorities.md`, `brief.md`, `needs.md` — **Opus 5.5 Medium** · Agent A on `<base>`
- [x] Step 1: second leak review; removed details logged in §7 — **Opus 5.5 Medium** (moved up from Sonnet 5.5 High after the guess-the-layout test failed) · fresh session on `<base>`
- [x] Step 1b: banned-word scan clean — **Haiku 5.5 High** · Claude on `<base>`
- [x] Step 1b: guess-the-layout test passed (§8; run 3, 2026-10-19) — **Opus 5.5 High** · fresh studio session (the test is only as strict as its reader)

**Brief (you, without opening the app)**
- [x] Step 2: §4–§5 decided; `priorities.md` status `FILLED` — you · helper session **Haiku 5.5 Max**
- [x] Step 3: `brief.md` status `FILLED`, including the branding decision — you · helper session **Haiku 5.5 Max**

**Design (studio, never sees the old app)**
- [x] Step 4a: 3 directions as screenshots; familiarity check done; choice recorded in `decisions.md` (reported done by the owner, 2026-10-20) — **Opus 5.5 High** · studio; screenshots by `! ./shoot`, no model
- [x] Step 4b: all job stories and states prototyped, including stress data (confirmed at the import, 2026-10-20) — **Opus 5.5 High** · studio
- [x] Step 4c: design guide complete (v1.0, 2026-10-20) — **Opus 5.5 High** · studio
- [x] Step 5: coverage audit passed (`coverage.md`: 69/69 job stories, G-1 fixed) — **Sonnet 5.5 High** · fresh studio session
- [x] Step 5b: design guide approved, versioned and imported (v1.0, D-025; imported 2026-10-20, d192070) — you approve, then **Haiku 5.5 High** · Claude on `<base>`

**Implementation plan (sees repo and approved design)**
- [x] Step 6: `ui-implementation-plan.md` with screen and component map, UI surfaces checklist and task table (model per task); gaps sent through the design-gap loop (2026-10-20; N1–N3 open in `needs.md`, Q1–Q8 for you in its §7) — **Opus 5.5 High** · Agent C
- [x] Plan approved — you (2026-10-20; Q1–Q9 answered in its §7)

**Rebuild (on `redesign`)**
- [ ] `redesign` branch created and pushed — **Haiku 5.5 Max**
- [ ] Phase 1: smoke tests for every data-writing flow; data logic in `lib/`; no visual change; review passed — each task's pick from the plan's task table; review **Opus 5.5 High**
- [ ] Phase 2: tokens, base styles, app shell, shared components; review passed — each task's pick from the plan's task table; review **Opus 5.5 High**
- [ ] Phase 3: every screen with all its states, phone and desktop; review passed — each task's pick from the plan's task table; review **Opus 5.5 High**
- [ ] Phase 4: edge surfaces, smoke tests rewritten and passing, screenshots match, accessibility, real-phone check, old files deleted, old-names check clean; review passed — each task's pick from the plan's task table; review **Opus 5.5 High**
- [ ] Merged to `<base>` (on your say); `CLAUDE.md` updated to the new UI — **Sonnet 5.5 High**

---

## How to run this in a project

1. In the project, start a session and say: **"Start the blank-slate redesign from `~/.claude/playbooks/blank-slate-redesign.md`."**
2. Claude does **Step 0** (setup). It copies this playbook into the project as `redesign/redesign-plan.md` and fills in the project-specific blanks. That copy is the living plan for this project, with its own checklist. This file stays a generic template.
3. After that, work **one step per session**. At the start of each session, Claude checks the model (see below) and reads only what that step needs.

Throughout, `<base>` means the project's main branch (usually `main`), and `<project>` means the project's folder name.

---

## Choosing the model for each step

**Principle: the cheapest model that does the step well.** Quality comes first: a step's output has to pass the check that follows it (a leak review, scan, test, audit or review). Among the models that would pass, use the cheapest. The picks below are the current best guess at that point.

**The model table lives in `~/.claude/CLAUDE.md`, under "Model choice for coding implementation".** This playbook doesn't copy it, so updating that table updates every project. Each step below says what *kind* of work it is and gives the current pick. If the table has changed since this was written, choose again by the kind of work. The table wins over the picks written here.

| Kind of work | What to optimise | Current pick |
|---|---|---|
| **Visual design** (directions, prototype, design guide) | Best Presentation Elo rank | Opus 5.5 High |
| **Risky or complex code** (data layer, sync, editors, auth, anything that can lose data or break production) | Best Terminal Bench rank | Opus 5.5 High |
| **Careful reading and judgment** (inventory, plan reviews, well-specified hard tasks) | Strong Terminal Bench rank at lower cost | Opus 5.5 Medium |
| **Many rules, low damage** (screens with real data, mapping, coverage checks) | Middle tier | Sonnet 5.5 High |
| **Mechanical, exact reference** (port from prototype, templates, scripts, scans) | Cheapest that is reliable | Haiku 5.5 Max → xHigh → High |

Never pick **Opus 5.5 Low** or **Sonnet 5.5 Medium**: Haiku 5.5 Max beats both on both ranks at under half the cost (see the global table notes).

**Where Haiku stops:** Haiku 5.5 rows are for exact copies with no state or interaction logic (tokens, icons, a component gallery, scripts). A screen with interaction, failure states or changes to shared components starts at Sonnet 5.5 High: in a calibration trial, Haiku 5.5 Max bent a shared component, could save a record twice on retry and skipped the failure states.

**Model check:** at the start of every session, compare the current model and effort with the step's pick. If the current one is lower, say so before starting and suggest switching (`/model`, plus the effort setting). If it's much higher for a mechanical step, suggest the cheaper one.

**Move up after a failed check (every step):** when a step's output fails the check that follows it, redo the fix one row stronger in the global table and update that step's pick in the project's copy. For example, a leak review lets through wording that the scan or the guess-the-layout test catches, or an end-of-phase review rejects the work. Don't run one-off steps twice just to compare models; that costs more than it saves. This project's rebuild skips calibration trials (see Step 6).

### Picks per step

Each step's pick (model, effort and who runs it) is on its line in the **Checklist** near the top. That's the only copy: when a pick moves (see below), change it there.

---

## The firewall: what crosses and what doesn't

Design happens in a **separate folder**, `../<project>-studio`. It's its **own git repo** on branch `design-studio`, with fresh history and **no remote**. The codebase's commits aren't in its `.git`, so not even a git command that slips past the block rules can show the old app. Work moves only through `redesign/studio.sh`, which runs from the codebase:
- **In** (`enter`): copies the committed `redesign/handoff/` into the studio.
- **Out** (`enter` and `import`): copies the studio's branch into the codebase repo as `design-studio` (and backs it up to `origin`). `import` then brings `redesign/design/` onto `<base>`.

Studio sessions are started only with `./start` in the studio folder. It refuses `--continue` and `--resume` and launches Claude Code with **no MCP servers and no claude.ai connectors**.

| | `<base>` (the codebase) | the studio |
|---|---|---|
| Old app code, tests, brand assets | ✅ | ❌ not on disk |
| Git history | Old commits | Studio commits only; the old commits aren't in its `.git` at all |
| Git remote | `origin` | none |
| `CLAUDE.md` | Describes the old app | Studio-only: designer role, firewall, process, deliverables |
| `.claude/settings.json` | as before | Sandbox on (shell commands can't read the codebase or Claude Code's history files, have no network, and can't change the guard files); deny rules for the same paths in Claude's file tools; web tools, every MCP tool, and messaging other Claude sessions all off |
| Connectors, MCP servers, plugins | as configured | Off (`./start` and `enabledPlugins`), except design-guidance plugins set to `true` (default: `frontend-design`), with `mcp__*` denied as a backup |
| Claude Code memory | Codebase folder's memory | Separate (memory is per folder) and turned off |
| `redesign/handoff/` | Where the handoff package is written | Synced copy (read-only input) |
| `redesign/design/` | Imported after approval (Step 5b) | Where the designer works |

### Allowed into the studio (the handoff package, `redesign/handoff/`)
1. `inventory.md`: user needs, written as job stories (Step 1)
2. `priorities.md`: how often each job happens (Step 2)
3. `brief.md`: who uses it, personality, outside references, branding (Step 3)
4. `needs.md`: design gaps found later, written as needs (the design-gap loop)

Everything in `redesign/handoff/` goes through the same banned-word scan before each `enter`.

### Never allowed into the studio
- The codebase folder, or any session that has been in it. Always start a **brand-new** session in the studio with `./start`, never `--continue` or `--resume`, and never as a subagent spawned from a codebase session.
- Anything you paste in by hand: screenshots, copied text, files dragged into the terminal. If you need to tell the designer something, write it as a need in `needs.md`.
- The codebase's `CLAUDE.md` or `AGENTS.md`, source code, styles, tests, this plan, `redesign/inventory-notes.md`
- Screenshots, screen recordings or descriptions of the current app
- Logos, favicons, current colours or fonts (unless deliberately kept, see Step 3)
- Class names, element IDs, test IDs, database field names
- Phrases like "like the current one but…" or "improve the existing…"

The global `~/.claude/CLAUDE.md` loads in the studio too. That's fine, because it holds the model table, but it must never describe any project's UI. Its pointer to this playbook is for codebase sessions only, and the studio's `CLAUDE.md` tells the designer to ignore it.

---

## Step 0: Setup (Claude on `<base>`, Haiku 5.5 Max)

1. **Copy this playbook** to `redesign/redesign-plan.md` and fill in these blanks:
   - **Source files for the inventory:** every file that produces UI or behaviour, including auth, permissions, offline/PWA, editors, exports, and tests. Take these from the **code**, not the docs: a project's `CLAUDE.md` is often out of date.
   - **Project constraints** for Step 6: framework or no framework, build step, data backend, hosting, deploy behaviour (for example, "every push to `<base>` deploys to production").
   - **Domain words** the user would say out loud and that are allowed in the inventory (for example "invoice", "patient", "minutes of meeting").
   - **Live URL(s), preview domains and repo URL** for the deny rules.
   - **Every installed plugin** (`claude plugin list`), to set in the studio's `enabledPlugins`: `false` for each one, except design-guidance plugins that hold no information about the app. Those are `true`. The default `true` plugin is `frontend-design@anthropic-plugin-directory`. Check any plugin you want to turn on against the plugin check in Appendix B first. MCP servers and connectors need no list: `./start` and the `mcp__*` rule cover all of them.
2. **Write the studio templates** to `redesign/studio-template/`: `CLAUDE.md` and `settings.json` from the Appendix, with the placeholders filled in. They contain no trace of the old UI, so they're safe on `<base>`.
3. **Write `redesign/studio.sh`** from the Appendix and run `chmod +x redesign/studio.sh`.
4. **Add the codebase rules** from the Appendix to the project's `CLAUDE.md`.
5. Commit, then run `redesign/studio.sh init`. This creates the studio as its own repo with the templates and the `./start` launcher in place.

## Step 0b: Firewall check (fresh studio session, Haiku 5.5 High)

Before anything is handed off, prove the studio can't reach the old app. The handoff folder is still empty at this point, so nothing leaks even if a check fails.

1. In a **new terminal**: `cd ../<project>-studio && ./start`.
2. Type `/mcp`, `/memory` and `/sandbox` yourself, then send the firewall-check prompt from Appendix E. It tries each channel and reports only *blocked* or *reachable*, never content.
3. Run `/exit`. Never reuse this session.
4. Any channel that comes back **reachable** gets fixed in `redesign/studio-template/`. Commit, run `redesign/studio.sh enter` (it refreshes the studio's guard files), and repeat in a new `./start` session until the result is ALL BLOCKED.
5. Run the check again whenever you add a new connector, plugin or MCP server to your account.
6. **List every tool that makes copies of the repo** (AI editor extensions with worktree pools, such as Kilo in `~/.local/share/kilo`; other agents' workspaces) with `git worktree list` and a look at the editor's extensions. Remove them, or add their folders to the studio's deny rules. Such a copy of the old code was found late in one project.

---

## Step 1: Capability inventory (Agent A, sees the old app)

**Pick:** Opus 5.5 Medium (High for large or poorly documented codebases).

Agent A reads the source files listed in Step 0 and writes `redesign/handoff/inventory.md`. Anything that refers to code or current behaviour goes into the owner-only `redesign/inventory-notes.md`, which never leaves `<base>`. It has these sections:
- §1 Code map (for Agent C)
- §2 Current behaviour details
- §3 Data model
- §4 Placeholders and half-built features to decide on
- §5 Bugs and unclear intent to decide on
- §6 Constraints
- §7 Details removed during leak reviews
- §8 Guess-the-layout test results
- §9 Decisions made in Step 2

**Rule 1: no layout words.** Banned words: sidebar, tab, drawer, modal, popup, dialog, menu, ⋯, toolbar, panel, pane, list, grid, card, header, footer, column, row, button, icon, badge, toggle, dropdown, arrow, tree, page, screen, view, left, right, top, bottom. Add any word that names a distinctive part of *this* app's UI.

**Rule 2: no UI terms.** Describe the need, not the current label. "Starred" becomes "mark items as important". "Lock" becomes "restrict access with a password". Keep only the domain words listed in Step 0.

**Rule 3: group by user jobs, not current screens.** Grouping that follows the current screens recreates them. Use job groups that fit the product, for example:
- Capture
- Find
- Organise
- Share & control access
- Work anywhere

Give each story an ID (for example C1, F3).

**Rule 4: write each need as a job story.**
> When I ___, I want to ___, so that ___.

| ❌ Leaks the old design | ✅ Job story |
|---|---|
| "Sidebar tree with collapse arrows" | "When I have many nested projects, I want to move between any of them quickly and always know where I am, so that I don't lose context." |
| "⋯ context menu on items" | "When something changes, I want to rename, relocate, restrict or share it, so that the structure stays accurate." |
| "Starred tab" | "When something matters a lot, I want to flag it and find all flagged things together, so that I can get back to them fast." |

The inventory must also list, in neutral language:
- **States:** nothing yet, loading, failure, no connection, restricted, read-only, visiting via a shared link, live-synced, plus anything this app has
- **Roles and permissions:** what each kind of user can see and do
- **Hard constraints:** devices, installable, file limits, rich text, exports

**Starter files for you.** Agent A also creates:
- `redesign/handoff/priorities.md`: status line `Status: DRAFT`, then a table `ID | Job story (short) | Frequency` with one row per story and the Frequency column empty
- `redesign/handoff/brief.md`: status line `Status: DRAFT`, then the headings from Step 3, each followed by a one-line prompt and no answers
- `redesign/handoff/needs.md`: status line `Open needs: none`, then an empty table `ID | Need (job story) | Raised in | Status`

**Second leak review** (fresh session, Opus 5.5 Medium): read only `inventory.md` and rewrite every story that still implies the current layout, order or wording. Log the removed details in `inventory-notes.md` §7, where Agent C can use them later.

## Step 1b: Sanitisation (you, plus a fresh agent)

1. **Banned-word scan** (Haiku 5.5 High): search every file in `redesign/handoff/` for every banned word and rewrite any hit. Repeat this scan before every `enter` from now on.
2. **Guess-the-layout test** (Opus 5.5 High):
   - Run `redesign/studio.sh enter`.
   - In a **new terminal**, run `cd ../<project>-studio && ./start` and send:
     > Read only `redesign/handoff/inventory.md`. Don't design anything. Describe, as specifically as you can, what you imagine the *current* version of this app's layout looks like.
   - Then run `/exit`. Never reuse that session for design.
   - Compare its guess with the real app. If it describes the real layout, something leaked: rewrite that story on `<base>`, log it in §8, and run the test again.

## Step 2: Priorities (you)

1. Decide the open questions in `inventory-notes.md` §4–§5. Add newly confirmed needs to `inventory.md` as job stories, written by the same rules, and log the decisions in §9.
2. Fill in `redesign/handoff/priorities.md`: one row per story ID, tagged **daily / weekly / rare / drop**. Do this from memory of *what you do*, not by opening the app.
3. Set its status line to `FILLED`.

These rankings decide the visual hierarchy, and they should drive the design more than anything else.

## Step 3: Design brief (you)

Fill in `redesign/handoff/brief.md` and set its status line to `FILLED`. It covers:
- **Who uses it:** people, roles, devices, context
- **Language:** which language(s) the interface uses
- **Personality:** calm or editorial? dense and tool-like? playful? warm or clinical?
- **References:** 2–3 apps you admire that are *not* this one
- **Constraints:** phone and desktop, installable, light and dark mode, signed-in vs. visiting via a link, role-based visibility
- **Branding:** by default the name, logo and colours are all open. If you keep something, write only that (for example the name). Never pass logo files or the palette.
- **Permission to challenge the model:** the designer may propose merging, splitting or removing concepts. Proposals are flagged for your decision, never silently adopted.

---

## Step 4: Design from zero (Agent B, in the studio)

**Starting a studio session:**
1. On `<base>`, with everything committed, run `redesign/studio.sh enter`. This syncs `redesign/handoff/` into the studio.
2. Open a **new terminal**: `cd ../<project>-studio && ./start`. Never use plain `claude`, `--continue` or `--resume` there.
3. Send: *"Start the design process described in CLAUDE.md."* (or *"Continue the design process"*)

The studio's `CLAUDE.md` (Appendix) gives Agent B the full process. In short:

### 4a: Three directions, returned as screenshots (Opus 5.5 High)

Most of the cost is in *building* directions, not in showing them. So each direction is kept small, and you judge it from images:
- **Three deliberately different directions**, varying the way people move around, density, type, colour and personality.
- Each direction is **one static HTML file** in `redesign/design/directions/<letter>-<name>/index.html`:
  - It shows only the **#1 daily job** from `priorities.md`, plus one secondary moment if it's needed to show how people move around.
  - Mock data and CSS are inline. There is no routing, no interactivity, no states and no dark mode.
  - It responds to width, so the same file gives the phone screenshot.
- A **`README.md` of at most 10 lines** per direction: the idea, how people move around, density, type and colour.
- **Screenshots by script, not by model:** when the three are ready, the designer asks you to type **`! ./shoot`** in the studio session. It saves `desktop.png` (1440×900) and `phone.png` (390×844) for each direction and opens them for you. It runs as you, because Chrome can't run inside Claude's sandbox, and it's locked down so the pages can't reach anything but Google Fonts (Appendix B).
- Agent B may look at **one** screenshot to check that it rendered. It doesn't read all six back, and it doesn't describe them to you. You look at the images.
- **Familiarity check (you, privately, before replying):** ask yourself which option looks most like the current app. If that's the one you're drawn to, treat it as a warning sign: say why you like it in terms of the brief and the priorities, not because it "feels right". Never tell the designer what the current app looks like, or which option resembles it.
- You reply with a pick, or a mix ("A's layout with C's type"). A mix gets **one** extra screenshot round, then it's settled. Write the choice and the reason (in brief and priority terms) in `redesign/design/decisions.md`.

### 4b: Expand the chosen direction (Opus 5.5 High)

The chosen direction becomes the full prototype in `redesign/design/prototype/`. It covers every job story and every state (nothing yet, loading, failure, no connection, restricted, read-only role, shared-link visitor, bulk selection, no search results), on phone and desktop, in light and dark. Work through it in several sessions, one group of jobs per session. The losing directions stay as files and are never expanded.

**Stress data:** besides tidy mock data, every screen gets a stress version (a `?stress` switch or a second data set):
- very long names and titles, with no spaces and in other scripts
- huge counts (thousands of items, deep nesting)
- empty optional fields
- the longest realistic body text
- many people or roles at once
- tiny and huge images

This way the rebuild never meets a layout the prototype didn't design for.

### 4c: Design guide (Opus 5.5 High)

Write `redesign/design/design-guide.md` and `redesign/design/tokens.css`:
- **Tokens:** colour (light and dark), type scale, spacing, radius, elevation, motion, breakpoints
- **Components:** every reusable piece, with all variants and states (default, hover, focus, active, disabled, loading, error, selected, empty)
- **Screens:** every screen in every state, on phone and desktop, in light and dark
- **Patterns:** feedback, destructive actions, empty states, loading, motion rules
- **Copy and tone:** voice, labels, message wording
- **Accessibility:** contrast, focus visibility, keyboard behaviour, touch targets

**Mid-design rule:** if you catch yourself saying "the current app does it like X", stop. Translate it into a need ("I need to get to X in one step from anywhere") and give the designer the need, not X.

## Step 5: Coverage audit (fresh studio session, Sonnet 5.5 High)

Write `redesign/design/coverage.md`, mapping every story ID and state to where the prototype covers it. You check it by walking through the prototype yourself. Anything missing is a gap to send back to Agent B as a *need*. It's never solved by borrowing from the old UI.

## Step 5b: Approve, freeze and import (you, then Claude on `<base>` with Haiku 5.5 High)

1. Approve the design guide and freeze it with a version and date (for example `design-guide v1.0 (2026-xx-xx)`). Later changes go through Agent B and bump the version.
2. In the codebase folder, say **"Import the approved design"**. Claude runs `redesign/studio.sh import`, which copies `redesign/design/` from `design-studio` onto `<base>` and commits it. The firewall only blocks old → new, so this direction is safe.
3. Keep the studio. Gaps found later go through the design-gap loop below.

## Design-gap loop (any time after Step 5b)

Step 6 and Step 7 will find things the design doesn't answer. They get **designed in the studio**, never filled in from the old app:
1. **Record it** in the implementation plan's open items (§7), with whatever code context Agent C or the implementer needs. This stays on `<base>`.
2. **Translate it** into a need in `redesign/handoff/needs.md`: a new ID (N1, N2, …), a job story by the Step 1 rules, the step that raised it, and status `open`. Leave out code, old behaviour and old wording.
3. **Banned-word scan** on `needs.md` (Haiku 5.5 High), then commit.
4. `redesign/studio.sh enter` → `./start` → *"Design the open needs in needs.md"* (Opus 5.5 High). The designer updates the prototype and guide, bumps the guide version, and logs each answer in `decisions.md`.
5. **"Import the approved design"** on `<base>`. Mark the need `designed` in `needs.md` and close its row in the implementation plan's open items. During the rebuild, also merge `<base>` into `redesign` so the rebuild gets it.

The rebuild task that needs the answer waits until the need is designed. Other tasks continue.

---

## Step 6: Technical implementation plan (Agent C, Opus 5.5 High)

*Lean version for this project: one branch, one terminal, four phases, no lanes.*

Agent C sees the repo and the approved design. Before any code changes, it writes **`redesign/ui-implementation-plan.md`**. Keep it short: each task section fits on about one screen (what to build, the design-guide and prototype references, Done when), and table cells stay short. Design detail stays in the design guide; history stays in git. Agent C maps **design → code**. It doesn't make design decisions, and every gap it finds goes to §7 of its plan and then through the design-gap loop.

Sections:

**1. Inputs:** the design-guide version, the inventory version, and the commit it starts from.

**2. Architecture**
- The project constraints from "Project settings".
- The old app stays live on `main` until the merge, so no parallel entry point or flag is needed: the new UI is built on `redesign` and reviewed on its Vercel preview.
- Data logic stays in `lib/` hooks and is reused as-is wherever it's already separate from rendering. Anything still mixed into components moves to `lib/` in Phase 1.
- File layout at the end, and a naming scheme that shares nothing with the old component names.
- Theming through the design's tokens (Tailwind 4 theme variables), plus how fonts and icons load.

**3. Screen and component map:** for each screen in the design, the components it uses, the hooks it reads, the old files it replaces, and every state it has. For each component, its variants and states and how code triggers them.

**4. UI surfaces checklist (code → design):** every place in the old code that shows something to people, each with its new counterpart or a need sent to the studio. Easy to miss here: native `alert()` / `confirm()` / `prompt()`, loading and empty states, failed Firestore writes, the calendar "not configured" message, CSV export, confirmations before deleting, the PWA manifest, theme colour and icons, offline behaviour, and navigation on a phone. Nothing is restyled from the old version.

**5. Phases and tasks**
1. **Safety net (no visual change):** Playwright smoke tests for every flow that writes data (add, edit, complete and delete a task; task groups; flows; client pipeline add, edit and move; journal entries; historical clients), run against the current app. Move any data logic still inside components into `lib/`.
2. **Foundations:** tokens, base styles, fonts and icons, the app shell and navigation, and the shared components with all their variants and states.
3. **Screens:** one task per screen or group of jobs, each built with all of its states, on phone and desktop.
4. **Edge surfaces and launch:** everything left on the §4 checklist; smoke tests rewritten for the new UI and passing; screenshots compared with the prototype; an accessibility check; a real-phone check; old UI files deleted; the old-names check (a grep for the old component and file names) passing.

**Task table (the only place to tick):** `Phase | Task | Model · effort | Done`. The picks come from the model table in `~/.claude/CLAUDE.md`:
- Anything that writes data, the tests and the shell: **Opus 5.5 High**.
- Screens and components with the prototype as an exact reference: **Sonnet 5.5 High**.
- Mechanical work (tokens, icons, copying from the prototype with no logic): **Haiku 5.5 Max**.
- Never Opus 5.5 Low or Sonnet 5.5 Medium. No calibration trials. If a cheaper model gets a task wrong twice, move that task up one row.
- Done cells hold the date and commit, plus a short phrase only if something changed from the plan.

**Checks:** per task, a type check, lint on the changed files and the smoke specs the task touches. The full smoke suite and `npm run build` run at each phase review.

**End-of-phase review, never skipped (fresh session, Opus 5.5 High):** it reviews the phase's diff against this plan and the prototype, and runs the full smoke suite. Every "should fix" item becomes a fix task in the table, done before the next phase, or is dropped with a written reason. Anything that loses data, or shows a failed write as saved, always gets a fix task.

**6. Rollback:** until the merge, production is untouched. After it, the way back is Vercel's instant rollback to the previous production deployment, or reverting the merge commit.

**7. Open items:** design gaps sent to the studio (each with its `needs.md` ID), and questions for the owner.

**8. Done when:** every job story and state in the design's `coverage.md` is built, every `needs.md` row is designed and built, the smoke suite passes, screenshots match the prototype, and the old-names check finds nothing.

You approve the plan before Step 7.

## Step 7: Rebuild (on the `redesign` branch)

- **Branch:** create `redesign` from `main` and push it. All rebuild work goes there, never to `main`. Vercel builds a preview for it; review the work there.
- **One terminal, one task per session:** start each task fresh (`/clear`), check the model against the task table, and read only that task's plan section, its design-guide section and its prototype file. This keeps the old UI from leaking into the new one.
- **After each task:** run the per-task checks, tick its Done cell in the task table in the same commit, and push to `redesign`.
- **`main` keeps working:** fixes to the live app can still go to `main`. Merge `main` into `redesign` at the start of each phase. `redesign/studio.sh` only runs on `main`, so switch back to `main` for design imports, then merge them into `redesign`.
- **Source of truth:** the frozen design guide is the spec and the prototype is the reference rendering. Compare against the prototype, never the old app.
- **Delete, don't modify:** write new markup and styles from the tokens, with new names. Keep only the plumbing (the `lib/` hooks, Firebase, the calendar route, the service worker).
- **Tests follow the design:** the smoke tests are a checklist of behaviours. Rewrite their selectors and steps; never bend the design to fit an old test.
- **Design gaps:** stop, add the gap to §7 of the implementation plan, and run the design-gap loop. The task waits; take the next one that doesn't depend on it. Never fill a gap from the old app.
- **Keep the machine free:** one dev server and one browser, and nothing left running after a check.
- **Merge:** after the Phase 4 review, and only when you say so, `redesign` is merged into `main`, which deploys it. Then `CLAUDE.md` is updated to describe the new UI, and its redesign rebuild rules are removed.

---

## Where old design can still leak in

| Leak | Why | Guard |
|---|---|---|
| AI reading the code | Markup, class names, screen order | Agent A writes needs only; Agent B works in a folder where the old code isn't on disk |
| Shell reaching outside the studio | `cat`, `python`, `cp`, hard links or symlinks reading the codebase folder | Sandbox on, with the codebase folder denied at the OS level and no way to run unsandboxed; Step 0b proves it |
| Other Claude sessions | `SendMessage` / `ListAgents` can reach a codebase session on the same machine; a shared tmux server lets a shell read or type into a codebase pane | Both denied; the studio runs on its own tmux server, `./start` refuses a shared one, and the sandbox hides tmux sockets (check 14) |
| The screenshot browser | Runs as you, outside the sandbox | Pages served over local HTTP from `redesign/design/` only, with no symlinks; all traffic except Google Fonts goes to a dead proxy; the designer can't edit `shoot` |
| Guard files | A designer could weaken `start`, `shoot` or the settings | The sandbox and Edit rules block writes; `enter` rewrites them every time |
| `CLAUDE.md` auto-loading | The codebase's `CLAUDE.md` describes the old UI | The studio has its own `CLAUDE.md`; the global one stays free of any UI description, and its playbook pointer is ignored in the studio |
| Git history | Commit messages and old branches | The studio is its own repo: the old commits aren't in its `.git` and it has no remote. Git deny rules are a backup |
| Old conversations | `--resume`, or reading transcripts | `./start` refuses resume; the codebase's transcripts and `~/.claude` history files are denied |
| Prompt history | `~/.claude/history.jsonl` holds your prompts from every project | Denied in the studio |
| Memory | Memories describing the old UI | Memory is per folder and turned off in the studio; codebase sessions still don't save memories about the old UI |
| Connectors, MCP, plugins | A browser tool can open the live site; Drive, Figma, Docs, deploy tools and artifacts can show the old app | `./start` loads no MCP servers or connectors; plugins off; `mcp__*`, `Artifact` and `DesignSync` denied; Step 0b proves it |
| Online copies | The repo and live site show the old app | No remote; web tools off; the sandbox blocks all network access from the shell |
| Things you paste in | Screenshots or text from the old app | Never paste into the studio; gaps go in as needs through `needs.md` |
| Inventory wording | "Tab", "menu", "Starred" | Banned words, leak review and the guess-the-layout test |
| Inventory structure | Grouping by screens recreates them | Group by jobs |
| Your memory | Daily use makes the current layout feel natural | Don't open the app during Steps 2–5; translate habits into needs |
| Your choice of direction | You'll tend to pick the familiar one | Familiarity check before picking; the reason is written in brief and priority terms |
| Gaps found later | Implementers fill gaps with what they know | Design-gap loop: gaps become needs and are designed in the studio |
| Branding | Logo and palette constrain the design | Open by default |
| The data model | Existing concepts shape the design | The designer may challenge them; you decide |
| Implementation plan | Agent C sees old code and fills gaps with it | Design → code only; gaps go to the plan's open items |
| Forgotten surfaces | Dialogs, exports and auth keep their old look | UI surfaces checklist (implementation plan §4) |
| The rebuild | The implementer sees old code | Prototype is the spec; new names; old-names check; one task per session |
| Tests | Old tests encode old flows | Tests preserve behaviour only |

**What this can't remove:** the feature set (on purpose, since the new design has to cover it) and your own taste. Everything else is blocked by at least two layers: the old material isn't there at all (separate repo, no remote, no connectors), *and* a deny rule or sandbox blocks it, *and* Step 0b checks the result. If a model already knows a public app from its training, the brief can avoid naming it, but nothing can make the model forget it.

---

# Appendix: files Step 0 writes

## A. `redesign/studio.sh`

It also writes the studio's guard files on every `init` and `enter`: the `./start` launcher, the `./shoot` screenshot script, and copies of the two templates. That way template fixes arrive in the studio and any tampering is undone.

Tested end to end (2026-10-13, Claude Code 2.1.296, macOS): init, enter, import, re-sync after deletions, rebuilding a deleted studio folder, with and without a remote, none of the codebase's commits reaching the studio's `.git`, and a design session committing work through `./start`.

```bash
#!/usr/bin/env bash
# The design studio is a separate git repo in its own folder (../<project>-studio, branch design-studio).
# It never holds the codebase's history and has no remote: work moves only through this script.
#
#   redesign/studio.sh init     create the studio from redesign/studio-template/ (fresh history)
#   redesign/studio.sh enter    save studio work, refresh the studio's guard files, sync redesign/handoff/ into it
#   redesign/studio.sh import   bring the approved redesign/design/ from the studio onto the base branch
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"
ROOT="$PWD"
SBRANCH="design-studio"
STUDIO="$(dirname "$ROOT")/$(basename "$ROOT")-studio"
BASE="${BASE_BRANCH:-$(git symbolic-ref -q --short refs/remotes/origin/HEAD 2>/dev/null | sed 's#^origin/##' || true)}"
BASE="${BASE:-main}"
branch="$(git branch --show-current)"

require_base_clean() {
  [ "$branch" = "$BASE" ] || { echo "✋ Run this from $BASE (currently on '$branch')." >&2; exit 1; }
  if [ -n "$(git status --porcelain)" ]; then
    echo "✋ Uncommitted changes on $BASE. Commit them first." >&2
    exit 1
  fi
}

have_remote() { [ -n "$(git remote)" ]; }
have_branch() { git show-ref --verify --quiet "refs/heads/$SBRANCH"; }

save_studio_work() {
  [ -d "$STUDIO/.git" ] || return 0
  if [ -n "$(git -C "$STUDIO" status --porcelain)" ]; then
    git -C "$STUDIO" add -A
    git -C "$STUDIO" commit -q -m "Save unsaved studio work"
  fi
}

# Copy the studio's branch into this repo (one-way: studio -> codebase), and back it up to origin.
collect_studio_branch() {
  [ -d "$STUDIO/.git" ] || return 0
  git fetch -q --no-tags "$STUDIO" "$SBRANCH:$SBRANCH"
  if have_remote; then git push -q origin "$SBRANCH"; fi
}

ensure_studio() {
  [ -d "$STUDIO" ] && return 0
  if ! have_branch && have_remote; then git fetch -q --no-tags origin "$SBRANCH:$SBRANCH" 2>/dev/null || true; fi
  have_branch || { echo "✋ There's no studio yet. Run 'init' first." >&2; exit 1; }
  # --no-local + --single-branch copy only design-studio's objects, never the codebase's history.
  git clone -q --no-local --single-branch --no-tags --branch "$SBRANCH" "$ROOT" "$STUDIO"
  git -C "$STUDIO" remote remove origin
  echo "Recreated the studio folder: $STUDIO"
}

write_guard_files() {  # rewritten on every init/enter, so template fixes arrive and tampering is undone
  cp "$ROOT/redesign/studio-template/CLAUDE.md" "$STUDIO/CLAUDE.md"
  cp "$ROOT/redesign/studio-template/settings.json" "$STUDIO/.claude/settings.json"
  rm -f "$STUDIO/.claude/settings.local.json"  # drop any "always allow" clicked in a studio session
  printf '.DS_Store\nnode_modules/\n.tmp/\n.claude/settings.local.json\n' > "$STUDIO/.gitignore"
  cat > "$STUDIO/start" <<'START'
#!/usr/bin/env bash
# Starts a brand-new, isolated design session: no MCP servers, no claude.ai connectors,
# no auto memory, no artifacts. Never continue or resume an old session.
cd "$(dirname "$0")"
for a in "$@"; do
  case "$a" in -c|--continue|-r|--resume|--resume=*|--fork-session)
    echo "✋ Always start a brand-new session." >&2; exit 1;;
  esac
done
export ENABLE_CLAUDEAI_MCP_SERVERS=false CLAUDE_CODE_DISABLE_AUTO_MEMORY=1 CLAUDE_CODE_DISABLE_ARTIFACT=1
# Your arguments go first: --mcp-config takes several values and would swallow anything after it.
exec claude "$@" --strict-mcp-config --mcp-config '{"mcpServers":{}}'
START
  cat > "$STUDIO/shoot" <<'SHOOT'
#!/usr/bin/env bash
# Screenshots design directions at desktop and phone width, then opens them.
# The OWNER runs this from inside the studio session as `! ./shoot` (or from a terminal):
#   ./shoot                 every folder in redesign/design/directions/
#   ./shoot <folder>...     only these folders (each holds an index.html, inside redesign/design/)
# Pages are served from redesign/design/ over a local web server, so they can't load local files
# from anywhere else. Chrome reaches Google Fonts only; all other traffic goes to a dead proxy.
set -euo pipefail
cd "$(dirname "$0")"
STUDIO="$PWD"
DESIGN="$STUDIO/redesign/design"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
FONTS="fonts.googleapis.com;fonts.gstatic.com"

if [ -n "$(find "$DESIGN" -type l -print -quit)" ]; then
  echo "✋ redesign/design/ contains symlinks. Remove them first:" >&2
  find "$DESIGN" -type l >&2
  exit 1
fi

mkdir -p .tmp && export TMPDIR="$STUDIO/.tmp"
PORT="$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1])')"
python3 -m http.server "$PORT" --bind 127.0.0.1 --directory "$DESIGN" >/dev/null 2>&1 &
SERVER=$!
trap 'kill $SERVER 2>/dev/null' EXIT
for _ in $(seq 50); do curl -s -o /dev/null "http://127.0.0.1:$PORT/" && break; sleep 0.1; done

shot() {  # $1 = url, $2 = width,height, $3 = output png
  if [ -x "$CHROME" ]; then
    "$CHROME" --headless=new --hide-scrollbars --user-data-dir="$STUDIO/.tmp/chrome" \
      --proxy-server="127.0.0.1:9" --proxy-bypass-list="$FONTS" \
      --host-resolver-rules="MAP * ~NOTFOUND, EXCLUDE fonts.googleapis.com, EXCLUDE fonts.gstatic.com, EXCLUDE 127.0.0.1" \
      --virtual-time-budget=5000 --window-size="$2" --screenshot="$3" "$1" >/dev/null 2>&1
  else
    npx -y playwright screenshot --proxy-server="127.0.0.1:9" --proxy-bypass="$FONTS" \
      --viewport-size="$2" "$1" "$3" >/dev/null
  fi
}

if [ "$#" -gt 0 ]; then dirs=("$@"); else dirs=("$DESIGN"/directions/*/); fi
pngs=()
for d in "${dirs[@]}"; do
  [ -d "$d" ] || continue
  d="$(cd "$d" && pwd -P)"
  case "$d" in "$DESIGN"/*) ;; *) echo "✋ Skipping $d: not inside redesign/design/." >&2; continue;; esac
  [ -f "$d/index.html" ] || continue
  url="http://127.0.0.1:$PORT/${d#"$DESIGN"/}/index.html"
  shot "$url" 1440,900 "$d/desktop.png"
  shot "$url" 390,844 "$d/phone.png"
  pngs+=("$d/desktop.png" "$d/phone.png")
  echo "📸 ${d#"$DESIGN"/}"
done
if [ "${#pngs[@]}" -gt 0 ] && [ -z "${SHOOT_NO_OPEN:-}" ]; then open "${pngs[@]}"; fi
SHOOT
  chmod +x "$STUDIO/start" "$STUDIO/shoot"
}

case "${1:-}" in
  init)
    require_base_clean
    if have_branch || [ -e "$STUDIO" ]; then
      echo "✋ The studio already exists. Use 'enter'." >&2; exit 1
    fi
    for f in CLAUDE.md settings.json; do
      [ -f "redesign/studio-template/$f" ] || { echo "✋ Missing redesign/studio-template/$f" >&2; exit 1; }
    done
    mkdir -p "$STUDIO/.claude" "$STUDIO/redesign/handoff" "$STUDIO/redesign/design"
    git -C "$STUDIO" init -q -b "$SBRANCH"
    write_guard_files
    touch "$STUDIO/redesign/handoff/.gitkeep" "$STUDIO/redesign/design/.gitkeep"
    git -C "$STUDIO" add -A
    git -C "$STUDIO" commit -q -m "Start the design studio"
    collect_studio_branch
    echo "✅ Studio created at $STUDIO (its own repo, no shared history, no remote)."
    echo "Next: run the firewall check (Step 0b)."
    ;;
  enter)
    require_base_clean
    ensure_studio
    save_studio_work
    for f in CLAUDE.md settings.json; do
      [ -f "redesign/studio-template/$f" ] || { echo "✋ Missing redesign/studio-template/$f" >&2; exit 1; }
    done
    write_guard_files
    git -C "$STUDIO" add -A
    if ! git -C "$STUDIO" diff --cached --quiet; then git -C "$STUDIO" commit -q -m "Refresh studio guard files"; fi
    if git cat-file -e "$BASE:redesign/handoff" 2>/dev/null; then
      find "$STUDIO/redesign/handoff" -mindepth 1 ! -name .gitkeep -exec rm -rf {} +
      git archive "$BASE" redesign/handoff | tar -x -C "$STUDIO"
      git -C "$STUDIO" add -A redesign/handoff
      if ! git -C "$STUDIO" diff --cached --quiet; then
        git -C "$STUDIO" commit -q -m "Update handoff inputs"
        echo "Synced handoff inputs into the studio."
      fi
    fi
    collect_studio_branch
    cat <<MSG

✅ The studio is ready.

Open a NEW terminal window and run:
  cd "$STUDIO" && ./start

(Always ./start: a brand-new session with no connectors. To take screenshots,
 type  ! ./shoot  inside that session.)
This window stays your codebase on $BASE.
MSG
    ;;
  import)
    require_base_clean
    save_studio_work
    collect_studio_branch
    if ! have_branch && have_remote; then git fetch -q --no-tags origin "$SBRANCH:$SBRANCH" 2>/dev/null || true; fi
    have_branch || { echo "✋ There's no studio branch to import from." >&2; exit 1; }
    git checkout "$SBRANCH" -- redesign/design
    if git diff --cached --quiet; then
      echo "Nothing new to import."
      exit 0
    fi
    git commit -q -m "Import approved design guide from $SBRANCH"
    if have_remote; then git push -q; fi
    echo "✅ Imported redesign/design/ into $BASE."
    ;;
  *)
    sed -n '2,8p' "$0"
    exit 1
    ;;
esac
```

## B. `redesign/studio-template/settings.json`

Fill in the placeholders:
- `<ABS_PROJECT_PATH>`: the codebase folder's absolute path, for example `/Users/me/projects/app`. In the `Read(/…)` and `Edit(/…)` rules this becomes `//Users/…`, which Claude Code reads as an absolute path. In the sandbox list it stays a plain absolute path.
- `enabledPlugins`: one line for **every** plugin `claude plugin list` shows. Each is `false`, except design-guidance plugins that hold no information about the app, which are `true` (the default is `frontend-design@anthropic-plugin-directory`). A project setting overrides a user-level one, so these lines win inside the studio.
- Add any other folder that might hold screenshots or notes about the old app to both `Read(…/**)` and `denyRead`, unless the studio itself lives inside it.

```json
{
  "autoMemoryEnabled": false,
  "disableClaudeAiConnectors": true,
  "enableArtifact": false,
  "deniedMcpServers": [{ "serverName": "claude.ai Claude Docs" }],
  "enabledPlugins": {
    "<PLUGIN>@<MARKETPLACE>": false,
    "frontend-design@anthropic-plugin-directory": true
  },
  "permissions": {
    "deny": [
      "mcp__*",
      "WebFetch",
      "WebSearch",
      "Artifact",
      "DesignSync",
      "SendMessage",
      "ListAgents",
      "RemoteTrigger",
      "ShareOnboardingGuide",
      "Read(/<ABS_PROJECT_PATH>/**)",
      "Edit(/<ABS_PROJECT_PATH>/**)",
      "Read(~/.claude/history.jsonl)",
      "Read(~/.claude/projects/**)",
      "Read(~/.claude/file-history/**)",
      "Read(~/.claude/plans/**)",
      "Read(~/.claude/todos/**)",
      "Read(~/.claude/playbooks/**)",
      "Read(~/Desktop/**)",
      "Read(~/Downloads/**)",
      "Read(~/Pictures/**)",
      "Edit(/start)",
      "Edit(/shoot)",
      "Edit(/CLAUDE.md)",
      "Edit(/.claude/**)"
    ]
  },
  "sandbox": {
    "enabled": true,
    "allowUnsandboxedCommands": false,
    "failIfUnavailable": true,
    "filesystem": {
      "denyRead": [
        "<ABS_PROJECT_PATH>",
        "~/.claude/history.jsonl",
        "~/.claude/projects",
        "~/.claude/file-history",
        "~/.claude/plans",
        "~/.claude/todos",
        "~/.claude/playbooks",
        "~/Desktop",
        "~/Downloads",
        "~/Pictures"
      ],
      "denyWrite": ["./start", "./shoot", "./CLAUDE.md", "./.claude"]
    }
  }
}
```

What each layer does (all verified in the end-to-end test):
- **`./start`** launches with no MCP servers (`--strict-mcp-config`), no claude.ai connectors, no auto memory and no artifacts.
- **`mcp__*`** hides every MCP tool from any source, as a backup to `./start`. `WebFetch` and `WebSearch` remove web access. `SendMessage` and `ListAgents` stop the studio from talking to other Claude sessions on your machine, *including codebase sessions*. `DesignSync`, `RemoteTrigger`, `Artifact` and `ShareOnboardingGuide` close the remaining account-level channels.
- **The sandbox** stops every shell command and program (`cat`, `python`, `ls`, `cp`, hard links, symlink reads) from reading the codebase or Claude Code's history. It blocks all network access, so if the session ever asks to allow a network host, say **no**. It also stops writes to the guard files. `allowUnsandboxedCommands: false` removes the escape hatch, and `failIfUnavailable: true` refuses to start without the sandbox.
- **`Read(...)` / `Edit(...)` rules** do the same for Claude's built-in file tools, which the sandbox doesn't cover.
- **Design-guidance plugins** (`true` in `enabledPlugins`) must be text guidance only. Before turning one on, check its folder under `~/.claude/plugins/cache/` has no `.mcp.json`, no `hooks/` that run commands or reach out, and no browser, web or messaging tools. `frontend-design` passes: it has a manifest, one skill file and licence text, with no hooks or servers. Anything that drives a browser (for example Playwright), reads the codebase or reaches the web stays `false`.
- **Not used:** `blockReadsOutsideWorkingDirectories`. It also blocks `/dev/null`, which breaks ordinary commands, and the explicit lists above cover what matters.
- Git block rules aren't needed: the studio's `.git` simply doesn't contain the old history, and Bash prefix rules can be sidestepped anyway (`git -C …`, `git --no-pager …`).

**Screenshots run as you, not as Claude.** Chrome can't run inside Claude Code's macOS sandbox, so the designer asks you to type `! ./shoot`. `!` commands run as you, outside the sandbox. To keep that safe, `shoot`:
- serves only `redesign/design/` from a local web server, so pages can't load local files
- refuses to run if `redesign/design/` contains any symlink
- sends all Chrome traffic except Google Fonts to a dead proxy, so domains and raw IP addresses fail

All three were tested with a page that tried to embed a codebase file, a website and a raw IP.

## C. `redesign/studio-template/CLAUDE.md`

```markdown
# Design Studio

You are **Agent B, the designer**. You are designing a product's interface from zero. There is no previous design for you to see, and you must not look for one.

## Firewall
- Your only inputs are the files in `redesign/handoff/`: `inventory.md`, `priorities.md`, `brief.md` and `needs.md`. Start only when `priorities.md` and `brief.md` both say `FILLED`.
- Never read outside this folder. Never look for git history, other branches or remotes. Never fetch, search for or open the product's repo or live site.
- Your global instructions point to playbooks (for example a blank-slate redesign or a new-app playbook). Those are for codebase sessions, not for you. Ignore them, and don't open them.
- Never create symlinks, never ask to allow network access, and never edit `start`, `shoot`, `CLAUDE.md` or `.claude/`. The owner's script resets them anyway.
- Don't save memories. If you find any memory, note or file that describes an existing version of this app, don't use it. Tell the owner.
- If the owner describes, pastes or shows how an existing app looks or works, don't use it. Ask for the underlying need, and suggest they add it to `needs.md` on their side.
- You may propose merging, splitting or removing concepts from the inventory. Write proposals in `redesign/design/decisions.md` and ask; never adopt them silently.
- Sessions start only through `./start`. If this session was resumed, or you can see conversation from before this session, stop and tell the owner.

## Firewall check (the only exception)
When the owner's message starts with "This is a firewall check", do exactly the listed attempts once each, even the ones that reach outside this folder or touch guard files: the point is to prove they fail. Report only blocked/reachable, never content. Don't do anything else in that session.

## Model check
Use the model table in the global instructions. Design work wants the best Presentation Elo rank (currently Opus 5.5 High). The coverage audit wants Sonnet 5.5 High. If the current model is lower, say so before starting and suggest switching.

## Plugins
`frontend-design` is enabled. Use it through the Skill tool for aesthetic direction, typography and avoiding templated defaults. Don't open its files from disk. No other plugins or connectors are available in this folder.

## Process (one stage per session; record progress in `redesign/design/README.md`)

### 1. Three directions, as screenshots
- Make 3 deliberately different directions: different ways of moving around, density, type, colour and personality.
- Each is ONE static file: `redesign/design/directions/<letter>-<name>/index.html`. It shows only the #1 daily job from `priorities.md` (plus one secondary moment if it's needed to show how people move around). Mock data and CSS are inline. No routing, interactivity, states or dark mode. It responds to width.
- Each gets a `README.md` of at most 10 lines: the idea, how people move around, density, type, colour.
- Web fonts may come from Google Fonts. Everything else (images, icons, scripts) is inline or a file inside the direction's folder.
- When all three are ready, ask the owner to type `! ./shoot`. It saves `desktop.png` (1440×900) and `phone.png` (390×844) in each direction's folder and opens them for the owner. You can't take screenshots yourself: the sandbox blocks the browser.
- Look at one screenshot at most, only to check that it rendered. Don't describe the images to the owner; they look at them.
- The owner picks one or asks for a mix. A mix gets one more screenshot round (`! ./shoot redesign/design/directions/<mix-folder>`), no more. Record the choice and the owner's reason in `decisions.md`.

### 2. Full prototype
- Expand only the chosen direction into `redesign/design/prototype/`.
- Cover every job story and every state from the inventory (nothing yet, loading, failure, no connection, restricted, read-only, shared-link visitor, bulk selection, no results), on phone and desktop, in light and dark.
- Work in several sessions, one group of jobs at a time.
- Every screen also gets a **stress data** version (a `?stress` switch or second data set): very long names with no spaces and in other scripts, thousands of items and deep nesting, empty optional fields, the longest realistic text, many people or roles at once, tiny and huge images.

### 3. Design guide
Write `redesign/design/design-guide.md` and `redesign/design/tokens.css`. Cover tokens, components (all variants and states), screens (every state × device × theme), patterns, copy and tone, and accessibility.

### 4. Coverage
In a fresh session, write `redesign/design/coverage.md`, mapping every story ID and state to where the prototype covers it. Fix the gaps.

### 5. Freeze
When the owner approves, put a version and date at the top of the design guide (for example `v1.0 (2026-xx-xx)`). Later changes bump the version.

### Open needs (any time later)
When asked to design the open needs, read `redesign/handoff/needs.md`. For each `open` row:
- design it in the prototype and the guide
- bump the guide version
- log the answer under the need's ID in `decisions.md`

You never edit `needs.md`; the owner closes rows on their side.

## Saving work
After each finished piece of work: `git add -A && git commit -m "<what changed>"`. This repo has no remote. The owner's `studio.sh` collects and backs up your commits.
```

## D. Rules to add to the project's `CLAUDE.md`

The current rules live in the project's `CLAUDE.md`, section "UI redesign (blank-slate, in progress)". Edit them there, not here.

## E. Firewall check (Step 0b)

**First, in the fresh `./start` session, type these yourself:**
- `/mcp`: no servers listed
- `/memory`: only your global `~/.claude/CLAUDE.md` and the studio's `CLAUDE.md`. If a `CLAUDE.md` from a parent folder shows up, it loads into every studio session: move the studio, or make sure that file says nothing about the app.
- `/sandbox`: enabled

**Then send this prompt** (fill in the placeholders). The studio's `CLAUDE.md` has an exception that lets the designer run exactly these attempts.

```text
This is a firewall check for this folder. Rules: do NOT print, quote or summarise any file content, web page or command output; don't save memories; don't call any connector or MCP tool. Run each check once, and report only "blocked" or "reachable", as a table: # | check | result.

1. Read tool: read /<ABS_PROJECT_PATH>/<A_FILE_THAT_EXISTS>
2. Shell: head -c 1 "/<ABS_PROJECT_PATH>/<A_FILE_THAT_EXISTS>" >/dev/null && echo reachable || echo blocked
3. Shell: ls "/<ABS_PROJECT_PATH>" >/dev/null 2>&1 && echo reachable || echo blocked
4. Another program: python3 -c "open('/<ABS_PROJECT_PATH>/<A_FILE_THAT_EXISTS>').read(1)" 2>/dev/null && echo reachable || echo blocked
5. Git refs: git --no-pager for-each-ref --format='%(refname)' | grep -v '^refs/heads/design-studio$' | head -1; git remote. "reachable" if either prints anything.
6. Git history of the codebase: git -C "/<ABS_PROJECT_PATH>" --no-pager log -1 --format=%h >/dev/null 2>&1 && echo reachable || echo blocked
7. Prompt history: read ~/.claude/history.jsonl with the Read tool, and head -c 1 ~/.claude/history.jsonl >/dev/null 2>&1 && echo reachable || echo blocked in the shell
8. Old transcripts: ls ~/.claude/projects/ >/dev/null 2>&1 && echo reachable || echo blocked
9. Playbooks: read ~/.claude/playbooks/blank-slate-redesign.md with the Read tool
10. Network: in the shell, run curl -s -m 5 -o /dev/null -w 'code=%{http_code} ip=%{remote_ip}' https://example.com; echo " exit=$?" (a neutral site: the designer refuses the product's own site). "blocked" if code=000 with a non-zero exit, or a 403 from 127.0.0.1; otherwise "reachable". Also report whether a WebFetch tool exists.
11. Tools: list every tool you have whose name starts with mcp__, plus any tool named Artifact, ArtifactComments, ArtifactData, DesignSync, SendMessage, ListAgents, RemoteTrigger, or any browser tool. "reachable" for each one present; "blocked" if there are none.
12. Guard files: echo x >> shoot 2>/dev/null && echo reachable || echo blocked
13. This session: "reachable" if you can see any conversation from before this message (your own /model, /effort and other slash commands in this session don't count).
14. tmux: n=0; for s in /tmp/tmux-$(id -u)/*; do tmux -S "$s" list-sessions >/dev/null 2>&1 && n=$((n+1)); done; [ "$n" -gt 0 ] && echo reachable || echo blocked

Finish with one line: ALL BLOCKED, or the numbers that were reachable.
```

Keep a tmux session open on the default server (for example a codebase session) while you run it, or check 14 proves nothing.

The session will ask permission for some commands. Approve them: that's the point of the test. If it asks to allow a **network host**, say no, and count that check as blocked.

Expected result: **ALL BLOCKED** (this exact prompt returned that in the end-to-end test). Anything reachable → fix the template on `<base>`, commit, run `enter` (which refreshes the studio's guard files), and repeat in a new `./start` session.
