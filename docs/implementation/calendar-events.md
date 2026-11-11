# Build brief: tasks that also go on the calendar

This brief holds the details for `docs/IMPLEMENTATION_PLAN.md`. Only that plan holds progress ticks. Every default
below is settled for an unattended run, so no task stops to ask.

## What the owner asked, and the smallest design

> "In some of the events figure out which to put on GCal as well as say a meeting time … like in some subtasks etc
> wanna put option of putting that as a created GCal event. And in the MCP when there's the sub events and events
> from claude chat we can have option to put certain ones into GCal integrated vs ones that live just as tasks."

Owner answers, 2026-11-11: events go on the owner's own Gmail calendar for now; no invites; build the control from
existing design-guide parts (no studio round); the event follows the task when it changes in the app.

**Smallest design:** any task or subtask can carry an optional `calendar` mark, with optional start and end times.
One server function, `syncTaskCalendar(taskId)`, makes the calendar match the task: a marked task gets an event and
an unmarked or deleted task loses it. The app calls it after its own writes, and the MCP save calls it after its
transaction. Changes made in Google never come back to the app.

Settled defaults, each with the risk it closes:
- **Target calendar:** the new server variable `GOOGLE_EVENTS_CALENDAR_ID`, written to with the existing service
  account (`GOOGLE_SERVICE_ACCOUNT_EMAIL`/`_KEY`) and the scope `https://www.googleapis.com/auth/calendar.events`.
  The read route keeps `GOOGLE_CALENDAR_ID` and its read-only scope. With the variable unset the feature is off
  everywhere: the switch is hidden and MCP calendar steps are refused. That variable is the only activation
  switch, so every push is safe to deploy. Never write the owner's address into the repo.
- **Event ID from the task ID** (`dt` + the SHA-256 hex of the task ID, 66 characters; Google allows `a–v`, `0–9`,
  5–1024 long): repeats and retries can't make duplicates. Risk closed: double events after a lost response.
- **`extendedProperties.private.deusTaskId`** on each event, so an event can be traced back to its task.
- **No invites, no attendees, default reminders.** Title is the task name. The description holds the main task's
  name (for a subtask), the company (if any), the Key points and a link to `/tasks?task=<id>` on the app's origin.
- **Times:** none means an all-day event from `startDate` to `endDate` (Google's end date is exclusive: +1 day).
  With times, the event runs from `startDate startTime` to `endDate endTime` in `Asia/Jakarta`. Both times or
  neither, `HH:MM` 24-hour, and the end must come after the start.
- **Done and parked** don't touch the event. Editing the name, dates or times moves it, and so does an edit's Undo
  or rollback (it is a write like any other). Switching it off or deleting the task removes it. Deleting a main task
  frees its subtasks (they stay as tasks, `lib/taskWrites.ts` `deleteTask`), so a freed subtask keeps its event,
  re-synced because its description loses the main task's name. Deletes have no Undo in this app; don't add one.
- **The mark and the sync state are separate fields.** The mark is `calendar: { startTime?, endTime? }`, written
  by the app and the MCP save; its presence means "on the calendar". The state is `calendarSync: { synced, link,
  error }`, written only by the server: `synced` is the key of what is on the calendar, `link` the event's
  `htmlLink`, `error` a short line. The unmarked path clears `calendarSync` with `deleteField()`. Risk closed: a
  server write recreating a removed mark, or a sheet save wiping the sync state. When the task's key differs from
  `calendarSync.synced`, or `error` is set, the sheet says the calendar isn't up to date and offers Try again. Risk
  closed: an offline edit or a Google failure that nobody notices. No background retry queue.
- **The sync route has no secret.** The app has no sign-in and Firestore rules are open, so the route only copies
  what Firestore already says. It takes task IDs, never event content, at most 50 per call.
- **Tests never touch a real calendar.** A fake client stores events in the Firestore emulator's
  `testCalendarEvents` collection. It is used only when `USE_EMULATOR` (`lib/emulator.ts`) is true and
  `CALENDAR_FAKE=1`; a production build can't turn it on. In emulator mode without `CALENDAR_FAKE=1` (the compare
  and a11y servers), writes are off, never real.
