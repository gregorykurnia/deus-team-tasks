# Prospects from chat: add companies and assign PICs

Prepared 2026-11-26 for `autorun all`. The details for every row are in [the build brief](implementation/prospects-from-chat.md).
The previous plan (Leave) is [archived](implementation/leave-plan-2026-11-23.md); its owner steps O3 and O6 to O8 are
still open there.

## Outcome

In a Claude chat with the team connector, you can say "add these five companies to To approach, PIC Maya" or "make
William the PIC of every Active company in retail". Claude lists the companies, shows exactly what it will add or
change (a table for big changes), and saves only after your yes. New companies and PICs show on the Prospects page as
if added there. It works on any group, clients included, and uses the connector flag that's already on in Production.

## Before the run

- [x] Defaults (owner, 2026-11-26): every open question has a written default in the brief's **Settled defaults**.

## Run rules

- Read only your task's section in the brief, plus **Smallest design**, **Settled defaults**, **Requirements** and
  **Checks** there. No brainstorming and no questions to the owner.
- One task per session, on `staging`. Commit and push each task with its row ticked in the same commit. Nothing goes
  live until a release.
- Tests use only the Firestore and Auth emulators, the fake push and the fake calendar. Never call production.
- Evidence goes in `docs/implementation/prospects-from-chat-results.md`, under each task's ID.

## Phase 1: Add prospects and assign PICs from chat

| ID | Task | Pick | Done |
|---|---|---|---|
| C1a | Pure checks and preview: new company docs as the app stores them, PIC as a team name, duplicate names, options, `seenPics` and limits. [C1a](implementation/prospects-from-chat.md#c1a--checking-and-previewing-pure) [no look] | Sol Max | 2026-11-26 — checked |
| C1b | Server save: new ids from the counter, one transaction for PIC changes with the `seenPics` check, Jakarta day, safe repeats, partial failures. [C1b](implementation/prospects-from-chat.md#c1b--saving-server) [no look] | Sol Max | |
| C2 | Connector tools `list_companies`, `preview_company_changes`, `apply_company_changes`, their input checks and wording. [C2](implementation/prospects-from-chat.md#c2--the-three-connector-tools) [no look] | Sol xHigh | |
| E1 | End to end through the connector on the emulators, ending on the Prospects page; `chat-companies.spec.ts`. [E1](implementation/prospects-from-chat.md#e1--end-to-end-on-the-emulators) [look] | Sol High | |
| R1 | Phase review: what gets saved, anything written outside `pipeline`, the wording in chat; quick fixes, fix rows for the rest. [R1](implementation/prospects-from-chat.md#r1--phase-review) [no look] | Opus 5.5 High | |

## Owner steps after the run

- [ ] O1 *owner*: release (say "release"). No production data or settings change is needed.
- [ ] O2 *owner*: in a Claude chat, reconnect or refresh the team connector so it lists the new tools, then try:
  add one test prospect with a PIC, then ask for that PIC on 12 or more existing companies so you see the change table,
  say no, then yes on two of them. Check both on the Prospects page, and delete the test prospect in the app afterwards.

## Model rationale

Picks follow "Claude or Codex: one pick per task" in `~/.claude/playbooks/plans-and-models.md`. C1a decides what gets saved and C1b writes
companies to the clients project (saved data): Sol Max. C2 is tool wiring judged by route tests: Sol xHigh. E1 is an end-to-end check
run: Sol High. R1 is Opus 5.5 High, the other family from the rows Codex built. A failed task's retry is autorun's own pick.
