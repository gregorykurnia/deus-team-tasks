# R1eb — Remaining audit coverage

**Finding first: R1eb-A1 remains open and is assigned to R1ec, before R1 and activation.**
Coverage is complete; this is not a clean accessibility audit. No application/test code changed here.

| Finding | Source and breaking state | Evidence and disposition |
| --- | --- | --- |
| R1eb-A1: moderate `heading-order` | `ui/EmptyState.tsx:21` always emits `h3`. In page-level empty/offline states it follows `desk/PageHeader.tsx:34`'s `h1` without an intervening `h2`; e.g. `033-all-tasks-nothing-yet` and `015-today-nothing-loaded`, on desktop and phone. | [findings.json](findings.json) preserves all 30 nodes/selectors across 15 states and the exact repair scope. **R1ec** repairs the shared component's heading semantics and proves nested usages remain correct. |

All new findings have this source and named repair. None was dismissed. No data-loss,
wrong-destination or inaccessible-main-action finding was identified by these axe runs;
the heading repair remains due before the final phase review, not deferred to activation.

## Saved batches

| Fresh stack | Expected / assessed | Clear / heading findings | Duration | Raw reports |
| --- | --- | --- | --- | --- |
| Today, Tasks, Plan | 20 / 20 | 8 / 12 | 166.3 s | [report](01-today-tasks-plan/report-1.json) |
| Companies, Notes, Past clients | 18 / 18 | 4 / 14 | 148.9 s | [report](02-companies-notes-past/report-1.json) |
| Flows | 29 / 29 | 25 / 4 | 211.7 s | [both sizes](03-flows/report-1.json), [250 phone only](03-flows/report-2.json) |
| Installation, navigation | 10 / 10 | 10 / 0 | 86.3 s | [report](04-install-navigation/report-1.json) |

Total: **77 assessed, 47 clear, 30 heading-order findings**, no setup errors or failed,
missing, extra or duplicate entries. Total elapsed stack time: **613.2 seconds (10.2 minutes)**.
Each report was copied before the next invocation could overwrite the harness output.

## Method and verification

- [scope.json](scope.json) contains the exact anchored commands, selected states and expected IDs: R1d's 38 states at both sizes plus `250-flows-no-steps-yet` on phone only, partitioned without overlap.
- Each batch started `node node_modules/firebase-tools/lib/bin/firebase.js emulators:start --only firestore --project demo-deus` and `node node_modules/next/dist/bin/next dev --port 3100`; then ran the existing `scripts/a11y/axe.mjs --distinct --only <scope>` (plus `--size phone` for 250). [Environment/timing](run-summary.json) and per-batch server/audit logs preserve execution details.
- `NODE_ENV=development`, `NEXT_PUBLIC_USE_EMULATOR=1`, `FIRESTORE_EMULATOR_HOST=127.0.0.1:8180`, `MCP_TASK_PLANS_ENABLED=0`, `JAVA_TOOL_OPTIONS=-Xmx2g`; the existing [e2e guard accepted the runner-authorized audit](guard.json). All five invocations exited 0; reports, not exit codes, determine findings.
- [audit-coverage.json](audit-coverage.json) verifies all 77 IDs against R1d's `unassessed` list, zero overlap with its 207 assessed IDs, and 284 combined assessments. Hash checks preserve all 144 R1d/R1e evidence files. No references were regenerated or previously assessed entries rerun.
- Every batch stopped only its owned process groups and verified ports 3100, 8180, 4400, 4500 and 9150 were free. App logs contain expected Firestore transport/unavailable warnings from deliberately blocked/offline recipes; all state setup-error arrays are empty and no emulator heap exhaustion recurred.
- Documentation-only checks cover evidence paths/hashes, repair ownership, plan anchors, runner parsing and `git diff --check`. No build/unit/data/visual rerun applies: executable code and visible screens are unchanged, and R1eb is `[no look]`.

The first staged diff check flagged trailing spaces in Firebase log lines. Only log line endings
were normalized before the passing rerun; JSON audit reports retain their original bytes.

Reproduction: with the named ports free, run each batch's exact `--only` expression using
`npm run a11y -- --only '<regex>'`, adding `--size phone` only for 250, in the environment above.
That npm script owns the local servers itself; preserve `redesign/a11y/report.json` between invocations.
For R1ec, use only `findings.json`'s affected repair scope, not all 77 entries.
