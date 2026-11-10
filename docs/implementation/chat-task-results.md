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
