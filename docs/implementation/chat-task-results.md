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
