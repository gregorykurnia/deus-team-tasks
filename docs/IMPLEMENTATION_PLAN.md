# Audrey and Gregory sign in and get notifications on their phones

Prepared 2026-11-17 for `autorun all`. The details for every row are in [the build brief](implementation/audrey-sign-in.md),
and the screens are on [the screens page](https://claude.ai/artifact/J2YrGzCsGVeZ2D2CHi9Bay)
(source: `docs/implementation/sign-in-screens.html`). The previous plan (chat task edits) is
[archived](implementation/chat-task-edits-plan-2026-11-11.md); its owner step O3 is still open there.

## Outcome

Audrey (`audrey.wijaya@deushcs.com`, iPhone) and Gregory (`gregory.kurnia@deushcs.com`) sign in to DEUS Space on its
own sign-in page with a 6-digit code sent to their Titan inbox, turn on notifications (on iPhone, in the app on the
Home Screen), and get "New task for you" within seconds whenever someone makes them Responsible (in the app or from a
Claude chat), plus a summary at 09:00 Jakarta, Monday to Friday. Nobody else has to sign in, and nothing shows until the owner sets one Vercel variable (O5). Phase 2 (everyone signs in,
the database locked) is a later plan.

## Before the run

- [x] The owner approved the screens page (2026-11-17, version 3: sign-in on its own page).

## Run rules

- Read only your task's section in the brief, plus **Smallest design**, **Requirements** and **Checks** there.
  The defaults are settled: no brainstorming and no questions to the owner.
- One task per session, on `main` (this project's branch rule). Commit and push each task with its row ticked in
  the same commit. Every push deploys, which is safe because everything stays off until O5.
- Tests use only the Firestore and Auth emulators with the fake mailer and fake push. Never call Titan, a push
  service or production.
- Evidence goes in `docs/implementation/audrey-sign-in-results.md`, under each task's ID.

## Phase 1: Audrey signs in and gets notifications

| ID | Task | Pick | Done |
|---|---|---|---|
| A1 | Server access (`firebase-admin`, auth emulator), person records, `people:add` / `people:remove` scripts with dry run, closed-rules test. [A1](implementation/audrey-sign-in.md#a1--server-access-and-person-records) [no look] | Sol Max | 2026-11-17 — checked |
| A2 | Sign-in codes: request and verify rules, hashed codes, limits, Titan SMTP mailer and fake, routes, `notify:keys`. [A2](implementation/audrey-sign-in.md#a2--sign-in-codes) [no look] | Sol Max | 2026-11-17 — checked |
| A3 | Sign-in page `/sign-in` (email, code, iPhone Safari card), account sheet, entries in More and the side bar, `sign-in.spec.ts`. [A3](implementation/audrey-sign-in.md#a3--sign-in-page-and-account) [look] | Sol Max | 2026-11-17 — checked; look fixes |
| A4 | Push plumbing: sender and fake, device routes, test route, service worker push and click handlers. [A4](implementation/audrey-sign-in.md#a4--push-plumbing) [no look] | Sol Max | 2026-11-17 — checked |
| A5 | Turn on notifications sheet (five versions), account card, sign-out removes the device, `notifications.spec.ts`. [A5](implementation/audrey-sign-in.md#a5--turn-on-notifications) [look] | Sol Max | 2026-11-17 — checked; fresh-eyes fixes |
| A6 | New task for you: the shared save helpers report tasks whose Responsible changed, the server decides who is owed and sends once, chat connector too. [A6](implementation/audrey-sign-in.md#a6--new-task-for-you) [no look] | Sol Max | 2026-11-17 — checked |
| A7 | Morning summary: pure builder, weekday cron route behind `CRON_SECRET`, `vercel.json` cron. [A7](implementation/audrey-sign-in.md#a7--morning-summary) [no look] | Sol Max | 2026-11-17 — checked |
| E1 | End to end on the emulators: sign in, turn on, assigned in the app and from chat, morning summary, sign out. [E1](implementation/audrey-sign-in.md#e1--end-to-end) [no look] | Sol Max | 2026-11-17 — checked |
| R1a | Full suite, a11y and scoped compare once; list every failure, fix nothing. [R1a](implementation/audrey-sign-in.md#r1a--full-check-run) [no look] | Sol Max | 2026-11-17 — failures listed |
| R1b | Fix the failures R1a listed, rerunning only what each fix touched. [R1b](implementation/audrey-sign-in.md#r1b--fix-recorded-failures) [look] | Sol Max | 2026-11-17 — repairs checked; rest → R1bb |
| R1bb | Finish the remaining R1a emulator/stress repairs, failed-state accessibility replays and scoped comparison triage. [R1bb](implementation/audrey-sign-in.md#r1bb--finish-the-recorded-failure-replay) [look] | Sol Max | 2026-11-17 — scoped replays and look checked |
| R1 | Phase review: hunt for faults in sign-in and sending, fix them, write the owner handoff. [R1](implementation/audrey-sign-in.md#r1--phase-review) [no look] | Opus 5.5 High | |

## Owner steps after the run

- [ ] O1 *owner*: Firebase console, project `deus-team-tasks` → Authentication → **Get started** (no sign-in
  provider needs turning on; the app uses its own codes).
- [ ] O2 *owner*: Firebase console → Project settings → Service accounts → **Generate new private key**. In Vercel
  Production, add `FIREBASE_ADMIN_KEY` with the whole JSON file's contents. Delete the downloaded file afterwards.
- [ ] O3 *owner*: in Titan, create the mailbox `noreply@deushcs.com` (or pick an existing one). In Vercel Production
  add `SMTP_HOST=smtp.titan.email`, `SMTP_PORT=465`, `SMTP_USER=<the mailbox>`, `SMTP_PASS=<its password>`,
  `MAIL_FROM=DEUS Space <the mailbox>`.
- [ ] O4 *owner*: run `npm run notify:keys` and add what it prints to Vercel Production: `CODE_SECRET`,
  `CRON_SECRET`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT=mailto:<the mailbox>`.
- [ ] O5 *owner*: add `NEXT_PUBLIC_SIGN_IN_ENABLED=1` in Vercel Production and redeploy. To roll back, remove it and
  redeploy.
- [ ] O6 *owner*: link the two logins: `npm run people:add -- gregory.kurnia@deushcs.com "<your name as on tasks>"`
  and `npm run people:add -- audrey.wijaya@deushcs.com Audrey`. Each dry run says how many tasks carry that name
  (and the closest names in use if none); then run each with `--apply`, which also marks existing tasks as already
  told so they never send a notification. Needs `FIREBASE_ADMIN_KEY` in your shell.
- [ ] O7 *owner*: sign in yourself first (More or the side bar → Sign in, with gregory.kurnia@deushcs.com) to check the
  code email arrives (look in spam; if it lands there, ask Claude for the DNS records that make it come from
  deushcs.com). Turn on notifications on your device and Send a test.
- [ ] O8 *owner, with Audrey's iPhone*: Safari → the app → Share → Add to Home Screen; open DEUS Space from the Home
  Screen; More → Sign in; enter her code on the sign-in page; Turn on notifications → Allow; Send a test; the test arrives.
- [ ] O9 *owner*: give Audrey a throwaway task in the app; her iPhone shows "New task for you" within a minute.
  Delete the task. The next weekday at 09:00 (Vercel's free plan may run it any time within that hour), she gets the
  summary if anything is late or due.

## Model rationale

Picks follow "Claude or Codex: one pick per task" in `~/.claude/playbooks/plans-and-models.md`. Sol Max takes every
build row: sign-in and permissions (A1, A2, A4, A6) are its row, and the screens (A3, A5) follow an approved page
built from the guide's parts, judged by specs and the look check. Opus 5.5 High takes the phase review, because every
build row is Codex-built and the review should come from the other family. A failed task's retry is autorun's own
pick.

Start with `AUTORUN_GPT_ONLY=0 autorun all docs/IMPLEMENTATION_PLAN.md`. If Claude's limit is low, change R1 to Sol
Max first and start with `AUTORUN_GPT_ONLY=1`.
