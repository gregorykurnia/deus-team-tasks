# Inventory notes (owner only, never leaves `main`)

Everything here refers to the current code or behaviour. It must never go into `redesign/handoff/` or the studio. Written in Step 1 (2026-10-19) from the source files listed in the plan's project settings.

---

## §1 Code map (for Agent C)

| Area | Files | Stories |
|---|---|---|
| Shell, navigation, global "show completed" switch, loading | `components/App.tsx`, `components/Sidebar.tsx`, `app/layout.tsx`, `app/page.tsx`, `app/globals.css` | W6, A4 |
| Task CRUD, task groups, internal/prospect/client split, column picker and widths, filters, sort | `components/TasksTab.tsx` | W1–W15, B13 |
| Task form (create/edit, completed, linked company chip) | `components/TaskModal.tsx`, `components/PeopleInput.tsx`, `components/Chip.tsx` | W1–W7, B13 |
| Timeline across dates | `components/GanttTab.tsx` | D1–D3, D11 |
| One day | `components/DailyTab.tsx` | D4, D5, D11 |
| Per person | `components/AssigneeTab.tsx` | D6, D11 |
| Month with external events | `components/CalendarTab.tsx`, `app/api/calendar/route.ts` | D7–D10 |
| Flows | `components/FlowTab.tsx`, `lib/useFlows.ts`, `lib/flowSeed.ts` | M1–M4 |
| Client pipeline (4 sub-tabs, stats, filters, inline edit popups, move, follow-up task, journal link, column manager, CSV) | `components/ClientsTab.tsx`, `components/clients/*` (except `HistoricalClientDialogs.tsx`), `lib/clientTypes.ts`, `lib/clientHelpers.ts`, `lib/clientLocalConfig.ts`, `lib/clientColumnResize.ts`, `lib/useClientPipeline.ts`, `lib/clientSeedData.ts` | B1–B14, C1–C3, E1 |
| Prospect journal | `components/ProspectJournalTab.tsx`, `lib/prospectJournalTypes.ts`, `lib/useProspectJournal.ts` | U1–U8, E1 |
| Clients historical | `components/ClientsHistoricalTab.tsx`, `components/clients/HistoricalClientDialogs.tsx`, `lib/historicalClientTypes.ts`, `lib/useHistoricalClients.ts` | R1–R9, E1 |
| Data hooks and Firebase | `lib/useTasks.ts`, `lib/useTaskGroups.ts`, `lib/firebase.ts`, `lib/firebaseClients.ts`, `lib/types.ts`, `lib/seedData.ts` | A1 |
| Shared helpers | `lib/colors.ts` (name → colour hash), `lib/exportCsv.ts` (BOM + CRLF, delayed URL revoke for Safari) | E1 |
| PWA | `app/manifest.ts`, `public/sw.js`, `components/ServiceWorkerRegister.tsx`, `public/*.png` | A2, A3 |
| Unused assets | `public/file.svg`, `globe.svg`, `window.svg` (create-next-app leftovers) | — |

Pure logic worth keeping as-is in `lib/` (Phase 1): `historicalClientTypes.ts` (counting, sector merge, sort), the internal/prospect/client split (currently duplicated in `TasksTab.tsx` and `GanttTab.tsx`), task date helpers (`daysSince`, range formatting, default day for the one-day screen), the company↔task date sync (currently in `ClientsTab.persist` and `TasksTab` save), the column-config migration in `clientLocalConfig.ts`.

## §2 Current behaviour details

**Navigation.** Collapsible left sidebar (Tasks: Operational / Prospects / Clients; Views: Gantt / Daily / Assignee; Calendar; Flow; Clients: Client Pipeline / Prospect Journal / Clients Historical). Hamburger + overlay on mobile. Default screen: Operational. State is in memory only (no URLs per screen, no deep links; reload goes back to Operational).

**Header.** Static subtitle "Handover & rollout plan"; "Show/Hide completed (n)" button, only rendered when at least one task is completed. Hides completed tasks from every task screen (not the pipeline).

