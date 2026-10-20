# Phase 1 review (R1)

2026-10-20 · Opus 5.5 · diff `20afd0f..0258c85` on `redesign` (tasks 1.1–1.7), read against the implementation plan's §2 and Phase 1 sections. Every item is fixed (R1.1), moved to a named later task, or dropped with a reason. None stays open here.

## Checks
- Type check and build: pass.
- Unit tests: 113/113 pass (was 99; 14 added for the fixes).
- Full smoke suite (one run, machine otherwise idle): 56 passed, 1 failed, 57 skipped. The phone project is skipped on the old UI, as planned. The failure was the calendar spec, which broke because of a review edit (12-hour times on the old calendar); that edit was reverted, since D9 asks for 24-hour times, and the test then passed on rerun.
- Lint: 5 errors, all in old UI files and older than Phase 1 (`git blame`), and deleted in 4.7, so dropped. The imported prototype is now left out of lint.
- No path from the tests to live data was found. `reuseExistingServer: false`, the emulator flag is set on the test dev server, and the seeding helpers only reach the emulator.

## Fixed (R1.1)
1. **Refused writes vanished on the old UI** (must fix: a failed write looked like nothing happened). The old screens don't wait for their writes, so an `OfflineError` or Firestore rejection was dropped silently. The old `App` now shows the message in an alert. The A3 smoke spec asserts on it, which replaces its fixed wait.
2. **Half-saved company changes.** These span two Firebase projects:
   - Kept in step, from either side: if the second write fails, the first is rolled back before the error is reported.
   - Delete: the company is now deleted last, after its tasks are unlinked, and the tasks are re-linked if that delete fails. Before, a failure left tasks pointing at a company that was gone.
3. **Starting notes could overwrite stored notes** (data loss, older than Phase 1). This happened on a fast click before the notes loaded, or when the fixed id `pipeline-<id>` held notes kept from a deleted company. It now checks the server (or the device's copy when offline) and uses a fresh id if that id is taken. It no longer waits for the server when offline (D-014).
4. **Option rename and remove couldn't be retried** after the companies failed to follow. Running either again now finishes the companies.
5. **Flow "Loop to: none" was refused by Firestore**: an unset value nested inside steps. Nested unset values are now left out.
6. **Calendar date and time could disagree** across zones: the route asks Google for the team's zone, and both are read from the same text. An event ending at midnight no longer spills into the next day.
7. **Groups with two records of one name** (older data): delete and rename now catch every record of that name.
8. **CSV formula injection**: text starting with `= + - @`, a tab or a carriage return is exported as plain text.
9. **Emulator guard**: a production build never connects to the emulator, and a failed emulator connection now throws instead of carrying on against live data.
10. **Past client Undo** on an older record with no stored sector now clears the field instead of throwing.
11. Tests: one offline-refusal test across every write module, the 1.1 placeholder test removed, calendar env vars restored, and more time for the 460-task batch test on a busy machine.

## Moved to later tasks
- 2.3: `lib/connection.ts` keeps a closed subscription's last state, so it can keep the app counted as online.
- 3.10: renaming priority "High" or the "No" / "Not now" answers would break where-to-act and follow-up logic.
- 3.14: the old flows screen drops keys typed fast (the 1.6 note). The cause is inputs bound straight to snapshot data. The old screen is replaced, so the new one keeps a local draft.
- 4.3: smoke-test the company delete cascade (unit tests cover it today).

## Dropped, with reasons
- **Old calendar shows "14:30", not "2:30 PM".** Deliberate (D9, 24-hour), and guarded by the calendar smoke spec.
- **Editing a company task now updates the company and its other open tasks on the old UI.** This is B12 as planned in 1.5. The old UI on `main` ignores it, and the data stays compatible.
- **Gantt span margin.** Same math as before Phase 1.
- **`saveNotes` merging into notes deleted elsewhere recreates a partial record.** That keeps the typed text, which is better than losing it.
- **Saving line stuck on "Saving…" while offline.** Already planned in 3.11 (`hasPendingWrites`).
- **No `completedAt` smoke assertion.** Unit tests cover it.