- **Out of scope** (list them as follow-ups, don't build them): invites, per-person calendars, a calendar mark on
  task rows, hiding app-made events from the Plan and Today event rows (they show as both a task and an event),
  two-way sync, and calendar options in the legacy follow-up tools or the deal skill.

## Requirements

| ID | Required behavior | Built / proven in |
|---|---|---|
| K1 | A task or subtask can be put on the calendar from its sheet, all day or with start and end times. | C01, C04, C05 |
| K2 | The event follows the task's name, dates and times (edits, Undo of an edit, rollbacks). Switching it off or deleting the task removes it; a subtask freed by its main task's delete keeps its event. | C02, C03, C05, E1 |
| K3 | A failure or offline edit never loses the task. The sheet shows the calendar isn't up to date and Try again fixes it. | C02, C04, C05 |
| K4 | In chat, each step is either a task only or a task plus a calendar event (with times or all day). The preview shows which. | M01, E1 |
| K5 | An MCP save puts the marked steps on the calendar after the tasks are saved. A calendar failure keeps the tasks and is reported per step. Repeating the same save retries only the steps that failed. | M02, E1 |
| K6 | Nothing shows or writes while `GOOGLE_EVENTS_CALENDAR_ID` is unset. Existing tools, views and the read route behave as before. | C02, C04, M01, R1 |
| K7 | Every automated check uses the emulator and the fake calendar. | all |

## Checks

Per task: `npx tsc --noEmit`, `npx eslint <changed files>`, `npm run test:unit`, plus `npm run test:data` when
the task touches Firestore reads or writes. For browser work: `npx playwright test tests/smoke/calendar-events.spec.ts
tests/smoke/task-sheet.spec.ts` only (add `tests/smoke/subtasks.spec.ts` when deletes of main tasks change). Give
phone-layout tests the `{ tag: "@phone" }` tag. Before changing test setup, read `lib/emulator.ts`,
`tests/support/emulator.ts`, `playwright.config.ts` and `scripts/mcp/smoke.mjs`. Add `CALENDAR_FAKE=1` and a fake
`GOOGLE_EVENTS_CALENDAR_ID` to the dev-server `env` in `playwright.config.ts` and to the MCP smoke server. Browser
checks use the dev server, never `next start`. Run one test stack at a time and stop only the PIDs you started.
After a failure, rerun only the affected tests. The full suite, a11y and compare run once, in R1a.

Record each task's evidence (commands, counts, capture paths) in `docs/implementation/calendar-events-results.md`
under its ID, and tick only the task's row in the plan.

## C01 — Calendar fields and event mapping

Adds the shape of the calendar mark and the exact event each task becomes, with no I/O yet.
Read **Smallest design**, `lib/types.ts` (`Task`), `lib/dates.ts`, `lib/calendarEvents.ts`, `lib/subtasks.ts`.
Add `calendar?: { startTime?: string; endTime?: string }` and `calendarSync?: { synced?: string; link?: string;
error?: string }` to `Task`, and add `calendar` to the sheet draft's fields (`features/task-sheet/draft.ts`) so
`patchFromDraft` writes it; `calendarSync` is never in the draft. Create `lib/taskCalendar.ts` (pure): `validateCalendarTimes`, `calendarEventId(taskId)`,
`taskEventBody(task, parent, company, origin)` (a Google `Schema$Event`, always `status: "confirmed"`), and
`calendarKey(task, parent, company)`. The key covers exactly what goes into the event (company name included), so
`calendarSync` never changes it. Tests: `tests/unit/taskCalendar.test.ts`.

Done when:
- All day, one day, multi-day, timed and multi-day timed tasks map to the right Google start and end (with exclusive all-day end).
- Times that are missing on one side, malformed (`24:00`, `9:5`) or end before start are rejected, naming the field.
- Event IDs only use `a–v0-9`, are 66 characters, are the same for the same task and differ between tasks (including a 1,500-byte and a non-ASCII Firestore ID).
- Changing `calendarSync`, done or parked leaves the key unchanged; changing the name, dates, times, Key points, parent name or company name changes it.

## C02 — Server sync, fake calendar and route

Adds the one function that makes the calendar match a task, and the route the app calls.
Read C01, `app/api/calendar/route.ts`, `lib/firebase.ts`, `lib/emulator.ts`, `lib/taskPlanServer.ts` (server
Firestore access) and the route-handler guide under `node_modules/next/dist/docs/`. Create `lib/calendarSync.ts`
(server-only): `calendarWritesEnabled()`, a client getter that returns the fake in test mode, and
`syncTaskCalendar(taskId, origin)`. The function reads the task, its parent and the company, then:
- marked: update the event with its derived ID; on 404 or 410, insert it; if that insert gets 409 (an ID deleted before), update again. The body always carries `status: "confirmed"`, so a cancelled event comes back;
- not marked: delete the derived ID (404/410 count as done), then clear `calendarSync` with `deleteField()`; a missing task: delete the event only;
- marked, after Google answers: write only `calendarSync.*` field paths with `updateDoc`, never `calendar` or the whole task. If the key changed during the call, sync once more.

Read with the `*FromServer` Firestore calls, as `taskPlanServer.ts` does. The fake mimics Google: it keeps deleted
IDs as cancelled, answers an insert of such an ID with 409, a delete of one with 410, and can be told to fail.

Create `app/api/calendar/sync/route.ts`. `GET` returns `{ enabled }`. `POST { taskIds }` (1–50 strings) syncs each
and returns a per-ID result. It never accepts event content and never throws a stack trace to the caller.

Done when (data tests on the emulator with the fake, `lib/calendarSync.data.test.ts`):
- Create, move, switch off, task deleted, repeat call (one event, not two) and switch back on after a switch-off (the cancelled event comes back confirmed) all leave the fake calendar matching the task.
- After a switch-off the task has neither `calendar` nor `calendarSync`, and a second sync call doesn't bring the event back.
- A Google failure keeps the task's own fields untouched, sets `calendarSync.error`, and leaves `synced` unchanged.
- With the variable unset, `GET` says off and `POST` writes nothing; the read route's behavior and scope are unchanged.
- The fake can't be reached unless `USE_EMULATOR` and `CALENDAR_FAKE=1` are both set, and emulator mode without the fake reports writes off (unit tests on the getter).

## C03 — The event follows the task

Makes every app write that changes a marked task trigger a sync, so nothing goes stale.
Read C02, `lib/taskWrites.ts` (`deleteTask`, `deleteTasks`), `lib/companyWrites.ts` (`saveTaskKeptInStep`,
`addTaskKeptInStep`, `saveTaskWithUndo` and its Undo, `restoreTasks` and `rollBack`), `lib/subtasks.ts`, and their
callers in `features/` (the sheet, table cells, Plan date moves; find them with `grep -rn`). Add
`requestCalendarSync(ids)` (client: `POST /api/calendar/sync` in calls of at most 50 IDs, fire-and-forget, never
blocks or fails the task write) and call it after writes where the task has or had a `calendar` mark: create, edit,
an edit's Undo, a rollback, delete, and the marked subtasks freed by a main task's delete. Done, parked and group
moves don't call it. A failed request needs no handling: the sheet's out-of-date state (C04) shows it.

Done when:
- Unit tests with a mocked fetch show which writes call it and with which IDs, including a main-task delete that frees marked subtasks and a bulk delete of 120 marked tasks (three calls).
- Writes on unmarked tasks never call it.
- `npm run test:data` passes for task writes, and a data test runs edit → sync → delete → sync against the fake.

## C04 — Task sheet: switch, times and calendar status

Gives the owner the control in a task's sheet, built only from existing design-guide parts. [look]
Read `redesign/design/design-guide.md` sections **5.9 Team calendar events**, the sheet's section under
**6.3 Task details**, **8. Accessibility** and **Words used in the interface** (say "team calendar", never
"Google Calendar", on screen). Read `features/task-sheet/TaskSheet.tsx`, `draft.ts`, `ui/Inputs.tsx` (`Switch`, `DateInput`).
Next to the start and end date fields (in full details), for new and existing tasks:
- Show a `Switch` labelled "Put on the team calendar", only when `GET /api/calendar/sync` says enabled.
- When on: "Starts" and "Ends" time fields (a new `TimeInput` in `ui/Inputs.tsx`, styled like `DateInput`), blank meaning all day, with C01's validation messages shown in the field's own error style.
- Status line: "On the team calendar" with the external-link button "Open in the team calendar"; "Adding to the team calendar…" while the sync is pending; an amber line "The team calendar isn't up to date." with **Try again** when the key differs from `calendarSync.synced` or `error` is set.

Then record the change to decision D9 (events are no longer only read-only) as an open item in
`redesign/ui-implementation-plan.md` and as a need in `redesign/handoff/needs.md`. Don't edit `redesign/design/`
(the studio's import overwrites it). Add unit tests for the states.

Done when (a screenshot answers each):
- At 1440×900 and 390×844, the switch sits right under the start and end dates. With it on, the two time fields sit side by side on desktop and stacked on phone, clear of the sheet's bottom buttons.
- Each status (on, adding, not up to date with Try again) shows its words and icon, with no clipped text.
- With the feature off, the sheet looks exactly as before (compare a before-and-after capture).

## C05 — App flow on desktop and phone

Proves the sheet flow end to end in the browser and fixes what the pictures show is wrong. [look]
Read C04, **Checks**, `tests/smoke/task-sheet.spec.ts` and `tests/smoke/subtasks.spec.ts`. Write
`tests/smoke/calendar-events.spec.ts`: put a subtask on the calendar all day, then with times, change its date
and use that edit's Undo, switch it off and on again, delete a marked task, and delete a main task whose marked
subtask is freed (its event stays, without the main task's name). Check the fake calendar after each step. Force one fake
failure and check that Try again clears it. Tag the phone cases `@phone`. Save full-size captures to
`test-results/calendar-events/` at 1440×900 and 390×844. Describe each picture before judging it, then fix any
overlap, clipping or misaligned field in the sheet and recapture only that state.

Done when:
- The spec passes on desktop and phone, and `task-sheet.spec.ts` still passes.
- Each capture is described in the results file, and any fault found is fixed and recaptured.
- There are no console errors and no sideways scroll on phone.

## M01 — MCP: calendar choice per step and preview

Lets chat mark each step as a task only or a task plus a calendar event, and shows that before saving. [no look]
Read the archived connector brief's **Contract** (`chat-task-connector.md`), `lib/taskPlan.ts`,
`lib/taskPlanTools.ts`, `lib/taskPlanToken.ts` and their tests. Add `calendar?: { startTime?: string; endTime?:
string }` (strict) to `TaskPlanStepInput` and to the zod step schema, validated with C01's helper. Preview lines
show "Team calendar: all day" or "Team calendar: 14:00–15:00" per step. A plan with calendar steps while writes are
off is an error ("The team calendar isn't connected; remove calendar from these steps."). Make sure the
fingerprint and token cover the new field, and that a plan without it fingerprints exactly as before (an old
token still verifies). Update `TASK_PLAN_CHAT_GUIDANCE` step 4. In the same single question per step, also ask:
task only, or also on the team calendar, and if so, a start and end time or all day. Never guess times. Use this
connector, not a separate calendar connector, for task events. Update the step-4 lines of
`docs/implementation/chat-task-walkthrough.md` with one example of each choice. Leave the legacy follow-up tools alone.

Done when:
- Unit tests cover a valid calendar step, all day and timed; bad or one-sided times naming the step; calendar steps while off; old plans unchanged in fingerprint; and a token that fails when only the calendar field changed.
- The tool schema test shows the new optional field, and the legacy tools' schemas are unchanged.

## M02 — MCP: save puts steps on the calendar

Makes an MCP save create the marked steps' events, and report each step honestly. [no look]
Read M01, C02, `lib/taskPlanServer.ts` (`addTaskPlan`, `alreadySaved` path) and `scripts/mcp/protocol-smoke.mjs`.
Save the step's `calendar` mark inside the existing transaction, spreading it in only when present (so plans
without it fingerprint and save exactly as before). After it commits, call `syncTaskCalendar` directly (no HTTP)
for each marked subtask, ten at a time in parallel, so a large plan stays well inside the function's time limit.
Add the fake's env to `startNext` in `scripts/mcp/smoke.mjs`. Add `calendar` per subtask to the result: `added` with link, `failed` with the
short error, or absent when not requested. Tell Claude in the tool description to report failures and that
repeating the same save retries them. On `alreadySaved`, sync only the marked subtasks whose key differs from
`calendarSync.synced`. A calendar failure never fails or undoes the save. Extend the protocol smoke with these cases under
the existing selectors.

Done when:
- Data tests: mixed plan (one timed, one all day, one task only) gives two fake events and one plain task; a forced failure keeps all three tasks and reports one `failed`; an identical retry adds the missing event without duplicates or task changes.
- `npm run mcp:smoke -- --only=protocol` passes with the new cases, and the legacy follow-up cases still pass.

## E1 — End to end

Proves the whole path once: chat plan, app, edit, delete. [no look]
Read **Requirements** and **Checks**. Run on the emulator and fake calendar: save an MCP plan with one calendar
step and one task-only step, open the returned link in the browser, change the calendar step's date and time in
its sheet, switch the task-only step on, then delete both steps and the main task. Assert the fake calendar after
each step. Add it to `scripts/mcp/task-plan-ui.mjs` (it owns MCP-to-browser runs; the Playwright dev server has no
MCP), behind its own `--only=` selector in `scripts/mcp/smoke.mjs`. Add the fake's env to `startNext` there.

Done when:
- That case passes with its selector, and the fake calendar ends empty.
- Each requirement K1–K7 has a test name or results line next to it in the results file.

## R1a — Full check run

Runs the slow checks once and lists what fails; it fixes nothing. [no look]
Run `npm run test:smoke`, `npm run a11y` and `npm run compare` filtered to the task sheet states, one stack at a
time. Save every failure with its spec, case and first error line in the results file, sorted by app area. The
compare and a11y servers run without the fake, so the switch is hidden there; C05's captures cover its look.

Done when:
- The three runs finished and their counts are recorded.
- The failure list is complete (or says none).

## R1b — Fix recorded failures

Fixes what R1a listed, area by area, rerunning only what each fix touched. [look]
If the list would take more than one app area or about 30 minutes of checks, split it into rows `R1b1`, `R1b2`…
right here in the plan before starting. Don't fix anything R1a didn't record.

Done when:
- Every recorded failure is fixed or written up with a cause outside this work.
- Each fix's rerun is recorded.

## R1 — Phase review

A fresh review of the whole phase's diff, with a hunt for faults in saving and syncing, plus the owner handoff. [no look]
Read this brief, the results file and `git diff <commit before C01>..HEAD`. Hunt for: duplicate or orphaned
events, a task write blocked or lost by a sync, a sync write recreating a removed mark or touching `calendar`, the fake reachable in
production, the owner's address committed anywhere, legacy tool changes, and guidance that lets Claude guess times
or dates. Fix what you confirm, with a failing test first. Then write the owner handoff at the end of the results
file: what was proven, what is only proven on the fake, and the follow-ups from **Out of scope**.

Done when:
- Every finding is fixed with its test, or written up with why it stands.
- `npm run test:unit`, `npm run test:data` and the calendar spec pass after the fixes.
- The handoff lists the owner steps in the plan's order.
