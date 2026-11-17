# Build brief: Audrey signs in and gets notifications on her iPhone

This brief holds the details for `docs/IMPLEMENTATION_PLAN.md`. Only that plan holds progress ticks. Every default
below is settled for an unattended run, so no task stops to ask.

## What the owner asked, and the smallest design

> "For the responsible, we wanna start converting the existing names to actually a new user account linked to an
> email and later like we notify them when they have a task pending or due tomorrow … one by one, Audrey first …
> how to ensure like it can give phone notification."

Owner answers, 2026-11-17: real sign-in; everyone has a deushcs.com email on **Titan Mail** (no Google or Microsoft
sign-in), so sign in with a **6-digit code sent by email**; Audrey (`audrey.wijaya@deushcs.com`) is on **iPhone**;
**push notifications only** (no email notifications); a summary at **09:00, weekdays only**; a notification **as
soon as a task is given to her**. Phase 2 (everyone must sign in, the database locked) comes **later**, not in this
plan. Owner, later the same day: sign-in is **its own page now** (it becomes the front door in Phase 2), and
**Gregory (`gregory.kurnia@deushcs.com`) is a second allowed login** from the start.

**Smallest design:**
- **A person record** links an email to the name already on tasks: `people/{email}` holds `{ email, name: "Audrey",
  active: true }`. Tasks don't change; `responsible` stays a list of names.
- **Sign in with a code, on its own page:** `/sign-in`, outside the app's shell (no side bar or tab bar), opened from
  More and the side bar foot with `?next=<where you were>`; "Back to the app" returns there. The device sends the email; the server checks it ends in `@deushcs.com` and has an active
  person record, emails a 6-digit code through a Titan mailbox (SMTP), and on the right code returns a Firebase
  custom token (uid = the email). The device signs in with it and Firebase keeps it signed in.
- **Push through the installed app (Web Push):** the service worker shows notifications; each device's push
  subscription is saved under the person (`people/{email}/devices/{id}`), only by a signed-in request.
- **New task for you:** after a save that changes Responsible, the device tells the server which tasks changed (the
  same pattern as `requestCalendarSync` in `lib/calendarRequests.ts`). The server works out who is owed a
  notification itself: a linked person on the task's Responsible who isn't in that task's server-only notice record
  yet. The chat connector's save paths call the same server function directly.
- **Morning summary:** a Vercel cron at 02:00 UTC Monday to Friday (09:00 Jakarta) builds each signed-up person's
  summary from open tasks and sends one push.
