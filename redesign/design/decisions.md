# Decisions

## D-001 — Which job the directions show (2026-10-20)
`priorities.md` marks about 25 jobs as daily but doesn't rank them. The directions show **"start the day: see what needs me today and act on it"**, which brings together the daily task jobs: W1 capture, W5 mark done, W12 three kinds of work, W13 deadline and last-action urgency, D4 everything active today, D7 deadlines and events together, and A4 getting anywhere in one or two steps.
**Owner to confirm.** If another job should come first (for example the companies pipeline, B2/B6–B10), the directions can be redone around it.

## D-002 — Round 1 rejected (2026-10-20)
Owner's verdict on A (Calm list), B (Command) and C (Day strip): "too boring", "doesn't look visually as nice". None was closest.
What was missing (the owner picked all four): **richer colour** (colour across larger areas), **depth and layers** (floating surfaces, soft shadows, frosted glass), **a standout moment** on each screen, and **softer, rounder shapes**.
Round 1 moved to `round-1/` for the record. Round 2 starts fresh as D, E and F, all built on those four ingredients and still within the brief (modern sans-serif, light, polished, not gimmicky).

## D-003 — Direction choice: a mix of D and F (2026-10-20)
Round 2 (D Glass, E Tide, F Bento) was shown. The owner asked for the designer's view. The designer recommended D as the base, because it sorts tasks by urgency, its side bar scales to every area and task groups, and its colour stays out of the content's way. The recommendation also replaced D's progress ring with F's two-week deadline chart, because the chart answers a daily question (where is the crunch?, D1).
Owner: agreed ("Sure"), adding that **D's purple is "way too striking"**. Owner picked a **calm blue** accent (#2F6BEA) over a pale sky-and-aqua backdrop, with the hero turned into a light frosted card.
Mix built as `directions/g-glass-blue/`. This is the one extra screenshot round a mix gets; the next step is the owner's approval of G.

