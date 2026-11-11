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

## T05 — Chat guidance and MCP smoke (2026-11-11)

Added one-paragraph `TASK_EDIT_CHAT_GUIDANCE` in `lib/taskEditTools.ts`, repeated in all three edit descriptions and composed with independently enabled plan guidance in the MCP route. Covers finding/showing current tasks, individual before → after changes, no guessing tasks/dates/times/people, preview, every warning and named delete confirmation, exact stamps/acknowledgements, refreshed confirmation after stale previews, exact retries, honest per-task/calendar results and separate saves for edits/new plans.

Added `scripts/mcp/task-edit-smoke.mjs` through the existing protocol runner. Unset edit flags hide/refuse all three tools with plans off and on; the separate enabled server lists all nine tools and supplies both workflows. Over HTTP, the edit section finds a main task/subtask with current fields, checks read-only previews and warning confirmation, simulates a concurrent edit and refuses the entire stale list, re-previews, saves the exact after states while preserving unlisted tasks, then retries without changing values or task document update times. Database-preservation snapshots now include fake calendar events.

DECISION: Keep edit guidance with the edit tools, rather than the plan module, so tool descriptions and independently gated server instructions share one source.
DECISION: Exercise unset and enabled edit flags in one protocol run with separate owned servers, rather than rerun the whole smoke, preserving the legacy/plan tool-list contracts.
DECISION: Compare Firestore update times as well as values on retry, rather than values alone, to detect an identical rewrite.

Checks:
- `npx tsc --noEmit` — passed.
- `npx eslint app/api/mcp/[secret]/route.ts lib/taskEditTools.ts tests/unit/taskPlanTools.test.ts scripts/mcp/smoke.mjs scripts/mcp/protocol-smoke.mjs scripts/mcp/task-edit-smoke.mjs` — passed.
- `npm run test:unit` — 46 files / 1,358 tests passed; instruction composition/absence is checked for independent flags, every edit description carries the guidance and its confirmation/no-guessing rules are covered.
- `npm run test:data` — 12 files / 244 tests passed with the local emulator and fake calendar; owned emulator stopped.
- `npm run build` and `env -u MCP_TASK_EDITS_ENABLED npm run mcp:smoke -- --only=protocol` — passed; enabled edits and unset-flag absence/refusal checked in the same run, 127 database-preservation comparisons, owned servers stopped.
- Own diff review / `git diff --check` — clean; checked independent instruction gating, unchanged save/input handlers, full-list stale refusal assertions, exact saved records, retry update times and emulator/fake-calendar isolation.

No browser/screenshots: no screen changes (`[no look]`). Full smoke/a11y/compare remain scheduled for R1a; a full check is worth running for shared-library changes. E1 was not started. No production data/settings changed; activation remains O1.

## E1 — End to end (2026-11-11)

Added `tests/smoke/chat-task-edits.spec.ts`: two desktop scenarios use the real MCP SDK over HTTP, with find → read-only preview → apply using the returned stamps and acknowledged warnings. Playwright's isolated emulator/dev server enables the edit tools with a fictional secret; production activation is unchanged.

The first scenario seeds a main task with two subtasks, syncs the marked subtask to the fake calendar, then renames it, changes both dates, marks it Done and adds a Responsible person. Its finished-task sheet shows all four, the calendar retains exactly one event with the same ID and updated name/dates, and the unlisted main task and other subtask stay unchanged. Deleting the marked task removes it from find/the main task's sheet and leaves zero active events, with the original event recorded as cancelled.

The second scenario moves a subtask to another main task, checks the new parent's sheet and its absence from the old parent's subtasks, frees it into a main task, then deletes its original main task. The unlisted sibling survives as a main task in its sheet and the task list; the deleted main task is absent.

DECISION: Enable edits and a fixed fictional secret in Playwright's local server, rather than require caller environment overrides, so the prescribed standalone browser command works.
DECISION: Assert cancellation of the original fake-calendar event and zero active events, rather than physical deletion, matching the existing fake calendar's Google-style tombstones.

Checks:
- `npx tsc --noEmit` — passed after validating MCP responses with `CallToolResultSchema` to resolve the SDK's ambiguous content type.
- `npx eslint playwright.config.ts tests/smoke/chat-task-edits.spec.ts` — passed.
- `npm run test:unit` — 46 files / 1,358 tests passed.
- `npm run test:data` — 12 files / 244 tests passed on the local emulator and fake calendar.
- `npm run build` and `env -u MCP_TASK_EDITS_ENABLED npm run mcp:smoke -- --only=protocol` — passed; protocol smoke made 127 database-preservation comparisons, including enabled edits and unset-flag tool absence.
- `npx playwright test tests/smoke/chat-task-edits.spec.ts`, then `--last-failed` only — both distinct desktop scenarios passed. Initial edit-scenario failures were `getByRole('dialog', { name: 'Task', exact: true })` not finding the existing `Finished task` sheet, then `expect(await events()).toEqual([])` finding the fake calendar's cancellation tombstone. Corrected those test assumptions; hierarchy passed in the original run and edit/calendar passed in the final rerun (1 test, 21.2s).

