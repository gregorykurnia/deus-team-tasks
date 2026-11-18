# Build brief: set Responsible from a Claude chat, in bulk and at save time

This brief holds the details for `docs/IMPLEMENTATION_PLAN.md`. Only that plan holds progress ticks. Every default
below is settled for an unattended run, so no task stops to ask.

## What the owner asked, and the smallest design

> "Mass assigning/removing/editing the 'responsible' for any task from claude chat and making sure that in the deus
> deal follow up skill that i can also info who from my team is responsible for x tasks and then later it shud put
> the 'responsible' details directly in teams deus. Lets say 'audrey is responsible for all tasks related to Royal
> Golden Eagle' in the prospects - i type that in the chat, and then in teams deus it will show audrey as the
> responsible." (2026-11-18)

What already exists: `find_tasks`, `preview_task_changes` and `apply_task_changes` (live) can set one task's whole
`responsible` list, up to 50 tasks per call, and the app pushes "New task for you" to a signed-in person on each
assignment. `add_task_plan` and the deal skill deliberately leave Responsible empty.

**Smallest design:** no new tools and no new screens. Four gaps close:
1. **"All" must mean all.** `find_tasks` stops at 10 with `hasMore`; add `offset` and a `total` count so chat can
   page through every open task of a company. Risk closed: chat assigns 10 of 37 tasks and says "done".
2. **Add or remove one person without rewriting lists.** `set.addResponsible` and `set.removeResponsible` (lists of
   names), computed on the server against each task's current list. Risk closed: chat rewriting 40 whole lists by hand
   drops a co-owner on some of them.
3. **One push per person per save.** Today a 30-task assignment sends Audrey 30 pushes. Risk closed: a notification
   storm on her phone, which would make her turn notifications off.
4. **Responsible at save time.** `add_task_plan` takes `responsible` per step and on a new main task, and the deal
   skill passes the names the owner gives. Risk closed: none beyond the ask; this is the ask.

Settled defaults:
- **"Tasks related to <company>"** means open tasks (main tasks and subtasks) linked to that company, parked ones
  included and marked. The owner picks the company by ID from `find_task_destinations`, as for saving. Done tasks only
  when the owner says so. Tasks that only mention the company in their text are not included.
- **Names:** matched as today (case-insensitive against names in use, stored in that spelling; `audrey` → `Audrey`).
  A name nobody uses gives `new-person:<name>`, which chat must show and the owner must confirm.
- **Batches of 50:** more than 50 tasks are previewed and saved in batches; chat says "batch 1 of 2" and shows each
  preview as one compact table: task, main task, Responsible before → after. The server, not chat, sets aside tasks
  where nothing would change (`unchanged`), so chat sends every task it found. One push per person per batch.
- **Changed since the preview:** if anyone edits a listed task between preview and save, the existing `seen` stamps
  refuse the whole batch and nothing is saved; chat previews again and shows the new table.
- **Undo:** the reply after a save lists the task IDs that changed; "undo that" removes the person from those tasks
  only, never from tasks they were on before.
- **Existing tasks only:** saying "Audrey is responsible for all RGE tasks" changes the tasks that exist now. Chat says
  so in its reply. A standing rule for future tasks is a follow-up, not built.
- **Between M3's push and the new skill upload (O2):** the old skill still leaves Responsible empty, as today; plain
  chats already follow the new guidance. Nothing breaks in that window.
- **The deal skill keeps "No owners"** everywhere except Step 5: it never guesses a person. In Step 5's table the
  column is **Responsible**, "Not assigned" unless the owner names a DEUS team member. "Audrey for all" fills every
  step and the new main task; names per step fill only those steps. Appending to an existing main task never changes
  that main task's people. After saving, if the owner said a person is responsible for the whole company, the skill
  offers once to add them to the company's other open tasks through the edit tools (preview, confirm, save).
- **Legacy follow-up tools** (`preview_followup_plan`, `add_followup_plan`) don't change.
- **No flag:** the new inputs are optional and additive on tools that are already live; leaving them out behaves
  exactly as today.

**Out of scope** (follow-ups for the owner to pick): a company-level default Responsible that new tasks pick up by
themselves; suggesting a company's usual Responsible in the skill; bulk Informed changes (works today per task with
whole lists); a Responsible picker on the company page.

## Requirements

| ID | Required behavior | Built / proven in |
|---|---|---|
| P1 | Chat can list every open task of a company, past 10, and knows when it has them all. | M1, E1 |
| P2 | Chat can add or remove one person on many tasks; other people on those tasks stay. | M1, E1 |
| P3 | A save that assigns one person to several tasks sends that person one push, not one per task. | M2, E1 |
| P4 | `add_task_plan` saves Responsible per step and on a new main task, previewed first. | M3, E1 |
| P5 | The deal skill asks nothing new, takes names the owner gives in Step 5 and passes them on. | M4 |
| P6 | Leaving the new inputs out behaves exactly as before. | M1, M3, R1 |
| P7 | Every automated check uses the emulators, the fake push and the fake calendar. | all |

