# Any chat → dated subtasks in Prospects, Clients or Internal

Prepared 2026-11-10 for `autorun all`. This is the active plan; the completed deal-follow-up build and its
outstanding owner steps are preserved in [the previous plan](implementation/deal-followup-2026-11-09.md).
All task picks are GPT because Claude is out of quota. Implementation progress is recorded in the task table.

## Outcome

With Deus Team Tasks enabled in an ordinary Claude chat, ask to save dated actions. Claude asks where they
belong, which company/main task when needed, and confirms or skips each subtask individually. It previews
the selected actions, saves them, and returns a link. The deal-follow-up skill is not required for this path.
From the app's main navigation: **Tasks → All tasks → Prospects / Clients / Internal → main task → subtasks**.
The returned link opens that main task directly. Existing Plan views show its dated subtasks as they do today.

## Run rules

- Read only the assigned section in [the build brief](implementation/chat-task-connector.md), plus its named
  source files. The brief's numbered requirements and defaults are settled for this run; no brainstorming pause.
- Work sequentially in this folder on `main`, commit/push each task and tick only its row in that commit.
  This is the project's explicit branch rule. Never start a parallel builder or edit a running task's files.
- Every push deploys. New tools remain unavailable unless the new server-only `MCP_TASK_PLANS_ENABLED=1` flag
  is set. Keep it unset in production throughout the run; the old three tools retain their current contract.
  Owner activation comes after the run, never as a blocker inside a build task.
- Run the brief's **Checks** for changed code, with emulator-only data/browser runs. Browser checks use the
  existing development server because `lib/emulator.ts` disables the emulator in production builds.
- Save findings in `docs/implementation/chat-task-results.md`, using task IDs and short evidence paths.
  Tick progress only in this table; map requirements to evidence in the final review. Do not edit runner logs.
- No new app screen or redesign is planned. Screenshot repairs must follow `redesign/design/design-guide.md`.
  A real design gap goes to the existing open-items and handoff files, with a named disposition.

## Before the run

- [x] O0 GPT-only runner installed and tested, 2026-11-10: shared config commit `e120a15`; 13 offline regression checks and shell syntax checks pass. Retries, visual checks, resumes and keepalive stay on GPT; the Claude quota guard leaves this run alone. See [verification and commands](implementation/gpt-only-autorun-prerequisite.md).

Run `AUTORUN_GPT_ONLY=1 autorun check docs/IMPLEMENTATION_PLAN.md`; it must report GPT-only execution and no
open prerequisites. Start with `AUTORUN_GPT_ONLY=1 autorun all docs/IMPLEMENTATION_PLAN.md`. The mode is saved
for this project's resumes/restarts; `autorun status` shows progress and `autorun stop` stops after its current task.

## Phase 1: general task connector, checked before activation

Each row has one pick. The linked section contains files, required reading, edge cases and a measurable Done when.

