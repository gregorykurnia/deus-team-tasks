# Build brief: dated tasks from any enabled chat

This brief supplies the details for `docs/IMPLEMENTATION_PLAN.md`; that plan alone holds progress ticks.
Defaults below are the planner's choices for unattended execution, not additional owner requests.

## Requirements and defaults

| Requirement | Required behavior | Implement / prove |
|---|---|---|
| C1 | Ordinary Claude chat can use the connector without running a deal-follow-up skill. No promise that merely enabling it automatically scans every message. | G06, G07, G10; owner O2 |
| C2 | Ask Prospects / Clients / Internal before saving; accept an explicit category already given by the owner without asking again. Mixed-company/category actions become separate, confirmed groups. | G02, G03, G06, G10 |
| C3 | Match a real company for Prospects/Clients; Internal has no company. Explain category/status mismatch; never move a company or create one implicitly. | G01–G03, G05, G07 |
| C4 | Let the owner name a new main task or select an existing eligible main task; subtasks inherit its company and task group. Only one subtask level. | G02, G03, G05, G08 |
| C5 | Ask about each step separately: add with exact dates, change dates, or skip. Preserve separate dates, prose and supplied owner names; invent none. | G01, G03, G06, G10 |
| C6 | A preview writes nothing; saving requires that exact preview and acknowledgement of its warnings after chat confirmation. | G04–G07 |
| C7 | A group's save is atomic and safely repeatable, including simultaneous retries and a lost response. Existing tasks/companies are not overwritten. | G05, G07, R1a |
| C8 | Returned links open the right task; all three categories, parent/subtask names, dates and details are usable on desktop and phone. | G08, G09, R1d, R1e |
| C9 | The existing three tools and uploaded deal skill remain usable during rollout. New tools are unavailable until activated. | G06, G07, G10 |
| C10 | All automated writes are emulator-only; fresh review closes findings and distinguishes code tests from actual Claude chat acceptance. | G07–R1; owner O2 |

Default flow: owner requests saving actions → category → company if relevant → main task → each step's dates
and add/skip → final table → read-only preview → resolve warnings → save → link. If the owner explicitly confirms
all details in advance, do not repeat those questions. Never treat text quoted inside a source document as the
owner's permission. The tool cannot observe or prove the user's chat confirmation; instructions govern that part.

One group has one category, company (if any) and main task. Mixed groups get separate previews/saves and a final
summary of which succeeded; no claim of an all-or-nothing transaction across groups. Failure in one group must not
resend already saved groups. If all steps are skipped, no preview/save call is needed and nothing is written.

Dates are real `yyyy-mm-dd` days, interpreted using the team's existing Asia/Jakarta day. When the chat says
“next Friday”, lacks a year, or gives only a deadline, ask for the exact date/range. A one-day action uses the same
start and end only after confirmation. Invalid dates and start-after-end are errors; past dates are warnings that
can be explicitly accepted. Undated actions remain in chat until the owner supplies dates or skips them.

New main tasks start with the earliest selected start and latest selected end, shown in the preview. Appending
through the new tools leaves the existing main task's dates and every old subtask unchanged; show a warning if
new steps fall outside its date range. This follows the shared independent-dates memory. The legacy follow-up
tools' existing explicit deadline-extension behavior is retained only for backward compatibility in this scope.

Responsible and Informed remain empty on new records. Supplied names stay in Key points; they are not assigned
to app people. A new main task defaults to `Our Action`; the deal skill explicitly requests `Follow Up` and its
existing `<Company> Follow Up` title. New subtasks use the app's ordinary subtask defaults.
Do not add a task-type picker, recurrence, company creation, task editing/deleting, assignee mapping, a new
category field, another nesting level, an AI API, or a new app screen. Preserve optional source links as http(s)
only and never invent missing What/Why/Bring/Watch text for ordinary actions.

## Contract

