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
