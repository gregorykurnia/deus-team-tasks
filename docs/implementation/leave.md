# Build brief: leave requests and balances

This brief holds the details for `docs/IMPLEMENTATION_PLAN.md`. Only that plan holds progress ticks. Every default
below is settled for an unattended run, so no task stops to ask. The product reasons are in `docs/leave-plan.md`
(owner decisions D1–D11); where it and this brief differ, this brief wins.

## What the owner asked, and the smallest design

> "Admin view (me) sees everyone's remaining cuti and history of cuti, izin etc. The team mengajukan cuti when
> logged in: types Leave, Sick and Miscellaneous Absence; they see their own history and balance. Tentatively a
> calendar of who is cuti this month, but not each other's balances. Hutang cuti (minus). +1 every 1st of the month,
> except Calista (probation) who starts +1 on 1 February 2027."

Owner answers, 2026-11-23: no debt limit (below zero is deducted from final pay on leaving); unused days carry to the
end of February and lapse on 1 March; cuti bersama is optional (a normal working day); sick-note rules later; half
days for annual leave only; Monday–Friday; the team sees "Away" only; start from opening balances; Gregory takes
leave in the system too; Calista may ask before her +1s start.

**Smallest design:**
- **Words on screen:** the page is **Leave**; the types are **Annual leave**, **Sick** and **Other absence**.
- **Everything is server-only.** The device never reads leave data from Firestore. New collections (below) aren't
  named in `firestore.rules`, so the device is denied; the server reads and writes them with the Admin SDK
  (`lib/admin.ts`), behind routes that check the caller's ID token with `pushIdentity` (`lib/push.server.ts`). Risk
  closed: the task database is open to anyone with the app, and sick days are health information.
- **Admin is a server list:** `LEAVE_ADMINS` (comma-separated emails, today `gregory.kurnia@deushcs.com`). Nothing the
  device sends makes someone admin.
- **Off until the owner switches it on:** `NEXT_PUBLIC_LEAVE_ENABLED=1` (read through `leaveEnabled()` in
  `lib/flags.ts`) and sign-in on (`signInEnabled()`). Off: no Leave entry, `/leave` and every `/api/leave/*` route
  answer 404. Every push to `main` deploys, and this keeps each one safe.
- **The balance is worked out, never stored.** One pure function builds a person's ledger from their profile, their
  approved requests, admin adjustments and the holiday list, for a given Jakarta day. Nothing runs at midnight, so no
  missed or doubled +1 is possible, and a holiday added later recounts every request on it by itself.
- **No limits to enforce** (D3): the form shows the balance after the request, and it may go below zero.
- **Pushes reuse the existing sender** (`lib/push.server.ts`), and the morning cron gains one line for admins.

