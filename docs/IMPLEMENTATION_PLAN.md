# Tasks that also go on the calendar

Prepared 2026-11-11 for `autorun all`. The details for every row are in [the build brief](implementation/calendar-events.md).
The previous plan (chat task connector) is [archived](implementation/chat-task-connector-plan-2026-11-10.md); its
owner steps O2 and O3 are still open there.

## Outcome

In a task's sheet, the owner can switch on **Put on the team calendar** for any task or subtask, all day or with
a meeting time. The event then follows the task: moving the task moves the event, and deleting the task removes
it. In an ordinary Claude chat, each step the connector saves is either a task only or a task plus a calendar
event, shown in the preview before saving. Events go on the owner's Gmail calendar for now, with no invites.
Nothing shows or writes until the owner sets one Vercel variable (O2).

## Run rules

- Read only your task's section in the brief, plus **Smallest design**, **Requirements** and **Checks** there.
  The defaults are settled: no brainstorming and no questions to the owner.
- One task per session, on `main` (this project's branch rule). Commit and push each task with its row ticked in
  the same commit. Every push deploys, which is safe because the feature stays off until O2.
- Tests use only the Firestore emulator and the fake calendar. Never call Google or production.
- Evidence goes in `docs/implementation/calendar-events-results.md`, under each task's ID.

## Phase 1: calendar events from the app and from chat

| ID | Task | Pick | Done |
|---|---|---|---|
| C01 | Calendar mark and sync-state fields on a task and the exact event each task becomes (pure). [C01](implementation/calendar-events.md#c01--calendar-fields-and-event-mapping) [no look] | Sol xHigh | 2026-11-11 |
| C02 | Server sync that makes the calendar match a task, fake calendar for tests, sync route. [C02](implementation/calendar-events.md#c02--server-sync-fake-calendar-and-route) [no look] | Sol Max | 2026-11-11 |
| C03 | Every app write to a marked task triggers a sync: create, edit, edit Undo, rollback, delete. [C03](implementation/calendar-events.md#c03--the-event-follows-the-task) [no look] | Sol Max | 2026-11-11 |
| C04 | Task sheet: "Put on the team calendar" switch, start/end times, calendar status and Try again. [C04](implementation/calendar-events.md#c04--task-sheet-switch-times-and-calendar-status) [look] | Opus 5.5 High | 2026-11-11 |
| C05 | Browser flow on desktop and phone, full-size captures, fix what they show. [C05](implementation/calendar-events.md#c05--app-flow-on-desktop-and-phone) [look] | Sol xHigh | 2026-11-11 |
| M01 | Chat connector: each step is a task only or task plus calendar event; preview shows it; guidance asks per step. [M01](implementation/calendar-events.md#m01--mcp-calendar-choice-per-step-and-preview) [no look] | Sol Max | 2026-11-11 |
| M02 | Chat connector save puts marked steps on the calendar, reports each step, and a repeated save retries failures. [M02](implementation/calendar-events.md#m02--mcp-save-puts-steps-on-the-calendar) [no look] | Sol Max | 2026-11-11 |
| E1 | End to end: chat plan → open in app → edit → delete, checked against the fake calendar. [E1](implementation/calendar-events.md#e1--end-to-end) [no look] | Sol xHigh | 2026-11-11 |
| R1a | Full suite, a11y and scoped compare once; list every failure, fix nothing. [R1a](implementation/calendar-events.md#r1a--full-check-run) [no look] | Sol xHigh | 2026-11-11 |
| R1b | Fix the failures R1a listed, rerunning only what each fix touched. [R1b](implementation/calendar-events.md#r1b--fix-recorded-failures) [look] | Sol xHigh | |
| R1 | Phase review: hunt for faults in saving and syncing, fix them, write the owner handoff. [R1](implementation/calendar-events.md#r1--phase-review) [no look] | Opus 5.5 High | |

## Owner steps after the run

- [ ] O1 *owner*: in Google Calendar on your Gmail account, go to Settings → your calendar → **Share with specific
  people**, and add the service account's email (Vercel's `GOOGLE_SERVICE_ACCOUNT_EMAIL`) with **Make changes to
  events**.
- [ ] O2 *owner*: in Vercel Production, set `GOOGLE_EVENTS_CALENDAR_ID` to your Gmail address (your main calendar's
  ID) and redeploy. To roll back, remove it and redeploy. Events already made stay on your calendar.
- [ ] O3 *owner*: live check. Put one task on the calendar with a time from the app, then save one chat plan with
  one calendar step and one task-only step. Move one of them, delete it, and check that your calendar follows.

## Model rationale

Picks follow "Claude or Codex: one pick per task" in `~/.claude/playbooks/plans-and-models.md`. Sol Max takes the
rows that write saved data (sync, every-write hook, MCP save) and the chat guidance. Sol xHigh takes the pure
logic and the pass/fail check rows. Opus 5.5 High takes C04, the one new control with no studio mock, and the
phase review, because most rows are Codex-built and the review should come from the other family. A failed task's
retry is autorun's own pick.

Start with `AUTORUN_GPT_ONLY=0 autorun all docs/IMPLEMENTATION_PLAN.md`. The `0` clears the GPT-only mode this
project saved for its last run. GPT-only mode refuses Claude rows, so if Claude's limit is low, first change C04
to Astra xHigh and R1 to Sol Max, then start with `AUTORUN_GPT_ONLY=1`.
