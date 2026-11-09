# Deal follow-up → Prospects tasks (MCP connector)

Written 2026-11-09 (Opus 5.5 High). Built by `autorun all`, one task per fresh session, on `main` (this project's rule;
every push goes live). The connector stays off in production until the owner sets `MCP_SECRET` (O1), so a half-built
state can't be reached.

## Goal
In a claude.ai chat, after the `deus-deal-followup` skill writes a deal plan, Claude offers to add it to Deus Team
Tasks. It finds the company, shows the steps with their dates and owners, and writes only after the owner confirms
the company and every date. Result, for the Mayora sample: one task **"Mayora Indah Follow Up"** linked to the
company (so it shows under Prospects), with six subtasks ("Ask budget date and owner" 2026-11-10 → 11-13, …, "Ask for a
2027 budget slot" 2027-02-08), each holding its What / Why / Bring / Watch / Done when in Key points.

**Won't change:** task, company and subtask storage (existing fields only: `task`, `taskType`, `keyPoints`,
`startDate`, `endDate`, `responsible`, `linkedClientId`, `parentId`, `order`), any screen, Firestore rules.

## Decisions (defaults; the owner can override before the run)
- **Where it runs:** a remote MCP server inside this Next.js app, `app/api/mcp/[secret]/route.ts`, Streamable HTTP,
  stateless (no Redis). Added in claude.ai as a custom connector; works in claude.ai web, phone and Claude Code.
- **Access:** the URL carries a long random secret (`MCP_SECRET` env var, constant-time compare). No secret set, or a
  wrong one → 404. Writes use the same Firebase web config the app uses.
- **Tools (three):**
  1. `find_company(query)` → up to 5 matches from the pipeline: id, name, group (Active / Raw / On hold / Deal done),
     PIC, and any open "<Company> Follow Up" task with its subtasks.
  2. `preview_followup_plan(plan)` → writes nothing; returns exactly what would be written plus warnings (date not
     yyyy-mm-dd, start after end, a date in the past, company is Deal done so it would show under Clients, a
     follow-up task already exists).
  3. `add_followup_plan(plan)` → writes the parent and all subtasks in one batch (all or nothing); returns the link
     `https://<app>/tasks?task=<parentId>`. Its description says to call it only after the owner confirmed the company
     and each date in chat.
- **Parent task:** "<Company name as stored> Follow Up", type "Follow Up", dates = first start → last end, Key points =
  the deal plan's short answer (plus the Claude Doc link when there is one).
- **Subtasks:** the dated steps of "Path to …" only (not the slips or side opportunities). Name = step name, Key points
  = What / Why / Bring / Watch / Done when. A one-day step ("around Feb 8") has the same start and end.
- **Owners:** nobody goes in Responsible (owner, 2026-11-09): parent and subtasks are written with `responsible: []`
  and `informed: []`. The step's owners stay as a line in its Key points ("Owner: Greg with Ansevana").
- **Company not found:** nothing is written; Claude asks the owner to add it under Prospects first, then retries.
- **Follow-up already exists** (a later meeting): the preview says so and Claude asks; on yes, the new steps are
  added under the existing parent and its end date moves out if needed. Old steps are never changed or deleted.
