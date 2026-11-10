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
