# Task groups from chat

## G1 — Group tools

Both tools use the task edits flag. Rename and delete check membership and the confirmed total in one Firestore transaction. Legacy records with the same name share a list row and retain the oldest record's ID.

- `npx tsc --noEmit` and ESLint on the changed files passed.
- `npm run test:unit -- --maxWorkers=2` passed all 1,706 tests.
- `npm run test:data` passed 354 of 355 tests. An existing Responsible test timed out at 5 seconds. The focused emulator run passed that test and all 12 G1 cases, including rollback, retry, concurrent writes, app readback, and the 400-task limit.
- `npm run mcp:smoke -- --only=protocol` passed 148 database-preservation comparisons. Discovery verified both group tools with the edit flag on and hid and refused both with the flag off.
- The default build hit Turbopack's `next/font/google queries have exactly one entry` error in the existing Plus Jakarta Sans import. The local Webpack production build passed using a cached font fixture.