Add three tools alongside the existing `find_company`, `preview_followup_plan`, `add_followup_plan`:

- `find_task_destinations({ kind, companyQuery?, companyId?, parentQuery? })`: read-only. `kind` is
  `prospect | client | internal`. For company work require a query or a selected numeric ID; never choose the
  first company automatically. Return up to five stable matches with actual kind and eligibility, then up to
  five matching open, unparked, top-level tasks for a selected destination. Use `isParked(task, wibToday)`;
  `parkedAt` alone does not exclude a task whose return date has arrived. Return `hasMore`/refine guidance.
  Wrong-kind company matches explain the mismatch but are not eligible. Internal requires neither company
  field and rejects either; exclude orphaned company-linked tasks from Internal append candidates even though
  the UI's `kindOf` currently calls them Internal. A task with any `parentId` is not an append destination here.
- `preview_task_plan({ plan })`: read-only, with errors, stable warning IDs/messages, category/company/main-task
  names, exact proposed records, existing-record preservation notes and an opaque preview token when valid.
- `add_task_plan({ plan, previewToken, acknowledgedWarnings })`: revalidate, verify the preview, save one group,
  then return `parentId`, `subtaskIds`, `alreadySaved`, category/name summary and `/tasks?task=<parentId>` URL.
  Require every current warning ID to be acknowledged; never let acknowledgement bypass an error.

