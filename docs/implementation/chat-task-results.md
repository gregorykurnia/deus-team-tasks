# General chat task connector evidence

## G01 — Inputs and fixtures (2026-11-10)

- Inputs: `lib/taskPlan.ts` defines category/company and new/append unions with pure, strict validation. Errors identify fields/step indexes; calendar days and document IDs are checked before any server work. No database imports or tool exposure.
- Fixtures: `tests/fixtures/taskPlan.ts` supplies fictional prospect/client/Internal records, parked and completed parents, long multiline prose, year-end/one-day steps and a legacy-title `Follow Up` deal-skill plan. Legacy fixtures are unchanged.
- Coverage: `lib/taskPlan.test.ts` has 111 cases covering the G01 acceptance list, UTF-8 byte boundaries, text preservation, unknown fields and no inferred assignments/details.
- DECISION: Cap complete pre-trim JSON at 512 KiB UTF-8 rather than limiting individual text fields; this allows long notes, bounds a group and rejects overflow without truncation.

Checks:

- Type check: `npx tsc --noEmit` passed.
- Lint: changed TS files passed without warnings after removing two unused test bindings.
- Unit tests: initial `npm run test:unit` had 705 passes and two G01 failures (the 500-step fixture hit the byte cap first; the non-JSON test timed out at 5000 ms). The size fixture now isolates step count; `npx vitest run --project unit lib/taskPlan.test.ts` passed 111/111. All 596 existing unit cases passed in the initial run. The timeout case then passed five isolated runs with `-t 'returns a plain error for non-JSON input'`; no timeout increase or implementation change was needed.
- Build: `npm run build` passed outside the sandbox (compile, TypeScript and static generation). The initial sandboxed build stalled at compilation for over five minutes and was terminated by its verified PID; no source change was made to retry it.

No screen, database, production configuration or existing connector behavior changed; data/browser checks do not apply. A full check is worth running for shared logic at the planned phase review.

## G02 — Destination discovery (2026-11-10)

- Discovery: `findTaskDestinations` in `lib/taskPlan.ts` returns up to five company/main-task summaries, separate `hasMore` flags, refinement guidance and category-mismatch explanations. Company queries never select a company, even with one exact match; parent lookup requires its explicit ID. Summaries include IDs, names, category, company status/contact and parent group/type/dates.
- Eligibility: all three categories reject completed, still-parked and nested parents, including missing-parent links; Internal also excludes orphan company links and never accesses supplied company data. Parking uses the supplied WIB day, so a task returning today is eligible. Frozen records remain unchanged and returned summaries are detached.
- Compatibility: `lib/companySearch.ts` narrowly shares the existing PT/Tbk/punctuation normalization and exact/prefix/substring ranking with `lib/followupPlan.ts`; the legacy result shape and existing tests are preserved. No MCP tools are exposed by this task.
- DECISION: Rank main tasks by title match, normalized name and ID rather than app ordering; this keeps suggestions stable when supplied record order changes.
- DECISION: An explicit company ID overrides an accompanying old name query rather than intersecting them; the selected ID resolves ambiguity, and a missing ID never falls back to a different company.

Checks:

- Type check: initial `TS2345`/`TS2322` caught a Vitest array-row table shape in the new tests; changed those rows to objects, then `npx tsc --noEmit` passed.
- Lint: `npx eslint lib/companySearch.ts lib/followupPlan.ts lib/taskPlan.ts lib/taskPlan.test.ts` passed; the test file passed again after its final fixture correction.
- Unit tests: `npm run test:unit` ran 767 cases: 766 passed, one new partial-query assertion failed because its query correctly matched both fictional companies. Narrowed that test's query, then `npx vitest run --project unit lib/taskPlan.test.ts -t 'matches exact, partial'` passed all six affected cases. All 60 new discovery cases and 707 existing cases have passing coverage across those runs; no executable behavior changed to fix the assertions.
- Build: `npm run build` passed with the sandbox escalation already established by G01; compilation, TypeScript and static generation succeeded.
- Review: inspected discovery filtering, summary isolation and the legacy extraction diff; `git diff --check` passed. No screen or database I/O changes, so data/browser checks do not apply. A full check is worth running for shared logic at the planned phase review.

## G03 — Pure previews (2026-11-10)

- `buildTaskPlan` in `lib/taskPlan.ts` returns normalized input, destination/category/company/main-task state, exact new records, preservation notes and stable warning IDs; no clock, random IDs or I/O. Existing parents have no update document; all new people arrays stay empty, with supplied names in Key points.
- `lib/taskPlan.test.ts` adds 64 cases for all six destination forms, independent dates/group inheritance, unchanged frozen records, long/deal-skill prose and source links, stale/closed/wrong-category targets, warning choices, Unicode-stable warning ordering, invalid/empty steps and the 499-step boundary. Duplicate steps remain in the proposal; saved-operation identity is reserved for G05.
- DECISION: Similar titles use normalized exact/whole-phrase matching rather than fuzzy scoring, keeping confirmation prompts deterministic without choosing a destination.
- DECISION: Label parent links `Source:` rather than `Claude Doc:` because ordinary chat plans may cite any supplied http(s) source.

Checks:

- Type check: first run caught `TS2345` in an array-row test table; changed it to object rows, then `npx tsc --noEmit` passed (the build also passed TypeScript).
- Lint: `npx eslint lib/taskPlan.ts lib/taskPlan.test.ts` passed on the final code.
- Unit tests: `npm run test:unit -- --reporter=dot` passed 829/829; after correcting that table and adding two cases, five affected cases passed, then all 64 G03 cases passed after the final Unicode-order repair (235 total cases in this file).
- Build: `npm run build` passed outside the sandbox using the G01-established escalation; compilation, TypeScript and static generation succeeded.
- Review: inspected the preview/validation diff and confirmed `git diff --check` passed; no database I/O, tools, screens or production settings changed, so data/browser/look checks do not apply. A full check is worth running at the planned phase review for this shared logic.