**Tasks.**
- Operational = tasks with no `linkedClientId` or whose linked entry no longer exists. Prospects = linked to an entry whose status isn't exactly "Client / Partner Done Deal". Clients = linked to a done-deal entry.
- Operational: group chips (All + each group with count, ⭐ for starred), collapsible group header rows with star and delete, "Ungrouped" section hidden when empty and other groups exist. Columns: Task, Type (inline select), Date (range + countdown), Responsible, Informed, Description (key points), Done (checkbox + delete).
- Prospects/Clients: Priority (prospects only, ⚑ colour), Company chip (opens client entry form), Description, Type (inline select), Touch Point (prospects only), Target Date (range + countdown: red "-nD" overdue, amber ≤3 days), Last Action Date with "(nD)" (green ≤5, amber ≤13, red after), Responsible, Description (key points), Done. Resizable column widths saved in localStorage `linkedTaskTableColWidths`. Column visibility per sub-tab (and per operational group filter) in `taskTableColumnVisibility`. Mandatory columns can't be hidden.
- Filters (linked only): Type, "Days since last action ≥". Sort: company, description, type, target date, last action (click cycles asc/desc). Prospects default: latest target date first, undated last.
- Empty text: "No tasks yet. Add your first one." / "No prospects follow-ups yet."
- Task form fields: Task* (textarea), Priority, Task type, Touch Point, Start date, End date, Last action date, Task group (only from Operational), Responsible (chips, datalist suggestions), Informed ("Name (note)" syntax), Key points. "Completed" checkbox on edit. Required check uses `alert()`. Delete in form has no confirmation; delete from the task row uses `confirm()`.
- Names offered = `KNOWN_NAMES` + every name used in tasks, minus "Full Team", sorted.
- Task group: add form ("New task group", duplicate/empty name errors), delete with `confirm()` that says how many tasks move to Ungrouped, star toggles order (starred first, then creation order).

**Gantt.** 36 px per day, range from earliest start −2 days to latest end +3 (min 7 days, 30 if none), today line, bar colour from first responsible person's hash colour, "No dates" ghost bar. Filter: All / each group / Ungrouped / Prospect Tasks / Client Tasks. Click bar → task form.

**Daily.** Default date: today if any task is active today, else the next upcoming start date, else today. Prev/next/date input/Today. Each item labelled Done / Single day / Starts / Ends / Ongoing; sorted by first responsible person.

