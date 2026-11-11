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

## R1b.F1 — Keep company task drafts safe while companies load (2026-11-11)

`TaskSheetHost.tsx` now waits for an error-free server company snapshot before initializing a linked task's editor. An empty device cache or failed listener cannot initialize it as Internal. The existing editor stays mounted after opening, preserving typing through offline snapshots and reconnects. Waiting, offline and failed-load states reuse the design's skeleton and empty-state components; a failed listener offers Reload before any editable draft exists. A server-confirmed absent company still uses the existing Internal rule in `draftFromTask`; no draft fields, save logic or stored schema changed.

The small emulator fixture has two tasks with different dates and one company with its own dates. Blocking only the company stream reproduced the incorrect Internal editor on desktop and phone before the fix (both regressions failed at `Loading the company`). After restoring the stream, the same open sheet shows Client work and Halcyon Logistics. An offline save is refused without losing typing; after reconnect, saving changes only the description, leaving the link and every other stored field of that task, the other task and the company unchanged. Separate cases cover a real denied company read/reload and a server-confirmed missing company without clearing its stored link.

Checks:

- `npx tsc --noEmit` and `npx eslint features/task-sheet/TaskSheetHost.tsx tests/smoke/task-sheet-company-loading.spec.ts` — final versions passed.
- `npm run test:unit` — 46 files / 1,358 tests passed.
- `npm run test:data` — 12 files / 244 tests passed, emulator only.
- `npx playwright test tests/smoke/task-sheet-company-loading.spec.ts tests/smoke/task-sheet.spec.ts --output=redesign/compare/r1bf1-tests` — 21 passed; only the delayed-company case reran after adding offline captures (2 passed) and waiting for the reconnect toast to expire (2 passed).
- `npm run build` — passed compilation, TypeScript and static-page generation; no test used the production build.
- Own diff review, `git diff --check`, and original-size desktop/phone look check with native edge crops — passed; initialization is gated, no new writes exist, and the confirmed-deletion rule remains intact.

Gallery: `redesign/compare/r1bf1-gallery/` contains before, waiting, offline, loaded and failed frames at 1440×900 and 390×844, with `*-edge.png` crops at native scale. Sources are `r1bf1-before/`, `r1bf1-tests/`, `r1bf1-offline-tests/` and `r1bf1-settled-tests/`; logs are `/tmp/deus-r1bf1-*.log`.

LOOKED: before-desktop.png · The right sheet sits over the blurred list, wrongly says Internal and lacks the company card; its footer and text fit. Fixed by waiting for company confirmation.
LOOKED: before-phone.png · The bottom sheet fills the width; Internal is wrongly selected and the development error badge overlaps Save. The company fault is fixed; final captures exclude the development-only badge.
LOOKED: waiting-desktop.png · Skeleton blocks sit inside the right sheet above empty space, over the blurred list; loading text and close control are whole, with no edge clipping or overlap.
LOOKED: waiting-phone.png · Skeleton blocks sit below the sheet header; the sheet meets the bottom edge, all loading text is readable, and no form or action is obscured.
LOOKED: offline-desktop.png · The Wi-Fi icon and two-line explanation sit near the top of the right sheet; nothing overlaps or clips their text.
LOOKED: offline-phone.png · The icon sits above the centered explanation on the bottom sheet; the message wraps inside the edges and the close control remains clear.
LOOKED: loaded-desktop.png · The company card sits below About and above the remaining fields; the pinned footer is in front of the scrolling body, all visible controls are whole, and lower fields continue below the fold.
LOOKED: loaded-phone.png · The company card and description are on the first screen above the pinned actions; the subtask placeholder ellipsizes and Priority continues below the scroll boundary, while company text and action labels remain whole.
LOOKED: failed-desktop.png · The building icon, failure explanation and Reload stack inside the right sheet over the blurred list; no text, control or sheet edge is clipped or overlapped.
LOOKED: failed-phone.png · The same stack fits inside the bottom sheet, with Reload below the readable explanation and close above it; edges and text are unobstructed.