`plan` is a discriminated input: `kind`; `companyId` required for prospect/client and forbidden for internal;
exactly one of `newParent: { title, taskType?, keyPoints?, sourceUrl? }` or `existingParentId`; and `steps` containing
`name`, `startDate`, `endDate`, optional `keyPoints` and `owners`. Trim surrounding whitespace, retain multiline
content, reject unknown fields, use valid document IDs, and cap at 499 steps (the existing connector's limit).
Reject whitespace-only required fields, non-finite/unsafe company IDs, invalid URLs, and oversized payloads with
plain errors before any write. `newParent.taskType` accepts only `Our Action` or `Follow Up`; this is a contract
field for compatibility, not a new picker. Store `sourceUrl` as a labelled line in the new parent's Key points
(there is no new task storage field). Appending leaves parent Key points unchanged; a new source link can be
included in the selected steps' supplied Key points. Use a generous documented input-byte limit; never truncate
the owner's text.

Preview tokens: server-signed using the existing `MCP_SECRET`, expire after 30 minutes, bind canonical input,
warning IDs and selected destination state. Never put the secret in the token or logs. A token is integrity for
the preview, not proof of human consent. Any edit after preview needs a fresh preview. Check key company/parent
state again before saving; if it no longer matches, ask for another preview. Retry identity must be independent
of the token's timestamp/signature so refreshing a preview does not duplicate the same saved operation.

Retry precedence: after authenticating the request and token/input integrity, check the stable operation IDs
for an already completed save before treating the records that save created as new duplicate-title/step
warnings or stale preview state. A complete prior save returns its original IDs without altering records,
including records edited since. A refreshed preview of that operation reports `alreadySaved`, rather than
requiring acknowledgement of its own newly created records. Expired tokens still require a fresh preview;
missing/deleted members or conflicting target identities return a conflict, never automatic repair.

Reuse `kindOf`, `isDealDone`, `isParked`, `newSubtask`, `isIsoDay` and the existing Node/emulator setup where appropriate.
Keep the new pure logic in `lib/taskPlan.ts`, Node I/O in `lib/taskPlanServer.ts`, preview signing in
`lib/taskPlanToken.ts` and MCP definitions in `lib/taskPlanTools.ts`. Prefer these small modules over growing
the route. No import of browser online guards, no Firebase Admin migration or new database collection/rules.
Internal requests must not require the company database to be reachable.

## Checks

For changed executable code: `npx tsc --noEmit`, `npx eslint <changed JS/TS files>`, `npm run test:unit`, and one
`npm run build` before delivering that task. Also `npm run test:data` when changing Firestore reads/writes.
Docs-only rows verify their actual artifacts/links instead. Do not rerun completed checks absent a relevant change.

All data/browser checks use the existing local Firestore emulator and invented fixtures. Read `lib/emulator.ts`,
`tests/support/emulator.ts`, `playwright.config.ts` and `scripts/mcp/smoke.mjs` before changing test setup.
Do not switch browser checks to `next start`: production disables this project's emulator switch. Builds compile
only; they must not be used for data-writing checks. Retain the e2e guard, run one test stack at a time, and stop
only the PIDs/process groups that the run started. Browser execution needs the normal sandbox escalation.

For flow work run the spec added/edited plus `tests/smoke/tasks.spec.ts` as the main page spec, not every spec
whose filename mentions tasks. Only tests verifying a phone layout get `@phone`; do not repeat every protocol
case on phone or Jakarta. After failures rerun only affected tests, using `--last-failed` where applicable.
R1b is the phase's full suite run; R1d owns accessibility and scoped comparison. Never rerun broad checks merely
because a later row starts. Save complete failure lists before fixing anything.

If a failure/audit repair row would exceed one app area or roughly 30 minutes waiting on checks, split it into
small named rows immediately before the final review and assign the same appropriate GPT picks. Do not leave
an open should-fix item only in results. This is one sequential phase; its final review must not be skipped.

## G01 — Inputs and fixtures

Read **Requirements**, **Contract**, `lib/types.ts`, `lib/kinds.ts`, `lib/dates.ts`, `lib/subtasks.ts` and
`lib/followupPlan.test.ts`'s fixture/validation tests. Create `lib/taskPlan.ts`, `lib/taskPlan.test.ts` and
`tests/fixtures/taskPlan.ts`. Define the shared input types and validation without database imports.
Fixtures: one fictional prospect, one Deal done client, one internal main task, one parked/completed parent,
long multiline text and steps spanning a year end. Keep old fixtures intact.

Done when pure tests accept all three destination forms, new/append forms and one-day actions, and reject
missing/extra company IDs, both/neither parent choices, nested-target ID shapes, empty steps, 500 steps,
impossible dates/leap days, reversed dates, invalid links, unsupported task types and oversized input without
silently trimming content. Include a deal-skill fixture with its legacy title, `Follow Up` type and detail text.
Validation errors name the offending step/field. Run **Checks**.

## G02 — Destination discovery

Read **Contract**, `lib/followupPlan.ts`'s `findCompanies`, `lib/companies.ts`'s `companyGroup`, `lib/parking.ts`, `lib/kinds.ts`
and `lib/subtasks.ts`. Extend `lib/taskPlan.ts` and its pure tests with company/parent search over supplied data.
Reuse or narrowly extract name matching if needed; preserve the legacy function's return shape.

Done when tests cover exact/partial/company-suffix names, duplicate company names, stable order, a truncated
result set, missing and wrong-kind companies, all three categories, and exclusion of completed, parked, nested,
orphan-linked and different-company parents. Cover a task returning today, one returning tomorrow and an
indefinitely parked task using a supplied WIB day. Lookup never changes input records and never picks a destination.
Return enough ID/name/category/date context to let chat disambiguate. Run **Checks**.

## G03 — Pure previews

Read **Requirements**, **Contract**, G01/G02 outputs, `newSubtask`, and the existing preview builder for patterns.
Implement `buildTaskPlan` and warning generation in `lib/taskPlan.ts`; extend its tests.

Done when a valid preview contains exactly one new main task plus selected subtasks, or only new subtasks for
an existing main task. Each subtask keeps its own dates/text; company/group inheritance is correct; people
arrays stay empty even when appending under an assigned parent. Existing main-task fields remain untouched.
Verify the deal-skill fixture retains its title/type/What–Why–Bring–Watch–Done when text and parent source link.
Cover stale/missing/closed destinations, category mismatch, past dates, outside-parent-range dates, duplicate
steps and similar existing parent titles. Duplicate/similar warnings ask the owner to choose, never auto-append
or silently drop a step. Warning IDs are stable. With zero valid steps there are no write documents. Run **Checks**.

## G04 — Preview integrity

Read **Contract**, G03's warning/state output and the route's secret guard. Create `lib/taskPlanToken.ts` and
`lib/taskPlanToken.test.ts` using Node crypto; do not expose signing helpers to the browser.

Done when tests show valid round-tripping with a fake secret, expiry with a controlled clock, constant-time
signature comparison, and rejection of absent/malformed/tampered/wrong-secret tokens. Changing a step's notes,
owner text, dates, order, destination or main-task title/type invalidates its token. Unacknowledged warnings stop a
save; invalid input cannot be acknowledged away. Canonicalization is shared with preview and save, not duplicated.
The token contains no secret; tests/logs use fake values. Run **Checks**.

## G05 — Atomic saving and retries

Read **Requirements**, **Contract**, G03/G04, `lib/followupServer.ts`, `lib/followupServer.data.test.ts`,
`firestore.rules` and **Checks**. Create `lib/taskPlanServer.ts` and `lib/taskPlanServer.data.test.ts`.
Consult current Firebase transaction documentation through Context7 before choosing the write primitive.

Use stable operation-derived IDs for the normalized full input (including prose and destination, excluding
token timestamps) and a Firestore transaction/read-before-create strategy. A blind batch `set` after an earlier
existence read can overwrite concurrent edits; copying that pattern from the old path is not sufficient.
Read/validate the parent inside the task transaction. Existing main tasks and old subtasks receive no writes.
Ordering remains stable without requiring an update to the existing parent's dates or metadata.

Done when emulator tests prove create/append for all three categories; preview writes zero records; one refused
subtask leaves zero partial writes; simultaneous identical calls and retry after a lost response produce one
group; original-token retry after a lost response succeeds despite its own new duplicate warnings; a refreshed
preview of the same operation returns its original IDs; an intervening edit is never reset;
partial deletion/conflicting deterministic IDs returns a conflict, not recreated or overwritten data. Compare
company, existing parent, old child and unrelated-task snapshots before/after. Test parent deletion/reparenting/
completion between preview and save. Internal discovery/preview/save work even if company reads throw.

Company and task data live in different Firestore projects: re-read company status immediately before the task
transaction, but do not claim a cross-project atomic guarantee. Later company status changes still affect the
app's derived category. Record that limitation. Run **Checks**, including data tests.

## G06 — MCP tools and chat guidance

Read **Contract**, **Requirements**, **Checks**, `app/api/mcp/[secret]/route.ts`, G04/G05 and the installed
Next route-handler guide under `node_modules/next/dist/docs/`. Consult Context7 for the installed MCP SDK and
handler when wiring server instructions; use only APIs supported by their actual pinned versions.
Create `lib/taskPlanTools.ts`; register the three tools with explicit schemas, read/write annotations and plain
descriptions. Put the workflow in server instructions where supported and in tool descriptions so it does not
depend on a separately uploaded skill. Include category → company → main task → individual steps → preview → save.

Wire the new registrations only when `MCP_TASK_PLANS_ENABLED === "1"`. The flag must guard direct calls as well
as discovery; never import an unguarded alternate public write route. Keep the existing path, secret check,
stateless transport, legacy tool schemas/behavior and safe errors. A reusable read-only workflow text constant
may be shared by descriptions/docs tests; do not build an extra workflow service.

Done when route/registration tests prove the flag-off list has only the old three tools, new calls fail while
off, flag-on lists six, malformed input writes nothing, and no secret/stack trace appears in responses. The
generic tools request each step's add/change/skip answer, never guess dates or assign people. Run **Checks**;
G07 supplies the full real protocol run in the next session.

## G07 — Protocol checks

Read **Checks**, G06, `scripts/mcp/smoke.mjs`, `scripts/mcp/ui-smoke.mjs`, `tests/support/emulator.ts` and the
legacy protocol assertions. Extend the smoke harness or add a focused module under `scripts/mcp/` without
duplicating server lifecycle/secret handling. Add selectors for protocol versus browser scenarios so fixes can
rerun only their area; record verified commands in the results file. Keep `npm run mcp:smoke` backwards usable.

Done when real local MCP initialize/list/find/preview/add calls cover all three categories, new and append,
skip simulation (only selected steps are sent), all-skipped/no write, bad dates, mismatched category, missing
company/parent, unacknowledged warnings, expired/tampered token, changed input, repeat/concurrent calls and a
controlled write failure. Snapshot the database for every refused write. Test flag off/on separately; retain
wrong/missing secret, invalid JSON, unsupported method and old six-step follow-up checks. Close only owned
servers in success/failure/signal paths. Protocol tests do not prove Claude followed the conversational sequence.

## G08 — App flow and captures

Read **Checks**, G07, `tests/smoke/followup-server.spec.ts`, `scripts/mcp/ui-smoke.mjs`, and design-guide
sections **6.2 All tasks**, **6.3 Task details**, **6.4 Plan**, **8 Accessibility**. Extend the MCP UI harness
with fictional groups saved through the new tools; reuse the test fixture helpers. If adding a spec, use
`tests/smoke/task-plan-connector.spec.ts`; tag phone layout cases `@phone`. Run it plus `tasks.spec.ts` only.

Done when opening each returned link, then navigating from the main Tasks tab, finds the correct main task
under the chosen category with its selected subtask count. Check the source URL in the new parent's Key points.
Open a subtask, verify independent dates, full notes and empty Responsible, then reload to prove persistence.
Appending preserves old subtask state.
Save full-size captures at 1440×900 and 390×844 in `test-results/task-plan-connector/`: destination list, opened
main task, opened subtask dates and long notes; capture one Plan view to show the existing parent/subtask behavior.
Check horizontal overflow, covered controls and console errors. Describe each picture before judging it.

## G09 — Visual finish

Read G08's capture manifest, design-guide **6.2–6.4**, **7 Copy**, **8 Accessibility** and
`~/.claude/playbooks/catching-bugs.md` section **1**. Open the key images at original resolution before reading
implementation details. Record `LOOKED:` lines and concrete faults, then repair only confirmed issues in the
existing task list/sheet or test harness. Relevant code starts in `features/tasks/` and `ui/TaskRow.tsx`.

Done when the phone's first view identifies the task and category, the main task's subtask list is discoverable,
the fixed action/navigation does not obscure its target, and full dates/notes can be reached and read. Text
overflow and long names must not break controls. Keep before/after evidence for repaired states and rerun only
the affected capture/scenario plus **Checks** for changed code. If no fault is found, save the evidence and tick
the row without cosmetic changes. New design gaps follow the project's handoff rule, not an improvised redesign.

## G10 — Instructions and packaging

Read **Requirements**, G06's tool contract, `docs/skills/README.md` and only Step 5 of
`docs/skills/deus-deal-followup/SKILL.md`. Update those two files and rebuild/inspect
`docs/skills/deus-deal-followup.zip` using the existing documented command. Generic use must need no new skill.
The deal skill prefers the new workflow when present, explicitly passing `Follow Up`, the existing
`<Company> Follow Up` title, its summary/source link and per-step detail formatting, and asking category rather
than assuming Prospects. With only the old tools present, retain its current legacy flow.

Add `docs/implementation/chat-task-walkthrough.md` with example transcripts for prospect follow-up, existing
client work, Internal planning, mixed groups, changed date, skipped step, ambiguous company and retry. Include
exact tool sequence/expected records, activation/rollback and how to refresh connector tools. Label transcripts
as examples, not executed Claude tests; never include a real connector URL or secret. Use only hypothetical
names. Verify tool names against registration and inspect the ZIP's root and contents.

Done when a fresh reader can perform the flow from an ordinary chat, category/date questions are explicit,
legacy fallback remains documented, and all-skipped/rejected/partial-multi-group results are honestly worded.
Check current official Claude connector instructions before documenting settings clicks; cite the source.
Loading authoring guidance for the skill is appropriate, but do not edit synced home-directory copies.

## R1a — Risk review

Read **Requirements**, **Contract**, the implementation diff since the plan commit and G01–G10 evidence.
Review the actual diff in a fresh session, concentrating on wrong-company writes, erased dates/notes, unknown
fields, stale targets, invalid token/acknowledgements, cross-project limits, races and duplicate attempts. Attempt
counterexamples in the emulator. Do not infer safety from a test count or claim the server proves chat consent.

Done when each confirmed fault has a regression that fails before its fix, and relevant **Checks** pass after
the fix. Save findings with file/line and triggering input, or explicitly record none after the hunt. Keep open
items assigned to a named later repair row or dropped with a reason. Do not run the full suite here; R1b owns it.

## R1b — Full end-to-end run

Read **Checks**, R1a's findings and existing test safety setup. On a free machine with no other build/editor
agent changing this repo, run `npm run test:smoke` once. Save the complete failure list and log path in the
results file before any rerun. This row measures; R1c repairs. Passing the row means the run completed and
its outcome was accurately recorded, not necessarily that every test passed. A harness crash is a finding.

## R1c — End-to-end repairs

Read only R1b's failures and affected source/specs. If there are none, record that and tick without a rerun.
Otherwise repair confirmed regressions, add missing failing checks and rerun the failed tests only. Split by
area if needed before R1. Do not weaken expectations or delete failing coverage to obtain green results.
Done when failures are closed with evidence; unrelated pre-existing faults have an explicit named disposition.
Rerun the full suite only if a shared-code fix invalidated broad evidence; one clean full run is sufficient.

## R1d — Accessibility and comparison

Read **Checks**, G09's captures and `scripts/a11y/axe.mjs`, `scripts/compare/run.mjs` option comments.
Run `npm run a11y` once. Derive an exact state regex from `scripts/compare/states.mjs` for All tasks, task details
and the one Plan state touched by this flow; run `npm run compare -- --only '<verified regex>'` once at both
configured sizes. Record the selected state IDs, command, images and complete finding lists. Do not regenerate
unchanged prototype references after fixes. Open full-size images and distinguish accepted differences already
documented in the design guide from new faults. This row records findings; R1e fixes them.

## R1e — Audit repairs

Read only R1d's findings, relevant design-guide sections and affected source. Repair actual usability,
accessibility or visual faults, with a failing assertion for measurable bugs. Re-run only affected routes/states
using the tools' `--only`/`--size` filters and keep before/after pictures. If none, record the evidence and tick.
Done when every finding is fixed and checked, assigned a named justified later task, or dropped with a reason;
no unresolved data-loss, wrong-destination or inaccessible-main-action issue may be deferred to activation.

## R1 — Final phase review

Read the requirements table, all recorded findings/dispositions, final diff and test/capture evidence. Map C1–C10
to actual checks and links in `chat-task-results.md`; distinguish locally proven behavior from owner O2's
unperformed Claude chat acceptance. Check new tools remain disabled by default, existing tools still work,
the packaged skill matches its source, and activation/rollback instructions match the implementation.

Done when every build requirement has evidence, no must-fix item is open, required checks cover the final code,
and the handoff lists remaining owner actions without pretending they ran. Reuse valid prior evidence; rerun
only what final fixes changed. A documentation-only finish does not need another build. Commit/push this row
and the concise results/handoff; do not enable production, upload skills, or write live acceptance fixtures.
