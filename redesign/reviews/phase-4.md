# Phase 4 review (R4)

2026-10-21 · Opus 5.5 · diff `fb93b76..66d56cd` on `redesign` (tasks 4.1–4.8), read in four parts against the implementation plan's Phase 4 sections and §7, the guide (5.8, 6.9, 8) and the prototype: install and PWA (4.1), live changes and leftovers (4.2), the screenshot and accessibility changes with the rewritten tests (4.3–4.5), and the launch data step with the old files' removal (4.8, 4.7). Every item below is fixed in the R4 commit, or dropped with a reason. None stays open here. Nothing is moved to a later task: M (the merge) only merges.

## Checks
- Before the fixes: type check and lint (app, desk, ui, features, lib, tests, scripts): pass, 3 warnings in the screenshot recipes (unused names). Old-names check: prints nothing.
- After the fixes: type check, lint on the changed files, old-names check: pass. Unit tests 506/506 (new: the launch undo that leaves later changes alone, own transaction writes, the header range in another year, the companies link's group). Build: pass. Launch data dry run on the emulator (`npm run launch-data:dry`): import, check, undo of only the import, check, all pass; an empty export is refused.
- Full smoke suite (one run after the fixes, machine otherwise idle, 41.6 min): 605 passed, 1 failed, 15 skipped (screen size). The failure was a new a11y test's row selector (company rows are articles); fixed, and the failed test rerun alone passes, as do the four new menu and editor cases on both projects.
- Full `npm run compare` (R4's one run of the whole tool, before the fixes): 246 normal states × 2 sizes. The emulator started failing every seed with 500 errors after about 45 minutes (state 167 on), so the 116 states not yet shot were rerun on a fresh emulator in two batches: 492/492 shot. Every difference from the last report traces to 4.5 (words for screen readers, N17's "Open Plan", deliberate difference 27); no new page errors. Stress data, 31 states × 2: 008 didn't seed (emulator 500, as in 4.4a) and the other 30 never go live in the emulator (its Listen channel overflows, as logged in 4.4c and 4.4d; this run Flows' three stress states didn't either). After the fixes, only the states they touch were shot again (Plan month and other-year ranges, the notes link, the sector editor, the install sheet): 20/20, as expected.

## Fixed in the R4 commit

Must fix (data, or the app breaking):
1. **Launch data: an empty export was imported as if it were the owner's settings.** An export from the wrong browser or address (both values empty) wrote the defaults over `settings/companies` and said "Done and checked". The import now stops on an empty export and names where it came from; `--allow-empty` imports the defaults on purpose. The export snippet warns in the console too.
2. **Launch data: the undo overwrote changes made after launch.** It put back every past client's sector that differed from the backup and the whole settings record. An import's backup now keeps what the import wrote (`import.json`); its restore puts back only the sectors the import filled that still hold that sector, and the settings record only while it still holds what the import wrote, says what it leaves alone, and backs up first. `restore --latest` takes the newest backup an import made; a backup of one target can't be restored onto the other; a sector that wasn't there is removed again, not set to null.
3. **Flows: a failed older save could still put older typing over newer.** A save that failed after a later save had already carried newer typing for the same field brought the older words back as unsaved, and the next save (or a late Try again) wrote them. Now a failed save only brings back fields no later save carried, and a Try again pressed after the editor closed carries only those.
4. **Offline: an update could delete the working copy for a partial one.** The service worker's install swallowed every failed fetch, so a new build on a weak connection activated with pages or files missing and deleted the previous complete copy. Any page or named file that can't be fetched now fails the install, so the previous worker and its copy stay until the next try.

Should fix:
5. Launch data: reads came from the local cache when the server couldn't be reached, so a backup could be empty (and its restore would delete the settings record). Every read is from the server; with no connection the step stops.
6. Launch data: the sectors to fill were worked out before the "type live" prompt; a sector typed meanwhile was overwritten. They're worked out from the backup taken right before the write.
7. Live changes: your own flow edits and new companies were tagged "Just changed" (transactions have no pending stage). Those writes say so first, and count as this device's for 15 seconds.
8. Live changes: coming back online tagged every change made meanwhile and could add the many-changes toast beside "Back online". The first server snapshot after a spell on the device's copy is treated like the first load.
9. Task groups: Try again on a partly finished delete reused the tasks as they were, and pressed from another screen it moved you to Internal. It uses the tasks as they are then, and moves only from the group's own page.
10. Offline: a task group's address opened from the device showed All tasks. The tasks screen reads the group from the address.
11. Offline: a page the network didn't answer (a weak signal, a captive Wi-Fi) hung on a blank screen. After 4 seconds the device's copy opens; the network's answer still updates the copy.
12. Install: the browser's install offer could come before the app was ready and be lost. A first script in the page keeps it.
13. Install: "installed" was remembered for the tab only; a reloaded desktop tab showed the install entries and N16's "can't install" note. It's remembered on the device, and forgotten when the browser offers to install again.
14. Install: the launch screen went only when the app's scripts ran; it now also goes by itself after 3 seconds, and shows only when the app opens, not on each offline screen change.
15. Accessibility: the notes link editor and the past clients' sector editor held menu items directly in a dialog (critical in axe). Their lists are menus now. New axe cases cover a menu with a number field, a company's date editor, the link editor and the sector editor, and the arrow keys leaving the "No action for" field (difference 41).
16. Accessibility: in Plan's month, task and event titles of the neighbouring months were faded below 4.5:1. They take `--muted`, and only the dots and marks fade (difference 37 updated).

Minor:
17. Plan: the header range gave the year twice when the whole range was in another year ("1 Mar 2027 to 28 Mar 2027"); it's "1 Mar to 28 Mar 2027".
18. Task groups: a partly finished rename said "450 of 1,200 tasks renamed the group"; it says "450 of 1,200 tasks moved to the new name. Couldn’t move the other 750…".
19. All tasks: "Also mentioned in 3 companies" opened the default group, which could show fewer; it opens the group with the most of them (the list names the others).
20. Install: after the browser's dialog was closed without installing, the sheet said the browser can't install; it says the offer was closed and how to get it again (N16, provisional).
21. Offline: fonts named in the style files (relative addresses) were never stored; they are now.
22. Old files: the create-next-app pictures in `public/` and the old screens' types and defaults in `lib/clientTypes.ts` are gone.

## Dropped, with reasons
- **The launch import replaces settings added on the preview** instead of merging them: Q4 says the main computer's settings become the team's, and the plan run lists everything it replaces before anything is written, so the owner sees it. Values in a dropped own field stay stored on the companies.
- **Leftover take-back entries** (a Try again offer kept after its toast timed out, a scoped toast's id after it closed): one small entry per failed save or toast in a session, with no visible effect.
- **The two-week chart's per-day links on phones** (N17): the provisional version is the studio's call; the gap is open in `needs.md`.
