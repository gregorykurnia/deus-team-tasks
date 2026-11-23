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
