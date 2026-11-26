# Build brief: add prospects and assign PICs from a Claude chat

This brief holds the details for `docs/IMPLEMENTATION_PLAN.md`. Only that plan holds progress ticks. Every default
below is settled for an unattended run, so no task stops to ask.

## What the owner asked, and the smallest design

> "after want quick plan to allow MCP to: add prospects and mass assign PIC across prospects and all" (2026-11-26)

What already exists: the connector can find a company by name (`find_company`, 5 matches; `find_task_destinations`)
but can't create one: its guidance says "never move or create a company". The app now has a **PIC** field on every
company (`teamPic`, key `TEAM_PIC` in `lib/companies.ts`): one team member, stored by the name tasks use, picked from
the names on tasks and flow roles (`namesInUse` in `lib/people.ts`, `features/companies/useTeamNames.ts`): read tasks
and flows on the server the same way. Companies live
in the separate clients project (`clientsDb`, collection `pipeline`, one doc per company id); new ids come from the
counter in `allocateCompanyId` (`lib/companyWrites.ts`).

**Smallest design:** three tools on the existing connector, no new screens.
1. **List companies:** `list_companies` (reads only): filter by `group` (To approach, Active, Active clients and
   partners, No or not now, or all), `pic` (a name, or `null` for no PIC), `query` (name text) and `industry` (text
   contained in the industry). Filters combine. Each row: id, name, group, PIC, contact person, status, industry. Pages
   of 100 with `offset`, `total`, `hasMore`.
2. **Preview:** `preview_company_changes` (reads only) takes `{ add?: NewCompany[], setPic?: { pic, companyIds }[] }`
   and returns exactly what would be written: each new company with its group and fields, and each PIC change as
   company, PIC before → after. Errors and warnings as below. It writes nothing.
3. **Save:** `apply_company_changes` takes the same input plus `seenPics` (each listed company's PIC as the preview
   showed it) and writes it.

"Across prospects and all" means `setPic` works on any company in any group, clients included.

Safeguards beyond that, each with the risk it closes:
- **A preview before every save**, as the connector's other writes do. Risk closed: a mass change lands on the wrong
  companies, and there's no undo from chat. The preview is the list the owner says yes to.
- **`seenPics`:** required for every company in `setPic` (a missing one is an input error); apply refuses the whole
  save if any listed company's PIC differs from what the preview showed. Risk closed: chat overwrites a PIC someone
  changed in the app between the preview and the yes.
- **PIC must be a known team name** (matched ignoring case and spaces, stored in the existing spelling). An unknown
  name is an error listing the three closest names (`closestNames` in `lib/peopleInput.ts`). Risk closed: a typo
  creates a ghost person whose companies no filter finds.
- **A new company whose name matches an existing one in any group** (normalized: case, spaces and punctuation) is an
  error in the preview naming the existing company and its group, unless that row sets `allowDuplicate: true` after the
  owner said so. A close but not equal match (`matchingCompanies` in `lib/followupPlan.ts`) is a **warning** the preview
  lists and chat shows; it needs no flag. Two rows with the same normalized name in one call are an error. Risk closed:
  the same prospect added twice. At apply, a name that matches exactly (and has no `allowDuplicate`) is not added and is
  reported `alreadyExists` with that company's id and group: the preview refused it if it was there before, so at apply
  it means a retry or someone adding it meanwhile, and chat says "already there".
- There is no preview token and no receipt (left out by design, as in the group tools: the owner's yes in chat is the
  consent). The name check makes adding safe to repeat, and setting a PIC to the value it already has is a no-op
  reported as `unchanged`. Two applies at the same moment aren't guarded: one person chats, and Firestore can't lock a
  name across documents.

Settled defaults:
- **New company fields:** `company` (required), `group` (`toApproach` default, or `active`, `noOrNotNow`; never
  `dealDone`: a client is made by moving it in the app), `teamPic`, `pic` (contact person), `industry`, `sourcing`,
  `type`, `priority`, `status` (Active only), `notes`, `product`, `reach` (yyyy-mm-dd, To approach only). Only these keys;
  anything else is an input error. Group flags follow `groupFlags` in `lib/companies.ts`. An Active company with no
  status gets `Meeting Soon` and `date` = today (Asia/Jakarta), as the app's move dialog does; No or not now gets
  `answer: "Not now"`. `status` on a company that isn't Active, or `reach` on one that isn't To approach, is an input
  error, as is a malformed `reach`. "Today" is the Asia/Jakarta day (`wibToday`, as the task tools use). The stored doc
  holds exactly what the app's new company sheet would store for the same input: `id`, `company`, the group flags
  (`_raw`, `_hold`) and the given fields, nothing else.
- **Choice values** (`type`, `priority`, `status`) must be one of the current options in `settings/companies`
  (`readCompanySettings`); an unknown one is an error listing the options. Chat never creates an option.
