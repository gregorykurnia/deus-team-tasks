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

## D-012 — Owner's answers to D-011 (2026-10-20)
1. **Deleting a company:** confirmed as designed. Its tasks stay, as internal work, and its qualification notes stay, without a company.
2. **Products are free text**, not a managed list. Several products are written with commas between them ("Fleet tracking, Analytics"). The Product filter lists the products already written in the group, most used first, and ignores case and spacing, so "point of sale " and "Point of sale" are one product. Search and export use the text as written. This replaces the Products option list in D-011, and the stress data now has free-text products.
3. **Fields per group:** the owner took the designer's recommendation. The switches control what the list shows (and exports), and every field stays in the record.

## D-013 — Group 3 approved (2026-10-20)
Owner: "The review is alr good to go. Can we continue to the next". Recorded as approval of group 3 (companies, fields and options, export; D-011, D-012). Group 4 started in the same session.

## D-014 — Group 4: qualification notes (2026-10-20)
Qualification notes has its own page (`prototype/notes.html`), from the side bar and, on phones, from More.
- **Layout:** on large screens, the prospects are listed on the left and one prospect's notes open on the right, like a document. On phones, the list comes first and a prospect's notes open full screen, with "All notes" to go back.
- **Nine fixed headings (U1)** run down the page in the inventory's order, each with a short prompt while empty. A small row of ticks says "6 of 9 headings written", so every prospect is assessed the same way.
- **Likelihood (U2):** a five-step picker (Very high to Low), shown everywhere as a small signal meter with its word. Above the list, "How likely" shows every prospect as one bar in shades of blue, with a count per step and "Not rated". Tapping a step shows only those prospects. The shades are calm blues, not red and green, so a low rating reads as information rather than an alarm.
- **Remarks (U3):** a separate section below the headings. Once longer than a few lines, it folds to three lines with "Show all remarks · 240 words". Remarks never show in the list.
- **Saving (U4):** saves 0.8 seconds after typing stops, and straight away when you leave a field. A quiet "Saving…" changes to "Saved" at the top. With no connection, writing carries on and the sign reads "Kept on this device. Saves when you're back online." That's a commitment for the rebuild: text typed offline is kept on the device until it can be saved.
- **From a company and back (U5):** the company record (and its row menu) has "Qualification notes", or "Start qualification notes" when there are none yet. One tap opens them, or starts them. The notes show the company's group and "Open company". A company can't get a second set: pickers mark companies that already have notes.
- **Not tracked yet (U6):** "New notes" asks whether they're for a tracked company or someone not tracked yet. The latter needs a name, and nothing else. These notes say "Not tracked yet" and offer "Link to a tracked company". Deleting a company turns its notes into notes for someone not tracked yet, under the company's old name (D-012).
- **Patterns (U7):** search covers names, every heading and the remarks. The result line says, for example, "7 of 10 prospects mention “budget”", and each result shows which heading it was found under, with the words highlighted.
- **Delete (U8)** is in the notes menu, with a confirmation. The company stays.
- **Export (E1):** the notes shown now (search and filters apply), one row per prospect, with columns for the prospect, whether it's a tracked company, its group, likelihood, the nine headings, remarks and last edited.
- **Order and filters:** last edited first by default, or by likelihood or name. Filters: all prospects, tracked companies, or not tracked yet.
- **Live (A1):** a heading a colleague just changed shows "Changed just now". If you're writing in that same heading at that moment, your text isn't replaced while you type. Two people writing in the same heading at once is not designed further.
- **Mock data:** 10 sets of notes (8 tracked companies, 2 not tracked yet; one has no rating). Stress data has 1,500 sets in several scripts, one set with every heading empty, and one with very long remarks.

## D-015 — Group 4 approved (2026-10-20)
Owner: "Continue the expand chosen direction, i believe groups 1-4 is done and review". Recorded as approval of group 4 (qualification notes, D-014). Group 5 started in the same session.

