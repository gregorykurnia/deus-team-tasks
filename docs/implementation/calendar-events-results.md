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
