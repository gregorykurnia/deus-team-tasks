# Task groups from chat

## G1 — Group tools

Both tools use the task edits flag. Rename and delete check membership and the confirmed total in one Firestore transaction. Legacy records with the same name share a list row and retain the oldest record's ID.

- `npx tsc --noEmit` and ESLint on the changed files passed.
- `npm run test:unit -- --maxWorkers=2` passed all 1,706 tests.
- `npm run test:data` passed 354 of 355 tests. An existing Responsible test timed out at 5 seconds. The focused emulator run passed that test and all 12 G1 cases, including rollback, retry, concurrent writes, app readback, and the 400-task limit.
- `npm run mcp:smoke -- --only=protocol` passed 148 database-preservation comparisons. Discovery verified both group tools with the edit flag on and hid and refused both with the flag off.
- The default build hit Turbopack's `next/font/google queries have exactly one entry` error in the existing Plus Jakarta Sans import. The local Webpack production build passed using a cached font fixture.

## G2 — Edit task groups from chat

Chat can preview and save group moves or clear a task's group in batches of 50. `find_tasks` can page by a named group or find ungrouped tasks. The preview binds each destination's stored name and record IDs. Group moves use the existing task field and save receipts.

- Type checking, ESLint and all 1,718 unit tests passed. The sandbox initially blocked a unit test's subprocess and emulator ports with `EPERM`. Local-access reruns resolved both.
- The first `npm run test:data` passed 367 of 370 cases. The overlapping Responsible save returned `Tasks changed since the preview: parent` because it read the receipt before a concurrent commit. The receipt check now follows the task reads. Two existing push and calendar cases reported `Test timed out in 5000ms.`
- All 71 focused task-edit and group emulator tests passed after the fix, including both forms of the receipt race, destination renames during a transaction, rollback and retries. The two timed-out cases also passed on rerun with a 15-second limit.
- The local Webpack production build passed using the cached Plus Jakarta Sans font.

## E1 — End to end on the emulators

- `npm run mcp:smoke -- --only=protocol` passed 188 database-preservation comparisons. It paged 55 company tasks, previewed and moved batches of 50 and 5, cleared 2, renamed the remaining 53, refused a stale count of 55, and deleted the group with 53 members. It checked subtasks, the done task, company links, fake push and calendar records, and safe retries.
- The bulk move included the parked main task. The group listed 54 open and 55 total, then 55 open after the test unparked it.
- `chat-task-edits.spec.ts` passed all 12 existing cases in the full run. The new case timed out at 10 seconds on the first group route load. The focused rerun passed with a longer navigation allowance, showing all three tasks and the renamed group in the open app.
- Type checking, ESLint, all 1,718 unit tests, and all 372 Firestore data tests passed.
- An isolated Webpack production build passed with the cached Plus Jakarta Sans font.

## R1 — Phase review

Reviewed the code and tests since the plan commit (`462186d`), hunting the brief's risk areas.

- **Move during a rename:** the move's transaction reads every task and the destination's records, and its preview
  stamp binds the stored name and record IDs. A rename that commits first makes the apply refuse; a move that commits
  first changes the count, so the rename refuses. Covered by the G2 race tests.
- **Record-less and duplicate groups:** list as one row (`id: null` when record-less); rename, delete and star act on
  every record of the exact name. The shared `groupNameProblem` now counts record-less names as taken when no ID is
  excepted; the app only passes records (all with IDs), so its dialogs behave as before.
- **`alreadySaved` with `taskGroup`:** group moves use the save receipt, checked after the task reads; a retry returns
  `alreadySaved` and writes nothing (G2 tests).
- **Subtask default:** the app nests a subtask under its main task only when both are in the filtered group list, so a
  subtask left behind shows on its own in the old group. Chat's default adds open subtasks, so the moved family stays
  together; done subtasks stay where they were, matching the app's own Move to group.
- **Fixed here:** a rename of a missing group onto an existing group's name returned `alreadyDone: true`. It now
  counts as already done only when the new name holds the confirmed task count; otherwise "could not be found".
  `list_task_groups` now tells chat to always say "important" to the owner.
- Checks: `npx tsc --noEmit` and ESLint on the changed files passed; unit tests 1,717 of 1,718 under load (a
  `taskPlan.test.ts` case timed out at 5 seconds while Playwright ran; its file passed 265 of 265 on rerun);
  `npm run test:data` passed 372 of 372.
- Playwright: `npx playwright test tests/smoke/groups.spec.ts tests/smoke/tasks-screen.spec.ts` passed 28, skipped 1,
  in 7.9 minutes.
- Shared `lib/` code changed in this phase (`taskGroups.ts`, `taskWrites.ts`, `taskWriteFields.ts`): a full check is
  worth running.

### Owner handoff

1. Reconnect: in Claude, start a new chat with Teams DEUS on and check `list_task_groups` and `change_task_group`
   are offered. If not, reconnect the connector as in `docs/skills/README.md` (O1).
2. Live try (O2): "Create a group called Test Chat Group", then "Preview only: put all open tasks of <a company with a
   few tasks> into Test Chat Group". The table's count should match the app for that company, with its open subtasks
   listed. Save, check the tasks show under the group in the app, rename it, then delete it (chat should say the open
   and total counts first) and check the tasks are back with no group.
