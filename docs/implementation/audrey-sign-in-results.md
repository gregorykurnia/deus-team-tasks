# Sign-in implementation evidence

## A1 — Server access and person records (2026-11-17)

Added server-only Firebase Admin access, the Auth emulator on 9199, person lookup/list/add/deactivation,
the sign-in flag helper, and `people:add` / `people:remove`. Both commands preview by default; only `--apply`
writes. Add previews count exact Responsible names and open tasks (excluding completed/parked work), and a
zero-match warning leads with nearby names. Activating a person atomically backfills every existing assignment;
repeating an active add leaves newer assignments eligible for notification. No task records are changed.

Files: `lib/admin.ts`, `lib/flags.ts`, `lib/peopleInput.ts`, `lib/people.server.ts`, `scripts/people.mjs`,
`firebase.json`, `package.json`, `package-lock.json`, `tests/unit/admin.test.ts`,
`tests/unit/peopleInput.test.ts`, `lib/people.server.data.test.ts`, this results file and `docs/IMPLEMENTATION_PLAN.md`.

Checks:
- `npx tsc --noEmit`: passed after the final code change.
- `npx eslint` on all eight added JS/TS files: passed; final edits to Admin and rules tests rechecked.
- `npm run test:unit`: 1,398 passed; existing `taskPlan.test.ts` non-JSON-input test timed out at 5,000 ms, then passed alone (1/1). Changed Admin/input tests also passed 24/24 after the emulator fix.
- `npm run test:data`: 245 existing tests passed; two new CLI tests initially failed on cloud metadata warnings. Fixed emulator-only metadata detection; scoped A1 rerun passed 15/15, including real CLI dry runs/apply, a 501-task backfill and Auth token revocation. Final strengthened rules test passed 1/1 (14 skipped), covering both signed-out and active signed-in clients, including creation of new secret records.
- `npm run build`: passed (production build, all routes generated).
- Reviewed the staged save/access diff and `git diff --check`: fixed the cloud metadata probe and inconsistent duplicate/rename validation between dry run and apply; no remaining findings. No screen changed, so no browser or screenshot check applies.

HUNTED: ripple · Existing task dates/names, parent/subtask assignments and other notice names survive backfill; active/inactive lookups agree · add/load/backfill and deactivation data tests.
HUNTED: odd data · Blank/long/foreign emails, blank/control/placeholder/long names, case/spacing/Unicode duplicates, missing Responsible and zero-task people · input, competing-email and preview tests.
HUNTED: failure · Interrupted backfill rolls back; Firestore removal failure leaves data unchanged; failed Auth revocation leaves access disabled/devices gone and is retryable; dry runs write nothing · rollback, Firestore/Auth failure and actual CLI tests.
HUNTED: overlap · Same-email retries and competing names serialize; two people preserve both notice names; a late Auth reply cannot overwrite reactivation or delete its new device · concurrent-add and late-removal data tests.

DECISION!: One active email may claim a task name (case/spacing/Unicode variants included); reject conflicting links and renames rather than silently relink, preventing misdirected notifications.
DECISION: Commit backfill and activation together rather than in separate batches, so an interruption never activates partial work; verified with 501 old tasks.
DECISION: Disable access/delete devices before Auth revocation rather than leave access active while Auth is unavailable; errors explicitly request a retry.
DECISION: Limit emails to Firebase's 128-character UID size and names to 200 characters rather than accept unbounded or control-character input.

Integration: feature routes must dynamically import `admin` / `people.server` after their sign-in flag guard,
so flag-off builds need no production key. Device registration in A4 must check the active person inside its
write transaction, so a concurrent removal cannot leave a new device behind. Emulator Admin uses only
`demo-deus` and the two local hosts, with cloud metadata detection disabled; production requires a valid
`FIREBASE_ADMIN_KEY` for `deus-team-tasks` and rejects emulator hosts.

Owner steps O1/O2/O6 remain in the plan; no production accounts, data, secrets or settings were touched.
A full check is worth running for the shared library additions; it remains scheduled for R1a. Only A1 is completed.