## D-016 — Group 5: past clients (2026-10-20)
Past clients has its own page (`prototype/past.html`), from the side bar and, on phones, from More.
- **Words:** every company that isn't under another one is a **parent company**, even with no subsidiaries, because R4 counts them that way. There are two levels only: parent company and subsidiary.
- **Totals (R3, R4):** the page opens on the number to quote, "Clients we’ve served", and how it adds up: parent companies counted + subsidiaries = clients in total. Below, in a dashed tile, how many umbrella companies are kept but not counted; tapping it lists only them. "Copy these figures" copies a sentence ready to paste, with the three largest sectors.
- **Not counted (R3):** set per parent company from its menu, or from its "Not counted" tag. Not-counted companies have a dashed outline, the same sign used for "outside" elsewhere (informed people, notes not tracked yet). An open umbrella company says that its subsidiaries still count. The message says how the total changes, with Undo.
- **By sector (R5):** counts every counted company once, in its own sector (subsidiaries have their own sector). Largest first, with the count and the share, then "No sector" on its own line, then the total, which always equals the client total. The top 8 show first, then "Show all". Tapping a sector shows its companies. On phones, a switch at the top moves between Companies and By sector.
- **Sector spellings (R6):** every sector field offers the sectors already in use, with how many companies use each. A spelling that matches one when case and spaces are ignored is saved as that one, and a note says so before saving. Older spellings in the data are merged everywhere (breakdown, search, filter, export), shown with the spelling most companies use.
- **The record (R2, R7):** one row per parent company, with its sector and number of subsidiaries. Opening a row shows its subsidiaries as a small tree; "Show all subsidiaries" opens every row. Search covers names and sectors. A matching subsidiary shows under its parent with the words highlighted, and the rest stay behind "Show its other n subsidiaries". Order by name, number of subsidiaries, sector, or counted, either way round, with empty sectors last. The inventory names no default, so it's name, A to Z.
- **Changing (R2):** the name and the sector open small editors in place, as for companies (D-011), and save on their own with Undo.
- **Adding (R1, R2):** "Add a past client" asks for the name (required), the sector, and where it sits: a parent company (with "Count it in the totals", on by default) or a subsidiary of a chosen parent (taking the parent's sector unless changed). Inside an open parent company, an "Add a subsidiary" line adds one with just a name and Enter.
- **Moving (R2):** from a subsidiary's menu, choose the new parent company from a searchable list. "Moving…" shows while it saves, then Undo. If there's no other parent company, the dialog says so and offers to add one.
- **Deleting (R8):** a parent company that still has subsidiaries can't be deleted. The dialog explains why and offers "Show its subsidiaries". Anything else asks first and says how the total changes.
- **Saving (R9):** adding and moving show progress ("Adding…", "Moving…"). If saving fails, the dialog keeps what was typed and says "Couldn’t save… Try again". A change made in place shows a short message with "Try again".
- **Export (E1):** always the full record, whatever the search shows. Each subsidiary follows its parent. Columns: Name, Parent or subsidiary, Parent company, Sector, Counted. Sectors are written the way the breakdown shows them.
- **Live (A1):** a subsidiary a colleague adds appears with "Just added", and the totals update.
- **Mock data:** 21 parent companies (3 umbrella companies not counted), 29 subsidiaries, one parent and one subsidiary with no sector, and two variant spellings. Stress data: 1,200 parent companies, 4,369 subsidiaries, one parent with 340, 45 sectors (other scripts, very long names), about a fifth with no sector, and three spellings of Retail.

**Owner to confirm** (proposals, not adopted silently):
1. **Subsidiaries have their own sector,** filled in from the parent's when added. The alternative is that a subsidiary always takes its parent's sector.
2. **"Parent company" for every company not under another,** even one with no subsidiaries, matching how R4 counts. The alternative is calling those just "companies" and keeping "parent company" for the ones with subsidiaries.
3. **Not built, for later if wanted:** an "Add to past clients" action on a Deal done company's record, so finished clients reach this record in one step. The inventory keeps the two areas separate, so it's left out.

## D-017 — Go-ahead for group 6 (2026-10-20)
Owner: "Go ahead w that", in reply to "Next is group 6". Group 6 started in the same session. Group 5 (past clients, D-016) hasn't been reviewed yet, and its three questions are still open. The design follows the proposed answers until the owner decides.

## D-018 — Group 6: flows, installing, opening with no connection (2026-10-20)
Flows have their own page (`prototype/flows.html`), from the side bar and, on phones, from More. The installed app's icon and launch screen, and every offline state, are on one board (`prototype/install.html`).
- **Layout (M4):** on large screens, the flows are listed A to Z on the left, with a search that also covers steps, outcomes, roles and people. One flow opens on the right. On phones, the list comes first and a flow opens full screen, with "All flows" to go back.
- **Reading a flow (M1, M2):** the steps run down a numbered path. Each step shows its title, description and roles: a label ("Responsible", "Consulted", or anything the team writes) with the people in it.
- **The decision (M3):** the path ends in a diamond, with the decision as a question and its outcomes side by side. A green top edge marks a good outcome and a red one a bad outcome. Each outcome says "The flow ends here" or "Back to step 2: Set up the accounts". Tapping that jumps to the step, which also says which outcome comes back to it.
- **Editing (M1 to M4):** a flow opens to read, and "Edit flow" turns the same layout into fields. Every change saves on its own, with a quiet "Saving…" then "Saved", and "Done" goes back to reading. In editing, steps move up or down, get added after any step or at the end, and get removed (with Undo). Roles get added, reordered with arrows and removed. Role labels and names offer what's already in use, and new names can be added, as for task people (W4). The decision is added once, after the last step, and starts with one good and one bad outcome. Outcomes switch between good and bad, get added and removed, and choose what happens next: the flow ends, or it goes back to an earlier step.
- **Removing a step that an outcome goes back to:** that outcome then ends the flow, and the message says so. Undo restores both.
- **New flow, delete (M4):** a new flow needs a name, then opens in editing with its first step ready. Deleting a flow asks first.
- **Live (A1):** a step a colleague changed shows "Changed just now".
- **No connection:** flows stay readable, and editing waits for the connection. This differs from qualification notes, which keep writing offline (D-014).
- **Installing (A2):** "Install the app" sits at the foot of the side bar, and "Install on this phone" in More. Both are hidden once the app is installed. The install sheet shows the app's icon and what installing gives. Then it shows either an Install button, where the browser offers one, or the three steps in Safari on iPhone and iPad. An installed app says so.
- **Icon and launch screen (A2):** the company logo on a light tile (white to pale blue and aqua), kept inside the circle that devices may crop to. The launch screen is the app's own backdrop with the icon and the name, then Today. "Team desk" is still a placeholder name.
- **Opening with no connection (A3):** the app always opens. With data from before, it shows that data, says when it was loaded, and says changes can't be saved yet. The exception is qualification notes, which keep what's typed on the device. Opened offline for the first time, each area says it will fill in once the connection is back. When the connection returns, a short message says everything is up to date again.
- **Mock data:** 6 flows. Two have a bad outcome that loops back, one has three outcomes, two have no decision, and one has no steps. Stress data has 60 flows, one with 40 steps, a step with 12 roles and 30 names, a decision with 6 outcomes, other scripts, and long names with no spaces.
- **Also fixed:** on phones, the row of task-group chips on All tasks reached 2px past the screen edge, so the page could shift sideways.

**Owner to confirm** (proposals, not adopted silently):
1. **The decision comes after the last step.** M3 talks about going back to an *earlier* step, so the decision is placed at the end. The alternative is letting it sit after any step, with the steps after it continuing from the good outcome.
2. **Flows open to read, with "Edit flow" to change them.** Every change still saves at once (M4). The alternative is always-editable pages, as in qualification notes. Read first keeps a process easy to follow for the people who only use it.
3. **Removing a step or an outcome uses Undo instead of a confirmation.** The inventory asks for a confirmation only when a whole flow is deleted.

## D-019 — Groups 5 and 6 approved; stage 2 done (2026-10-20)
Owner: "Ooo yeah it's approved", after seeing the screenshots of groups 5 and 6 (`shots/27` to `shots/38`). Recorded as approval of past clients (D-016) and of flows, installing and opening with no connection (D-018). The approval covers the prototype as built, which already follows the six proposals:
- **D-016:** subsidiaries have their own sector, filled in from the parent's. Every company not under another is a parent company. There is no "Add to past clients" action on Deal done companies.
- **D-018:** the decision comes after the last step. Flows open to read, with "Edit flow". Removing a step or an outcome uses Undo.
Any of these can still change at the owner's word; a change after the guide is frozen goes through `needs.md`. Stage 2 is done. Next: stage 3, the design guide, in a fresh session.

## D-020 — Design guide: contrast raised to WCAG AA (2026-10-20)
While writing the design guide (stage 3), the prototype's colours were checked against WCAG 2.2 AA. A few fell short, so the guide and `tokens.css` use slightly darker values. Each change is marked "Changed from the prototype" in the guide:
- Muted text #6f7a90 → **#616a7d** (4.3:1 → 5.4:1). Faint #a3abbd → **#8e95a4**, and it's no longer used for words.
- Coloured words on pale tints get their own darker "ink" shades: blue #2b62d7, red #c52b3d, amber #a65800, green #0c7a55, teal #0b776f. The fills, bars and dots keep the approved colours.
- The main button's gradient ends on **#3f75cf** instead of #4a8af4, so its white label reaches 4.5:1.
- The done circle's ring is at full colour instead of 60% (2.5:1 → 5.6:1), so it reads as a control.
- The green option chip goes from #0c7d55 to #0c7a55.
The look barely changes. The prototype hasn't been updated, so the rebuild follows `tokens.css`.

**Owner to confirm** (proposals, not adopted silently):
1. The contrast changes above.
2. **Field outlines.** Today they're a very light grey (1.5px, 12% ink), below the 3:1 that AA asks for the edge of a control. Every field has a visible label and a white fill, so they're still easy to find. Option A: keep them light, as approved (quieter, matching "controls that stay quiet until you need them"). Option B: a 3:1 grey outline (#8e95a4), which is fully AA but makes forms visibly heavier. The designer leans to **B** for forms in sheets and dialogs, and A for fields that are edited in place in documents (notes, flows), which already show a strong outline on focus.