**Out of scope** (list as follow-ups, don't build): doctor's notes and paid/unpaid rules for sick (D7, later); CSV or
payroll export; a second or stand-in approver; chat connector tools; leave on the Google team calendar; WFH and
overtime; a push when a holiday change recounts someone's request; editing a request (cancel and ask again).

## Data (Firestore project `deus-team-tasks`, server-only)

```
leaveProfiles/{email}      { email, name, joinDate, accrualStart, openingBalance, openingDate, openingCarried, endDate|null, updatedAt }
leaveRequests/{id}         { email, name, type: "annual"|"sick"|"other",
                             reason: null|"special"|"law"|"hours"|"unpaid"|"else",   // type "other" only
                             event: null|<special-leave key>|<law-leave key>,
                             start, end,                   // Jakarta days "YYYY-MM-DD", start <= end
                             half: null|"morning"|"afternoon",   // annual leave, one day only
                             hours: null|{ from: "HH:MM", to: "HH:MM" },   // reason "hours", one day only
                             note,                          // up to 500 characters
                             status: "waiting"|"approved"|"rejected"|"cancelled",
                             pay: null|"deduct"|"paid"|"unpaid",   // set on approval, see Types
                             createdBy, createdAt, decidedBy, decidedAt, rejectReason, cancelledBy, cancelledAt }
leaveAdjustments/{id}      { email, days, reason, date, by, at }      // days: non-zero, steps of 0.5
leaveHolidays/{YYYY-MM-DD} { date, name }
leaveAudit/{id}            { email, by, at, field, from, to }         // every leave-details change
```

`leaveProfiles` is separate from `people/{email}` so `people:add` and `people:remove` can never overwrite it. A person
must have an active `people` record (sign-in) to have a profile; `name` is copied from it, so it is the name the
person carries on tasks (and `people:add` already refuses two active people with the same name).
`openingCarried` is 0 unless `openingDate` falls between 1 January and the end of February: then it is how many of the
opening days are last year's, which the 1 March lapse may take.

## Types and what they do to the balance

| Type / reason | Dates | On approval `pay` is | Balance |
|---|---|---|---|
| Annual leave | from today on (admin: any); full days, or one day as a morning or afternoon half | `deduct` | − working days (half = 0.5) |
| Sick | up to 30 days back, up to 30 days ahead (admin: any); full days | `paid` | none |
| Other absence · Special leave | from 30 days back; at most the event's days (table) | `paid` | none |
| Other absence · Leave by law | any; no cap | `paid` | none |
| Other absence · A few hours | one day, today or later, `from` < `to` within 07:00–20:00 | `paid` | none |
| Other absence · Unpaid | from today on | `unpaid` | none |
| Other absence · Something else (note required) | from today on | the admin picks `paid`, `deduct` or `unpaid` | − working days when `deduct` |

Special leave events *(verify against UU 13/2003 Pasal 93(4) and UU 4/2024)*: own marriage 3; child's marriage 2;
child's circumcision 2; child's baptism 2; wife giving birth or miscarrying 2; death of a spouse, parent, parent-in-law,
child or child-in-law 2; death of another household member 1. The cap is in working days and only binds the
employee's form; an admin can add longer.
Leave by law events: maternity, miscarriage, menstrual leave, religious duty.

## Counting days

- **Working day:** Monday–Friday and not in `leaveHolidays`. All dates are Jakarta days (`wibToday()` from
  `lib/followupServer.ts`); on the emulator only, `LEAVE_TEST_DATE` pins "today" (as `MORNING_TEST_DATE` does).
- A request's **days** = its working days, or 0.5 for a half day. A request with no working day in it is refused:
  "These dates have no working days." A half day or an hours request must be on a working day.
- **No overlap:** a person can't have two waiting or approved requests sharing a day: "You already have leave on
  Mon 12 Jan."
- At most 186 calendar days per request, starting at most 400 days after today.
- **A holiday added later** can leave an approved request with 0 working days: it stays, shows `0 days (holiday)`,
  deducts nothing, and the admin may cancel it.
- **Dates past the holiday list:** when a request touches a year with no holidays in the list, the form says `Holidays
  for 2028 aren't in the list yet, so this count may change.` From 1 October, the admin's Team view shows the notice
  `Add the 2028 holidays` (Holidays sheet) until that year has at least one.

## The ledger (pure: `lib/leaveLedger.ts`)

`buildLedger(profile, approvedRequests, adjustments, holidays, today)` returns dated lines, oldest first, each with a
running balance, plus the summary. Lines:

| Line | Date | Days |
|---|---|---|
| Opening balance | `openingDate` | `openingBalance` (it covers everything up to and including that day, a 1st's +1 too) |
| Monthly +1 | every 1st with `accrualStart` ≤ 1st, 1st > `openingDate`, 1st ≤ `endDate` (if set) | +1 |
| A deducted request | its first working day in each calendar month it touches (a request over New Year or over 28 Feb → 1 Mar makes two lines) | − that month's days |
| Adjustment | its `date` | its days |
| Lapse "2026 days not used by 28 Feb" | 1 March of year Y+1, for each year Y with 31 Dec Y ≥ `openingDate`, or Y+1 the opening year when `openingCarried` > 0 | − lapse (below) |

**Lapse (D5):** last year's days are used first. `carried` = `max(0, B(31 Dec Y))` (or `openingCarried` when the
opening falls in that January–February); `debits` = the days of deducted lines plus the size of negative adjustments,
dated 1 January to the end of February of Y+1 (and on or after `openingDate`); `lapse = max(0, carried − debits)`.
`B(d)` is the balance from lines dated ≤ d. No line when `lapse` is 0, or when `endDate` is before that 1 March. On a
1 March the lines go: lapse, +1, then that day's leave and adjustments.

**Summary** for `today`: `balance` = lines dated ≤ today; `upcoming` = days of approved deducted lines dated after
today; `waiting` = days of the person's waiting requests that would deduct (annual leave, and "something else" counted
as deducting until decided); `available = balance − upcoming − waiting`; `nextPlusOne` = the next 1st after today that
earns +1 (null when none); `lapseWarning` from 1 Jan to the end of Feb: the days of last year that would lapse if
nothing more is taken (`max(0, carried − debits so far − upcoming and waiting deducted days in the window)`), shown
only when above 0.
Every number is a multiple of 0.5.