Picture faults addressed: the before frames' wrong kind/missing company are fixed; the development-only error badge is excluded from screenshots; the transient reconnect toast initially covered lower phone form text, so the final loaded frames wait for it to disappear. The existing scrolling form and ellipsized input hint remain intentional; no new clipping was found in waiting/offline/error states.

DECISION: Require a confirmed server company snapshot before opening a linked draft, rather than treating an empty cache/error as deletion; preserve the mounted editor once it opens so reconnects cannot discard typing.
DECISION: Offer Reload for a failed initial listener, rather than resetting live drafts or changing the shared subscription hook; Firestore closes that failed listener, and no editable draft exists yet.

Run notes: the first network fixture held the handshake and never emitted the needed empty cache; it was corrected before the failing-before proof. One browser run and an intermediate type-check shell ended with signal 143; the browser's owned servers/controller were stopped and checks reran in isolated process sessions. A restart first reported `http://127.0.0.1:8180 is already used`; that owned leftover was stopped before the successful run. The e2e guard refused three specs, so the run was narrowed to the new regression plus its page spec (no chat-tool code changed). A stale owned emulator hub caused a warning during the successful data run and was stopped. No production data or settings changed. Only R1b.F1 is ticked; the large stress recapture and viewport repair remain for R1b.F2, which was not started.

### R1b.F1 — Fresh-eyes follow-up (2026-11-11)

Opened all four checker copies in `/tmp/autorun-fresh-s9pg3v/` at original resolution, plus native crops of the suspected ghost content and toast border. SHA-256 comparison confirmed that 01 and 02 are the **before-fix** desktop/phone pictures in `r1bf1-before/`; 04 is the earlier, unsettled desktop picture in `r1bf1-tests/`, not the final loaded picture. Only 03 was the final failure state from that run. These historical files remain unchanged as evidence.

Fixed the remaining context problem in 03: the failed-load message now names the saved task, with wrapping for long names, before offering Reload. The existing regression asserts that identity while confirming that no editable draft or Save action exists. Moved R1b's closing evidence paragraph back under R1b so it no longer appears to describe F1's changed files and checks.

| Reported item | Disposition |
|---|---|
| 01: development issue pill covers sidebar status | Before-fix capture; caused by the deliberately failed emulator stream, not a production control. Existing final screenshot options omit the development overlay. |
| 01: wrong Internal draft with no loading cue | Real original bug, already fixed in `af81df8`; the fresh desktop capture shows Loading the company and no editable draft. |
| 02: development issue pill covers Save | Same before-fix development overlay; absent in fresh captures. There is no Save action while the company is unverified. |
| 02: wrong Internal draft with no loading cue | Same original bug; the fresh phone capture shows the spinner/skeleton state until the company is confirmed. |
| 02: truncated subtask example | Retained: the single-line input ellipsizes its example, while “Add a subtask” and its accessible label remain complete. It is not truncated saved data. |
| 03: faint ghost shapes | No leftover form controls are visible in the full-size view or native middle crop; the design uses a 94%-opaque sheet with 30px backdrop blur. The test confirms no Description field is mounted. |
| 03: generic unchanged message and no editable task | Task identity fixed in the message. Editing stays blocked until company data is verified; the normal-height sheet intentionally has empty space below its error state. |
| 04: toast crosses the sheet border | The native crop shows overlap only with the outer gutter, left of Delete; no action or label is obscured. The design keeps toasts centred on the viewport. Fresh loaded captures wait until the temporary toast expires. |

DECISION: not fixed again the 01/02 issue pills and wrong Internal drafts, because these copies are byte-identical to before-fix evidence; `af81df8` already gates the draft, and production does not include the development badge.
DECISION: not fixed the 02 example ellipsis or 03 faint backdrop shapes, because the approved single-line capture and translucent sheet account for them; the instruction remains readable and no hidden editor is mounted.
DECISION: not fixed the 03 blocked editing/full-height blank area, because opening an unverified draft would reintroduce the data-safety bug; the message now identifies the task without opening an editor.
DECISION: not fixed the 04 noninteractive border overlap, because the approved viewport-centred toast leaves Delete and its label clear; final still pictures are taken after it expires.

