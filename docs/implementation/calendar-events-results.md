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

2026-11-11. Added browser coverage in `tests/smoke/calendar-events.spec.ts`; no application code changed.
The flow starts at a main task's Subtasks section, creates and opens a subtask, puts it on the calendar all day,
adds Jakarta times and changes its name, changes its deadline through the row editor and uses that edit's Undo,
switches the calendar off/on, then deletes the marked task. Each transition checks the fake event, including its
stable ID, exclusive all-day end, cancellation, parent description and absence of attendees. A separate flow forces
a fake 503, proves the saved task survives, retries through the sheet, then deletes the main task and proves the
freed subtask retains the same event without the main task's name. Both cases run on desktop and phone (`@phone`).

Decisions:
- Use the row's deadline editor for edit Undo rather than adding Undo to sheet saves: this is the app's existing Undo flow.
- Inspect the emulator's serialized fake event rather than mocking the sync response: this proves browser → task write → sync route → event.
- Keep full viewport captures and original-size calendar/footer crops rather than resizing: the crops expose text ends and footer boundaries.

Faults and corrections:
- First lifecycle run timed out at `getByLabel('Start', { exact: true })`: an unmarked task's label includes "optional". Enable the calendar switch before filling the required dates.
- Next run failed strict matching because both the date dialog and input are labelled "Deadline". Scope the input and Save button to that dialog.
- Two tool sessions ended with exit 143 before completing their specs. Stop only their test-port owner PIDs; complete the affected checks in a detached process with persisted exit codes.
- The phone audit initially reported `clipped: Description`: that is the deliberately one-pixel `.sr-only` label, not visible text. Exclude screen-reader-only labels from the visual audit and require actual centre-point hits for visible controls.
- A phone retry caught a navigation race in the test: Delete was pressed on the child before the parent sheet rendered. Wait for the parent description before pressing Delete; repeat only that phone case five times.
- Picture hunt: calendar labels, native time values, status words, retry/link targets and footer buttons have no clipped text or overlap. The fixed sheet header/footer intentionally bound a scrolling form; some surrounding fields continue outside that scrollport. No product layout repair was indicated.

Captures: `test-results/calendar-events/c05/{desktop,phone}/`, 1440×900 and 390×844. Each `-detail.png` is an
unscaled crop from the same state, spanning the calendar block to the footer; it was also opened at original size.

LOOKED: desktop/all-day.png · White drawer over blurred Tasks; blank time fields sit above the green status and fixed footer, no calendar text cut off or covered; earlier form fields are scrolled above the head.
LOOKED: desktop/all-day-detail.png · Switch, two blank fields and green status rest above the footer's four buttons; crop edges spare every calendar word and button.
LOOKED: desktop/timed.png · 09:30 AM and 11:00 AM sit side by side in whole inputs above green status; the footer stays in front of the scrolling form, all calendar and action text readable.
LOOKED: desktop/timed-detail.png · Time values, clock/clear icons, green status and open link fit their boxes; four footer buttons sit below with no cover or clipping.
LOOKED: desktop/failure.png · Amber status sits below blank time fields and above the footer; Try again is wholly inside it, drawer edges clear, background deliberately blurred.
LOOKED: desktop/failure-detail.png · Alert icon and complete warning precede the retry button; the footer rests directly below the status, with no overlapping text or buttons.
LOOKED: desktop/freed-task.png · Calendar fields and green status sit above Responsible/Informed; the footer covers the scrollport boundary at Key points, while calendar words and actions remain whole.
LOOKED: desktop/freed-task-detail.png · Green status and open link clear the people fields; Key points continues beyond the scroll edge above the fixed footer, calendar and button text intact.
LOOKED: phone/all-day.png · Bottom sheet spans the phone; dates sit above the switch, blank time fields stack above green status; footer has three actions above full-width Save changes, Informed continues past the scroll edge.
LOOKED: phone/all-day-detail.png · Stacked blank times and green status fit between side edges; people fields continue toward the footer, whose Save row stays separate and fully readable.
LOOKED: phone/timed.png · 09:30 AM and 11:00 AM stack in complete fields, status/link below; fixed two-row footer is clear, only the lower Informed field meets the scrolling boundary.
LOOKED: phone/timed-detail.png · Native time icons and values fit inside the two stacked boxes; status and footer labels are whole, with the footer in front of the form's scrolling edge.
LOOKED: phone/failure.png · Amber warning wraps into two whole lines beside Try again, above the people fields; stacked times and two-row footer stay inside the phone, Informed continues at the scroll edge.
LOOKED: phone/failure-detail.png · Warning icon, wrapped words and retry button occupy the same amber strip without overlap; footer buttons and full-width Save changes remain whole below the scrolling form.
LOOKED: phone/freed-task.png · White bottom sheet over blurred Tasks; stacked blank times sit above green status/open link, then people fields; only Informed continues past the footer's scrolling boundary, calendar and action text complete.
LOOKED: phone/freed-task-detail.png · Switch, stacked times and green status fit the crop's edges; the footer sits in front of the form's scroll edge with three complete actions above Save changes.

Checks:
- PASS — `npx tsc --noEmit`; `npx eslint tests/smoke/calendar-events.spec.ts` after the final test fix (`types=0 lint=0`).
- PASS — `npm run test:unit -- --reporter=dot`: 45 files, 1,115 tests.
- PASS — `npm run build` (compiled, type-checked and generated routes; exit 0).
- PASS — `npx playwright test tests/smoke/task-sheet.spec.ts --output=/tmp/c05-sheet-pw`: 16/16, including phone.
- PASS — all 9 distinct calendar browser cases across scoped runs: initial desktop C04 cases plus failure/recovery; phone C04 cases (`--project=phone --grep-invert 'subtask all day'`); final `--grep 'app calendar flow'` passed 3/4 before the parent-navigation race fix, followed by `--project=phone --grep 'a calendar failure' --repeat-each=5 --output=/tmp/c05-retry-pw` passing 5/5. Both lifecycle cases and both failure/recovery/freeing cases now pass. Tests use only the emulator and fake calendar; no application data implementation changed, so `test:data` was not needed.
- PASS — 8 viewport PNGs at the exact required sizes and 8 unscaled detail crops, all opened at original size; visible-text/covered-control audit, no console errors or sideways scroll; ports 3100 and 8180 free after the checks.