## G04 — Preview integrity (2026-11-10)

- `lib/taskPlanToken.ts` is guarded by `server-only`: HMAC-SHA256 tokens use the existing server secret, expire after 30 minutes and bind validated/trimmed input, selected destination state and stable warning IDs. Fixed-length signature hashes use Node's constant-time comparison, including wrong-length signatures. Tokens contain hashes/times only, with no secret or supplied prose.
- `lib/taskPlanToken.test.ts` covers 95 cases: six destination forms, controlled expiry/clock, missing/malformed/tampered/wrong-secret tokens, schema checks, changed input/state, all warning kinds, WIB midnight warnings and invalid-input rejection. Canonical fingerprints reuse G03's validator and preserve step order/text; refreshed timestamps/keys do not change operation identity. `vitest.config.mts` resolves the server marker to Next's empty module for Node tests only.
- DECISION: Separate token/input verification from the current-preview warning/state gate rather than combining them, so G05 can recognize completed lost-response retries before their own records generate duplicate warnings.
- DECISION: Bind hashes of input/state/sorted warning IDs rather than embedding preview text, keeping tokens bounded and supplied notes out of their payloads; acknowledgement order and repeated current IDs are harmless, but unknown IDs are rejected.

Checks:

- Type check: `npx tsc --noEmit` passed on final files; the build also passed TypeScript.
- Lint: all three changed executable files passed, with the modified test file checked again after the hook repair.
- Unit tests: initial `npm run test:unit -- --reporter=dot` passed all 831 existing cases; all 95 new cases reported `TypeError: The "buf1" argument must be an instance of ArrayBuffer, Buffer, TypedArray, or DataView.` because the new `beforeEach` returned the crypto spy and Vitest invoked it as cleanup. Stopped returning that function; `npx vitest run --project unit lib/taskPlanToken.test.ts --reporter=dot` then passed 95/95. Full initial failure output and affected-file rerun: `/tmp/g04-checks.dDBNSv/unit.log`, `/tmp/g04-checks.dDBNSv/token-unit.log`.
- Build: `npm run build` passed with the G01-established sandbox escalation; compilation, TypeScript and static generation succeeded. Compile only, with no data-writing checks.
- Diff review: checked secret handling, signature/expiry ordering, canonical binding, blocking errors and retry-gate separation; no unresolved findings. `git diff --check` passed.
- Data/browser/look checks do not apply: no Firestore I/O, exposed tools or screens changed. A full check is worth running for shared logic at the planned phase review; production flags/settings are unchanged.

## G05 — Atomic saving and retries (2026-11-10)

