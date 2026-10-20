# Phase 2 review (R2)

2026-10-20 · Opus 5.5 · diff `b1df55b..41435e5` on `redesign` (tasks 2.1–2.7), read against the implementation plan's §2, §3 and Phase 2 sections, the guide and the prototype. Every item below is fixed in the R2 commit, given to fix task **R2.1** (done before Phase 3 starts), moved to a named later task, or dropped with a reason.

## Checks
- Type check, build: pass. Unit tests: 220/220.
- Lint: the same 5 errors and 1 warning in old UI files that R1 dropped (deleted in 4.7). Nothing in Phase 2 code.
- Full smoke suite (one run, machine otherwise idle): 130 passed, 0 failed, 64 skipped (the phone project is skipped on the old UI, as planned). After the fixes, the overlay, field and shell specs passed again (59 passed, 7 skipped), including the new picker-in-a-sheet test.
- `/gallery` answers 404 in production (`notFound()`); its route is still compiled. Dropped: nothing links to it, and it goes with the old files in 4.7 if unwanted.

## Fixed (R2 commit)
1. **Esc in a name or sector picker inside a sheet closed the whole sheet** (must fix: the draft is lost). React listens on `document`, so the picker's `stopPropagation` couldn't stop the overlay's Esc handler. The handler now skips keys already handled (`defaultPrevented`) and keys that end typing in another script (`isComposing`); the picker skips those too. New smoke test with a picker inside the gallery sheet.
2. **A live source that failed kept counting as connected** (the R1 case through the error path): Firestore closes a listener that reports an error, and the source is now forgotten then too.
3. Reduce motion now also cuts animation delays and smooth scrolling.

## R2.1 fix task (before Phase 3)
Shell and data:
1. **Cold start with the server unreachable never shows offline** (`lib/connection.ts`): no source has reached the server, so nothing "falls back"; the app shows Live and allows writes. Add a connecting/offline state when no source reaches the server after a few seconds, and a smoke test that blocks the emulator before load (`context.setOffline` only flips `navigator.onLine`). This is 2.3's Done-when.
2. **Opening + / More / Install drops the screen's address state** (`desk/areas.ts` `over()`, `MoreSheet` close): merge into the current search params; on close remove only `more`.
3. **A hidden More sheet locks large screens** (opened at ≤900px then rotated, or `?more=1` on desktop): close it, or skip the lock and focus, when the 901px query matches.
4. **Side bar shows "0" counts and the empty-groups invitation when a source fails**: show no counts and a short error line (guide 5.8).
5. `MoreSheet`'s `openedHere` flag stays true after the back gesture closes it: reset when `open` turns false.
Overlays and fields:
6. **A busy confirmation can still be closed** (Cancel, Esc, scrim) while the action carries on: ignore close and disable Cancel while busy.
7. **Busy buttons drop focus out of a dialog** (`disabled` sends focus to `body`; the Tab trap is on the panel): use `aria-disabled` with a click guard, or trap on `document`.
8. **Enter in the sector picker always takes the top suggestion** ("Food" becomes "Food and beverage"): no highlight until an arrow key, or a "keep as typed" option.
9. **Flipped menus can cover their button** (`placeMenu`): pick the side with more room, clamp to 12px from both edges, set `max-height`.
10. **Menus come loose from their button on scroll or resize**: close or re-place.
11. **Focus moves to a field error only the first time** (`Field` effect keyed on the message): key it on a submit counter.
12. **Toasts can't be paused**: pause the 5.2s timer on hover and focus-within (WCAG 2.2.1).
13. Combobox highlight isn't clamped when options change from outside; the gallery's "Informed" `Field` label points at no control; PeoplePicker has no error outline.
Task rows and display:
14. **A row click while selecting opens the task** instead of toggling selection (stretched link still on): drop it when selecting and toggle on row click (prototype `tasks.js`).
15. **One `onDone` serves both directions**: "Mark not done" on a finished row slides it out as if finished (the gallery does this). Split into `onToggleDone(next)` and only mark leaving on done.
16. **List rows grow a meta line while "Just changed"**: render only the live tag there.
17. **The leave animation loses to the arrive glow** when both are set, and a faded leaving row stays clickable: order the rules, add `pointer-events: none`.
18. **Hover titles never show on rows** (stretched link covers the pill and avatars): lift them above it, so the full date shows on hover (guide 4.4).
19. **Row skeletons don't shimmer** (flat colour): reuse the block gradient, keyframe end as the prototype.
20. **Rows read the clock during render** when `today` isn't passed (server in UTC, team in UTC+7: hydration mismatch 00:00–07:00); the gallery fixes `TODAY` at module load. Make `today` required and compute it on the client.
21. Tests that pass without checking what they say: `taskRows.test.tsx` touch point and About cell (match the title), `gallery-rows.spec.ts` hit area probe (one side only).
22. Avatar keys use the name (duplicates when someone is both responsible and informed); two `Kind` spellings (`ui/Tag` vs `lib/kinds`): keep one mapping.
23. `shell.spec.ts` group count uses `toContainText("1")`: assert the exact count.

**Done in R2.1 (2026-10-20):** all 23 items above, with smoke or unit tests for each behaviour change. Items 1 and 4 opened two design gaps, sent as N4 (connecting) and N5 (a source failing while online), each built provisionally. The gallery's rows now use a fixed demo day (item 20). Checks: type check, lint on changed files, build pass; unit tests 227/227; full smoke suite 157 passed, 68 skipped, 1 browser crash in setup that passed on its rerun.

## Moved to later tasks
- 4.1: the page title and description still say "DEUS Platform" and "handover plan" (Q9 names it DEUS Team Space; 4.1 already renames the manifest).
- 3.x screens: `--z-menu` sits below `--z-dialog`, as in the prototype. Any screen that opens a menu from inside a dialog raises it there.

## Dropped, with reasons
- **Old hooks on `/old` don't forget their source on unmount** (the R1 note, on the old screens): the old screens are a temporary preview target removed in 4.7, the browser's offline state still refuses writes there, and fixing it needs per-source subscriber counts that the new `DeskData` (one subscription per source) doesn't need.
- **Busy buttons lose focus outside dialogs**: matches the prototype; covered inside dialogs by R2.1 item 7.