**Assignee.** Select a person (defaults to the first name alphabetically). Two cards: Responsible ("Owns and drives the task") and Informed ("Kept in the loop", with the person's note). Count per card.

**Calendar.** Month grid (Sunday first, 6 weeks), today circle, selected day ring, up to 3 items per day + "+n more", right-hand day panel. "Tasks" source toggle starts **off**, "Google Calendar" starts **on**. Fetches events for the month ±7 days through `/api/calendar`; error text shown as an amber pill. Event times formatted en-US in the event's time zone (default Asia/Jakarta). All-day end dates converted from exclusive to inclusive. Events link to `htmlLink` in a new tab. Max 250 events.

**Flow.** Flow chips with hover ✕ (confirm), "+ New Flow" (name "New Flow", one step). Name and description edited in place; steps edited in place, every keystroke writes to Firestore. Roles reorder with ▲▼ (hover). One decision per flow; branches with tone good/bad, label, title, description, roles, "Loop to" a step (stored, not drawn). Removing a step/branch/role/decision has no confirmation.

**Client Pipeline.** Title "Client Pipeline", subtitle "Track prospects, follow-ups, and deals across all products". Sub-tabs: Prospects & Active, Clients & Partners, Raw List, Hold or Reject (with counts). Stat cards (computed on the current sub-tab, unfiltered): Total, High Priority, To Follow Up (status exactly "To Follow Up"), No Contact 14d+. Search box, status/product/priority selects (status and product options are values present in the data), "Columns" opens a right-hand column manager. Every cell is click-to-edit via an anchored popup (text, long text with Ctrl+Enter, date with Clear/Set, dropdown with add/rename/remove/colour). Row actions: "+ Journal"/"Journal ↗", 📋 follow-up task, ⇄ move, ✎ edit, 🗑 delete. Default sort `date` (newest last action first). Custom columns aren't sortable. "Since" shows "Today" / "nd ago" (amber >7, red >14). Target shows "⚠" overdue, amber ≤3 days. Esc closes everything. Toast after creating a follow-up task.
- Column config and dropdown options are in localStorage (`clients_col_config`, `clients_dp_options`), per device and browser.
- CSV filename `client-pipeline-<subtab>-<date>.csv`, visible columns, visible (filtered, sorted) rows.

**Prospect Journal.** Spreadsheet-like table: sticky "Prospect" column (name textarea, delete ×, "Saving…", "Client details ↗" or "Link to pipeline…" select), then 11 numbered columns. Opportunity Status select saves immediately; text cells save on blur if changed. Detailed Remarks expands in place ("Long-form notes", Collapse ↑). Rows sorted by `updatedAt` ascending (oldest edit first), so a row moves to the end every time it's edited. Search matches every field. From the pipeline, opening the journal creates `pipeline-<id>` if missing, switches screen and scrolls to the row. CSV `prospect-journal-<date>.csv`.

**Clients Historical.** Stat cards (Total clients, Heads counted, Heads not counted, Subsidiaries). Search, mobile-only sort select, Expand/Collapse all. Tree rows: chevron, name (click → rename popup), "not counted" label, sector chip (click → popup; "+ sector" if empty), Count checkbox, subs count, + add subsidiary, ✕ delete. Subsidiary rows: ⇄ move, ✕ delete. Right-hand "Companies per sector" card with bars and Unassigned, Total. Toast on write failure. CSV `clients-historical-<date>.csv`.

**Seeding.** `useTasks`, `useFlows` and `useClientPipeline` write seed data when their collection is empty (see §4).

## §3 Data model

**Firebase project `deus-team-tasks`** (`lib/firebase.ts`, rules in `firestore.rules`: open read/write):
- `tasks/{auto}`: `task`, `taskType?` (Our Action | Follow Up | Send Proposal/Quote | Contract/Paperwork | Finalize Scheduling | Trial Pending), `priority?` (High | Medium | Low), `touchPoint?`, `responsible: string[]`, `informed: {name, note?}[]`, `keyPoints`, `startDate`, `endDate` (yyyy-mm-dd, may be ""), `order` (number, Date.now() for new), `completed?`, `linkedClientId?` (number → pipeline id), `taskGroup?` (group **name**), `lastActionDate?`.
- `taskGroups/{auto}`: `name`, `order` (Date.now()), `starred`.
- `flows/{auto}`: `name`, `description`, `order`, `steps: {id, title, description, roles: {label, names[]}[]}[]`, `decision?: {label, branches: {id, label, tone: good|bad, title, description, roles, loopTo?}[]} | null`.

**Firebase project `deus-client-tracker`** (`lib/firebaseClients.ts`, rules not in this repo):
- `pipeline/{id as string}`: numeric `id` (max+1), `company`, `type?`, `date?` (last action), `status?`, `pic?`, `sourcing?`, `product?`, `priority?`, `industry?`, `notes?` (next actions), `target?`, `reach?` (planned reach out), `reason?`, `trial?`, `_raw?`, `_hold?`, plus custom `cx_<timestamp>` keys. Group = `_raw` → raw, `_hold` → hold, status "Client / Partner Done Deal" → done, else prospect.
- `prospectJournal/{id}`: `id`, `pipelineEntryId?`, `prospectName`, `updatedAt`, 11 string fields (`clientNeed` … `detailedRemarks`). `opportunityStatus` ∈ "", Very High, High, Medium, Moderately Low, Low.
- `historicalClients/{uuid}`: `id`, `name`, `parentId` (null = head), `sector` (heads only), `countHead`, `createdAt`.

**Device-local (localStorage):** `taskTableColumnVisibility`, `linkedTaskTableColWidths`, `clients_col_config`, `clients_dp_options` (status/type/priority option labels and colours, plus custom dropdown options).

**Server env (`.env.local`, Vercel):** `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_KEY`, `GOOGLE_CALENDAR_ID`.

## §4 Placeholders and half-built features to decide on

1. **Seed data on empty collections.** Tasks, flows and pipeline re-seed sample data whenever the collection is empty at load (the `seeded` flag is per session). Deleting everything brings the samples back on the next load. Keep, drop, or seed only on a fresh project?
2. **`KNOWN_NAMES` hard-coded team list** (also feeds the Assignee default). Replace with a managed people list, or derive names only from data?
3. **"Full Team"** is a pseudo-person in seed data, filtered out of name suggestions. Is "everyone" a real concept (W3)?
4. **Device-local settings.** Pipeline custom column definitions and dropdown options (including status colours and any renamed status) live per device, while the data they describe is shared. A teammate on another device won't see a custom column or its options. Should these become shared?
5. **Trial** field: a pipeline column with no field in the add/edit form (inline edit only). Keep as a field?
6. **Flow "Loop to"** is stored but not drawn, and a flow can have only one decision. Is that enough (M3)?
7. **Calendar starts with tasks hidden** and external events shown. Intended default?
8. **Static header subtitle** ("Handover & rollout plan") from the app's first use. Still meaningful?
9. **Clients & Partners "Add prospect"** creates a prospect, not a done deal (see §5.6).
10. **Prospect Journal "Opportunity Status"** is a likelihood rating, separate from the pipeline status. Keep both concepts?
11. **No sign-in, open Firestore rules.** Anyone with the URL can read and change all data. Out of scope for the redesign, or a need (restricted access)?

## §5 Bugs and unclear intent to decide on

1. **Editing a company in the full form wipes fields the form doesn't show.** `handleSaveModal` builds the entry from the form patch only (plus `trial`) and `setDoc` replaces the document: custom `cx_*` values are lost on every full edit. (`components/ClientsTab.tsx:342`)
2. **Moving a company between groups drops data.** The move form only carries fields the target group shows; e.g. prospect → hold loses PIC, status, dates, notes and custom fields; raw → hold loses priority, notes, reach.
3. **"+ Add task" on the Prospects or Clients task sub-tab creates an unlinked task**, which then appears under Operational, not where it was added.
4. **Company↔task date sync only runs from two places:** pipeline edits (`ClientsTab.persist`) and the task form opened from the Tasks screens. Editing a linked task from Gantt, Daily, Assignee or Calendar doesn't update the company. The pipeline → task sync also overwrites the task's start date with the target date.
5. **Status marked required (\*) in the company form but not enforced.**
6. **"Done deal" depends on the exact status label** "Client / Partner Done Deal". Renaming that option (allowed in the dropdown editor, propagated to rows) moves every client back to prospects and re-labels their tasks as prospect tasks. Same for "To Follow Up" in the stat card.
7. **Removing a dropdown option doesn't clear it from companies**; they keep a label that has no colour.
8. **Pipeline ids are `max + 1` on the client.** Two people adding at the same time can get the same id, and the second `setDoc` overwrites the first company.
9. **Journal rows remount on every remote save** (`key` includes `updatedAt`), so a teammate's save can discard what you're typing in the same row; and the row jumps to the end after each save because rows sort by `updatedAt` ascending.
10. **Task group delete** moves tasks to Ungrouped even if deleting the group failed. Groups are referenced by name; there's no rename, and two groups can't share a name.
11. **Deleting a task from the form has no confirmation**, while deleting from the row does.
12. **Day maths mixes UTC and local time** in the pipeline (`new Date("yyyy-mm-dd")` is UTC) vs tasks (local midnight), so "days since" can differ by one between the two areas.
13. **Assignee screen** starts on the first name alphabetically even if they have no tasks.
14. **Service worker** caches every same-origin GET after it's fetched, so stale pages/assets can be served offline; there's no offline data (Firestore uses the default memory cache).
15. **External calendar errors** are returned with HTTP 200 and shown as text; failures and "not configured" look the same apart from the wording.

## §6 Constraints

See the plan's project settings (Next.js 16 App Router, React 19, Tailwind 4, two Firebase projects, Google Calendar service account route, PWA, Vercel). Additional:
- Two Firestore projects must stay as they are (the client tracker was a separate app; its data model is mirrored 1:1).
- The calendar route's `GCalEvent` type is imported by the client component; keep the route contract (`timeMin`, `timeMax` → `{events, error?}`).
- CSV export needs the BOM and delayed `revokeObjectURL` for Safari/Excel.
- Viewport disables zoom (`maximumScale: 1`); decide in Step 6 whether to keep that (accessibility).

## §7 Details removed during leak reviews

Second leak review, 2026-10-19 (Sonnet 5.5 High, read only `inventory.md`). Each row is a detail that implied the current layout, order or wording, and was removed from the story. Agent C can use these later.

| Story | Removed from the story | Why it leaked |
|---|---|---|
| W2 | Field order (dates, priority, type, touch point, last action, key points) | Same order as the task form |
| W6 | "bring into sight … put away again" | Show/hide toggle with a count |
| W10 | "fold groups away" | Collapsible sections |
| W12 | "split into three kinds" | Three separate sections |
| W13 | "colour-coded by urgency"; one item per detail | Table columns and the colour treatment |
| W15 | "how much space each gets" | Resizable column widths |
| D1 | "laid out", "coloured by responsible person", "today marked" | Timeline bars, colour per person, marker |
| D5 | "step back or forward, pick any date, jump to today" | The exact control set |
| D6 | "see separately", "with counts" | Two separate lists with count labels |
| D7 | "month by month", "today highlighted" | Month grid with highlighted day |
| D8 | "a few items per day with 'and N more'" | Literal overflow label and day-cell pattern |
| B1 | Field order (company, contact, last action, status, products, type, priority, source, industry, next actions, target date) | Same order as the company form; regrouped by meaning |
| B2 | "kept apart", "a count for each group" | One section per group with count badges |
| U3 | "expand when writing, compact when scanning" | Expandable text area and shortened cell |
| U7 | "side by side" | Column-per-prospect comparison |
| R7 | "fold or unfold … one by one or all at once" | Expand/collapse tree |
| C2 | "set the width of any field" | Resizable column widths |

Kept on purpose: business rules and thresholds (3 days, 14 days, default sort orders), fixed note headings (U1), and the order of the job groups. The group order may still echo the current navigation order; Step 1b's guess-the-layout test will show whether it matters.

## §8 Guess-the-layout test results

_(Filled in Step 1b.)_

## §9 Decisions made in Step 2

_(Filled in Step 2.)_
