# Responsible from chat checks

## M1 — Bulk Responsible in the edit tools (2026-11-18)

`find_tasks` pages through ten matches at a time with `offset`, `hasMore`, and `total`. The count includes each main task and subtask once. `preview_task_changes` shows the Responsible changes and `unchanged` IDs. Pass the complete `preview.seen` map and the original change list to `apply_task_changes`. The save returns only the IDs that changed, so chat can target undo correctly.

DECISION!: Bulk saves record the changed IDs and follow-up targets in Firestore `settings` in the task transaction. A state comparison alone could mistake a matching manual edit for a saved batch. Fresh preview stamps let the owner reapply a change after undoing it.

HUNTED: ripple · Company pages include parked tasks and nested subtask details while counting each match once · 23-match paging test.
HUNTED: ripple · Task assignments and notification claims use the saved Responsible list · Emulator tests check co-owners, claim removal, and deliveries only for changed tasks. The Responsible-only save leaves calendar work untouched.
HUNTED: odd data · Blank and long names, missing lists, repeated spellings, and conflicting or unmatched removals · `taskEdit.test.ts` and MCP schema tests.
HUNTED: failure · Unconfirmed spelling, lost replies, and interruption after the task commit · Emulator tests check zero writes before confirmation, unchanged document timestamps on retry, and fake push recovery.
HUNTED: failure · A combined deadline save fails in the separate company database · Emulator rollback and retry restore the tasks and clear the failed receipt.
HUNTED: overlap · An unchanged task changes, an outside edit matches the preview, or two saves overlap · Emulator tests check whole-batch refusal, one successful write, and stale replay after undo.

- `npx tsc --noEmit` and ESLint on changed TypeScript and JavaScript files passed.
- `npm run test:unit` passed 1,678 tests. The first run hit the sandbox's `spawnSync … EPERM` restriction.
- `npm run test:data` passed 328 emulator tests.
- `npm run mcp:smoke -- --only=protocol` passed 127 preservation comparisons after the tool-list assertions were updated to include the existing `find_free_times`.
- `npm run build` and `git diff --check` passed. Playwright is deferred to the phase review under the run rules.

## M2 — One push per person per save (2026-11-18)

The dispatcher claims assignments per task, then sends each person one push for their newly claimed tasks in that call. A multi-task push opens Today. A single-task push keeps its message and task link.

DECISION: Match company IDs for a shared-company message because matching display names would combine distinct companies with the same name.

HUNTED: ripple · Chat saves and the app route use the same dispatcher, and the service worker opens Today or the linked task · Chat-save, route, and push worker tests.
HUNTED: odd data · Missing tasks and companies, blank names, duplicate IDs and spellings, previously claimed tasks, and long names · Fake-push tests verify counts and exact copy.
HUNTED: failure · One claim fails in a batch or the push response is lost before or after delivery · Emulator tests verify only unclaimed tasks send on retry.
HUNTED: overlap · Concurrent requests share a task, and an old delivery finishes after a page close and a newer assignment · Emulator tests verify each assignment is claimed once and the newer claims remain current.

- `npx tsc --noEmit` and ESLint on changed TypeScript files passed.
- The unit suite passed all 1,679 cases across two runs. The sandbox returned `spawnSync … EPERM` on one test, which passed when rerun on its own.
- `npm run test:data` passed 334 emulator tests.
- `npm run mcp:smoke -- --only=protocol` passed 127 database-preservation comparisons.
- `npm run build` and `git diff --check` passed. The full check is scheduled for R1.

## M3 — Responsible when saving a plan (2026-11-18)

`preview_task_plan` shows the resolved Responsible names for each step and the new main task. `add_task_plan` saves those lists after confirmation. The token binds the requested names and the spelling shown in the preview. Use `owners` for external names in step Key points.

DECISION: Use the first spelling when an unknown name appears several ways in a plan. A warning for every variant would ask the owner to confirm the same person several times.

HUNTED: ripple · Preview, task lookup and assignment notices use the same Responsible lists · MCP unit, Firestore and fake-push tests.
HUNTED: odd data · Missing, blank, repeated and long names · Preview validation tests exercise casing, spacing and the byte limit.
HUNTED: failure · A changed name, an unconfirmed new name or a refused last step · Token and emulator tests verify zero task or receipt writes.
HUNTED: failure · A response is lost after commit and a later edit clears a step's assignment · Fake-push test verifies one delivery and preserves the later edit on retry.
HUNTED: overlap · Concurrent identical saves and a flow spelling changes during a save · Emulator tests verify one task set and refusal of a stale preview.

- `npx tsc --noEmit`, ESLint on changed TypeScript files and `git diff --check` passed. The initial type check caught `TS2322` in the new test fixture's destination type. The corrected fixture passed.
- `npm run test:unit` passed 1,692 tests, including old plan tokens and calls with omitted Responsible.
- `npm run test:data` passed 339 emulator tests.
- `npm run mcp:smoke -- --only=protocol` passed 127 database-preservation comparisons.
- `npm run build` passed. The old assignment guidance is absent from the tool and README. The full check is scheduled for R1.

