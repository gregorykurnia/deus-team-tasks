# Coverage

Maps every job story and state in `redesign/handoff/inventory.md` to where the prototype shows it and where the guide describes it. Written in a fresh session (stage 4, 2026-10-20).

**How it was checked.** The sandbox blocks the browser, so this is a code-level audit, not a visual one:
- Every one of the 273 links on `prototype/map.html` was checked: each `?state=`, `?open=` and other switch exists in that page's script (16 values looked unmatched, all search words, generated ids or dates, which is expected).
- Each story's behaviour was found in the scripts, and the quoted interface text in guide sections 5 and 6 was checked against the prototype (the few misses are text built from templates).
- Tokens named in the guide all exist in `tokens.css`.
- Not checked: how each state looks on a phone. That rests on the responsive CSS (23 breakpoint rules) and the screenshots the owner approved (`shots/`), not on every state at both widths.

**Result.** All 69 job stories and every state in the inventory are covered. One mismatch between the guide and the prototype was found (G-1, needs the owner). Two small notes (G-2, G-3). Nothing else is missing.

Paths below are relative to `prototype/`. "Guide" is `design-guide.md`.

## Job stories

### Win new business (B)
| ID | Where in the prototype | Guide |
|---|---|---|
| B1 | `companies.html?open=new`; fields in `?open=record-hold`, `?co=hal` (contact, type, status, products, priority, last action, next actions, target date, trial; only the name is required: `?open=new-required`) | 6.5, 4.9 |
| B2 | `companies.html`: four group tiles with sizes; `?g=lead`, `?g=done`, `?g=hold` | 6.5 |
| B3 | `?g=lead`, `?open=record-lead` (type, planned outreach, priority, industry, source, notes) | 6.5 |
| B4 | `?g=hold`, `?open=record-hold` (type, products, answer, reason) | 6.5 |
| B5 | `?open=move`, `?open=move-hold`, `?open=edit-status` then "Deal done" | 6.5, 5.10 |
| B6 | `?act=cold`, `?act=fu`, `?act=high`, `?act=due` (counts "of 42") | 6.5, 5.1 |
| B7 | list cells and `?open=record-cold` (days since last action, target date) | 5.1 |
| B8 | `?q=fleet`, `?q=jas`, `?g=lead&prio=high`, `?q=zebra` (no results, points to other groups) | 6.5, 5.6 |
| B9 | `?open=sort`, `?sort=target&dir=asc`, `?sort=name&dir=asc`; default most recent action | 6.5, 5.6 |
| B10 | `?open=edit-status`, `?open=edit-date`, `?open=edit-text` | 4.9, 5.3 |
| B11 | `?open=followup`, `?open=row-menu`, `?state=task-fail&open=followup` | 6.5 |
| B12 | company record sync note (`?co=hal`); task sheet sync note (`tasks.html?open=task-edit`) | 6.3, 6.5 |
| B13 | task sheet "Open company" (`tasks.html?open=task-edit`) → `companies.html?co=hal` | 6.3 |
| B14 | `companies.html?open=delete` (its tasks and notes stay, D-012) | 6.5, 5.4 |

### Understand each prospect (U)
| ID | Where | Guide |
|---|---|---|
| U1 | `notes.html` (nine headings in order, "6 of 9 headings written") | 6.6 |
| U2 | `notes.html` likelihood picker; `?lk=high`, `?lk=-` (not rated), `?sort=likely` | 6.6, 2.1 |
| U3 | `notes.html?open=remarks` (folded), `?n=n9`, stress (very long) | 6.6 |
| U4 | `?state=saving`, `?state=offline` (keeps writing on the device) | 6.6, 5.3 |
| U5 | `?co=hal` (has notes), `?co=ksp` (starts notes); company record button | 6.6, 6.5 |
| U6 | `?open=new-untracked`, `?open=link`, `?track=no` | 6.6 |
| U7 | `?q=budget`, `?q=IT%20policy`, `?q=budget&stress` ("7 of 10 prospects mention") | 6.6 |
| U8 | `?open=delete` | 6.6, 5.4 |