- `lib/taskPlanServer.ts` adds Node discovery/preview/save entry points; canonical full-input hashes reserve stable parent/step IDs. Transactions read every reserved ID and the selected parent before creating anything, guard enumerated existing task reads, and write no existing parent/child/company fields. New people arrays, prose, dates, inheritance and ordering match the pure preview.
- Completed-operation lookup follows token authentication/expiry/input verification and precedes current-state/warning checks. Original-token lost-response retries and refreshed previews return original IDs/summary without resetting edited records. Missing/moved members, unrelated reserved IDs and missing/conflicting receipts stop with a conflict.
- `lib/taskPlanServer.data.test.ts` proves all six create/append forms, zero-write previews, complete rollback (including receipt), simultaneous calls, lost responses, edits during/after commit, partial/complete deletion, one-step append deletion, stale parents/companies, warning gates, company-outage isolation and the 499-step boundary. Before/after comparisons preserve companies, existing parents, an old child and unrelated tasks.
- DECISION: Store an atomic operation receipt in the existing `settings` collection rather than relying only on markers in created tasks; it survives deletion of every created member and requires no new collection or rules.
- DECISION: Keep all 499 selected steps plus the receipt in one transaction rather than lowering the input cap; the SDK reference surfaced by Context7 retains the old 500-write wording, but [Firestore's current release notes](https://cloud.google.com/firestore/docs/release-notes#March_29_2023) confirm that cap was removed in 2023, and the emulator passed the 501-write boundary.
- Limitation: company status is reread immediately before the task transaction; the separate company/task projects cannot share an atomic transaction, and subsequent company status changes still determine the app's category. No production data/settings were touched; tools remain unexposed pending G06 and owner activation.

Checks:

- Type check: `npx tsc --noEmit` passed on final code; log `/tmp/g05-checks.yKByzp/types-final.log`.
- Lint: both new executable files passed on final code; log `/tmp/g05-checks.yKByzp/lint-final.log`.
- Unit tests: `npm run test:unit -- --reporter=dot` passed 926/926; log `/tmp/g05-checks.yKByzp/unit.log`.
- Data tests: `npm run test:data` passed 151/151; after the deletion-edge review added durable receipts, only the affected file reran and passed all 62 current cases (95 unchanged existing data cases passed in the initial run); logs `/tmp/g05-checks.yKByzp/data.log`, `/tmp/g05-checks.yKByzp/data-final.log`.
- Build: `npm run build` passed compilation, TypeScript and static generation; log `/tmp/g05-checks.yKByzp/build.log`. Compile only; all data runs used the local emulator with invented fixtures.
- Review: checked the write diff for read-before-create preconditions, parent concurrency, retry precedence, receipt deletion, settings-reader isolation and atomic rollback; fixed the confirmed all-members-deleted retry gap with receipts and regression cases. `git diff --check` passed; no unresolved findings. No exposed/app flow or screen changed, so browser/look checks remain with G07/G08; a full check is worth running at the planned phase review for this shared code.

## G06 — MCP tools and chat guidance (2026-11-10)

- `lib/taskPlanTools.ts` registers the three general tools with strict schemas, shared plan validation, read/write annotations, safe errors and absolute save links. The exact `MCP_TASK_PLANS_ENABLED === "1"` check guards registration, direct route calls and retained callbacks. Legacy tool contracts, authentication, secret-free internal routing and stateless transport stay intact; production settings were not changed.
- Workflow instructions appear in initialization and every new tool description: category/company/main task, each step's add/change/skip and exact dates, final table, read-only preview, warning acknowledgement, confirmation and save. They cover prior explicit answers, quoted-text consent, skipped/undated actions, independent dates, supplied people/prose, mixed groups and unchanged-plan retries; no uploaded skill is required.
- `tests/unit/taskPlanTools.test.ts` exercises the installed MCP handler/SDK in memory with mocked storage: three/six-tool lists, flag-off direct calls, strict malformed/oversized input rejection before storage, all category adapters, all HTTP secret guards, legacy calls, instructions and sanitized failures. Context7 was consulted; installed SDK 1.26.0 / handler 1.1.0 declarations/source and initialization tests confirm instructions belong in the existing second options argument, despite current handler docs describing a newer API.
- The data check exposed an existing concurrent-save race: receipt/member reads can straddle another identical save's commit. `lib/taskPlanServer.ts` now rereads an absent receipt before declaring occupied IDs a conflict, letting the SDK abort/retry when its version changed; genuine conflicts still fail. A deterministic interleaving test failed before the repair and passes after it, without changing existing-record writes or retry identity.
- DECISION: Use the real installed handler/SDK with mocked storage rather than mocking registration itself; this verifies schemas, initialization instructions and route guards without starting G07's server/emulator protocol work.

Checks:

- Type check: initial `TS2488` in the generic callback-spy test was fixed by widening its recorded tuples; final `npx tsc --noEmit` passed (`/tmp/g06-checks.oE3IVb/types-repair.log`).
- Lint: all five changed executable files passed (`/tmp/g06-checks.oE3IVb/lint-repair.log`).
- Unit tests: `npm run test:unit -- --reporter=dot` passed 978/978; after the type-only test repair, the affected file passed 52/52 (`unit.log`, `tools-final.log` in the same evidence directory).
- Data tests: initial full run passed 156/157, failing Internal append concurrency with `TaskPlanConflictError` (`data.log`); the targeted retry passed but a forced receipt/member interleaving reproduced it (`race-before.log`). After repair, only the affected file reran, passing 63/63, then the original flaky case plus deterministic regression passed five repetitions (`data-final.log`, `race-five.log`); the other 95 data cases passed in the initial run. All writes used the local emulator and invented fixtures.
- Build: `npm run build` passed compilation, TypeScript and static generation (`/tmp/g06-checks.oE3IVb/build.log`); compile only, never used for data-writing checks.
- Diff review: checked auth/flag bypasses, schema rejection before I/O, error redaction, preview/warning forwarding, retry preservation and the SDK's changed-version retry behavior; `git diff --check` passed, with no unresolved findings. No screen changed; G07/G08 retain server protocol/browser coverage and the planned phase review owns full checks, which are worth running for this shared code. Actual Claude chat acceptance remains owner O2.

## G07 — Protocol checks (2026-11-10)

- `scripts/mcp/smoke.mjs` owns the emulator/dev-server lifecycle and secret handling; `--only=protocol` separates HTTP checks from `--only=browser` (fixture preparation plus the existing UI checks). The unchanged default `npm run mcp:smoke` selects both. Server activation is explicitly off/on, regardless of inherited flags; production activation stays untouched.
- `scripts/mcp/legacy-smoke.mjs` preserves the original three-tool/six-step preview, save, retry and company lookup assertions. `scripts/mcp/protocol-smoke.mjs` initializes the real SDK HTTP client, lists three/six tools and verifies workflow instructions, all six category/new-or-append destinations, exact records, selected-only steps, empty/all-skipped rejection, preserved existing data, warning acknowledgements and original/refreshed/concurrent retries.
- Refusals cover invalid dates/schema, missing or mismatched companies/parents (including changes/deletions after preview), missing/expired/tampered tokens, changed input, stale destinations, unacknowledged/unknown warnings, secret guards, invalid JSON/RPC and unsupported methods. Every refused call compares tasks, receipts/settings, flows, task groups and company records before/after. Denying one child through emulator-only rules proves atomic rollback; restoring rules permits the same operation, and retries preserve later owner edits.
- DECISION: Keep one lifecycle harness with protocol/browser selectors rather than separate server launchers, so area reruns retain the same emulator and secret protections.
- DECISION: Sign an expired preview with the existing token helper and a past test clock rather than adding a server clock override; the actual HTTP endpoint still verifies expiry with its real clock.

Checks:

- Type/lint/syntax/diff: `npx tsc --noEmit`, ESLint on all three scripts, Node syntax checks and `git diff --check` passed; `/tmp/g07-types.log`, `/tmp/g07-lint-final.log`. The final browser selector preparation was also checked independently without a browser.
- Unit: `npm run test:unit -- --reporter=dot` passed 978/978; `/tmp/g07-unit.log`.
- Protocol: `npm run mcp:smoke -- --only=protocol` passed with 112 database-preservation comparisons; `/tmp/g07-protocol-retry.log`. Initial failure `SyntaxError: Unexpected end of JSON input` came from the harness parsing a bodyless HEAD response; fixed its parser, then reran the protocol area. Full initial failure: `/tmp/g07-protocol.log`; server logs: `/tmp/mcp-smoke-Nz9Dlz/`.
- Lifecycle: busy-port failure preserved its existing listener; SIGTERM freed all five owned ports and preserved an unrelated listener; `/tmp/g07-lifecycle.log`. The successful protocol rerun also proved cleanup after the initial failure. Browser screenshots were not rerun because this task changes no screens; actual Claude conversational acceptance remains owner O2.
- Data: `npm run test:data` passed 158/158 against the local emulator with invented fixtures; `/tmp/g07-data.log`.
- Build: `npm run build` passed compilation, TypeScript and static generation; `/tmp/g07-build.log`. Compile only; never used for data-writing checks. No app/shared-library or production-setting changes; G08 and the phase reviews retain their planned checks.

## G08 — App flow and captures (2026-11-10)

- Added `scripts/mcp/task-plan-ui.mjs`, reusing the existing emulator fixture helpers and exported capture/layout/assignment helpers from `scripts/mcp/ui-smoke.mjs`. The shared MCP lifecycle harness supports `--only=task-plan-browser`; its default and existing browser selector also include the general-task scenarios. No app markup, CSS, storage implementation or production settings changed.
- Real preview/save calls create new and append groups for Prospects, Clients and Internal. All six returned URLs are opened on desktop and phone, then each parent is reached through the main navigation and category switch, with the correct 0/2 or 1/3 count. Both selected children retain their independent date ranges and exact notes; new assignments are empty. The first child is reloaded. Appending preserves the old completed child's dates, notes and owner. Final task/company snapshots equal their pre-browse snapshots.
- Evidence: [gallery and original-resolution observations](../../test-results/task-plan-connector/README.md), [saved-state manifest](../../test-results/task-plan-connector/manifest.json). There are 26 full-size captures at 1440×900 / 390×844 and 20 native-pixel frame/base crops; dimensions and manifest paths were checked. Browser requests are restricted to the owned app/emulator, with locally mocked calendar responses. No console, external-network, horizontal-overflow, covered-control, expanded-textarea or date-width faults were reported.
- **G08-V1 → existing G09 visual-repair task:** Plan's clamped Key points preview exposes part of a fourth line in its bottom padding on both shapes. The Plan shots/base crops retain the evidence. Exact full notes are preserved and readable in the sheet after reload; this does not block G08's capture/persistence acceptance. G09 remains unticked and owns this rendering repair. No design gap was found.
- Initial failure list: `getByRole('dialog', { name: 'Task', exact: true }).getByLabel(/^Start/)` could not find the completed child's dates because its dialog is named `Finished task`; corrected the test selector. Original failure: `/tmp/g08-browser-initial-failure.log`. Manual image review also caught unsettled category/main-sheet captures; added URL, heading, filtered-count and description/count waits and replaced those images. Two foreground runs ended with SIGTERM/143; a subsequent port guard refused `Port 8180 is busy or unavailable`. Verified/stopped only their orphaned server groups, then completed the run detached with its exact PID and exit-status file. All final owned ports are free.
- DECISION: Extend the real MCP UI harness rather than add a second Playwright fixture/lifecycle implementation; this keeps save-through-tool evidence and emulator/secret protections together.
- DECISION: Capture long notes at their start, middle and end rather than shrink them into one image; this proves full-size readability and access above fixed actions.
- DECISION: Assign the existing Plan preview fault to the already-planned G09 rather than expand G08 into the visual-finish task; G08 supplies its unchanged before evidence and all saved-state checks.

Checks:

- Types/lint/syntax/diff: `npx tsc --noEmit`, ESLint on the three changed scripts, Node syntax checks and `git diff --check` passed; `/tmp/g08-types.log`, `/tmp/g08-lint.log`.
- Unit: `npm run test:unit -- --reporter=dot` passed 978/978; `/tmp/g08-unit.log`.
- Data: `npm run test:data` passed 158/158 against the local emulator; `/tmp/g08-data.log`.
- Browser/captures: `npm run mcp:smoke -- --only=task-plan-browser` passed all 12 category/mode/shape cases, both Plan links and final saved-state comparisons; `/tmp/g08-browser.log`. All 26 key images and 20 crops were opened at original size; G08-V1 is assigned above.
- Main-page flow: `npx playwright test tests/smoke/tasks.spec.ts --output=test-results/task-plan-page-spec` passed 12/12 (desktop/Jakarta); `/tmp/g08-tasks.log`. Only this required page spec ran; phone layout is checked in the focused harness, and the separate output folder preserves its gallery.
- Build: `npm run build` passed compilation, TypeScript and static generation; `/tmp/g08-build.log`. Compile only; all browser/data runs used the emulator-enabled development app. Broader phase checks and actual Claude chat/real-phone acceptance remain in their existing later rows/owner steps.

## G09 — Visual finish (2026-11-10)

- Inspected all 26 original captures at 1440×900 and 390×844 before reading implementation, plus native-pixel boundary/overlap crops. [Picture observations and fault dispositions](../../test-results/task-plan-connector/G09-review.md).
- **G08-V1 fixed:** Plan's Key points previews leaked a partial fourth line beneath their ellipsis. `ui/TaskRow.tsx` / `.module.css` now clamp an inner span, keeping padding on the existing outer surface. Task identity, categories, discoverable subtasks, readable dates/notes and fixed-action clearance remain intact. No additional confirmed fault or design gap.
- Added `--only=task-plan-visual` to the existing MCP harness: only the affected Plan scenario runs on both shapes; original G08 captures remain unchanged. After images, crops, saved-state manifest, pixel comparison and regression logs are in `test-results/task-plan-connector/g09/`.
- DECISION: Keep the three-line preview with an inner clamp rather than shorten notes; full saved text and the approved layout remain available.
- DECISION: Recheck only Plan on desktop/phone rather than repeat all G08 flows; the existing emulator setup and guards still apply.

Checks:
- Regression before/after: initial run failed `desktop: Key points preview exposes text below three lines (74.53125px > 56.550000000000004px)`; repaired run passed both viewports, child links, exact dates/notes, unchanged task/company snapshots and console/network/layout audits.
- Look/artifacts: opened both repaired images and native-pixel notes/base/edge crops; phone pixel changes are only the removed stray lines, desktop also has 21 negligible edge/shadow raster differences. Original and after image paths/dimensions checked.
- Type/lint/unit: `npx tsc --noEmit`, ESLint on the three changed JS/TS files, and 978/978 unit tests passed. Initial foreground type/unit runs ended with SIGTERM/143; detached retries passed (`/tmp/g09-types-retry.log`, `/tmp/g09-lint.log`, `/tmp/g09-unit-retry.log`).
- Build: `npm run build` passed compilation, TypeScript and static generation (`/tmp/g09-build.log`); compile only, no production data/settings touched.
- Scope/diff: `git diff --check` passed. No save/load logic changed, so no data suite or unrelated page specs reran. Shared `ui/` changed: a full check is worth running in the already-planned phase review; G10 and later tasks remain untouched.
- Look-evidence recheck: the runner missed template-string paths. Reopened all 28 key images and 15 native-pixel crops with literal paths at original resolution; its own counter now reports 43. Retook both repaired views with `--only=task-plan-visual`: both passed, after images/manifest are byte-identical, and no further visual fault was found. Evidence-only follow-up; prior code checks still apply. Details: [recheck](../../test-results/task-plan-connector/G09-review.md#runner-evidence-recheck--2026-11-10).
- Independent-checker follow-up: opened all 12 flagged copies at original resolution and verified they match the preserved originals. Added `--only=task-plan-reachability` to the existing harness; 11 phone views plus eight native-pixel crops demonstrate final-row clearance, sideways filters, full company/task names, readable boundary notes and reachable Task type. All reported items have a [named disposition](../../test-results/task-plan-connector/G09-fresh-eyes.md); no additional app fault was confirmed, so app code/design stayed unchanged.
- Follow-up checks: focused emulator/browser run passed with unchanged task/company snapshots and no console/network/layout faults; TypeScript, changed-script ESLint, 978/978 unit tests and production compile passed (`/tmp/g09-feedback-{types,lint,unit,build}.log`). First harness run failed on its string/numeric company-ID comparison; corrected and reran successfully. Artifact dimensions/links and `git diff --check` passed. No unrelated flow, full suite or data suite was rerun.

## G10 — Instructions and packaging (2026-11-10)

- Updated only [Step 5](../skills/deus-deal-followup/SKILL.md#step-5---add-to-deus-team-tasks) in the skill: prefer the general trio, ask category and each step, preserve Follow Up title/summary/source/details, require exact preview/warning confirmation and safe retries; retain the complete legacy company-only flow and its deadline-extension limitation.
- [Generic-chat instructions](../skills/README.md) require no skill; the [owner walkthrough](chat-task-walkthrough.md) covers all eight requested examples plus all-skipped/rejected/partial results, with exact calls and expected records. Transcripts are hypothetical, not executed Claude tests.
- DECISION: Document fresh-chat/reconnect/re-add recovery instead of inventing a Refresh tools button; current official connector guidance supports removal/re-adding but names no refresh control.

Checks:
- Four walkthrough JSON plans passed pure input/preview checks for expected records, exact warning IDs, independent dates, Internal discovery and preserved existing records; all six documented tool names match registration (`/tmp/g10-checks.VTaIXH/plans.log`). No database or network writes.
- Skill-authoring `quick_validate.py docs/skills/deus-deal-followup` passed; artifact comparison confirms all content outside Step 5 and the legacy numbered flow remain unchanged apart from replacing its real-company example with a hypothetical name.
- ZIP rebuilt with the README's existing command and inspected: one `deus-deal-followup/` root, three files matching source bytes, both reference files unchanged and no corrupt entries (`/tmp/g10-checks.VTaIXH/artifacts.log`).
- Local artifact links/anchors, placeholder-only connector paths and `git diff --check` passed; current official connector/skill settings guidance is cited in the README (checked 2026-11-10).
- Docs-only **Checks** applied: no executable changes, build, data/browser suite or screenshots; production activation, optional upload and real Claude/phone acceptance remain existing owner O1–O3, not blockers for G10. No later task was started.

## R1a — Risk review (2026-11-10)

- **R1a-F1 fixed — stale context on transaction retries:** baseline `lib/taskPlanServer.ts:159–174` reused task/company snapshots outside the retry callback. After preview, insert an identical child, insert a similar main task, or change the prospect to Clients, then edit an enumerated task to force an SDK retry: all three saves incorrectly succeeded without a fresh preview. Reads now run inside every attempt, after completed-operation detection; changed warnings/category reject the save and preserve the concurrent edit. Regressions: `lib/taskPlanServer.data.test.ts:284`.
- Fresh hunt covered the `bd3f9d1..05c2223` implementation and G01–G10 evidence: strict unknown-field/date/ID/size validation, company/parent identity, token authenticity/expiry/input/warnings, receipt/member races, deletion conflicts, independent dates/notes, 499-step rollback/retries, activation/auth guards and individual chat confirmation. No additional confirmed overwrite, token or legacy-contract fault. Instructions require owner confirmation; server tokens cannot prove it or actual Claude acceptance (owner O2).
- Retained limits/disposition: company reads cannot join the separate tasks-project transaction; a change after the final read remains possible. Collection enumeration also cannot lock later inserts from other writers, so duplicate/similarity warnings are based on the observed task set. App-wide/cross-project coordination is dropped from this connector review because it would change every writer/architecture; exact-plan retries still use atomically guarded deterministic IDs/receipts, not those advisory warnings. No production data/settings changed; activation remains owner O1.
- DECISION: Refresh task/company context per transaction attempt rather than add shared locks or change storage shape; it fixes the reproduced retry faults while preserving existing records, Internal company-outage isolation and completed-retry precedence.

Checks:
- Before-fix regressions: all three failed with `AssertionError: promise resolved … instead of rejecting`; `/tmp/r1a-checks.RtsKXa/retry-before.log`.
- Type/lint: `npx tsc --noEmit` and ESLint on both changed TS files passed; `/tmp/r1a-checks.RtsKXa/{types,lint}.log`.
- Unit: 978/978 passed; `/tmp/r1a-checks.RtsKXa/unit.log`.
- Data: 161/161 passed, including all 66 task-plan transaction cases and the three regressions; invented data on the local emulator only; `/tmp/r1a-checks.RtsKXa/data.log`.
- Build: `npm run build` passed compilation, TypeScript and static generation; compile only, never used for data writes; `/tmp/r1a-checks.RtsKXa/build.log`.
- Diff review: the repair changes only read placement, preserving token/ack gates and every existing-record write boundary; `git diff --check` passed. No screen or flow was added; browser/full/a11y/compare checks stay with R1b–R1e, which are worth running for this shared code. No later task started.

## R1b — Full end-to-end run (2026-11-10)

**Complete failure list (one; assigned to R1c, unrepaired):**

- **R1b-F1 — company export expects seven fields but the dialog shows eight.** Desktop test `tests/smoke/companies-settings.spec.ts:131`, “E1: export downloads the companies shown with the fields the list shows, and says when there's nothing to export”, fails at `:137:112`. With `seedAll()` fixtures, open `/companies?q=pelita`, then Export → Export Active. The one-prospect assertion passes; `expect(dialog.getByText(", as filtered now, in the current order, with the 7 fields the list shows:")).toBeVisible()` fails after 10,000 ms with `Error: element(s) not found`. The saved dialog snapshot instead says “1 active prospect, as filtered now, in the current order, with the 8 fields the list shows:” and lists Company, Status, Priority, Last action, Target date, Products, GBA trials, Next actions. The download, CSV contents and empty-export assertions after this line were not reached; R1c must inspect their expectations too. No repair or rerun in R1b.

Run: `npm run test:smoke -- --reporter=list,json --output=/tmp/r1b-smoke.CZenky/artifacts`, exactly once against commit `e016925`; 2026-11-10 09:54:51–10:22:15 UTC, 27.4 minutes, exit **1**. All 389 cases completed their scheduled disposition: **379 passed, 9 skipped, 1 failed**, no flaky cases/retries and no global/harness errors.

| Project | Passed | Skipped | Failed |
|---|---:|---:|---:|
| desktop | 293 | 9 | 1 |
| phone (`@phone` only) | 37 | 0 | 0 |
| jakarta (Plan, Today, Tasks) | 49 | 0 | 0 |

All nine skips are desktop executions of phone-only cases: `tests/smoke/a11y.spec.ts:108`; `gallery-overlays.spec.ts:121,197`; `shell.spec.ts:67,89,113,119,136`; `tasks-screen.spec.ts:164` (remaining paths also under `tests/smoke/`). Their 390×844 phone-project counterparts passed; desktop is 1440×900.

Evidence (retained on this machine):
- Complete console log: `/tmp/r1b-smoke.CZenky/suite.log`; full machine-readable report: `/tmp/r1b-smoke.CZenky/report.json`; start/end timestamps and exit status are alongside them.
- Failure snapshot: `/tmp/r1b-smoke.CZenky/artifacts/companies-settings-E1-expo-1e736-n-there-s-nothing-to-export-desktop/error-context.md` (observed dialog at lines 119–124); trace: the same directory's `trace.zip`.

DECISION: Use a separate temporary Playwright output directory rather than its default `test-results/`, so the full run preserves G08/G09's tracked captures and keeps this failure evidence separate from R1c's reruns.

Checks:
- Safety: read the emulator/server setup and R1a findings before the run; no competing build/test was running and all five test ports were free. Used `next dev`, `NODE_ENV=development`, `NEXT_PUBLIC_USE_EMULATOR=1`, `FIRESTORE_EMULATOR_HOST=127.0.0.1:8180`, `demo-deus` emulator and invented fixtures; `MCP_TASK_PLANS_ENABLED=0`. No production data/settings or app code changed.
- Report: recursively reconciled every JSON test result with the 389-case totals and the console failure list; all recorded attachment paths exist. After completion, no test listeners remained on 3100/8180/4400/4500/9150 and no repo-owned test browser/server/emulator remained.
- Docs-only checks: verified evidence/plan links, unchanged prior tracked captures and `git diff --check`. No type/lint/unit/data/build rerun or new screenshot review was needed; R1d/R1e retain their audits. Only R1b is ticked; R1c and later tasks were not started.

## R1c — End-to-end repairs (2026-11-10)

Findings before repair:
- **R1b-F1, closed:** `tests/smoke/companies-settings.spec.ts:137` expects seven fields after `seedAll()` → `/companies?q=pelita` → Export; Active has eight, including GBA trials. R1b's saved failure proves the mismatch before this repair.
- The same case's `:144–145` also omits GBA trials from the exact CSV header and its empty cell from Pelita's row; those assertions were unreachable in R1b. Fixed all three expectations together, keeping the full filename/header/row, filter and empty-export assertions.

This was pre-existing test drift from `91816d4`, which intentionally added GBA trials to Active. `lib/companySettings.ts`, `features/companies/ExportDialog.tsx` and `lib/exports.ts` agree on the eight-column export. No application, fixture, Firestore or screen code changed; no remaining R1b failures or deferred repair findings.

DECISION: Update the three exact export expectations rather than remove the GBA trials column or relax assertions; the existing defaults and export behavior are correct.

Checks (logs in `/tmp/r1c-checks.ji9vzP/`):
- Type check: `npx tsc --noEmit` passed (`types.log`).
- Lint: `npx eslint tests/smoke/companies-settings.spec.ts` passed (`lint.log`).
- Unit: `npm run test:unit -- --reporter=dot` passed, 978/978 in 41 files (`unit.log`).
- Build: `NODE_ENV=production npm run build` passed (`build-production.log`); the first invocation mistakenly inherited `NODE_ENV=development` and failed prerendering `/_global-error` with `TypeError: Cannot read properties of null (reading 'useContext')` (`build.log`), then passed after correcting only the command environment.
- Affected e2e only: `npx playwright test tests/smoke/companies-settings.spec.ts:131 --project=desktop --last-failed --output=/tmp/r1c-checks.ji9vzP/artifacts` passed 1/1 in 20.9 seconds (`export-e2e.log`); copied R1b's failure selection into this separate output folder first. The download, exact eight-column CSV and empty-export checks all ran; `artifacts/.last-run.json` reports `passed` with no failed tests.
- Safety/review: emulator-only `next dev`, local Firestore on 8180, invented fixtures and activation flag off; all five test ports have no listeners and are reusable after shutdown. `git diff --check` and the three-assertion diff review passed. R1b/G08/G09 evidence is preserved; no data/full-suite/visual reruns were warranted, and R1d/later rows remain untouched.

## R1d — Accessibility and scoped comparison (2026-11-10)

- **Open findings → R1e:** serious task-row label/name mismatches (`ui/TaskRow.tsx:291`: 40 state/size entries, 363 node occurrences, 17 selectors), moderate menu-landmark findings (`ui/Menu.tsx:113`: 24 entries, one shared selector), and missing audit coverage after emulator heap exhaustion. [Complete findings, source/state details and original-size observations](../../test-results/task-plan-connector/r1d/README.md); [unabridged axe nodes](../../test-results/task-plan-connector/r1d/a11y-report.json).
- Exactly one `npm run a11y` attempt, with the task driver's `JAVA_TOOL_OPTIONS=-Xmx2g` cap, ended after 2,170.2 seconds when fixture writes failed with HTTP 500 `UNKNOWN`; the emulator reported `java.lang.OutOfMemoryError: Java heap space`. Stopped only its owned process groups (exit -15). Final evidence: **207 assessed, six failed, 71 not reached** of 284 expected reports; not a passing/full audit. [All six failures, 77 unassessed entries and exact focused retry commands for R1e](../../test-results/task-plan-connector/r1d/audit-coverage.json). The harness's manual install storyboard is separately excluded at both sizes. No broad rerun was attempted.
- Exactly one scoped comparison on fresh emulator servers completed **16/16**, with zero recorded execution errors: `017-all-tasks-normal`, `019-all-tasks-prospects`, `020-all-tasks-clients`, `021-all-tasks-internal`, `062-task-details-company`, `063-task-details-internal`, `064-task-details-finished`, `102-plan-one-day-normal`, at 1440×900 / 390×844. The anchored regex was derived and verified from `scripts/compare/states.mjs`; [exact commands/scope](../../test-results/task-plan-connector/r1d/scope.json), [results](../../test-results/task-plan-connector/r1d/compare-report.json). Prototype references were generated once and preserved; no G08/G09 capture was replaced.
- Opened all 16 comparison pairs, 13 native-pixel viewport/footer/date/preview crops and both G09 Plan baselines at original size. Candidate clipping/overlap findings have explicit dispositions; no additional visual defect or design gap was established. Guide §8's approved contrast/outline changes and §5.14's truncation rules remain distinct from the open axe findings. Existing status/park/subtask/column changes and independent dates explain other prototype differences.
- Docs/evidence-only checks: artifact/link/hash/dimension and exact coverage verification, original-resolution look review, clean `git diff --check`, and final owned-port cleanup. No executable app/test change, unrelated build/unit/full-suite rerun, production data/settings change or owner action. R1d records this single attempt and hands all remaining work to R1e; no later task was started.

## R1e — Accessibility repairs (2026-11-10)

- **R1d-A1/A2 fixed:** task-date buttons now include the visible undated/last-action wording, with a real separator after the phone label; portalled menus sit inside named landmarks while keeping their roles, placement and focus behavior. Changes: `ui/TaskRow.tsx`, `ui/Menu.tsx`, six unit cases and `tests/smoke/audit-repairs.spec.ts`. [Findings, attempts and picture review](../../test-results/task-plan-connector/r1e/README.md).
- **R1d-H1 → R1eb:** the 77 entries missed after R1d's emulator exhaustion span other app areas and remain a separate named, unticked audit task immediately before R1. Its brief preserves R1d's exact retry scopes and requires scoped batches and disposition of any new findings. No missing coverage is claimed complete and no later task was started.
- **Scoped audit passed:** all 58 previously affected state/size entries, at 1440×900 and 390×844, assessed with zero violations, setup errors, failed/missing/extra entries. [Exact scope](../../test-results/task-plan-connector/r1e/audit-scope.json), [raw report](../../test-results/task-plan-connector/r1e/a11y-report.json), [summary](../../test-results/task-plan-connector/r1e/audit-summary.json). No broad rerun or prototype regeneration.
- **Regression proof:** five new unit assertions and all four focused browser cases failed before repair; the six new unit cases and all four browser cases pass after. The final phone rerun used `--last-failed`; logs retain the intermediate missing-separator failure and corrected test assumptions. Keyboard reachability/restoration, menu bounds, unobscured action centres, text fit, image loading and console checks pass.
- **Look check:** original-size before/after desktop and phone task/menu frames, both menu-bottom frames and four native crops inspected; no additional visual fault confirmed. Date frames and the phone menu are pixel-identical; the desktop menu has 174 changed pixels without a layout change. Guide-defined truncation, horizontal scrolling and menu scroll boundaries are documented with reachability evidence. [Gallery manifest](../../test-results/task-plan-connector/r1e/images.json). No design gap or studio handoff change.
- **Light checks passed:** type check, changed-file lint, **984 pure unit tests**, one production build and diff review. No Firestore code changed, so no data-test rerun. Shared UI changed: a full check remains worth running at the planned review/request, not repeated in this repair task. No production data/settings or activation flag changed.

## R1eb — Remaining audit coverage (2026-11-10)

- **Open finding R1eb-A1 → R1ec:** `ui/EmptyState.tsx:21` always renders `h3`; after the page's `h1` (`desk/PageHeader.tsx:34`), empty/offline messages skip a heading level. Axe reports 30 moderate `heading-order` occurrences in 15 states at both sizes. [Every state, selector, node and exact repair scope](../../test-results/task-plan-connector/r1eb/findings.json); [source and disposition](../../test-results/task-plan-connector/r1eb/README.md). R1ec is a named shared-component repair before R1; it has not been started. No new data-loss, wrong-destination or inaccessible-main-action finding was identified by this audit.
- **Coverage complete, not a clean audit:** all **77/77** missing entries have saved assessments; **47 clear, 30 with the heading finding**, zero setup errors, failed/missing/extra/duplicate entries. Four fresh stacks assessed 20 Today/Tasks/Plan, 18 Companies/Notes/Past clients, 29 Flows (including the phone-only entry), and 10 Install/navigation entries in **613.2 seconds**. [Coverage and evidence paths](../../test-results/task-plan-connector/r1eb/audit-coverage.json); [exact commands and partition](../../test-results/task-plan-connector/r1eb/scope.json); [batch timing/environment](../../test-results/task-plan-connector/r1eb/run-summary.json).
- **Scope and safety verified:** the union equals R1d's two retry scopes exactly, without repeating any of its 207 assessed entries. Together they cover all 284 expected entries. All 144 prior R1d/R1e evidence files retain their hashes; no prototype references or screenshots were regenerated. Each local `next dev`/Firestore stack used the emulator switch, a 2 GiB heap, and disabled connector activation; only owned process groups were stopped, with all five ports free after every batch. Intentional offline recipes produce expected Firestore transport warnings in app logs, not setup failures.
- **Documentation/evidence-only finish:** artifact/link/hash/coverage checks, runner plan validation and diff review; no application or test code changed, so no build, unit/data suite, broad audit or screenshot rerun was required. R1eb closes the missing coverage; R1ec owns its one confirmed repair and R1 remains the final review.

## R1ec — Empty/offline headings (2026-11-10)

- **R1eb-A1 closed:** `ui/EmptyState.tsx:21` previously placed `h3` directly after the page `h1`. Large page messages now use `h2`; small panel/document messages keep `h3`, with explicit overrides preserving the nested large day/person messages and gallery example. Wording, CSS and actions are unchanged. [Finding, repair and evidence](../../test-results/task-plan-connector/r1ec/README.md).
- **Exact scope clean:** all 30 affected desktop/phone entries have zero violations, setup errors, missing or extra entries. An initial signal-15/exit-143 interruption left eight clean assessments; those were preserved and only the remaining 22 resumed on fresh stacks. All prior R1eb evidence and prototype references retain their hashes. [Coverage](../../test-results/task-plan-connector/r1ec/audit-summary.json), [commands/timings](../../test-results/task-plan-connector/r1ec/audit-runs.json).
- **Regression and light checks pass:** page-level assertion and four browser cases failed before the fix (`Expected: "H2", Received: "H3"`); afterward 988 unit tests, four final browser cases, type checking, changed-file lint and the production build passed. Nested-heading tests cover a real panel and size-independent overrides. No Firestore read/write changes, data-suite rerun or broad phase audit applies.
- **Look reviewed at full resolution:** desktop/phone empty and offline messages retain their exact pixels, readable wording and reachable actions; viewport and hit tests also cover navigation. An apparent missing bar in the batched image display was a review mistake: individual full-size reopening and identical file hashes prove it was always present, so no application or capture fault is claimed. [Before/after frames](../../test-results/task-plan-connector/r1ec/README.md#visual-review). Only R1ec is ticked; R1 remains the final review, and a full check remains worth running after this shared-component change.
