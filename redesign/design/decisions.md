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
- **Bulk selection**: no job story asks for it, so it isn't built. **Owner to decide:** should tasks support selecting several at once (to mark done, move to a group, or delete)? If yes, it gets a job story in `needs.md` and is designed then.

## D-006 — Group 1: Today and tasks (2026-10-20)
- The Today list is called **"Needs attention"** instead of the direction's "Your tasks": with no sign-in there is no "you". It shows overdue, due in the next 3 days, under way today, and tasks that need a date (D3), each capped at 6 with a link to the full list.
- Deadlines show **days remaining** ("In 5 days", "2 days late"), with the date on hover, because W13 asks for days remaining. Within 3 days or missed is amber or red.
- Last action: under 7 days is plain, 7 to 13 days is amber, 14 or more is red ("No action for 15 days"), matching "going cold" (B6).
- Phones: task groups sit in a scrolling row of chips under the Tasks title, so any group is two taps away (A4). Plan, notes, past clients and flows are under More, as in the direction.
- The task details panel (drawer on large screens, bottom sheet on phones) starts short for quick capture (W1) and opens out with "Add details". For company tasks it says that the deadline and last action stay in step with the company (B12) and links to the company (B13).

## D-007 — Open question carried forward (2026-10-20)
D-001 is still open: whether "Today" is the #1 daily job. It only affects which screen opens first.