### Shape the work (W)
| ID | Where | Guide |
|---|---|---|
| W1 | `tasks.html?open=task-new` (quick sheet); quick capture on Today | 6.3, 4.8 |
| W2 | `tasks.html?open=task-new-full` | 6.3 |
| W3 | `?open=task-new-full`, `?open=task-edit` (responsible, informed with their part) | 6.3, 4.5 |
| W4 | `?open=task-names`, `?open=task-names-new` | 6.3, 5.11 |
| W5 | done circle on every row; Today "a task just marked done"; `?open=task-done` (finished task) | 4.6, 6.1 |
| W6 | `tasks.html?view=done`, `?view=done&range=all` (count shown) | 6.2 |
| W7 | `?open=task-edit`, `?open=task-delete` | 6.3, 5.4 |
| W8 | `tasks.html?group=q4`, `?open=group-new` | 6.2 |
| W9 | star in the group header and in `?open=group-new`; important groups first in the side bar | 6.2, 3 |
| W10 | `?group=q4`; open count per group in the side bar and in the phone chips | 6.2, 3 |
| W11 | `?open=group-new`, `?open=group-rename`, `?open=group-delete` (tasks become ungrouped), `?open=select-move` | 6.2, 5.4 |
| W12 | kind switch: `?kind=pro`, `?kind=cli`, `?kind=int`; also on Today | 5.2, 6.1 |
| W13 | `tasks.html?kind=pro` (company, days left, days since last action) | 5.1, 6.2 |
| W14 | `?kind=pro&idle=14`, `?kind=pro&idle=60`, `?open=idle`, `?open=sort` | 6.2, 5.6 |
| W15 | `?open=columns`; remembered on the device | 6.2, 5.6 |

### Know what's due and who's on it (D)
| ID | Where | Guide |
|---|---|---|
| D1 | `plan.html` (crunch days, busiest day, quiet stretch, load per person) | 6.4, 4.12 |
| D2 | `plan.html?work=cli`, `?work=int`, `?work=g:q4`; kind switch on Today and All tasks | 6.4 |
| D3 | `tasks.html?due=nodate`; Today "Needs a date"; Plan chip "no dates"; open the task to fix | 6.1, 6.4 |
| D4 | `plan.html?view=day` (deadline, starting, under way, who, key points); Today for today | 6.4, 6.1 |
| D5 | `?view=day&state=free-today` (lands on the next day), `?view=day&date=…`, `?view=month` | 6.4 |
| D6 | `?view=people`, `?view=people&person=Maya%20Chen` (owned and informed, their part) | 6.4 |
| D7 | timeline "Team calendar" row, `?view=month`, Today "Calendar today" | 6.4, 5.9 |
| D8 | `?show=tasks`, `?show=events`; month "n more" on busy days; folded rows "Show n more" | 6.4, 5.7 |
| D9 | `?show=events`, `?view=day` (start time or "All day", open in team calendar, "Read only") | 5.9 |
| D10 | `?state=events-off`, `?state=events-fail` (also Today, month, day) | 5.9 |
| D11 | tasks open from Today, All tasks, Plan (every view) and the company record | 6.3 |

### Keep the record of past clients (R)
| ID | Where | Guide |
|---|---|---|
| R1 | `past.html?open=add`, `?open=add-sector` | 6.7 |
| R2 | `?open=add-sub`, `?open=move`, `?open=rename`, `?open=menu`, `?open=delete-sub` | 6.7 |
| R3 | `?nc`, `?state=umbrella-only`; "Not counted" tag and menu | 6.7 |
| R4 | `past.html` totals and the sum (counted + subsidiaries = total) | 6.7 |
| R5 | `?view=sectors`, `?sec=retail`, `?sec=-` (no sector, total adds up) | 6.7 |
| R6 | `?open=add-sector`, `?open=sector` (suggestions, spellings merged) | 6.7, 5.11 |
| R7 | `?q=nusa`, `?q=retail`, `?x=p1`, `?sort=subs-desc`, `?open=sort` | 6.7, 5.6 |
| R8 | `?open=delete-blocked` | 6.7, 5.4 |
| R9 | `?state=save-fail`, `?state=save-fail&open=rename`, `?state=saving` | 6.7 |

### Document how work moves (M)
| ID | Where | Guide |
|---|---|---|
| M1 | `flows.html?f=f1`, `?open=new`, `?open=edit` | 6.8 |
| M2 | `?open=edit` (roles with labels and names, reorder), `?open=names` | 6.8, 4.16 |
| M3 | `?f=f1` (loop back), `?f=f2` (three outcomes), `?open=decision-new`, `?f=f3` (no decision) | 6.8, 4.16 |
| M4 | `?open=new`, `?open=edit`, `?open=menu`, `?open=delete`, `?state=saving` | 6.8 |

### Tailor the data (C) and Take data elsewhere (E)
| ID | Where | Guide |
|---|---|---|
| C1 | `companies.html?open=fields`, `?open=field-new` (short text, long text, number, date, choice) | 6.5 |
| C2 | `?open=fields`, `?g=hold&open=fields`, `?open=field-remove` | 6.5 |
| C3 | `?open=options`, `?open=option-remove`, `?open=edit-status` (clear), locked statuses | 6.5 |
| E1 | `companies.html?open=export` (also filtered, nothing to export); `notes.html?open=export`; `past.html?open=export` (full record) | 5.12 |

