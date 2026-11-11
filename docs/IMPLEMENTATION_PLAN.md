# Change existing tasks from a Claude chat

Prepared 2026-11-11 for `autorun all`. The details for every row are in [the build brief](implementation/chat-task-edits.md).
The previous plan (tasks on the calendar) is [archived](implementation/calendar-events-plan-2026-11-11.md); its
owner steps are still open there.

## Outcome

In an ordinary Claude chat with the Teams DEUS connector, the owner can find any task or subtask and change it:
rename it, move its dates, rewrite its Key points, set To Do / In Progress / Done, park it or bring it back, set
Responsible and Informed, put it on the calendar or take it off, move a subtask to another main task or free it,
and delete it. Every change is previewed as before → after and saved only after the owner confirms in chat. Nothing
is reachable until the owner sets one Vercel variable (O1).

## Before the run

- [x] The calendar plan finished: every row ticked, its R1 included (these tools call its calendar sync).

## Run rules

- Read only your task's section in the brief, plus **Smallest design**, **Requirements** and **Checks** there.
  The defaults are settled: no brainstorming and no questions to the owner.
- One task per session, on `main` (this project's branch rule). Commit and push each task with its row ticked in
  the same commit. Every push deploys, which is safe because the tools stay off until O1.
- Tests use only the Firestore emulator and the fake calendar. Never call Google or production.
- Evidence goes in `docs/implementation/chat-task-edits-results.md`, under each task's ID.

## Phase 1: change tasks from chat

| ID | Task | Pick | Done |
|---|---|---|---|
| T01 | Field changes (name, dates, Key points, status, parking, people, calendar mark): before → after, warnings, `seen` stamp (pure). [T01](implementation/chat-task-edits.md#t01--field-changes-pure) [no look] | Sol xHigh | 2026-11-11 |
| T02 | Moves and deletes: one-level rule, subtasks take the new main task's company, a main task's delete frees its subtasks (pure). [T02](implementation/chat-task-edits.md#t02--moves-and-deletes-pure) [no look] | Sol xHigh | 2026-11-11 |
| T03 | `find_tasks` and `preview_task_changes` connector tools, read only, behind `MCP_TASK_EDITS_ENABLED`. [T03](implementation/chat-task-edits.md#t03--find-and-preview-tools-read-only) [no look] | Sol xHigh | 2026-11-11 |
| T04 | `apply_task_changes`: one transaction, refuses if a task changed since the preview, retry-safe, company follows a deadline, calendar sync after. [T04](implementation/chat-task-edits.md#t04--save-tool) [no look] | Sol Max | 2026-11-11 |
| T05 | Chat guidance for the edit flow, and an edit section in the MCP smoke. [T05](implementation/chat-task-edits.md#t05--chat-guidance-and-mcp-smoke) [no look] | Sol Max | 2026-11-11 |
| E1 | End to end: edits, a move and a delete over HTTP, then checked in the task sheet and the fake calendar. [E1](implementation/chat-task-edits.md#e1--end-to-end) [no look] | Sol xHigh | 2026-11-11 |
| R1a | Full suite, a11y and scoped compare once; list every failure, fix nothing. [R1a](implementation/chat-task-edits.md#r1a--full-check-run) [no look] | Sol xHigh | 2026-11-11 |
| R1b | Fix the failures R1a listed, rerunning only what each fix touched. [R1b](implementation/chat-task-edits.md#r1b--fix-recorded-failures) [look] | Sol xHigh | 2026-11-11 |
| R1b.F1 | Keep company-linked task drafts safe while company data loads or fails; delayed-company regression preserves the link and unrelated dates. [R1b.F1](implementation/chat-task-edits.md#r1bf1--keep-a-company-task-linked-while-its-company-loads) [look] | Astra xHigh | 2026-11-11 |
| R1b.F2 | Fix the expanding stress phone viewport and detect offscreen sheets; recapture only state 065 after F1. [R1b.F2](implementation/chat-task-edits.md#r1bf2--keep-the-stress-task-sheet-inside-the-phone-capture) [look] | Astra xHigh | |
| R1 | Phase review: hunt for faults in saving, fix them, write the owner handoff. [R1](implementation/chat-task-edits.md#r1--phase-review) [no look] | Opus 5.5 High | |

## Owner steps after the run

- [ ] O1 *owner*: in Vercel Production, set `MCP_TASK_EDITS_ENABLED` to `1` and redeploy. To roll back, remove it
  and redeploy.
- [ ] O2 *owner*: in claude.ai, open Settings → Connectors → Teams DEUS and check that `find_tasks`,
  `preview_task_changes` and `apply_task_changes` are listed. If not, disconnect and connect it again.
- [ ] O3 *owner*: live check on a throwaway Internal task with one subtask: in a chat, rename it, move its dates, mark
  the subtask Done, put it on the calendar, then delete it. Check the app and your calendar after each step.

## Model rationale

Picks follow "Claude or Codex: one pick per task" in `~/.claude/playbooks/plans-and-models.md`. Sol Max takes the
save tool (it writes live data, including deletes) and the chat guidance (written rules where completeness counts).
Sol xHigh takes the pure rules, the read-only tools and the pass/fail check rows. Opus 5.5 High takes the phase
review, because every build row is Codex-built and the review should come from the other family. A failed task's
retry is autorun's own pick.

Start with `AUTORUN_GPT_ONLY=0 autorun all docs/IMPLEMENTATION_PLAN.md`. If Claude's limit is low, change R1 to Sol
Max first and start with `AUTORUN_GPT_ONLY=1`.