Recorded the applicable existing design rules in `docs/approved-looks.md`, with source references and explicit limits: clipped saved text or obscured actions remain faults.

Checks:

- Final `npx tsc --noEmit` and changed-source ESLint — passed.
- `npm run test:unit` — 46 files / 1,358 tests passed.
- `npm run test:data` — 12 files / 244 tests passed, emulator only.
- `npx playwright test tests/smoke/task-sheet-company-loading.spec.ts --output=redesign/compare/r1bf1-fresh-tests` — 5 passed, including desktop/phone failure identity, delayed loading, offline/reconnect, exact saved-field preservation and confirmed deletion; only this affected capture spec reran for the wording change.
- `npm run build` — passed; all browser/data checks used the emulator dev server, never the production build.
- Full-size look check with native crops and `git diff --check` — passed; no new text/edge clipping or action obstruction in the corrected failure state.

**Current-only gallery:** `redesign/compare/r1bf1-fresh-gallery/` contains eight key frames and ten native-scale crops; no before-fix pictures. Logs: `/tmp/deus-r1bf1-fresh-*.log`. R1b.F1 remains complete; R1b.F2 was not started.

LOOKED: waiting-desktop.png · Spinner and skeletons sit inside the right sheet over the blurred list; text and close control fit, with no Internal draft or Save button.
LOOKED: waiting-phone.png · Skeletons sit below the header of the bottom sheet; loading text is whole, edges fit the viewport, and no action is covered.
LOOKED: failed-desktop.png · Building icon sits above the named-task explanation and Reload in the right sheet; all text is whole and the body below contains no visible form controls.
LOOKED: failed-phone.png · Named-task explanation wraps into two lines above Reload; the icon, message and button stay inside the bottom-sheet edges without overlap.
LOOKED: loaded-desktop.png · Company card sits between About and the group field; pinned actions sit below the scrolling form, with no toast crossing the border in this settled frame.
LOOKED: loaded-phone.png · Description and company card are on the first screen above the pinned actions; the example hint ellipsizes and Priority continues below the scroll boundary, while company/action text stays whole.
LOOKED: offline-desktop.png · Wi-Fi icon and explanation sit near the top of the right sheet over the blurred list; text wraps without clipping and no unsafe editor is shown.
LOOKED: offline-phone.png · Icon sits above the complete two-line explanation; the bottom sheet meets the screen edges and neither text nor close control is obscured.

## R1b.F2 — Keep the stress task sheet inside the phone capture (2026-11-11)

The overflow came from the phone task-group strip, not the sheet. Its absolute `.sr-only` “important” labels used the page as their containing block; the third label occupied x=477–478 outside the scrolling strip. A small fixture with three starred groups, one company and one task reproduced a 478×1035 layout viewport inside a 390×844 capture. Adding `position: relative` to `.chips` contains those labels without changing the sheet or its tokens. Long unbroken group/task text, company/kind and Save now fit the capture.

`auditLayout` compares geometry with Playwright's capture size, rather than the already-expanded `innerWidth`. It reports expanded viewports, horizontal overflow, offscreen dialogs, missing/offscreen task controls, covered controls, overflowing visible text and unloaded images. Comparison reports now include that geometry plus console/page errors; an unavailable editor is captured with errors instead of silently losing its diagnostics. State 065 also verifies its saved description, company and kind. Screen-reader-only labels and deliberately scrolled content are excluded from visible-text checks.

Only state 065 was recaptured, at 1440×900 and 390×844, after F1. Desktop sheet: `(884,16,540,868)`; phone sheet: `(0,28,390,816)`. Both show the complete task description, the correct PT Sinar Nusantara company and Prospect work, and an unobscured Save changes action. Both report zero layout/runtime errors. The task-specific gallery is `redesign/compare/r1bf2-gallery/`; the two canonical `new/065-*` images, their pairs and report entries were refreshed, retaining the existing prototype images and every other state's output.

