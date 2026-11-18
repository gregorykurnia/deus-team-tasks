# Responsible from chat checks

## M1 — Bulk Responsible in the edit tools (2026-11-18)

`find_tasks` pages through ten matches at a time with `offset`, `hasMore`, and `total`. The count includes each main task and subtask once. `preview_task_changes` shows the Responsible changes and `unchanged` IDs. Pass the complete `preview.seen` map and the original change list to `apply_task_changes`. The save returns only the IDs that changed, so chat can target undo correctly.

DECISION!: Bulk saves record the changed IDs and follow-up targets in Firestore `settings` in the task transaction. A state comparison alone could mistake a matching manual edit for a saved batch. Fresh preview stamps let the owner reapply a change after undoing it.

HUNTED: ripple · Company pages include parked tasks and nested subtask details while counting each match once · 23-match paging test.
HUNTED: ripple · Task assignments and notification claims use the saved Responsible list · Emulator tests check co-owners, claim removal, and deliveries only for changed tasks. The Responsible-only save leaves calendar work untouched.
HUNTED: odd data · Blank and long names, missing lists, repeated spellings, and conflicting or unmatched removals · `taskEdit.test.ts` and MCP schema tests.
HUNTED: failure · Unconfirmed spelling, lost replies, and interruption after the task commit · Emulator tests check zero writes before confirmation, unchanged document timestamps on retry, and fake push recovery.
HUNTED: failure · A combined deadline save fails in the separate company database · Emulator rollback and retry restore the tasks and clear the failed receipt.
HUNTED: overlap · An unchanged task changes, an outside edit matches the preview, or two saves overlap · Emulator tests check whole-batch refusal, one successful write, and stale replay after undo.

- `npx tsc --noEmit` and ESLint on changed TypeScript and JavaScript files passed.
- `npm run test:unit` passed 1,678 tests. The first run hit the sandbox's `spawnSync … EPERM` restriction.
- `npm run test:data` passed 328 emulator tests.
- `npm run mcp:smoke -- --only=protocol` passed 127 preservation comparisons after the tool-list assertions were updated to include the existing `find_free_times`.
- `npm run build` and `git diff --check` passed. Playwright is deferred to the phase review under the run rules.

## M2 — One push per person per save (2026-11-18)

The dispatcher claims assignments per task, then sends each person one push for their newly claimed tasks in that call. A multi-task push opens Today. A single-task push keeps its message and task link.

DECISION: Match company IDs for a shared-company message because matching display names would combine distinct companies with the same name.

HUNTED: ripple · Chat saves and the app route use the same dispatcher, and the service worker opens Today or the linked task · Chat-save, route, and push worker tests.
HUNTED: odd data · Missing tasks and companies, blank names, duplicate IDs and spellings, previously claimed tasks, and long names · Fake-push tests verify counts and exact copy.
HUNTED: failure · One claim fails in a batch or the push response is lost before or after delivery · Emulator tests verify only unclaimed tasks send on retry.
HUNTED: overlap · Concurrent requests share a task, and an old delivery finishes after a page close and a newer assignment · Emulator tests verify each assignment is claimed once and the newer claims remain current.

- `npx tsc --noEmit` and ESLint on changed TypeScript files passed.
- The unit suite passed all 1,679 cases across two runs. The sandbox returned `spawnSync … EPERM` on one test, which passed when rerun on its own.
- `npm run test:data` passed 334 emulator tests.
- `npm run mcp:smoke -- --only=protocol` passed 127 database-preservation comparisons.
- `npm run build` and `git diff --check` passed. The full check is scheduled for R1.