| ID | Task and acceptance reference | Pick | Done |
|---|---|---|---|
| G01 | Define general task inputs and fictional fixtures; reject invalid dates and destinations. [G01](implementation/chat-task-connector.md#g01--inputs-and-fixtures) [no look] | Sol xHigh | 2026-11-10; 111 tests passed |
| G02 | Find matching companies and eligible existing main tasks for each category. [G02](implementation/chat-task-connector.md#g02--destination-discovery) [no look] | Sol xHigh | 2026-11-10; 60 discovery cases checked |
| G03 | Build exact read-only previews for new and existing main tasks. [G03](implementation/chat-task-connector.md#g03--pure-previews) [no look] | Sol xHigh | 2026-11-10; 64 preview cases checked |
| G04 | Bind a save to its preview and acknowledged warnings. [G04](implementation/chat-task-connector.md#g04--preview-integrity) [no look] | Sol Max | 2026-11-10; 95 integrity cases checked |
| G05 | Save atomically, preserve existing data and make retries safe. [G05](implementation/chat-task-connector.md#g05--atomic-saving-and-retries) [no look] | Sol Max | 2026-11-10; 62 transaction cases passed |
| G06 | Expose the three general tools behind the activation flag with chat instructions. [G06](implementation/chat-task-connector.md#g06--mcp-tools-and-chat-guidance) [no look] | Sol Max | 2026-11-10; 52 tool cases; 63 transaction cases |
| G07 | Test the actual MCP protocol for all categories, failures and legacy compatibility. [G07](implementation/chat-task-connector.md#g07--protocol-checks) [no look] | Sol xHigh | 2026-11-10; real MCP passed; 112 preservation checks |
| G08 | Open connector-created tasks on desktop and phone and capture their saved state. [G08](implementation/chat-task-connector.md#g08--app-flow-and-captures) [look] | Sol xHigh | 2026-11-10; 12 UI cases; 26 captures |
| G09 | Inspect full-size captures and repair confirmed visual faults. [G09](implementation/chat-task-connector.md#g09--visual-finish) [look] | Astra xHigh | 2026-11-10; Plan clipping fixed; full-size review and phone findings checked |
| G10 | Update the existing skill, generic-chat instructions and owner walkthrough. [G10](implementation/chat-task-connector.md#g10--instructions-and-packaging) [no look] | Sol Max | 2026-11-10; skill/ZIP, 8 examples and artifact checks passed |
| R1a | Review the write path and confirmation workflow; fix confirmed faults before broad checks. [R1a](implementation/chat-task-connector.md#r1a--risk-review) [no look] | Sol Max | 2026-11-10; retry snapshot fault fixed; 161 data cases passed |
| R1b | Run the full end-to-end suite once and save the complete failure list. [R1b](implementation/chat-task-connector.md#r1b--full-end-to-end-run) [no look] | Sol xHigh | 2026-11-10; 379 passed, 9 skipped, 1 failure saved for R1c |
| R1c | Fix the recorded end-to-end failures and rerun only affected tests. [R1c](implementation/chat-task-connector.md#r1c--end-to-end-repairs) [no look] | Sol Max | 2026-11-10; export failure closed; 1 affected e2e and 978 unit cases passed |
| R1d | Run accessibility and scoped prototype comparison once; record findings. [R1d](implementation/chat-task-connector.md#r1d--accessibility-and-comparison) [look] | Sol xHigh | 2026-11-10; 16 comparisons; partial audit and findings assigned to R1e |
| R1e | Fix confirmed accessibility/visual findings and recheck their states. [R1e](implementation/chat-task-connector.md#r1e--audit-repairs) [look] | Astra xHigh | 2026-11-10; labels/landmarks fixed; 58 audit entries clear; coverage assigned R1eb |
| R1eb | Finish the 77 audit entries missed after emulator exhaustion, on fresh scoped stacks. [R1eb](implementation/chat-task-connector.md#r1eb--remaining-audit-coverage) [no look] | Astra xHigh | |
| R1 | Phase 1 review: prove requirements, close findings and prepare activation handoff. [R1](implementation/chat-task-connector.md#r1--final-phase-review) [no look] | Sol Max | |

## Owner steps after the run

- [ ] O1 *owner*: read the final evidence/limitations; enable `MCP_TASK_PLANS_ENABLED=1` in Vercel Production and redeploy. The existing secret and URL stay the same. Rollback: unset this flag and redeploy; this hides only the new tools and does not remove saved tasks.
- [ ] O2 *owner, when Claude is available*: confirm the custom connector is installed, reconnect/refresh it if the new tools are missing, and enable it in an ordinary chat. Test a real intended action in each category using the walkthrough, with the deal-follow-up skill off. These are owner acceptance actions, not automated production fixtures.
- [ ] O3 *owner, optional for the generic flow*: upload the rebuilt `docs/skills/deus-deal-followup.zip` to update that skill; its old-tool fallback continues to work before activation. Previous-plan O2–O4 remain historical owner steps, not evidence they were performed.

## Model rationale

Sol xHigh handles pure logic and deterministic checks. Sol Max handles writes, protocol exposure, instructions
and code reviews. Astra xHigh owns the visual finish. Fresh sessions and adversarial cases replace unavailable
Claude reviews for this run; do not use Astra Max or quietly fall back to Claude.

## Planning validation — 2026-11-10

A fresh Astra xHigh critique was applied: legacy task type, source-link storage, retry precedence and parked-task
return dates now have explicit acceptance cases. `autorun check` recognizes 16 GPT rows and selects G01 on
Sol xHigh; it correctly reports O0 still open. Local links/anchors and archive preservation were checked.
O0 was subsequently completed on 2026-11-10; app implementation progress is recorded in the task rows above.
