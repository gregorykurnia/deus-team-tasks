# GPT-only autorun — completed 2026-11-10

Installed and pushed in the shared config repo (`~/.claude`), commit `e120a15`.
The app plan's O0 prerequisite is complete. The owner authorized both this change and starting the app plan.

```sh
cd /home/ubuntu/deus-team-tasks
AUTORUN_GPT_ONLY=1 autorun check docs/IMPLEMENTATION_PLAN.md
AUTORUN_GPT_ONLY=1 autorun all docs/IMPLEMENTATION_PLAN.md
```

The runner saves this mode for the project's resumes and keepalive restarts. Later terminals can use
`autorun status`, `autorun watch` and `autorun stop` normally. The last command stops after the current task.
To deliberately start a later mixed-model run after this run ends, use `AUTORUN_GPT_ONLY=0`.

## What changed

- `scripts/autorun.sh`: GPT-only preflight and final dispatch guard; Sol/Terra retry on Astra xHigh, Astra retries
  on Sol Max. Visual checks use the same GPT selection. Codex quota exhaustion follows bounded wait/stop with
  no Claude handoff. Background launch explicitly passes the mode; status/recap identify it.
- `scripts/autorun-keepalive.sh`: restores the saved mode after a crash. Existing owner stops, recap detection,
  one-retry limit and unfinished-review protections remain in place.
- `scripts/claude-usage-guard.sh`: does not pause a GPT-only run when Claude's quota is exhausted.
- `scripts/test-autorun-gpt.py`: 13 offline regression checks using disposable repos, stub executables and no
  model API or network calls. Normal mixed-model execution remains covered.

## Verification

All 13 checks passed in 2 seconds: model selection/labels, persistent mode, invalid mode rejection, Claude-row
rejection, saved-Claude-session rejection, actual stub attempt/retry/resume, bounded quota stop, visual finding
returned to the GPT builder, complete inner run with a failed first try, explicit tmux environment, keepalive
restart and recap stop, normal mixed-mode dispatch, and Claude usage-guard exclusion.
Two key checks were also run against the original runner and failed as expected: it chose Opus for GPT retries
and accepted Claude plan rows despite the requested GPT-only mode. The updated scripts pass `bash -n` and
`git diff --check`; installed files match the tested copies. Final diff review found no remaining blocker.
No shared rule or model table changed, so regenerating global instructions with codex-sync was unnecessary.
