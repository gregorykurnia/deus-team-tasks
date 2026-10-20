# Phase 3 review (R3)

2026-10-20 · Opus 5.5 · diff `6c02d1d..f28020b` on `redesign` (tasks 3.1–3.14), read area by area against the implementation plan's §2, §3 and Phase 3 sections, the guide (4.x, 5.x, 6.1–6.8) and the prototype pages. Every item below is fixed in the R3 commit (fix task **R3.1**, done in the same commit), moved to a named later task, or dropped with a reason. None stays open here.

## Checks
- Before the fixes: type check, lint (app, desk, ui, features, lib, tests), build: pass. Unit tests 447/447.
- After the fixes: type check, lint, build: pass. Unit tests 474/474 (27 added), plus one for item 9's follow-up.
- Full smoke suite (one run after the fixes, machine otherwise idle): 464 passed, 2 failed, 70 skipped (the phone project skips the old UI's specs). Both failures were the same flows test on desktop and phone (the decision's question and outcome never saved), caused by item 9's transactions; fixed below, then the flows specs (both projects) passed, and that test passed 4 more runs in a row.
- No `alert()` / `confirm()` left in the new code; no clock read during the server render.

## Fixed (R3.1)
Data that could be lost, or a failed write shown as saved (must fix):
1. **Quick capture wiped the next task being typed** when the first add came back (Today, All tasks, task groups). Only the sent words are taken off now.
2. **Flows: losing the connection while editing dropped what was typed** and closed the editor. The editor stays open with its fields read only, keeps the typing, and saves it once the connection is back.
3. **Flows: a refused save still said "Saved"**, and Done said "Flow saved for everyone". The save line says "Not saved." with Try again (N13), and Done only claims saved when it is.
4. **Qualification notes: a refused save put the old text back and said "Saved".** The writing comes back as unsaved typing with "Not saved." and Try again; the old text rolling back isn't shown as a colleague's change.
5. **Qualification notes: writing kept on the device was dropped silently** when the notes had been deleted meanwhile (an offline stretch). One error toast offers "Copy it" (N10).
6. **Companies: a quick editor closed before saving**, so a refused or failed save lost what was typed. It closes only once saved ("Saving…" meanwhile).
7. **Companies: renaming or removing an option could half-apply with no way to finish** (settings saved, some companies not). The toast says so, with Try again that finishes it (N13).
8. **Companies: Delete company ran on tasks and notes not yet loaded from the server**, so the cascade missed some. Delete waits (disabled, with the reason) until both are confirmed, and a failed delete keeps the confirmation.
9. **Flows: two people editing different steps lost one edit** (whole arrays written from a local copy). Each change now runs in a transaction on the stored flow. Undo and Try again from an editor that has closed apply to the current flow, not a stale copy. Found by the smoke run: a part added in one change (the decision's outcomes) got new ids each time the change ran, and this device's transactions could overtake each other, so typing into a new part found nothing stored and was dropped. A change now names its new parts the same way every time it runs, and one flow's changes run in order.
10. **Bulk task changes that half-committed said they failed, with no Undo** (Select all, one chunk refused). The toast says how many changed, with Undo for those; tasks gone meanwhile are left out first.
11. **Undo could bring a past client's subsidiary back under a parent that was deleted since**, where it vanished from the record. It's refused with a message.

Bugs and missing states (should fix):
12. Plan: the calendar route stopped at 250 events (Month and Day ask for 70 days). It follows every page now, up to 10 × 2,500.
13. Plan: Day landing beyond the loaded weeks showed no events; that month is fetched too.
14. Plan: typing a year in Day's date field broke the address (`0002-10-20`); the field keeps a draft until the date is real.
15. Plan, Today: someone both responsible and informed on a task was counted twice.
16. Plan: Month's empty state showed while events loaded, and said "deadlines" in Events only.
17. Plan: `?view=people&person=` with a name that isn't a person crashed the screen.
18. Plan: finding the next busy day was slow at stress sizes (400 days × every task); one pass now.
19. Task details: a link to a task made since the last visit said it was gone (cache checked, not the server). Offline, the sheet waits and opens it once back (N14).
20. All tasks: "Select all" grew when the filters changed (12 overdue became 1,579). Changing the view keeps only the tasks still shown.
21. Today: opened offline with nothing loaded, it showed "Loading" forever; it shows the offline empty state.
22. Task details: "A company" with none chosen saved as internal work under a Prospect tag; it's now a required field (N15), and switching About back keeps the chosen company.
23. Task details: Undo after "Changes saved and marked done" undid only the done. Two toasts now: "Changes saved", then "Marked done" with Undo.
24. Companies: the None choice in the Status and Priority filters matched nothing.
25. Companies: a company link spun forever when companies failed to load.
26. Companies: the priority order ignored renamed and new options.
27. Companies: the team's settings failing to load fell back to the built-in ones without a word (notice, as N5).
28. Past clients: in Add, changing the parent kept the first parent's sector.
29. Flows: "No connection." showed while still connecting (N4); the phone's full-screen flow and notes hid the offline banner.
30. Flows: role drafts were tied to a role's position; roles get a stable id (added on the flow's next save; only adds a field). Undo of a failed role removal no longer duplicates it.

Minor:
31. Plan: a person page showed 0s while loading (skeletons now); far-off "Next due" lost its month; group names were lowercased in the Work wording; the overdue chip's link keeps the Work filter.
32. Companies: picking the chosen option again saved and toasted; phone cells were under the 40px tap target.
33. Task details: your own delete flashed "This task was deleted.".
34. Notes: "Saved" could flash before "Saving…"; link and unlink brought deleted notes back half empty; pagehide also saves; the export of open notes that vanished said "clear the search".
35. Past clients: Undo of an add blocked by a new subsidiary blamed the connection; "1 subsidiaries".
36. Flows: search found words in old outcome labels that aren't shown; save lines (flows, notes) are one live region each.
37. Tests: chunking (451 operations), select all after a filter change, offline task link, required company, the flows typing test now lets a save and a colleague's change land mid-typing, role drafts, offline editing, past-client Undo guard, quick editor offline.

## Moved to later tasks
- 4.2: a way to take a toast back, so a closed flow editor clears its Undo and Try again (an old Try again can still put older typing over newer typing in the same field); the company delete and task group writes word a partly saved batch as the task screens do; the offline banner says changes can't be saved, while notes keep writing on the device.
- 4.3: one smoke project in the team's time zone (Asia/Jakarta); nothing runs the browser at UTC+7 today.

## Dropped, with reasons
- Plan's "Busiest" chip and the quiet stretch skipping weekends: both as in the prototype.
- Plan's overdue chip with a Person filter: All tasks has no person filter in the design, so the link can't carry it.
- `lib/useTasks.ts` `orderBy("order")` drops tasks without `order`: every write path in both UIs sets it; only tasks written outside the app could lack it, as before.
- The last keystrokes before closing a tab: `pagehide` and `visibilitychange` now save, and a write handed to Firestore can't be made synchronous.
- The old flows screen (`/old`) may drop role ids when it saves a flow: the new screen falls back to positions for those roles, and `/old` goes in 4.7.
