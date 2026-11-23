# Leave (Cuti) — Product Plan

**Status:** decided 2026-11-23 (owner decisions below), red-teamed once (Fable 5.2 High; last section). Built by the
implementation plan `docs/IMPLEMENTATION_PLAN.md`; where the two differ, the plan's brief wins. Legal points
are marked *(verify)*: check them with whoever handles HR/contracts before go-live.

## What the owner asked

> Admin view (me) sees everyone's remaining cuti and history of cuti, izin etc. The team mengajukan cuti when logged
> in: types Leave, Sick, Miscellaneous Absence; they see their own history and balance. Maybe a team calendar of who
> is cuti this month, without seeing each other's balances. Hutang cuti (balance goes minus). +1 cuti every 1st of the
> month, except Calista (probation) who starts +1 on 1 February 2027.

What won't change: tasks, groups, companies, the chat connector and the existing sign-in flow keep working as today.

## Who sees what

| | Admin (Gregory) | Employee (signed in) | Not signed in |
|---|---|---|---|
| Own balance, own requests and history | yes | yes | no: the Leave page shows "Sign in to see your leave" → `/sign-in?next=/leave` |
| Ask for / cancel own leave | yes | yes | no |
| Everyone's balances, history, sick and izin records | yes | no | no |
| Approve, reject, add for someone, adjust a balance | yes | no | no |
| Who is away which day (Phase 2) | yes, with type | yes, as "Away" only (sick is health information) | no |

- **Admin is decided on the server** from a fixed list (`LEAVE_ADMINS`, today only Gregory), never from anything the
  device sends.