### Work anywhere, together (A)
| ID | Where | Guide |
|---|---|---|
| A1 | `?state=live` on Today, All tasks, Plan (all views), Companies, Past clients, Flows; `notes.html?n=n3&state=live` | 3, 5.8 |
| A2 | `install.html`; `index.html?open=install`, `?open=install-ios`, `?open=install-done`; phone layouts throughout | 6.9, 5.13 |
| A3 | `?state=offline` and `?state=offline-empty` on every page; `index.html?state=back-online` | 5.8, 6.9 |
| A4 | side bar, phone tab bar and `index.html?open=more`; task-group chips on phones | 3 |

### Not in the inventory
- **Selecting several tasks** (D-008): `tasks.html?open=select`, `?open=select-all`, `?open=select-move`, `?open=select-delete`, `?view=done&open=select`. Guide 4.7, 6.2. The owner's working story is in `decisions.md`; it's not yet in `inventory.md` on their side.

## States

| State from the inventory | Where |
|---|---|
| Nothing yet: no tasks | `index.html?state=empty`, `tasks.html?state=empty` |
| … no tasks of one kind | `?state=no-clients&kind=cli` (Today, All tasks) |
| … nothing on a selected day | `plan.html?view=day&state=empty` |
| … nothing in a month | `plan.html?view=month&state=empty` |
| … a person with no tasks | `plan.html?view=people&person=Joko%20Susanto` |
| … no flows | `flows.html?state=empty`, `?open=no-steps` (a flow with no steps) |
| … no companies in a group, or none matching | `companies.html?state=empty`, `?state=empty-group&g=hold`, `?q=zebra` |
| … no notes, or none matching | `notes.html?state=empty`, `?q=zebra` |
| … no past clients, or none matching | `past.html?state=empty`, `?q=zebra` |
| … no counted companies | `past.html?state=umbrella-only` |
| … no other parent to move to | `past.html?state=one-parent&open=move` |
| Loading: tasks, flows, companies, notes, past clients, events | `?state=loading` on each page; `?state=events-loading` (Today, Plan) |
| Saving: notes; adding or moving a past client | `notes.html?state=saving`; `past.html?state=saving` |
| Failure: past client save | `past.html?state=save-fail` |
| … follow-up task, task group | `companies.html?state=task-fail&open=followup`; `tasks.html?state=group-fail&open=group-fail` |
| … events not set up or failed | `?state=events-off`, `?state=events-fail` |
| No connection | `?state=offline`, `?state=offline-empty` on every page |
| Read-only: events | lock and "Read only" on every event (`plan.html?show=events`) |
| Live-synced | `?state=live` on every page |
| Urgency: task deadline, last action | `tasks.html?due=overdue`, `?due=soon`, `?kind=pro` |
| … company target date, going cold | `companies.html?act=due`, `?act=cold`, `?open=record-cold` |
| Done | `tasks.html?view=done`; struck through on Today; `?open=task-done` |
| Undated | `tasks.html?due=nodate`; Today "Needs a date" |
| Not counted | `past.html?nc` |
| Required missing: task, company, task group (empty, name taken), past client, flow, notes | `tasks.html?open=task-required`, `?open=group-empty`, `?open=group-dup`; `companies.html?open=new-required`; `past.html?open=add-required`; `flows.html?open=new-required`; `notes.html?open=new-required` |
| Confirming: task, task group, company, option, own field, flow, notes, past client, subsidiary | `tasks.html?open=task-delete`, `?open=group-delete`; `companies.html?open=delete`, `?open=option-remove`, `?open=field-remove`; `flows.html?open=delete`; `notes.html?open=delete`; `past.html?open=delete`, `?open=delete-sub` |

### Stage 2 states that don't apply
Restricted and shared-link visitor (nobody signs in) and dark mode (brief): not designed, by decision (D-005; guide 9). Bulk selection: designed (D-008). No results: covered above.

### Stress
Every screen has a stress version (`?stress`, or the Stress links on `map.html`): Today, All tasks, task groups, task details, Plan (all four views), Companies (list, record, fields, options), Notes, Past clients, Flows. The install board and the More sheet have no stress version because they show no user data.

## Gaps

| # | Gap | Status |
|---|---|---|
| G-1 | **Which company fields the list shows (C2) is "remembered on the device" in guide 5.6, but the prototype doesn't remember it** (a reload resets the switches). Only the task columns (W15) are remembered. The inventory only asks for remembering on W15. | **Owner to decide: D-023.** Neither file changed yet. |
| G-2 | Phone screenshots exist for 38 screens, not every state. Phone layout for the rest is by shared CSS. | Note only. The rebuild's visual review should check phones state by state. |
| G-3 | The selecting-several story (D-008) has no ID in `inventory.md`. | Note only. The owner adds it on their side. |

No other gaps. Every ID and state above resolves to a screen the prototype builds and a section of the guide.
