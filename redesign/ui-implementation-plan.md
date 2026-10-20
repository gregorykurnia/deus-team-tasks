# UI implementation plan

**Status: APPROVED by the owner (2026-10-20)** (Step 6 of `redesign/redesign-plan.md`). Agent C maps design → code only. Design gaps go to §7 and through the design-gap loop, never filled in from the old app.

How to use it: the **task table in §5 is the build checklist** and the only place to tick. Work top to bottom, one task per session (`/clear` first). Check the model and effort against the task's row before starting, and read only that task's section below, the guide sections it names and its prototype page.

---

## 1. Inputs

| Input | Version |
|---|---|
| Design guide | `redesign/design/design-guide.md` **v1.0 (2026-10-20)**, with `tokens.css`, `coverage.md` (69/69 stories), `decisions.md` up to D-025 |
| Prototype | `redesign/design/prototype/` (`map.html` links every state; `?stress` for stress data) |
| Inventory | `redesign/handoff/inventory.md` as approved in Step 1b (run 3, 2026-10-19), plus D-008 (selecting several) |
| Starting commit | `050c3a1` on `main` |

## 2. Architecture

**Constraints** (from the redesign plan's project settings): Next.js 16.3.1 App Router, React 19.2.8, TypeScript, Tailwind CSS 4, no component library. Firestore in two projects (`db`: tasks, taskGroups, flows; `clientsDb`: pipeline, prospectJournal, historicalClients). No sign-in. Team calendar through `app/api/calendar/route.ts`. Installable PWA. Vercel, Node 24. Light mode only.

- **Next.js here is newer than the model's training.** `node_modules` isn't installed on the Linux server yet: run `npm ci` first. Before writing routing, layout, font or metadata code, read the matching guide in `node_modules/next/dist/docs/` (AGENTS.md).
- **Old app stays live** on `main` until the merge. The new UI is built on `redesign` and reviewed on its Vercel preview. No flag. On `redesign` only, the old screens sit at `/old` from 2.3 until 4.7, so the Phase 1 smoke tests keep a target and the preview keeps a working UI (owner, 2026-10-20).
- **Both apps share the live data until the merge.** Every data change in Phase 1 must keep the old UI working (only add fields, never rename or remove them). The `redesign` preview writes real data (Q2).

**Routes** (App Router, all screens are client components under one client layout):

| Route | Screen | Opens over it |
|---|---|---|
| `/` | Today | `?task=<id>` or `?task=new` opens task details over any screen |
| `/tasks`, `/tasks/groups/[groupId]` | All tasks, one task group | `?select=1` selecting several |
| `/plan` | Plan (`?view=timeline\|month\|day\|people`, `&person=`, `&date=`) | |
| `/companies` | Companies (`?group=`) | `?company=<id>` the company record |
| `/notes`, `/notes/[notesId]` | Qualification notes, one prospect | |
| `/past` | Past clients | |
| `/flows`, `/flows/[flowId]` | Flows, one flow | `?edit=1` editing |

Sheets and the record use search params so they survive a reload and the phone's back gesture closes them.

**Data.** One `DeskData` provider in `app/(desk)/layout.tsx` opens **one** live subscription per collection for the whole app (today each tab opens its own, which also duplicates seeding). Screens read from it through small hooks. Each source keeps its own `loading`, `error` and `fromCache` so every area loads on its own (guide 5.8). All writes go through `lib/` functions that: refuse when offline (except notes, see below) with a typed `OfflineError`; return what's needed for **Undo**; and use `deleteField()` so a value can be cleared. Firestore uses `persistentLocalCache` in both projects, so the app opens with the last data when offline; the time of the last server snapshot is kept for the banner ("loaded at 09:12"). Qualification notes write through Firestore's offline queue, and the save line reads `hasPendingWrites`.

**Live changes** (A1): `docChanges()` from snapshots that aren't our own pending writes mark items "just changed" for 1.8s (the arrive glow). Toast wording waits on N2.

**File layout at the end** (no names shared with the old components; §5 task 4.7 checks it):

```
app/                    layout.tsx (fonts, metadata), manifest.ts, globals.css, api/calendar/route.ts
app/(desk)/             layout.tsx (DeskData, shell), page.tsx (Today), tasks/, plan/, companies/, notes/, past/, flows/
styles/                 tokens.css (from the design), base.css (backdrop, type, focus, reduce motion)
ui/                     shared components: Button, Segmented, FilterButton, Menu, Sheet, Dialog, Confirm, Toaster,
                        Notice, Banner, EmptyState, Skeleton, Field*, PeoplePicker, SectorPicker, Avatar, AvatarStack,
                        Pill, Tag, OptionChip, DoneCircle, Icon, Meter …
desk/                   shell: DeskData, SideNav, TabBar, MoreSheet, PageHeader, ConnectionBanner, LiveDot, GroupChips
features/<area>/        today, tasks, task-sheet, plan, companies, notes, past, flows, install
lib/                    data (kept hooks and Firebase setup, plus new modules listed in Phase 1)
tests/smoke/, tests/unit/
```

**Styling.** `styles/tokens.css` is `redesign/design/tokens.css` as frozen, minus its Google Fonts import. Tokens are registered as Tailwind 4 theme variables (`@theme inline`), so both utilities (`bg-glass`, `text-ink`, `rounded-panel`) and `var(--…)` work. Tailwind's own side-radius names (`rounded-l`, `rounded-s`) are not reused. Components use CSS Modules ported from the matching section of the prototype's `assets/app.css`, always taking values from the tokens and following the guide wherever it says **Changed from the prototype** (muted text, ink shades, field outlines, done-circle ring, button gradient). Tailwind utilities for simple layout only.

**Fonts and icons.** Plus Jakarta Sans 400–800 through `next/font/google` (self-hosted, so it works offline), set as `--font`. Geist goes. Icons: one `Icon` component holding the prototype's set (`assets/app.js`, `ICONS`), 24px grid, 2.1 stroke, `currentColor`, `aria-hidden` unless labelled.

**Tests.** Playwright smoke tests run against the **Firestore emulator** (both project ids, `singleProjectMode: false`), never live data (Q1); `NEXT_PUBLIC_USE_EMULATOR=1` connects both apps to it. The calendar route is mocked with `page.route`. Vitest for pure `lib/` rules (urgency, counts, sector spellings, kinds of work). One dev server and one browser; nothing left running after a check.

## 3. Screen and component map

**Screens** (hooks are the `DeskData` readers; "replaces" lists old files that go in task 4.7):

| Screen | Main components | Reads | Replaces | States (guide) |
|---|---|---|---|---|
| Today `/` | TodayHero, TwoWeekChart, NeedsAttention, QuickCapture, TaskCard, CalendarToday, WhoCarries | tasks, groups, companies, events | App, Sidebar (part) | 6.1 |
| All tasks / group | TaskToolbar, FilterButton, ResultsLine, TaskTable, TaskListRow, GroupHeader, GroupChips, SelectionBar | tasks, groups, companies | TasksTab, Chip | 6.2, 4.7 |
| Task details (sheet) | TaskSheet (quick, full), PeoplePicker, InformedList, KeptInStepNote | tasks, groups, companies, names | TaskModal, PeopleInput | 6.3 |
| Plan | PlanBar, Timeline, MonthGrid, DayView, WeekStrip, PeopleRanking, PersonPage, DayTaskRow, EventRow | tasks, groups, events | GanttTab, DailyTab, AssigneeTab, CalendarTab | 6.4 |
| Companies | GroupTiles, WhereToAct, CompanyTable, CellEditor, RowMenu, CompanyRecord, MoveDialog, NewCompanySheet, FieldsSheet, OptionsDialog, ExportDialog | companies, settings, tasks, notes | ClientsTab, ClientTable, ClientEntryModal, ClientBadge, FloatingPanel, Client*Popup, ClientColumnManager | 6.5 |
| Qualification notes | LikelihoodSpread, NotesList, NotesDocument, LikelihoodPicker, HeadingField, RemarksField, SaveLine, NewNotesSheet | notes, companies | ProspectJournalTab | 6.6 |
| Past clients | Totals, FigureSum, ParentTree, BySector, PastAddSheet, MoveParentDialog | pastClients | ClientsHistoricalTab, HistoricalClientDialogs | 6.7 |
| Flows | FlowsList, FlowDocument, FlowPath, StepCard, RoleRow, DecisionCard, OutcomeCard, FlowEditor | flows, names | FlowTab | 6.8 |
| Install, offline | InstallSheet, IosSteps, ConnectionBanner, offline EmptyState | — | ServiceWorkerRegister | 6.9 |

**Shared components** (variants and states are in the guide section named; code triggers them with props, never with class names from outside):

| Component | Variants | States and how they're set | Guide |
|---|---|---|---|
| Button | main, main small, danger, secondary, small, quiet, quiet red, icon, link, add line | `disabled`, `busy` (label + spinner, blocks repeat presses) | 4.1 |
| Segmented | 2–4 options, counts, full width on phones | `value`, `allowClear` (priority) | 4.2 |
| FilterButton + Menu | pick one, pick several, number, red item, disabled item with reason, palette | `value` (on/off), placement auto, focus return | 4.3 |
| Pill / Tag / OptionChip | deadline (red, amber, calm, none, done), kind, group, option, outside, live, read only, sector | from `lib/urgency` results | 4.4, 5.1 |
| Avatar, AvatarStack, PersonChip, LoadMeter | owner (solid), informed (dashed), stack "+n" | `informed`, `current` | 4.5 |
| Task rows, DoneCircle | card, list, day, record; checkbox when selecting | `done`, `leaving`, `overdue`, `soon`, `undated`, `justChanged`, `selected` | 4.6 |
| Sheet, Dialog, Confirm | sheet (540, 620, 460, short), bottom sheet on phones, dialog 440/560, alertdialog | `open`, focus trap, scroll lock, stacks over a sheet | 4.11 |
| Notice, Banner, Toaster | info, warning, error, success, inline; toast and error toast with action | queue, 5.2s, never over the selection bar | 4.14 |
| EmptyState, Skeleton | large, small, nothing matches, offline-nothing-loaded; row-shaped skeletons | per source | 4.15 |
| Fields | text, text box (big), select, date (clear), number, switch, chip group, search, in-place | `invalid` + message, `optional` label | 4.13 |
| PeoplePicker, SectorPicker | names in use first, then new; sector spelling note | keyboard: arrows, Enter, Backspace | 4.13, 5.11 |
| Charts | two weeks, timeline, month, week strip, owned/informed bar, sparkline, likelihood meter and spread, sector bars, headings written | data props; text labels per bar | 4.12 |
| Tree, FlowPath, Decision | tree with "show its other n"; path; decision with outcomes | read / edit | 4.16 |

## 4. UI surfaces checklist (code → design)

Every place the old code shows something, with its new counterpart. Nothing is restyled from the old version.

| Old surface | New counterpart | Task |
|---|---|---|
| `alert()` task description required (TaskModal:63) | Required-missing field error (4.13) | 3.1 |
| `alert()` company name required (ClientEntryModal:85) | Required-missing field error | 3.9 |
| `alert()` follow-up task failed (ClientsTab:99) | Error toast with Try again (6.5) | 3.9 |
| `confirm()` delete group, task, flow, company, own field, option, past client, subsidiary, notes | Confirm dialogs (5.4) | 3.1, 3.3, 3.9, 3.10, 3.11, 3.13, 3.14 |
| No confirm: modal "Delete task"; flow step, outcome, role removal | Task: confirm. Flow parts: Undo (D-018) | 3.1, 3.14 |
| "Loading tasks…" blocking every area | Per-source skeletons and "Loading tasks" line (4.15, 5.8) | 2.3 + each screen |
| Per-area empty texts | Large and small empty states, nothing-matches states (4.15) | each screen |
| Unhandled write failures (most writes) | Error toasts, dialogs keep what was typed, Try again (4.14, 5.8) | 1.5 + each screen |
| Two inline toasts (ClientsTab, past clients) | One Toaster (4.14) | 2.5 |
| Calendar "not configured" / failed as an amber pill | Info notice / warning notice; tasks carry on (5.9) | 1.6, 3.2, 3.5–3.7 |
| Calendar times "2:30 PM", no end time | 24-hour "09:30 to 10:00", "All day", open in team calendar (5.9) | 1.6 |
| CSV export buttons (companies, notes, past clients) | Export dialog (5.12) | 3.10, 3.11, 3.13 |
| Column picker for tasks (localStorage) | "Details shown" menu, remembered on the device (5.6) | 3.3 |
| Company options and columns in localStorage, per device | Shared settings in Firestore (D-024, C3) | 1.7, 4.8 |
| Mouse-drag column resizing | Not in the design: dropped | 4.7 |
| Phone hamburger drawer, desktop collapse | Tab bar, More sheet, side bar (3) | 2.3 |
| Viewport `maximumScale: 1` (no pinch zoom) | Zoom allowed (8, 200% zoom) | 2.1 |
| Manifest "DEUS Platform", theme #4f46e5, background #f6f7fb | "DEUS Team Space" (Q5), theme #eef3fb, new icon and launch screen (6.9) | 4.1 |
| Service worker: one cache name forever, registered in dev | Cache name per build, registered in production only, offline first-open states (5.8, 6.9) | 4.1 |
| No install entry | Install sheet, iPhone steps, hidden once installed (6.9) | 4.1 |
| No offline signal | Banner, amber live dot, refused-write toasts, notes kept on the device (5.8) | 1.6, 2.3 |
| "Show/Hide completed" | Open or Done switch, Finished filter (6.2) | 3.3 |
| Today's header search (tasks, companies, notes) | Results not designed: **N3** | waits |

## 5. Phases and tasks

**Model picks** come from the table in `~/.claude/CLAUDE.md`: anything that writes data, the tests and the shell → **Opus 5.5 High**; screens and components with the prototype as an exact reference → **Sonnet 5.5 High**; mechanical copies with no state or logic → **Haiku 5.5 Max**. Never Opus 5.5 Low or Sonnet 5.5 Medium. No calibration trials: if a cheaper model gets a task wrong twice, move that task up one row and change its cell here.

**Checks per task:** `npx tsc --noEmit`, `npx eslint <changed files>`, related unit tests, and the smoke specs the task touches. **Per phase review:** the full smoke suite and `npm run build`.

### Task table (the build checklist)

| # | Task | Model · effort | Done |
|---|---|---|---|
| 0 | Create `redesign` from `main`, push it; confirm Vercel builds its preview | Haiku 5.5 Max | 2026-10-20 · `20afd0f` (first preview; a branch with no new commit isn't built) |
| **1** | **Phase 1: safety net and data (no visual change)** | | |
| 1.1 | Test harness: `npm ci`, Playwright config, Firestore emulator, Vitest, `npm run test:smoke` / `test:unit` | Opus 5.5 High | 2026-10-20 · `130f886` (Vitest 4: Vitest 5 needs newer Node types) |
| 1.2 | Smoke specs on the old UI: tasks, task groups, flows | Opus 5.5 High | 2026-10-20 · `481931b` (desktop only on the old UI; two known bugs marked as expected failures until 1.4) |
| 1.3 | Smoke specs on the old UI: companies, notes, past clients | Opus 5.5 High | 2026-10-20 · `28f0b7a` (two known bugs marked as expected failures until 1.5) |
| 1.4 | Move logic out of components into `lib/` (tasks, groups, plan, flows) | Opus 5.5 High | 2026-10-20 · `06958ce` (also `lib/dates.ts`, `lib/taskWrites.ts`, `lib/batches.ts`; flows had no logic to move) |
| 1.5 | Move logic out of components into `lib/` (companies, notes, past clients); safe writes | Opus 5.5 High | 2026-10-20 · `d7e3504` (kept in step is one write per Firebase project, not one batch; ids from `settings/companyIds`, rule published in 1.7) |
| 1.6 | Data additions, connection state, offline cache, calendar route | Opus 5.5 High | 2026-10-20 · `be15701` (old flows screen drops keys when typed fast, before and after; for R1) |
| 1.7 | Shared company settings in Firestore (read path + defaults) | Opus 5.5 High | 2026-10-20 · `217c06a` (rules published 2026-10-20) |
| R1 | **Phase 1 review** (fresh session) | Opus 5.5 High | 2026-10-20 (notes: `redesign/reviews/phase-1.md`; later items added to 2.3, 3.10, 3.14, 4.3) |
| R1.1 | Phase 1 review fixes (listed in `redesign/reviews/phase-1.md`) | Opus 5.5 High | 2026-10-20 (same commit as R1) |
| **2** | **Phase 2: foundations** | | |
| 2.1 | Tokens, base styles, font, backdrop, reduce motion | Haiku 5.5 Max | 2026-10-20 · `893b19b`, review fixes `fee5428` (radius names: rounded-sheet, rounded-panel, rounded-small, rounded-cell) |
| 2.2 | Icon set | Haiku 5.5 Max | 2026-10-20 · `ab2b618` (creates /gallery with the icons; 2.4 adds the rest) |
| 2.3 | App shell: routes, DeskData, side bar, tab bar, More, page header, banner, live dot | Opus 5.5 High | 2026-10-20 · `0a3d24b` (old screens at `/old`; More and the back-online toast move onto 2.5's Sheet and Toaster) |
| 2.4 | Display components: buttons, pills, tags, chips, avatars, notices, empty, skeleton, meters + dev gallery | Haiku 5.5 Max | 2026-10-20 · `036597b` (gallery side by side with the prototype) |
| 2.5 | Overlays: menu, sheet, bottom sheet, dialog, confirm, toaster | Sonnet 5.5 High | 2026-10-20 · `1aa1ae3` (More and the back-online toast now use Sheet and Toaster) |
| 2.6 | Fields: all field variants, segmented, filter button, people picker, sector picker, in-place field | Sonnet 5.5 High | 2026-10-20 · `bb34cc2` (choice chips built here; picker matching lives in lib/people and lib/sectors) |
| 2.7 | Task row family, done circle, urgency rules wired in, selecting checkboxes | Sonnet 5.5 High | 2026-10-20 · `d8adb43` (row content comes from lib/taskRow; the list row has fixed cells until 3.3's column chooser) |
| R2 | **Phase 2 review** | Opus 5.5 High | 2026-10-20 (notes: `redesign/reviews/phase-2.md`; title rename added to 4.1) |
| R2.1 | Phase 2 review fixes (listed in `redesign/reviews/phase-2.md`), before Phase 3; then tick Phase 2 in `redesign/redesign-plan.md` | Opus 5.5 High | 2026-10-20 (all 23 items; gaps N4 connecting, N5 failed source, provisional) |
| **3** | **Phase 3: screens (all states, phone and desktop)** | | |
| 3.1 | Task details sheet (quick, full, kept in step, delete, offline) | Opus 5.5 High | 2026-10-20 · this commit (a new dated company task also brings its company in step; gap N6 provisional; test emulator moved to port 8180) |
| 3.2 | Today | Sonnet 5.5 High | 2026-10-20 · this commit (links into All tasks use `?due=`, `?kind=prospect\|client\|internal`, `?idle=14`, `?q=`, `?focus=search` for 3.3 to read; search still waits on N3) |
| 3.3 | All tasks and task groups (filters, sort, details shown, group create/rename/delete) | Sonnet 5.5 High | 2026-10-20 · this commit (the view lives in the address; Select waits for 3.4; gap N7 provisional) |
| 3.4 | Selecting several tasks (select all, bulk done/move/delete, Undo) | Opus 5.5 High | 2026-10-20 · this commit (`?select=1` replaces the address, no Back step; the head box ticks the rows shown) |
| 3.5 | Plan: bar, filters, stepper, Timeline | Sonnet 5.5 High | 2026-10-20 · this commit (the view lives in the address; Month, Day and People say they aren't built until 3.6 and 3.7; bars run from the kind's ink to its colour so white words keep their contrast) |
| 3.6 | Plan: Month and Day | Sonnet 5.5 High | 2026-10-20 · this commit (Month and Day share one ten-week run of events; Day lands in Plan, so Today and the stepper agree; People still says it isn't built until 3.7) |
| 3.7 | Plan: People and one person | Sonnet 5.5 High | 2026-10-20 · this commit (the ranking counts everyone named on any task, Work narrows it; Plan's four views are all built) |
| 3.8 | Companies: tiles, where to act, filters, sort, search, list | Sonnet 5.5 High | 2026-10-20 · this commit (cells are read only and the header has no New company, Fields or Export until 3.9 and 3.10; the settings now load once in DeskData) |
| 3.9 | Companies: editing in place, record, new, move, follow-up task, delete | Opus 5.5 High | 2026-10-20 · this commit (New company is `?newCompany=1`; Edit options and Edit fields wait for 3.10; the notes links go to `/notes/<id>` or `/notes?company=<id>` for 3.11; gap N8 provisional) |
| 3.10 | Companies: fields sheet, options dialog, export | Opus 5.5 High | 2026-10-20 · this commit (Fields is `?fields=<group>`; High, Not now and No locked like the statuses, gap N9 provisional; menus opened in a dialog sit above it) |
| 3.11 | Qualification notes (autosave, offline writing, live, link, export) | Opus 5.5 High | 2026-10-20 · this commit (New notes is `?newNotes=1`; starting, linking and deleting need the connection; gap N10 provisional) |
| 3.12 | Past clients: totals, by sector, tree, search, order | Sonnet 5.5 High | 2026-10-20 · this commit (read only: no Add a past client, Export, ⋯ menus or add lines until 3.13; the "Just added" live tag waits for 4.2; a matching parent shows the subsidiaries that match, with "Show its other n") |
| 3.13 | Past clients: add, subsidiary, rename, sector, move, not counted, delete, failures, export | Opus 5.5 High | 2026-10-20 · this commit (add is a dialog and Export sits in the record's toolbar, as in the prototype; a delete also offers Undo; gap N11) |
| 3.14 | Flows: read and edit (autosave, steps, roles, decision, outcomes, loop back) | Opus 5.5 High | 2026-10-20 · this commit (editing is `?edit=1`, New flow `?newFlow=1`; the decision gains a stored `description`; gap N12 provisional) |
| R3 | **Phase 3 review** | Opus 5.5 High | 2026-10-20 (notes: `redesign/reviews/phase-3.md`; later items added to 4.2, 4.3) |
| R3.1 | Phase 3 review fixes (listed in `redesign/reviews/phase-3.md`); then tick Phase 3 in `redesign/redesign-plan.md` | Opus 5.5 High | 2026-10-20 (same commit as R3; gaps N13–N15 provisional) |
| **4** | **Phase 4: edge surfaces and launch** | | |
| 4.1 | Install and PWA: install sheet, manifest, icons, launch screen, service worker, offline first open | Sonnet 5.5 High | 2026-10-20 · this commit (install sheet is `?install=1`; short name "DEUS Space"; iPhone launch screen is in-app, no startup images; gap N16 provisional; Android install and the iPhone steps need a real-device check, left to 4.4) |
| 4.2 | Live changes and the rest of the §4 checklist (needs N1–N3 built here once designed) | Sonnet 5.5 High | 2026-10-20 · this commit (one live store, `lib/liveChanges.ts`, fed by every source's snapshots; N2 and N3 built provisional, N1 stays as 3.3 and 3.14 left it; the plan's one open §4 row, Today's search, is N3) |
| 4.3 | Smoke tests rewritten for the new UI, all passing | Opus 5.5 High | |
| 4.4 | Screenshots against the prototype, every state on `map.html`, phone and desktop | Sonnet 5.5 High | |
| 4.5 | Accessibility check (axe, keyboard pass, screen-reader labels) | Sonnet 5.5 High | |
| 4.6 | Real-phone check on the preview (you, with a helper session) | Haiku 5.5 Max | |
| 4.7 | Delete old UI files, old-names check, remove unused deps | Haiku 5.5 Max | |
| 4.8 | Data step for launch: settings import, sector backfill, dry run (Q3, Q4) | Opus 5.5 High | |
| R4 | **Phase 4 review** | Opus 5.5 High | |
| M | Merge `redesign` into `main` on your say; update `CLAUDE.md` | Sonnet 5.5 High | |

Done cells: date and commit, plus a short phrase only if something changed from the plan.

### Phase 1: safety net and data

**1.1 Test harness.** `npm ci`. Add `firebase-tools` (dev) and `firebase.json` emulator config (Firestore only, `singleProjectMode: false`); `lib/firebase*.ts` connect to it when `NEXT_PUBLIC_USE_EMULATOR=1`. `playwright.config.ts` starts the emulator and one dev server, Chromium only, a desktop and a phone project (390×844). Vitest for `lib/`. Fixtures: helpers that seed and clear each collection through the emulator's REST API, and a calendar route mock (ok, not configured, failed). Scripts `test:smoke`, `test:unit`. **Done when** an empty spec and an empty unit test pass, and nothing is left running.

**1.2 / 1.3 Smoke specs on the old UI.** One spec per area, behaviour only (each test names the job story it guards): add, edit, mark done, delete a task; create, star, delete a group (its tasks become ungrouped); add, edit, delete a flow with a decision; add a company in each group, edit a cell, move it, follow-up task, delete; start notes from a company, write, blur, reload and see it saved; add a parent and a subsidiary, move, not counted, blocked delete. Assert on the stored data as well as the screen. **Done when** they pass on the old UI twice in a row.

**1.4 Logic to `lib/` (tasks side).** New modules: `lib/kinds.ts` (kind of work from the linked company, 5.2), `lib/urgency.ts` (5.1, with unit tests), `lib/taskQueries.ts` (filters, sorts with empty last, sections for Today, folding), `lib/taskGroups.ts` (create with unique name ignoring case, rename and delete as one batch over its tasks, which fixes deleted groups reappearing), `lib/planMath.ts` (ranges, crunch days, quiet stretch, load per person), `lib/people.ts` (names in use, initials, hue). Writes: `deleteField()` for cleared values, no stray `id` field, batches chunked at 450. The old components call these. **Done when** smoke specs and new unit tests pass and the old UI looks the same.

**1.5 Logic to `lib/` (clients side), safe writes.** `lib/companies.ts`: group of a company, search and filters (product spellings merged, D-012), sorts, where-to-act counts, **merge** updates instead of whole-document overwrites (fixes lost own-field values), move between groups, kept in step both ways in one batch (B12), follow-up task (D-011), delete cascade (tasks become internal, notes become not tracked under the old name, D-012), new ids allocated in a transaction that never reuses an id. `lib/notes.ts` (headings, likelihood from `opportunityStatus`, headings-written count, search snippets). `lib/pastClients.ts` (counts with subsidiaries' own sector, falling back to the parent's until 4.8). CSV row builders per area. Every write returns an undo function where 5.4 says Undo. **Done when** smoke specs and unit tests pass, old UI unchanged.

**1.6 Data additions, connection, calendar.** Backward compatible only: `tasks.completedAt` set on done and cleared on not done; `flows.updatedAt`; `answer` on No-or-not-now companies; remove auto-seeding of sample data (Q7). `lib/connection.ts`: online state from `navigator.onLine` plus snapshot `fromCache`, last-loaded time, `OfflineError` guard for writes (notes exempt). `persistentLocalCache` in both Firestore setups. Calendar route returns `status: ok | off | failed`, 24-hour start and end times, all-day, link. **Done when** unit tests cover the guard and the route shape, smoke specs pass.

**1.7 Shared company settings.** Firestore doc `settings/companies` in `db` (the `deus-team-tasks` project, whose rules are in this repo; Q6): options per choice field (name, colour token from the nine `--opt-*` pairs, locked role `dealDone` / `followUp`), fields per group (label, type, shown, own). `lib/companySettings.ts` reads it, falling back to the built-in defaults when missing; rename an option updates every company in batches and reports how many; remove clears it; locked options can only be recoloured. Add `match /settings/{docId}` to `firestore.rules` and publish it (`npx firebase deploy --only firestore:rules`; the owner logs in with `! npx firebase login`). The old UI keeps using localStorage until the merge; the import is task 4.8. **Done when** unit tests cover rename, remove and lock rules against the emulator, and the published rules allow `settings`.

### Phase 2: foundations

**2.1 Tokens and base.** Copy `tokens.css` to `styles/tokens.css`, register it with `@theme inline`, add `styles/base.css` (backdrop fixed, `overflow-wrap: anywhere`, tabular figures, focus ring 2.5px offset 2, reduce motion cuts animation). Font through `next/font`. Root layout: `lang="en"`, theme colour `#eef3fb`, zoom allowed. Refs: guide 2.1–2.5, 2.7, 8. **Done when** a blank page shows the backdrop and font, build passes.

**2.2 Icons.** `ui/Icon.tsx` with every icon in the prototype's `ICONS` map plus guide 2.6's table; sizes 13–21. **Done when** the dev gallery shows them all.

**2.3 App shell.** Route groups and pages (empty screens with titles), `DeskData` provider and readers, SideNav (brand per Q9: the DEUS mark and "DEUS Team Space"; areas with counts, task groups with star and open count, install entry, live dot), TabBar with the raised + (opens `?task=new`), More sheet, PageHeader (title, subtitle, search, main action; phone placement), ConnectionBanner and back-online toast. Refs: guide 3, 5.8; prototype `index.html` shell, `?open=more`, `?state=offline`. **Done when** every area is reachable in one step on desktop and two on a 390px phone, `aria-current` is set, and the offline banner appears with the emulator stopped. From R1: `lib/connection.ts` forgets a source when its subscription closes, so a closed one can't keep the app counted as online.

**2.4 Display components.** Buttons (all variants, busy, disabled), pills, tags, option chips, avatars and stacks, person chip, notices, empty states, skeletons, load and likelihood meters. Port from the prototype's CSS with the guide's changed values. A dev-only `/gallery` route (not built in production) shows each with its states. Refs: 4.1, 4.4, 4.5, 4.14, 4.15. **Done when** the gallery matches the prototype in a side-by-side screenshot.

**2.5 Overlays.** Menu (anchored, flips above, 12px inside the window, all variants, Esc and focus return), Sheet (drawer on large screens, bottom sheet ≤900px with grab handle and safe area), Dialog and Confirm (`alertdialog`, Cancel focused first, can sit over a sheet), Toaster (stack, 5.2s, action, error variant, above the tab bar and never over the selection bar). Refs: 4.3, 4.11, 4.14, 2.7. **Done when** keyboard-only use works and the gallery shows each state.

**2.6 Fields.** Field wrapper (label, optional, error with `aria-invalid`/`aria-describedby`), text, big text box, select, date with clear and quick picks, number, switch, chip group, search, segmented, filter button, PeoplePicker (names in use with open counts, add new, arrows/Enter/Backspace), InformedList, SectorPicker (spelling note), in-place field. Refs: 4.2, 4.3, 4.13, 5.11. **Done when** the gallery shows every state and unit tests cover the picker's matching.

**2.7 Task rows.** DoneCircle (44px hit area, kind-coloured ring, label "Mark done: …"), card, list, day and record rows, the leaving animation, just-changed glow, checkbox mode, all driven by `lib/urgency` and `lib/kinds`. Refs: 4.6, 4.7 (checkboxes only), 5.1. **Done when** the gallery shows every variant × state, phone card layout included.

### Phase 3: screens

Every screen task: build every state listed in its guide section at desktop and 390px, check stress data (`?stress` equivalents: seed the emulator with the stress sizes), and add or update its smoke spec only where the task changes a data-writing flow. Compare with the prototype page named, never with the old app.

**3.1 Task details.** Quick sheet (description, About, company or group, Enter saves, "Add details"), full sheet, kept-in-step note, Open company, finished task, delete confirm, offline refusal keeping the text. Prototype `tasks.html?open=task-new`, `task-new-full`, `task-edit`, `task-required`, `task-names`, `task-delete`, `task-done`. Guide 6.3.

**3.2 Today.** Hero sentence and chips, counts by kind, two-week chart (opens Plan's day), Needs attention with kind switch and quick capture (toast with Add details), Calendar today, Who's carrying what. The header search waits on N3 (until then it goes to All tasks with the query, as the prototype does). Prototype `index.html` and its states. Guide 6.1, 4.8.

**3.3 All tasks and groups.** Toolbar, Open/Done, filters with "No action for" number, sort menu, details shown (remembered on the device), results line, 100 rows then "Show 100 more", group header (badge, star, rename, delete), group chips on phones, new group dialog (empty, taken, couldn't create). Prototype `tasks.html`. Guide 6.2, 5.6, 5.7.

**3.4 Selecting several.** Select mode, head checkbox (mixed), selection bar (phone replaces the tab bar), select all matching, bulk mark done / not done, move to group (company tasks stay, menu says so, new group from the menu), delete with confirm; Undo for done and move; batches chunked. Prototype `tasks.html?open=select*`. Guide 4.7, D-008.

**3.5 Plan: Timeline.** View and show switches, Work / Person / Rows filters, stepper, summary chips, legend, four weeks stepping two, bars, diamonds, fade-out, crunch columns, team calendar row with counts, rows folded at 4, phones scroll from today with avatars pinned. Prototype `plan.html`. Guide 6.4, 4.12.

**3.6 Plan: Month and Day.** Month grid (phones: dots and the chosen day below), Day with week strip, date picker, landing on the next busy day with "Show today", deadline / starting / under way, events with times and links. Prototype `plan.html?view=month`, `?view=day`.

**3.7 Plan: People.** Ranking with owned/informed bar, sparkline, next deadline, search; one person with figures, "Responsible for" and "Kept informed on" with their part; person with no tasks. Prototype `plan.html?view=people`.

**3.8 Companies list.** Group tiles, where to act (Active only), filters (status, priority, product with merged spellings), sort menu, search with "found in other groups", list with pinned first column and sideways scroll, phone cards, loading, empty, offline. Prototype `companies.html`. Guide 6.5, 4.9, 4.10.

**3.9 Companies editing.** Cell quick editors (choice, date with quick picks, text) saving with Undo, row menu, company record sheet (no Save, urgency notice, fields in place, tasks with kept-in-step note), new company (name required), move dialog (carried over, asks for the new group's fields, says when tasks change kind), Deal done via status, follow-up task (Open, or Try again), delete confirm with what stays. Prototype `companies.html?open=…`. Guide 6.5, 5.3, 5.4, 5.10.

**3.10 Fields, options, export.** Fields sheet per group (shown switch, rename, own fields add/remove, types), options dialog (colour palette, rename with count, remove with count, locked statuses), export dialog for companies (what's in the file, nothing to export). From R1: priority "High" and the "No" / "Not now" answers drive where to act and follow-up logic in `lib/companies.ts`, so renaming or removing them must not break it (a role like the locked statuses, or a need if the guide says otherwise). Prototype `?open=fields`, `field-new`, `field-remove`, `options`, `option-remove`, `export`. Guide 6.5, 5.12.

**3.11 Qualification notes.** How likely spread and filters, list with snippets, document with nine headings, likelihood picker, headings written, remarks folding, save line (Saving…, Saved, kept on this device), never replacing text being typed when a colleague's change arrives ("Changed just now"), new notes (tracked with picker marking companies that have notes, or not tracked yet), link to a tracked company, delete, export. Phones: list then document with "All notes". Prototype `notes.html`. Guide 6.6, 5.3, 5.8.

**3.12 Past clients: reading.** Totals with display number, figure sum, not counted tile, copy these figures, record with trees, "Show its other n subsidiaries", search with highlights, order menu, By sector panel (top 8, no sector, total), phone switch. Prototype `past.html`. Guide 6.7, 4.16.

**3.13 Past clients: changing.** Add sheet (parent with "Count it in the totals" or subsidiary of a parent), quick add in a parent, rename and sector editors with Undo, move with searchable parents (none to move to), not counted with Undo, delete blocked / subsidiary / company (says how the total changes), busy states, failures with Try again, export of the full record. Guide 6.7, R9.

**3.14 Flows.** List A to Z with search over steps, outcomes, roles and people; flow document with path and decision, loop back jumps and highlights; Edit flow: in-place fields, steps up/down/add/remove with Undo (an outcome looping to a removed step ends the flow), roles with label and name suggestions, decision after the last step with outcomes good/bad, add/remove; autosave 0.8s with save line (text fields keep a local draft, so a snapshot never drops keys typed fast: the old screen did, R1); "Editing needs a connection" offline; new flow (name required), delete confirm. Prototype `flows.html`. Guide 6.8, 4.16.

### Phase 4: edge surfaces and launch

**4.1 Install and PWA.** Install sheet (browser prompt, iPhone steps, installed notice), install entries hidden once installed, `manifest.ts` (name "DEUS Team Space", short name per what fits under an icon, theme `#eef3fb`, icons from `redesign/brand/deus-logo.jpeg` as supplied per Q9, the maskable one with the logo inside the safe zone on the same navy), launch screen, service worker with a per-build cache name, production-only registration, offline first-open empty states per area. From R2: the page title and description in `app/layout.tsx` still say "DEUS Platform"; rename them to match. Prototype `install.html`. Guide 6.9.

**4.2 Live and leftovers.** Arrive glow and "Just changed" on every screen, the many-changes toast (N2), back online message, anything still open on the §4 checklist, and N1 / N3 once designed. From R3: a way for the Toaster to take a toast back, so a flow editor that closed clears its own Undo and Try again (an old Try again can still put older typing over newer typing in the same field); the company delete and task group rename or delete word a partly saved batch as the task screens do (N13); the offline banner says changes can't be saved, while qualification notes keep writing on the device (D-014): word it per screen.

**4.3 Smoke tests for the new UI.** Rewrite every 1.2/1.3 spec's steps and selectors (roles and labels from the design) keeping the same behaviours, and drop `OLD_UI` (`/old`) from them; add selecting several, quick capture, options rename, notes offline writing, and the company delete cascade (tasks become internal, notes not tracked; R1). From R3: one project run in the team's time zone (`timezoneId: "Asia/Jakarta"`), for Plan, Today and the deadline pills. **Done when** the full suite passes twice in a row on a free machine.

**4.4 Screenshots.** A Playwright script shoots each `map.html` state from the prototype and the matching new route at 1440 and 390, side by side, into `redesign/compare/` (git-ignored). Fix differences or log deliberate ones (guide "Changed from the prototype"). Coverage G-2: check phones state by state.

**4.5 Accessibility.** `@axe-core/playwright` on every screen and open sheet, keyboard-only pass of each job, labels from guide 8, 320px reflow and 200% zoom. **Done when** no serious or critical axe issues remain.

**4.6 Real-phone check.** You use the preview on your phone (install it, go offline, write notes offline, come back). A helper session writes the findings as fix tasks.

**4.7 Old files out.** Delete the `/old` route (`app/old/`), every file in the "Replaces" column of §3 and old helpers no longer used (`clientLocalConfig.ts` after 4.8, `clientColumnResize.ts`, `colors.ts`, seed files), drop Geist. `scripts/old-names-check.sh` greps `app/ desk/ ui/ features/ styles/` for the old component and file names; it must print nothing.

**4.8 Data step for launch.** A script imports the chosen device's company options and fields (Q4) into `settings/companies` (colours mapped to the nearest `--opt-*` pair, own fields kept), and backfills each subsidiary's sector from its parent where empty (D-016). Dry run first against the emulator with a copy, then live right before the merge, with a JSON backup of both collections.

## 6. Rollback

Until the merge, production is untouched: `main` keeps the old UI. Phase 1 data changes only add fields, so the old UI keeps working on the shared data. After the merge, use Vercel's instant rollback to the previous production deployment, or revert the merge commit. The 4.8 backups restore the settings and sectors if needed; the old UI ignores both new data, so a rollback needs no data change.

## 7. Open items

**Design gaps sent to the studio** (`redesign/handoff/needs.md`, status `open`):

| Need | Gap | Blocks |
|---|---|---|
| N1 | (4.2: still undesigned, provisional kept) Finished tasks and flows changed before this version have no recorded date. The design always shows one ("Done 3 days ago", "Finished: last 7 days", "edited …"). Provisional in 3.3: such a task's pill says "Done", and Finished "last 7 / 30 days" leaves it out ("Any time" shows it). In 3.14 such a flow leaves "Edited …" out of its list item and meta line. | 3.3, 3.14 (dates), 4.2 |
| N2 | The many-changes toast names the colleague ("Kevin Tan’s changes just came in"), but nobody signs in, so the app can't know who changed something. Provisional (4.2): "A colleague’s changes just came in", once for a burst of 5 or more of a colleague's changes, at most one in 15s. | nothing (provisional built) |
| N3 | Today's search says it covers tasks, companies and notes, but no results for companies and notes are designed (the prototype sends the query to All tasks only). Provisional (4.2): All tasks, under a search, says "Also mentioned in 3 companies and 2 sets of qualification notes", each a link to that area with the same words. | nothing (provisional built) |
| N4 | The app opening before any source reaches the server (R2.1): the guide has Live and No connection only. Provisional: a grey dot and "Connecting…", no banner, writes refused; No connection after 8s. | nothing (provisional built) |
| N5 | A source that fails to load while online (R2.1): only the calendar's failure is designed. Provisional: the side bar hides its counts, and the groups say "Couldn't load task groups." in red ink. | each screen's error state (3.x reuse the provisional) |
| N6 | A task that's gone (3.1): opened from a link after it was deleted, or deleted by a colleague while open. Provisional: the first gives an error toast ("This task isn't there any more. Someone may have deleted it.") and the sheet doesn't open; the second keeps the sheet with what was typed, a warning notice ("This task was deleted.") and only Close. | nothing (provisional built) |
| N7 | A task group that's gone (3.3): opened from a link after it was deleted, or deleted by a colleague while open. Provisional: an empty state "This task group isn't there any more" with an All tasks button, and "Its tasks are under Internal." | nothing (provisional built) |
| N8 | A company that's gone (3.9): opened from a link after it was deleted, or deleted by a colleague while its record is open. Provisional, as N6: an error toast ("This company isn't there any more. Someone may have deleted it.") and the record closes; nothing typed is lost, as each change saves itself. | nothing (provisional built) |
| N9 | Locked choices beyond the guide's two (3.10, from R1): Where to act counts priority "High", a follow-up task takes its priority from it, and the answers "Not now" / "No" tell on hold from rejected. Provisional: these three are locked like Deal done and Follow-up due (a lock and the reason, recolour only, named in the options dialog's notice). | nothing (provisional built) |
| N10 | Qualification notes that are gone (3.11): opened from a link after they were deleted, or deleted by a colleague while open. Provisional, as N8: an error toast ("These notes aren’t there any more. Someone may have deleted them.") and the list shows; what was typed in the last moment before is not saved, so deleted notes never come back half empty. From R3: writing kept on the device that the server then refuses because the notes were deleted meanwhile gives one error toast with "Copy it", which copies that writing. | nothing (provisional built) |
| N11 | Adding the first subsidiary to a parent company with none (3.13): the quick add line sits inside an opened parent, but a parent with no subsidiaries can't be opened, so "Add a subsidiary" in its ⋯ menu has nowhere to go. Provisional: it opens the parent with only its add line, which closes again when left empty. | nothing (provisional built) |
| N12 | A flow that's gone (3.14): opened from a link after it was deleted, or deleted by a colleague while open or being edited. Provisional, as N8: an error toast ("This flow isn’t there any more. Someone may have deleted it.") and the list shows; a change typed in the last moment before isn't saved. | nothing (provisional built) |
| N13 | A change that wasn't saved, only partly saved, or waits for the connection (R3): the guide's save line has Saving…, Saved and kept on this device only. Provisional: notes and flows say "Not saved." in red ink with Try again (the text stays, and goes out with the next save); flows being edited offline keep the fields read only with "Not saved yet. Saves when you’re back online."; a bulk task change that only partly saved says "450 of 1,200 tasks marked done. Couldn’t mark the other 750 done…" with Undo for the saved part; an option rename whose companies didn't all follow says so with Try again. Built in 4.2 the same way: a task group rename (in the dialog) or delete (toast, Try again) and a company delete (the confirmation stays) that stopped part way say how many tasks went and how many didn't. | nothing (provisional built) |
| N14 | A task link opened offline when the task isn't on the device (R3). Provisional: the sheet stays open with a small empty state ("This task isn’t on this device yet. It will open once you are back online.") and opens the task when it arrives. | nothing (provisional built) |
| N15 | "A company" chosen in the task sheet with no company picked (R3): it used to save as internal work. Provisional: a required-field error, "Choose the company this task is about, or switch to Internal work." | nothing (provisional built) |
| N16 | The install sheet in a browser that neither offers installing nor is Safari on iPhone or iPad (4.1), such as Firefox or desktop Safari. Provisional: the sheet keeps its icon and three perks, with an info notice ("This browser can’t install it from here. In Chrome or Edge, use the install button at the end of the address bar. On iPhone or iPad, open this page in Safari.") and a Close button. | nothing (provisional built) |

**Questions for the owner** (all answered 2026-10-20: the recommendation for each, and Q5 as below)

| # | Question | Answer |
|---|---|---|
| Q1 | Where smoke tests run. | Firestore emulator (`firebase-tools` as a dev dependency; Java is on the server). Never live data. |
| Q2 | Data behind the `redesign` preview. | Live data, used with care (test on throwaway records). |
| Q3 | Which stored status is the locked "Follow-up due". | "To Follow Up". "Client / Partner Done Deal" is Deal done. |
| Q4 | Whose company options and fields become the team's at launch. | The owner's main computer. |
| Q5 | App name and logo. | **DEUS Team Space**, with the DEUS logo. Replaces "Team desk" and the striped placeholder everywhere (2.3 side bar, 4.1 manifest, icons, launch screen). |
| Q6 | Where the shared company settings live, given the `deus-client-tracker` rules aren't in this repo. | In `deus-team-tasks` (`settings` collection), whose rules are in `firestore.rules`. The client tracker's rules aren't needed. |
| Q7 | Stop re-creating sample data when a collection is empty. | Yes (1.6). |
| Q8 | Add the selecting-several story (D-008) to the inventory. | The owner adds it on their side. |
| Q9 | The logo (`redesign/brand/deus-logo.jpeg`, 1068px, cream on dark navy) disappears on the guide's light icon tile (6.9). | Keep the logo **as supplied** (brief: the logo stays as it is). App icon and launch-screen logo: the logo on its own navy square. Side bar brand (3): the mark only (the square with the person) in a small navy rounded square, beside "DEUS Team Space"; the tagline is left out at that size. Deliberate difference from guide 3 and 6.9, by the owner's call reserved in guide 9; 4.4 logs it, not a fix. |

## 8. Done when

- Every job story and state in `coverage.md` is built, at desktop and phone widths.
- Every `needs.md` row is designed and built.
- The smoke suite passes; screenshots match the prototype (deliberate differences logged).
- No serious axe issues; the real-phone check is done.
- The old-names check prints nothing.