## D-004 — Mix G approved (2026-10-20)
Owner: "Perfect! Approved." **G, Glass in calm blue** (`directions/g-glass-blue/`) is the direction for the prototype.
Note: the `desktop.png` and `phone.png` in that folder were taken before a layout fix (a clashing class name pushed the content below the fold). The approval is recorded as given; a fresh `./shoot` of G would bring the screenshots up to date.
Still open: D-001 (whether "Today" is the #1 daily job). The prototype covers every job, so this only affects which screen comes first.

## D-005 — Which generic states apply (2026-10-20)
The process lists states for every screen. Some don't fit this product, so they are recorded here instead of being designed:
- **Restricted** and **shared-link visitor**: not applicable. Nobody signs in and everyone can see and change everything (brief, inventory).
- **Read-only**: only external events (D9). Shown with a "Read only" mark on the calendar.
- **Dark mode**: not designed. The brief says light mode only, at every step.
- **Bulk selection**: no job story asked for it. The owner decided to add it for tasks; see D-008.

## D-006 — Group 1: Today and tasks (2026-10-20)
- The Today list is called **"Needs attention"** instead of the direction's "Your tasks": with no sign-in there is no "you". It shows overdue, due in the next 3 days, under way today, and tasks that need a date (D3), each capped at 6 with a link to the full list.
- Deadlines show **days remaining** ("In 5 days", "2 days late"), with the date on hover, because W13 asks for days remaining. Within 3 days or missed is amber or red.
- Last action: under 7 days is plain, 7 to 13 days is amber, 14 or more is red ("No action for 15 days"), matching "going cold" (B6).
- Phones: task groups sit in a scrolling row of chips under the Tasks title, so any group is two taps away (A4). Plan, notes, past clients and flows are under More, as in the direction.
- The task details panel (drawer on large screens, bottom sheet on phones) starts short for quick capture (W1) and opens out with "Add details". For company tasks it says that the deadline and last action stay in step with the company (B12) and links to the company (B13).

## D-007 — D-001 settled (2026-10-20)
Owner confirmed **"Today" is the #1 daily job**. The prototype opens on Today (`prototype/index.html`).

## D-008 — Selecting several tasks (2026-10-20)
Owner: yes to selecting several tasks at once. Working job story, until the owner adds it to the inventory or `needs.md` on their side: *When several tasks need the same change, I want to select them together and mark them done, move them to a task group, or delete them, so that tidying up doesn't take one task at a time.*
Design, on the All tasks screen and inside a task group:
- A **Select** button in the toolbar turns the done circles into checkboxes. Tapping a row selects it instead of opening it. Esc or the close button stops selecting.
- A floating bar shows the count and **Mark done** (or **Mark not done** among finished tasks), **Move to group** and **Delete**. On phones it replaces the tab bar.
- **Select all** reaches every task matching the current filters, not only the ones on screen ("All 1,579 selected").
- **Move to group** applies only to internal work. Company tasks in the selection stay with their companies, and the menu says so. A new group can be created from the menu, and the tasks move straight into it.
- **Delete** asks first ("Delete 3 tasks?"). Mark done, mark not done and move can be undone from the confirmation message.


## D-009 — Group 2: Plan (2026-10-20)
Plan has four views, switched at the top: **Timeline** (opens first; D1, D7, D8), **Month** (D5, D7), **Day** (D4, D5) and **People** (D6). A second switch shows **tasks and events**, **tasks only** or **events only** (D8). Work and Person filters narrow every view (D2). Any task opens its details panel, and the circle marks it done (D11).
- **Timeline:** four weeks, stepping two weeks at a time. One row per responsible person, or per kind of work. A task with several responsible people shows in each of their rows. Bars run from start to deadline. A task with only a deadline is a diamond. A task with no deadline fades out to the right. A missed deadline gets a red edge.
- **Crunches and gaps (D1):** the busiest days (at least 2 deadlines, well above the average) are tinted amber across the whole timeline. Chips above it name the busiest day, the longest quiet stretch of weekdays, overdue tasks that ended before the range, and how many tasks have no dates (D3, linking to All tasks). A person's row says when 4 or more of their tasks run at once.
- **Busy rows:** each row shows 4 lines of bars, then "Show n more", so one busy person can't push everyone else off screen.
- **Events (D7–D9):** one read-only "Team calendar" row with a count per day, not bars, so task rows stay readable. In events only, each day lists start times ("Day" for all-day events). Any day opens the Day view, where each event has its time and a link to the team calendar. When the calendar isn't set up or fails, that row (and the Day view) says so, and tasks carry on (D10).
- **Day (D4, D5):** the first look lands on today if anything is happening; otherwise on the next day with something, with a note and "Show today". A week strip and a date picker reach any date. Tasks are split into deadline, starting and under way, each with responsible people, informed people with their notes, and key points.
- **People (D6):** everyone is ranked by how much they own. A bar shows owned (solid) against kept informed (outlined), next to a two-week deadline strip. A person's page splits "Responsible for" from "Kept informed on", showing their part (the note) on each task.
- **Phones:** the timeline scrolls sideways and starts at today's column, with the avatars pinned on the left. The month shows dots per day, and tapping a day lists it underneath. The Day and People views stack.
- Today's two-week chart and its "Who's carrying what" panel now open Plan (the day, or the person).
- Mock data gained a few tasks and events, and one person with no tasks (Joko Susanto), for the "person with no tasks" state.

## D-010 — Group 2 approved (2026-10-20)
Owner looked at the Plan screenshots (`shots/05` to `shots/12`) and said "Awesome, u may continue on". Recorded as approval of group 2 (Plan, D-009). Group 3 started in the same session.

## D-011 — Group 3: companies, fields and options (2026-10-20)
Companies has its own page (`prototype/companies.html`), reached from the side bar and the phone tab bar.
- **Four groups (B2)**, named in the interface **To approach** (not contacted yet), **Active** (prospects we're working), **Deal done** (our clients) and **No or not now** (on hold or rejected). They sit as four tiles at the top, each with its size. A company is in exactly one group. Setting an Active company's status to **Deal done** moves it to Deal done. "No or not now" has an **Answer** field (Not now / No) to tell on hold from rejected.
- **Where to act (B6, B7)**, on Active only: four counts of the whole, which are gone cold (no contact for 14+ days), waiting on our follow-up (status Follow-up due), high priority, and target date close (3 days) or missed. Tapping one filters the list.
- **Urgency:** last action turns amber at 7 days and red at 14 ("gone cold"), on Active and Deal done, as for tasks. Target date within 3 days is amber, and missed is red. A missed planned outreach is amber. The record repeats these as a short notice at the top.
- **One detail, one step (B10):** every cell in the list and every field in the record opens a small editor in place (options, date with quick picks, or text). The record has no Save button: each change saves on its own, with Undo in the message. Tasks keep their Save button, because a task is written in one go.
- **Kept in step (B12):** changing a company's last action or target date updates the deadline and last action of its open tasks (finished tasks keep theirs), and the message says how many changed. Saving those dates on a company task updates the company, and through it the other open tasks.
- **Follow-up task (B11):** one tap, from the record or the row menu. It's created straight away as "Follow up with <company>": type Follow-up, deadline = target date, last action = the company's, key points = next actions, and high priority if the company is. The confirmation offers "Open". If it can't be created, the message says so and offers "Try again".
- **Moving (B5):** a dialog shows what's carried over, then asks for what the new group's list shows (for example Answer, Reason and Revisit after for No or not now). It also says when tasks switch between prospect and client work. Undo is in the confirmation.
- **Find and order (B8, B9):** search covers name, contact person, source and products, plus industry and notes in To approach, and the reason in No or not now. If nothing matches in this group, it points to matches in other groups. Filters cover status, priority and product, where the group has them. Sorting works on any field, either way round, with empty values always last. The default is the most recent action first. To approach has no actions yet, so it opens on the soonest planned outreach.
- **Fields per group (C1, C2):** a Fields sheet per group. A switch per field controls whether the list shows it, and export uses the same fields. Fields can be renamed, and own fields added (short text, long text, number, date, choice) or removed. Every field of a group stays in the record, whatever the list shows.
- **Options (C3):** add with a colour, rename (every company follows, and the message says how many), recolour, and remove (with a confirmation saying how many companies it's cleared from). **Deal done** and **Follow-up due** can't be renamed or removed, only recoloured. "Clear" in any choice editor clears one company's choice.
- **Export (E1):** the companies shown now (filters and order), with the fields the list shows, as a .csv file. It downloads for real in the prototype.
- **Mock data:** 34 companies across the four groups, three own fields (Region, Deal size, Revisit after) and Products as options. Stress data has 3,200 companies, 23 statuses, 31 products, 9 more own fields on Active (22 fields shown, so the list scrolls sideways with the company name pinned), names in several scripts, and many empty fields.

**Owner to confirm** (proposals, not adopted silently):
1. **Deleting a company (B14):** its tasks stay, as internal work, and its qualification notes stay, without a company. The inventory doesn't say what happens to them. The alternative is deleting them with the company.
2. **Products as a managed list:** C3 names status, type, priority and own choice fields. Products are designed as a list of options too (several per company, managed the same way), so the product filter and export stay clean. The alternative is free text.
3. **"Fields that matter for each group" (C2)** is read as "what the group's list shows (and exports)", while every field stays in the record. The alternative is hiding fields from the record as well.
