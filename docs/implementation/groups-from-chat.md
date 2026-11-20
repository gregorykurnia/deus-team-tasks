# Build brief: task groups from a Claude chat

This brief holds the details for `docs/IMPLEMENTATION_PLAN.md`. Only that plan holds progress ticks. Every default
below is settled for an unattended run, so no task stops to ask.

## What the owner asked, and the smallest design

> "So rn the mcp still can't from chat mass assign tasks into a group and can't do anything to groups like create or
> edit or delete groups yeah? Can u make quick autorun plan to update the mcp to do that" (2026-11-20)

What already exists: `find_tasks`, `preview_task_changes` and `apply_task_changes` edit up to 50 tasks per save, page
with `offset` / `total`, and return each task's group. None of them can change a task's group, and no tool lists or
changes groups. The app already does all of it (`lib/taskGroups.ts`, `moveTasksToGroup` in `lib/taskWrites.ts`).

**Smallest design:** two small group tools, then one more field on the edit tools; no new screens. The group tools come
first, so the edit tools' guidance never points at a tool that isn't live yet.
1. **List groups:** `list_task_groups` (reads only): each group's id, name, starred, open tasks and all tasks.
2. **Change a group:** `change_task_group` with `action` `create`, `rename`, `star`, `unstar` or `delete`. It does what
   the app's buttons do, with the same rules and wording.
3. **Move tasks into a group:** `set.taskGroup` in `preview_task_changes` / `apply_task_changes`: a group name, or
   `null` for no group. It rides on the existing preview, seen stamps, warnings, batches of 50 and `alreadySaved`.
   `find_tasks` gets an optional `group` filter so chat can list a group's tasks, or the tasks with no group.

Safeguards beyond that, each with the risk it closes:
- **Rename and delete are one atomic write**, not the app's chunked batches. A transaction re-reads every member task
  and the group's records, then writes them all or nothing. Risk closed: a stop part way leaves tasks split between two
  names, and the next call can't finish it (the count no longer matches, and the new name is "taken"). Groups over 400
  tasks refuse with "Rename or delete this group in the app". None comes close today.
- **Rename and delete take the group's `taskCount`** from `list_task_groups`, and refuse if it has changed. Risk closed:
  the owner confirms "delete X (4 tasks)" and 9 tasks end up ungrouped. It checks the number only, not which tasks:
  the owner confirms a number, not a list, so a swap of one task for another between the two calls is accepted.
- There is no preview token and no receipt. A repeat call is safe: a rename to the name the group already has, or a
  delete of a group that is gone, returns `alreadyDone: true`.

Settled defaults:
- **Group names** match case-insensitively against existing groups and names only tasks still carry
  (`groupNamesInUse`), and are stored in the existing spelling. A name that matches nothing is an error that lists the
  existing names and says to create the group with `change_task_group` first. Moving never creates a group by itself:
  apply checks the group still exists inside its transaction, and refuses if it was renamed or deleted after the
  preview.
- **Create:** the name is required and unique ignoring case (`groupNameProblem`); `starred` is optional and defaults to
  false. The record matches the app's: `{ name, order: Date.now(), starred }`.
