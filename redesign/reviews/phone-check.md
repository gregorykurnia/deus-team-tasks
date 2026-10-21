# Real-phone check of the preview (task 4.6)

**Status: done (2026-10-21).** The owner ran the check on their phone and reported that it looks good, with no findings, so no fix tasks and no helper session were needed. Written by the runner on 2026-10-21.

## Before you start

- **Preview:** https://deus-team-tasks-git-redesign-gregorykurnia-8729s-projects.vercel.app (the branch address; it follows the newest `redesign` deploy). The deploy checked on 2026-10-21 was built from `1f5b138` at 13:37 UTC: https://deus-team-tasks-7raroruj5-gregorykurnia-8729s-projects.vercel.app
- **Sign-in:** the preview sits behind Vercel Authentication, so sign in to Vercel (team `gregorykurnia-8729s-projects`) in the phone's browser first. If the sign-in blocks you, or the installed app opens Vercel's page, write it down as a finding. Don't turn the protection off or make a public link: this preview uses live data.
- **Live data (Q2):** notes you write here are real. Copy the current text of one heading first, type `TEST 4.6` in it, and put the original text back at the end (step 9).

## Steps on your phone

Tick each one as you go. Write what you see in the findings table, even when it works.

1. [ ] Open the preview in the phone's browser. Today shows the team's data, and the tab bar and the More button are there.
2. [ ] Install: More → **Install on this phone**. On iPhone, Safari's Share → **Add to Home Screen**; on Android, the browser's install prompt. Note the name and icon on the home screen (the app's short name is "DEUS Space").
3. [ ] Open the installed app from the home screen. It opens full screen (no browser bar) and shows the same data. Note how the launch screen looks.
4. [ ] Go offline: airplane mode on (or Wi-Fi and mobile data both off). A "No connection." banner appears, and the data already on screen stays.
5. [ ] Still offline: close the app fully (swipe it away) and open it again from the home screen. It should show the data it loaded last, not a spinner that never ends.
6. [ ] Still offline: More → **Qualification notes** → open a prospect → type `TEST 4.6` in one heading. The save line should read "Kept on this device. Saves when you’re back online." and the text should stay when you leave the box.
7. [ ] Still offline: try a change that needs the server (for example, mark a task done). The app should refuse it and say so, and what you typed should stay.
8. [ ] Still offline: close the app fully and reopen it. The `TEST 4.6` text should still be there, with the "Kept on this device" line.
9. [ ] Come back: airplane mode off. A "Back online" message appears, the banner goes away, and the notes line changes to "Saved" within about 30 seconds. Then, on a computer or in a private window, open the same prospect's notes and check that `TEST 4.6` reached the server. Put the original heading text back, and check that too.
10. [ ] Look around at phone width: Today, All tasks, Plan (all three views), Companies, Qualification notes, Past clients, Flows. Note anything that runs off the screen, hides behind the tab bar, or is hard to tap with a thumb.

## Findings

One row per problem. **Blocks**: the step can't be done. **Should fix**: it works but is wrong or unclear. **Small**: wording, spacing or polish. The helper session fills in the Outcome column.

| # | Step | Screen | What happened | What should happen | Severity | Outcome (helper) |
|---|---|---|---|---|---|---|
| — | all | all | Nothing to report: the owner found the preview good on the phone (2026-10-21). | — | — | No fix task needed |

## Dry run (runner, 2026-10-21)

On the emulator at 390×844 with touch (the `phone` Playwright project), `npx playwright test --project=phone tests/smoke/notes-screen.spec.ts tests/smoke/shell.spec.ts -g "D-014|A3: with no connection"` passed 2 of 2 (16.8 s). Those tests cover steps 4, 6 and 9 on the emulator. Nothing automated installs the app or checks the install prompt, so steps 2, 3, 5 and 8 (the home screen and reopening the app) are not covered; neither is the phone's own network (steps 4 to 9), or how the preview looks on a real phone (step 10). The 4.4 screenshots compared the look in the emulator only.

## Helper session

Start a new session in this repo once the owner has filled in the findings, and paste this:

> Read `redesign/reviews/phone-check.md`. For each finding with no outcome yet, write one outcome in its Outcome column: (a) a fix task under 4.6 in the task table of `redesign/ui-implementation-plan.md`, named 4.6a, 4.6b and so on (one per area when several findings share one), with the model and effort from the table in `~/.claude/CLAUDE.md`, section text about one screen, and an empty Done cell; (b) a named later task; or (c) dropped, with the reason. Every finding gets one of these, and none stays only in the review file. Don't change app code in this session, and don't tick any box. Leave 4.6's Done cell empty: the owner ticks it when the check is complete. Commit the two files in one commit on `redesign` and push.