- **All leave data is server-only** (read and written by the server with the Admin SDK; `firestore.rules` already
  denies collections it doesn't name). The task database is still open to anyone with the app, so leave data must
  never sit where the device reads it directly.
- **No health documents are stored.** Doctor's notes stay where they're sent today (WhatsApp, email); the admin ticks
  "note seen" on the request. This keeps the app out of holding specific personal data under UU PDP.
- **Everyone who takes leave needs a sign-in.** Today only Gregory and Audrey have `people` records. Every employee
  gets one (`npm run people:add`) before launch: a launch step, not new code.

## Request types

| Type | Takes days from the balance? | Rules |
|---|---|---|
| **Annual leave (Cuti)** | yes | Full day or half day (morning / afternoon). |
| **Sick (Sakit)** | no, with a doctor's note | Past dates allowed. Full or half day. Without a note, the admin decides at approval: paid sick, deduct from cuti, or unpaid (D7). |
| **Miscellaneous absence (Izin)** | depends on the reason | Reasons below. |

Izin reasons:
- **Special paid leave set by law** — never deducted, never unpaid, days fixed *(verify)*: own marriage 3; child's
  marriage, circumcision or baptism 2; wife giving birth or miscarrying 2 (UU 4/2024 may add up to 3 more); death of
  spouse, parent, in-law or child 2; death of a household member 1. The form fills in the days; the admin can't
  change the outcome.
- **Other statutory leave** — not deducted, days set by the admin: maternity (3 months), miscarriage (1.5 months),
  menstrual leave, religious obligation (haji/umroh as the contract allows).
- **A few hours** (arriving late, leaving early) — times instead of days; recorded and counted, never deducted.
- **Unpaid leave** — not deducted, marked unpaid.
- **Other** — the admin picks at approval: paid, deduct from cuti, or unpaid.

## Counting days

- Only **working days** count: Monday–Friday (D9), minus **public holidays** from a holiday list the admin keeps
  (seeded for 2026 and 2027; editable any time because the government revises it mid-year).
- **When the holiday list changes**, every request that touches that day is recounted and its ledger line corrected
  with a note; the people affected get a push.
- **Cuti bersama** (collective leave days): if the company deducts them (D6), each one adds a −1 line for every
  employee on that day, even past the debt limit (it isn't a request). Someone who works that day gets it back by an
  admin adjustment.
- A half day counts 0.5. A person can't have two requests covering the same day.

## Balance rules

The balance is a **ledger**: every change is a dated line and the balance is their sum. Lines are never edited;
corrections are new lines.

| Line | Date of the line |
|---|---|
| **Opening balance**, entered once per person at go-live from current records; it covers everything up to and including the go-live month | go-live day |
| **+1 accrual** on every 1st of the month (Jakarta) from the person's accrual start to their end date, starting the first 1st after go-live | that 1st |
| **−days** for approved cuti, one line per leave day's month (so a leave over New Year splits across the years) | the leave days |
| **±days** admin adjustment, reason required | the day it's made |
| **−days** year-end lapse above the carry-over cap (D5), applied on 31 December before the 1 January +1 | 31 Dec |

- **Accrual start per person.** Default: the 1st of the month after probation ends. Calista: **2027-02-01**
  (D1: confirm her join date; probation is allowed only on a permanent contract and lasts at most 3 months
  *(verify)*). The person record holds join date, accrual start and end date, so the next hire is data, not code.
- **No monthly job to miss.** The +1 lines are worked out from the dates whenever a balance is shown, so a failed cron
  can't skip a month and a retry can't add one twice. Changing someone's accrual start or end date writes an audit line
  (old → new) because it changes past +1 lines.
- **What the employee sees:** "Balance today 8 · approved upcoming 2 · pending 1 · **available 5**".
- **Booking ahead:** the debt check uses the **projected balance on the leave's first day** (today's balance plus the
  +1s until then, minus everything approved or pending) (D3b). So asking in November for March leave counts the
  December–March accruals.
- **Hutang cuti (debt):** the form warns "This takes you to −2". Below the limit (default **−3**, one setting for
  everyone, D3) the form can't be sent; the employee asks the admin, who can still add it. Later +1s pay it back.
  Recovering debt from final pay needs a written basis in the contract and is capped by law *(verify)*, which is why
  the limit is small.
- **Long unpaid leave** doesn't stop accrual on its own; the admin pauses it with an adjustment if the contract says so.

## Flow

1. Employee opens **Leave**, picks type and dates, sees the working days counted and the available balance after, and
   sends it. Status **Pending**. To change it: cancel and ask again.
2. Admin gets a push ("Audrey asks cuti 12–14 Jan, 3 days, available after: 5") and the Leave item shows a count badge
   in the app (push only reaches an iPhone with the app on its Home Screen). The pending list shows who else is away
   those days and how many days the request has waited. Pending requests also appear in the admin's 09:00 summary.
3. Admin **approves** or **rejects** (reason required on reject). The employee gets a push and sees it in the app.
4. Employee can **cancel** while pending, or an approved request before it starts (the admin is told). After it
   starts, only the admin changes it.
5. **Sick during cuti:** the employee asks the admin to convert those days (with a doctor's note seen); the cuti days
   come back.
6. Admin can **add a request for someone** (sick call by phone, forgotten cuti), any dates, approved at once.
7. **Gregory's own requests** are approved at once and logged like any other.
8. **Someone leaves:** the admin sets their end date. Accrual stops, approved leave after it is cancelled, and the
   admin sees the final balance: positive unused days must be paid out *(verify)*; a negative balance is recovered
   only as the contract allows. `people:remove` ends their sign-in (it exists today). Payroll itself is out of scope.

## Screens (built from the existing design guide; gaps go to the studio)

- **Leave** (side bar and More), employee view: balance card (today, upcoming, pending, available, next +1 date),
  **Ask for leave**, my requests (upcoming first, then past, with type and status).
- **Leave**, admin view adds: **Pending** on top; **People** table (name, balance, available, cuti taken this year,
  sick days this year, izin this year); a person's page with the full ledger and requests, **Adjust balance**, accrual
  dates; **Holidays** list. The debt limit and carry-over cap are config values, not a settings screen.

## Phases

**Phase 1 — Requests and balances** (the minimum to stop tracking cuti by hand): person leave profiles, opening
balances, holiday list, the three types with their reasons, ask / approve / reject / cancel, the ledger with worked-out
accruals and year-end lapse, employee and admin views, push and badge, every employee signed in.

**Phase 2 — Who's away:** approved leave shows as "Away" (half days marked) in **Plan**'s existing Month and People
views for signed-in people, which also helps when giving someone a task; your own pending ones show dashed. Signed
out, Plan shows no leave. No new calendar.

**Not planned** (follow-ups to pick): CSV export for payroll, a second or stand-in approver, chat tools ("who's off
next week"), approved leave on the team Google Calendar, doctor's note upload, WFH and overtime tracking.

## Owner decisions (2026-11-23)

| # | Question | Answer |
|---|---|---|
| D1 | Team | Gregory (admin), Audrey (has a sign-in), Calista, `sovie.magdalena@`, `thania.ferdinanto@`, `william.ang@deushcs.com`. Calista's email, join dates and today's balances come later (an owner step at go-live) |
| D2 | Gregory accrues and takes leave in the system | Yes, his own requests are approved at once |
| D3 | Debt limit | **None.** Any balance can go below zero; whatever is below zero when someone leaves is deducted from their final pay *(verify the contract allows it)* |
| D4 | Calista asks for leave before 2027-02-01 | Yes, like anyone (it goes below zero) |
| D5 | Carry-over | Unused days of a year can be used until the end of February; what's left of them lapses (hangus) on 1 March |
| D6 | Cuti bersama | Optional: a normal working day. Whoever takes it asks for annual leave. Not in the holiday list |
| D7 | Sick without a doctor's note | Later. Until then sick days never touch the balance |
| D8 | Half days | Annual leave only |
| D9 | Work week | Monday–Friday |
| D10 | What the team sees | "Away" only |
| D11 | Past records | Start from opening balances |

**What the answers change above:** no debt limit and no limit check (the form still shows the balance after); the
year-end line becomes a 1 March lapse of last year's unused days; cuti bersama are not deducted automatically; sick has
no paid/unpaid choice yet; half days only for annual leave. The implementation plan (`docs/IMPLEMENTATION_PLAN.md`
and its brief `docs/implementation/leave.md`) is the detailed, current version of these rules.

## Red-team findings and what changed

Fable 5.2 High, 2026-11-23 (one call, $0.44). Every point was taken unless it says declined.

| Finding | Change |
|---|---|
| Statutory special leave isn't the admin's choice; list incomplete | Fixed, never-deducted reasons with the days filled in; miscarriage and household death added |
| Unused cuti must be paid out on leaving | Leaving flow says so; carry-over (D5) marked as a money rule; contradictory default fixed |
| Debt recovery from final pay is limited | Debt limit kept small, contract basis noted, per-person override dropped |
| Default accrual start contradicted the Calista rule | Default is now "after probation"; D1 asks for her dates |
| Sick without a note isn't automatically paid | D7 and an admin outcome for note-less sick days |
| Monday–Friday assumed; holiday list treated as fixed | D9; holiday edits recount affected requests |
| Balance "as of when" for future bookings | Projected balance on the leave's first day (D3b); deductions dated on the leave days |
| Cuti bersama edge cases, holiday changes after approval | Rules under Counting days |
| Maternity, miscarriage, menstrual, haji, hours-long izin missing | Added as izin reasons, never deducted |
| Approver away; iPhone push needs Home Screen app | Badge, waiting time, 09:00 summary line. A stand-in approver is a follow-up (small team) |
| Doctor's notes are health data (UU PDP) | Upload dropped; admin ticks "note seen" |
| Ledger edges (go-live on a 1st, Jan 1 order, accrual date edits, leavers, sick during cuti) | Each has a rule above |
| Not needed: Google Calendar sync, note upload, per-person override, settings screen, CSV export, overlap warning | All dropped or moved to follow-ups; who else is away already shows in the pending list |
