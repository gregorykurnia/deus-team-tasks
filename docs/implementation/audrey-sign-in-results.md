# Sign-in implementation evidence

## A1 — Server access and person records (2026-11-17)

Added server-only Firebase Admin access, the Auth emulator on 9199, person lookup/list/add/deactivation,
the sign-in flag helper, and `people:add` / `people:remove`. Both commands preview by default; only `--apply`
writes. Add previews count exact Responsible names and open tasks (excluding completed/parked work), and a
zero-match warning leads with nearby names. Activating a person atomically backfills every existing assignment;
repeating an active add leaves newer assignments eligible for notification. No task records are changed.

Files: `lib/admin.ts`, `lib/flags.ts`, `lib/peopleInput.ts`, `lib/people.server.ts`, `scripts/people.mjs`,
`firebase.json`, `package.json`, `package-lock.json`, `tests/unit/admin.test.ts`,
`tests/unit/peopleInput.test.ts`, `lib/people.server.data.test.ts`, this results file and `docs/IMPLEMENTATION_PLAN.md`.

Checks:
- `npx tsc --noEmit`: passed after the final code change.
- `npx eslint` on all eight added JS/TS files: passed; final edits to Admin and rules tests rechecked.
- `npm run test:unit`: 1,398 passed; existing `taskPlan.test.ts` non-JSON-input test timed out at 5,000 ms, then passed alone (1/1). Changed Admin/input tests also passed 24/24 after the emulator fix.
- `npm run test:data`: 245 existing tests passed; two new CLI tests initially failed on cloud metadata warnings. Fixed emulator-only metadata detection; scoped A1 rerun passed 15/15, including real CLI dry runs/apply, a 501-task backfill and Auth token revocation. Final strengthened rules test passed 1/1 (14 skipped), covering both signed-out and active signed-in clients, including creation of new secret records.
- `npm run build`: passed (production build, all routes generated).
- Reviewed the staged save/access diff and `git diff --check`: fixed the cloud metadata probe and inconsistent duplicate/rename validation between dry run and apply; no remaining findings. No screen changed, so no browser or screenshot check applies.

HUNTED: ripple · Existing task dates/names, parent/subtask assignments and other notice names survive backfill; active/inactive lookups agree · add/load/backfill and deactivation data tests.
HUNTED: odd data · Blank/long/foreign emails, blank/control/placeholder/long names, case/spacing/Unicode duplicates, missing Responsible and zero-task people · input, competing-email and preview tests.
HUNTED: failure · Interrupted backfill rolls back; Firestore removal failure leaves data unchanged; failed Auth revocation leaves access disabled/devices gone and is retryable; dry runs write nothing · rollback, Firestore/Auth failure and actual CLI tests.
HUNTED: overlap · Same-email retries and competing names serialize; two people preserve both notice names; a late Auth reply cannot overwrite reactivation or delete its new device · concurrent-add and late-removal data tests.

DECISION!: One active email may claim a task name (case/spacing/Unicode variants included); reject conflicting links and renames rather than silently relink, preventing misdirected notifications.
DECISION: Commit backfill and activation together rather than in separate batches, so an interruption never activates partial work; verified with 501 old tasks.
DECISION: Disable access/delete devices before Auth revocation rather than leave access active while Auth is unavailable; errors explicitly request a retry.
DECISION: Limit emails to Firebase's 128-character UID size and names to 200 characters rather than accept unbounded or control-character input.

Integration: feature routes must dynamically import `admin` / `people.server` after their sign-in flag guard,
so flag-off builds need no production key. Device registration in A4 must check the active person inside its
write transaction, so a concurrent removal cannot leave a new device behind. Emulator Admin uses only
`demo-deus` and the two local hosts, with cloud metadata detection disabled; production requires a valid
`FIREBASE_ADMIN_KEY` for `deus-team-tasks` and rejects emulator hosts.

Owner steps O1/O2/O6 remain in the plan; no production accounts, data, secrets or settings were touched.
A full check is worth running for the shared library additions; it remains scheduled for R1a. Only A1 is completed.

## A2 — Sign-in codes (2026-11-17)

Added six-digit codes bound to the canonical email and code ID with HMAC-SHA256, ten-minute expiry,
single use, the sixty-second resend wait, five requests/hour and five wrong guesses/hour. Both request and
verify serialize through Firestore transactions and recheck the active person. SMTP uses authenticated TLS
and the approved plain text; emulator runs write only `_fakeMail`. Both routes stay 404 with the flag off.
`notify:keys` prints fresh secrets and a P-256 VAPID pair without storing them. No screen changed.

Files: `lib/signInCodes.ts`, `lib/signInCodes.server.ts`, `lib/mailer.ts`, `lib/authCodeRoute.ts`,
`lib/people.server.ts` (shared person validator export), `app/api/auth/{code,verify}/route.ts`,
`scripts/notify-keys.mjs`, `package.json`, `package-lock.json`, four new unit test files,
`lib/signInCodes.server.data.test.ts`, `lib/people.server.data.test.ts` (fake-mail rules coverage), this file and the plan.

Checks:
- `npx tsc --noEmit`: passed after final code/test edits; fixed the initial request-body annotation error.
- `npx eslint` on all 14 changed JS/TS files: passed, with subsequent edits rechecked.
- `npm run test:unit`: 1,439 passed; existing circular-input `taskPlan.test.ts` timed out at 5,000 ms and the new CLI test hit sandbox `spawnSync ... EPERM`; scoped subprocess-enabled retry passed the CLI, and final scoped diagnostic with `--testTimeout 15000` passed both (2/2); no timeout or existing test source changed.
- `npm run test:data`: 273/273 passed on demo-deus Firestore/Auth, including all 13 A2 data tests and anonymous/signed-in denial of fake-mail reads, queries, writes and deletes.
- `npm run build` with sign-in off and Admin/code secrets empty: passed; both new API routes generated without initializing Admin.
- Own access/save diff review and `git diff --check`: no remaining findings; no browser/screenshot applies to this server-only task.

HUNTED: ripple · Canonical email, active-person validation, HMAC storage, request/verify readers and hourly histories agree; device access to fake codes stays closed · rule/input/HMAC unit tests and request/token/rate-limit/rules data tests.
HUNTED: odd data · Missing/blank/foreign/long emails, case/space duplicates, malformed guesses, damaged rows and a code row copied to another person · unit input/state/route tests and canonical-person/cross-person data tests.
HUNTED: failure · Reservation failure sends nothing; unknown SMTP acceptance keeps the delivered code valid and blocks duplicate retries; failed signing leaves the code usable · reservation, SMTP timeout/late-error and token-signing data tests.
HUNTED: overlap · Ten requests mail once, ten wrong verifies count only five, two correct verifies issue one token, and late mail after page closure cannot undo a newer code · parallel-request/guess/success and held-mail/aborted-page data tests.

DECISION!: Store separate bounded request/guess timestamp histories and keep consumed/expired hashes for the rolling hour, rather than derive limits from live codes; expiry/use cannot reset limits or reissue the same code in that hour.
DECISION: Retain a reservation after an uncertain mail failure rather than delete it; an already delivered email remains valid and a retry observes the cooldown.
DECISION: Sign the token inside the verification transaction before consuming the code, rather than consume first; a signing failure rolls back, and no token is returned before commit.
DECISION: Generate the VAPID pair with Node's P-256 crypto rather than add a push dependency in A2; the key generator prints compatible 65-byte public/32-byte private keys and writes no files.

Integration for A3: POST JSON `{ email }` to `/api/auth/code`; responses use `status: sent|wrongDomain|notAdded|wait|tooMany`
(`seconds` on wait, `minutes` on tooMany). POST `{ email, code }` (code is a string) to `/api/auth/verify`;
success is `{ token }`, failure is `status: wrong|expired|tooMany|noCode` (`triesLeft` on wrong).
Wait/tooMany use HTTP 429 with `Retry-After`; invalid JSON/shape is 400; infrastructure failures are a redacted
503 `unavailable`; all replies are `no-store`. Emulator servers need a test-only `CODE_SECRET` of at least 32
characters and `NEXT_PUBLIC_USE_EMULATOR=1`; fake mail is automatic and cannot fall back to SMTP.

Owner steps O3/O4 and the later switch-on remain in the plan; no production data/settings, real mailbox,
or production secret was accessed. A full check is worth running for the shared libraries and remains scheduled for R1a.

## A3 — Sign-in page and account (2026-11-17)

Built `/sign-in` outside the desk shell, with email, six code boxes, native/full-code paste, clipboard fallback,
sixth-box submission, resend cooldown, the request/verify errors, offline recovery and safe return navigation.
iPhone/iPad Safari starts with the Home Screen instructions; actual standalone mode goes to email, even if
installation was remembered in Safari. Both navigation entries share Firebase identity, including custom-token
users whose Firebase `email` is null. The account sheet supports direct links, reload, long names/emails and sign-out.
The success toaster now lives above both layouts. A5's notifications card and device removal are still A5's work.

Files: `app/sign-in/page.tsx`, `app/layout.tsx`, `app/(desk)/layout.tsx`, `desk/MoreSheet.tsx`, `desk/SideNav.tsx`,
`features/sign-in/{SignInPage,HomeScreenSteps,AccountEntry,AccountHost}.tsx`,
`features/sign-in/{SignIn,Account}.module.css`, `features/sign-in/signInNotice.ts`,
`lib/{authClient,signInClient,useSignedIn}.ts`, `public/sw.js`, `playwright.config.ts`,
`tests/smoke/sign-in.spec.ts`, `tests/unit/{signInClient.test.tsx,signInOffline.test.ts,signedInSession.test.ts}`,
this results file and the plan's A3 Done cell. Existing tracked test evidence removed by Playwright was restored;
subsequent browser runs used `--output=test-results/a3-run`.

Checks:
- `npx tsc --noEmit`: final sequential run passed.
- `npx eslint` on all changed JS/TS/TSX files: final sequential run passed.
- `npm run test:unit`: 56 files, 1,467 tests passed; initial `notifyKeys` child-process EPERM passed after escalation.
- `JAVA_TOOL_OPTIONS=-Xmx2g npm run test:data`: 14 files, 273 tests passed; only the local Firestore/Auth emulators.
- Scoped Playwright: sign-in 9 passed/1 viewport skip; unchanged shell 12 passed/5 viewport skips; overlap rerun 3 passed/1 skip; clipboard and final desktop/phone correction reruns 2 passed each.
- `npm run build`: final sequential run passed after all implementation edits.

Initial checks caught absent icon names, a too-short emulator test secret, the Auth port starting after Firestore,
a selector also matching Next's route announcer, and a reload test trying to reopen already-open More. Corrected each.
The full sign-in and overlap runs printed their passing reports before the enclosing shell received SIGTERM (143)
during cleanup; the final two scoped reruns and final sequential type/lint/build returned 0. Emulator/browser ports
are checked after verification. No production settings, data, real mailbox, accounts or secrets were changed.

Look gallery: `redesign/compare/a3/` (20 full-size shots plus four 100% crops). The reference was opened in Chromium.
At 390 and 1280: navigation signed out/in, email/default and not-added, wrong code, account, and Safari guidance.
At 320: 60-character email, 40-character name, code boxes, More and account; the fixed laptop side card is also shot
with that identity. Account shots arrive by direct URL and reload. Additional 1440 shots show offline and sending.
Captures hide only Next's development portal, and wait for connection/task loading to settle.

Look faults fixed: the sign-in toast covered More/install and account text at 320, so opening these panels dismisses
that one toast; the resend timer briefly displayed 1:01, now starts at 1:00; the signed-in sidebar name uses ink.
All key shots and the four code/row/footer edge crops were opened at original resolution. No new art was added.

HUNTED: ripple · More/sidebar, custom-token identity, return query, direct account URL, reload and sign-out · real-emulator sign-in spec and identity/return-path unit cases.
HUNTED: odd data · blank/wrong-domain, case/space variants, missing claims, unsafe return links and 60/40-character identity · sign-in spec and signInClient units.
HUNTED: failure · offline startup/token read, expired/rate-limited codes, lost send/verify replies, consumed-code retry, timeout and denied/unanswered clipboard · sign-in spec, signedInSession units and offline-worker tests.
HUNTED: overlap · double submit, stale auth results after sign-out/new identity, leaving during a request, correction of an earlier filled box, and toast/sheet overlap · sign-in spec plus signedInSession units; pending actions lock synchronously and late replies are ignored.