Diff review checked the HTTP-only save boundary, emulator/fake-calendar isolation, no-write previews, task-sheet assertions, unchanged unlisted task dates and duplicate-free event update/removal. Owned test servers stopped; restored historical tracked test artifacts cleared by Playwright. No screenshots or phone-layout checks: no screen changes (`[no look]`). Full smoke/a11y/compare remain assigned to R1a, which was not started. No production data/settings changed; activation remains O1.

## R1a — Full check run (2026-11-11)

Failure inventory: no failed smoke tests, accessibility violations, accessibility setup errors, compare capture failures or compare setup errors. No fixes made; each requested slow check ran once. The comparator's text differences below remain for R1b to triage; they are not confirmed product faults.

Checks:

- `npm run test:smoke -- --reporter=list,json --output=/tmp/deus-r1a-bInwJT/smoke-artifacts` (with `PLAYWRIGHT_JSON_OUTPUT_NAME=/tmp/deus-r1a-bInwJT/smoke.json`) — 399 passed, 9 skipped, 0 failed/flaky; all 408 scheduled tests, desktop/phone/Jakarta, 29.0 minutes.
- `npm run a11y` — 284 desktop/phone state runs, 0 failed states, 0 setup errors, 0 rule violations. Used the script's default `--distinct` scope, without stress states.
- `npm run compare -- --only 'task-details-|156-company-record-task-then-open-company' --force` — all 11 mapped task-sheet states at desktop/phone (22 pairs), including stress and the alternate entry point; 0 capture failures, 0 setup errors. Text differences in all 22 pairs, detailed below.
- `npx tsc --noEmit` — passed, no diagnostics.
- `npm run test:unit` — 46 files / 1,358 tests passed.

Compare observations (source: `scripts/compare/run.mjs:170`): every pair reached the comparator's 40-line cap on **each** of `onlyProto` and `onlyNew`; these are capped inventories, not complete counts of differences. The tool compares whole-page text and generates pictures; it has no pixel-difference pass/fail threshold. Each row below covers both viewports and records their first prototype-only → app-only text. These observations are assigned to R1b for scoped triage; no wording or baseline changes are approved here.

| State ID | Desktop first difference | Phone first difference |
|---|---|---|
| 059-task-details-quick | Team desk → DEUS Team Space | Q4 → QP |
| 060-task-details-all-details | Team desk → DEUS Team Space | Q4 → QP |
| 061-task-details-open | Team desk → DEUS Team Space | Q4 → QP |
| 062-task-details-company | Team desk → DEUS Team Space | Q4 → QP |
| 063-task-details-internal | Team desk → DEUS Team Space | Q4 → QP |
| 064-task-details-finished | Team desk → DEUS Team Space | Q4 → QP |
| 065-task-details-stress | Team desk → DEUS Team Space | G3 → EV |
| 066-task-details-suggestions | Team desk → DEUS Team Space | Q4 → QP |
| 067-task-details-new-name | Team desk → DEUS Team Space | Q4 → QP |
| 068-task-details-confirm | Team desk → DEUS Team Space | Q4 → QP |
| 156-company-record-task-then-open-company | Team desk → DEUS Team Space | Q4 → QP |

DECISION: Force fresh captures for all 11 mapped task-sheet states rather than reuse cached pictures, so the comparison reflects this run.

Raw local evidence: `/tmp/deus-r1a-bInwJT/` holds command logs/exit codes, the smoke JSON/artifacts, the a11y JSON and the 22-entry scoped `compare.json`. Generated pictures and reports remain in ignored `redesign/compare/` and `redesign/a11y/`. No visual inspection was performed (`[no look]`), so this does not claim visual parity with the prototype.

ESLint is not applicable to these Markdown-only changes. No Firestore-I/O code changed, so no additional data/MCP run was required. Browser checks used `next dev` with the emulator and fake calendar, never a production build or Google. Owned test ports 3100/8180/4100 were closed after the runs. Smoke-generated changes to 13 historical tracked PNGs were discarded; they are not fixes or deliverables. No production data/settings changed. Only R1a is ticked; R1b and R1 were not started.

## R1b — Fix recorded failures (2026-11-11)

