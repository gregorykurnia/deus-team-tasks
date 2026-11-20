# Task groups from a Claude chat

Prepared 2026-11-20 for `autorun all`. The details for every row are in [the build brief](implementation/groups-from-chat.md).
The previous plan (Responsible from chat) is [archived](implementation/responsible-from-chat-plan-2026-11-18.md); its
open owner steps moved here as R-O1 to R-O3.

## Outcome

In a Claude chat with Teams DEUS, the owner says "put all open Royal Golden Eagle tasks into the Partners group". Chat
picks the company, shows one before → after table, and after the owner's yes the tasks show under Partners in the
app. Chat can also list the groups, and create, rename, mark important or delete a group. Before a rename or delete,
it says how many tasks follow. Nothing changes on screen, and calls without the new inputs behave as they do today.

## Run rules

- Read only your task's section in the brief, plus **Smallest design**, **Requirements** and **Checks** there.
  The defaults are settled: no brainstorming and no questions to the owner.
- One task per session, on `main` (this project's branch rule). Commit and push each task with its row ticked in
  the same commit. Every push deploys; the new inputs and tools are optional, so each push is safe on its own.
- Tests use only the Firestore and Auth emulators, the fake push and the fake calendar. Never call production.
- Evidence goes in `docs/implementation/groups-from-chat-results.md`, under each task's ID.

## Phase 1: Groups from chat

| ID | Task | Pick | Done |
|---|---|---|---|
| G1 | New `list_task_groups` and `change_task_group` (create, rename, star, unstar, delete; atomic, task-count guard). [G1](implementation/groups-from-chat.md#g1--the-group-tools) [no look] | Sol Max | 2026-11-20 — group tools checked |
| G2 | Edit tools: `set.taskGroup` (name or null), `find_tasks` `group` filter, bulk guidance. [G2](implementation/groups-from-chat.md#g2--move-tasks-between-groups-in-the-edit-tools) [no look] | Sol Max | 2026-11-20 — group edits and search checked |
| E1 | End to end on the emulators: smoke section (55 tasks, two batches, rename, stale and real delete) and a browser test that the app shows chat-moved tasks in the group. [E1](implementation/groups-from-chat.md#e1--end-to-end-on-the-emulators) [no look] | Sol xHigh | 2026-11-20 — connector and browser checked |
| R1 | Phase review: hunt for faults, the group screens' Playwright specs, quick fixes, owner handoff. [R1](implementation/groups-from-chat.md#r1--phase-review) [no look] | Opus 5.5 High | |

## Owner steps after the run

- [ ] O1 *owner*: in Claude, start a new chat with Teams DEUS on and check `list_task_groups` is offered (if not,
  reconnect the connector, as in `docs/skills/README.md`).
- [ ] O2 *owner*: live try of the real request: "Create a group called Test Chat Group", then "Preview only: put all
  open tasks of <a company with a few tasks> into Test Chat Group". Check the table's count matches what the app shows
  for that company, and its subtasks are listed. Save, check they show under the group in the app, rename it, then
  delete it and check the tasks are back with no group.

Still open from the Responsible plan (they gate nothing here):
- [ ] R-O1 *owner*: check `find_tasks` offers `offset` in a new chat (the reconnect in O1 covers it).
- [ ] R-O2 *owner*: Customize → Skills: replace `deus-deal-followup` with `docs/skills/deus-deal-followup.zip`.
- [ ] R-O3 *owner*: live try "Preview only: Audrey is responsible for all tasks related to Royal Golden Eagle", as in
  the [archived plan](implementation/responsible-from-chat-plan-2026-11-18.md#owner-steps-after-the-run).

## Model rationale

Picks follow "Claude or Codex: one pick per task" in `~/.claude/playbooks/plans-and-models.md`. G1 and G2 write saved
task and group data: Sol Max. E1 is an end-to-end check run with a browser test: Sol xHigh. R1 is Opus 5.5 High, from the other family to
the rows Codex built.