- **The screens** are the page `docs/implementation/sign-in-screens.html`
  (https://claude.ai/artifact/J2YrGzCsGVeZ2D2CHi9Bay), built only from existing design-guide parts; the owner's
  approval is the plan's "Before the run" line. It is the design for every screen task; open it in a browser and
  match it.
- **iPhone and iPad sign in inside the Home Screen app.** Safari and the Home Screen app keep separate sign-ins, and
  notifications only work in the Home Screen app, so on iPhone or iPad outside it, the sign-in page opens on the "Add DEUS Space
  to your Home Screen first" card (screens page section 2, third frame) with a quiet "Sign in here anyway"
  button that goes on to the email step.

Settled defaults, each with the risk it closes:
- **Off until the owner switches it on:** everything is behind `NEXT_PUBLIC_SIGN_IN_ENABLED=1` (read on the server
  and the device). Off: the entries are hidden, the routes answer 404, the cron does nothing. Risk closed: every push
  to `main` deploys, so half-built sign-in would be live mid-run.
- **Server-only data through `firebase-admin`:** `people`, `signInCodes`, `devices` and `assignNotices` are read and
  written only by the server with the Admin SDK. `firestore.rules` already closes every collection it doesn't name,
  so the rules don't change; add a rules data test proving the device can't read or write them. Risk closed: emails
  and push addresses readable by anyone, and anyone faking the notice record, since the other collections are open.
- **Codes are stored as an HMAC** (`CODE_SECRET`) with `expiresAt` (10 minutes) and used once. `signInCodes/{email}`
  keeps every unexpired code from the last hour (at most 5), and verify accepts any of them, so a new code doesn't
  kill the one she's typing. Risk closed: a leaked database row signing someone in.
- **Rate limits, per email:** at most 5 codes an hour, a new code only 60 seconds after the last, and 5 wrong tries
  an hour across all codes. Past either limit the email waits until the oldest code or try is an hour old ("Too many
  tries. Wait 15 minutes" uses the real wait, rounded up to 5 minutes). Verify counts tries in a transaction.
  Risk closed: guessing a 6-digit code, or someone filling Audrey's inbox.
- **Removing access:** `people:remove` sets `active: false`, revokes the Firebase refresh tokens (a person who never
  signed in has no Firebase user; that is not an error) and deletes the person's devices. Every signed-in route
  checks `active` on each call. Risk closed: a removed person keeps getting notifications on a phone that's still
  signed in.
- **Notified once per task and name, decided on the server:** `assignNotices/{taskId}` holds `notified: string[]`,
  the names already told about that task. On a ping the server sends to each linked person in the task's Responsible
  who isn't in `notified`, then sets `notified` to the task's Responsible names that are linked people (so a name
  removed and added again is told again). The device's ping says only which tasks changed, so a stray or forged ping
  can't send anything that isn't owed. `people:add --apply` first writes every existing task that already has the
  name into `assignNotices` (the backfill), so old tasks are never announced. Risk closed: repeats on every re-save,
  a flood of old tasks at go-live, and the task document growing a field other code would copy or strip.
- **No notification to yourself:** when the ping carries a signed-in ID token whose person is on the task, that name
  is recorded in `notified` without a push.
- **Cron protected by `CRON_SECRET`:** the route answers 401 unless `CRON_SECRET` is set and the request has
  `Authorization: Bearer <CRON_SECRET>`, which Vercel sends by itself once the variable is set. It sends at most one
  summary per person per Jakarta day (`people/{email}.lastSummaryDate`). Risk closed: anyone triggering summaries,
  and a repeated cron run sending two.
- **Fakes only on the emulator:** the mailer and the push sender have fakes that write to a Firestore collection
  (`_fakeMail`, `_fakePush`) used only when `USE_EMULATOR` is on, the way `CALENDAR_FAKE` works in
  `lib/calendarFake.ts`. Production refuses to start a fake. Risk closed: tests mailing or pushing real people.

**What each notification says** (words from the screens page, section 7 and 9):
- New task: title `New task for you`; body line 1 the task's name, line 2 `Deadline Thu 20 Nov · Prospect work`
  (`No deadline` when none; kind words as guide 5.2). A subtask's line 2 is `Subtask of <main task> · Deadline …`.
  Tapping opens `/?task=<id>`.
- Summary: title from the counts that aren't zero, joined by `, `, in this order: `N late`, `N due today`,
  `N tomorrow` (Friday: `N due by Monday`, covering Saturday to Monday); body one line per group,
  `Late: <name> (2 days late)` (`1 day late`), `Today: <name>, <name>`, `Tomorrow: …` or `By Monday: …`, at most 3
  names in all, then `+N more`. Tapping opens `/plan?view=people&person=<name>`. Nothing late or due: nothing is sent.
- Lengths: every task name in a notification is cut to 60 characters with `…`, and the body to 4 lines, so the lock
  screen shows the deadline line; numbers and plurals follow guide 7 rule 5.
- Counted tasks: open (not done), not parked, the person in `responsible`. Main tasks and subtasks count on their
  own. Dates are Jakarta days (use `wibToday` from `lib/followupServer.ts`).
- Test: title `Notifications work`, body `New tasks and the 09:00 summary will arrive here.`

**Out of scope** (list as follow-ups, don't build): Phase 2 (everyone signs in and the sign-in page becomes the front
door, rules locked, a People screen to link emails, "who gave you this"); notifications for Informed; email notifications; reminders at other times; public
holidays; notifications for saves made while offline (the summary still lists them); renaming a person's name on
tasks.

## Requirements

| ID | Required behavior | Built / proven in |
|---|---|---|
| S1 | Only an active @deushcs.com person can get a code, and only the right code within 10 minutes and 5 tries signs in. | A1, A2, E1 |
| S2 | Audrey and Gregory can sign in on the sign-in page, opened from More (phone) or the side bar (laptop), stay signed in, see their account and sign out. | A3, E1 |
| S3 | She can turn on notifications on the installed app, is guided when in Safari or blocked, and can send a test. | A4, A5, E1 |
| S4 | A save from the app or chat that adds her to Responsible sends one "New task for you" within seconds, never twice for the same task, never for her own change. | A6, E1 |
| S5 | At 09:00 Jakarta, Monday to Friday, she gets one summary of what's late, due today and due tomorrow (Friday: by Monday), and nothing on empty mornings. | A7, E1 |
| S6 | Nothing is visible or reachable until the owner sets the flag, and no test can mail or push a real person. | A1–A7, R1 |

## Checks

Per task: `npx tsc --noEmit`, `npx eslint <changed files>`, `npm run test:unit`, plus `npm run test:data` when the
task touches Firestore (it now starts the auth emulator too, after A1). Browser work: only
`npx playwright test tests/smoke/sign-in.spec.ts` (and `notifications.spec.ts` once it exists), plus
`tests/smoke/shell.spec.ts` for the task that changes More or the side bar. Run one test stack at a time and stop
only the PIDs you started. After a failure, rerun only the affected tests. The full suite, a11y and compare run once,
in R1a.

Record each task's evidence (commands, counts) in `docs/implementation/audrey-sign-in-results.md` under its ID, and
tick only the task's row in the plan. Never call Titan, a push service or production from a task.

## A1 — Server access and person records

Adds the server's own access to the database and the person records, with owner scripts. [no look]
Read **Smallest design**, `lib/firestoreSetup.ts`, `lib/emulator.ts`, `lib/calendarFake.ts`, `firebase.json`,
`firestore.rules`, the `test:data` script in `package.json` and `vitest.config.mts`.
- Add `firebase-admin`. `lib/admin.ts` (server-only): on the emulator it uses the emulator hosts and the
  `demo-deus` project; otherwise it needs `FIREBASE_ADMIN_KEY` (the service account JSON) and refuses to start
  without it. Export the Firestore and Auth handles.
- Add the auth emulator to `firebase.json` (port 9199) and to `test:data` (`--only firestore,auth`).
- `lib/people.server.ts`: get an active person by email (lowercased, trimmed), get by name, list active people,
  add, deactivate (sets `active: false`, revokes refresh tokens, deletes devices).
- Owner scripts `npm run people:add -- <email> <name>` and `npm run people:remove -- <email>`: dry run by default
  (prints what would change, and for add how many tasks carry `<name>` in Responsible and how many are open);
  `--apply` writes, and for add first writes the `assignNotices` backfill for every task that already has the name.
  They refuse a non-deushcs.com email. A name on no task is allowed but the dry run says so in its first line,
  with the closest names in use (someone who gives tasks may hold none).
- `lib/flags.ts`: `signInEnabled()` reads `NEXT_PUBLIC_SIGN_IN_ENABLED`, so tests can switch it.
- A rules data test: the device's SDK can't read or write `people`, `signInCodes`, `devices` or `assignNotices`.

Done when:
- Data tests prove add (with the backfill), get, list, deactivate (devices gone, `active` false, tokens revoked)
  including a person who never signed in, and the closed rules.
- The scripts' dry run on the emulator prints the change and writes nothing; `--apply` writes it.
- `lib/admin.ts` throws a clear error when not on the emulator and the key is missing.

## A2 — Sign-in codes

Lets the server send a code and sign a person in with it. [no look]
Read **Smallest design** (codes, rate limits, fakes) and A1's files.
- `lib/signInCodes.ts` (pure where possible): make a 6-digit code, HMAC it with `CODE_SECRET`, decide the request
  answer (`sent`, `wrongDomain`, `notAdded`, `wait` with seconds, `tooMany` with minutes) and the verify answer
  (`ok`, `wrong` with tries left, `expired`, `tooMany`, `noCode`).
- Storage in `signInCodes/{email}` with the Admin SDK, in a transaction for verify (tries can't race).
- `lib/mailer.ts`: `nodemailer` over SMTP (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`), the
  email of screens page section 4 as plain text only (subject `<code> is your DEUS Space code`). Fake on the
  emulator: writes `{ to, subject, code }` to `_fakeMail`.
- Routes `POST /api/auth/code` `{ email }` and `POST /api/auth/verify` `{ email, code }`: 404 unless the flag is on;
  verify answers `{ token }` (custom token, uid = email, claim `name`) or the reason.
- `npm run notify:keys` prints a new `CODE_SECRET`, `CRON_SECRET` and VAPID key pair for the owner to paste into
  Vercel (prints only; stores nothing).

Done when:
- Unit tests cover every request and verify answer, including the 60-second wait, 5 codes an hour, 5 tries an
  hour, expiry at 10 minutes, a code used twice, and an older unexpired code still working after a new one is sent.
- A data test fires 10 parallel wrong verifies and finds at most 5 counted and the rest refused.
- Data tests on the emulator: a request writes a hashed code (never the code itself) and one `_fakeMail` row;
  verify returns a token the auth emulator accepts.
- Both routes answer 404 with the flag off (route tests switch `signInEnabled()`).

## A3 — Sign-in page and account

Gives the sign-in page, the account sheet, and the entries in More and the side bar. [look]
Read the screens page sections 1, 2, 3, 6 (without its notifications card) and 8; guide sections 3 (Side bar, More),
4.1, 4.11, 4.13, 4.14; `desk/MoreSheet.tsx`, `desk/SideNav.tsx`, `desk/useOverParam.ts`, `ui/Sheet.tsx`,
`ui/Field.tsx`, `ui/Notice.tsx`, `ui/Toaster`, `ui/Avatar.tsx`.
- Firebase Auth on the device (`firebase/auth`), connected to the auth emulator when `USE_EMULATOR`; a
  `useSignedIn()` hook giving `{ email, name } | null`.
- The sign-in page `app/sign-in/page.tsx`, outside the `(desk)` layout (no side bar, tab bar or task sheet), on the
  backdrop with the brand, as screens page sections 2, 3 and 8: the email step, then the code step with six boxes
  (paste six digits into any box fills all; the sixth digit submits; number keyboard via `inputMode="numeric"` and
  `autoComplete="one-time-code"`), "Send a new code" after 60 s, "Use another email", every error and busy state on
  the page, and "Back to the app". `?next=` takes only a same-site path starting with `/` (anything else goes to
  `/`). Success: go to `next` with the toast `Signed in as <name>`. Already signed in: go straight to `next`.
  Add `/sign-in` to the pages `public/sw.js` keeps, so it opens offline and says there's no connection.
- The account sheet opens from `?account=1`: avatar, name, email, the two "what you get" rows, Sign out (signs out;
  A5 adds the device removal). Leave a slot for A5's notifications card.
- More: the "Sign in" row, or the signed-in person's row. Side bar foot: "Sign in" or their card. Both link to
  `/sign-in?next=<current path>`, and are hidden when the flag is off.
- `tests/smoke/sign-in.spec.ts` (emulator, fake mail): sign in with the code read from `_fakeMail`, reload and still
  signed in, wrong code shows tries left, sign out.

- On iPhone or iPad outside the Home Screen app, the page first shows the Add to Home Screen card (brief,
  **Smallest design**), built here from the install sheet's steps; A5 reuses it.

Done when:
- The spec passes on desktop and its `@phone` tests pass on the phone project.
- Screenshots at 390 wide and 1280 wide of: More signed out and signed in, the side bar foot signed out and signed
  in, the sign-in page's email step (default and not-added error), its code step with a wrong code, its iPhone
  Safari card, and the account sheet each match the screens page (layout, words, colours).
- At 320 wide, with a 60-character email and a 40-character name: the six code boxes, the email, More's row and the
  side bar card fit with no sideways scroll, and long text ends in "…" or wraps as guide 2.2 says.
- A unit test renders More and the side bar with `signInEnabled()` false and finds no sign-in entry; `shell.spec.ts`
  passes unchanged.

## A4 — Push plumbing

Lets the server send a push to a signed-in person's devices. [no look]
Read **Smallest design**, `public/sw.js`, `features/install/ServiceWorker.tsx`, A1's `lib/admin.ts`.
- Add `web-push`. `lib/push.server.ts`: send to one device or all of a person's devices with VAPID
  (`NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`); a 404 or 410 deletes that device; other
  errors are logged (`console.error`, no addresses) and never thrown to the caller. Fake on the emulator: writes
  `{ email, title, body, url }` to `_fakePush`.
- Routes (ID token required, person must be active, flag on; 404 with the flag off, 403 for an inactive person):
  `POST /api/push/devices` saves a subscription (id = SHA-256 of its endpoint; saving again is harmless),
  `DELETE /api/push/devices` removes this device's, `POST /api/push/test` sends the test notification to this device.
- `public/sw.js`: a `push` handler that always shows a notification (iOS requires it) with the app icon, and a
  `notificationclick` handler that focuses an open window on the `url` or opens it. Offline caching unchanged.

Done when:
- Data tests: saving twice keeps one device; a 410 from the sender deletes it; a removed person's routes answer 403;
  every route answers 404 with the flag off.
- A unit test of the sw.js handlers (call them with a fake `self`) shows the notification and opens the url.
- The offline-caching part of sw.js is unchanged (diff shows only added handlers).

## A5 — Turn on notifications

Gives the Turn on notifications sheet and the notifications card in her account. [look]
Read the screens page sections 5 and 6; guide 4.14 and 6.9; `features/install/` (the Safari steps and `useInstalled`);
A3's sheets and A4's routes.
- One sheet, `?notifications=1`, with the versions on the page, chosen in this order: no `PushManager` or iOS under
  16.4 → too old; iPhone or iPad not installed (`useInstalled` false) → Add to Home Screen first; permission
  `denied` → blocked; subscribed and saved on the server → on; else → turn on. "Turn on notifications" calls
  `Notification.requestPermission()` from the tap, subscribes with the VAPID key and saves through A4.
  "Send a test" calls the test route and shows the toast. "Check again" rereads the permission.
- After sign-in (A3's success), open this sheet when the state is "turn on" or "add to Home Screen first".
- Keeping the server in step: whenever the app opens signed in with permission granted and a subscription, it saves
  the subscription again (A4's POST; harmless when already saved). If that answers 403, the app signs out. So a
  device the server dropped (a 410, `people:remove`) comes back or shows as signed out, never as a false "on".
- The account sheet's notifications card: On (green, Send a test), Off or blocked (amber, Turn on notifications).
  Sign out first unsubscribes the browser's push subscription (pushes stop on this device even offline), then tries
  A4's DELETE (a failure is fine: the next push to that address gets a 410 and the row is deleted), then signs out.
- More's signed-in row and the side bar card show "Notifications on" / "Notifications off" / "Turn on
  notifications" as on the page.
- `tests/smoke/notifications.spec.ts`: on desktop Chromium with the permission granted and the emulator, turn on →
  one device saved; Send a test → one `_fakePush` row; sign out → the device is gone. The page's states are driven by
  stubbing `Notification.permission` and `useInstalled` in `@phone` tests.

Done when:
- The spec passes, including the `@phone` cases for "Add to Home Screen first" and "blocked", and a case where the
  server lost the device: reopening the app saves it again and shows "on".
- Screenshots at 390 wide of each of the five versions and the account card (on and off), and at 1280 wide of the
  side bar card in its three states, match the screens page.
- With the flag off nothing new renders and `shell.spec.ts` passes.

## A6 — New task for you

Sends one push when a save gives someone a task. [no look]
Read **Smallest design** (notified once, no notification to yourself, words), `lib/calendarRequests.ts`,
`lib/taskWrites.ts`, `lib/companyWrites.ts`, `lib/taskEditServer.ts`, `lib/taskPlanServer.ts`, `lib/followupServer.ts`.
- `lib/assignNotify.ts` (pure): who is owed a notice (Responsible names, case-insensitive, without "Full Team", that
  are linked people not in `notified`), the new `notified` list, and the notification words for a task (and its main
  task's name for a subtask), with the brief's length rules.
- `lib/assignNotify.server.ts`: for a task id, read the task and `assignNotices/{taskId}` with the Admin SDK in a
  transaction, work out who is owed, record the new `notified`, then send to those with devices (the sender's own
  name is recorded but not sent). A deleted task sends nothing.
- `POST /api/notify/assigned` `{ taskIds: [...] }` (at most 50; flag on, 404 off; optional ID token).
- The device: put `requestAssignNotify(taskIds)` (fire-and-forget with `keepalive`, like `requestCalendarSync`) in
  the shared write helpers that every task save goes through (`lib/taskWrites.ts`, `lib/companyWrites.ts`,
  `lib/batches.ts` and any other helper the search finds), whenever a write sets `responsible`, rather than in each
  screen. Search `lib/` and `features/` for every write of `responsible`; list each in the results file with the
  helper it goes through.
- Chat connector: `taskEditServer` and `taskPlanServer` (and `followupServer` if it can set Responsible) call the
  server function after their transaction commits.

Done when:
- Unit tests: who is owed (case, duplicates, "Full Team", unlinked names), the new `notified` list, words for a
  task, a subtask, no deadline and a 120-character name.
- Data tests: one push for a newly added linked person; none on a re-save, for an unlinked name, for a person with no
  devices, for the sender's own name, or for a task covered by the backfill; removed then added again sends again;
  a ping for a task whose Responsible didn't change sends nothing.
- The results file lists every write of `responsible` and the helper it goes through; none is left without the call.

## A7 — Morning summary

Sends the 09:00 weekday summary. [no look]
Read **Smallest design** (summary words, counted tasks), `lib/dates.ts`, `wibToday` in `lib/followupServer.ts`,
`lib/parking.ts`, A4's sender.
- `lib/morningSummary.ts` (pure): from tasks, a name and a Jakarta date, the groups (late, today, tomorrow, or on a
  Friday "by Monday" for Saturday to Monday), the title and body, or nothing.
- `GET /api/notify/morning`: 401 when `CRON_SECRET` is unset or the bearer doesn't match; does nothing with the flag
  off or on a Saturday or Sunday in Jakarta; otherwise one push per active person with devices and something to say,
  skipping anyone whose `lastSummaryDate` is today (Jakarta) and setting it after sending. Answers a count per person
  (no task names) for the logs.
- `vercel.json` with `"crons": [{ "path": "/api/notify/morning", "schedule": "0 2 * * 1-5" }]`.

Done when:
- Unit tests: a Tuesday with late, today and tomorrow tasks; a Friday covering Saturday to Monday; done, parked and
  Informed-only tasks left out; subtasks counted; more than 3 names gives "+N more"; an empty morning gives nothing;
  late counted by Jakarta date at 01:30 UTC; "1 day late" and "2 days late"; a 120-character name is cut with "…".
- Data tests: the route is 401 without the secret and with `CRON_SECRET` unset (even for `Bearer undefined`); with
  it, one `_fakePush` row for Audrey and none for a person with nothing due; a second call the same day adds none.

## E1 — End to end

Proves the whole path on the emulators: sign in, turn on, get told. [no look]
Extend `tests/smoke/notifications.spec.ts` (emulator, fake mail and push; read `playwright.config.ts` and
`tests/support/emulator.ts` first). Seed Audrey's person record and tasks.

Done when:
- Signed in as Audrey with notifications on, a second browser context (not signed in) adds her to a task's
  Responsible: exactly one `_fakePush` row "New task for you" with that task's url; saving the task again adds none.
- The same context adds her to a subtask through a second save path (a company's follow-up task or selecting
  several, whichever sets Responsible): one more row, naming the main task.
- The chat edit tool over HTTP adds her to another task: one more row.
- Calling the morning route with the secret on a seeded Tuesday adds one summary row with the expected title.
- Opening each row's url in the browser opens that task's sheet (also for the subtask), and the summary's url opens
  Plan on Audrey's page.
- Signed out, the device is gone and a new assignment adds no row.

## R1a — Full check run

Runs the full suite, a11y and scoped compare once and lists failures. Fix nothing. [no look]
Run `npm run test:smoke`, `npm run a11y` and `npm run compare` filtered to the shell and More states. Write each
failure (spec, test, first error line) under R1a in the results file.

Done when: every failure is listed, or the file says all three passed.

## R1b — Fix recorded failures

Fixes what R1a listed, rerunning only what each fix touched. [look]
Done when: every R1a failure is fixed and its spec reruns green, or written up with why it stands.

## R1 — Phase review

A fresh review of the whole phase's diff, hunting for faults in sign-in and sending, plus the owner handoff. [no look]
Read this brief, the results file and `git diff <commit before A1>..HEAD`. Hunt for: a route reachable with the
flag off; a signed-in route that skips the token or `active` check; a code stored or logged in plain text; a way past
the tries or rate limits (parallel requests); a fake reachable in production; a push sent twice for one task, or for
an old task; a save path that changes `responsible` without reporting it; a summary on a weekend or with Jakarta and
UTC dates mixed; device rows left after sign-out or removal; emails or push addresses readable from the device; tests
that could reach Titan, a push service or production. Fix what you confirm, with a failing test first. Then write
the owner handoff at the end of the results file: what was proven, what is proven only on the emulator with fakes,
the owner steps in the plan's order, what to check if O8 or O9 fails on the real iPhone (iOS version, opened from
the Home Screen, iPhone Settings › Notifications › DEUS Space, the VAPID variables, the Vercel function logs for
`/api/push/test`), and the follow-ups from **Out of scope**.

Done when:
- Every finding is fixed with its test, or written up with why it stands.
- `npm run test:unit`, `npm run test:data` and the two specs pass after the fixes.
- The handoff lists the owner steps in the plan's order.