**Remaining emulator-only limitation:** the documented 3,200-company Listen-channel limit remains. The focused capture uses all 2,408 stress tasks, all 48 groups and all 179 companies referenced by those tasks; only unrelated companies are omitted. Every task retains its original company, kind and fields. Counts and this limitation are explicit in each `065-*-report.json`. This does not prove the full 3,200-company stream; it was not retried here.

Checks:
- Before fix: `npx playwright test tests/smoke/chat-task-edits.spec.ts --grep 'R1b.F2' --project=phone --output=redesign/compare/r1bf2-minimal-before` — layout regression failed at expected 390×844 versus received 478×1035; missing/offscreen-sheet audit case passed. The audit listed the offscreen sheet, description and Save.
- After fix: the affected `chat-task-edits.spec.ts` — 10 passed (1.3m), covering HTTP edits/calendar, moves/deletes, existing sheet cases and both viewport/audit shapes. Added 065 capture cases then ran alone — 2 passed (46.1s); screenshots and reports in `r1bf2-stress-tests/`.
- `npx tsc --noEmit` and changed-file ESLint — passed, including the final capture test; `npm run test:unit` — 46 files / 1,358 tests passed. No product Firestore reads/writes changed, so data tests were not required.
- Full-size look: four current key frames and native edge/footer crops inspected, plus the failing phone frame. The broken right edge/offscreen actions are fixed; current long company names use the existing ellipsis, closed native group selects shorten their values, and lower fields continue in the scrolling body behind the pinned footer.
- Scoped `npm run compare -- --only '^065-task-details-stress$' --force --reuse-proto` was refused before execution by the e2e guard, which classifies compare as a full check. Used its permitted affected-spec path for the 065 captures instead. No full comparison ran; refreshed report entries identify the focused capture and omit stale whole-page text comparisons. Initial diagnostic setup used the wrong Save label and hit Playwright's CJS/import.meta conversion error; both were corrected before the final failing-before proof.
- `npm run build` — passed outside the sandbox, including TypeScript and static-page generation. The first sandbox build stalled for four minutes at `Creating an optimized production build ...`; only its recorded PIDs were terminated (exit 143) before the successful retry. No browser/data tests used the production build. Diff review and `git diff --check` passed.

DECISION: Contain hidden group labels in their scrolling strip instead of changing fixed-sheet dimensions; the measured overflow source disappears and existing sheet geometry stays intact.
DECISION: Keep every stress task and its linked company, omitting unrelated companies from the capture instead of retrying the known emulator listener limit; this preserves the task-sheet content and makes the remaining limit explicit.

LOOKED: r1bf2-gallery/minimal-desktop.png · The drawer floats above the blurred task list with all edges inside the frame; the unbroken title wraps fully, Halcyon and Client work are readable, and the footer supports unobscured actions. The long native group selection shortens at its right edge.
LOOKED: r1bf2-gallery/minimal-phone.png · The bottom sheet rests on the viewport base above the blurred list; its title wraps, Halcyon and Client work fit, and Save occupies a clear bottom row. The group selection shortens; lower fields scroll behind the footer.
LOOKED: r1bf2-gallery/065-desktop.png · The drawer sits within a 16px outer gutter over the blurred stress list; its complete description and Prospect work are readable, the company name has an ellipsis, and Save is clear. The next body label meets the scrolling cutoff above the footer.
LOOKED: r1bf2-gallery/065-phone.png · The sheet rests on the bottom edge with a 28px top gap; the whole description, Prospect work and company card precede the pinned footer, which covers no action. The long company name is ellipsized; lower fields scroll.

Changed files: `features/tasks/Tasks.module.css`, `scripts/compare/layout.mjs`, `scripts/compare/run.mjs`, `tests/smoke/chat-task-edits.spec.ts`, this results file and `docs/IMPLEMENTATION_PLAN.md`. No product data/settings changed. R1 was not started.