## M4 — The deal skill passes Responsible (2026-11-18)

Checked by reading `docs/skills/deus-deal-followup/SKILL.md`:
- Responsible column, "Not assigned" by default, no new question: line 116 (`# | Step | Start | End | Calendar | Responsible`, "don't ask who is responsible"; names accepted at any point in Step 5).
- Names only from the owner's words: line 16 ("No owners" keeps "never guess"; its one exception is Step 5's Responsible column, never filled from the transcript, speakers or team list) and line 119 (`responsible` only with names the user gave; `owners` for names outside DEUS).
- Appending never sends `responsible` for the main task: line 119 ("When appending (`existingParentId`), never pass `responsible` for the main task").
- Bulk offer after saving, only when the person covers the whole company: line 123 (step 8, offered once, company groups only, via `find_tasks` paging and `addResponsible` batches with confirmation).
- Legacy path leaves Responsible empty and says so: lines 136 and 146.
- Line 121: "Responsible and Informed stay empty" is now "Informed stays empty"; line 120 shows resolved names and `new-person` warnings.
- Worked examples P6 ("Audrey for all", new main task) and P7 (per-step names, appending) are in `chat-task-walkthrough.md` under "Optional deal-skill mapping".
- Zip rebuilt with the README command; the Done-when `diff` of the zipped SKILL.md against the folder prints nothing. `git diff --check` passed.

## E1 — End to end on the emulators (2026-11-18)

- `npm run mcp:smoke -- --only=protocol` passed 144 database-preservation comparisons with local Firestore and Auth, fake push and fake calendar. The first attempt hit `EPERM` on the loopback bind and passed with loopback permission.
- The connector found all 23 open tasks across three pages, including all three subtasks and the marked parked task. Adding Audrey in batches of 20 and 3 sent one push each. Removal kept Greg and sent no push. The done task and unlinked task stayed unchanged.
- The plan preview and saved records showed Audrey on the new main task and both steps. The fake inbox recorded one push for that save, including after retry.
- Type checking, ESLint on both smoke scripts, `git diff --check` and the build passed. Of 1,692 unit tests, 1,691 passed on the first run. The remaining test hit `spawnSync … EPERM` and passed on its targeted rerun. All 339 Firebase data tests passed.

## R1 — Phase review (2026-11-18)

Read the diff since `82e89cb`, then the tests, then this file. Hunted where the brief pointed:
- **Paging while tasks change.** `offset` over name-then-ID order. A rename between pages shows up as a duplicate
  (unique IDs ≠ `total`), but a task completed between pages could shift the next page past one task while the last
  page's unique IDs still equal its smaller `total`. Fixed in the guidance: start over if `total` changes between pages.
- **`alreadySaved` with add/remove lists.** Each membership preview adds one nonce to every stamp; apply refuses mixed
  nonces and writes a receipt (`settings/task-edit-<hash of changes + stamps>`) in the same transaction as the tasks.
  An exact retry returns the original changed IDs even after later edits; a failed company follow-up deletes the receipt
  with the restore. No fault found.
- **Push grouping under parallel saves.** Claims stay per task in their own transactions before any send, so two
  saves racing on the same task send it once; two saves on different tasks send one push each (one per save, as the
  brief allows). No fault found.
- **Skill text against "No owners".** Its one exception named only the Responsible column, while the legacy fallback
  in the same Step 5 still has an Owners column. Fixed: the exception names both; zip rebuilt, the Done-when `diff`
  prints nothing.
- Also checked: removal batches. A removal batch whose tasks don't have the person is an error by design; the guidance
  now sends `removeResponsible` only to listed tasks that have that person. Calendar events don't carry Responsible, so
  skipping calendar sync on membership-only edits is right. Subtasks inherit the company ID, so company paging finds them.

Checks: `npx tsc --noEmit` and ESLint on the changed files clean; `npm run test:unit` 1,692 passed;
Done-when zip `diff` empty. `npm run test:smoke`: all 456 tests covered, none failing. The single run hit the one-hour background limit at test 353 (338 passed, 14 skipped, 1 failed); the rest ran as `--project=phone` from `chat-task-edits` on (55 passed) and `--project=jakarta` (49 passed). The one failure, `task-sheet.spec.ts:15` (custom task types, desktop), came during a stretch of emulator connection errors in the log and passed alone; this phase didn't touch that screen.

### Owner handoff

1. **Reconnect (O1).** In Claude, start a new chat with Teams DEUS on; check `find_tasks` shows an `offset` input. If
   not, remove and re-add the connector as in `docs/skills/README.md`.
2. **Upload the skill (O2).** Customize → Skills: replace `deus-deal-followup` with `docs/skills/deus-deal-followup.zip`
   (rebuilt in R1).
3. **Live try (O3).** "Preview only: Audrey is responsible for all tasks related to Royal Golden Eagle". Pick the company
   by ID; check the count equals the open RGE tasks in the app and co-owners stay. Say save, open a few tasks, and check
   Audrey got one notification per batch (once O8 in the archived plan is done). "Undo that" removes her from only the
   tasks that changed.