## Checks

Per task: `npx tsc --noEmit`, `npx eslint <changed files>`, `npm run test:unit`, plus `npm run test:data` when the
task touches Firestore reads or writes. MCP checks: `npm run mcp:smoke -- --only=protocol` (emulator only). No
screen changes, so no Playwright run except in R1. Run one test stack at a time and stop only the PIDs you started.
Record each task's evidence in `docs/implementation/responsible-from-chat-results.md` under its ID.

## M1 — Bulk Responsible in the edit tools

Lets chat page through every task of a company and add or remove one person on each.
Read **Smallest design**, `lib/taskEdit.ts` (`validateTaskChanges`, the `responsible` handling),
`lib/taskEditServer.ts` (`findTasks`, `matchesSaved`, `applyTaskChanges`) and
`lib/taskEditTools.ts` (zod inputs, `TASK_EDIT_CHAT_GUIDANCE`).
- `find_tasks`: optional `offset` (integer ≥ 0, default 0); returns `total` next to `hasMore`. `total` counts each
  matching task once, main tasks and subtasks alike (a subtask is its own match; the nested `subtasks` list under a
  main task is extra detail, not counted). Order stays stable (name, then ID).
- `set.addResponsible` / `set.removeResponsible`: lists of names, either or both, never together with
  `set.responsible` and never the same name in both (errors). The after list is the current list plus added names
  (matched spelling, no doubles, `new-person:<name>` for an unknown one) minus removed ones (case-insensitive).
  A removed name that is on none of the listed tasks is an error naming it (a typo must not report "done").
- The preview returns tasks whose after equals before under `unchanged` (IDs), not as changes; apply skips them.
- Guidance (one short paragraph in `TASK_EDIT_CHAT_GUIDANCE`): for "X is responsible for all tasks of company Y", pick
  the company by ID, page with `offset` until `hasMore` is false and the unique IDs equal `total`, use
  `addResponsible` / `removeResponsible`, batches of 50, compact before → after table with parked tasks marked, list
  the changed IDs after saving (for undo), say it covers existing tasks only.

Done when (unit tests in `tests/unit/taskEdit.test.ts`, data tests in `lib/taskEditServer.data.test.ts`):
- A company with 20 open main tasks and 3 open subtasks, plus one done task and one other company's task, comes back
  over three pages with `total: 23`, no task twice, the last page `hasMore: false`, the done and other-company tasks absent.
- `addResponsible: ["audrey"]` on a task with `["Greg"]` gives `["Greg", "Audrey"]`; a task already with `Audrey` lands in `unchanged`.
- `addResponsible: ["Audry"]` gives `new-person:Audry`; apply without acknowledging it saves nothing.
- `removeResponsible: ["AUDREY"]` keeps every other name and can empty a list; a name on none of the tasks, a name in
  both lists, or either list with `responsible` is an error.
- Someone adds a name to a listed task between preview and apply: apply refuses and nothing is saved.
- A retry of an applied add list returns `alreadySaved: true` and writes nothing.
- Calls without the new inputs return the same results as before (existing tests pass unchanged).

## M2 — One push per person per save

Audrey gets one notification for a bulk assignment instead of one per task.
Read `lib/assignNotifyDispatch.server.ts`, `lib/assignNotify.server.ts`, `lib/assignNotify.ts` (`assignmentMessage`,
`assignmentRecipients`, `noticeName`), `public/sw.js` (push and click handlers: what they read from the payload) and
the fake push used by `lib/assignNotify.server.data.test.ts`.
`notifyAssignments(ids)` keeps claiming per task exactly as now (the claim is what stops double sends), but sends after
all claims, grouped by person: one owed task → today's message; two or more → title "N new tasks for you" (N counts
only tasks owed to that person in this call), body the company name when they all share one, else the first task's
name and "and N−1 more", every name through `noticeName`, url `/` (Today lists "Your tasks"). Keep whatever else the
service worker reads from the payload valid. Failed sends stay unretried, as today (the morning summary covers them).
The app's single-task saves keep today's message.

Done when (data tests):
- Assigning one person to 12 tasks of one company in one call sends exactly one push: "12 new tasks for you", body the company name, url `/`.
- 2 tasks of different companies give "2 new tasks for you" and "<first task> and 1 more"; a 70-character name is cut by `noticeName`.
- Two people on the same 3 tasks get one push each; a person who already had 1 of 12 tasks gets "11 new tasks for you".
- A single task still sends today's "New task for you" message.
- Calling it again for the same IDs sends nothing (claims hold).