- **Rename:** the group's tasks follow the new name (done tasks too), and every record with the old name is renamed
  (`groupRecordIds`' rule). A case-only rename (`ops` → `Ops`) is allowed, as in the app (`exceptId`). Renaming onto
  another group's name (any case) is an error.
- **Delete:** every task carrying the name, done ones included, loses its group; company tasks keep their company.
  Every record of the name is removed. Chat says how many tasks will be ungrouped before asking. The wording follows
  the app's delete dialog.
- **Star / unstar** is "mark as important" in the app's words. Chat says "important", not "starred". It sets every
  record of the name. On a name with no record, it creates the record (`order: Date.now()`).
- **Groups with no record** (a name only tasks carry) show in `list_task_groups` with `id: null` and can be renamed,
  deleted or starred by name. Duplicate records of one name show as one row.
- **Counts:** `taskCount` is every task carrying the name, done included, and is what the guard checks. `openTasks` is
  what chat tells the owner next to the group's name.
- **Writes** go through `toTaskUpdate`, as the app's group writes do. A rename or move changes the task, so an open
  preview of that task goes stale and must be redone. That is intended.
- **Subtasks:** the app's Move to group moves exactly the chosen tasks, and so does `set.taskGroup`. The guidance has
  chat add a moved main task's open subtasks to the list by default, because new subtasks take their main task's group
  (`newSubtask`). They show in the preview table, and the owner can take them out.
- **"All tasks of company X into group Y"** works like bulk Responsible: pick the company by ID, page until
  `hasMore` is false, open tasks only (parked included and marked), done tasks only when asked, batches of 50, one
  compact table with task, main task and group before → after.
- **`find_tasks` `group`:** a name matches as above, and an unknown name is the same error. `group: null` finds tasks
  with no group. Either is enough on its own, and either combines with the other filters.
- **Calendar and notifications:** a group change sends no push and touches no calendar event. The tests assert it.
- **Same flag:** the new tools register only when `MCP_TASK_EDITS_ENABLED=1`, like the edit tools. The new inputs are
  optional, so leaving them out behaves exactly as today.
- **Confirmation:** every `change_task_group` call needs the owner's explicit yes in chat to the exact action and name
  (and the open and total task counts for a rename or delete). The tool descriptions say so.

**Out of scope** (follow-ups for the owner to pick): choosing a group in `add_task_plan` for a new main task; reordering
groups; merging two groups into one; renaming or deleting groups over 400 tasks from chat; a group's own colour or
description.

## Requirements

| ID | Required behavior | Built / proven in |
|---|---|---|
| G-P1 | Chat can move many tasks into a group, or out of every group, previewed first, in batches of 50. | G2, E1 |
| G-P2 | Chat can list every group with its task counts, and a group's tasks or the ungrouped ones. | G1, G2, E1 |
| G-P3 | Chat can create, rename, mark important / not important, and delete a group, with the app's rules. | G1, E1 |
| G-P4 | A rename or delete is all or nothing, and refuses if the group's task count changed since the owner saw it. | G1, E1 |
| G-P5 | Tasks moved from chat show under the group in the app. | E1 |
| G-P6 | Leaving the new inputs out behaves exactly as before. | G2, R1 |
| G-P7 | Every automated check uses the emulators, the fake push and the fake calendar. | all |

## Checks

Per task: `npx tsc --noEmit`, `npx eslint <changed files>`, `npm run test:unit` and `npm run test:data` (both build
tasks touch Firestore). G1 also runs `npm run mcp:smoke -- --only=protocol` (tool listing). Run one test stack at a time,
and stop only the PIDs you started. Record each task's evidence in `docs/implementation/groups-from-chat-results.md`
under its ID.

## G1 — The group tools

Lets chat list groups and create, rename, mark important or delete one.
Read **Smallest design** and **Settled defaults**, `lib/taskGroups.ts` (all of it), `lib/taskEditTools.ts` (`runTool`,
`registerTaskEditTools`), `lib/taskEditServer.ts` (how it reads and transacts with the server `db`) and
`app/api/mcp/[secret]/route.ts` (where tools register). New files are `lib/taskGroupServer.ts` and `lib/taskGroupTools.ts`.
Reuse `groupNameProblem`, `groupNamesInUse` and `sortGroups`; don't copy them. If `lib/taskGroups.ts`'s browser-only
parts get in the way, move the pure ones into a shared module.
- `list_task_groups`: groups in the app's order (`sortGroups`), each with `id` (or `null`), `name`, `starred`,
  `openTasks` and `taskCount`. It reads only.
- `change_task_group`: `{ action, name, newName?, starred?, taskCount? }`. `create` needs `name`. `rename` needs `name`,
  `newName` and `taskCount`. `star` and `unstar` need `name`. `delete` needs `name` and `taskCount`. It returns what
  changed (`created`, `renamed`, `tasksMoved`, `tasksUngrouped`) or `alreadyDone: true`.
- Both register under `MCP_TASK_EDITS_ENABLED`. Their descriptions carry the confirmation rule and the "important" wording.
- `docs/skills/README.md`: one line on the new tools, next to the edit tools.

Done when (data tests in `lib/taskGroupServer.data.test.ts`, unit tests for the descriptions):
- Create `Partners` saves a record that the app's own `taskGroupsQuery()` / `toTaskGroup` read back; creating
  `partners` again is the "already exists" error.
- Rename `Partners` → `Allies` with the right `taskCount` (one of its tasks done) moves all its tasks, done one included,
  and every record. With a stale count it refuses and nothing changes. The same rename again returns `alreadyDone: true`.
- A forced failure inside the rename transaction leaves every task and record on the old name.
- Rename `ops` → `Ops` works; rename onto another group's name (any case) is an error, and nothing changes.
- Delete with the right count ungroups all its tasks, done ones included (company tasks keep their company), and
  removes every record of that name. A second delete returns `alreadyDone: true`.
- A name only tasks carry shows with `id: null`. Renaming it moves its tasks; starring it creates its record. Two
  records of one name show as one row, and star sets both.
- Star then unstar flips `starred`, and `list_task_groups` puts starred groups first.
- After a rename and a delete, the fake push queue and the fake calendar have nothing new.
- A group of 401 tasks refuses rename and delete with the "in the app" message.
- With the flag off, neither tool is listed (protocol smoke). Unit test: both descriptions say an explicit yes is needed
  and use "important", not "starred".

## G2 — Move tasks between groups in the edit tools

Lets chat put a whole list of tasks into a group, or take them out of every group.
Read **Smallest design**, `lib/taskEdit.ts` (`TaskEditFields`, `validateTaskChanges`, `buildTaskChanges`), `lib/taskEditServer.ts`
(`findTasks`, the context it reads, `applyTaskChanges`), `lib/taskEditTools.ts` (zod inputs, `TASK_EDIT_CHAT_GUIDANCE`) and
`lib/taskGroupServer.ts` from G1 (reuse its name matching).
- `set.taskGroup: string | null` in the validator, the zod schema and the preview. The server resolves the name (see
  **Settled defaults**). The stored field is `taskGroup`; `null` deletes it, as `toTaskUpdate({ taskGroup: undefined })` does.
- A task already in that group lands in `unchanged`, as with Responsible additions.
- `find_tasks`: optional `group` (a name, or `null` for no group), as in **Settled defaults**.
- Guidance: one short paragraph in `TASK_EDIT_CHAT_GUIDANCE` (list groups with `list_task_groups`; the bulk steps; the
  subtask default; group before → after in the table).

Done when (unit tests in `tests/unit/taskEdit.test.ts`, data tests in `lib/taskEditServer.data.test.ts`):
- `set.taskGroup: "ops"` on 3 tasks with a group `Ops` previews and saves `Ops` on all 3; a task already in `Ops` is in `unchanged`.
- `set.taskGroup: null` removes the field; the saved task has no `taskGroup`.
- `set.taskGroup: "Opps"` is an error naming the existing groups, and nothing is saved.
- The group is renamed between preview and apply: apply refuses, nothing is saved, and no record-less group appears.
- A task moved into another group between preview and apply makes apply refuse, and nothing is saved.
- Retrying an applied group move returns `alreadySaved: true` and writes nothing.
- `find_tasks` with `group: "ops"` returns only that group's tasks, pages with `offset` and has the right `total`;
  `group: null` returns only ungrouped tasks; an unknown name is the error.
- After a move, the fake push queue and the fake calendar have nothing new.
- Calls without the new inputs return the same results as before (existing tests pass unchanged).

## E1 — End to end on the emulators

Proves the whole flow through the connector the way chat will use it, and that the app shows the result.
Read `scripts/mcp/task-edit-smoke.mjs`, `scripts/mcp/smoke.mjs` and the first two tests of
`tests/smoke/chat-task-edits.spec.ts` (how they call the MCP over HTTP and then open the app).
1. **Smoke section** in the task-edit smoke. Every step below is an assertion, not a log line:
   - Create group `Smoke Partners`. A fictional company has 55 open tasks (50 main tasks, 5 of them with one open
     subtask each, one main task parked) and one done task.
   - Page through them with `offset`, add each moved main task's subtasks as chat would, and move all 55 in two
     batches (50 and 5).
   - `list_task_groups` shows `openTasks: 55`; all 5 subtasks are in the group; the done task is untouched.
   - `find_tasks` with `group` returns the 55. Move 2 out with `null`, and `group: null` finds them.
   - Rename to `Smoke Allies` with the count. Delete with a stale count refuses. Delete with the right count leaves 53
     tasks ungrouped and the company links intact.
2. **Browser check** in `tests/smoke/chat-task-edits.spec.ts`, a new test: create a group and move 3 tasks into it over
   HTTP, then open the app's tasks page for that group and see the 3 tasks there. Rename the group over HTTP, and the
   app's group list shows the new name.

Done when:
- `npm run mcp:smoke -- --only=protocol` passes with the new section, against the emulators only.
- `npx playwright test tests/smoke/chat-task-edits.spec.ts` passes, the new test included.

## R1 — Phase review

Hunts for faults the tasks' own tests let through, from the other model family.
Read this brief, the diff since the plan's commit and the results file. Look hardest at:
- a move running at the same time as a rename;
- groups with no record, and duplicate records;
- `alreadySaved` with `taskGroup`;
- tool descriptions or guidance that let chat change a group without a yes, or say "starred";
- the subtask default, against what the app shows for a subtask whose group differs from its main task's.

Run `npx playwright test tests/smoke/groups.spec.ts tests/smoke/tasks-screen.spec.ts`, the app's group screens, since
`lib/taskGroups.ts` may have moved. Make quick fixes only; the rest become R1.F rows. Write the owner handoff (reconnect,
live try) in the results file, and say a full check is worth running (shared `lib/` code changed).

Done when: each FINDING line is fixed or has a fix row, and the Playwright result is recorded.
