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