- **Tests never touch live data:** unit tests are pure, data tests run on the emulator (`npm run test:data`), the
  smoke script runs `next dev` with `NEXT_PUBLIC_USE_EMULATOR=1`. Fixtures use a made-up company, never the real
  deal plans (they're internal).

## Phase 1: connector

- [x] F1 Plan logic, `lib/followupPlan.ts` + `lib/followupPlan.test.ts`: input type and validation, company matching (case, "PT"/"Tbk"/punctuation ignored, best first), building the parent and subtask `NewTask` docs (reuse `newSubtask` from `lib/subtasks.ts`), the warnings above, adding to an existing parent. Read `lib/types.ts`, `lib/subtasks.ts`, `lib/kinds.ts`, `lib/companies.ts` (`companyGroup`). Done when: `npm run test:unit` passes with a test per warning, per decision bullet above, and a six-step fixture that builds 1 parent + 6 subtasks with the right dates · Sol xHigh: pure logic with a pass/fail check (Terminal Bench 17, FrontierCode 11; 9 min a task)
- [x] F2 Server reads and the write, `lib/followupServer.ts` + `lib/followupServer.data.test.ts`: read pipeline companies (`clientsDb`) and tasks (`db`) from Node, write parent + subtasks in one `writeBatch` (or only subtasks + the parent's end date when adding to an existing one). No `navigator` in this path (`assertOnline` is browser-only). Read "Data" in `redesign/ui-implementation-plan.md` §2, `lib/taskWrites.ts`, `lib/emulator.ts`. Done when: `npm run test:data` passes: a write lands in full, a failing write leaves nothing, adding to an existing parent keeps its old subtasks untouched · Sol Max: writes shared data from a server; FrontierCode 7 against Astra xHigh's 6 for about a sixth of the weekly limit (owner, 2026-11-09)
- [ ] F3 MCP route, `app/api/mcp/[secret]/route.ts` + `scripts/mcp/smoke.mjs` + `npm run mcp:smoke`: the three tools with the descriptions in Decisions, secret check (404 without `MCP_SECRET` or on a wrong one), JSON-RPC errors in plain words. Read the route-handler guide in `node_modules/next/dist/docs/` first; use Vercel's `mcp-handler` with `@modelcontextprotocol/sdk` (exact versions, Streamable HTTP only) unless the docs show it breaks on Next 16.3. The smoke script starts `next dev` on emulator ports, lists tools, runs preview then add with the F1 fixture, checks the wrong-secret 404, and stops only what it started (by PID). Done when: `npm run mcp:smoke` passes, then `npx tsc --noEmit`, `npx eslint` on changed files, `npm run build` · Sol Max: a new outside door that writes data; near Astra on coding (Terminal Bench 14, FrontierCode 7) at about 1% of the weekly limit
- [ ] F4 Skill update, `docs/skills/deus-deal-followup/SKILL.md` (copy of the synced skill at `~/.claude/skills/synced/*/deus-deal-followup/`, references unchanged) with a new "Step 5 - Add to Deus Team Tasks": only when the connector's tools are present; offer after the doc; `find_company`, then a table of steps (name, start, end, owners) and the company match, asking the owner to confirm or correct the company and each date; `preview_followup_plan`; fix warnings with the owner; `add_followup_plan`; reply with the link. Also `docs/skills/README.md`: how to zip and upload it, and how to add the connector URL in claude.ai. Done when: the zip is built at `docs/skills/deus-deal-followup.zip` and the new step names the three tools exactly as F3 registered them · Opus 5.5 High: instructions people and Claude read closely (Presentation 15, Rubric 14)
- [ ] F5 End-to-end: extend the smoke run to open `/tasks?task=<parentId>` in Playwright (emulator), screenshot the parent and one opened subtask. [look] Done when: the screenshot shows "<test company> Follow Up" under Prospects with "0/6 subtasks" and no one in Responsible, and the opened subtask shows its dates and the Owner / What / Why / Done when text, on desktop and phone width · Sol xHigh: check run judged by a screenshot (9 min a task)
- [ ] R1 Phase 1 review: diff of F1–F5 for data loss, double writes (a retried `add` must not create a second parent: same company + same title in the last 10 minutes → return the existing one), the secret check, date handling across the year end, and tool descriptions that could let Claude write before confirming. Fix what it confirms; rerun only the checks the fixes touch · Opus 5.5 High: review by the other family after Codex-built work

## Owner steps (after the run)
- [ ] O1 *owner* Vercel → Settings → Environment Variables: add `MCP_SECRET` (Production) = output of `openssl rand -hex 24`; redeploy.
- [ ] O2 *owner* claude.ai → Settings → Connectors → Add custom connector: `https://<app domain>/api/mcp/<MCP_SECRET>`.
- [ ] O3 *owner* claude.ai → Skills: replace `deus-deal-followup` with `docs/skills/deus-deal-followup.zip`.
- [ ] O4 *owner* Real try: run the skill on the Mayora meeting, confirm, then check in the app that "Mayora Indah Follow Up" shows under Prospects with six subtasks and that opening one shows its description.

## Later (not in this plan; pick if wanted)
- Create the company from chat when it isn't found.
- Update or tick existing steps from chat after a later meeting.
- A task type per subtask (Trial Pending, Send Proposal/Quote) guessed from the step.
