@AGENTS.md

# Git workflow

Every change goes straight to `main`, except the UI rebuild in **UI redesign** below, which uses the `redesign` branch. Do not create other feature branches, and do not wait to be asked.

- After each change (code, docs, or config), commit it on `main` and push to `origin main` in the same turn.
- Write the commit message to describe what will be visible or different in the deployment (the user-facing or behavioral effect), not a file or diff summary.
- Stage only the files changed for that task. Never sweep in unrelated files.
- In the final message of the turn, tell the user what changed: the files touched, the user-facing effect, and the commit hash.
- If a push is rejected, or the commit would include changes you didn't make, stop and tell the user. Do not force-push or work around it with a branch.

## UI redesign (blank-slate, in progress)
- The plan is `redesign/redesign-plan.md` (from `~/.claude/playbooks/blank-slate-redesign.md`). Design happens in `../deus-team-tasks-studio`, a separate repo that never sees this codebase. Studio sessions start only with `./start` there.
- Never read from the studio folder, and never send anything from this codebase into it, except `redesign/handoff/` through `redesign/studio.sh enter`.
- Before every `enter`, run the banned-word scan on every file in `redesign/handoff/`.
- Don't save memories that describe the current UI.
- At the start of each redesign session, check the model against the plan's "Picks per step" (or the implementation plan's task table during the rebuild), using the table in `~/.claude/CLAUDE.md`. If the current model is lower, say so and suggest switching.
- When the owner says **"Import the approved design"**: run `redesign/studio.sh import`, confirm `redesign/design/` arrived, tick the step it belongs to (5b, or the matching rows in `needs.md` and the implementation plan's open items), and offer the next step.
- Rebuild (Step 7): work only on the `redesign` branch, in one terminal, one task per session, reading only that task's plan section, design-guide section and prototype file. Never copy markup, CSS, names or wording from the old UI.
- After every rebuild task: run the light checks from the implementation plan, tick the task's **Done** cell in its task table (date and commit) in the same commit as the work, and push to `redesign`. The phase review ticks the phase in `redesign/redesign-plan.md`'s checklist. The full smoke suite runs at phase reviews.
- `redesign` merges into `main` only when the owner says so, after the Phase 4 review.
- Design gaps: add them to the implementation plan's open items, then write them as needs in `redesign/handoff/needs.md` (the design-gap loop). Never fill a gap from the old app.
