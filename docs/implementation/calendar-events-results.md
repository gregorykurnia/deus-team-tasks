# Calendar events implementation evidence

## C01 — Calendar fields and event mapping

2026-11-11. Baseline before C01: `a3abb09`.

Added separate task calendar mark/sync fields, calendar-only draft patches, and pure event mapping, validation,
IDs and keys in `lib/taskCalendar.ts`. Events stay confirmed for done/parked tasks, use each task's own dates,
and include parent/company context, Key points, an encoded task link and the private task ID. No I/O or UI added.

Decisions:
- `calendarEventId` returns `Promise<string>` using Web Crypto rather than Node-only hashing, keeping the shared module browser-safe without a new dependency; server callers must await it.
- `calendarKey` serializes the shared event body rather than maintaining a second field list; the link is relative because origin is deployment configuration, and unmarked tasks return `undefined`.
- Blank times normalize to an empty all-day mark rather than storing empty/undefined nested fields; marked tasks also require real, ordered dates, with errors keyed to the offending field.

Checks:
- PASS — `npx tsc --noEmit`.
- PASS — `npx eslint lib/types.ts lib/taskCalendar.ts features/task-sheet/draft.ts tests/unit/taskCalendar.test.ts tests/unit/taskDraft.test.ts`.
- PASS after isolated retry — `npm run test:unit -- --reporter=dot`: initially 1,052 passed / 1,053, with the unchanged `lib/taskPlan.test.ts` test “returns a plain error for non-JSON input” timing out at 5,000ms; its first isolated retry also timed out, a 20,000ms retry passed, and the final isolated retry with the normal timeout passed (1 passed, 234 skipped; 2.06s total).
- PASS — `npm run build` outside the sandbox (about 31s); the sandboxed attempt stayed at compilation for five minutes and was interrupted (exit 130) before this retry.
- PASS — reviewed the draft/save diff for sync-state overwrites, concurrent mark edits and nested undefined fields; no findings; `git diff --check` clean.

All new calendar/draft tests passed in the unit run: all-day/timed/multi-day mapping, date boundaries, field
validation, long/Unicode UTF-8 IDs, key sensitivity and sync-state isolation. No Firestore read/write code or
screen changed, so data tests, browser checks and screenshots were not needed. Full checks remain for R1a;
shared code changed, so they are worth running there.

## C02 — Server sync, fake calendar and route

2026-11-11. Baseline before C02: `5650d66`.

Added server-only `lib/calendarSync.ts`, guarded `lib/calendarFake.ts`, and `/api/calendar/sync` GET/POST.
Sync reads task/parent/company from the server, updates/inserts/restores one deterministic event, removes it for
unmarked or deleted tasks, and only writes server-owned sync fields. Calls for one task are serialized within
the server process; an in-flight task/context change gets one extra pass. Failures preserve task data and the
last synced key/link, returning a short per-ID error. The existing calendar read route is unchanged.

The fake keeps Google resources as JSON in `testCalendarEvents/<eventId>.event`, with a directly readable
`status`. Cancelled IDs stay reserved. Seed emulator `settings/test-calendar` with `{ fail: 503 }` to force
calendar failures; delete the control document to recover. Playwright and MCP smoke server environments now
enable the fake with the invented target `test-calendar`; no screens or app write hooks changed.

Decisions:
- Use `calendarSync.error`, correcting C02's `calendar.error` typo to match the settled design and C01 types; writing into the mark would mix task intent with server state.
- The fake uses a fixed local Firestore REST endpoint and emulator owner token instead of relaxing deployed Firestore rules; both emulator mode and `CALENDAR_FAKE=1` are required, and production with the fake flag reports off.
- Limit reconciliation to one extra pass rather than an unbounded retry loop; a task that changes again keeps an explicit retry error.

Checks:
- PASS — `npx tsc --noEmit`.
- PASS — `npx eslint lib/calendarSync.ts lib/calendarFake.ts lib/calendarSync.data.test.ts tests/unit/calendarSync.test.ts app/api/calendar/sync/route.ts playwright.config.ts scripts/mcp/smoke.mjs`.
- PASS — `npm run test:unit -- --reporter=dot`: 43 files, 1,064 tests; includes client safety matrix, mocked Google options/scope, and unchanged read-route regressions (29.71s).
- PASS — `npm run test:data`: 9 files, 193 tests, local emulator/fake only (70.97s); covers creation, moves, repeated/concurrent calls, unmark/re-mark/cancelled IDs, deletion, 404/410→409 recovery, preserved fields on failure/retry, invalid times, in-flight changes, freed subtasks, off mode and route validation/50-ID boundary.
- PASS — `npm run build` outside the sandbox; `/api/calendar/sync` builds as a dynamic route.
- PASS — own diff review for saved-data integrity, error isolation, retry races and production/fake separation; no findings; `git diff --check` clean.

No UI or browser flow changed, so no browser checks or screenshots were needed. No real Google or live
Firestore calls were made by tests. Shared server code changed, so a full check is worth running in R1a;
the full suite, a11y and compare remain assigned there. Only C02 is ticked; C03 was not started.

## C03 — The event follows the task

2026-11-11. Baseline before C03: `94225e7`.