## M3 — Responsible in add_task_plan

Steps saved from chat can carry their Responsible person.
Read **Smallest design**, `lib/taskPlan.ts` (step shape, `owners`, new main task, line 478's `responsible: []`),
`lib/taskPlanServer.ts`, `lib/taskPlanTools.ts` (zod, the guidance constant's step 4 and the save rule) and how
`lib/taskEdit.ts` matches names (export and reuse that matcher; don't copy it).
- Optional `responsible: string[]` on each step and on a new main task; matched like the edit tools; `new-person:<name>`
  warning. On an existing main task it's an error (that task's people never change here).
- `owners` stays as prose in Key points for names outside the team.
- Guidance: replace "never assign people. Responsible and Informed remain empty" with "Set Responsible only to team
  names the owner gave for that step or for all steps; never guess. Informed stays empty." Same change in
  `docs/skills/README.md`'s ordinary-chat step 5.
- The preview shows each step's Responsible; the preview token covers it.

Done when (unit and data tests):
- A plan with `responsible: ["audrey"]` on two of three steps saves `["Audrey"]` on those two and `[]` on the third.
- A new main task's `responsible` is saved; an existing main task with `responsible` is an error.
- The preview lists each step's Responsible; changing a name after the preview makes the old token fail.
- An unknown name gives `new-person:<name>` and saving without acknowledging it is refused.
- A plan without `responsible` saves exactly as before.
- `grep -n "never assign people" lib/taskPlanTools.ts docs/skills/README.md` finds nothing.

## M4 — The deal skill passes Responsible

In the deal follow-up skill, the owner can say who is responsible and it lands in Teams DEUS.
Read `docs/skills/deus-deal-followup/SKILL.md` ("No owners", Step 5) and `docs/skills/README.md`.
- "No owners": keep the rule, change its one exception to Step 5's **Responsible** column, filled only from names
  the owner gives.
- Step 5: the table column becomes Responsible ("Not assigned" unless named); no new question. Accept "Audrey for
  all" or per-step names at any point in Step 5; pass them as `responsible` (and on a new main task when one name
  covers all steps). Step 6's "Responsible and Informed stay empty" becomes "Informed stays empty". After saving, the
  bulk offer from **Smallest design**.
- Legacy path (old trio only): unchanged; Responsible stays empty there and the skill says so.
- Add two worked examples to `docs/implementation/chat-task-walkthrough.md` with the exact tool inputs: "Audrey for
  all" on a new main task, and per-step names when appending to an existing main task (no `responsible` on it).
- Rebuild the zip with the README's command.

Done when (checked by reading SKILL.md, each written in the results file with its line number):
- Step 5's table has a Responsible column, "Not assigned" by default, and no new question is added.
- Names reach `responsible` only from the owner's words; "No owners" still says never guess.
- Appending to an existing main task never sends `responsible` for that main task.
- The bulk offer after saving is there, and only when the owner said the person covers the whole company.
- The legacy path still leaves Responsible empty and says so.
- `diff <(python3 -c "import zipfile;print(zipfile.ZipFile('docs/skills/deus-deal-followup.zip').read('deus-deal-followup/SKILL.md').decode(),end='')") docs/skills/deus-deal-followup/SKILL.md` prints nothing.

## E1 — End to end on the emulators

Proves the whole flow through the connector the way chat will use it.
Read `scripts/mcp/task-edit-smoke.mjs` and `scripts/mcp/smoke.mjs`. Add a section to the task-edit smoke:
- 23 open tasks of a fictional company (3 of them subtasks, some with Greg already Responsible, one parked, one
  done): page with `offset`, check the parked one is marked `parked: true`, add `Audrey` in batches of 20 and 3,
  check every open task shows Audrey, Greg kept, the done task untouched, and the fake push got one message per batch
  for Audrey.
- Remove `Audrey` from the same tasks; Greg stays.
- `add_task_plan` for that company with `responsible: ["Audrey"]` on two steps; the saved subtasks carry it and Audrey
  gets one push for the save.

Done when: `npm run mcp:smoke -- --only=protocol` passes with the new section, against the emulators only.

## R1 — Phase review

Hunts for faults the tasks' own tests let through, from the other model family.
Read this brief, the diff since the plan's commit and the results file. Look hardest at: paging order when tasks
change between pages, `alreadySaved` with add/remove lists, push grouping under parallel saves (claims), and the skill
text contradicting "No owners" anywhere. Run `npm run test:smoke` once. Quick fixes only; the rest become R1.F rows.
Write the owner handoff (what to reconnect, the skill upload, the live try) in the results file.

Done when: each FINDING line is fixed or has a fix row; `npm run test:smoke` result recorded.
