@AGENTS.md

# Git workflow

Every change goes straight to `main`, except the UI rebuild in **UI redesign** below, which uses the `redesign` branch and its lane branches. Do not create other feature branches, and do not wait to be asked.

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
- At the start of each redesign session, check the model against the plan's "Picks per step" (or §7.0 in the implementation plan during the rebuild), using the table in `~/.claude/CLAUDE.md`. If the current model is lower, say so and suggest switching.
- When the owner says **"Import the approved design"**: run `redesign/studio.sh import`, confirm `redesign/design/` arrived, tick the step it belongs to (5b, or the matching rows in `needs.md` and §9.1), and offer the next step.
- Rebuild (Step 7): work only on the `redesign` branch or a lane branch (`redesign-lane-1` to `-3`), one task per session, reading only that task's plan section, design-guide section and prototype file. Never copy markup, CSS, names or wording from the old UI.
- Lanes: `redesign/lanes.md` says which lane (terminal, folder `../deus-team-tasks-l1` to `-l3`) builds which task, with which model and effort. At the start of a session in a lane, check the branch is that lane's, then `git fetch origin && git merge origin/redesign`. Stay in your lane: only your own tasks, never `main` or `redesign` checked out there. Deliver each finished task with `git push origin HEAD:redesign` after merging `origin/redesign` (fast-forward only, never force).
- After every rebuild task: tick its **Done** box in the implementation plan's §7.0 table (date, lane and commit) and its box in `redesign/lanes.md`, in the same commit as the work, and nowhere else. The phase review ticks §5, §6 and §10 and the phase in `redesign/redesign-plan.md`'s checklist. Add a one-to-three-line entry to `CHANGELOG.md`, never to `CLAUDE.md` or `AGENTS.md`.
- Checks per task are the light ones in §7.0; the full end-to-end suite runs at phase reviews.
- Design gaps: add them to §9.1 of the implementation plan, then write them as needs in `redesign/handoff/needs.md` (the design-gap loop). Never fill a gap from the old app.