DECISION: Show email under the signed-in name until A5 supplies device notification state, rather than imply notifications are already enabled.
DECISION: Skip only the optional sign-in page's 404 during precaching, rather than break offline installation while the flag is off; other fetch failures still reject installation.
DECISION: Dismiss only the sign-in confirmation when More/account opens, rather than move all application toasts; this keeps those panels readable without changing other confirmations.

Full checks remain worth running for the shared auth/shell changes and are scheduled in R1a. Owner steps O1–O9
remain unchanged, including the real iPhone Safari/Home Screen checks. Only A3 is ticked; A4 was not started.

### A3 fresh-eyes corrections (2026-11-17)

Opened all twelve supplied copies in `/tmp/autorun-fresh-2GkG4e/` at original resolution before deciding.

- Reference 01: clarified the full app name and Home Screen short name together in the live instructions; preserved the historical approved reference. Its combined error examples are intentional, and the live form's single email input is now asserted.
- 02/10/12: widened word spacing in sign-in/helper copy; the font remains Plus Jakarta Sans. The first adjustment still produced a 2.875px helper-space measurement and failed the new 3.5px minimum; the larger adjustment passes.
- 03: both footer controls use 13px labels, 19px icons and the navigation's text column.
- 05/08: More's account/sign-in row has the same white fill, blue icon and text column as neighboring cards; helper text wraps, including the 60-character email, and the live footer stays inside the viewport.
- 06: replaced the artificially sliced test name with the complete 40-character `Audrey Wijaya Kusuma Nathalia Prameswari`; aligned account benefit titles with the name/email column.
- 11: wrong-code boxes use the approved inset red outline without overlapping outer halos; a gap assertion covers it.
- 04/07/09: those WRONG lines identify no specific fault. Reinspected and retook these states alongside the corrections; no additional clipping/overflow fault was found.

The look also caught the avatar crowding its name after the icon-column alignment. Centering the avatar inside
that column fixes it; both normal and long identities now have a measured gap of at least 6px. The shared-page
captures use a real emulator sign-in and show that avatar on Today, Tasks and Prospects at 320, 390, 1280 and 1440.

Files: `desk/MoreSheet.module.css`, `desk/SideNav.module.css`, `desk/SideNav.tsx`,
`features/sign-in/{Account,SignIn}.module.css`, `features/sign-in/{AccountEntry,HomeScreenSteps,SignInPage}.tsx`,
`tests/smoke/sign-in.spec.ts`, `docs/approved-looks.md`, this results file and the A3 Done cell.
The approved-look notes explain only the retained reference/font choices; they do not excuse merged words.

Checks:
- `npx tsc --noEmit`: final sequential run passed.
- `npx eslint` on the five changed TSX/spec files: final sequential run passed.
- `npm run test:unit`: final sequential run passed, 56 files / 1,467 tests.
- Scoped Playwright: shell/sign-in cover 23 distinct passing cases across the runs, six intentional viewport skips; final affected run 5 passed / 1 skip, with the separate desktop sign-in/Safari retry 2 passed.
- `npm run build`: final actively awaited sequence passed, exit 0; an earlier background check sequence ended with signal 143 before build started.
- Look: 30 final key shots in `redesign/compare/a3-fresh/` and five 100% edge/text crops opened at original resolution; includes all twelve shared-page captures.

An intermediate phone round trip exceeded the old 60-second whole-test limit during its final reload. The two
tests that sign in, reload/navigate repeatedly and capture many states now allow 120 seconds; individual request
and assertion waits were not extended. The final desktop/phone runs pass, including persisted sign-out.
Only CSS, copy, markup and browser assertions changed; no Firestore access or stored format changed, so data
tests were not rerun. All calls and seeded people used the emulators. The temporary font probe was removed.

HUNTED: ripple · shared entry on three other pages at four sizes, signed out and signed in across captures · entry-column/font/fill assertions and twelve signed-in regression shots.
HUNTED: odd data · complete 40-character name and 60-character email, wrapping, avatar clearance and visible live footer · sign-in spec and original-size crops.
HUNTED: failure/overlap · existing failed-request/retry/sign-out cases remain covered; the new layout checks caught tight word gaps, and the look caught avatar crowding · scoped browser runs and added gap assertions.

DECISION: not fixed the historical reference's combined error frame, because its caption explicitly combines examples; the live form has one email input.
DECISION: not fixed the historical reference's short app name, because it is the manifest's intentional short name; the live instructions now explain both names.
DECISION: not fixed the apparent inserted spaces inside “notifications”/“tasks”, because the strings have none and the local font probe reproduces the approved glyph spacing; actual word gaps were widened and checked.
DECISION: not fixed unspecified issues in 04/07/09, because no fault was described and original-size inspection found no further fault; those pictures were retaken.

## A4 — Push plumbing (2026-11-17)

Added per-device and all-device Web Push, emulator-only `_fakePush`, authenticated subscription save/removal,
the approved test notification, and service-worker push/click handlers. Registration rechecks active access in its
transaction. Expired-device cleanup compares the registration revision and snapshot time, preserving a refresh
that finishes during delivery. Other delivery/storage failures return a failure result and log only a numeric
provider status or `unavailable`; one failed device does not stop the rest. No screen changed.

Files: `lib/push.server.ts`, `lib/pushInput.server.ts`, `lib/pushTransport.server.ts`, `lib/pushRoute.ts`,
`app/api/push/{devices,test}/route.ts`, `public/sw.js`, `package.json`, `package-lock.json`,
`tests/support/push.ts`, four `tests/unit/push*.test.ts` files, `lib/push.server.data.test.ts`,
`lib/people.server.data.test.ts` (private fake-push rules coverage), this file and the A4 Done cell.

Checks:
- `npx tsc --noEmit`: passed on the final code; corrected the initial worker-test index type.
- `npx eslint` on all 14 changed JS/TS files: passed on the final code.
- `npm run test:unit`: initially 1,553 passed / 3 failed. Existing task-plan timeout and `notifyKeys` sandbox `spawnSync EPERM` passed on the scoped unsandboxed retry (306 passed, only the new mock test still failed); fixed its concurrent-import harness, then final push-only rerun passed 94/94, including actual local Web Push encryption with no network. Existing offline-worker tests passed in the broad run.
- `npm run test:data`: initially 292 passed / 2 failed; push authorization corrected and final A4 rerun passed 21/21; people/rules rerun passed 15/15. The unchanged calendar 50-ID test exceeded its default 5,000 ms twice, then passed 1/1 at `--testTimeout=15000` (7.34 s). Keep this timing issue for R1a/R1b; no unrelated calendar code or tests changed.
- `NEXT_PUBLIC_SIGN_IN_ENABLED=0 npm run build`: passed; both push endpoints generated, production sending stayed off.
- Own save/access diff review and `git diff --check`: no remaining findings; `public/sw.js` has 38 additions and zero removals, preserving offline caching. No browser/screenshot check applies to this no-look task.

The first authorization attempt exposed an Admin SDK emulator detail: `verifyIdToken(token, false)` still checks
revocation. The final code verifies once with revocation enabled, and only after the SDK's verified-JWT
`auth/id-token-revoked` error reads its subject to choose 403 (removed person) or 401 (revoked active session).
A revoked token never authorizes a write/send; a real emulator revocation test covers all three routes.
The installed `web-push` 4 uses named exports; both its real encryption API and the transport's named send export
are checked. Vitest can bypass a mock on concurrent dynamic imports, so parallel route requests are exercised
against the real emulator service, and the mocked unit case checks a failed save followed by a successful retry.

HUNTED: ripple · registration/read/send/remove agree on endpoint ids, keys and revisions; fake records stay private and caching is unchanged · device data, rules, worker and existing offline tests.
HUNTED: odd data · missing/blank/long/extra JSON, invalid keys, non-company identity, duplicate endpoints, unsafe provider/click URLs and malformed push payloads · input, route, worker and data tests.
HUNTED: failure · unconfirmed sends, partial fan-out, failed save/removal/expiry cleanup and retries, a page closed after a received write, closed windows and unavailable client lookup · route/transport/worker and emulator tests; success only after confirmation, no automatic send retry.
HUNTED: overlap · parallel duplicate registration, access removal racing registration, and an old 410 after same-endpoint re-registration · actual parallel route/transaction tests and stale-expiry data test.

DECISION!: Allow Apple, Google, Mozilla and Microsoft browser push hosts rather than arbitrary HTTPS endpoints, preventing subscriptions from making the server call private or unrelated addresses; extend the list if a new browser provider is needed.
DECISION!: Store an opaque registration `revision` alongside the subscription rather than identify its lifetime by endpoint alone; it makes a late 404/410 unable to remove a refreshed registration.
DECISION: Do not automatically retry an unconfirmed delivery rather than risk a duplicate accepted push; retain the device and return failure for an explicit retry.
DECISION: Show `DEUS Space` / `Open DEUS Space to see your tasks.` for an empty or malformed payload rather than drop it, satisfying the always-visible push requirement.

A5 integration: `POST /api/push/devices` accepts the browser subscription JSON directly and returns
`{ status: "saved", id }`. DELETE there and POST `/api/push/test` accept only `{ endpoint }`; the server chooses
the signed-in person and test words. Send an ID token in `Authorization: Bearer ...`. Flag off: 404; inactive or
missing person: 403; invalid/revoked active session: 401; vanished device: 404/410; temporary failure: 503.
Successful test means provider/fake acceptance, not confirmation that the phone displayed it.