- **Limits:** up to 50 new companies and 200 PIC changes per call. More is an error saying to split it.
- **Writes:** new companies each take an id from the counter (`allocateCompanyId`'s rule, server-side) and are
  created with a transaction that refuses an existing id, as `addCompany` does. All PIC changes go in one transaction
  on `clientsDb` that re-reads every listed company, checks `seenPics`, then writes `teamPic` (or deletes it for
  `null`). Adds and PIC changes in one call: adds first (each its own write), then the PIC transaction. On a failure
  the result lists `added` (name and id of each one saved), `notAdded` and whether the PIC changes were saved, so chat
  reports exactly what landed; repeating the call is safe (saved adds come back `alreadyExists`).
- **`setPic` with `pic: null`** clears the PIC. A company id that doesn't exist is an error naming it. The same
  company id twice in one call (in one entry or two) is an input error.
- **Group names in tool inputs and outputs** use the app's words: "To approach", "Active", "Active clients and
  partners", "No or not now" (`COMPANY_GROUP_LABELS`), mapped to the stored keys.
- **Confirmation:** `apply_company_changes` needs the owner's explicit yes in chat to the exact preview. For more
  than 10 PIC changes, chat shows a compact table (company, group, PIC before → after) and the count. The tool
  descriptions say so. When the new tools are registered (flag on), the connector guidance's "never move or create a
  company" becomes "create companies only with preview_company_changes / apply_company_changes; never move one"; with
  the flag off it stays as it is. Search every copy of that sentence (tool descriptions, guidance, `docs/skills/`).
- **Same flag:** the three tools register only when `MCP_TASK_EDITS_ENABLED=1`, like the edit tools, so no new
  Vercel variable. Nothing sends a push or touches the calendar.

**Out of scope** (follow-ups for the owner to pick): moving companies between groups from chat; editing other
company fields from chat; deleting companies; creating a new team member from chat.

## Requirements

| ID | Required behavior | Built / proven in |
|---|---|---|
| P-1 | Chat can add one or many prospects (To approach, Active or No or not now) with their details and PIC, previewed first. | C1a, C1b, C2, E1 |
| P-2 | Chat can set or clear the PIC on many companies in any group at once, previewed first. | C1a, C1b, C2, E1 |
| P-3 | Chat can list companies by group, by PIC (or no PIC) and by name, to choose which to change. | C2, E1 |
| P-4 | A PIC is always a known team member; a repeat add never makes a second copy; a PIC changed in the app since the preview stops the save. | C1a, C1b, E1 |
| P-5 | What chat saves shows in the Prospects page as if added in the app. | E1 |
| P-6 | Every automated check uses the emulators; nothing touches production. | all |

## Checks

Per task: `npx tsc --noEmit`, `npx eslint <changed files>` and `npm run test:unit`; C1b and C2 also run
`npm run test:data` (they touch Firestore). C2 also runs `npm run mcp:smoke -- --only=protocol` (tool listing). Run one test stack at a time, and
stop only the PIDs you started. Record each task's evidence in `docs/implementation/prospects-from-chat-results.md`
under its ID.

## C1a — Checking and previewing (pure)

Decides what a chat request would add or change, and refuses what it shouldn't, without reading or writing anything.
Read **Smallest design** and **Settled defaults**, `lib/companies.ts` (`groupFlags`, `TEAM_PIC`, `COMPANY_GROUP_LABELS`),
`lib/companySettings.ts` (`readCompanySettings`), `lib/companyEdit.ts` (`newCompanyFields`, `parseValue`),
`features/companies/CompanyInputs.tsx` (`storedValues`), `lib/people.ts` (`namesInUse`), `lib/peopleInput.ts`
(`personNameKey`, `closestNames`) and `lib/followupPlan.ts` (`matchingCompanies`). New file: `lib/companyChat.ts`, pure
functions that take the companies, tasks, flows, settings and today as arguments. Reuse the helpers named above; if a
browser-only import gets in the way (`storedValues` lives in a client component), move the pure part into a shared
module instead of copying it.

Done when (unit tests in `tests/unit/companyChat.test.ts`):
- Two new To approach companies with PIC `maya chen` preview with PIC `Maya Chen` (the spelling on tasks) and the
  exact doc each would store: the same keys and values the app's new company sheet stores for that input
  (`storedValues` + `groupFlags`), checked for To approach, Active and No or not now.
- A new Active company with no status gets `Meeting Soon` and `date` = the `today` passed in; No or not now gets
  `answer: "Not now"`; `dealDone` as a group, `status` outside Active, `reach` outside To approach or malformed, and an
  unknown key are input errors.
- An unknown PIC is an error with up to three closest names; an unknown `type`, `priority` or `status` lists the options.
- An existing name (any case, spacing or punctuation, in any group, clients included) is an error naming it; with
  `allowDuplicate: true` it passes. A close match is a warning only. Two rows with one name in a call are an error.
- `setPic` previews company, group, PIC before → after, and `unchanged` for a company already on that PIC; `pic: null`
  previews a clear; a missing company id or the same id twice is an error; a missing `seenPics` entry is an error.
- 51 adds or 201 PIC changes are refused with the "split it" message.

## C1b — Saving (server)

Reads what the checks need from the database and saves new companies and PIC changes safely.
Read **Smallest design** and **Settled defaults**, `lib/companyWrites.ts` (`allocateCompanyId`, `addCompany`),
`lib/taskEditServer.ts` (how it reads and transacts with `clientsDb` and `db` on the server, and `wibToday`'s use) and
`lib/companyChat.ts` from C1a. New file: `lib/companyChatServer.ts` with `previewCompanyChanges(input)` and
`applyCompanyChanges(input)`: read companies, tasks, flows and settings, call C1a, and write.

Done when (data tests in `lib/companyChatServer.data.test.ts`):
- Applying two new To approach companies writes two `pipeline` docs exactly as C1a previewed them, with new ids and the
  counter moved past them. An in-app `addCompany` right after takes a third, different id.
- With the clock pinned to 18:00 UTC (already the next day in Jakarta), a new Active company's `date` is the Jakarta day.
- Applying the same add twice returns `alreadyExists` with the first id the second time and writes nothing.
- `setPic` on three companies in three groups (one a client) writes all three in one transaction; one stale
  `seenPics` entry refuses the whole save and nothing changes; `pic: null` removes the field.
- With the PIC transaction forced to fail after two adds, the result lists both adds as saved and the PIC changes as
  not saved; repeating the call adds nothing new and saves the PIC changes.

## C2 — The three connector tools

Lets a Claude chat list companies, preview, and save adds and PIC changes.
Read **Smallest design**, **Settled defaults**, `lib/taskEditTools.ts` (`runTaskEditTool`, `registerTaskEditTools`,
`TASK_EDIT_CHAT_GUIDANCE`), `lib/taskPlanTools.ts` (`TASK_PLAN_CHAT_GUIDANCE` step 2's "never move or create a company")
and `app/api/mcp/[secret]/route.ts` (where tools register and inputs are checked before the handler). New file:
`lib/companyChatTools.ts`, with zod inputs matching C1a, calling C1b.
- `list_companies`, `preview_company_changes` (both `readOnlyHint: true`) and `apply_company_changes`
  (`readOnlyHint: false`, `destructiveHint: true`), registered under `MCP_TASK_EDITS_ENABLED`, with input checks in the
  route like the edit tools'.
- Descriptions carry the confirmation rule (explicit yes to the exact preview; a table and count above 10 PIC changes),
  that a PIC must be a team name, and the app's group words.
- The task-plan guidance's "never move or create a company" changes as in **Settled defaults**.
- `docs/skills/README.md`: one line on the new tools, next to the edit tools.

Done when:
- Route tests: with the flag off none of the three is listed or callable; with it on all three are listed
  (protocol smoke) and a bad input (an unknown key, 201 PIC changes) returns the route's "Check the tool inputs" error.
- `list_companies` pages 250 seeded companies 100 at a time with the right `total` and `hasMore`; `pic: null` returns
  only companies without a PIC; `pic: "maya  CHEN"` returns Maya Chen's; `query` and `industry` narrow by name and
  industry text, combined with `group`; each row's group is the app's words ("No or not now", not `noOrNotNow`).
- With the flag off, the task-plan guidance still says never create a company; with it on, it points at the new tools.
- Unit test: the apply description says an explicit yes is needed and the guidance no longer says never create a company.

## E1 — End to end on the emulators

Shows the whole flow works the way a chat would use it.
Through the MCP endpoint on the emulator dev server (as `tests/smoke/chat-task-edits.spec.ts` does), in a new
`tests/smoke/chat-companies.spec.ts`: `list_companies` by group, `preview_company_changes` then
`apply_company_changes` adding three prospects (one each in To approach, Active and No or not now, two with a PIC) and
setting one PIC across four companies in three groups, then open `/companies`.

Done when:
- Each new company shows in its group with its details and PIC, and the PIC filter for that person lists exactly the
  companies the save gave them, in each group. Screenshots of the three groups (desktop and phone) show the rows and
  the PIC column, filled.
- Each chat-added doc has the same keys as one added through the New company sheet with the same values.
- A second apply of the same adds reports `alreadyExists` and the list still has one row each.
- Changing one company's PIC in the app between preview and apply makes apply refuse, and the app still shows the
  in-app value.

## R1 — Phase review

Review C1a, C1b, C2 and E1 for faults in what gets saved (ids, group flags, PIC spelling, the duplicate check, `seenPics`),
for anything that writes outside `pipeline`, and for wording the owner sees in chat. Fix what is quick; the rest
become fix rows under R1 in the plan.