Added nonblocking, deduplicated sync requests in groups of at most 50 IDs after marked task creation, event-content
edits, edit Undo, rollback and deletion. Freed marked subtasks keep their events with the parent context removed.
Partial writes sync the saved portion, including subtasks orphaned before a failed unlink batch. Company deletion
and rollback also sync tasks whose company context changes. Unmarked writes, status, parking and group moves
make no requests; request errors never fail or delay a task write. No calendar mark or sync-state ownership changed.

Files: `lib/calendarRequests.ts`, `lib/taskWrites.ts`, `lib/companyWrites.ts`, `features/task-sheet/TaskSheet.tsx`,
`features/tasks/TasksScreen.tsx`, `tests/unit/calendarWrites.test.ts`, `tests/unit/taskWrites.test.ts`,
`lib/calendarWrites.data.test.ts`, `docs/IMPLEMENTATION_PLAN.md` and this evidence file.

Decisions:
- Pass task snapshots to delete helpers rather than read marks from Firestore again; callers already have them, preserving ordinary writes without extra reads.
- Sync committed portions and orphaned subtasks after partial failures rather than wait for the whole bulk operation; saved changes must not leave stale events.
- Preserve direct creation-rollback cleanup rather than reuse the guarded public delete helper; cleanup must still be attempted if the connection dropped after creation.
- Give only the four-round-trip integration test a 20-second timeout rather than raise the suite default; its isolated cold-emulator run exceeded 5 seconds.

Checks:
- PASS — `npx tsc --noEmit`, including a rerun after the rollback correction; the final build also type-checked the timeout adjustment.
- PASS — `npx eslint` on all eight changed TypeScript/TSX files; repeated after the rollback correction.
- PASS after scoped retry — `npm run test:unit -- --reporter=dot`: 1,092/1,093 passed; unchanged `lib/taskPlan.test.ts` “returns a plain error for non-JSON input” hit `Test timed out in 5000ms`, then passed its isolated normal-timeout retry (1 passed, 234 skipped); final `npx vitest run --project unit tests/unit/calendarWrites.test.ts --reporter=dot`: 30/30 passed, including offline rollback cleanup and 120 deletes in exactly three requests.
- PASS after scoped retry — `npm run test:data`: 10 files, 197 tests, emulator/fake only; rollback rerun of `lib/calendarWrites.data.test.ts`: 3 passed, create/edit/Undo/delete hit `Test timed out in 5000ms`; after its timeout adjustment that test passed five consecutive isolated runs via `firebase emulators:exec --only firestore --project demo-deus` and `vitest run --project data lib/calendarWrites.data.test.ts -t 'creates, edits, undoes and deletes'`.
- PASS — `npm run build` outside the sandbox; all pages/routes compiled and generated successfully.
- PASS — own diff review for lost task writes, Undo/rollback mark restoration, request failures, partial deletes and server-owned sync fields; preserved unconditional rollback cleanup and added its regression test; no open findings; `git diff --check` clean.

No screen or user flow changed, so browser checks/screenshots were not run for this [no look] task; C05 owns the
browser flow. Tests never called real Google or live Firestore. Shared write code changed, so a full check is worth
running in R1a, where the full suite, a11y and compare remain assigned. Only C03 is newly ticked; C04 was not started.

## C04 — Task sheet: switch, times and calendar status

2026-11-11. Baseline before C04: `196b40b`.

Task details (full) now shows, right under the dates and only when `GET /api/calendar/sync` says enabled, the switch
"Put on the team calendar", then "Starts"/"Ends" time fields (new `TimeInput`, blank for all day) and, for a saved
marked task, a status line: green "On the team calendar" with the open-in-new-tab link, grey "Adding to the team
calendar…" while a sync request is in flight on this device (plus 2s for the server's write to arrive), or amber
"The team calendar isn't up to date." with Try again (key differs from `calendarSync.synced`, or `error` set).
Saving is refused with field errors while a marked task's dates or times can't make an event. D9's change is open
item N30 in `redesign/ui-implementation-plan.md` and need N30 in `redesign/handoff/needs.md`.

Files: `features/task-sheet/TaskSheet.tsx`, `TaskCalendar.tsx` (new), `TaskSheet.module.css`, `ui/Inputs.tsx`,
`lib/taskCalendar.ts` (`calendarStatus`), `lib/calendarRequests.ts` (in-flight store), `lib/useTaskCalendar.ts` (new),
`tests/unit/taskSheetCalendar.test.tsx` (new), `tests/smoke/calendar-events.spec.ts` (new).

Decisions:
- Date errors use the sheet's words ("Add a deadline to put this on the team calendar.") rather than C01's "end date", which the words table rules out; time errors keep C01's own messages.
- "Adding…" comes from this device's in-flight requests, not a guess from a key mismatch; a mismatch with nothing in flight is "isn't up to date", so offline edits and failures both show Try again.
- The open link is an icon button with the name "Open in the team calendar", as on Plan's event rows, rather than a text button that would repeat "team calendar" twice in one line.
- A company task's status waits for the companies to load, so a key built without the company never flashes amber.

Checks:
- PASS — `npx tsc --noEmit`; `npx eslint` on the 8 changed TS/TSX files.
- PASS — `npm run test:unit -- --reporter=dot`: 45 files, 1,115 tests (new: status states incl. subtask/company context, status line words/link, sheet error words, `TimeInput`, in-flight store).
- PASS — `npx playwright test tests/smoke/calendar-events.spec.ts tests/smoke/task-sheet.spec.ts --output=/tmp/c04-pw`: task-sheet 15/15 desktop and its phone test; calendar-events 5/5 (desktop + phone) after a route warm-up and a phone assertion fix (the switch sits under the whole date row, which is two plus one on phones).
- No Firestore read/write code changed, so `test:data` wasn't needed. Note: Playwright clears `test-results/` on start; run with `--output` elsewhere so the committed captures there survive.

