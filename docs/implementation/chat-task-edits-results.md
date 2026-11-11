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

## T03 — Find and preview tools (2026-11-11)

Added server-only reads and connector registration in `lib/taskEditServer.ts` and `lib/taskEditTools.ts`, plus pre-handler flag/input checks in the MCP route. `find_tasks` combines text/company/main-task filters, returns ten matches with current fields and parent/company/subtask context, excludes done tasks unless requested and reports `hasMore`. `preview_task_changes` reuses the pure builder with fresh tasks, companies and names, Jakarta dates and the calendar flag; returns before/after, stamps, warnings and errors without writes. Both tools are absent and direct calls say "Tool not found." unless `MCP_TASK_EDITS_ENABLED` is exactly `1`; existing tool lists stay unchanged when disabled.

DECISION: Require at least one search filter and combine supplied filters with AND, rather than browse everything, to keep selection explicit; search names and Key points case-insensitively and sort matches by name/ID.
DECISION: Read names from tasks and flow/outcome roles, rather than tasks alone, to match the app's existing people picker and preserve stored spelling.

Checks:
- `npx tsc --noEmit` — passed.
- `npx eslint app/api/mcp/[secret]/route.ts lib/taskEditServer.ts lib/taskEditTools.ts lib/taskEditServer.data.test.ts tests/unit/taskPlanTools.test.ts` — passed.
- `npm run test:unit` — 46 files / 1,348 tests passed, including 29 new route/schema/flag/error cases.
- `npm run test:data` — 11 files / 220 tests passed with the local emulator and fake calendar, including 10 new find/preview cases and unchanged-collection comparisons; emulator shut down.
- `npm run build` and `MCP_TASK_EDITS_ENABLED=0 npm run mcp:smoke -- --only=protocol` — passed; protocol smoke made 115 database-preservation comparisons and stopped its owned servers. Enabled edit HTTP scenarios remain in T05 as planned.
- Diff review / `git diff --check` — clean; checked exact flag gating, independent plan/edit activation, strict validation before handlers, no write/calendar-call path, fresh stamps, done filtering, combined filters and ten-result limits; no further faults found.

No browser/screenshots: no screen changes (`[no look]`). Full smoke/a11y/compare remain scheduled for R1a; a full check is worth running for shared-library changes. T04 was not started.

## T04 — Save tool (2026-11-11)

Added `apply_task_changes` behind the existing exact activation flag, with strict route-level schemas, warning acknowledgements, per-task saved/deleted results, task links and calendar results. One tasks-project transaction re-reads all enumerated context and explicitly requested/destination/stamped documents, rebuilds the pure preview, checks stamps for listed and freed tasks, then writes all patches/deletes together. A real transaction retry rechecks the preview. Matching saved lists skip task/company writes, preserve generated timestamps, tolerate already-deleted tasks and retain freed subtask IDs through their preview stamps; no receipts or stored edit metadata were added.

Exported the existing company-date rule through `lib/companyDates.ts` and `lib/companyWrites.ts`. After the task commit, deadline changes on open company tasks update company target/last action together in the separate company project's transaction. A failed company write restores the entire task list, including deletes and freed subtasks; rollback checks the committed after states before restoring so it cannot overwrite a later edit. Calendar sync then handles marked/previously marked listed tasks and freed/reparented marked subtasks; failures stay per task and retries repair them without recreating deleted tasks or duplicating events.

DECISION: Keep the company-date rule in a pure shared module and re-export it from companyWrites, rather than import browser write guards into server code, so both paths retain the same B12 rule.
DECISION: Require seen stamps for every previewed task, including freed subtasks, rather than only explicitly listed IDs, to protect the delete's side effects and identify those subtasks for calendar retries.
DECISION!: When several open tasks change one company's deadline, the last listed deadline wins, rather than inventing a minimum/maximum rule, matching consecutive app saves.

Checks:
- `npx tsc --noEmit` — passed.
- `npx eslint lib/companyDates.ts lib/companyWrites.ts lib/taskEditServer.ts lib/taskEditTools.ts lib/taskEditApply.data.test.ts tests/unit/taskPlanTools.test.ts app/api/mcp/[secret]/route.ts` — passed.
- `npm run test:unit` — 46 files / 1,357 tests passed, including save-tool registration, independent flags, retained-callback gating, strict stamp/acknowledgement schemas, origin forwarding and safe/actionable errors.
- `npm run test:data` — 12 files / 244 tests passed; 24 new T04 cases cover exact mixed after states, unchanged document update times on retry, stale listed/freed tasks, fresh transactional reads, a concurrent-edit retry, simultaneous identical saves, new children, changed move eligibility, warning refusal, company isolation/order/real denied-write rollback, and fake-calendar updates/removals/failures/retries. Owned emulator stopped.
- `npm run build` and `MCP_TASK_EDITS_ENABLED=0 npm run mcp:smoke -- --only=protocol` — passed; 115 database-preservation comparisons, with owned test servers stopped. Enabled edit HTTP scenarios remain assigned to T05/E1.
- Own diff review / `git diff --check` — clean; reviewed all-or-nothing task writes, stale checks before mutation, warning gating, no browser imports, retry matching/timestamps, independent company-task dates, guarded cross-project compensation and calendar work after saving.

No browser/screenshots: no screen changes (`[no look]`). All data checks used the local emulator and fake calendar; no production data/settings changed. Full smoke/a11y/compare remain scheduled for R1a; a full check is worth running for shared-library changes. T05 was not started.
