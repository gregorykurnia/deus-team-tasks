# Chat task edits — evidence

## T01 — Field changes (2026-11-11)

Built `lib/taskEdit.ts`: strict 1–50-change validation; full before/after records, plain patches (undefined means clear), stable warning IDs and SHA-256 `seen` stamps over every stored field, recursively sorted. Names use existing spelling, date changes stay on listed tasks, and calendar edits use the existing time rules. No connector registration, I/O or screen changes.

DECISION: Require caller-supplied `context.now` epoch milliseconds rather than reading a clock in the builder, so previews and timestamp patches remain deterministic.
DECISION: Move `withCompletedAt` into pure `taskStatus.ts` and re-export it from `taskWrites.ts` rather than copy it or import Firestore into the builder; existing callers keep their API and behavior.
DECISION: Compare final requested parent/child dates rather than only stored ranges, so an explicitly listed pair of date changes does not give misleading range warnings.

Checks:
- `npx tsc --noEmit` — passed, including after the final regression fix.
- `npx eslint lib/taskEdit.ts lib/taskStatus.ts lib/taskWrites.ts tests/unit/taskEdit.test.ts` — passed.
- `npm run test:unit` — 46 files / 1,265 tests passed; after adding one date regression, `npm run test:unit -- tests/unit/taskEdit.test.ts` — all 102 T01 tests passed.
- `npm run test:data` — 10 files / 210 tests passed with the Firestore emulator and fake calendar; initial sandbox startup failed with `listen EPERM`, then the approved run outside the sandbox passed and shut down the emulator.
- `npm run build` — passed outside the sandbox; stopped the initial sandboxed run after it stalled during Turbopack compilation.
- Diff review / `git diff --check` — clean; explicitly supplied unchanged dates now still receive range validation and past-date warnings, with a regression test. Completion-helper extraction preserves its original logic.

Full smoke/a11y/compare remain scheduled for R1a; a full check is worth running for shared-library changes. T02 was not started.

## T02 — Moves and deletes (2026-11-11)

Extended the pure builder and strict input validation for moves, freeing and delete-only changes. Moves inherit the parent's company/group through `newSubtask`, warn on a company change and preserve other stored fields. Deletes warn by task name and freed count, preserve surviving subtasks with unlink patches and `seen` stamps, and delete explicitly listed subtasks. Combined moves/field edits and listed child edits/unlinks produce one patch per task; no connector or screen changes.

DECISION: Check move destinations in both stored and final batch states, rather than only before the batch, to retain `add_task_plan` eligibility and reject cycles, nesting, deleted targets and newly finished/parked targets.
DECISION: Preserve an explicit child move and combine a listed child edit with its unlink, rather than overwrite either when deleting the old parent, so mixed batches stay independent of input order.
DECISION: Represent deletion as `after: null` and put freed subtasks in the same preview list with their own patches/stamps, rather than separate result formats, so the later transaction can consume one complete preview.

Checks:
- `npx tsc --noEmit` — passed.
- `npx eslint lib/taskEdit.ts tests/unit/taskEdit.test.ts` — passed.
- `npm run test:unit` — 46 files / 1,319 tests passed, including 53 new move/delete cases.
- `npm run build` — passed outside the sandbox, including TypeScript and all 13 static pages.
- Diff review / `git diff --check` — clean; checked move eligibility in both batch orders, combined patches, inheritance clearing, delete counts, unlisted child survival, independent dates and no input mutation; no further faults found.

Data/MCP/browser/screenshot checks were not run: this task has no Firestore I/O, connector registration or screen changes (`[no look]`). Full smoke/a11y/compare remain scheduled for R1a; a full check is worth running for shared-library changes. T03 was not started.
