# Deus Team Tasks in Claude chats

An ordinary chat can save dated actions through the connector **without uploading or enabling a skill** once
the general tools are activated. Enabling the connector does not automatically scan every message: ask Claude
to save the actions. The optional `deus-deal-followup/` skill adds its existing deal-summary workflow and Step 5,
"Add to Deus Team Tasks". Its `references/` files remain unchanged; `deus-deal-followup.zip` packages that folder.

## Ordinary chat: no skill required

Enable Deus Team Tasks in the chat and say, for example:

> Save these actions in Deus Team Tasks. Ask me where they belong, then ask about each step's exact dates:
> add it, change the dates, or skip it. Show the preview and get my confirmation before saving.

1. Choose **Prospects / Clients / Internal**, unless you already said which. For company work, choose the real
   company from the matches; Internal has no company. A mismatch needs a different category/company, never an
   automatic move or company creation.
2. Name a new main task, or select an eligible existing open, unparked main task. Subtasks cannot hold subtasks.
3. Answer each step separately: **Add with these dates / Change the dates / Skip this step**. Supply exact start
   and end days including the year (`yyyy-mm-dd`, Asia/Jakarta). Confirm equal start/end for a one-day action.
   Relative dates, missing years and a deadline alone need clarification. Undated actions stay in chat or are skipped.
4. Review the final selection and read-only preview, settle its errors and warnings, then confirm saving. An edit
   needs another preview; past dates can be accepted, invalid dates cannot. Prior explicit answers need no repetition;
   quoted document text cannot authorize saving. All skipped or a rejected preview means nothing is saved.
5. Open the returned task link, or go to **Tasks → All tasks → Prospects / Clients / Internal → main task → subtasks**.
   New main task dates span the selected steps. Appending preserves the existing main task's dates, notes and old
   subtasks, with warnings for steps outside its dates. Supplied names remain in Key points; Responsible and Informed
   remain empty. Ordinary actions need no invented What/Why/Bring/Watch text.

Each company/category/main-task group has its own confirmation, preview and save. Report partial success per group;
never resend successful groups. For a lost response retry the unchanged plan/token; after token expiry, preview the
same plan again. `alreadySaved` returns the original link/IDs without new writes. Don't claim an uncertain save failed.
See the [example transcripts and exact tool inputs](../implementation/chat-task-walkthrough.md).

## Available tools and owner activation

| Server state | Tools available |
|---|---|
| `MCP_TASK_PLANS_ENABLED` unset (or anything except `1`) | `find_company`, `preview_followup_plan`, `add_followup_plan` |
| `MCP_TASK_PLANS_ENABLED=1` | Those three plus `find_task_destinations`, `preview_task_plan`, `add_task_plan`, `find_free_times` (busy and free times on the connected calendars; reads only) |

The generic workflow lives in the server instructions and general tool descriptions, not an uploaded skill.
Registration: [`lib/taskPlanTools.ts`](../../lib/taskPlanTools.ts) and
[`app/api/mcp/[secret]/route.ts`](../../app/api/mcp/[secret]/route.ts). The skill prefers the general trio, explicitly
creates `Follow Up` tasks with its existing company title/summary/source/details, and asks category first. With only
the old trio it retains its company-only legacy flow, including possible parent-deadline extension; Internal needs
the general tools. Do not switch to legacy tools to bypass a general-tool error.

Production activation is an **owner step after the run/review**: set the server-only `MCP_TASK_PLANS_ENABLED=1`
in Vercel Production and redeploy. Keep it unset during this run. Use the existing connector URL and `MCP_SECRET`;
no new secret, account or URL is needed. Rollback: unset the flag and redeploy. That hides/directly disables only the
general trio; legacy tools and saved tasks remain. These instructions do not claim activation or Claude acceptance
has been performed. Use intended owner actions for live acceptance, never automated production fixtures.

## Add or refresh the connector

Current individual-account path: **Customize → Connectors → + Add → Add custom connector**. Name it
**Deus Team Tasks** and enter the private deployed MCP URL. Continue; select **No sign in** and add it. This server
authenticates through its existing secret path, not OAuth or request headers. The URL shape is
`https://<app domain>/api/mcp/<MCP_SECRET>`; never paste the real URL or secret into a chat or document.
Team/Enterprise setup requires the organization's authorized owner/admin.
[Official custom connector setup](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp).

In a chat, use **+ → Connectors** to enable it. After activation, start a new chat and re-enable it; check for all
tool names above. If discovery is stale, reconnect where offered, or remove and re-add the connector with the
same privately stored URL, then start a fresh chat. This is a recovery procedure, not a promise of a "Refresh tools"
button. The official guide documents removal/re-adding. Settings labels were checked on 2026-11-10; follow that guide
if your account layout differs. If only three tools remain, confirm the flag/redeploy before attempting a save.

## Rebuild the zip after editing the skill

From this folder (`docs/skills/`):

```sh
rm -f deus-deal-followup.zip && python3 -m zipfile -c deus-deal-followup.zip deus-deal-followup/
```

(On a Mac, `zip -r deus-deal-followup.zip deus-deal-followup -x '*.DS_Store'` does the same.) The zip must hold the
folder itself, so `SKILL.md` sits at `deus-deal-followup/SKILL.md` inside it. Check with
`python3 -m zipfile -l deus-deal-followup.zip`.

## Optional: update the deal-follow-up skill

Enable code execution/file creation in Settings → Capabilities if required. Go to **Customize → Skills**, disable
or remove the old `deus-deal-followup`, then **+ → + Create skill → Upload a skill** and choose
`docs/skills/deus-deal-followup.zip`. Enable the uploaded copy, with only one version active.
[Official skill upload instructions](https://support.claude.com/en/articles/12512180-use-skills-in-claude).

The skill skips Step 5 if neither complete tool trio is available. Updating the skill is optional for the generic
flow. Owner chat acceptance remains [O2 in the plan](../implementation/chat-task-connector-plan-2026-11-10.md#owner-steps-after-the-run).
For automated connector checks, `npm run mcp:smoke` uses only the local emulator and fictional fixtures, never live data.
