# Leave: ask for leave, approve it, and track balances

Prepared 2026-11-23 for `autorun all`. The details for every row are in [the build brief](implementation/leave.md),
the product reasons and owner decisions in [the product plan](leave-plan.md), and the screens on the screens page
(source: `docs/implementation/leave-screens.html`). The previous plan (task groups from chat) is
[archived](implementation/groups-from-chat-plan-2026-11-20.md); its owner steps O1, O2 and R-O1 to R-O3 are still
open there.

## Outcome

Everyone on the team signs in and opens **Leave**: they see their balance (a +1 every 1st, Calista from
2027-02-01), ask for Annual leave, Sick or Other absence, see the working days and the balance after (it may go below
zero), and follow their requests and history. Gregory gets a push for each request, approves or rejects it, sees
everyone's balances and history, adds leave for someone, adjusts a balance and keeps the holiday list. Last year's
unused days lapse on 1 March. Phase 2 shows who is away, by name only, in Plan. Nothing shows until the owner sets
one Vercel variable (O5); sign-in, which Leave also needs, has been on in Production since 2026-11-18.

## Before the run

- [x] Screens (owner, 2026-11-23): no separate approval; every screen follows the design guide as it is, and the
  screens page (built from the guide's parts only) is the reference the look checks compare against.

## Run rules

- Read only your task's section in the brief, plus **Smallest design**, **Requirements** and **Checks** there.
  The defaults are settled: no brainstorming and no questions to the owner.
- One task per session, on `main` (this project's branch rule). Commit and push each task with its row ticked in
  the same commit. Every push deploys, which is safe because everything stays off until O5.
- Tests use only the Firestore and Auth emulators with the fake push, and pin the day with `LEAVE_TEST_DATE`. Never
  call a push service or production.
- Evidence goes in `docs/implementation/leave-results.md`, under each task's ID.

## Phase 1: Ask, approve and track leave

| ID | Task | Pick | Done |
|---|---|---|---|
| L1 | Leave rules (pure): working days, request checks, the ledger with monthly +1s and the 1 March lapse, the summary, the words. [L1](implementation/leave.md#l1--leave-rules) [no look] | Sol Max | 2026-11-23 — leave rules checked |
| L2 | Server for everyone: collections closed to the device, flag and admin list, `/api/leave/me`, ask and cancel in transactions, `LEAVE_TEST_DATE`. [L2](implementation/leave.md#l2--server-reading-and-asking) [no look] | Sol Max | 2026-11-23 — server and emulator checks done |
| L3 | Server for the admin: team and person data, decide, ask for someone, adjust, leave details with audit, holidays, `leave:setup` script and holiday seed. [L3](implementation/leave.md#l3--server-the-admin-side) [no look] | Sol Max | 2026-11-23 — admin server and setup checked |
| L4 | Pushes for request, decision, cancellation and added-for-you, and the waiting line in the admins' 09:00 summary. [L4](implementation/leave.md#l4--pushes-and-the-morning-line) [no look] | Sol Max | 2026-11-23 — leave pushes and morning summary checked |
| L5 | The Leave page: entry in the side bar and More, signed-out and not-set-up states, balance card, Requests and History, request sheet with Cancel; `leave.spec.ts`. [L5](implementation/leave.md#l5--the-leave-page) [look] | Sol Max | 2026-11-23 — page and look checked |
| L6 | Ask for leave sheet: every type and reason, half day, hours, live day count and balance after, refusals on their fields. [L6](implementation/leave.md#l6--ask-for-leave) [look] | Sol Max | 2026-11-23 — request sheet and look checked |
| L7 | Admin Team view: waiting cards with approve, reject and pay choice, the count, the People table; `leave-admin.spec.ts`. [L7](implementation/leave.md#l7--admin-the-team-view) [look] | Sol Max | 2026-11-23 — Team decisions and look checked |
| L8 | Admin person sheet (add leave, adjust, leave details, history with audit) and the Holidays sheet. [L8](implementation/leave.md#l8--admin-a-person-and-the-holidays) [look] | Sol Max | |
| E1 | End to end on the emulators: two people and an admin across pinned days, through 1 February and the 1 March lapse. [E1](implementation/leave.md#e1--end-to-end) [no look] | Sol xHigh | |
| R1a | Full suite, a11y and scoped compare once; list every failure, fix nothing. [R1a](implementation/leave.md#r1a--full-check-run) [no look] | Sol High | |
| R1b | Fix the failures R1a listed, rerunning only what each fix touched. [R1b](implementation/leave.md#r1b--fix-recorded-failures) [look] | Sol Max | |
| R1 | Phase review: hunt for faults in balances, permissions, privacy and pushes, quick fixes, owner handoff. [R1](implementation/leave.md#r1--phase-review) [no look] | Opus 5.5 High | |

## Phase 2: Who's away in Plan

| ID | Task | Pick | Done |
|---|---|---|---|
| P1 | `/api/leave/away` (names and days only) and "Away" in Plan's Month, Day and People views; `plan.spec.ts` cases. [P1](implementation/leave.md#p1--whos-away-in-plan) [look] | Sol Max | |
| E2 | Full suite, a11y and scoped compare once after Phase 2; list every failure, fix nothing. [E2](implementation/leave.md#e2--full-check-run) [no look] | Sol High | |
| E2b | Fix the failures E2 listed, rerunning only what each fix touched. [E2b](implementation/leave.md#e2b--fix-recorded-failures) [look] | Sol Max | |
| R2 | Phase review of Phase 2 and R1's open items, quick fixes, owner handoff. [R2](implementation/leave.md#r2--phase-review) [no look] | Opus 5.5 High | |

## Owner steps after the run

- [ ] O1 *owner*: give each teammate a sign-in, with the name they carry on tasks: `npm run people:add -- <email>
  "<name>"` (dry run), then again with `--apply`, for Calista (`<her email>`), `sovie.magdalena@deushcs.com`,
  `thania.ferdinanto@deushcs.com` and `william.ang@deushcs.com`. Needs `FIREBASE_ADMIN_KEY` in your shell; Claude can
  run it with you.
- [ ] O2 *owner*: write `leave-setup.json` (kept out of git): for each of the six people `email`, `joinDate`,
  `accrualStart` (the 1st their +1s start; Calista `2027-02-01`), `openingBalance` (their balance on the go-live day,
  that day's +1 included) and `openingDate` (the go-live day). Run `npm run leave:setup -- leave-setup.json`, check the
  printed table, then add `--apply`. Then `npm run leave:setup -- --holidays`, then with `--apply`.
- [ ] O3 *owner*: check with whoever handles HR/contracts the points marked *(verify)* in the brief: the special-leave
  days, that unused days lapse on 1 March without pay, and that a below-zero balance may be deducted from final pay.
- [ ] O4 *owner*: in Vercel Production add `LEAVE_ADMINS=gregory.kurnia@deushcs.com`.
- [ ] O5 *owner*: add `NEXT_PUBLIC_LEAVE_ENABLED=1` in Vercel Production and redeploy. To roll back, remove it and
  redeploy.
- [ ] O6 *owner*: each teammate signs in (on iPhone, from the app on the Home Screen) and turns on notifications.
- [ ] O7 *owner*: live try: a teammate asks a half day of annual leave; you get the push, approve it, and their balance
  goes down by 0.5. Then they cancel it and it comes back.

## Model rationale

Picks follow "Claude or Codex: one pick per task" in `~/.claude/playbooks/plans-and-models.md`. L1–L4 decide
balances, permissions and who gets told: Sol Max. L5–L8 are screens that save leave data and follow an approved page,
judged by specs and the look check: Sol Max. P1 decides what others may see about someone's leave: Sol Max. E1 is an
end-to-end check run: Sol xHigh. R1a and E2 are check runs: Sol High. R1b and E2b fix code that saves or shows leave data: Sol Max. R1 and
R2 are Opus 5.5 High, from the other family to the rows Codex built. A failed task's retry is autorun's own pick.