References consulted: [Web Push library](https://github.com/web-push-libs/web-push),
[worker click event](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerGlobalScope/notificationclick_event),
the installed library exports, Next's local Route Handlers guide, and Admin's local verified-token/revocation code.
No production data/settings, secrets, SMTP or push service was used. Owner steps remain in the plan; full checks
are worth running at R1a. Only A4 is completed; A5 was not started.

## A5 — Turn on notifications (2026-11-17)

More and the side bar show the device's notification state beneath the signed-in name. The account card opens
`?notifications=1`: turn on, Home Screen instructions, blocked, on, or unsupported/old iOS, in the brief's priority.
The permission request runs directly from the tap. Only a confirmed device POST shows On. Opening/resuming the app
resaves an existing subscription; a removed person's 403 unsubscribes and signs out. Sign-out waits for work already
started, unsubscribes before DELETE, tolerates a failed DELETE, then clears Auth. Its own failed unsubscribe stays
retryable. Test toasts belong to their sheet and cannot appear after leaving it.

Files: `app/(desk)/layout.tsx`; `features/sign-in/{Account.module.css,AccountEntry.tsx,AccountHost.tsx,NotificationsHost.tsx,SignInPage.tsx}`;
`lib/{notificationClient.ts,useNotifications.ts,useSignedIn.ts}`; `ui/Icon.tsx`; `playwright.config.ts`;
`tests/smoke/{notifications.spec.ts,sign-in.spec.ts}`; `tests/support/notificationBrowser.ts`;
`tests/unit/{notificationClient.test.ts,signInClient.test.tsx}`; this file, the A5 Done cell and both N34 gap records
(`redesign/ui-implementation-plan.md`, `redesign/handoff/needs.md`). No saved data shape or server route changed.

Checks:
- `npx tsc --noEmit` and ESLint on the changed TS/TSX files: passed; final scoped lint and the build's final TypeScript validation also passed. Initial job-reference/mock return typing and `prefer-const` findings were fixed.
- `npm run test:unit`: 1,577 passed, one existing `lib/taskPlan.test.ts` case exceeded 5,000 ms; its isolated retry passed (1,578 cases verified). The earlier key-generator `spawnSync EPERM` passed with child-process permission, including in the final broad run. All 17 new notification lifecycle cases passed.
- `npm run test:data`: all 294 tests / 15 files passed on Firestore and Auth emulators (182 s).
- Scoped `notifications.spec.ts` and `sign-in.spec.ts`: all 18 applicable cases passed across the broad and focused runs; five startup captures and five phone notification round trips passed in the repeat run. Final error/retry + 320px rerun: 2 passed; final numbered blocked version: 1 passed. The unchanged A3 gallery of other app pages was excluded from the final broad run. All 20 layout audits are clear.
- `SIGN_IN_SMOKE_OFF=1 ... shell.spec.ts`: all 12 applicable cases passed (9 before interruption, 3 resumed phone cases); 5 desktop/phone-only cases skipped as configured. Actual navigation and notification-host renders also have flag-off unit coverage.
- `NEXT_PUBLIC_SIGN_IN_ENABLED=0 npm run build`: passed, including final TypeScript and static generation; the build status file records 0. `git diff --check` and the own save/access diff review: clear.

Some tool wait wrappers ended with SIGTERM (143): the first broad browser run stopped before its final unrelated
A3 gallery; the final blocked run had already reported `1 passed`; the shell run stopped after 9 passes. Only this
task's identified test PIDs were stopped, unfinished/affected cases were rerun, and data/build ran in isolated process
groups with recorded status files. No tests reached production, SMTP or a real push service. The fake browser push
APIs still exercise real Auth, HTTP device routes, emulator documents and `_fakePush` writes.

Look gallery: `redesign/compare/a5/index.html` — 20 app frames, five approved-reference frames and six 100% crops.
All 20 app frames and six crops were opened at original resolution. Phone: every version and both account states at
390, all three More states, and setup/long identity at 320. Desktop: all three side bar states and setup/on/account
at 1280, plus the failed-save notice at 1440. Account On arrives by direct link and reload, after deleting its server
device, and proves the same device id comes back. Layout checks cover viewport edges, text overflow, control coverage,
loaded images and page errors. No imported art was added.

Look faults fixed: the setup's missing white perk cards and cramped word spacing; blocked steps' missing numbers
and split inline wording; a squeezed narrow-phone close button (now the design's full 40px); raw `Failed to fetch`
copy; a test toast surviving its sheet. The first automatic sheet's close also stepped back to `about:blank`; arriving
with the notification parameter already in the return URL fixes it and preserves the original screen/view.

HUNTED: ripple · one endpoint feeds registration, test, sign-out, More, account and side bar; lost server device restores on reload · notification main flow and A4's existing data tests.
HUNTED: odd data · missing subscription, unsupported/old iOS, denied permission, 60-character email and 40-character name · priority/missing-device unit cases, phone versions and 320px layout/close-target assertions.
HUNTED: failure · no answer, landed save with lost reply, test 503/410, offline DELETE, failed unsubscribe and removed-person 403 · lifecycle unit tests plus real route/fake-push retry and inactive-person browser case.
HUNTED: overlap · repeated taps, sign-out during save/test, old identity replies and late subscription creation, leaving before a test reply · lifecycle race tests and pending-test/More-toast browser checks.

DECISION: reuse the existing Notice, numbered Safari steps and buttons for unsupported/desktop instructions rather than wait for another design; N34 remains open for studio review.
DECISION: keep the test toast scoped to its sheet rather than carry it over navigation, so it cannot cover More or announce an old action.

Only A5 is completed. Full smoke/a11y/compare remain at R1a; a full check is worth running because shared client/UI
code changed. Real-device delivery and production setup remain the plan's owner steps.

### A5 fresh-eyes corrections (2026-11-17)

Opened all twelve originals in `/tmp/autorun-fresh-SZD8nJ` at original resolution. The first A5 pass spaced body
copy but missed the title, button and side bar status rules. The new rendered-space check failed before the fix:
`word gaps in “Turn on notifications”: Expected >= 4; Received 2.640625`. It now measures actual loaded-font gaps
in headings, buttons, footnotes, installation steps and account-status rows, requiring at least 4 px.

| Report item | Finding and disposition |
|---|---|
| 01, 03, 09–12 | Real cramped title/control/step spacing: `.2em` word spacing on A5's dialog and body, with explicit inheritance for buttons and links. Other sheets' base styles are unchanged. |
| 04–05 | Real cramped Sign out/footnote spacing: covered by the body and explicit control rules; whole wording remains visible at 320 and 390. |
| 06 | Real cramped status spacing: account-entry captions now use `.2em`, verified on three other pages at all four widths. |
| 02 | Real capture clipping: keep the intended phone 390 px wide inside a 24 px capture margin; reference image becomes 438×904 instead of 386×856. Assertions protect the phone width, bezel clearance and caption inset. Approved source HTML is unchanged. |
| 07 | Real obscured dates in a stale capture: the committed scoped toast already clears when its sheet closes. Retook the desktop shot and require no test toast within 1 s of closing, shorter than its 5.2 s lifetime, so natural expiry cannot hide a regression. |
| 08 | No fault was described; full-size review found the account row intact and legible. Retaken with the shared spacing change; no separate defect or design exception. |

Files: `features/sign-in/Account.module.css`, `tests/support/wordSpacing.ts`,
`tests/smoke/{notifications.spec.ts,sign-in.spec.ts}`, this evidence and the A5 Done cell.

Checks (all final recorded exit statuses are 0):
- `npx tsc --noEmit`: passed.
- ESLint on both changed specs and the new spacing helper: passed; the build also validates the CSS module.
- `npm run test:unit -- --maxWorkers=2`: 1,578 passed / 61 files, with no retries.
- Scoped notification spec plus the sign-in spec's shared-entry regression: 11 passed, 4 viewport-only skips; 20 A5 and 12 shared-screen layout audits clear; rendered-word-gap, reference-inset and toast-dismissal checks passed.
- `SIGN_IN_SMOKE_OFF=1 npx playwright test tests/smoke/shell.spec.ts`: 12 passed, 5 viewport-only skips.
- `NEXT_PUBLIC_SIGN_IN_ENABLED=0 npm run build`: passed, including final TypeScript and static generation; `git diff --check` clear.

No save, auth, database or notification-delivery logic changed. Browser writes still use only local emulators and
fake push; no production setting, data, SMTP or push service was touched. The data suite was not repeated for this
style/capture-only correction. Full checks remain at R1a.

New gallery: `redesign/compare/a5-review/index.html` (20 A5 frames, 12 shared-page frames, five references, four
100% crops). Opened all 32 app frames, the flagged reference and all four crops at original resolution. Shared
pages are Today, Tasks and Prospects at 320×740, 390×844, 1280×900 and 1440×900. Accounts also arrive by direct
link/reload, with a lost server device restored. No remaining finding in the changed UI.

LOOKED: 1280-turn-on.png · Right drawer over Plan; title/button gaps clear, cards and words whole.
LOOKED: reference-turn-on.png · Full bezel inside margins; caption inset, whole text, no edge clipping.
LOOKED: 390-turn-on.png · Bottom sheet over Plan; spaced title/actions above a clear base, whole text.
LOOKED: 390-account-off.png · Avatar above cards; Sign out and footnote distinct, whole and uncovered.
LOOKED: 390-account-on-reload.png · Reloaded account over Plan; test/sign-out controls whole, clear gaps.
LOOKED: 1280-sidebar-setup.png · Status below Audrey and above Install/Live; all words whole.
LOOKED: 1280-sidebar-on.png · Account above Install/Live; no toast over the whole 17/18/19 dates.
LOOKED: 1280-sidebar-off.png · Amber status whole within its card; Install/Live below, no overlap.
LOOKED: 1440-save-error.png · Right drawer over Plan; title and red notice whole and clearly spaced.
LOOKED: 390-install.png · Numbered cards above Done; title and “your Home” clear, no clipped words.
LOOKED: 390-blocked.png · Steps above Check again; title/inline wording whole over blurred Plan.
LOOKED: 390-old.png · Short bottom sheet; title, update notice and Done whole and uncovered.
LOOKED: 1280-on.png · Green notice above test/Done in right drawer; all text whole.
LOOKED: 1280-account-off.png · Header/card above Sign out; full wording within right drawer.
LOOKED: 1280-account-on-reload.png · On/test card above Sign out; clear gaps and whole footer.
LOOKED: 390-on.png · Green notice and buttons over Plan; text whole, nothing covers actions.
LOOKED: 320-account-long.png · Name wraps beside round close; cards/sign-out/hint whole, no overlap.
LOOKED: 320-turn-on.png · Bell/cards above both actions; title, buttons and base whole.
LOOKED: 390-more-setup.png · Account above Live in More; setup words whole over Plan.
LOOKED: 390-more-on.png · Green status above Live; no toast, whole row and footer.
LOOKED: 390-more-off.png · Amber status above Live; full words, clear row edges.
LOOKED: shared/1280-shared-today.png · Side bar account below navigation; status whole, clear of Today panels; long placeholder ellipsised.
LOOKED: shared/1280-shared-tasks.png · Account above Install/Live; Tasks panel clear of side bar, status whole.
LOOKED: shared/1280-shared-companies.png · Account below navigation; Prospects tiles beside it, no row overlap or clipped status.
LOOKED: shared/1440-shared-today.png · Account above Install/Live; Today panels beside it, full status wording.
LOOKED: shared/1440-shared-tasks.png · Account at side bar foot; Tasks controls above empty panel, no status clipping.
LOOKED: shared/1440-shared-companies.png · Account above Install/Live beside Prospects; status whole and uncovered.
LOOKED: shared/320-shared-today.png · More over Today; account above Install/Live, words and bottom edge whole.
LOOKED: shared/320-shared-tasks.png · More over Tasks; account/Install/Live stacked without overlap, status whole.
LOOKED: shared/320-shared-companies.png · More over Prospects; account above Install/Live, whole text and base.
LOOKED: shared/390-shared-today.png · More over Today; account row above Install/Live, no cut words.
LOOKED: shared/390-shared-tasks.png · More over Tasks; status whole and clear of footer, nothing overlapping.
LOOKED: shared/390-shared-companies.png · More over Prospects; account/Install/Live whole within bottom sheet.
LOOKED: reference-edge-crop.png · Full bezel curve inside margin; phone interior intentionally continues outside crop.
LOOKED: 390-title-crop.png · Title/close whole with clear word gaps; bell partly outside this header crop.
LOOKED: 390-sign-out-crop.png · Button above footnote; both whole, clear gaps and base.
LOOKED: 1280-status-crop.png · Caption above Install/Live; whole words and rounded panel edge.

HUNTED: ripple · the shared caption on three pages/four widths and every sheet state · shared-entry and notification spacing/layout assertions.
HUNTED: odd data · narrow phone, long identity, blocked/old/install states and wrapped text · 320/390 screenshots and range checks that exclude line-break spaces.
HUNTED: failure · failed-save notice remains readable; baseline spacing regression fails before the fix · notification retry/error case and measured 2.640625 px failure.
HUNTED: overlap · test toast cannot mask calendar dates after closing · 1 s dismissal assertion, pending-test case and fresh desktop/phone captures.

## A6 — New task for you (2026-11-17)

Files: `lib/assignNotify{,.server,Dispatch.server,Requests}.ts`, `app/api/notify/assigned/route.ts`;
`lib/{taskWrites,companyWrites,batches,taskEditServer,taskPlanServer,people.server,admin}.ts` and `scripts/people.mjs`;
the new assignment unit/data tests, existing Admin/people/code/push tests and two sign-in/notification smoke fixtures;
this evidence and the A6 Done cell.

Shared saves now report task IDs, never recipients or notice text. The flag-gated assignment route accepts at most
50 IDs and an optional verified active ID token. One Admin transaction reads the saved task, active links and
`assignNotices`, records current canonical linked names, and claims notices before the existing push sender runs.
Self-assignment records the name without delivery; clearing Responsible makes a later re-addition eligible again.
Provider acceptance is not proof of display: results say `processed`, `missing` or `failed`, never `sent`.

The emulator hunt found that Admin's tasks were in `demo-deus` while the app's were in `deus-team-tasks`. Admin
Firestore now uses the app's tasks namespace only on the pinned local emulator; Auth retains its `demo-deus`
tokens. Production selection is unchanged. A1/A2/A4 data fixtures, A3/A5 browser fixtures, rules authentication,
and the people command's owned-app cleanup follow that split. Backfill and its preview now use the same normalized
name comparison as delivery, including case, whitespace and compatibility characters.

### Responsible write audit

Searched `lib/` and `features/` for `responsible`, task serializers and every Firestore write entry point.

| Writer / input | Confirmed save and assignment hook |
|---|---|
| `features/task-sheet/draft.ts` → `TaskSheet` add, save, done, park and calendar saves | `addTaskKeptInStep` / `saveTaskKeptInStep`; ping after both task and company succeed. |
| `features/today/TodayScreen.tsx`, `features/tasks/TasksScreen.tsx` quick add | `newTaskFromDraft` → `taskWrites.addTask`; ping after `addDoc`. |
| `lib/subtasks.ts:newSubtask` → TaskSheet add | `taskWrites.addTask`; the initial empty Responsible also follows the hook. |
| `lib/companies.ts:followUpTaskFor` → `features/companies/useCompanyActions.ts` | `companyWrites.addTaskKeptInStep`; defer ping until company side write succeeds. |
| `lib/useTasks.ts:update` and direct task updates | `taskWrites.updateTask`; ping whenever the patch includes Responsible, including clearing. |
| `features/tasks/TasksScreen.tsx` cell saves and Undo | `saveTaskWithUndo` → final save hook; `restoreTasks` → observed shared batch for Undo. |
| `companyWrites.writeTaskChanges` / `restoreTasks` (including compensating writes) | `batches.commitEach` observes `set` / `update` of task Responsible; only committed chunks ping. Provisional company writes defer notification; restoration pings final data. |
| `batches.commitEach` / `commitInChunks`, all callers | Observe task-reference writes with Responsible, including chaining and variadic updates; deduplicate IDs per committed batch. Other collections/fields do not ping. |
| `taskEdit.ts:buildTaskChanges` → `taskEditServer.applyTaskChanges` | Direct server dispatch for explicit Responsible changes after the transaction and company following succeed; retry uses the same server claim. |
| `taskPlan.ts:buildTaskPlan` → `taskPlanServer.addTaskPlan` | Direct server dispatch for newly created parent/child IDs after commit and on operation retry. Existing parent is excluded. Current builder initializes Responsible to `[]`. |
| `followupPlan.ts:buildFollowupPlan` → `followupServer.addFollowupPlan` | Cannot assign a person: input has no Responsible field and both new parent and subtasks initialize to `[]`; existing parent changes dates only. No assignment hook required by A6's condition. |

No other `lib/` / `features/` task save can set a person in Responsible. Task/group/calendar/status/parking writes
that omit Responsible do not announce tasks. Task documents gain no notice fields, so load, resume, links, exports,
counts, calendars and task-copy code keep their existing format. Notification text reads the current parent and
company at claim time; the save hooks leave existing calendar/context-sync calls in place.

### Checks

- TypeScript: `npx tsc --noEmit` and the final build's TypeScript validation passed.
- ESLint on changed and new JS/TS files: passed, including final scoped reruns; own save/access diff review and `git diff --check` clear.
- `npm run test:unit -- --maxWorkers=2`: 1,621 passed; unchanged task-plan non-JSON test timed out at 5,000 ms, then its isolated retry passed (1,622 cases verified).
- `npm run test:data`: all 308 tests / 16 files passed (180 s), including 14 new assignment cases; only local emulators and fake mail/push.
- `npx playwright test tests/smoke/sign-in.spec.ts tests/smoke/notifications.spec.ts --grep 'signs in from navigation|turn on, test, resave'`: all four desktop/phone cases passed; E1 retains the complete assignment journey.
- `NEXT_PUBLIC_SIGN_IN_ENABLED=0 npm run build`: passed, including the new assignment route. No UI changed and no A6 look check applies; full suite/a11y/compare remain R1a's work. A full check is worth running after shared-library changes.

Own review fixed exact-case backfill missing existing assignments, the split Admin/app emulator namespace, and
notifications starting before company compensation finished. The assignment route has a 300 s allowance for a full
50-ID request with slow push providers; the connector's existing 60 s budget is unchanged. Playwright's output
cleanup removed tracked evidence from earlier tasks; restored it from HEAD before staging. No test touched live
data, SMTP or a real push service; browser fixture calls and actual signed-in rules checks use their local namespaces.

HUNTED: ripple · all Responsible writers, backfill, private records, parent/company labels, links and emulator namespaces agree · write-helper, pure-message, rules and assignment data tests.
HUNTED: odd data · missing/blank/non-array lists, case/spacing/compatibility duplicates, Full Team, unlinked/inactive people, 120-character unicode names and invalid IDs · `assignNotify.test.ts`, route tests and odd-task data case.
HUNTED: failure · first/partial saves, company rollback, offline Auth/fetch, lost provider reply, failed claim and closing after receipt · request/write/route tests and assignment retry/fan-out/closed-page data cases.
HUNTED: overlap · simultaneous pings claim once; a late old delivery cannot overwrite current Responsible or its notice record · concurrent-claim and late-delivery data cases; responses never write task data.

DECISION: keep the brief's claim-before-send policy rather than automatic provider retries, preventing duplicates when delivery landed but its reply was lost.
DECISION: share the existing local tasks namespace rather than copy tasks into the Auth test project, preserving real task/notice transactions and backfill behavior.
DECISION: defer company-task pings until the company side write succeeds rather than announce a provisional task that compensation may delete.
DECISION: normalize backfill names like delivery rather than retain exact-case matching, preventing old assignments from being announced at activation.

DECISION: not fixed 08-1280-sidebar-off.png as a separate defect, because no fault was described and full-size review found none; its shared spacing was updated and the picture retaken.

## A7 — Morning summary (2026-11-17)

Added the pure summary builder, server delivery and `GET /api/notify/morning`, with the weekday 02:00 UTC cron
(09:00 Jakarta). Counts use each main task/subtask's own deadline and exclude done, parked and Informed-only work.
Friday includes Saturday through Monday. Notifications use the approved words, three names at most, four lines at
most, the shared 60-character name formatter and the existing Plan person link. The response contains only the
Jakarta date and each active person's email, task count and delivery status; no task names.

Authorization runs before the feature flag and before Firebase is loaded: absent/blank secrets and wrong bearers
return 401, including `Bearer undefined` when unset. The authorized flag-off route returns 404; Jakarta weekends do
nothing. A transaction reserves `people/{email}.summaryClaimDate` before calling the existing sender, and
`lastSummaryDate` is written only after a confirmed send. Failed/ambiguous attempts keep the daily reservation to
avoid duplicate pushes; the next weekday can send normally. No-device and empty mornings reserve nothing. Older
replies cannot roll back a newer date, overwrite other person fields or recreate a deleted person. Task records,
their calendar events and their dates are never written.

Checks:
- `npx tsc --noEmit`: passed after fixing four test fixtures that incorrectly used strings for numeric `parkedAt`.
- `npx eslint` on all seven changed/new TypeScript files: passed; final server/data-test rerun also passed.
- `npm run test:unit -- --maxWorkers=2`: 1,641 passed / 2 failed initially; unchanged `lib/taskPlan.test.ts` non-JSON case timed out at 5,000 ms and `notifyKeys.test.ts` hit sandbox `spawnSync ... EPERM`. Each passed its scoped retry (key-generator subprocess outside the sandbox); all 1,643 cases verified, including 21 new builder/route cases and a final eight-case builder rerun.
- `npm run test:data`: 318 passed / 3 failed initially. Fixed malformed-date completion handling and a test's failure injection (it had intercepted the sender's read transaction instead of the completion write); the unchanged calendar-preview case timed out at 5,000 ms. Scoped emulator rerun of all 13 morning cases plus that one calendar case passed: all 321 cases verified. Only local Firestore/Auth and fake push were used.
- `NEXT_PUBLIC_SIGN_IN_ENABLED=0 npm run build`: passed, including the dynamic morning route, without production Admin credentials being needed for the new route.
- Own save/access diff review and `git diff --check`: clear. No screens changed; screenshots/browser checks do not apply to this no-look task. Full suite/a11y/compare remain R1a's work; a full check is worth running after these shared-library changes.

HUNTED: ripple · daily markers, shared name formatting, task/subtask deadlines and the existing Plan link reader agree; tasks/calendars stay untouched · builder/link tests and morning data tests for persisted markers and unchanged fields.
HUNTED: odd data · absent/blank/malformed data, normalized duplicate names, duplicate task IDs, invalid old markers, long unicode names and no-device/empty people · eight builder cases and malformed/excluded-record data cases.
HUNTED: failure · unauthorized/disabled calls, failed claims, no reply, partial delivery, lost provider reply, failed completion write and requester closure never claim unconfirmed delivery or resend · route tests and morning failure data cases.
HUNTED: overlap · concurrent cron calls reserve once; an older day's completion cannot replace the newer date or unrelated person changes · concurrent-call, late-completion and person-field data cases.

DECISION!: add the private daily `summaryClaimDate` reservation rather than rely only on writing `lastSummaryDate` after sending, preserving the brief's at-most-once rule under overlap/lost replies; an ambiguous or failed attempt may miss that morning and is not retried until the next weekday.

## E1 — End to end (2026-11-17)

Files: `tests/smoke/notifications.spec.ts`, `tests/unit/morningSummaryRoute.test.ts`, `playwright.config.ts`,
`app/api/notify/morning/route.ts`, this evidence and the E1 Done cell.

The new journey signs Audrey in by fake email, enables push and reloads her saved session/device. An anonymous
second context creates an assigned task, saves it again and assigns a company follow-up subtask through the edit
helper. Real MCP HTTP preview/apply assigns another task; preview writes nothing and replay sends nothing extra.
The authorized Tuesday cron produces `1 late, 1 due today, 1 tomorrow`. Exactly four fake pushes result: three
assignments and one summary. Each payload URL opens its task (including the subtask's parent link), with the same
saved description after reload; the summary opens Audrey's Plan page. Self-assignment sends nothing. Sign-out
removes the device/subscription, and a confirmed subsequent assignment adds no push.

Checks:
- `npx tsc --noEmit` and ESLint on the four changed TypeScript files: passed.
- `npm run test:unit -- --maxWorkers=2`: 1,649 passed / 67 files, including six clock-boundary cases.
- `JAVA_TOOL_OPTIONS=-Xmx2g npm run test:data`: 321 passed / 17 files; Firestore/Auth emulators only.
- `npx playwright test tests/smoke/notifications.spec.ts --project=desktop --grep 'E1:' --output=/tmp/audrey-e1-playwright`: 1 passed (3.3 minutes).
- Both named specs with `--grep 'pending test finishes|signs in from navigation' --output=/tmp/audrey-e1-regression`: 3 passed (desktop pending-send sign-out; desktop/phone navigation, reload and sign-out).
- `NEXT_PUBLIC_SIGN_IN_ENABLED=0 npm run build`, own access/save diff review and `git diff --check`: passed; no remaining finding.

Initial attempts hit a no-match grep, an auth-route HTML 404, a cold-response wait (200 after 10.7s versus the helper's
10s wait), incorrect exact optional-label selectors, and one restart before port 8180 finished closing. The helper
now awaits the real response and loaded form; E1 uses actual labels and bounded actions. Default Playwright output
removed tracked captures; all were restored, then output moved to `/tmp`. One early unit start was interrupted to
keep one stack at a time; the complete unit run above passed. All sending used `_fakeMail`/`_fakePush` on local
emulators. This task changed no screen and added no screenshots; the full suite/a11y/compare remain R1a's work.

HUNTED: ripple · assignment payloads, parent naming, task/subtask deep links, reload and Plan's person reader agree · E1's persisted-record and URL assertions.
HUNTED: odd data · duplicate task IDs, absent/blank/invalid test dates and a test date outside the emulator · E1's duplicate-ID replay and six morning route clock cases.
HUNTED: failure · a successful assignment reply is lost, then retried; unauthorized morning and signed-out delivery never add a push · E1's real HTTP abort/retry, 401 and device-removal assertions.
HUNTED: overlap · parallel assignment replays and parallel daily cron repeats preserve exactly one push per task/day · E1's awaited concurrent requests and exact row counts.

DECISION: use task creation and company-subtask editing as the two app save paths rather than bulk/follow-up creation, which cannot set Responsible; this exercises `addTaskKeptInStep` and `saveTaskKeptInStep` without adding a product control.
DECISION: pin `MORNING_TEST_DATE=2026-11-17` only when `USE_EMULATOR` is true, rather than freeze Auth's clock or depend on the run's weekday; production ignores it and invalid values use Jakarta's real date.

## R1a — Full check run (2026-11-17)

Failures first: **103 smoke failures**, **76 failed accessibility state scans**, and the serious accessibility rule <code>label-content-name-mismatch</code> in **66 additional states** (256 node occurrences, 14 distinct selector/reason pairs). The four scoped comparison captures had no execution or layout errors; all copy deltas are recorded below. **No fixes were made.** Every failure and remaining untriaged comparison delta is routed to the existing **R1b** row; R1b and R1 were not started.

### Smoke failures — complete inventory

The spec is under <code>tests/smoke/</code>. Each group states the exact first error line shared by its cases; every case includes its spec line, project and test title. There were 11 desktop, 45 phone and 47 Jakarta failures. **85 cases failed in emulator clearing, seeding or cleanData setup**, so these results must not be counted as 85 independent product defects. The remaining 18 cases retain their individual errors below; causation was not established by this run.

#### Smoke error 1 — 6 case(s)

First error line: <code>Error: expect(received).toEqual(expected) // deep equality</code>

| Case | Spec:line | Project | Test |
|---|---|---|---|
| S001 | <code>tests/smoke/a11y.spec.ts:92</code> | desktop | axe: All tasks has no serious or critical issues |
| S002 | <code>tests/smoke/a11y.spec.ts:92</code> | desktop | axe: A task group has no serious or critical issues |
| S003 | <code>tests/smoke/a11y.spec.ts:100</code> | desktop | axe: the new task sheet has no serious or critical issues |
| S004 | <code>tests/smoke/a11y.spec.ts:100</code> | desktop | axe: the new group sheet has no serious or critical issues |
| S005 | <code>tests/smoke/a11y.spec.ts:187</code> | desktop | axe: a menu with a number field has no serious or critical issues, and the arrow keys move out of the field |
| S006 | <code>tests/smoke/audit-repairs.spec.ts:45</code> | desktop | task dates keep their visible words in their accessible names |

#### Smoke error 2 — 2 case(s)

First error line: <code>Error: expect(locator).toBeAttached() failed</code>

| Case | Spec:line | Project | Test |
|---|---|---|---|
| S007 | <code>tests/smoke/chat-task-edits.spec.ts:103</code> | desktop | R1b.F2: capture 065 with all stress tasks and their companies |
| S088 | <code>tests/smoke/tasks.spec.ts:79</code> | jakarta | Q7: the app opens on empty data without adding sample data |

#### Smoke error 3 — 1 case(s)

First error line: <code>Error: expect(locator).toBeInViewport() failed</code>

| Case | Spec:line | Project | Test |
|---|---|---|---|
| S008 | <code>tests/smoke/chat-task-edits.spec.ts:165</code> | desktop | R1b: people suggestions remain above the pinned task actions |

#### Smoke error 4 — 1 case(s)

First error line: <code>Test timeout of 120000ms exceeded.</code>

| Case | Spec:line | Project | Test |
|---|---|---|---|
| S009 | <code>tests/smoke/chat-task-edits.spec.ts:103</code> | phone | R1b.F2: capture 065 with all stress tasks and their companies |

#### Smoke error 5 — 8 case(s)

First error line: <code>Test timeout of 60000ms exceeded while setting up "cleanData".</code>

| Case | Spec:line | Project | Test |
|---|---|---|---|
| S010 | <code>tests/smoke/chat-task-edits.spec.ts:140</code> | phone | R1b.F2: layout audit rejects missing and offscreen sheets |
| S037 | <code>tests/smoke/past-screen.spec.ts:150</code> | phone | R7: the order menu orders the parents, and companies without a sector always go last |
| S038 | <code>tests/smoke/past-screen.spec.ts:166</code> | phone | R5: By sector counts every counted company once, with No sector and a total that equals the client total |
| S047 | <code>tests/smoke/plan.spec.ts:42</code> | jakarta | D1: the summary names the busiest day, the tasks that aren't on it, and links on |
| S083 | <code>tests/smoke/tasks-screen.spec.ts:181</code> | phone | 4.9 on a phone: a detail on a task's card changes from a tap, without opening the task |
| S084 | <code>tests/smoke/tasks.spec.ts:18</code> | jakarta | W12: a company task is prospect work, client work once the deal is done, and anything else is internal |
| S087 | <code>tests/smoke/tasks.spec.ts:68</code> | jakarta | W7: clearing a task's type removes it from the stored task |
| S097 | <code>tests/smoke/today.spec.ts:113</code> | jakarta | A3: opened offline with nothing on the device, Today says so instead of loading forever |

#### Smoke error 6 — 59 case(s)

First error line: <code>Error: Clearing tasks failed: 409 {"error":{"code":409,"message":"Transaction lock timeout.","status":"ABORTED"}}</code>

| Case | Spec:line | Project | Test |
|---|---|---|---|
| S011 | <code>tests/smoke/chat-task-edits.spec.ts:155</code> | phone | R1b: comparison reaches the missing-description state |
| S012 | <code>tests/smoke/chat-task-edits.spec.ts:165</code> | phone | R1b: people suggestions remain above the pinned task actions |
| S013 | <code>tests/smoke/companies-screen.spec.ts:96</code> | phone | B9: the sort menu and the column heads order the list, empty values last either way round |
| S014 | <code>tests/smoke/empty-headings.spec.ts:5</code> | phone | empty flow headings online |
| S015 | <code>tests/smoke/empty-headings.spec.ts:5</code> | phone | empty flow headings offline |
| S016 | <code>tests/smoke/flows-screen.spec.ts:56</code> | phone | M4: the list runs A to Z, and search covers steps, outcomes and people |
| S018 | <code>tests/smoke/followup-server.spec.ts:51</code> | phone | F2: Node follow-up writes render on desktop and phone |
| S019 | <code>tests/smoke/gallery-overlays.spec.ts:53</code> | phone | a menu near the bottom opens above its button and stays 12px inside the window |
| S020 | <code>tests/smoke/gallery-overlays.spec.ts:121</code> | phone | on a phone a sheet is a bottom sheet, full width |
| S021 | <code>tests/smoke/gallery-overlays.spec.ts:197</code> | phone | on a phone toasts sit above where the tab bar goes |
| S022 | <code>tests/smoke/gallery-overlays.spec.ts:224</code> | phone | a menu too tall for either side opens on the roomier one and scrolls, never over its button |
| S023 | <code>tests/smoke/gallery-overlays.spec.ts:239</code> | phone | a menu stays with its button when the window changes size |
| S025 | <code>tests/smoke/gallery-rows.spec.ts:122</code> | phone | on large screens a list row is a grid; on a phone it becomes a card, and Today's card loses its badge |
| S026 | <code>tests/smoke/groups.spec.ts:15</code> | phone | W9: a starred task group comes first |
| S027 | <code>tests/smoke/notes-screen.spec.ts:110</code> | phone | U2, U7: likelihood is picked and cleared; How likely and search narrow the list |
| S028 | <code>tests/smoke/notes-screen.spec.ts:176</code> | phone | E1: export says what's in the file, then downloads it |
| S029 | <code>tests/smoke/notifications.spec.ts:101</code> | phone | turn on, test, resave a lost device, and sign out remove this device |
| S030 | <code>tests/smoke/notifications.spec.ts:171</code> | phone | phone version: install, direct link and Check again |
| S031 | <code>tests/smoke/notifications.spec.ts:171</code> | phone | phone version: blocked, direct link and Check again |
| S032 | <code>tests/smoke/notifications.spec.ts:171</code> | phone | phone version: old, direct link and Check again |
| S033 | <code>tests/smoke/notifications.spec.ts:232</code> | phone | 320px account and setup keep long identity and actions readable |
| S034 | <code>tests/smoke/past-screen.spec.ts:86</code> | phone | R2: parents are cards A to Z; a parent opens its subsidiaries under a branch, and Show all subsidiaries opens every one |
| S039 | <code>tests/smoke/past-screen.spec.ts:181</code> | phone | R5: pressing a sector shows its companies in the record (on a phone, the record), pressing it again lets go |
| S040 | <code>tests/smoke/past-screen.spec.ts:199</code> | phone | R5: the breakdown shows the top 8 sectors, and all of them on request |
| S041 | <code>tests/smoke/past-screen.spec.ts:211</code> | phone | A phone has a switch between Companies and By sector; a desktop shows both |
| S042 | <code>tests/smoke/past-screen.spec.ts:229</code> | phone | R7: 130 parents show 100 at a time, and 60 subsidiaries 50 at a time |
| S043 | <code>tests/smoke/past-screen.spec.ts:256</code> | phone | R3: nothing counted yet (only an umbrella company) says so, and the breakdown explains |
| S044 | <code>tests/smoke/past-screen.spec.ts:266</code> | phone | The view lives in the address: a link lands on the same search, sector and order |
| S048 | <code>tests/smoke/plan.spec.ts:57</code> | jakarta | D2: the stepper moves two weeks, and Today brings the weeks back |
| S049 | <code>tests/smoke/plan.spec.ts:73</code> | jakarta | D4: Work, Person and Rows narrow the timeline, and the × clears each |
| S050 | <code>tests/smoke/plan.spec.ts:107</code> | jakarta | D1: a lane folds at four lines with Show more, and unfolds |
| S051 | <code>tests/smoke/plan.spec.ts:119</code> | jakarta | D3: nothing dated in these weeks says so, and a task with no dates is counted, not drawn |
| S052 | <code>tests/smoke/plan.spec.ts:127</code> | jakarta | nothing planned yet: the timeline invites the first task |
| S053 | <code>tests/smoke/plan.spec.ts:165</code> | jakarta | D5: a link with a date and no view opens the Day view on that day |
| S054 | <code>tests/smoke/plan.spec.ts:134</code> | jakarta | counts events per day, with the words for each, and Events shows their times |
| S055 | <code>tests/smoke/plan.spec.ts:153</code> | jakarta | says so when the calendar isn't connected or fails, and tasks carry on |
| S056 | <code>tests/smoke/plan.spec.ts:178</code> | phone | shows the day's deadlines and events, and a day opens the Day view |
| S057 | <code>tests/smoke/plan.spec.ts:230</code> | phone | calendar off: a notice in the month, and tasks carry on |
| S058 | <code>tests/smoke/plan.spec.ts:178</code> | jakarta | shows the day's deadlines and events, and a day opens the Day view |
| S059 | <code>tests/smoke/plan.spec.ts:206</code> | jakarta | the stepper moves a month, an empty month says so, and Back to this month returns |
| S060 | <code>tests/smoke/plan.spec.ts:220</code> | jakarta | a busy day has three deadlines, and a day with many items folds the rest into a count |
| S061 | <code>tests/smoke/plan.spec.ts:230</code> | jakarta | calendar off: a notice in the month, and tasks carry on |
| S062 | <code>tests/smoke/plan.spec.ts:244</code> | jakarta | splits a day into deadline, starting and under way, with events and their links |
| S063 | <code>tests/smoke/plan.spec.ts:271</code> | jakarta | lands on the next day with something, says so, and Show today stays on today |
| S064 | <code>tests/smoke/plan.spec.ts:286</code> | jakarta | today lands on today when anything is happening |
| S065 | <code>tests/smoke/plan.spec.ts:294</code> | jakarta | the stepper, the week strip and the date picker move the day |
| S066 | <code>tests/smoke/plan.spec.ts:309</code> | jakarta | the done circle marks a task done, and Undo brings it back |
| S067 | <code>tests/smoke/plan.spec.ts:321</code> | jakarta | Tasks only and Events only show one panel each; a person's page marks the part they play |
| S068 | <code>tests/smoke/plan.spec.ts:335</code> | jakarta | says so when the calendar isn't connected or fails, loads tasks regardless, and an empty day offers the days around it |
| S069 | <code>tests/smoke/plan.spec.ts:356</code> | phone | ranks everyone by what they own, with the words for each bar, and a name opens their page |
| S070 | <code>tests/smoke/plan.spec.ts:356</code> | jakarta | ranks everyone by what they own, with the words for each bar, and a name opens their page |
| S071 | <code>tests/smoke/plan.spec.ts:381</code> | jakarta | a person's page has their figures, what they own, and what they're kept informed on with their part |
| S072 | <code>tests/smoke/plan.spec.ts:413</code> | jakarta | a person with nothing open says so, and a task opens over their page |
| S073 | <code>tests/smoke/plan.spec.ts:426</code> | jakarta | a placeholder in the address shows everyone, and someone named both ways counts once |
| S074 | <code>tests/smoke/plan.spec.ts:434</code> | jakarta | a search finds people once there are more than eight, and Work narrows the counts |
| S075 | <code>tests/smoke/plan.spec.ts:460</code> | jakarta | the done circle on a person's page marks the task done, and Undo brings it back |
| S077 | <code>tests/smoke/shell.spec.ts:67</code> | phone | A4: Today, Tasks and Companies are one tap away, and the rest two taps through More |
| S078 | <code>tests/smoke/shell.spec.ts:89</code> | phone | A4: More closes with Esc, the back gesture, or Close, and gives focus back |
| S085 | <code>tests/smoke/tasks.spec.ts:41</code> | jakarta | W7: a task's details are changed and saved, keeping what wasn't touched |

#### Smoke error 7 — 1 case(s)

First error line: <code>Error: expect(locator).toHaveCount(expected) failed</code>

| Case | Spec:line | Project | Test |
|---|---|---|---|
| S017 | <code>tests/smoke/followup-server.spec.ts:51</code> | desktop | F2: Node follow-up writes render on desktop and phone |

#### Smoke error 8 — 1 case(s)

First error line: <code>Error: locator.scrollIntoViewIfNeeded: Error: strict mode violation: getByRole('region', { name: 'Card rows (Today)' }).getByRole('article').filter({ hasText: 'Call Pelita Foods about the trial' }).getByText('2 days late') resolved to 2 elements:</code>

| Case | Spec:line | Project | Test |
|---|---|---|---|
| S024 | <code>tests/smoke/gallery-rows.spec.ts:79</code> | desktop | the deadline pill's full date shows on hover, and a click on it still opens the task |

#### Smoke error 9 — 7 case(s)

First error line: <code>Error: Clearing tasks failed: 500 {"error":{"code":500,"status":"UNKNOWN"}}</code>

| Case | Spec:line | Project | Test |
|---|---|---|---|
| S035 | <code>tests/smoke/past-screen.spec.ts:115</code> | phone | R7: search covers names and sectors, highlights, opens the parent that has a match and offers its other subsidiaries |
| S036 | <code>tests/smoke/past-screen.spec.ts:139</code> | phone | R7: nothing matches says what was searched and Clear search brings the record back |
| S091 | <code>tests/smoke/today.spec.ts:16</code> | jakarta | D-007: the hero says the day in a sentence and the chips go to All tasks |
| S095 | <code>tests/smoke/today.spec.ts:87</code> | jakarta | W1: with nothing on the list, the hero holds the capture field |
| S099 | <code>tests/smoke/today.spec.ts:137</code> | jakarta | D2: a task row opens its details over Today |
| S101 | <code>tests/smoke/today.spec.ts:207</code> | jakarta | D6: who's carrying what ranks people by what they own and opens their page |
| S102 | <code>tests/smoke/today.spec.ts:167</code> | jakarta | shows today's events with their times, read only, and counts them on the chart |

#### Smoke error 10 — 1 case(s)

First error line: <code>Error: Seeding tasks/tasks failed: 409 {"error":{"code":409,"message":"Transaction lock timeout.","status":"ABORTED"}}</code>

| Case | Spec:line | Project | Test |
|---|---|---|---|
| S045 | <code>tests/smoke/plan.spec.ts:14</code> | jakarta | D1: the timeline has a lane for each person, bars, diamonds and a bar that fades out |

#### Smoke error 11 — 3 case(s)

First error line: <code>Test timeout of 60000ms exceeded.</code>

| Case | Spec:line | Project | Test |
|---|---|---|---|
| S046 | <code>tests/smoke/plan.spec.ts:34</code> | jakarta | D3: a bar opens the task over the plan |
| S082 | <code>tests/smoke/task-sheet.spec.ts:15</code> | phone | custom task types save for the team, survive a reload and work in filters and quick editing |
| S090 | <code>tests/smoke/today.spec.ts:145</code> | phone | D4: the two-week chart has a column for each day, and a day opens Plan |

#### Smoke error 12 — 2 case(s)

First error line: <code>Error: expect(locator).toBeVisible() failed</code>

| Case | Spec:line | Project | Test |
|---|---|---|---|
| S076 | <code>tests/smoke/selecting.spec.ts:119</code> | desktop | D-008: Select all reaches every matching task, not only the 100 shown |
| S094 | <code>tests/smoke/today.spec.ts:68</code> | jakarta | W1: a sentence in quick capture adds internal work, keeps the focus, and offers Add details |

#### Smoke error 13 — 1 case(s)

First error line: <code>"skip" modifier timeout of 60000ms exceeded.</code>

| Case | Spec:line | Project | Test |
|---|---|---|---|
| S079 | <code>tests/smoke/shell.spec.ts:113</code> | phone | A1: the + in the tab bar opens a new task over the current screen |

#### Smoke error 14 — 2 case(s)

First error line: <code>Error: Seeding clients/pipeline failed: 500 {"error":{"code":500,"status":"UNKNOWN"}}</code>

| Case | Spec:line | Project | Test |
|---|---|---|---|
| S080 | <code>tests/smoke/task-sheet-company-loading.spec.ts:19</code> | phone | R1b.F1: delayed company opens the right draft and reconnect preserves typing, link and dates |
| S092 | <code>tests/smoke/today.spec.ts:36</code> | jakarta | W5: Needs attention has its sections, and the kind switch narrows them |

#### Smoke error 15 — 2 case(s)

First error line: <code>Error: Clearing clients failed: 500 {"error":{"code":500,"status":"UNKNOWN"}}</code>

| Case | Spec:line | Project | Test |
|---|---|---|---|
| S081 | <code>tests/smoke/task-sheet-company-loading.spec.ts:77</code> | phone | R1b.F1: a failed company load cannot open an Internal draft and reload recovers |
| S093 | <code>tests/smoke/today.spec.ts:60</code> | jakarta | D3: a section folds at six, with a link to see them all |

#### Smoke error 16 — 6 case(s)

First error line: <code>Error: Seeding tasks/tasks failed: 500 {"error":{"code":500,"status":"UNKNOWN"}}</code>

| Case | Spec:line | Project | Test |
|---|---|---|---|
| S086 | <code>tests/smoke/tasks.spec.ts:53</code> | jakarta | D11: a task changed from the Plan's day is saved, with no stray id field |
| S089 | <code>tests/smoke/tasks.spec.ts:93</code> | jakarta | 5.1: deadline pills name the date and count whole days from today, wherever the team is |
| S096 | <code>tests/smoke/today.spec.ts:99</code> | jakarta | A3: with no connection, adding is refused and what was typed stays |
| S098 | <code>tests/smoke/today.spec.ts:124</code> | jakarta | W5: the done circle marks a task done, it leaves the list, and Undo brings it back |
| S100 | <code>tests/smoke/today.spec.ts:145</code> | jakarta | D4: the two-week chart has a column for each day, and a day opens Plan |
| S103 | <code>tests/smoke/today.spec.ts:198</code> | jakarta | an amber notice when the events fail, with tasks carrying on |

### Evidence behind the non-setup assertions

- S001, S002, S003, S004, S005, S006: deadline controls fail <code>label-content-name-mismatch</code>; the app control is at <code>ui/TaskRow.tsx:321</code>. The rule is also reproduced by the standalone scan below.

- S008, S012: typing <code>ra</code> in Responsible leaves the Dimas Prasetyo suggestion at viewport ratio <code>0.8843005895614624</code>; the assertion at <code>tests/smoke/chat-task-edits.spec.ts:175</code> requires 1.

- S017: after a Node follow-up write, <code>tests/smoke/followup-server.spec.ts:77</code> sees 6 task rows instead of 7. The later saved-data assertions were not reached.

- S024: the <code>2 days late</code> text locator matches both <code>phoneWord</code> and <code>pillWord</code>; <code>tests/smoke/gallery-rows.spec.ts:82</code> fails strict mode before hover/click verification. This is a test-selector failure, not evidence that clicking the deadline is broken.

- S076: selecting all 120 matching tasks and marking done never shows <code>120 tasks marked done</code> at <code>tests/smoke/selecting.spec.ts:129</code>; the stored-completion assertion was not reached.

- S007, S009: the stress task capture fails the desktop Live wait and times out on phone; the run does not establish a viewport regression.

- The other non-setup cases (Plan bar, shell skip setup, custom task type, empty-data Live wait, Today chart, and quick-capture confirmation) remain individual failures in the inventory. Their relation to emulator degradation is unproven. Five phone notification cases failed during emulator reset; the E1 desktop flow passed.

### Accessibility — complete failed-state inventory

Tool/spec: <code>scripts/a11y/axe.mjs:63</code>; each state ID below is a case. Reset/seed errors originate in <code>tests/support/emulator.ts:64</code>. The scan attempted all 284 distinct non-stress desktop/phone states: **142 clean, 66 with a serious violation, 76 unable to finish**. No recipe <code>errors</code> were reported in the completed states. <code>npm run a11y</code> exits 0 even when its JSON contains violations or failed states, so its process exit is not an accessibility pass.

#### Accessibility scan error 1 — 1 case(s)

First error line: <code>Seeding tasks/flows failed: 500 {"error":{"code":500,"status":"UNKNOWN"}}</code>

| Case | State / test |
|---|---|
| F001 | <code>247-flows-onboarding-desktop</code> |

#### Accessibility scan error 2 — 23 case(s)

First error line: <code>Seeding tasks/tasks failed: 500 {"error":{"code":500,"status":"UNKNOWN"}}</code>

| Case | State / test |
|---|---|
| F002 | <code>250-flows-no-steps-yet-phone</code> |
| F004 | <code>254-flows-edit-a-flow-phone</code> |
| F006 | <code>255-flows-saving-phone</code> |
| F007 | <code>256-flows-name-suggestions-desktop</code> |
| F009 | <code>257-flows-adding-a-decision-desktop</code> |
| F011 | <code>258-flows-new-flow-desktop</code> |
| F013 | <code>259-flows-name-missing-desktop</code> |
| F015 | <code>260-flows-menu-desktop</code> |
| F017 | <code>261-flows-delete-desktop</code> |
| F019 | <code>263-flows-loading-desktop</code> |
| F021 | <code>264-flows-offline-read-only-desktop</code> |
| F023 | <code>266-flows-open-desktop</code> |
| F024 | <code>266-flows-open-phone</code> |
| F026 | <code>270-installing-and-opening-with-no-connection-browser-offers-it-phone</code> |
| F028 | <code>271-installing-and-opening-with-no-connection-iphone-phone</code> |
| F030 | <code>272-installing-and-opening-with-no-connection-installed-phone</code> |
| F032 | <code>275-installing-and-opening-with-no-connection-back-online-phone</code> |
| F034 | <code>276-moving-around-on-phones-more-sheet-phone</code> |
| F068 | <code>006-today-no-client-work-phone</code> |
| F070 | <code>032-all-tasks-no-client-work-phone</code> |
| F072 | <code>233-past-clients-no-other-parent-phone</code> |
| F073 | <code>007-today-normal-desktop</code> |
| F075 | <code>216-past-clients-nothing-counted-yet-desktop</code> |

#### Accessibility scan error 3 — 33 case(s)

First error line: <code>Clearing tasks failed: 500 {"error":{"code":500,"status":"UNKNOWN"}}</code>

| Case | State / test |
|---|---|
| F003 | <code>254-flows-edit-a-flow-desktop</code> |
| F005 | <code>255-flows-saving-desktop</code> |
| F008 | <code>256-flows-name-suggestions-phone</code> |
| F010 | <code>257-flows-adding-a-decision-phone</code> |
| F012 | <code>258-flows-new-flow-phone</code> |
| F014 | <code>259-flows-name-missing-phone</code> |
| F016 | <code>260-flows-menu-phone</code> |
| F018 | <code>261-flows-delete-phone</code> |
| F020 | <code>263-flows-loading-phone</code> |
| F022 | <code>264-flows-offline-read-only-phone</code> |
| F025 | <code>270-installing-and-opening-with-no-connection-browser-offers-it-desktop</code> |
| F027 | <code>271-installing-and-opening-with-no-connection-iphone-desktop</code> |
| F029 | <code>272-installing-and-opening-with-no-connection-installed-desktop</code> |
| F031 | <code>275-installing-and-opening-with-no-connection-back-online-desktop</code> |
| F033 | <code>276-moving-around-on-phones-more-sheet-desktop</code> |
| F035 | <code>009-today-open-desktop</code> |
| F037 | <code>015-today-nothing-loaded-desktop</code> |
| F039 | <code>033-all-tasks-nothing-yet-desktop</code> |
| F041 | <code>039-all-tasks-offline-nothing-loaded-desktop</code> |
| F044 | <code>081-plan-timeline-nothing-yet-phone</code> |
| F047 | <code>140-companies-the-four-groups-no-companies-desktop</code> |
| F049 | <code>144-companies-the-four-groups-offline-nothing-loaded-desktop</code> |
| F051 | <code>204-qualification-notes-nothing-yet-desktop</code> |
| F053 | <code>206-qualification-notes-offline-nothing-loaded-desktop</code> |
| F055 | <code>242-past-clients-nothing-yet-desktop</code> |
| F057 | <code>245-past-clients-offline-nothing-loaded-desktop</code> |
| F059 | <code>262-flows-nothing-yet-desktop</code> |
| F061 | <code>265-flows-offline-nothing-loaded-desktop</code> |
| F063 | <code>141-companies-the-four-groups-no-or-not-now-is-empty-desktop</code> |
| F069 | <code>032-all-tasks-no-client-work-desktop</code> |
| F071 | <code>233-past-clients-no-other-parent-desktop</code> |
| F074 | <code>007-today-normal-phone</code> |
| F076 | <code>216-past-clients-nothing-counted-yet-phone</code> |

#### Accessibility scan error 4 — 15 case(s)

First error line: <code>Seeding tasks/settings failed: 500 {"error":{"code":500,"status":"UNKNOWN"}}</code>

| Case | State / test |
|---|---|
| F036 | <code>009-today-open-phone</code> |
| F038 | <code>015-today-nothing-loaded-phone</code> |
| F040 | <code>033-all-tasks-nothing-yet-phone</code> |
| F042 | <code>039-all-tasks-offline-nothing-loaded-phone</code> |
| F043 | <code>081-plan-timeline-nothing-yet-desktop</code> |
| F045 | <code>091-plan-timeline-offline-nothing-loaded-desktop</code> |
| F046 | <code>091-plan-timeline-offline-nothing-loaded-phone</code> |
| F048 | <code>140-companies-the-four-groups-no-companies-phone</code> |
| F050 | <code>144-companies-the-four-groups-offline-nothing-loaded-phone</code> |
| F052 | <code>204-qualification-notes-nothing-yet-phone</code> |
| F054 | <code>206-qualification-notes-offline-nothing-loaded-phone</code> |
| F056 | <code>242-past-clients-nothing-yet-phone</code> |
| F058 | <code>245-past-clients-offline-nothing-loaded-phone</code> |
| F060 | <code>262-flows-nothing-yet-phone</code> |
| F062 | <code>265-flows-offline-nothing-loaded-phone</code> |

#### Accessibility scan error 5 — 2 case(s)

First error line: <code>Seeding tasks/tasks failed: 500 {"error":{"code":500,"message":"Application error processing RPC","status":"UNKNOWN"}}</code>

| Case | State / test |
|---|---|
| F064 | <code>141-companies-the-four-groups-no-or-not-now-is-empty-phone</code> |
| F067 | <code>006-today-no-client-work-desktop</code> |

#### Accessibility scan error 6 — 1 case(s)

First error line: <code>Seeding tasks/tasks failed: 500 {"error":{"code":500,"message":"Internal","status":"INTERNAL"}}</code>

| Case | State / test |
|---|---|
| F065 | <code>104-plan-one-day-open-desktop</code> |

#### Accessibility scan error 7 — 1 case(s)

First error line: <code>fetch failed</code>

| Case | State / test |
|---|---|
| F066 | <code>104-plan-one-day-open-phone</code> |

#### Serious rule and affected selectors

Rule: <code>label-content-name-mismatch</code>. First rule error line: <code>Elements must have their visible text as part of their accessible name</code>. The exact selectors and first node error lines are catalogued once, with every affected state mapped to them in the next table.

| Target | Selector | First node error line |
|---|---|---|
| N01 | <code>article[data-kind="internal"]:nth-child(1) &gt; .TaskRow-module__yV1rWW__deadline.TaskRow-module__yV1rWW__edit[data-col="end"]</code> | Text inside the element is not included in the accessible name |
| N02 | <code>article[data-kind="prospect"]:nth-child(2) &gt; .TaskRow-module__yV1rWW__deadline.TaskRow-module__yV1rWW__edit[data-col="end"]</code> | Text inside the element is not included in the accessible name |
| N03 | <code>article[data-kind="prospect"]:nth-child(3) &gt; .TaskRow-module__yV1rWW__deadline.TaskRow-module__yV1rWW__edit[data-col="end"]</code> | Text inside the element is not included in the accessible name |
| N04 | <code>article[data-kind="internal"]:nth-child(4) &gt; .TaskRow-module__yV1rWW__deadline.TaskRow-module__yV1rWW__edit[data-col="end"]</code> | Text inside the element is not included in the accessible name |
| N05 | <code>article[data-new="true"] &gt; .TaskRow-module__yV1rWW__deadline.TaskRow-module__yV1rWW__edit[data-col="end"]</code> | Text inside the element is not included in the accessible name |
| N06 | <code>article:nth-child(1) &gt; .TaskRow-module__yV1rWW__deadline.TaskRow-module__yV1rWW__edit[data-col="end"]</code> | Text inside the element is not included in the accessible name |
| N07 | <code>article[aria-label="Halcyon Logistics"] &gt; .Companies-module__AdXiha__bare.Companies-module__AdXiha__cell[type="button"]:nth-child(5)</code> | Text inside the element is not included in the accessible name |
| N08 | <code>article[aria-label="Cakra Telecom"] &gt; .Companies-module__AdXiha__bare.Companies-module__AdXiha__cell[type="button"]:nth-child(5)</code> | Text inside the element is not included in the accessible name |
| N09 | <code>article[aria-label="Northwind Clinics"] &gt; .Companies-module__AdXiha__bare.Companies-module__AdXiha__cell[type="button"]:nth-child(5)</code> | Text inside the element is not included in the accessible name |
| N10 | <code>article[aria-label="Semesta Property"] &gt; .Companies-module__AdXiha__bare.Companies-module__AdXiha__cell[type="button"]:nth-child(5)</code> | Text inside the element is not included in the accessible name |
| N11 | <code>section[aria-label="What’s happening"] &gt; .Companies-module__AdXiha__prop:nth-child(3) &gt; .Companies-module__AdXiha__pv[type="button"]</code> | Text inside the element is not included in the accessible name |
| N12 | <code>article[aria-label="Bali Surf Resorts"] &gt; .Companies-module__AdXiha__bare.Companies-module__AdXiha__cell[type="button"]:nth-child(2)</code> | Text inside the element is not included in the accessible name |
| N13 | <code>article[aria-label="Lumen Education"] &gt; .Companies-module__AdXiha__bare.Companies-module__AdXiha__cell[type="button"]:nth-child(2)</code> | Text inside the element is not included in the accessible name |
| N14 | <code>section[aria-label="What’s happening"] &gt; .Companies-module__AdXiha__prop:nth-child(2) &gt; .Companies-module__AdXiha__pv[type="button"]</code> | Text inside the element is not included in the accessible name |

#### Every state with that violation

| Case | State / test | Affected targets |
|---|---|---|
| V001 | <code>017-all-tasks-normal-desktop</code> | N01, N02, N03, N04 |
| V002 | <code>034-all-tasks-details-shown-desktop</code> | N01, N02, N03, N04 |
| V003 | <code>035-all-tasks-sort-desktop</code> | N01, N02, N03, N04 |
| V004 | <code>036-all-tasks-no-action-for-desktop</code> | N01, N02, N03, N04 |
| V005 | <code>038-all-tasks-offline-desktop</code> | N01, N02, N03, N04 |
| V006 | <code>040-all-tasks-open-desktop</code> | N01, N05, N03, N04 |
| V007 | <code>049-task-groups-q4-planning-desktop</code> | N06 |
| V008 | <code>052-task-groups-open-desktop</code> | N01, N02, N03, N04 |
| V009 | <code>053-task-groups-name-missing-desktop</code> | N01, N02, N03, N04 |
| V010 | <code>054-task-groups-name-taken-desktop</code> | N01, N02, N03, N04 |
| V011 | <code>055-task-groups-couldn-t-create-desktop</code> | N01, N02, N03, N04 |
| V012 | <code>059-task-details-quick-desktop</code> | N01, N02, N03, N04 |
| V013 | <code>060-task-details-all-details-desktop</code> | N01, N02, N03, N04 |
| V014 | <code>061-task-details-open-desktop</code> | N01, N02, N03, N04 |
| V015 | <code>062-task-details-company-desktop</code> | N01, N02, N03, N04 |
| V016 | <code>063-task-details-internal-desktop</code> | N01, N02, N03, N04 |
| V017 | <code>064-task-details-finished-desktop</code> | N01, N02, N03, N04 |
| V018 | <code>066-task-details-suggestions-desktop</code> | N01, N02, N03, N04 |
| V019 | <code>067-task-details-new-name-desktop</code> | N01, N02, N03, N04 |
| V020 | <code>068-task-details-confirm-desktop</code> | N01, N02, N03, N04 |
| V021 | <code>123-companies-the-four-groups-normal-desktop</code> | N07, N08, N09, N10 |
| V022 | <code>123-companies-the-four-groups-normal-phone</code> | N07, N08, N09, N10 |
| V023 | <code>137-companies-the-four-groups-sort-menu-desktop</code> | N07, N08, N09, N10 |
| V024 | <code>137-companies-the-four-groups-sort-menu-phone</code> | N07, N08, N09, N10 |
| V025 | <code>143-companies-the-four-groups-offline-desktop</code> | N07, N08, N09, N10 |
| V026 | <code>143-companies-the-four-groups-offline-phone</code> | N07, N08, N09, N10 |
| V027 | <code>145-companies-the-four-groups-open-changes-after-a-second-desktop</code> | N07, N08, N09, N10 |
| V028 | <code>145-companies-the-four-groups-open-changes-after-a-second-phone</code> | N07, N08, N09, N10 |
| V029 | <code>146-companies-one-detail-one-step-status-desktop</code> | N07, N08, N09, N10 |
| V030 | <code>146-companies-one-detail-one-step-status-phone</code> | N07, N08, N09, N10 |
| V031 | <code>147-companies-one-detail-one-step-target-date-desktop</code> | N07, N08, N09, N10 |
| V032 | <code>147-companies-one-detail-one-step-target-date-phone</code> | N07, N08, N09, N10 |
| V033 | <code>148-companies-one-detail-one-step-next-actions-desktop</code> | N07, N08, N09, N10 |
| V034 | <code>148-companies-one-detail-one-step-next-actions-phone</code> | N07, N08, N09, N10 |
| V035 | <code>149-companies-one-detail-one-step-open-desktop</code> | N07, N08, N09, N10 |
| V036 | <code>149-companies-one-detail-one-step-open-phone</code> | N07, N08, N09, N10 |
| V037 | <code>151-company-record-gone-cold-target-missed-desktop</code> | N07, N08, N09, N10, N11 |
| V038 | <code>151-company-record-gone-cold-target-missed-phone</code> | N07, N08, N09, N10 |
| V039 | <code>153-company-record-to-approach-desktop</code> | N12, N13, N14 |
| V040 | <code>153-company-record-to-approach-phone</code> | N12, N13, N14 |
| V041 | <code>157-company-record-created-desktop</code> | N07, N08, N09, N10 |
| V042 | <code>157-company-record-created-phone</code> | N07, N08, N09, N10 |
| V043 | <code>158-company-record-failed-desktop</code> | N07, N08, N09, N10 |
| V044 | <code>158-company-record-failed-phone</code> | N07, N08, N09, N10 |
| V045 | <code>159-company-record-confirm-desktop</code> | N07, N08, N09, N10 |
| V046 | <code>159-company-record-confirm-phone</code> | N07, N08, N09, N10 |
| V047 | <code>161-new-company-moving-between-groups-open-desktop</code> | N07, N08, N09, N10 |
| V048 | <code>161-new-company-moving-between-groups-open-phone</code> | N07, N08, N09, N10 |
| V049 | <code>162-new-company-moving-between-groups-name-missing-desktop</code> | N07, N08, N09, N10 |
| V050 | <code>162-new-company-moving-between-groups-name-missing-phone</code> | N07, N08, N09, N10 |
| V051 | <code>163-new-company-moving-between-groups-to-approach-active-desktop</code> | N12, N13 |
| V052 | <code>163-new-company-moving-between-groups-to-approach-active-phone</code> | N12, N13 |
| V053 | <code>164-new-company-moving-between-groups-active-no-or-not-now-desktop</code> | N07, N08, N09, N10 |
| V054 | <code>164-new-company-moving-between-groups-active-no-or-not-now-phone</code> | N07, N08, N09, N10 |
| V055 | <code>166-fields-and-options-active-desktop</code> | N07, N08, N09, N10 |
| V056 | <code>166-fields-and-options-active-phone</code> | N07, N08, N09, N10 |
| V057 | <code>169-fields-and-options-open-desktop</code> | N07, N08, N09, N10 |
| V058 | <code>169-fields-and-options-open-phone</code> | N07, N08, N09, N10 |
| V059 | <code>170-fields-and-options-confirm-desktop</code> | N07, N08, N09, N10 |
| V060 | <code>170-fields-and-options-confirm-phone</code> | N07, N08, N09, N10 |
| V061 | <code>171-fields-and-options-status-options-desktop</code> | N07, N08, N09, N10 |
| V062 | <code>171-fields-and-options-status-options-phone</code> | N07, N08, N09, N10 |
| V063 | <code>173-fields-and-options-remove-an-option-desktop</code> | N07, N08, N09, N10 |
| V064 | <code>173-fields-and-options-remove-an-option-phone</code> | N07, N08, N09, N10 |
| V065 | <code>174-export-open-desktop</code> | N07, N08, N09, N10 |
| V066 | <code>174-export-open-phone</code> | N07, N08, N09, N10 |

### Scoped compare — every capture and copy delta

Tool/spec: <code>scripts/compare/run.mjs:83</code>. The scope was exactly <code>001-today-normal</code> (shell) and <code>276-moving-around-on-phones-more-sheet</code> (More), each at 1440×900 and 390×844. <code>--force</code> ensured one fresh capture per case. All four report <code>errors: []</code> and no failed or skipped capture; no visual look check was performed, as R1a is <code>[no look]</code>. A successful capture is not a visual-conformance verdict.

The new <code>Sign in</code> and <code>Get notifications about your tasks</code> words are planned A3/A5 additions absent from the older prototype. Other deltas below remain for R1b to accept with a reason or fix; no copy was changed here. Duplicate words are preserved exactly as the comparison report returned them.

| Case / state | Only prototype | Only app |
|---|---|---|
| <code>001-today-normal-desktop</code> | <code>Team desk</code><br><code>Companies</code><br><code>Q4</code><br><code>H</code><br><code>O</code><br><code>Search</code><br><code>2 days late</code><br><code>1 day late</code><br><code>Tomorrow</code><br><code>In 2 days</code><br><code>In 3 days</code><br><code>In 3 days</code><br><code>In 3 days</code><br><code>In 6 days</code><br><code>In 10 days</code><br><code>AR</code><br><code>In 10 days</code><br><code>In 15 days</code> | <code>DEUS Team Space</code><br><code>QP</code><br><code>HI</code><br><code>OM</code><br><code>Sign in</code><br><code>Sun 18 Oct · 2 days late</code><br><code>Mon 19 Oct · 1 day late</code><br><code>Tue 20 Oct · Today</code><br><code>Wed 21 Oct · Tomorrow</code><br><code>Thu 22 Oct</code><br><code>Fri 23 Oct</code><br><code>Fri 23 Oct</code><br><code>Fri 23 Oct</code><br><code>Mon 26 Oct</code><br><code>Fri 30 Oct</code><br><code>AG</code><br><code>Fri 30 Oct</code><br><code>Wed 4 Nov</code> |
| <code>001-today-normal-phone</code> | <code>In 2 days</code><br><code>In 3 days</code><br><code>In 3 days</code><br><code>In 3 days</code><br><code>In 6 days</code><br><code>In 10 days</code><br><code>In 10 days</code><br><code>In 15 days</code><br><code>Companies</code> | <code>20</code><br><code>Open Plan</code><br><code>Sun 18 Oct</code><br><code>Mon 19 Oct</code><br><code>Tue 20 Oct</code><br><code>Wed 21 Oct</code><br><code>Thu 22 Oct</code><br><code>Fri 23 Oct</code><br><code>Fri 23 Oct</code><br><code>Fri 23 Oct</code><br><code>Mon 26 Oct</code><br><code>Fri 30 Oct</code><br><code>Fri 30 Oct</code><br><code>Wed 4 Nov</code> |
| <code>276-moving-around-on-phones-more-sheet-desktop</code> | <code>Team desk</code><br><code>Companies</code><br><code>Q4</code><br><code>H</code><br><code>O</code><br><code>Search</code><br><code>2 days late</code><br><code>1 day late</code><br><code>Tomorrow</code><br><code>In 2 days</code><br><code>In 3 days</code><br><code>In 3 days</code><br><code>In 3 days</code><br><code>In 6 days</code><br><code>In 10 days</code><br><code>AR</code><br><code>In 10 days</code><br><code>In 15 days</code><br><code>More</code><br><code>PlanDeadlines, events and who carries what</code><br><code>Qualification notesQualify prospects</code><br><code>Past clientsEvery company we have served</code><br><code>FlowsHow work moves between people</code><br><code>Install on this phone</code><br><code>Opens from your home screen, even with no connection</code> | <code>DEUS Team Space</code><br><code>QP</code><br><code>HI</code><br><code>OM</code><br><code>Sign in</code><br><code>Sun 18 Oct · 2 days late</code><br><code>Mon 19 Oct · 1 day late</code><br><code>Tue 20 Oct · Today</code><br><code>Wed 21 Oct · Tomorrow</code><br><code>Thu 22 Oct</code><br><code>Fri 23 Oct</code><br><code>Fri 23 Oct</code><br><code>Fri 23 Oct</code><br><code>Mon 26 Oct</code><br><code>Fri 30 Oct</code><br><code>AG</code><br><code>Fri 30 Oct</code><br><code>Wed 4 Nov</code> |
| <code>276-moving-around-on-phones-more-sheet-phone</code> | <code>In 2 days</code><br><code>In 3 days</code><br><code>In 3 days</code><br><code>In 3 days</code><br><code>In 6 days</code><br><code>In 10 days</code><br><code>In 10 days</code><br><code>In 15 days</code><br><code>Companies</code> | <code>20</code><br><code>Open Plan</code><br><code>Sun 18 Oct</code><br><code>Mon 19 Oct</code><br><code>Tue 20 Oct</code><br><code>Wed 21 Oct</code><br><code>Thu 22 Oct</code><br><code>Fri 23 Oct</code><br><code>Fri 23 Oct</code><br><code>Fri 23 Oct</code><br><code>Mon 26 Oct</code><br><code>Fri 30 Oct</code><br><code>Fri 30 Oct</code><br><code>Wed 4 Nov</code><br><code>Sign in</code><br><code>Get notifications about your tasks</code> |

### Checks and decisions

- <code>npx tsc --noEmit</code>: passed (25.6 s).

- <code>npx eslint docs/IMPLEMENTATION_PLAN.md docs/implementation/audrey-sign-in-results.md</code>: exit 0, both Markdown files ignored because there is no matching ESLint configuration; no application files changed. Final <code>git diff --check</code> passed after removing an extra blank line at EOF.

- <code>npm run test:unit</code>: 1,648 passed / 1 sandbox failure (<code>spawnSync /opt/node-v26.10.0-linux-arm64/bin/node EPERM</code> in <code>tests/unit/notifyKeys.test.ts:11</code>). Escalated rerun of only <code>npx vitest run --project unit tests/unit/notifyKeys.test.ts</code> passed 1/1; the full unit suite was not rerun.

- <code>npm run test:smoke -- --reporter=list,json</code>: run once, no retries; 333 passed / 103 failed / 14 skipped / 0 flaky; exit 1, 112.3 min. Sign-in: desktop 7 passed + 1 skipped, phone 4 passed. Notifications: desktop 5 passed + 4 skipped (including E1 passing), phone 5 reset failures.

- <code>npm run a11y</code>: run once; 284 attempted, 66 violation states / 76 scan failures / 142 clean; exit 0, 61.0 min. The failure inventory, rather than exit 0, determines this result.

- <code>npm run compare -- --only '^(001-today-normal&#124;276-moving-around-on-phones-more-sheet)$' --force</code>: run once; 4 fresh captures, 0 runtime/layout errors; exit 0, 67.9 s; copy differences listed above. Test listeners on 3100, 4100, 8180 and 9199 were all stopped after the runs.

DECISION: Used the existing R1b row for all repairs rather than adding duplicate fix rows, because R1a explicitly inventories failures and fixes nothing.

DECISION: Used fresh desktop and phone captures of only shell/More rather than the entire prototype map, because those are R1a’s named compare states. No screenshots were opened.

DECISION: Limited the Firebase JVM to <code>JAVA_TOOL_OPTIONS=-Xmx2g</code> for these sequential runs rather than its default heap, to bound the test stack’s memory. This environment detail is material to diagnosing the long-run emulator failures. The heap cap stayed fixed after failures appeared; none of the three requested runs was repeated.

### Reproduction and retained evidence

Tested source baseline: <code>317976b</code>. Browser tests used Next dev (the production emulator guard disables emulator access in production builds), the local Firestore/Auth emulators, fake mail/push and fake calendar. The scans explicitly enabled <code>NEXT_PUBLIC_SIGN_IN_ENABLED=1</code>; no production data, service, settings or account was changed. No rebuild or data-test run was added for this documentation-only task.

Raw evidence remains in <code>/tmp/deus-r1a-20261117-01Ad0Q</code>: <code>smoke.json</code>, <code>smoke-failures.json</code>, <code>smoke.log</code>, <code>a11y-report.json</code>, <code>a11y.log</code>, <code>compare-report.json</code>, <code>compare.log</code> and command-status/light-check logs. Every primary failure is also recorded above, so that inventory does not depend on temporary files. The original JSON retains secondary errors and stack traces.

The run overwrote/deleted 301 previously tracked test-output files. Its current 30 MB of screenshots, error contexts and traces were preserved in <code>/tmp/deus-r1a-20261117-01Ad0Q/test-results</code> before restoring those tracked artifacts to the clean starting revision. For attachments whose JSON path starts with <code>/home/ubuntu/deus-team-tasks/test-results/</code>, use the equivalent suffix beneath that preserved directory to inspect this run. Fresh comparison images remain under <code>redesign/compare/{proto,new,both}/</code> (ignored); only the plan and this evidence file are committed.
