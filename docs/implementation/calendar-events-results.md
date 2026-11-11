# Calendar events implementation evidence

## C01 — Calendar fields and event mapping

2026-11-11. Baseline before C01: `a3abb09`.

Added separate task calendar mark/sync fields, calendar-only draft patches, and pure event mapping, validation,
IDs and keys in `lib/taskCalendar.ts`. Events stay confirmed for done/parked tasks, use each task's own dates,
and include parent/company context, Key points, an encoded task link and the private task ID. No I/O or UI added.

Decisions:
- `calendarEventId` returns `Promise<string>` using Web Crypto rather than Node-only hashing, keeping the shared module browser-safe without a new dependency; server callers must await it.
- `calendarKey` serializes the shared event body rather than maintaining a second field list; the link is relative because origin is deployment configuration, and unmarked tasks return `undefined`.
- Blank times normalize to an empty all-day mark rather than storing empty/undefined nested fields; marked tasks also require real, ordered dates, with errors keyed to the offending field.

Checks:
- PASS — `npx tsc --noEmit`.
- PASS — `npx eslint lib/types.ts lib/taskCalendar.ts features/task-sheet/draft.ts tests/unit/taskCalendar.test.ts tests/unit/taskDraft.test.ts`.
- PASS after isolated retry — `npm run test:unit -- --reporter=dot`: initially 1,052 passed / 1,053, with the unchanged `lib/taskPlan.test.ts` test “returns a plain error for non-JSON input” timing out at 5,000ms; its first isolated retry also timed out, a 20,000ms retry passed, and the final isolated retry with the normal timeout passed (1 passed, 234 skipped; 2.06s total).
- PASS — `npm run build` outside the sandbox (about 31s); the sandboxed attempt stayed at compilation for five minutes and was interrupted (exit 130) before this retry.
- PASS — reviewed the draft/save diff for sync-state overwrites, concurrent mark edits and nested undefined fields; no findings; `git diff --check` clean.

All new calendar/draft tests passed in the unit run: all-day/timed/multi-day mapping, date boundaries, field
validation, long/Unicode UTF-8 IDs, key sensitivity and sync-state isolation. No Firestore read/write code or
screen changed, so data tests, browser checks and screenshots were not needed. Full checks remain for R1a;
shared code changed, so they are worth running there.

## C02 — Server sync, fake calendar and route

2026-11-11. Baseline before C02: `5650d66`.

Added server-only `lib/calendarSync.ts`, guarded `lib/calendarFake.ts`, and `/api/calendar/sync` GET/POST.
Sync reads task/parent/company from the server, updates/inserts/restores one deterministic event, removes it for
unmarked or deleted tasks, and only writes server-owned sync fields. Calls for one task are serialized within
the server process; an in-flight task/context change gets one extra pass. Failures preserve task data and the
last synced key/link, returning a short per-ID error. The existing calendar read route is unchanged.

The fake keeps Google resources as JSON in `testCalendarEvents/<eventId>.event`, with a directly readable
`status`. Cancelled IDs stay reserved. Seed emulator `settings/test-calendar` with `{ fail: 503 }` to force
calendar failures; delete the control document to recover. Playwright and MCP smoke server environments now
enable the fake with the invented target `test-calendar`; no screens or app write hooks changed.

Decisions:
- Use `calendarSync.error`, correcting C02's `calendar.error` typo to match the settled design and C01 types; writing into the mark would mix task intent with server state.
- The fake uses a fixed local Firestore REST endpoint and emulator owner token instead of relaxing deployed Firestore rules; both emulator mode and `CALENDAR_FAKE=1` are required, and production with the fake flag reports off.
- Limit reconciliation to one extra pass rather than an unbounded retry loop; a task that changes again keeps an explicit retry error.

