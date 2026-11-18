# Set Responsible from a Claude chat, in bulk and at save time

Prepared 2026-11-18 for `autorun all`. The details for every row are in [the build brief](implementation/responsible-from-chat.md).
The previous plan (Audrey signs in) is [archived](implementation/audrey-sign-in-plan-2026-11-17.md); its owner steps
O7–O9 are still open there.

## Outcome

In a Claude chat with Teams DEUS, the owner types "Audrey is responsible for all tasks related to Royal Golden Eagle",
picks the company, sees one before → after table of every open RGE task, confirms, and Teams DEUS shows Audrey as
Responsible on each, with everyone already there kept. "Take Audrey off …" works the same way. In the deal follow-up
skill, the owner can say who is responsible for which steps in Step 5, and the saved tasks carry it. Audrey gets one
notification per save (a save holds up to 50 tasks), not one per task. Nothing changes on screen; tools without the new inputs behave as today.

## Run rules

- Read only your task's section in the brief, plus **Smallest design**, **Requirements** and **Checks** there.
  The defaults are settled: no brainstorming and no questions to the owner.
- One task per session, on `main` (this project's branch rule). Commit and push each task with its row ticked in
  the same commit. Every push deploys; the new inputs are optional, so each push is safe on its own.
- Tests use only the Firestore and Auth emulators, the fake push and the fake calendar. Never call production.
- Evidence goes in `docs/implementation/responsible-from-chat-results.md`, under each task's ID.

## Phase 1: Responsible from chat

| ID | Task | Pick | Done |
|---|---|---|---|
| M1 | Edit tools: `find_tasks` paging (`offset`, `total`), `addResponsible` / `removeResponsible`, bulk guidance. [M1](implementation/responsible-from-chat.md#m1--bulk-responsible-in-the-edit-tools) [no look] | Sol Max | 2026-11-18 — checked |
| M2 | One push per person per save: claim per task as now, send grouped. [M2](implementation/responsible-from-chat.md#m2--one-push-per-person-per-save) [no look] | Sol Max | 2026-11-18 — checked |
| M3 | `add_task_plan` takes `responsible` per step and on a new main task; guidance and README. [M3](implementation/responsible-from-chat.md#m3--responsible-in-add_task_plan) [no look] | Sol Max | |
| M4 | Deal skill Step 5: Responsible column, names passed on, bulk offer after saving; rebuild the zip. [M4](implementation/responsible-from-chat.md#m4--the-deal-skill-passes-responsible) [no look] | Opus 5.5 High | |
| E1 | End to end on the emulators through the connector: page, bulk add and remove, one push, plan save with Responsible. [E1](implementation/responsible-from-chat.md#e1--end-to-end-on-the-emulators) [no look] | Sol xHigh | |
| R1 | Phase review: hunt for faults, `npm run test:smoke`, quick fixes, owner handoff. [R1](implementation/responsible-from-chat.md#r1--phase-review) [no look] | Opus 5.5 High | |

## Owner steps after the run

- [ ] O1 *owner*: in Claude, start a new chat with Teams DEUS on and check `find_tasks` offers `offset` (if not,
  reconnect the connector, as in `docs/skills/README.md`).
- [ ] O2 *owner*: Customize → Skills: replace `deus-deal-followup` with `docs/skills/deus-deal-followup.zip`.
- [ ] O3 *owner*: live try, preview first: "Preview only: Audrey is responsible for all tasks related to Royal Golden
  Eagle". Check the count matches the RGE tasks you see in the app and Greg-style co-owners stay. Then say save, open a
  few RGE tasks in the app, and check Audrey got one notification (once O8 in the archived plan is done). If anything
  is off, "undo that" removes her from only the tasks that changed.

## Model rationale

Picks follow "Claude or Codex: one pick per task" in `~/.claude/playbooks/plans-and-models.md`. M1–M3 change saved
task data and notifications: Sol Max. M4 is instructions a model reads closely: Opus 5.5 High. E1 is an end-to-end
check run that also writes a smoke section: Sol xHigh. R1 is Opus 5.5 High, the other family from the Codex-built rows.