**Worked example (the expected numbers; L1's tests and E1 assert exactly these).** Holidays from **Holiday seed**.
All three have `openingDate` 2026-12-01; the opening includes that day's +1.

| Person | Profile | Approved leave and adjustments | Expected |
|---|---|---|---|
| Calista | `accrualStart` 2027-02-01, opening 0 | annual leave Tue 12 – Thu 14 Jan 2027 (3 days) | B(2027-01-31) = −3; B(2027-02-01) = −2; no lapse; B(2027-03-01) = −1 |
| Audrey | `accrualStart` 2026-01-01, opening 6 | annual leave Thu 24 Dec 2026 (1 day, cuti bersama is a working day); Mon 4 – Wed 6 Jan 2027 (2 days: 5 Jan is a holiday); morning half Fri 5 Feb 2027 (0.5) | B(2026-12-31) = 5; B(2027-01-06) = 4; lapseWarning on 2027-02-10 = 2.5; B(2027-02-28) = 4.5; lapse 2.5 on 1 Mar; B(2027-03-01) = 3 |
| Gregory | `accrualStart` 2020-01-01, opening 10 | adjustment −5 on 2027-01-20; annual leave Thu 25 Feb – Tue 2 Mar 2027 (4 days: two lines, 2 on 25 Feb and 2 on 1 Mar) | B(2027-02-28) = 5; lapse 3 on 1 Mar; B(2027-03-01) = 1 |

## Who sees what (every route)

- No ID token, a bad one or a revoked one: 401 "Sign in again." Flag off: 404.
- A signed-in, active person: their own profile, summary, ledger, requests (`GET /api/leave/me`), ask
  (`POST /api/leave/requests`) and cancel (`POST /api/leave/requests/{id}/cancel`).
- An admin also: everyone (`GET /api/leave/team`), one person (`GET /api/leave/people/{email}`), decide
  (`POST /api/leave/requests/{id}/decide`), ask for someone (`POST /api/leave/requests` with `email`, approved at once),
  adjust (`POST /api/leave/adjustments`), leave details (`PUT /api/leave/profiles/{email}`), holidays
  (`POST`/`DELETE /api/leave/holidays/{date}`). Anyone else gets 403 on these.
- Phase 2: any signed-in active person, `GET /api/leave/away?from&to` (at most 62 days): `[{ name, date, part, from?, to? }]`
  (`part`: `day`, `morning`, `afternoon` or `hours` with the times) for approved requests of everyone with a profile,
  plus the caller's own waiting ones marked `waiting: true`. Never the type, reason, note or a balance.
- A person with no profile sees the "not set up" state; an admin with no profile still has the Team view.

## Rules for each action

- **Ask:** checks dates, overlap and the type table on the server (the same pure checks the form uses). An admin's
  own request, or an admin asking for someone, is saved `approved` with `pay` from the table ("something else": the
  admin picks in the same form). Others are `waiting`.
- **Cancel:** the person, while `waiting`, or while `approved` and its start is after today. An admin: any waiting or
  approved request, any time (a rejected one stays "Not approved", R1). Sets `cancelled`, `cancelledBy`, `cancelledAt`. Every state change runs in a transaction that checks
  the current status, so a double tap or two admins can't apply twice.
- **Decide:** admin only, `waiting` only. Approve sets `pay` (asks for it on "something else"); reject needs a
  reason (1–300 characters).
- **Adjust:** admin only; days non-zero in steps of 0.5 between −30 and 30; reason 1–300 characters; date defaults
  to today and can't be before the person's `openingDate` (the ledger starts there; R1).
- **Leave details:** admin only. `accrualStart` must be a 1st; `openingDate` ≥ `joinDate`; `endDate` ≥ `joinDate`.
  Setting `endDate` is refused while the person has waiting or approved requests with days after it: "Cancel
  Audrey's 2 requests after Fri 29 Jan first." Every changed field writes a `leaveAudit` row. History shows
  "Details changed by Gregory" above the change, for example "Monthly +1 starts 1 Feb 2027 → 1 Jan 2027".
- **Holidays:** admin only; add (date, name 1–60 characters) or remove. The sheet says "Changing a holiday recounts
  every request on that day."
- **Setup script** `npm run leave:setup -- <file.json> [--apply]` (pattern of `scripts/people.mjs`, dry run by
  default): the file lists `{ email, joinDate, accrualStart, openingBalance, openingDate }`; it refuses an email without
  an active `people` record and prints old → new per person. `npm run leave:setup -- --holidays [--apply]` writes
  `lib/leaveHolidays.json` (the seed, with its source in a `source` field) the same way.

## Notifications (existing Web Push)

| When | To | Title | Body | Opens |
|---|---|---|---|---|
| Someone asks (not an admin) | each admin | `Leave request` | `Audrey: Annual leave, Mon 12 – Wed 14 Jan (3 days)` | `/leave?view=team&request=<id>` |
| Decided | the person | `Annual leave approved` / `Annual leave not approved` | the dates, then the reason when rejected | `/leave?request=<id>` |
| An approved request is cancelled by its person | each admin | `Audrey cancelled leave` | type and dates | `/leave?view=team&person=<email>` |
| An admin asks for someone | that person | `Gregory added leave for you` | type and dates | `/leave?request=<id>` |
| An admin cancels someone's waiting or approved request | that person | `Gregory cancelled your leave` | type and dates | `/leave?request=<id>` |
| An admin adjusts someone's balance | that person | `Your leave balance changed` | `+1.5 days: <reason>` | `/leave?view=history` |
| 09:00 weekday summary | each admin with waiting requests | the summary gains a line `Leave: 2 waiting for you` (and is sent for that line alone, title `2 leave requests waiting`) | | `/leave?view=team` |

A person cancelling their own waiting request sends nothing. Never a push to the person who made the change.
Every link opens the thing in its current state: a request already decided or cancelled opens its sheet showing that
(`Cancelled by Audrey, Mon 11 Jan`); an id that no longer exists or isn't yours opens the page with the toast `That
request isn't available`. With `leaveEnabled()` off, the morning summary has no leave line. Name and type words follow guide 7; dates as guide 7 (`Mon 12 Jan`).
A failed push never fails the save.

## Screens

The screens page `docs/implementation/leave-screens.html` (built only from the guide's parts; the owner
chose no separate approval, 2026-11-23) shows every frame below at 390 and 1280 wide, built only from parts in
`redesign/design/design-guide.md`. Where it and this list differ, the page wins on looks and this brief on rules.

1. **Entry:** `Leave` in the side bar (after Flows) and in More with the blurb `Your balance and leave requests`,
   icon `pause`. An admin sees a count of waiting requests on both.
2. **Signed out:** `/leave` shows a notice "Sign in to see your leave" with **Sign in**
   (`/sign-in?next=<the full path and query>`, so a push link survives signing in). **Not set up:** "Your leave isn't
   set up yet. Ask Gregory." (the first admin's name). Also loading, offline (`Leave needs a connection`), empty
   (`No requests yet`), and a failed load with **Try again**.
3. **Balance card:** big balance (`8 days`, `0.5 day`, `−2 days`), rows Coming up · Waiting · **Available**, `Next +1 on
   Fri 1 Jan`, and when they apply: the lapse warning `2 days from 2026 lapse after Sun 28 Feb` and, below zero,
   `Below zero is leave taken in advance. If you leave DEUS, it is deducted from your final pay.`
   **Ask for leave** button.
4. **Requests / History** (segmented): Requests lists waiting and upcoming first, then past, each row with type,
   dates, days and a status pill (Waiting, Approved, Not approved, Cancelled). History is the ledger, newest first,
   with each line's days and the running balance.
5. **Request sheet** (`?request=<id>`): type, reason, dates, days, note, status with who and when, reject reason, and
   **Cancel request** when allowed (confirm dialog).
6. **Ask for leave sheet:** type (segmented: Annual leave · Sick · Other absence); for Other absence a reason select
   and, for special leave or leave by law, an event select (special leave shows `Up to 3 days`); From and To dates;
   for one-day annual leave, Full day · Morning · Afternoon; for A few hours, From and To times; Note (required for
   Something else). Live line: `3 working days · Available after: 5 days` (or `−1 day, taken in advance`). Every
   refusal from **Counting days** and **Types** shows on the field. **Send request** with its busy state and a failed
   send (the sheet stays filled, notice `Not sent. Check your connection and try again.`); the toast says
   `Sent to Gregory` (an admin's own: `Added`).
7. **Admin, Team view** (segmented Mine · Team, admins only; `?view=team`): **Waiting for you** cards (who, type,
   dates, days, available after, `Also away: Sovie (Tue)`, `Waiting 2 days`, note) with **Approve** and **Reject**
   (reject asks a reason; "something else" asks Paid · From annual leave · Unpaid). Then the **People** table: name,
   balance, available, annual leave taken this year, sick days this year, other absences this year (count); people
   with a past last day at the bottom, muted, `Left Fri 29 Jan`. Phones show each person as a row with balance and
   available, the rest on their page.
8. **Person sheet** (`?person=<email>`): their balance card, **Add leave** (the ask sheet with this person),
   **Adjust balance** (days ± in halves, reason), **Leave details** (join date, monthly +1 day starts, last day, opening balance and
   date), their requests and history (audit lines included).
9. **Holidays sheet** (from the Team view): the list by year, add date and name, remove.
10. **Phase 2, Plan:** Month cells list `Away: Audrey, Sovie ½, Thania 13:00–15:00`, at most as many names as fit on
    two lines, then `+3 more` (the Day view lists everyone); the Day view shows `Away today: …`; the People view puts
    `Away 12–14 Jan` on a person's row when it's within the shown range. Your own waiting days show dashed, marked
    `Waiting`. Nothing when signed out or with the flag off.

Lengths: names up to 40 characters, notes up to 500 (cut to 2 lines in lists), reasons up to 300, holiday names up
to 60; balances up to `−99.5 days`. Every screen at 320 wide too. Counts follow guide 7 rule 5: `1 day`, `0.5 day`,
`2 days`; `1 leave request waiting`; `Waiting 1 day`; `Cancel Audrey's request after Fri 29 Jan first.`

## Requirements

| ID | Required behavior | Built / proven in |
|---|---|---|
| V1 | Only signed-in, active people reach leave data; each sees only their own; only `LEAVE_ADMINS` see everyone. | L2, L3, L5, R1 |
| V2 | A person asks for Annual leave, Sick or Other absence, sees the working days and the balance after, and can cancel within the rules. | L1, L2, L6, E1 |
| V3 | An admin approves or rejects (with a reason), picks pay for "something else", adds leave for someone, adjusts, edits leave details (audited) and holidays. | L3, L7, L8, E1 |
| V4 | The balance is opening + a +1 every 1st from each person's start (Calista from 2027-02-01) − deducted leave ± adjustments − last year's days not used by the end of February; it can go below zero. | L1, E1 |
| V5 | The right people get each push once, never for their own change, and admins see the waiting count. | L4, L7, E1 |
| V6 | The device's database never serves leave data; nothing shows until the flag is on; no test reaches production. | L2, R1 |
| V7 | Phase 2: Plan shows who is away, by name only, to signed-in people. | P1, E2 |

## Checks

Per task: `npx tsc --noEmit`, `npx eslint <changed files>`, `npm run test:unit`, plus `npm run test:data` when the
task touches Firestore. Browser work: only the specs the task adds or edits (`tests/smoke/leave.spec.ts`,
`tests/smoke/leave-admin.spec.ts`, `tests/smoke/plan.spec.ts` for P1), plus `tests/smoke/shell.spec.ts` for the task
that adds the Leave entry. Specs sign in on the auth emulator the way `tests/smoke/sign-in.spec.ts` does, and pin
the day with `LEAVE_TEST_DATE`. Run one test stack at a time and stop only the PIDs you started. After a failure,
rerun only the failed tests. The full suite, a11y and compare run once per phase (R1a, E2).

Record each task's evidence (commands, counts) in `docs/implementation/leave-results.md` under its ID, and tick only
the task's row in the plan. Never call a push service or production from a task.

## L1 — Leave rules

Adds the pure rules every other task uses: counting days, checking a request, and the ledger. [no look]
Read **Data**, **Types**, **Counting days** and **The ledger**; `lib/dates.ts`, `lib/followupServer.ts`
(`wibToday`), guide 7 (Rules, Words used in the interface).
- `lib/leave.ts`: types, the special and law event lists with labels and caps, `workingDays(start, end, holidays)`,
  `checkRequest(input, { today, holidays, existing, isAdmin })` returning the field and message of every refusal,
  and the words (type labels, status labels, `days` with `0.5 day` / `1 day` / `−2 days`, date ranges).
- `lib/leaveLedger.ts`: `buildLedger` and the summary exactly as **The ledger**.

Done when:
- Unit tests assert every number in **The ledger**'s worked example, exactly.
- They also cover: a weekend and a holiday inside a range; New Year and 28 Feb → 1 Mar splits; opening on a 1st (no
  extra +1 that day); an opening on 2027-01-15 with `openingCarried` 3 (lapse counts only debits from that day);
  `endDate` stopping +1s and lapses; the lapse with nothing used, all used, a negative 31 Dec balance, and a positive
  adjustment in January (it isn't lapsed); 29 February in 2028; `available` with upcoming and waiting; a request that
  a new holiday turns to 0 days; every refusal in **Counting days** and **Types**, including a special-leave cap
  counted in working days; the singular and plural words.

## L2 — Server: reading and asking

Lets a signed-in person read their leave and ask for or cancel it, with everything closed to the device. [no look]
Read **Smallest design**, **Data**, **Who sees what**, **Rules for each action** (Ask, Cancel); `lib/admin.ts`,
`lib/push.server.ts` (`pushIdentity`), `app/api/notify/assigned/route.ts` (token handling), `lib/flags.ts`,
`firestore.rules`, `app/api/notify/morning/route.ts` (`MORNING_TEST_DATE` pattern), `playwright.config.ts` env.
- `leaveEnabled()`, `leaveAdmins()` and `isLeaveAdmin(email)`; `LEAVE_TEST_DATE` read only when `USE_EMULATOR`.
- `lib/leave.server.ts`: read a profile, requests, adjustments, holidays; build the summary; create and cancel in
  transactions (overlap checked inside the transaction).
- Routes `GET /api/leave/me` (profile, summary, ledger, requests, holidays for the next 400 days, `isAdmin`,
  `waitingForMe` count for admins) and `POST /api/leave/requests`, `POST /api/leave/requests/{id}/cancel`.
- A client helper `lib/leaveClient.ts` that calls them with the ID token (as `lib/assignNotifyRequests.ts`).

Done when:
- A rules data test: the device SDK can't read or write any `leave*` collection.
- Data tests: ask (waiting), an admin's own request (approved), overlap refused even with two asks in parallel,
  cancel by the person (waiting; approved before start) and refused after start, a second cancel refused.
- Route tests: 404 with the flag off; 401 without, with a bad and with a revoked token; one person can't read or
  cancel another's request (404, not 403, so ids aren't confirmed); an admin cancelling an approved request after it
  started works.

## L3 — Server: the admin side

Gives the admin everyone's balances and the tools to decide, add, adjust and keep details and holidays. [no look]
Read **Who sees what**, **Rules for each action**; L2's files.
- Routes: `GET /api/leave/team`, `GET /api/leave/people/{email}`, `POST /api/leave/requests/{id}/decide`, asking for
  someone through `POST /api/leave/requests`, `POST /api/leave/adjustments`, `PUT /api/leave/profiles/{email}`
  (with audit rows and the last-day guard), `POST` / `DELETE /api/leave/holidays/{date}`.
- The team list: each person's summary and this year's counts (annual leave days taken up to today, sick days up to
  today, other absences up to today), with the people who left last.
- `scripts/leave-setup.mjs` and `npm run leave:setup` (**Rules for each action**, Setup script; add `leave-setup.json` to `.gitignore`), and
  `lib/leaveHolidays.json`: Indonesia's national holidays (libur nasional only, no cuti bersama) for December 2026 and
  2027, copied from the list in this brief's **Holiday seed**, with its source.

Done when:
- Data tests: the worked example's three people, set up through these routes, return its numbers from
  `/api/leave/people/{email}`; decide twice in parallel applies once; reject without a reason refused; approve "something else"
  without `pay` refused; an adjustment of 0 or 0.3 refused; a details change writes one audit row per changed field;
  the last-day guard with one and with two requests (singular and plural message); holiday add and remove changes a
  request's days in `/api/leave/people/{email}`; the Team data flags a missing next year from 1 October.
- Route tests: every admin route answers 403 to a non-admin and works for an admin with no profile.
- The script's dry run on the emulator prints old → new and writes nothing; `--apply` writes; an email without a
  `people` record is refused.

## L4 — Pushes and the morning line

Tells the right person when something needs them or has been decided. [no look]
Read **Notifications**; `lib/push.server.ts`, `lib/morningSummary.ts`, `lib/morningSummary.server.ts`, the morning
route, `lib/pushTransport.server.ts` (the fake).
- Message builders (pure, in `lib/leaveMessages.ts`) and sends from L2/L3's actions after the save commits; a failed
  push is logged, never thrown.
- The morning summary: admins with waiting requests get the `Leave: N waiting for you` line, or the summary for that
  line alone.

Done when:
- Unit tests: every row of **Notifications** builds the exact title and body, with a 40-character name and the
  longest type label within the existing 4-line body limit.
- Data tests with the fake push: each action sends to exactly the listed people, nobody gets their own change, an
  admin asking for themselves sends nothing, a failed push leaves the request saved.
- The morning data test: an admin with 2 waiting and nothing due gets one summary titled `2 leave requests waiting`,
  with 1 waiting `1 leave request waiting`; a non-admin gets no leave line; with `leaveEnabled()` off, no leave line.

## L5 — The Leave page

Gives everyone the Leave page: their balance, their requests and their history. [look]
Read screens page frames 1–5 and **Screens** 1–5; guide 3 (Side bar, More), 4.2, 4.4, 4.10, 4.11, 4.14, 4.15, 5.8,
7; `desk/areas.ts`, `desk/MoreSheet.tsx`, `desk/SideNav.tsx`, `features/sign-in/AccountEntry.tsx`, `ui/Panel.tsx`,
`ui/Segmented.tsx`, `ui/Pill.tsx`, `ui/Sheet.tsx`, `ui/Dialog.tsx`, `ui/Notice.tsx`, `ui/EmptyState.tsx`.
- The `leave` area (hidden when the flag is off), `app/(desk)/leave/page.tsx`, `features/leave/`.
- Signed out, not set up, loading, offline ("Leave needs a connection"), and empty ("No requests yet") states.
- Balance card, Requests and History, the request sheet with Cancel (confirm), the admin's count on the entry.
- `tests/smoke/leave.spec.ts`: signed out; a set-up person sees the balance the ledger gives for the pinned day;
  cancels a waiting request; the History lines and running balance.

Done when:
- The spec passes on desktop and its `@phone` tests on the phone project; `shell.spec.ts` passes. The spec also:
  signed out at `/leave?request=<id>`, signs in and lands on that request; opens a cancelled request from its link
  and sees `Cancelled by …`; opens an unknown id and sees the toast.
- A unit test: with `leaveEnabled()` off the Leave area isn't in the side bar or More and `/leave` calls
  `notFound()`.
- Screenshots at 390 and 1280 of: More and the side bar with Leave (admin with a count of 1 and of 12), signed out,
  not set up, loading, offline, empty, failed load, a balance of `8 days`, one of `0.5 day`, one of `−2 days` with
  the below-zero line, one with the lapse warning, Requests with all four statuses, History, and the request sheet
  each match the screens page (layout, words, colours).
- At 320 wide, with a 40-character name, a 500-character note, a balance of `−99.5 days` with both the lapse warning
  and the below-zero line, and the longest History line (an audit line with both dates): nothing overlaps, is cut
  mid-word or runs off the screen.

## L6 — Ask for leave

Lets a person ask for any type of leave, with the day count and balance after shown before sending. [look]
Read screens page frame 6 and **Screens** 6, **Types**, **Counting days**; guide 4.11, 4.13, 5.5; `ui/Field.tsx`,
`ui/Inputs.tsx`, `ui/SelectBox.tsx`, `ui/Segmented.tsx`, `ui/OptionChip.tsx`; L5's files.
- The sheet over `/leave` (`?ask=1`), the live line from `checkRequest` and the summary, every refusal on its field,
  the busy and failed states (guide 5.3), and the toast.
- `tests/smoke/leave.spec.ts` gains: a three-day annual leave over a weekend counts 3 days and the balance after; a
  half day; sick for yesterday; special leave over its cap refused; a few hours; overlap refused; sent request shows
  Waiting.

Done when:
- The spec's new tests pass on desktop and phone.
- Screenshots at 390 and 1280 of the sheet for each type and reason, the half-day choice, the hours fields, the
  below-zero line, the next-year holidays line, busy, a failed send, and three refusals match the screens page.
- At 320 wide every field, the live line and the Send button fit, with the longest event label.

## L7 — Admin: the Team view

Gives the admin the waiting requests to decide and everyone's balances on one screen. [look]
Read screens page frame 7 and **Screens** 7; guide 4.1, 4.10, 4.11, 5.4, 5.7; L5's files.
- Mine · Team switch for admins, Waiting for you cards with Approve, Reject (reason) and the pay choice, `Also away`,
  `Waiting N days`; the People table (phones: rows) whose rows link to `?person=<email>` (L8 builds that sheet);
  opening a card from `?view=team&request=`; the missing-holidays notice.
- `tests/smoke/leave-admin.spec.ts`: an admin approves one and rejects one with a reason; the employee's page then
  shows both; a non-admin has no Team switch and `?view=team` falls back to Mine.

Done when:
- The spec passes on desktop and phone.
- Screenshots at 390 and 1280 of the Team view with 0, 1 and 3 waiting (`Waiting 1 day` and `Waiting 3 days`), the
  reject and pay dialogs, the missing-holidays notice, and the People table with a left person match the screens page.
- At 320 wide with a 40-character name, a 500-character note and a balance of `−99.5 days`, the cards' buttons and
  the table's figures stay on screen.

## L8 — Admin: a person and the holidays

Lets the admin open one person to see everything, add leave for them, adjust, and keep details and holidays. [look]
Read screens page frames 8 and 9 and **Screens** 8–9; L7's files.
- The person sheet, Add leave (the ask sheet with the person), Adjust balance, Leave details (with the last-day
  refusal shown on the field), the audit lines in History, and the Holidays sheet.
- `leave-admin.spec.ts` gains: adjust +1.5 changes the balance; set +1 from a later 1st changes the History; add sick
  for someone; add and remove a holiday inside a waiting request changes its days.

Done when:
- The spec's new tests pass on desktop and phone.
- The spec opens `/leave?view=team&person=<email>` directly (a push link) and sees that person.
- Screenshots at 390 and 1280 of the person sheet, each of its three sheets (the last-day refusal shown), and the
  Holidays sheet match the screens page.
- At 320 wide with a 40-character name, a 60-character holiday name, a 300-character adjustment reason and the
  last-day refusal for a 40-character name: nothing overlaps, is cut mid-word or runs off the screen.

## E1 — End to end

Proves the whole story on the emulators. [no look]
- One spec plays **The ledger**'s worked example through the screens, over pinned days: Calista and Audrey ask, Gregory
  approves and adjusts, and each person's balance card and History show the worked example's numbers on 2027-01-31,
  2027-02-10 (Audrey's lapse warning), 2027-02-28 and 2027-03-01. Then a cancelled approved request returns its days.

Done when: the spec passes on desktop, asserting every number of the worked example it reaches; the results file
lists them.

## R1a — Full check run

Runs the full checks once and lists what fails, fixing nothing. [no look]
`npm run test:smoke`, `npm run a11y`, and `npm run compare` filtered to the shell states the Leave entry changes (the
prototype has no Leave screens, so Leave's looks are judged by the per-task look checks against the screens page).

Done when: each command ran once on a free machine and the results file lists every failure with its spec and test,
or says none.

## R1b — Fix recorded failures

Fixes what R1a listed, rerunning only what each fix touched. [look]

Done when: every listed failure passes on its rerun, or is written up with its reason as an R1 item; screenshots at 390
and 1280 of every screen a fix changed match the screens page.

## R1 — Phase review

Hunts for faults the per-task checks let through, fixes the quick ones and writes the owner handoff. [no look]
Look hardest at: the ledger against hand-worked balances for three people over 2026-12 to 2027-04; every route as a
non-admin and as a removed person; anything leave-related reachable through the device SDK or a page's HTML before
sign-in; pushes to the wrong person.

Done when: the review file lists each finding as FINDING lines; quick ones are fixed with their check; every other one
is an R1.F row under R1 (with its Done when and pick) or a named later task; the owner handoff lists O1–O7 with
anything new.

## P1 — Who's away in Plan

Shows who is away in Plan, by name only, to signed-in people. [look]
Read screens page frame 10 and **Screens** 10; `features/plan/MonthView.tsx`, `DayView.tsx`, `PeopleView.tsx`,
`PlanScreen.tsx`, `lib/planView.ts`.
- `GET /api/leave/away` (**Who sees what**), a `useAway(from, to)` hook, and the markers in the three views.
- `plan.spec.ts` gains: signed in, the month shows `Away: Audrey`; signed out, nothing.

Done when:
- A route test with three people away (a full day, a morning, a few hours) and the caller's own waiting day: it
  returns exactly those four entries, and each object has only `name`, `date`, `part`, `from`/`to` (hours) and
  `waiting` (own).
- A unit test: with `leaveEnabled()` off, Plan never calls the route.
- Screenshots at 390 and 1280 of the month with one and with all six people away on one day (`+N more`), the Day view
  line and a People row match the screens page; at 320 the month cell with six 40-character names shows whole names
  and `+N more`, inside its cell.

## E2 — Full check run

Runs the full checks once after Phase 2 and lists what fails, fixing nothing: as R1a, adding `plan.spec.ts`. [no look]

Done when: as R1a.

## E2b — Fix recorded failures

Fixes what E2 listed, as R1b. [look]

Done when: as R1b.

## R2 — Phase review

Reviews Phase 2 and the open items of R1, writes the handoff. [no look] Look hardest at what someone who isn't an
admin can learn about another person's leave from Plan, the route and the page's HTML.

Done when: as R1, with R2.F rows.

## Holiday seed

National holidays only (libur nasional); cuti bersama is a normal working day here (D6). Copy these into
`lib/leaveHolidays.json` with `source`: "SKB 3 Menteri 2026 (No. 1497/2/5 Tahun 2025) and 2027 (No. 1205/3/2 Tahun
2026, signed 15 Sep 2026), via setneg.go.id and aceh.kemenag.go.id, checked 2026-11-23". Islamic dates can still move
by a later decree; the admin edits them in the Holidays sheet.

```
2026-12-25 Christmas Day
2027-01-01 New Year's Day
2027-01-05 Isra Mikraj
2027-02-06 Chinese New Year
2027-03-08 Nyepi
2027-03-10 Idulfitri (day 1)
2027-03-11 Idulfitri (day 2)
2027-03-26 Good Friday
2027-03-28 Easter
2027-05-01 Labour Day
2027-05-06 Ascension of Jesus Christ
2027-05-17 Iduladha
2027-05-20 Waisak
2027-06-01 Pancasila Day
2027-06-06 Islamic New Year
2027-08-15 Maulid Nabi
2027-08-17 Independence Day
2027-12-25 Christmas Day
2027-12-26 Isra Mikraj
```
