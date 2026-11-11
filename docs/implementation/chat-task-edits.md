# Build brief: change existing tasks from a Claude chat

This brief holds the details for `docs/IMPLEMENTATION_PLAN.md`. Only that plan holds progress ticks. Every default
below is settled for an unattended run, so no task stops to ask.

## What the owner asked, and the smallest design

> "Wanna enable it to edit tasks subtasks etc from the claude chat directly to deus teams."

Owner answers, 2026-11-11: chat may change name, dates, Key points, status and parking, people (Responsible and
Informed) and the calendar mark; chat may delete, after confirmation; chat may move a subtask to another main task
or free it into a main task of its own.

**Smallest design:** three new connector tools, next to the existing ones.
- `find_tasks` (read only): finds tasks and subtasks by text, company or main task, with everything chat needs to
  show the owner what is there now.
- `preview_task_changes` (read only): takes a list of changes, one per task, and returns each task's before →
  after, errors and warnings. Writes nothing.
- `apply_task_changes`: saves the same list in one transaction, then brings the calendar in line for the tasks it
  touched.

One change per listed task: `{ taskId, set?: {...fields}, move?: { toParentId: string | null }, delete?: true }`
(`delete` alone, or `set` and/or `move`). At most 50 changes per call. Only listed tasks change: a main task's new
dates never move its subtasks, and nothing changes dates on several tasks as a side effect (owner rule, 2026-10-22).

Settled defaults, each with the risk it closes:
- **Off until the owner switches it on:** the tools exist only when `MCP_TASK_EDITS_ENABLED=1` (like
  `MCP_TASK_PLANS_ENABLED` in `lib/taskPlanTools.ts`); otherwise the route answers "Tool not found." Risk closed:
  every push deploys, so half-built write tools would be live mid-run.
- **A `seen` stamp per task instead of a signed token:** the preview returns, for each task, a SHA-256 of its
  current stored fields. Apply takes the stamps back and refuses the whole list, writing nothing, if any task's
  stamp differs ("changed since the preview: preview again"). Risk closed: someone edits the task in the app between
  the preview and the save, and chat overwrites it. No preview token, no expiry, no receipts.
- **Retry without doubles:** if every listed task already matches its after state (deleted tasks already gone),
  apply writes nothing and returns `alreadySaved: true`, still running the calendar step for the tasks it lists.
  Risk closed: a lost response, then a retry refused as "changed".