Checks:
- PASS — `npx tsc --noEmit`.
- PASS — `npx eslint lib/calendarSync.ts lib/calendarFake.ts lib/calendarSync.data.test.ts tests/unit/calendarSync.test.ts app/api/calendar/sync/route.ts playwright.config.ts scripts/mcp/smoke.mjs`.
- PASS — `npm run test:unit -- --reporter=dot`: 43 files, 1,064 tests; includes client safety matrix, mocked Google options/scope, and unchanged read-route regressions (29.71s).
- PASS — `npm run test:data`: 9 files, 193 tests, local emulator/fake only (70.97s); covers creation, moves, repeated/concurrent calls, unmark/re-mark/cancelled IDs, deletion, 404/410→409 recovery, preserved fields on failure/retry, invalid times, in-flight changes, freed subtasks, off mode and route validation/50-ID boundary.
- PASS — `npm run build` outside the sandbox; `/api/calendar/sync` builds as a dynamic route.
- PASS — own diff review for saved-data integrity, error isolation, retry races and production/fake separation; no findings; `git diff --check` clean.

No UI or browser flow changed, so no browser checks or screenshots were needed. No real Google or live
Firestore calls were made by tests. Shared server code changed, so a full check is worth running in R1a;
the full suite, a11y and compare remain assigned there. Only C02 is ticked; C03 was not started.

## C03 — The event follows the task

2026-11-11. Baseline before C03: `94225e7`.

Added nonblocking, deduplicated sync requests in groups of at most 50 IDs after marked task creation, event-content
edits, edit Undo, rollback and deletion. Freed marked subtasks keep their events with the parent context removed.
Partial writes sync the saved portion, including subtasks orphaned before a failed unlink batch. Company deletion
and rollback also sync tasks whose company context changes. Unmarked writes, status, parking and group moves
make no requests; request errors never fail or delay a task write. No calendar mark or sync-state ownership changed.

Files: `lib/calendarRequests.ts`, `lib/taskWrites.ts`, `lib/companyWrites.ts`, `features/task-sheet/TaskSheet.tsx`,
`features/tasks/TasksScreen.tsx`, `tests/unit/calendarWrites.test.ts`, `tests/unit/taskWrites.test.ts`,
`lib/calendarWrites.data.test.ts`, `docs/IMPLEMENTATION_PLAN.md` and this evidence file.

Decisions:
- Pass task snapshots to delete helpers rather than read marks from Firestore again; callers already have them, preserving ordinary writes without extra reads.
- Sync committed portions and orphaned subtasks after partial failures rather than wait for the whole bulk operation; saved changes must not leave stale events.
- Preserve direct creation-rollback cleanup rather than reuse the guarded public delete helper; cleanup must still be attempted if the connection dropped after creation.
- Give only the four-round-trip integration test a 20-second timeout rather than raise the suite default; its isolated cold-emulator run exceeded 5 seconds.

Checks:
- PASS — `npx tsc --noEmit`, including a rerun after the rollback correction; the final build also type-checked the timeout adjustment.
- PASS — `npx eslint` on all eight changed TypeScript/TSX files; repeated after the rollback correction.
- PASS after scoped retry — `npm run test:unit -- --reporter=dot`: 1,092/1,093 passed; unchanged `lib/taskPlan.test.ts` “returns a plain error for non-JSON input” hit `Test timed out in 5000ms`, then passed its isolated normal-timeout retry (1 passed, 234 skipped); final `npx vitest run --project unit tests/unit/calendarWrites.test.ts --reporter=dot`: 30/30 passed, including offline rollback cleanup and 120 deletes in exactly three requests.
- PASS after scoped retry — `npm run test:data`: 10 files, 197 tests, emulator/fake only; rollback rerun of `lib/calendarWrites.data.test.ts`: 3 passed, create/edit/Undo/delete hit `Test timed out in 5000ms`; after its timeout adjustment that test passed five consecutive isolated runs via `firebase emulators:exec --only firestore --project demo-deus` and `vitest run --project data lib/calendarWrites.data.test.ts -t 'creates, edits, undoes and deletes'`.
- PASS — `npm run build` outside the sandbox; all pages/routes compiled and generated successfully.
- PASS — own diff review for lost task writes, Undo/rollback mark restoration, request failures, partial deletes and server-owned sync fields; preserved unconditional rollback cleanup and added its regression test; no open findings; `git diff --check` clean.

No screen or user flow changed, so browser checks/screenshots were not run for this [no look] task; C05 owns the
browser flow. Tests never called real Google or live Firestore. Shared write code changed, so a full check is worth
running in R1a, where the full suite, a11y and compare remain assigned. Only C03 is newly ticked; C04 was not started.
