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
