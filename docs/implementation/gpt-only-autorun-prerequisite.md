# GPT-only autorun prerequisite

The owner requested a GPT-only takeover while Claude is out of quota. On 2026-11-10 the installed
`~/.claude/scripts/autorun.sh` has no GPT-only option: `retry_model`/`retry_label` select Opus after GPT failures,
`fresh_eyes` uses that same selection, and `wait_for_claude` can hand a Codex quota failure to Claude.
`LOOK_CHECKS=0` would disable required checks and is not a solution.

This is a separate shared-tooling task, not app implementation. Make the change in the `~/.claude` config repo
following its own instructions; do not copy or shadow the runner in `deus-team-tasks`. No runner code has been
changed by this planning task. This file is a handoff, not an executable app-plan row.

**Pick: Sol Max.** Add an opt-in, per-run GPT-only mode; preserve the normal mixed-model behavior by default.
The proposed interface is `AUTORUN_GPT_ONLY=1` (it does **not** exist yet).

Required behavior:

1. `autorun check` identifies the mode and refuses open Claude task picks. Initial attempts, resumes, the one
   retry, look-check redo, fresh-eyes session, fix session, quota handling and the final recap must never launch
   `claude` in this mode. Retry/fresh eyes: Sol or Terra → Astra xHigh; Astra → Sol Max. Keep the existing one-retry
   limit and all evidence checks; a GPT-only retry is a different model, not a different model family.
2. On Codex quota exhaustion, retain the existing bounded wait/stop behavior without a Claude handoff. Say what
   stopped and when it can resume. Keep explicit owner stop and unfinished-phase-review protections intact.
3. Preserve the option through the background/tmux launch, resumed runs, `autorun answer`, and
   `scripts/autorun-keepalive.sh` restarts. The keepalive remains required; an intentional quota stop with a recap
   must not become an endless restart. Persist per-run state if needed rather than relying on a new terminal's env.
4. Tests use stub `claude`/`codex` executables and disposable repos, never real model calls: success, failed first
   attempt, unavailable Codex, look check with a reported fault, resume, keepalive restart and ordinary mixed mode.
   In GPT-only cases the Claude stub must fail the test if invoked. Check reported model labels match execution.

Read the runner header, `usage`, `preflight`, `retry_model`, `retry_label`, `attempt`, `fresh_eyes`,
`wait_for_claude`, main dispatch and keepalive before editing. Use the shared repo's existing tests when present.
Done when its shell/static checks and stub scenarios pass, the change is committed/pushed there, and
`~/.claude/scripts/codex-sync.sh` has run if the shared-rule change requires it. Save the commit and verified
launch syntax here, then tick O0 in the app plan in a separate app-repo commit.

After implementing and verifying that interface, the intended app launch will be:

```sh
cd /home/ubuntu/deus-team-tasks
AUTORUN_GPT_ONLY=1 autorun check docs/IMPLEMENTATION_PLAN.md
AUTORUN_GPT_ONLY=1 autorun all docs/IMPLEMENTATION_PLAN.md
```

Do not run these as a claimed GPT-only mode before the runner supports it: today an unknown environment
variable is ignored. This prerequisite needs no app secret, production access or Claude quota.