- **Warnings are acknowledged by ID**, the way `add_task_plan` does (`acknowledgedWarnings`). Risk closed: chat
  saving past a warning (a past date, a main task's delete freeing its subtasks) without showing it to the owner.
- **Fields `set` may carry:** `task` (name), `startDate`, `endDate` (yyyy-mm-dd, start ≤ end), `keyPoints` (the
  whole new text; chat shows before → after), `status` (`todo` | `inProgress` | `done`, written through
  `statusPatch` in `lib/taskStatus.ts` and `withCompletedAt` in `lib/taskWrites.ts`), `parked` (`{ until:
  "yyyy-mm-dd" | null }` to park, `false` to bring back; a done task can't be parked, as in `lib/parking.ts`),
  `responsible` (the whole new list of names), `informed` (the whole new list of `{ name, note? }`), `calendar`
  (`{ startTime?, endTime? }` to put on the calendar, `null` to take off; same time rules as the calendar brief).
  Nothing else (type, priority, touch point, company, group) changes from chat.
- **People:** each name is matched case-insensitively to the names already in use (`namesInUse` in `lib/people.ts`)
  and stored with that spelling. A name nobody uses yet is a warning (`new-person:<name>`). Risk closed: a typo
  making a second person.
- **The company follows a deadline, as in the app:** an open company task whose `endDate` changes updates its
  company's target and last action exactly as `saveTaskKeptInStep` in `lib/companyWrites.ts` does (B12), through
  the same `companyPatchFrom` rule (export it; don't copy it). If that company write fails, the task changes are
  put back, as the app does, and apply reports it.
- **Moves:** a task with no subtasks of its own can move under any main task that `add_task_plan` would accept
  (open, unparked, top-level), not itself. It takes the new main task's `linkedClientId` and `taskGroup`, as
  `newSubtask` in `lib/subtasks.ts` does; a different company is a warning. `toParentId: null` frees a subtask:
  it keeps its company and group. A main task with subtasks can't become a subtask (one level only).
- **Deletes:** follow `deleteTask` in `lib/taskWrites.ts`: deleting a main task frees its subtasks (they lose
  `parentId`) unless they are listed for delete too. Each delete is a warning (`delete:<taskId>`) naming the task
  and, for a main task, how many subtasks it frees. There is no Undo, so the guidance asks the owner to confirm
  every deleted task by name.
- **Calendar after the save:** once the transaction commits, call `syncTaskCalendar(taskId, origin)` from
  `lib/calendarSync.ts` for every listed task that is or was on the calendar, and for subtasks a delete freed or a
  move re-parented if they are on the calendar (their event description names the main task). Calendar edits
  (`set.calendar`) are refused while `calendarWritesEnabled()` is false. A calendar failure keeps the task change
  and is reported per task.
- **Writes go through the server's Firestore access** as in `lib/taskPlanServer.ts` (`runTransaction`, reads with
  `transaction.get`), never the browser hooks.

**Out of scope** (list as follow-ups, don't build): changing type, priority, touch point, company or task group
directly; edits to companies; an Undo from chat; "all tasks of X" without listing each task; changes to the legacy
follow-up tools or the deal skill.

## Requirements

| ID | Required behavior | Built / proven in |
|---|---|---|
| X1 | Chat can find any task or subtask and show what it holds now. | T03, E1 |
| X2 | Chat can change name, dates, Key points, status, parking, people and the calendar mark, shown before → after in a preview first. | T01, T03, T04, E1 |
| X3 | Chat can move a subtask under another eligible main task or free it, with the one-level rule kept. | T02, T04, E1 |
| X4 | Chat can delete tasks after a preview; a main task's unlisted subtasks are freed, not deleted. | T02, T04, E1 |
| X5 | Nothing is saved if a listed task changed since its preview; a retry of a saved list writes nothing. | T04 |
| X6 | Only listed tasks change, except the company following an open task's deadline, as in the app. | T01, T04, R1 |
| X7 | The calendar follows: edits move events, take-offs and deletes remove them, failures are reported per task. | T04, E1 |
| X8 | With `MCP_TASK_EDITS_ENABLED` unset, the tools don't exist and existing tools behave as before. | T03, T05, R1 |
| X9 | Every automated check uses the emulator and the fake calendar. | all |

## Checks

Per task: `npx tsc --noEmit`, `npx eslint <changed files>`, `npm run test:unit`, plus `npm run test:data` when
the task touches Firestore reads or writes. MCP checks: `npm run mcp:smoke -- --only=protocol` (emulator only;
read `scripts/mcp/smoke.mjs` first and give the edit tools their own section, with the flag set for the smoke
server). Browser work: `npx playwright test tests/smoke/chat-task-edits.spec.ts` only. Run one test stack at a time
and stop only the PIDs you started. After a failure, rerun only the affected tests. The full suite, a11y and compare
run once, in R1a.

Record each task's evidence (commands, counts) in `docs/implementation/chat-task-edits-results.md` under its ID,
and tick only the task's row in the plan.

## T01 — Field changes (pure)

Adds the rules that turn a requested field change into the exact before → after and its warnings.
Read **Smallest design**, `lib/types.ts` (`Task`), `lib/taskStatus.ts`, `lib/parking.ts`, `lib/people.ts`,
`lib/taskWrites.ts` (`withCompletedAt`, `toTaskUpdate`), `lib/taskCalendar.ts` (the calendar mark's time rules) and
how `lib/taskPlan.ts` shapes errors and warning IDs. Create `lib/taskEdit.ts` (pure, no Firestore):
`validateTaskChanges(input)` (shape, 1–50 changes, one per task ID, known fields only) and
`buildTaskChanges(changes, { tasks, companies, names, today, calendarOn })` returning, per task: `before`, `after`,
the Firestore patch, `seen` (SHA-256 of the stored task fields, sorted keys) and warnings, plus overall `errors`.

Warnings, each with a stable ID: past dates, start after end (error), a subtask's dates outside its main task's,
a main task's new dates leaving its subtasks outside (warning only; never move them), `new-person:<name>`, editing
a done task, a company target that will follow the new deadline. Errors: unknown task, a field chat may not change,
parking a done task, bad dates or times, a calendar change while `calendarOn` is false.

Done when (unit tests, `tests/unit/taskEdit.test.ts`):
- Each field gives the expected patch, and status uses `statusPatch` and `withCompletedAt` (Done sets `completedAt`, back to To Do clears it).
- People come back in their stored spelling; a new name gives `new-person:<name>`.
- A main task's date change touches only that task and warns about subtasks outside.
- `seen` is the same for the same stored task whatever the key order, and different after any field change.

## T02 — Moves and deletes (pure)

Adds the rules for moving and deleting to `lib/taskEdit.ts`, with the same before → after and warnings.
Read T01's code, **Smallest design** (Moves, Deletes), `lib/subtasks.ts` (`canHoldSubtasks`, `newSubtask`),
`lib/taskWrites.ts` (`deleteTask`) and the eligibility rule for an existing main task in `lib/taskPlan.ts`.

Done when (unit tests in `tests/unit/taskEdit.test.ts`):
- A subtask moves under an eligible main task and takes its `linkedClientId` and `taskGroup`; a different company warns.
- Moving under a done, parked or nested task, under itself, or moving a main task that has subtasks is an error.
- Freeing a subtask removes `parentId` and keeps its company and group.
- Deleting a main task frees its unlisted subtasks (listed as extra patches) and warns `delete:<taskId>` with their count; listed subtasks are deleted.
- A change list mixing a move and a `set` on the same task gives one combined patch.

## T03 — Find and preview tools (read only)

Adds `find_tasks` and `preview_task_changes` to the connector, behind `MCP_TASK_EDITS_ENABLED`.
Read T01–T02, `app/api/mcp/[secret]/route.ts`, `lib/taskPlanTools.ts` (registration, flag, input checks, the
guidance constant) and `lib/taskPlanServer.ts` (`readTasks`, `readCompanies`, `*FromServer` reads). Create
`lib/taskEditServer.ts` (server-only: read tasks, companies and names; `findTasks`; `previewTaskChanges`) and
`lib/taskEditTools.ts` (registration, the `taskEditsEnabled()` flag, zod inputs checked in the route before the
handler, as task-plan tools are). `find_tasks` takes `query` and/or `companyId` and/or `parentId`, `includeDone`
(default false); returns up to 10 tasks with ID, name, main task, company, group, dates, status, parked, people, Key
points, calendar mark and subtasks, plus `hasMore`.

Done when (data tests on the emulator, `lib/taskEditServer.data.test.ts`):
- `find_tasks` finds by text, company and main task, leaves done tasks out unless asked, and says `hasMore`.
- `preview_task_changes` returns before → after, `seen` and warnings for a mixed list, and writes nothing (collection unchanged).
- With the flag unset, both tools answer "Tool not found." and the existing tools' list is unchanged (unit test on the route's tool list).

## T04 — Save tool

Adds `apply_task_changes`, which saves one confirmed list atomically and then brings the calendar in line.
Read T01–T03, **Smallest design** (stamps, retry, company, calendar), `lib/taskPlanServer.ts` (`addTaskPlan`'s
transaction), `lib/companyWrites.ts` (`saveTaskKeptInStep`, `companyPatchFrom`) and `lib/calendarSync.ts`. In
`lib/taskEditServer.ts`: `applyTaskChanges(changes, seen, acknowledgedWarnings, origin)`. Inside one
`runTransaction`: read every listed task and every task a delete frees or a move needs, rebuild with T01–T02,
refuse on a stamp mismatch, an unacknowledged warning or any error, then write all patches and deletes. After the
commit: the company patch (rolled back with the task changes if it fails), then `syncTaskCalendar` for the tasks in
**Calendar after the save**. Return per task: saved, the calendar result, and the task link.

Done when (data tests on the emulator with the fake calendar):
- A mixed list (rename, dates, Done, park, people, move, delete of a main task with one listed and one unlisted subtask) saves exactly the previewed after state.
- A task edited after the preview makes the whole list write nothing and say which task changed.
- Repeating a saved list writes nothing and returns `alreadySaved: true`.
- A deadline change on an open company task moves the company's target and last action; a failed company write puts the tasks back.
- Calendar: a marked task's rename moves its event, taking the mark off or deleting removes it, a freed subtask's event loses the main task's name, and a fake calendar failure keeps the task change and is reported.

## T05 — Chat guidance and MCP smoke

Teaches Claude chat the edit flow and proves the tools over HTTP.
Read `TASK_PLAN_CHAT_GUIDANCE` in `lib/taskPlanTools.ts` and the server instructions in the route. Write
`TASK_EDIT_CHAT_GUIDANCE` (in each edit tool's description and in the server instructions when the flag is on):
find the task with `find_tasks` and show what it holds now → say each change as before → after, one task at a time
→ never guess dates, times, people or which task is meant (ask, or show the matches) → preview → show every warning
and get confirmation, naming every task to delete one by one → apply with the stamps and acknowledged warnings →
report each task and its calendar result honestly. Edits and new plans are separate saves. Then add an edit section
to `scripts/mcp/smoke.mjs` (protocol run, emulator only): find, preview, apply, a changed-since refusal and a
repeat that writes nothing.

Done when:
- `npm run mcp:smoke -- --only=protocol` passes with the edit section, and still passes with the edit flag unset (tools absent).
- The guidance names every rule above in one short paragraph and never lets Claude pick a task, date or person itself.

## E1 — End to end

Proves a chat edit shows up in the app. [no look]
Create `tests/smoke/chat-task-edits.spec.ts` (emulator, fake calendar, dev server; read `playwright.config.ts` and
`tests/support/emulator.ts` first). Seed a main task with two subtasks, one on the calendar; call the edit tools over
HTTP as chat would; open `/tasks?task=<id>` and check the sheet.

Done when:
- After a rename, new dates, Done and a person added, the task sheet shows all four.
- A moved subtask shows under its new main task; a freed one shows as a main task.
- A deleted main task is gone and its unlisted subtask still shows as a task of its own.
- The fake calendar holds one event for the marked task, with the new name, and none after its delete.

## R1a — Full check run

Runs the full suite, a11y and scoped compare once and lists failures. Fix nothing. [no look]
Run `npm run test:smoke`, `npm run a11y` and `npm run compare` filtered to the task-sheet states. Write each failure
(spec, test, first error line) under R1a in the results file.

Done when: every failure is listed, or the file says all three passed.

## R1b — Fix recorded failures

Fixes what R1a listed, rerunning only what each fix touched. [look]
Done when: every R1a failure is fixed and its spec reruns green, or written up with why it stands.

## R1 — Phase review

A fresh review of the whole phase's diff, hunting for faults in saving, plus the owner handoff. [no look]
Read this brief, the results file and `git diff <commit before T01>..HEAD`. Hunt for: a write that skips the stamp
check, any change to a task that wasn't listed (dates above all), a delete that removes unlisted subtasks, a
move that breaks the one-level rule, the company not following or following when it shouldn't, a calendar event
left behind or doubled, the tools reachable with the flag unset, tests that could reach production, and guidance that
lets Claude guess a task, date or person. Fix what you confirm, with a failing test first. Then write the owner
handoff at the end of the results file: what was proven, what is only proven on the emulator and fake calendar, and
the follow-ups from **Out of scope**.

Done when:
- Every finding is fixed with its test, or written up with why it stands.
- `npm run test:unit`, `npm run test:data`, the MCP protocol smoke and the E1 spec pass after the fixes.
- The handoff lists the owner steps in the plan's order.
