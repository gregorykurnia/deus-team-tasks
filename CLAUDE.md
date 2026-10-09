@AGENTS.md

# Git workflow

Every change goes straight to `main`. Do not create feature branches, and do not wait to be asked.

- After each change (code, docs, or config), commit it on `main` and push to `origin main` in the same turn.
- Write the commit message to describe what will be visible or different in the deployment (the user-facing or behavioral effect), not a file or diff summary.
- Stage only the files changed for that task. Never sweep in unrelated files.
- In the final message of the turn, tell the user what changed: the files touched, the user-facing effect, and the commit hash.
- If a push is rejected, or the commit would include changes you didn't make, stop and tell the user. Do not force-push or work around it with a branch.
