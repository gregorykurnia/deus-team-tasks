@AGENTS.md

# Git workflow

Every change goes straight to `main`. Do not create feature branches, and do not wait to be asked.

- After each change (code, docs, or config), commit it on `main` and push to `origin main` in the same turn.
- Write the commit message to describe what will be visible or different in the deployment (the user-facing or behavioral effect), not a file or diff summary.
- Stage only the files changed for that task. Never sweep in unrelated files.
- In the final message of the turn, tell the user what changed: the files touched, the user-facing effect, and the commit hash.
- If a push is rejected, or the commit would include changes you didn't make, stop and tell the user. Do not force-push or work around it with a branch.

## UI design
- The UI is the blank-slate redesign, shipped 2026-10-21. Its design guide, tokens and prototype are in `redesign/design/` (`design-guide.md` first); new or changed screens follow them. The old UI is gone; never bring back its markup, names or wording.
- Checks (when to run which: the global "Light checks" rule). Per change: `npx tsc --noEmit`, `npx eslint <changed files>`, `npm run test:unit` (pure tests, no emulator), `npm run test:data` too when the change touches Firestore reads or writes (the tests that import `@/lib/firebase`), and `npx playwright test <the specs the change adds or edits, plus the spec of the page it's mainly about>` (`tests/smoke/`). The phone project runs only tests tagged `{ tag: "@phone" }`: give that tag to a test that checks the phone layout (it takes `isMobile`, skips on desktop, or checks the viewport). Full check, only when the owner asks ("full check"): `npm run test:smoke`, `npm run a11y`, and `npm run compare` for screenshots against the prototype (filtered to the states a change touches). Every push here goes live, so after a change to shared code (`lib/`, `ui/`), say a full check is worth running.
- Design gaps: add them to the open items in `redesign/ui-implementation-plan.md`, then write them as needs in `redesign/handoff/needs.md` for the studio. Never fill a gap from the old app.
- The studio is `../deus-team-tasks-studio`, a separate repo that never sees this codebase; its sessions start only with `./start` there. Never read from it, and never send anything into it except `redesign/handoff/` through `redesign/studio.sh enter`, after the banned-word scan on every file in `redesign/handoff/`. When the owner says **"Import the approved design"**, run `redesign/studio.sh import` and confirm `redesign/design/` arrived.
- On tmux, the studio runs on its own server (`tmux -L studio`). Never capture, read or send keys to its panes.
- Don't save memories that describe the current UI.
