@AGENTS.md

# Branches: work goes to `staging`, releases go to `main`
- `main` is production: Vercel deploys every push to `main`. It only moves in a **release**, when the owner says
  "release", "ship it", "go live" or "push to main". Never commit on `main`.
- `staging` is where finished work collects. Vercel ignores it (`vercel.json` turns its deployments off), so nothing
  goes live and no build is paid for. The project folder has `staging` checked out. (Switched 2026-11-24 to cut
  Vercel build costs: every push to `main` was a paid production build.)
- **At the start of every session**, run `git branch --show-current` and `git fetch origin`. The branch must be
  `staging` (if it isn't, `git switch staging`). Then run `git pull --ff-only origin staging`.

# Commit and push after every change (always automatic)
Commit and push to `staging` after every change, without asking first and without feature branches. This includes
edits to this file and to the plans.
1. Run the per-change checks (the "Checks" line under UI design). Docs, plans and this file skip them. Never commit a change that
   breaks a check.
2. Stage only the files changed for that task (`git add <paths>`). Never sweep in unrelated files, `.env*`,
   `node_modules/` or `test-results/`.
3. Commit to `staging`. Write the message about what will be visible or different once released (the user-facing
   or behavioral effect), not a file or diff summary. End it with the `Co-Authored-By` line for the model.
4. Check `git log origin/staging..staging`, then `git push origin staging`.
5. In the final message, tell the owner the files touched, the user-facing effect, the commit hash, and how many
   commits aren't live yet (`git rev-list --count origin/main..origin/staging`).
- If a push is rejected, or the commit would include changes you didn't make, stop and tell the owner. Never
  force-push and never rewrite published history.

# Releasing to production (only when the owner asks)
Releases run on `staging`.
1. `git fetch origin` and `git pull --ff-only origin staging`. Show the owner what will go live:
   `git log --oneline origin/main..origin/staging`, summed up in plain words.
2. Full check: `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm run test:unit`, `npm run test:data`,
   `npm run test:smoke` and `npm run a11y`. Any failure caused by the code stops the release; fix it on `staging`.
3. If anything being released needs production data or settings changed (`firestore.rules` or indexes, Vercel
   env vars, `launch-data`, `leave:setup`, `people:*` or another script against the live project), stop and ask.
4. Push with exactly `git push origin staging:main` (the only form the owner's settings allow; if it's blocked,
   give the owner that command with `!` in front and say the allow rule is missing on this machine). It must be a
   fast-forward: if it's refused, `main` has commits `staging` doesn't; stop and tell the owner. Never merge the
   other way or force anything.
   - **"Release now"** (or "release it quick"): skip step 2 and push once the per-change checks and
     `npm run build` pass. Don't run step 2 afterwards; the next normal release or "full check" runs it once for
     every quick release since, and the final message says it's still owed. A change that writes or reads saved
     data in a new way, or needs step 3, takes a normal release.
5. Check that Vercel's production deployment succeeded (`vercel ls deus-team-tasks`) and the live site loads.
   Tell the owner the commit that's now live and what changed for users.

## UI design
- The UI is the blank-slate redesign, shipped 2026-10-21. Its design guide, tokens and prototype are in `redesign/design/` (`design-guide.md` first); new or changed screens follow them. The old UI is gone; never bring back its markup, names or wording.
- Checks (when to run which: the global "Light checks" rule). Per change: `npx tsc --noEmit`, `npx eslint <changed files>`, `npm run test:unit` (pure tests, no emulator), `npm run test:data` too when the change touches Firestore reads or writes (the tests that import `@/lib/firebase`), and `npx playwright test <the specs the change adds or edits, plus the spec of the page it's mainly about>` (`tests/smoke/`). The phone project runs only tests tagged `{ tag: "@phone" }`: give that tag to a test that checks the phone layout (it takes `isMobile`, skips on desktop, or checks the viewport). Full check, only when the owner asks ("full check"): `npm run test:smoke`, `npm run a11y`, and `npm run compare` for screenshots against the prototype (filtered to the states a change touches). A release puts every change live at once, so after a change to shared code (`lib/`, `ui/`), say a full check is worth running before the next release.
- Design gaps: add them to the open items in `redesign/ui-implementation-plan.md`, then write them as needs in `redesign/handoff/needs.md` for the studio. Never fill a gap from the old app.
- The studio is `../deus-team-tasks-studio`, a separate repo that never sees this codebase; its sessions start only with `./start` there. Never read from it, and never send anything into it except `redesign/handoff/` through `redesign/studio.sh enter`, after the banned-word scan on every file in `redesign/handoff/`. When the owner says **"Import the approved design"**, run `redesign/studio.sh import` and confirm `redesign/design/` arrived.
- On tmux, the studio runs on its own server (`tmux -L studio`). Never capture, read or send keys to its panes.
- Don't save memories that describe the current UI.
