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