Captures (`test-results/calendar-events/c04/`, 1440×900 `desktop/`, 390×844 `phone/`): `new-times`,
`new-times-error`, `new-end` (scrolled to the end: Key points sits whole above the footer), `status-stale`,
`status-adding`, `status-on`, and `block-*` (the switch, times and status line whole, with a 12px margin) for both
shapes; `desktop/off-before.png` (old sheet code) and `off-after.png` (writes off), both with the dev badge hidden: the sheet
(x ≥ 880) differs by 0 pixels; 155 pixels in the blurred side bar behind it differ by at most 1/255 (0 at `-fuzz 3%`),
which is blur rendering noise (`compare -metric AE` / `PAE`). Look check found the three status lines at different heights and a 32px-tall open link; both
fixed (48px line in every state, 40px link) and recaptured. A fresh-eyes check then read the sheet's scroll edges
(fields cut under the title and at the footer mid-scroll) and the dev server's "N" badge as faults: captures now hide
the badge (builds don't have it), `new-end` proves nothing is hidden behind the footer, and the block captures replace
the old crops.

## C05 — App flow on desktop and phone

2026-11-11. Initial completion: `ddf0c3d`; fresh-eyes review corrected the capture framing and added geometric/text checks. Application code and saved data did not change. The original C05 build remains valid; this follow-up changes only tests, documentation and pictures.

The spec proves subtask creation → all-day event → timed event/name edit → deadline edit and Undo → off/on → deletion, checking the fake event after every transition. A second flow forces a fake 503, retries through the sheet, then deletes the parent and proves the freed subtask keeps the same event without the parent description. Both run on desktop and phone; the row editor supplies the app's existing edit Undo. No test calls Google or production.

Decisions (the checker’s 01–04 images are copies of the original desktop failure/freed-task captures):
- DECISION: Anchor captures at the complete Touch point field and include the full sheet width instead of scrolling only the calendar block into view, so labels, status corners and action margins can be judged together.
- DECISION: not fixed the missing-space claims in 01, 02, 03 and 04, because every flagged phrase contains ordinary spaces and measured same-line gaps are at least 2px; the phone warning has one natural line wrap. No word-spacing override is justified by these pictures.
- DECISION: not fixed Save changes or the Close focus ring extending beyond field edges in 01, 02, 03 and 04, because the approved prototype intentionally has 24px body gutters versus 18px action gutters on desktop, and guide §4.1 specifies an external 2.5px focus ring with 2px offset. The cramped crop margin was fixed. Both approved looks are recorded in `docs/approved-looks.md`.
- DECISION: not fixed the absent header divider in 03, because the approved prototype has a plain fixed head above an independently scrolling body (guide §4.11). The misleading frame with unlabelled Task type/Priority controls was fixed by starting at a complete labelled section; the approved scroll behavior is recorded in `docs/approved-looks.md`.

Faults and corrections:
- The original warning extended 0.47px past the body’s scroll edge: the new minimum-12px clearance assertion failed before the framing change. Retakes now keep the whole status above that edge, with complete labels at the top and the action gutters inside the detail crop.
- The first spacing audit measured a hidden native dropdown option instead of the visible Add task type button; it then treated a natural wrapping space as zero-width missing text. Exclude option/screen-reader-only text and allow a line break only when adjacent glyphs actually occupy different lines; retain the 2px same-line threshold.
- One existing unit case (`lib/taskPlan.test.ts`, “returns a plain error for non-JSON input”) timed out at 5000ms during concurrent checks. It passed five isolated reruns after the browser stopped; no timeout or application code was changed.
- Original C05 test corrections (before `ddf0c3d`): enable the switch before selecting the required Start label, scope Deadline to its editor, exclude screen-reader-only labels from visual overflow checks, and await the parent description before Delete. Their evidence remains in that commit.

Original copies opened at full resolution, before judgment:
LOOKED: /tmp/autorun-fresh-lTBmEx/01-failure.png · White drawer over blurred Tasks; amber warning meets the footer boundary, with cramped lower corners; complete warning/retry words and buttons remain visible, action edges extend beyond fields.
LOOKED: /tmp/autorun-fresh-lTBmEx/02-failure-detail.png · Warning rests directly on the footer line; Save nearly reaches the crop edge, while its label and warning text remain whole; small word gaps are visible.
LOOKED: /tmp/autorun-fresh-lTBmEx/03-freed-task.png · Fixed title sits over unlabelled Task type/Priority controls whose labels scrolled above it; green status is whole, Key points continues under the footer boundary, actions remain in front.
LOOKED: /tmp/autorun-fresh-lTBmEx/04-freed-task-detail.png · Calendar and people fields sit over the footer; Key points continues past the scroll edge and Save nearly touches the crop’s right edge, with complete action text.

Retakes in `test-results/calendar-events/c05/`: 1440×900 desktop and 390×844 phone; each `-detail.png` is an unscaled crop at the full sheet width (540px/390px). All 16 retakes were opened at original size. Earlier fields intentionally scroll above the fixed head; the focused sheet sits in front of the blurred Tasks page.

LOOKED: desktop/all-day.png · Touch point starts with its whole label; blank times and green status sit above whole people/Key points fields, with a gap before the footer and readable actions.
LOOKED: desktop/all-day-detail.png · Switch, blank times, green status and full people/notes fields precede the footer; all four buttons have room inside the widened side edges.
LOOKED: desktop/timed.png · Whole labelled section above 09:30 AM/11:00 AM side-by-side fields; green status clears the people fields, and Key points ends above the footer.
LOOKED: desktop/timed-detail.png · Values and clock/clear icons fit both boxes; fields remain above the footer, and Save retains a visible right gutter.
LOOKED: desktop/failure.png · Complete Touch point label above dates and times; rounded amber warning sits well above the footer, with whole words and Try again; people and notes fields are whole.
LOOKED: desktop/failure-detail.png · Warning corners are clear of the footer, people/notes fields separate them; retry and all footer actions fit inside the full sheet-width crop.
LOOKED: desktop/freed-task.png · Whole labelled section above green status/open link; people and notes boxes end above the footer, with no unlabelled select or priority control under the head.
LOOKED: desktop/freed-task-detail.png · Green status and full people/notes fields sit above the footer; all action labels are whole and the wider crop retains their side margins.
LOOKED: phone/all-day.png · Whole Touch point label above wrapped chips, dates and stacked blank times; green status clears the two-row footer; Responsible continues at the scroll boundary.
LOOKED: phone/all-day-detail.png · Stacked fields and green status fit the full phone width; the Responsible box continues beyond the scroll edge, while three footer actions and Save remain whole in front.
LOOKED: phone/timed.png · 09:30 AM/11:00 AM stack below whole date labels; green status/link clears the footer, with Responsible continuing below the scrolling boundary.
LOOKED: phone/timed-detail.png · Native values/icons fit their stacked boxes; green status and complete footer labels fit the side edges, with the lower form continuing under the footer boundary.
LOOKED: phone/failure.png · Whole Touch point/date/time labels lead to a two-line warning beside Try again; amber corners are clear of the footer and all calendar/action words are readable.
LOOKED: phone/failure-detail.png · Warning wraps naturally inside amber beside the whole retry button; status clears the footer, whose complete actions sit in front of the lower form’s scroll boundary.
LOOKED: phone/freed-task.png · Green status/open link sits below stacked blank times; whole section labels remain above it, and the lower Responsible field continues past the footer boundary.
LOOKED: phone/freed-task-detail.png · Switch, times and green status fit the side edges; the lower form continues beyond the scrollport, with whole three-action and Save rows in front.

Checks:
- EXPECTED FAIL before the fix — desktop failure case with the new ≥12px status clearance check: received `-0.46875`; the retakes pass it.
- PASS — final `npx tsc --noEmit`; `npx eslint tests/smoke/calendar-events.spec.ts` (`types=0 lint=0`).
- RECOVERED — `npm run test:unit -- --reporter=dot`: 1,114 passed, one 5000ms timeout. `npx vitest run --project unit lib/taskPlan.test.ts -t 'returns a plain error for non-JSON input'` passed 5/5 isolated runs; all 1,115 cases have passing evidence.
- PASS — `npx playwright test tests/smoke/task-sheet.spec.ts --output=/tmp/c05-look-sheet-pw`: 16/16.
- PASS — C05 `--grep 'app calendar flow' --last-failed --output=/tmp/c05-look-pw` passed desktop lifecycle/recovery and phone lifecycle; after correcting the wrap measurement, `--project=phone --grep 'a calendar failure' --last-failed --output=/tmp/c05-look-pw` passed the remaining case. All four flows pass; same-line word gaps measure ≥2px and the phone warning has one natural wrap.
- PASS — 8 viewport PNGs at the exact required sizes plus 8 full-width unscaled crops; original-size look check, whole-label/visible-control/clearance audits, no console errors or sideways scroll; ports 3100 and 8180 free afterwards. No Firestore implementation changed, so `test:data` was not needed.

## M01 — MCP calendar choice per step and preview

2026-11-11. Added strict optional per-step calendar marks, validated with C01's time helper and copied into the
proposed task records. Mixed plans preview each step as Task only, Team calendar: all day, or Team calendar:
14:00–15:00. Calendar-marked previews and saves are refused before database access while writes are off,
including already-saved requests. Existing canonical signing covers the new field without changing old hashes
or token verification. Chat guidance asks dates and calendar choice in the same question per step; walkthrough
examples cover task only, timed and all day. Calendar event creation/retry remains M02.

Decision: add optional `calendarPreview` lines only to plans containing a calendar step, rather than expanding
every task-only response; this preserves existing task-only previews and identifies every choice in mixed plans.

Checks:
- PASS — `npx tsc --noEmit`; corrected an initially missing test-fixture type annotation before the final passing run.
- PASS — `npx eslint lib/taskPlan.ts lib/taskPlanServer.ts lib/taskPlanTools.ts lib/taskPlan.test.ts lib/taskPlanToken.test.ts lib/taskPlanServer.data.test.ts tests/unit/taskPlanTools.test.ts`; the only later TypeScript edit was re-linted separately.
- RECOVERED — focused unit run: 418/419 passed, existing non-JSON-input test timed out at 5000ms; required `npm run test:unit` then passed all 1,152 tests in 45 files, including that test and 37 new cases (strict times, previews/off gate, four frozen old fingerprints, a pre-change token, calendar-only token changes, tool schemas/legacy compatibility and guidance).
- PASS — `JAVA_TOOL_OPTIONS=-Xmx2g npm run test:data`: 200 tests in 10 files; three new emulator cases prove preview is read-only, saved marks read back, saved-plan previews retain choices, and off requests perform no database calls. No Google calls or production data.
- PASS — `npm run build` outside the sandbox; the first sandbox build stalled before compilation and was stopped by its exact PID/children (exit 143), then the unchanged build passed with process permissions.
- PASS — diff review and `git diff --check`: calendar marks stay separate from notes and server sync state; task-only behavior, destination preservation and legacy routes remain intact. Connector-only [no look]: no browser or screenshot checks; full shared-code checks remain scheduled for R1a.

## M02 — MCP save puts steps on the calendar

2026-11-11. Baseline: `29c1b9e`. Calendar marks already enter the existing task transaction (M01). After commit,
the save now syncs marked steps directly in batches of at most ten, returning ordered per-step `added` results
with links or `failed` results with short errors. Calendar failures keep every saved task. Task-only steps omit
`calendar`, and plans without calendar requests keep their original response shape. The MCP passes its public
origin for event links and tells chat to report each result and retry the unchanged save after failures.

Repeated saves reuse the current task/parent/company key reader from calendar sync. They retry only marked
steps with a changed key or error, preserve later edits, and never restore a calendar mark removed in the app.
Preview remains read-only. The emulator fake can fail one event ID to prove partial success and selective retry;
the smoke dev server explicitly receives both fake-calendar environment variables.

Files: `lib/taskPlanServer.ts`, `lib/taskPlanTools.ts`, `lib/calendarSync.ts`, `lib/calendarFake.ts`,
`lib/taskPlanServer.data.test.ts`, `tests/unit/taskPlanTools.test.ts`, `scripts/mcp/protocol-smoke.mjs`,
`scripts/mcp/smoke.mjs`, `docs/IMPLEMENTATION_PLAN.md`, and this evidence file.

DECISION: Add optional ordered subtask results only to calendar plans, rather than expand every save response, to preserve task-only clients.
DECISION: Check current saved marks, event keys and errors, rather than replay the original preview, to preserve later edits and retry failures with unchanged keys.
DECISION: Target fake failures by event ID, rather than fail the whole calendar, to prove mixed success and retries that skip successful steps.

Checks:
- PASS — `npx tsc --noEmit` and ESLint on all eight changed source/test/script files; corrected a test-only provenance type error and unused test bindings before these final clean runs.
- RECOVERED — `npm run test:unit`: 1,152 passed, one existing non-JSON-input test timed out at 5000ms (also recorded in M01). Reran only that case with `npx vitest run --project unit lib/taskPlan.test.ts -t 'returns a plain error for non-JSON input'`: 1 passed, 256 skipped.
- PASS — `JAVA_TOOL_OPTIONS=-Xmx2g npm run test:data`: 207 tests in 10 files, including seven new M02 cases for exact timed/all-day events, partial failure/retry, changed step/parent/company content, removed marks, same-key errors and ten-step concurrency. Local Firestore emulator and fake calendar only; Google clients are forbidden in the task-plan data tests.
- PASS — `JAVA_TOOL_OPTIONS=-Xmx2g npm run mcp:smoke -- --only=protocol`: mixed calendar save/failure/retry cases and legacy follow-up cases; 115 database-preservation comparisons. The harness stopped its own servers.
- PASS — `npm run build` with process permissions; no production app server or production-data tests ran.
- PASS — saved-data diff review and `git diff --check`: no blocking findings; post-commit failures stay per step, task details and signing remain intact, and retries skip current events. Connector-only [no look]: no screen/browser checks. A full shared-code check is worth running and remains assigned to R1a; only M02 is ticked, and E1 was not started.

## E1 — End to end

2026-11-11. Baseline: `53de640`. Added `checkTaskPlanCalendarUI` to `scripts/mcp/task-plan-ui.mjs`, selected by
`npm run mcp:smoke -- --only=task-plan-calendar` in `scripts/mcp/smoke.mjs` (also included in `all`/`browser`).
The existing smoke server already sets `CALENDAR_FAKE=1` and the invented `GOOGLE_EVENTS_CALENDAR_ID=test-calendar`.
Application code, screens and saved-data shapes are unchanged; this is a desktop cross-boundary check [no look].

The case previews a mixed internal plan without writing, saves one timed calendar step and one task-only step,
then opens the returned main-task link and follows its subtask link. It checks the exact initial event and per-step
MCP results, edits the marked step's date/time in its sheet, and reloads the saved values/status. It switches the
plain step on as a multi-day all-day event, then deletes both steps and their main task using the app's confirmations.
After every transition the entire fake event set is checked, including stable IDs, exact dates/times, descriptions,
links, no invites and no duplicates. It ends with zero tasks and zero active events, plus two cancelled event records.
Browser console/page errors and requests outside the local app/emulator are failures; calendar reads are fulfilled locally.

DECISION: Count an empty calendar as zero active events, retaining cancelled IDs instead of clearing fake records, because the fake mirrors Google's reserved deleted IDs.
DECISION: Assert the app sync route's canonical localhost links separately from MCP's 127.0.0.1 links, rather than changing application origins for a local test.

Requirement evidence (test names refer to the passing suites below; C05 also records the existing phone captures):

| Requirement | Test or results line |
|---|---|
| K1 | E1 `checkTaskPlanCalendarUI`: timed MCP step edited in its sheet, plain subtask switched to all day with an exclusive end date. `calendar-events.spec.ts` covers both task and subtask controls. |
| K2 | E1 checks the same event ID after date/time edits and each deletion. `calendarWrites.data.test.ts`: "creates, edits, undoes and deletes a marked task without a manual sync call", "keeps the marked subtask's event when its unmarked parent is deleted, removing parent context", and the two rollback cases. |
| K3 | `calendar-events.spec.ts`: "a calendar failure keeps the task; Try again recovers; deleting its main task keeps its event". `calendarWrites.test.ts`: "a %s request never fails or holds up a saved task" covers rejected/offline fetches; `task-sheet.spec.ts`: "A3: with no connection, adding is refused and the sheet keeps what was typed". |
| K4 | E1 asserts the exact per-step timed/task-only preview and verifies preview leaves both tasks and events empty. `taskPlanServer.data.test.ts`: "returns calendar choices and a bound token without writing, including on a saved-plan preview" also covers all day. |
| K5 | E1 asserts per-step `added`/task-only results and the exact event after MCP save. `taskPlanServer.data.test.ts`: "keeps a mixed plan saved on one failure and the identical retry touches only the failed calendar step" proves failure, task retention and duplicate-free selective retry. |
| K6 | `calendarSync.test.ts` "selects safely" matrix includes an unset target and production/fake combinations; `taskPlanServer.data.test.ts`: "refuses calendar plans before any database call when writes are off (already saved: %s)". `calendar-events.spec.ts`: "with calendar writes off, the switch isn't there and task details look as before"; `calendar.test.ts` covers the unchanged read route. |
| K7 | E1 asserts the fixed local origin/emulator before fixtures, intercepts calendar reads, and rejects external browser requests. The harness runs only Next dev with both fake flags and owns/stops its servers; the unit safety matrix proves the fake is unavailable in production and emulator mode without the fake cannot write. Data tests use only the local emulator/fake. |

Checks:
- PASS — `npx tsc --noEmit`, `npx eslint scripts/mcp/smoke.mjs scripts/mcp/task-plan-ui.mjs`, and `git diff --check`; test-only diff review found no application/data changes.
- PASS — `npm run test:unit`: 1,153 tests in 45 files.
- PASS — `JAVA_TOOL_OPTIONS=-Xmx2g npm run test:data`: 207 tests in 10 files.
- RECOVERED/PASS — `JAVA_TOOL_OPTIONS=-Xmx2g npm run mcp:smoke -- --only=task-plan-calendar`: the complete lifecycle passed with zero active fake events and owned servers stopped. Initial test assertions failed on the exact "Starts" label (its label includes "blank for all day") and on the dev route's localhost origin; corrected those expectations and reran only this selector. No application fix was needed.
- PASS — `JAVA_TOOL_OPTIONS=-Xmx2g npx playwright test tests/smoke/calendar-events.spec.ts tests/smoke/task-sheet.spec.ts --output=/tmp/e1-page-pw`: 25 tests (20 desktop, 5 phone), 4.7 minutes. No screens changed; no new look review was required.
- PASS — `npm run build` with process permissions; compiled/generated successfully without starting a production server. Only E1 is ticked; the full suite, a11y, compare and phase review remain assigned to the following rows.

## R1a — Full check run

2026-11-11. Ran each slow check once, sequentially, with no application or test fixes. Only R1a is ticked;
R1b and R1 are unstarted.

### Failure list, by app area

**None.** The full suite has no failed cases, the accessibility report has no violations or state/setup errors,
and the scoped comparison has no failed captures or recorded page/recipe errors. There are no failing
spec/case/first-error-line entries to route to R1b.

### Checks

- PASS — `npm run test:smoke`: 406 cases, 397 passed, 9 skipped, 0 failed, 37.4 minutes; desktop, tagged phone and Jakarta projects, no retries.
- PASS — `npm run a11y`: 284 state/viewport runs, 0 failed, 0 states with setup errors, 0 violations, 0 rules hit; full default distinct-state scope.
- COMPLETED — `npm run compare -- --only 'task-details|^156-' --force`: 22 captures, 0 failed, 0 skipped, 0 states with page/recipe errors; text differences remain in all 22 reports (see scope below).
- PASS — `npx tsc --noEmit`: exit 0.
- PASS — `npm run test:unit`: 1,153 tests in 45 files, 18.41 seconds.
- PASS — `git diff --check`; only this evidence and R1a's Done cell changed; test ports 3100, 8180 and 4100 have no listeners.

No source files changed, so changed-file ESLint and Firestore data-test checks are not applicable. Playwright's
regenerated/deleted tracked `test-results/` artifacts were restored after saving the run log.

### Comparison scope and limits

Both desktop (1440 × 900) and phone (390 × 844): `059-task-details-quick`, `060-task-details-all-details`,
`061-task-details-open`, `062-task-details-company`, `063-task-details-internal`, `064-task-details-finished`,
`065-task-details-stress`, `066-task-details-suggestions`, `067-task-details-new-name`,
`068-task-details-confirm`, and `156-company-record-task-then-open-company`.

The comparison tool writes captures and word differences, without a pixel-match or text-equality assertion.
All 22 scoped reports contain prototype-only and app-only words, capped by the tool at 40 per side; these
include the background list and branding, not just the sheet. This is a completed capture run, not a claim
that the prototype and app match. No visual verdict was made, as required by `[no look]`; C05 holds the
calendar-control look evidence, and the phase review remains R1.

Safety: all browser servers used `next dev` and the local Firestore emulator. The full suite used its fake
calendar; a11y and compare ran with `CALENDAR_FAKE` and `GOOGLE_EVENTS_CALENDAR_ID` unset in their process
environment, so emulator-mode calendar writes were disabled. No production server was started.

Evidence: logs and exit codes are in `/tmp/deus-r1a-20261111/{smoke,a11y,compare,typecheck,unit}.{log,exit}`;
the scoped comparison JSON is `/tmp/deus-r1a-20261111/compare-scoped.json`. Raw reports are
`redesign/a11y/report.json` and `redesign/compare/report.json`; scoped images are in
`redesign/compare/{proto,new,both}/` under the state IDs above (generated evidence is git-ignored).

DECISION: Refresh only the 11 scoped task-sheet states with `--force`, rather than reuse cached captures, so this run measures the current checkout.

## R1b — Fix recorded failures

2026-11-11. R1a recorded no failures, confirmed against its saved exit codes, smoke log and raw reports.
No application or test changes were needed. Only R1b is newly ticked; R1 remains unstarted.

DECISION: Close the empty repair list without unrelated fixes or slow reruns. The comparison tool's word differences are descriptive output, not failed assertions; broader review remains assigned to R1.

Checks:

- PASS — saved R1a evidence: all five exit codes are 0; smoke log ends with 397 passed / 9 skipped; a11y has 284 runs, 0 failures, setup errors or violations; scoped compare has 22 captures, 0 failures or setup errors. Its 22 word-difference entries remain explicitly qualified by R1a's comparison limits above.
- PASS — `npx tsc --noEmit`: exit 0.
- PASS — `npm run test:unit -- --reporter=dot`: 45 files, 1,153 tests, 18.73 seconds.
- PASS — original-size inspection of the four existing C05 failure-state images below: no additional visual fault found. No screens changed, so captures were reused rather than regenerated; this is not a fresh browser run.
- PASS — `git diff --check`; only the results file and R1b's Done cell changed.

No changed source files require ESLint, data tests, a build or browser reruns. No failing case needs a regression test or a fix row.

Existing captures under `test-results/calendar-events/c05/`, opened with `detail: "original"`:

LOOKED: desktop/failure.png · Drawer rests above the blurred Tasks page; fields end above the fixed footer, no side edge cuts a control, amber warning and retry are unobstructed, all foreground text is whole.
LOOKED: desktop/failure-detail.png · Calendar fields sit above the amber warning and people/notes fields; complete actions rest below the divider with side gutters, crop starts at the switch, no text is clipped or covered.
LOOKED: phone/failure.png · Sheet sits in front of the blurred page; stacked times and wrapped warning clear the fixed two-row footer, Responsible continues below the scroll edge, retry and all action text are whole.
LOOKED: phone/failure-detail.png · Warning rests above the partial Responsible field; fixed actions cover the continuing scroll area, full-width Save has side margins, the intentional crop starts at the switch and all visible labels are readable.

## R1 — Phase review

2026-11-11, Opus 5.5 High. Read `git diff a3abb09..HEAD` (code and tests first), then this brief and the results above.

### Hunt list

| What was hunted | Verdict |
|---|---|
| Duplicate events | None possible: the event ID comes from the task ID; insert after 404/410, update after 409. Repeat and retry calls stay one event (C02, M02 data tests). |
| Orphaned event after a switch-off whose sync failed or never reached the server | **Fixed here.** The task kept `calendarSync` but no mark, and the sheet showed nothing, so the event stayed with no way to see or retry it. `calendarStatus` now calls such a task stale, and the sheet shows the amber line with Try again (which removes the event and clears `calendarSync`). Test: `taskSheetCalendar.test.tsx` "isn't up to date when a switched-off task's event may still be there". |
| Orphaned event after a delete whose request the browser drops (tab closed at once) | **Fixed here.** The sync request now uses `keepalive` (bodies under 60 KB). Test: `calendarWrites.test.ts` "asks the browser to finish the request…". |
| Orphaned event after a delete whose Google call fails | **Stands.** The task is gone, so nothing in the app can show it or retry it; the brief settles "no background retry queue". Follow-up below. |
| Stale description after renaming a main task (marked subtasks) or a company (marked company tasks) | **Fixed in R1.F1.** Successful renames, Undo and rollback request sync for marked dependents, including done and parked tasks. Mocked-fetch tests and emulator/fake data tests prove the descriptions and synced keys follow the names. |
| A server `calendarSync` write shown as a colleague's change | **Fixed here.** `useLiveQuery` tagged it "Just changed" for 30 s after every own save of a marked task. `requestCalendarSync` now calls `expectOwnWrite("tasks", id)`. Test: `calendarWrites.test.ts` "counts the server's calendarSync write as this device's own change". |
| A task write blocked or lost by a sync | None: every request is fire-and-forget after the commit, wrapped against throws (C03 tests for pending, HTTP error, rejected and throwing fetch). |
| A sync write recreating a removed mark or touching `calendar` | None: only `calendarSync.*` field paths via `updateDoc` (which can't create a deleted task); a mark removed mid-sync is caught by the re-read pass, which deletes the event and clears `calendarSync`. |
| Sheet save wiping `calendarSync` | None: the draft excludes it; Undo and rollbacks restore only the patched keys. |
| Fake calendar reachable in production | No: `USE_EMULATOR` is false whenever `NODE_ENV` is production, and `CALENDAR_FAKE=1` outside the emulator turns writes off (`calendarSync.test.ts`). |
| Owner's address committed | No: only `test-calendar` and `fake@example.test` in tests and smoke env. |
| Legacy follow-up tools changed | No: `lib/followup*` untouched; schema test checks legacy tools unchanged. |
| Guidance letting Claude guess times or dates | No: step 4 says "Never guess times" next to the existing "Never guess dates", asks all day or exact HH:MM times in the same per-step question. |
| Two server instances syncing one task at once | Stands: per-process queue plus the re-read pass converge in practice; a fully interleaved race could leave one stale event, which the sheet then shows as not up to date. |
| Amber line flashing during a save | Stands (minor): the live snapshot arrives before the request starts, for the length of the save; the sheet closes on save. |

### Checks after the fixes

- PASS — `npx tsc --noEmit`; `npx eslint` on the five changed files.
- PASS — `npm run test:unit`: 45 files, 1,156 tests (3 new, each seen failing first).
- PASS — `npm run test:data`: 10 files, 207 tests.
- PASS — `npx playwright test tests/smoke/calendar-events.spec.ts`: 9 passed (2.4 min). Its run rewrites `test-results/`, so the committed C04/C05 captures were restored from git.

### R1.F1 — Renames refresh dependent events

2026-11-11. `calendarContextRequests.ts` reads tasks by `parentId` or `linkedClientId` after a successful rename
and requests sync only for records with a calendar mark. `taskWrites.ts` and `companyWrites.ts` cover direct
updates, sheet/cell saves, Undo and rollback. Neither the lookup nor the sync delays or fails the saved rename;
dependent task dates and other task fields are never written by the lookup. Only R1.F1 is newly ticked.

DECISION: Use a background, server-backed query for the renamed record's dependents rather than pass live task lists through UI callers, so all write entry points refresh the current marked records, including done and parked tasks.

Checks:

- PASS — regression first: 7 new rename/lookup cases failed before the fix (missing dependent lookups/requests); all 40 mocked-fetch calendar-write tests pass after it.
- PASS — `npx tsc --noEmit` and `npx eslint lib/calendarContextRequests.ts lib/taskWrites.ts lib/companyWrites.ts tests/unit/calendarWrites.test.ts lib/calendarWrites.data.test.ts`.
- PASS — `npm run test:unit -- --reporter=dot`: 45 files, 1,164 tests (8 new); includes marked-only selection, unchanged names, Undo/rollback and pending/rejected/throwing lookups.
- PASS — `JAVA_TOOL_OPTIONS=-Xmx2g npm run test:data`: 10 files, 210 tests (3 new); both parent-write entry points update a subtask's fake-event description and `calendarSync.synced`, plain subtasks stay unmarked, and company rename/Undo preserve dates.
- PASS — `npm run build` with process permissions; compiled/generated successfully, without starting a production server.
- PASS — own diff review and `git diff --check`: no confirmed findings; queries start only after successful writes, contain their failures, and request only marked dependents.

No browser or look checks: no screen or user flow changed; this row's rename coverage uses mocked fetch and the
Firestore emulator/fake calendar. No Google or production data was used. A full check is worth running for the
shared `lib/` changes; it was not requested for this task. Logs: `/tmp/r1-f1-{unit-before,unit-after,types,lint,unit,data,build}.log`.

### Owner handoff

**Proven on the emulator and the fake calendar:** a task or subtask goes on the calendar all day or with times from its
sheet; edits, parent/company renames, an edit's Undo, rollbacks, switch-off and deletes update or remove the event; a main task's delete keeps its
freed subtask's event; a failure keeps the task and shows Try again; chat steps are task only or task plus event, shown in
the preview; a chat save adds the events, reports failures per step, and a repeated save retries only those; nothing
shows or writes while `GOOGLE_EVENTS_CALENDAR_ID` is unset (R1a: full suite, a11y and compare green).

**Proven only on the fake, so O3 checks them for real:** that Google accepts the derived event IDs; that updating a
deleted (cancelled) event brings it back, and re-inserting its ID answers 409; that timed events land at the right
Jakarta time; that the service account can write to your calendar once shared; that the "Open in the team calendar"
link opens the event.

**Your steps, in the plan's order:**
1. O1 — in Google Calendar, share your calendar with the service account's email (Vercel's `GOOGLE_SERVICE_ACCOUNT_EMAIL`), with **Make changes to events**.
2. O2 — in Vercel Production, set `GOOGLE_EVENTS_CALENDAR_ID` to your Gmail address and redeploy (remove it and redeploy to roll back; events already made stay).
3. O3 — live check: put one task on the calendar with a time from the app, save one chat plan with one calendar step and one task-only step, then move one and delete one, and check your calendar follows.

**Follow-ups (not built):** invites; per-person calendars; a calendar mark on task rows; hiding app-made events from
the Plan and Today event rows (they show as a task and an event); two-way sync; calendar options in the legacy
follow-up tools and the deal skill; a cleanup for an event left behind when a deleted task's removal fails at Google.
