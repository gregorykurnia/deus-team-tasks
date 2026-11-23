# Leave implementation results

## L1 — Leave rules

The worked example matches Calista’s −3, −2 and −1 balances, Audrey’s 2.5-day lapse and 3 days left, and Gregory’s 3-day lapse and 1 day left. Each month’s deduction starts on its first working day. Recounting a holiday updates both the request count and the balance.

- `npx tsc --noEmit` passed after `npx next typegen` generated the missing `LayoutProps` types and the hours fixture was corrected. `npx eslint` passed on all four changed TypeScript files.
- `npm run test:unit -- --maxWorkers=2` passed 1,768 of 1,769 tests. The existing notification-key test hit `spawnSync /opt/node-v26.10.0-linux-arm64/bin/node EPERM` and passed on a focused rerun with local process access. A focused run passed all 50 Leave cases, including request refusals, year and leap-day boundaries, waiting and upcoming leave, and repeat calculation.
- The special leave catalogue follows the listed statutory day counts. The two-day employee cap for childbirth stays paired with the admin override for longer leave, including the extension allowed by the 2024 law. [Law 13/2003, Article 93(4)](https://peraturan.bpk.go.id/Download/31128/UU%20Nomor%2013%20Tahun%202003.pdf), [Law 4/2024, Article 6](https://peraturan.go.id/files/uu-no-4-tahun-2024.pdf)

## L2 — Server reading and asking

The signed-in employee sees only their own profile, requests, ledger and balance. Admins can also see the waiting count. The device SDK is denied access to all five leave collections. The emulator tests cover simultaneous asks and cancellations, a lost response before and after commit, and reloading the balance after a cancellation or a holiday change.

- `npx next typegen`, `npx tsc --noEmit` and `npx eslint` on the 11 changed TypeScript files passed.
- `npm run test:unit -- --maxWorkers=2` passed 1,771 of 1,773 tests. A focused rerun passed both failures after the Leave client fixture was corrected to return a fresh response for each call. The existing task-plan non-JSON input test passed without changes.
- `npm run test:data` passed 391 tests in 19 files, including all 17 Leave cases, on the local Firestore and Auth emulators.
- `npm run build` passed with Leave and sign-in disabled and no Firebase Admin credential. All three Leave routes appear in the build.

## L3 — Admin leave server

Admins can read the Team and person views, decide requests, add leave for someone, adjust balances, edit details with an audit row for each changed field, and add or remove holidays. The three worked balances match across the routes, including both March lapses. Holiday changes recount requests in Mine, Team and person history.

Add-for-someone and adjustments use a UUID in `Idempotency-Key`. The client sends the version observed at load in `If-Match` for details and holiday changes, using `profile.updatedAt` and `holidayVersion` from the admin reads. The setup command previews by default, initializes missing profiles and seeds missing national holidays once. O2 covers production setup.

- `npx next typegen`, `npx tsc --noEmit`, and ESLint on the 13 changed JS and TS files passed.
- `npm run test:unit -- --maxWorkers=2` passed 1,773 of 1,774 tests. The existing task-plan non-JSON test hit `Test timed out in 5000ms` and passed on a focused rerun with a 15-second limit.
- `npm run test:data` passed 402 of 404 tests on local Firestore and Auth, including all 30 Leave cases. The existing company option rename and calendar 50-ID cases hit `Test timed out in 5000ms`. Both passed on focused reruns. The calendar case took about 21 seconds with a 60-second limit.
- `npm run build` passed with Leave and sign-in disabled and the Firebase Admin key empty. All six new routes appear in the build. All 19 holidays match the brief, including the 5 January holiday used in the ledger example.

## L4 — Leave pushes and the morning summary

Leave requests, decisions, cancellations, additions for someone and balance adjustments queue Web Push after a confirmed save. Delivery uses the existing active-person and device checks and excludes the actor. The 09:00 summary counts waiting requests for active leave admins and links to Team. It can send that line on its own.

- `npx tsc --noEmit` and ESLint passed on the nine TypeScript files. `npm run test:unit -- --maxWorkers=2 --testTimeout=15000` passed 1,786 of 1,787 tests. The existing key-generation test hit `spawnSync … EPERM` and passed on a focused rerun with local process access.
- `npm run test:data` passed all 414 tests in 19 files after local socket access resolved `listen EPERM` at emulator startup. The fake push cases covered each action and recipient, overlapping submissions, failed and delayed delivery, and the enabled, disabled and unavailable waiting count.
- `npm run build` passed with Leave and sign-in disabled and the Firebase Admin key empty.

## L5 — The Leave page

Leave opens from the side bar and from More. The page shows the signed-in person’s balance, requests and history. The shell reads only the waiting count outside Leave. A request link keeps its query through sign-in, and a confirmed cancellation reloads the record, balance and navigation count. The browser caches the optional page shell for its offline notice. Leave API responses stay out of that cache.

- `npx next typegen`, `npx tsc --noEmit`, ESLint on the changed code and `git diff --check` passed. `npm run test:unit -- --maxWorkers=2 --testTimeout=15000` passed 1,794 tests. `npm run build` passed with Leave and sign-in disabled and the Firebase Admin key empty.
- `npm run test:data` passed 413 of 415 tests. The personal API audit assertion (`expected … to not have property "audit"`) led to returning only the display fields for a person’s own detail changes. The unrelated `prospect/new` simultaneous-save case reported `TaskPlanConflictError`. The focused emulator rerun passed both cases and the active-admin badge and History privacy case.
- `tests/smoke/leave.spec.ts` passed six cases on desktop and six on phones against local Firestore and Auth. Both affected phone History cases passed again with the display-only change response. `tests/smoke/shell.spec.ts` passed six desktop and six phone cases across the scoped runs. The initial sign-in helper waited for a button after the sixth digit had already submitted the code. One cold shell run timed out going from `/notes` to `/past`. Both passed on rerun. The screenshot audit now waits for the overlay to settle and excludes the development toolbar.
- `test-results/leave-look/` holds the 1280 and 390 px frames, the 320 px stress cases and their 100% crops. The look check found a split Prospects label at 320 px, an offline headline that ran into its next sentence, and a phone sheet that left a large gap above Cancel request. The final frames show the repairs and the last History row after scrolling. The usual signed-in load and cancellation flows ran against the real emulator data. The stress image alone combines the negative balance and lapse warning synthetically.
- The referenced `docs/implementation/leave-screens.html` was absent from the checkout and Git history. The brief and design guide supplied the provisional layout. N38 records the missing comparison in the design implementation plan and handoff.

## L6 — Ask for leave

The balance card opens `/leave?ask=1`. The sheet checks dates, reasons, events, times and notes as they are filled, and previews the working days and available balance from the same calendar and ledger as the server. A confirmed employee request appears under Requests as Waiting. A failed send keeps the draft and retries with the original key.

- `npx tsc --noEmit`, ESLint on the changed TypeScript, `git diff --check`, and `npm run build` passed. The build ran with Leave and sign-in disabled and the Firebase Admin key empty. `npm run test:unit -- --maxWorkers=2 --testTimeout=15000` passed 1,794 tests. The remaining test hit `spawnSync … EPERM` and passed its isolated rerun. `npm run test:data` passed all 415 emulator tests.
- `npx playwright test tests/smoke/leave.spec.ts` covered 14 desktop and 14 phone cases across the scoped runs, with Auth and Firestore emulated and `LEAVE_TEST_DATE=2027-02-10`. Focused reruns passed after a local Auth request lost its reply and Chromium crashed while the Next cache logged `No space left on device`. The tests cover saved requests after reload, a late server refusal, a lost reply after a save, double submits, and a reply arriving after Back and a new draft.
- `test-results/leave-look/L6/` has the 1280, 390 and 320 px frames, opening sequences and 100% crops. The look check led to a shorter desktop drawer, balanced date errors and negative-balance text, keeping toasts clear of the failure notice, and fitting the entire note at 320 px. The longest event label, dates, preview and Send request fit together at 320 px, including after resizing before opening the sheet.
- The screens HTML is absent. N39 records the remaining comparison with reference frame 6. The desk and phone frames use the existing design guide's sheet, field and footer styles.

## L7 — Admin Team

Admins open Team from Leave even without their own leave profile. Waiting cards show the dates, days, available balance, overlapping leave and age. Approve uses the request’s pay rule or asks for a pay choice. Reject requires a reason that the requester sees in Mine. Successful decisions refresh the queue, the navigation count and the People figures. Phone rows show balance and available leave, and people who have left stay at the bottom.

The reference screens HTML is absent from the checkout. N40 records the frame 7 comparison for the provisional design. The gallery in `test-results/leave-look/L7/` includes the 1280 and 390 px states, a direct request link after reload, the first and last request sheets, 320 px stress frames, overlay openings sampled at 30 fps, and 100% crops.

- `npx tsc --noEmit`, ESLint on the changed TypeScript files, `npm run test:unit -- --maxWorkers=2 --testTimeout=15000` (1,795 tests), and `npm run test:data` (415 tests) passed. Data checks used the local Firestore and Auth emulators.
- `npm run build` passed with Leave and sign-in disabled and the Firebase Admin key empty.
- `tests/smoke/leave-admin.spec.ts` passed four desktop and five phone cases. `tests/smoke/leave.spec.ts` passed 14 per project across the scoped runs. The first desktop badge check hit `expect(page).not.toHaveURL(expected) failed` on `/sign-in`. Its isolated rerun passed. Early attached phone runs exited with SIGTERM and the logged background run completed.
- The decision tests cover whitespace and missing pay, late or lost replies, a retry after commit, two actions in flight, a competing decision, returning to Team while a decision is pending, and seeing the decision in Mine. They also check employee access, people with the same name in different case, and the missing-profile row.
- The look check moved the single desktop card’s actions close to its text, cleared the phone navigation bar from the People heading, and moved available leave above the long note. At 320 px, the pay actions fit side by side and the People rows give long names more room. The final frames and crops show the repairs.

### Look recheck

During the Reject and Pay openings, the previous screen’s text and action labels showed through the new dialog. The dialog scrim now blurs the screen underneath from its first frame while its tint fades in. The updated 30 fps sequences and full-size crops show the incoming labels clearly at 1280, 390, and 320 px. The runner’s audit recognized 54 opened paths in the L7 gallery.

- Team smoke passed four desktop and five phone cases across the reruns. Six affected Mine cancellation cases passed on desktop and phone. The motion checks verify the backdrop halfway through Reject and Pay and check that cancelling the nested dialog returns focus to Approve.
- Early sign-in attempts exceeded the browser deadline. The Leave test helper now requires fake-mail delivery before retrying through the UI. The capture sampler now pauses both animations when the dialog mounts. The first desktop retake then exceeded the 90-second test limit and passed with a longer capture-only limit.
- TypeScript, ESLint, and 1,795 unit tests passed. The feature-disabled production build compiled, checked types, and generated all 25 static pages. A full disk prevented the shell from recording its exit code.

### Decision dialog follow-up

- Reject and Choose pay keep their text and controls legible from the first frame. The shadow and scrim tint fade in, and the pay title has a wider word gap. Cards and request sheets say “Available leave after requests” for the projected balance.
- The opening assertion failed on the old first frame with `panel: "0"`. The Team smoke spec passed four desktop and five phone cases on the emulators, with the 320 px test skipped on desktop. The test warms cold auth and Team routes after initial timeouts. A detached run finished the cases left by an interrupted terminal session (`SIGTERM`).
- TypeScript, scoped ESLint, 1,795 unit tests, and the production build passed. The key-generation unit test passed on an isolated retry after `spawnSync … EPERM`. The build ran with Leave and sign-in disabled and an empty Firebase Admin key.
- The gallery includes 1280, 390, and 320 px captures, before-and-after opening frames, and 100% crops. The title stayed in the same position across the seven sampled frames of each decision opening. N40 tracks the missing frame 7 reference.

## L8 — Admin person and Holidays

Leave › Team opens individual leave from People, including a direct person link. The sheet shows the person’s balance, requests and audited history. Admins can add leave, adjust by half days, and change leave details. The Last day field shows which requests must be cancelled first. Holidays is beside People and groups dates by year. Adding or removing a date refreshes working days and balances.

The UI uses the shipped guide’s sheets, form fields and request rows. N41 records the comparison with reference frames 8 and 9 because the screens HTML is missing. The gallery is `test-results/leave-look/L8/`. It covers 1280, 390 and 320 px, with direct-link captures, individual request states, 30 fps opening frames and 100% crops.

- The look check moved form actions to the right, shortened desktop request details, kept text readable during openings, and kept full dates together in audit rows. The 320 px check uncovered a clipped last-day message and a confirmation that covered a long adjustment. The opening balance and date now share a row, the adjustment amount sits below its reason, and the save confirmation sits inline.
- The emulator scenarios cover balance and audit updates in Team and Mine, actor names, immediate Sick approval, holiday recounts in both directions, blank and duplicate input, lost replies, retrying a committed adjustment once, and stale edits that leave the newer profile or holiday in place.
- TypeScript, scoped ESLint and `git diff --check` passed. The unit suite passed 1,795 tests in 73 files. The local Auth and Firestore data suite passed 415 tests in 19 files. The production build passed with Leave and sign-in disabled and an empty Firebase Admin key.
- The targeted Playwright runs passed nine L8 cases and eight existing Team and Mine cases across desktop and phone. The 320 px case ran in the phone project. The first profile save and desktop Mine cancellation timed out during cold route compilation and passed after warm-up. The first stale-holiday assertion also counted Firestore’s version document. It passed after checking the holiday records alone.
- The last retake passed on the 390 and 320 px phone views. On desktop, the first retake was still loading at the 10-second reload assertion. The next retake saved the updated History image and timed out during screenshot capture. All desktop flow assertions then passed on a focused run with capture disabled. The gallery has 35 settled screenshots, 116 opening frames and 18 crops.

### Fresh-eyes follow-up

- Leave date fields display a day, named month and year. Typed dates and native calendar picks use the same ISO date in the form. An invalid optional date stays in the field for correction.
- The monthly start label names the +1 day. History gives the actor and the change separate lines and keeps each audit date whole. The approved Sick screenshot uses a February record with a February decision timestamp. The separate save assertion verifies the new Sick request.
- A declined request offers admins “Mark as cancelled” and explains the status change before confirmation. Holiday headings carry the year. The add form keeps its validation state while its error is hidden during removal. Leave forms and confirmations use the same outlined Cancel.
- Review captures are in `test-results/leave-look/L8/review/`. Shared Mine captures cover Annual leave, Sick, a few hours, waiting, approved and declined requests, and three audit changes at 1280, 390 and 320 px.
- TypeScript, scoped ESLint, 1,806 unit tests and the feature-disabled build passed. The browser run passed 18 cases and skipped the 320 px case on desktop. The remaining desktop retry passed after its test held all person readbacks until the manual retry. Three focused phone retakes passed.
- The emulator data run passed 414 of 415 tests. The adjustment concurrency case hit `Test timed out in 5000ms` and passed its isolated rerun in 2.87 seconds with a 15-second limit. The gallery contains 78 screenshots and 11 crops.

## E1 — End to end

The desktop spec signs Calista, Audrey and Gregory in through the Auth emulator in separate browser sessions. It seeds opening profiles and national holidays, then submits all five requests, approves the four employee requests and saves Gregory’s adjustment through Leave. One Firestore emulator keeps those records across the pinned days.

| Pinned day | Balance and History checks |
|---|---|
| 31 Dec 2026 | Audrey 5, including 1 day used on 24 Dec. |
| 6 Jan 2027 | Audrey 4, including 2 days used over 4–6 Jan. The 5 Jan holiday is excluded. |
| 20 Jan | Gregory 6 after the −5 adjustment. |
| 31 Jan | Calista −3 before her first monthly +1. Audrey 4 and Gregory 6. |
| 1 Feb | Calista −2 after her first monthly +1. Audrey 5 and Gregory 7. |
| 10 Feb | Calista −2, Audrey 4.5 after her morning half day, and Gregory 7. Audrey’s warning shows 2.5 days due to lapse. |
| 28 Feb | Calista −2, Audrey 4.5 and Gregory 5 after the first 2 days of his 4-day request. |
| 1 Mar | Calista −1 with no lapse. Audrey lapses 2.5, earns 1 and ends at 3. Gregory lapses 3, earns 1, uses the remaining 2 days and ends at 1. |
| After cancellation, 1 Mar | Gregory cancels Calista’s approved January leave. Calista sees Cancelled and a balance of 2. The three-day debit disappears from History. |

The Team badge went from four waiting to zero. The fake transport recorded exactly four request pushes to Gregory, four approval pushes to the employees and the cancellation push to Calista. Gregory’s own leave and adjustment generated no push.

- Desktop Playwright passed E1 and all 15 existing Leave tests. The first E1 run expected the empty badge’s accessible name to be `Leave`. The focused rerun passed with `Leave 0 waiting`.
- TypeScript and scoped ESLint passed. The unit run passed 1,804 of 1,806 tests. The two failures (`spawnSync /opt/node-v26.10.0-linux-arm64/bin/node EPERM` and `Test timed out in 5000ms`) both passed on the focused rerun.
- `npm run test:data` passed all 416 tests across 19 files. The emulator clock test covers an advanced date, blank and invalid dates, and fallback after file removal.
- The Next.js build passed with Leave and sign-in disabled and an empty Firebase Admin key. `git diff --check` passed.

## R1a — Full check run

### Smoke

`npm run test:smoke` exited 1 after 2.3 hours. **490 passed, 17 skipped, 7 failed** across desktop, phone and Jakarta. The run used local Firestore and Auth emulators, fake mail, push and calendar, and the configured Leave clock.

| Project | Spec and test | What failed |
|---|---|---|
| desktop | `tests/smoke/leave-admin.spec.ts:167` — opens waiting cards from links and saves decisions visible to the employee | After the admin entered the code for `/leave?view=team&request=first`, the browser stayed on `/sign-in` for 30 seconds (`tests/smoke/leaveSession.ts:26`). It never reached the decision steps. |
| desktop | `tests/smoke/leave-ledger.spec.ts:93` — replays the three worked balances through February, March lapse and approved cancellation | After pinning March 1, the Leave response gave `today: 2027-02-10` instead of `2027-03-01` (`tests/smoke/leave-ledger.spec.ts:79`, called at line 173). The March lapse and cancellation checks did not run. |
| desktop | `tests/smoke/notifications.spec.ts:101` — turn on, test, resave a lost device, and sign out remove this device | The sheet never showed “Notifications are on for this…” within 10 seconds after Turn on notifications (`:122`). |
| desktop | `tests/smoke/notifications.spec.ts:195` — a failed registration retries the existing subscription; test errors never claim sent; 403 signs out | After the forced 503 was removed, Send a test never showed “Test sent.” within 10 seconds (`:222`). |
| phone | `tests/smoke/chat-task-edits.spec.ts:104` — R1b.F2: capture 065 with all stress tasks and their companies | The 120-second test deadline expired before the stress capture. |
| phone | `tests/smoke/chat-task-edits.spec.ts:141` — R1b.F2: layout audit rejects missing and offscreen sheets | The 60-second deadline expired in the `cleanData` fixture before the layout assertions (`tests/smoke/fixtures.ts:24`). |
| phone | `tests/smoke/sign-in.spec.ts:355` — fresh-eyes: shared account entries fit three other screens at every size | In More on `/companies?more=1` at 320 × 740, the bottom of “Live, everyone's up to date” was at y=760 (`:74`). |

### Accessibility

`npm run a11y` completed 284 distinct desktop and phone state runs with zero axe rule violations. It exited 1 because one state setup recorded an error.

- `173-fields-and-options-remove-an-option-desktop`, `/companies?fields=active`. The audit opened Options and found the Remove First meeting button, but the click timed out after 4 seconds (`scripts/compare/recipes.mjs:128`). The intended removal state went unaudited. The phone setup succeeded.

### Scoped comparison

`npm run compare -- --only '^(001-today-normal|276-moving-around-on-phones-more-sheet)$' --force` exited 0. It regenerated four comparisons at 1440 × 900 and 390 × 844 with Leave and sign-in enabled. All four reported zero capture, runtime or layout errors. The app showed Leave in Today’s desktop sidebar and in the phone More sheet. The More URL on desktop showed Today without the sheet, as the shell spec expects. The text diff includes Leave and the existing Sign in entry, which the prototype omits.

### Light checks

`npx tsc --noEmit`, `npm run test:unit` (1,806 passed across 74 files) and `git diff --check` passed. ESLint has no matching configuration for the two Markdown files. R1b owns the seven smoke failures and the audit setup timeout listed above.

## R1b — Fix recorded failures

Each of the seven R1a smoke failures passed a scoped Playwright replay on the local Firestore and Auth emulators.

| Case | Repair and evidence |
|---|---|
| Leave Team deep link | Enter each code digit in its own input. The first replay reached the next stale assertion. After rejecting Audrey’s one-day request, Available moves from 7 to 8 days. The corrected case passed on desktop and phone, including reload, the admin decisions and the employee’s view. |
| Leave ledger | Check the three people concurrently within each pinned date and give the scenario four minutes. The desktop case passed in 2.1 minutes through accrual, the March lapse and restoration of all three days after cancellation. |
| Two notification cases | Warm the guarded routes and let the UI assertions cover the client’s deadline. Both cases passed on desktop and enable/test/sign-out also passed on phone. The forced lost reply and retry kept one device, the forced 503 showed an error, and access removal returned 403. |
| Two Task layout cases | Give the full fixture time to seed and take the synthetic HTML audit out of the Firestore reset fixture. Both cases passed on phone and desktop. The stress fixture kept 2,408 tasks, 48 groups and all 179 linked companies. |
| More on the smallest phone | Wait for the sheet’s entrance to finish and assert that the whole live status is in the viewport. The shared navigation case passed on both projects, including direct `/companies?more=1` at 320 and 390 pixels. |
| Remove a company option | Wait for Remove inside the named options dialog and require the confirmation before scanning. `npm run a11y -- --only '^173-fields-and-options-remove-an-option$'` passed both states with zero setup errors or violations. The same state compared against its prototype at 1280 and 390 with zero capture, runtime or layout errors. |

The required narrow stress shot exposed a separate real overflow in the Tasks toolbar. At 320 pixels, the four work labels with their counts widened the document to 362 pixels and made the browser shrink the Task sheet. The counts now stack below their labels on narrow phones. The final stress case passed at 320, 390, 1280 and 1440. The long description and pinned Save changes fit in the task opened from `/tasks?task=s1`.

The gallery is in `test-results/r1b-look/` and `test-results/leave-look/L7/`. Native frames and 100% crops show the Task sheet before and after, the work filters with the sheet closed, More, notification states, the first request after reload, the last waiting request, the refreshed Team balance, and the option confirmation. The comparison uses the existing design guide for Leave and the prototype for Companies.

`npx tsc --noEmit`, ESLint on the touched TypeScript and comparison recipe, `npm run test:unit -- --maxWorkers=2 --testTimeout=15000` (1,806 tests), and `npm run build` passed. ESLint reported three existing unused-variable warnings in `scripts/compare/recipes.mjs`. The initial attached browser probe exited with SIGTERM, and the completed replays ran in logged processes.

### R1 items

- Exact Leave reference comparison is carried in N38 and N40 because the referenced screens HTML is missing. The gallery uses the design guide and the existing L7 frames.
- At 1280 pixels, the sidebar wraps the two digits of an open-task count vertically beside a long starred group. The crop is `test-results/r1b-look/crops/1280-sidebar-count-wrap.png`. This is in `desk/SideNav.module.css:184`, separate from the Tasks toolbar overflow.

## R1 — Phase review

Read the ledger, rules, server, routes, pushes, morning line, Firestore rules, setup script and client fetches before
the builders' notes. Hunted: balances by hand, every route as a non-admin and as a removed person, the device SDK and
the page before sign-in, pushes to the wrong person, retries and lost replies.

- **Balances:** hand-worked Calista, Audrey and Gregory on 2026-12-15, 2027-01-02/10/13, 2027-02-24, 2027-03-02 and
  2027-04-01 (balance, upcoming, available, lapse warning, next +1); all match `buildLedger`. Kept as the
  "R1 hand-worked balances" cases in `tests/unit/leaveLedger.test.ts`.
- **Permissions:** every `/api/leave/*` route checks the flag, the ID token (revoked → 401) and an active `people`
  record inside its transaction; admin routes check `LEAVE_ADMINS` on the server. A non-admin sending `email` gets 403,
  sending `pay` is ignored; cancelling someone else's request is 404. No fault found.
- **Privacy:** `firestore.rules` names no leave collection (default deny); the client only calls `/api/leave/*` with a
  token; `/leave` renders no leave data on the server; responses are `no-store`; the test clock only works when
  `NODE_ENV` isn't production. No fault found.
- **Pushes:** recipients are the request's own person or `LEAVE_ADMINS` minus the actor; delivery skips inactive
  people; retries and double decisions get 409 and push nothing. No fault found.

FINDING: L5 · bug · an admin could cancel a rejected request, so the person saw "Cancelled" instead of "Not approved"
and the reason dropped from view. Fixed: `canCancelLeave` allows only waiting or approved; unit cases and the L4 push
data test now expect 409.
FINDING: L3 · bug · a balance adjustment dated before the person's opening date (also the default "today" before
go-live) was saved but never counted. Fixed: refused with "This balance starts on … Change the opening balance
instead."; data case added.
FINDING: - · minor · at 1280 px the side bar's open-task count wrapped its digits beside a long starred group (R1b
item). Fixed: the count no longer shrinks or wraps (`desk/SideNav.module.css`).
FINDING: - · minor · the screens page source named in the plan is missing; already carried as N38/N40, now owner step
O8.

Checks: `npx tsc --noEmit`, ESLint on the changed TypeScript, `npm run test:unit` (1,811 passed), and the data tests
for `lib/leave.server.data.test.ts` and `lib/morningSummary.server.data.test.ts` on the emulators (57 passed).
No browser spec was rerun (no flow changed). Open items: none left for a fix row; owner steps O1–O8.