Findings first (full-size pictures and code, before accepting the comparator's empty error lists):

| Finding / breaking state | Location | Disposition |
|---|---|---|
| People suggestions exist below the scrolling body, hidden by the pinned footer, when Responsible or Informed is near the bottom. | `ui/Combobox.tsx:47` | Fixed: reveal the list when it opens/changes. Existing and new-name choices are fully visible and clickable on desktop/phone. |
| State 061 opens Add task type instead of showing the missing-description error: the generic Add selector matches the new type button. | `scripts/compare/recipes.mjs:98` | Fixed: click the exact Add task button. Both viewport regressions failed before and pass after. |
| State 065's company-linked task opens as Internal without its company card; a failed/late company source is treated as usable by the initial draft. | `features/task-sheet/TaskSheetHost.tsx:94`, `features/task-sheet/TaskSheet.tsx:75` | Routed to **R1b.F1** before R1. The redesign plan's 4.4c/4.4d already record the 3,200-company emulator Listen limit; a small delayed-company regression must distinguish that from unsafe draft initialization before changing loading/saving code. |
| State 065 phone contains only the blurred background, although compare reports no errors. The sheet is below the capture: box `(0,1613,1122,816)` in a 390×844 shot, with `innerWidth/Height=1122×2429`. | `ui/Sheet.module.css:113`, `scripts/compare/run.mjs:167` | Routed to **R1b.F2** before R1: locate the overflow source, add a failing small-fixture/layout check and recapture only 065 after F1. Waiting for Description and disabling screenshot animations did **not** fix this; no claim of stress parity. |

Every R1a comparison row is accounted for at both sizes:

| States | Why the remaining text differences stand |
|---|---|
| 059, 060, 062, 063, 064, 068, 156 | Full-size inspection found the expected quick/full, company/internal/finished and delete-confirmation sheets. Whole-page comparisons include the blurred task list/sidebar, accessible sort text, and converted fixtures. `Team desk` is explicitly a placeholder (guide §9); DEUS Team Space is the shipped name (redesign Q5). Group initials and task types come from the existing converter; status, subtasks, parking, calendar and Add task type are later features. Restoring prototype-only copy/fixtures would undo those decisions. No change or recapture needed. |
| 061 | Correct validation state recaptured at both sizes; the above background/fixture differences remain intentionally. |
| 066, 067 | Suggestions/new-name lists recaptured above the footer at both sizes; the above background/fixture differences remain intentionally. |
| 065 | Unresolved company-kind and phone visibility faults are explicitly assigned to R1b.F1/F2; the large fixture's emulator limitation is retained as a limitation, not reported as a passing product check. |

Checks:

- Type check: `npx tsc --noEmit` — passed.
- Changed-file ESLint: picker, comparison scripts and chat spec; 0 errors, 3 pre-existing unused-variable warnings in `recipes.mjs` (`behind`, `press`, `first`).
- `npm run test:unit` — 46 files / 1,358 tests passed.
- Browser: four focused regressions passed after failing before; `npx playwright test tests/smoke/chat-task-edits.spec.ts tests/smoke/task-sheet.spec.ts:151 --output=redesign/compare/r1b-final-tests` — 7 passed (3.1m), including visible/hit-tested choices, no sheet overflow, HTTP edits/calendar, moves/deletes and keyboard people entry.
- Scoped compare: only 061/065/066/067 at desktop/phone, 8 captures; 061/066/067 corrected, 065 retained as the two explicit fix rows. No full smoke/a11y/compare rerun.
- Build: `npm run build` — passed, including TypeScript and static-page generation; no browser/data test used the production build.

Local evidence: `redesign/compare/r1b-gallery/` holds eight named key frames, eight 100% edge crops and `stress-layout.json`; originals and prototype pairs remain under `redesign/compare/{new,proto,both}/`. Before frames/crops are in `r1b-before/`; failing and passing targeted cases are in `r1b-people-before/`, `r1b-regressions-before/`, `r1b-regressions-after/`, and `r1b-final-tests/`. Logs are `/tmp/deus-r1b-*.log`. The first regression run stopped on a Playwright ESM import; that test setup was corrected. The first scoped comparator ended with signal 143 before producing captures; rerunning its four states against the same owned local servers completed. The failed Pillow crop attempt wrote no files; native-size crops were then made with the installed Sharp package.

DECISION: Keep documented branding, fixture conversions and later features instead of restoring prototype placeholder text; triage the actual visible differences.
DECISION: Split the two remaining stress areas into fresh tasks before R1 rather than mix snapshot/save changes and a viewport investigation into this quick repair. Neither follow-up nor R1 was started.

All eight gallery key frames and the critical footer/edge crops were opened at original resolution. Six repaired-state pictures show whole validation/suggestion text above the pinned actions; the two stress pictures retain the faults assigned above. All R1a rows have a fix or an explicit disposition. R1b is ticked; R1b.F1/F2 and R1 stay unticked. Owned ports 3100/8180/4100 were confirmed closed.

Only the picker, comparison tools, chat spec and this plan/brief/evidence changed; no Firestore read/write code or production data/settings changed, so no additional test:data/MCP smoke run was needed. A full check is worth running for the shared picker change; the full R1a suites were not repeated.
