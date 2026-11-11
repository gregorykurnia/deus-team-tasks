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
