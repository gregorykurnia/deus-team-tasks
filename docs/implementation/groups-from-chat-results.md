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
