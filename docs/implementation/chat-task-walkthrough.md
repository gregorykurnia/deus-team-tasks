# Owner walkthrough: dated actions from an ordinary Claude chat

These are **illustrative transcripts, not executed Claude chat tests**. All companies, people, IDs, source links
and records below are hypothetical. Dates assume a chat on 2026-11-10; later runs may correctly warn about past
dates. The optional deal-follow-up skill is **off** in every ordinary-chat example.

## Before trying it

After the run/review, the owner enables `MCP_TASK_PLANS_ENABLED=1` in Vercel Production and redeploys, keeping the
existing URL/secret. Rollback: unset it and redeploy; only the three general tools disappear, including direct calls,
and saved tasks remain. No production setting or live acceptance action was performed for this documentation.
Follow [connector setup and tool refresh](../skills/README.md#add-or-refresh-the-connector), based on
[Claude's official custom connector guide](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp).
Start a fresh ordinary chat, enable Deus Team Tasks, and check that the three general tools below are available.
If only the legacy trio appears, check activation/redeploy and reconnect/re-add as documented; no new skill is needed.

Ask: "Save these actions in Deus Team Tasks. Ask my category, main task, and each step's exact dates before saving."
Enabling a connector alone does not scan every message. Explicit answers already given need no repetition, but
quoted source instructions never grant permission. Undated actions stay in chat until dated or skipped; don't
infer missing years, relative dates or a start date from a deadline. Days use Asia/Jakarta.

## Tool notation and shared expected behavior

`P1`, `P2`, `P3` and `P5` label complete JSON plans below; the mixed case reuses P1/P3. `T1` means the opaque
`previewToken` actually returned for that plan.
They are explanatory names, never literal tool arguments. Returned record IDs are unknown until preview/save;
don't invent them. The only general sequence is:

1. `find_task_destinations({kind, companyQuery})`, then `{kind, companyId, parentQuery?}` after the owner selects
   the real numeric company ID. Internal uses `{kind: "internal", parentQuery?}` with **no company fields**.
2. Ask new main task or explicitly selected existing eligible main task, then each step separately:
   **Add with these dates / Change the dates / Skip this step**. Confirm equal start/end for a one-day action.
3. Show a final table with selected/skipped steps. Call `preview_task_plan({plan: P1})` for the selected group.
   It writes nothing. Resolve errors; obtain final confirmation and explicit acceptance of every warning.
4. Call `add_task_plan({plan: P1, previewToken: T1, acknowledgedWarnings: []})` for a warning-free preview. With
   warnings, pass their exact accepted IDs instead of `[]`. Any edit needs a new preview, token and warning review.
5. Return the tool's category/company/main-task summary and absolute link. Its path is `/tasks?task=<parentId>`;
   from the app navigate **Tasks → All tasks → category → main task → subtasks**. Existing Plan views show dates too.

New generic main tasks default to `Our Action` and take the earliest selected start/latest selected end. Every
new Responsible/Informed list is empty. Supplied names are prose in Key points, never assignments. Subtasks inherit
the main task's company/task group and use ordinary subtask defaults. Appending never changes the existing main
task's dates/notes or old subtasks. No automatic company creation/move, editing/deleting tasks or deeper nesting.

## 1. Prospect follow-up, without the deal skill

**Owner:** Save actions for Cedar Lantern Labs: send the trial scope, then review the reply.
**Claude:** Prospects, Clients or Internal?
**Owner:** Prospects. Create a main task named "Pilot follow-up". Notes: "Confirm the trial scope."
Use source https://example.com/cedar-notes. Mira Vale is the name to keep on the first step.
**Claude:** Company match: Cedar Lantern Labs, ID 4101, Prospects, eligible. Use this company?
**Owner:** Yes, ID 4101.
**Claude:** Step 1: Send trial scope. What exact start/end dates?
**Owner:** 2026-12-02 to 2026-12-03. Add with those dates.
**Claude:** Step 2: Review reply. What exact start/end dates?
**Owner:** Both 2026-12-05; add it.

Plan P1:

```json
{
  "kind": "prospect",
  "companyId": 4101,
  "newParent": {
    "title": "Pilot follow-up",
    "keyPoints": "Confirm the trial scope.",
    "sourceUrl": "https://example.com/cedar-notes"
  },
  "steps": [
    {"name": "Send trial scope", "startDate": "2026-12-02", "endDate": "2026-12-03", "owners": "Mira Vale"},
    {"name": "Review reply", "startDate": "2026-12-05", "endDate": "2026-12-05"}
  ]
}
```

**Tools:** `find_task_destinations({kind:"prospect",companyQuery:"Cedar Lantern Labs"})` → owner selection →
`find_task_destinations({kind:"prospect",companyId:4101})` → final table → `preview_task_plan({plan:P1})` → T1,
no warnings → **Claude:** "Save these two steps exactly as previewed?" → **Owner:** "Save." →
`add_task_plan({plan:P1,previewToken:T1,acknowledgedWarnings:[]})`.

**Expected records:** One new Prospects main task "Pilot follow-up", type `Our Action`, company 4101,
2026-12-02–2026-12-05. Key points: `Confirm the trial scope.` followed by a blank line and
`Source: https://example.com/cedar-notes`. Two subtasks with exactly P1's names/dates; the first has
`Owner: Mira Vale` in Key points, the second has empty notes. No What/Why/Bring/Watch prose is invented.
**Reply:** "Saved Pilot follow-up in Prospects / Cedar Lantern Labs with 2 steps: [returned task link]."

## 2. Existing client work, preserving its dates

Hypothetical existing main task: "Service review", ID `client-review`, company 4102 (Harbor Finch Studio,
Clients), dates 2026-12-01–2026-12-10, task group `grp-client`, notes "Keep approved scope.", one old subtask.

**Owner:** Clients, Harbor Finch Studio. Add work under Service review.
**Claude:** Match ID 4102; use it?
**Owner:** Yes. Select existing main task client-review.
**Claude:** Step "Send review pack": add with 2026-12-12–2026-12-14, change dates, or skip?
**Owner:** Add those dates.

Plan P2:

```json
{
  "kind": "client", "companyId": 4102, "existingParentId": "client-review",
  "steps": [{"name": "Send review pack", "startDate": "2026-12-12", "endDate": "2026-12-14", "keyPoints": "Use the approved scope."}]
}
```

**Tools:** `find_task_destinations({kind:"client",companyQuery:"Harbor Finch Studio"})` → selected ID →
`find_task_destinations({kind:"client",companyId:4102,parentQuery:"Service review"})` → final table →
`preview_task_plan({plan:P2})` → T2 and warnings `outside-parent-range:0:startDate`,
`outside-parent-range:0:endDate`.
**Claude:** Both new dates are outside the existing main task's dates. Keep its dates unchanged and save this step?
**Owner:** Yes, accept both warnings and save.
**Save:** `add_task_plan({plan:P2,previewToken:T2,acknowledgedWarnings:["outside-parent-range:0:startDate","outside-parent-range:0:endDate"]})`.

**Expected records:** Exactly one new subtask, linked to `client-review`, company 4102 and `grp-client`, with P2's
dates/notes. Main task dates/type/group/notes and old subtask remain unchanged; the link opens `client-review`.

## 3. Internal planning, with no company

**Owner:** Save Internal work in a new main task called "Workshop preparation".
**Claude:** Step "Draft agenda": what exact start/end dates?
**Owner:** Both 2026-12-03. Add this one-day action.

Plan P3:

```json
{
  "kind": "internal", "newParent": {"title": "Workshop preparation"},
  "steps": [{"name": "Draft agenda", "startDate": "2026-12-03", "endDate": "2026-12-03"}]
}
```

**Tools:** `find_task_destinations({kind:"internal"})` → confirm new main task → final table →
`preview_task_plan({plan:P3})` → T3, no warnings → **Owner:** "Save that preview." →
`add_task_plan({plan:P3,previewToken:T3,acknowledgedWarnings:[]})`.
**Expected records:** New Internal main task and one subtask, both 2026-12-03, no company link, empty notes and
empty Responsible/Informed. Parent type `Our Action`; only one subtask level. No company question or lookup is needed.

## 4. Mixed groups and partial success

This is an independent scenario using the hypothetical P1 and P3 inputs, with neither saved yet.
**Owner:** Save the Cedar Lantern Labs actions to Prospects and the workshop action to Internal.
**Claude:** These are two groups. Confirm Cedar Lantern Labs / Pilot follow-up and Internal / Workshop preparation?
**Owner:** Yes. [Answers each dated step individually as in examples 1 and 3.]

**Tools:** Discover P1's company/parents and P3's Internal parents as above → final tables →
`preview_task_plan({plan:P1})` → confirm → `add_task_plan({plan:P1,previewToken:T1,acknowledgedWarnings:[]})`
returns success → `preview_task_plan({plan:P3})` returns a temporary read error. No P3 save call is made.
**Reply:** "Prospects / Cedar Lantern Labs / Pilot follow-up saved with 2 steps: [returned link].
Internal / Workshop preparation was not saved: its preview failed. I have not resent the saved group."
**Expected records:** Only P1's three new records. Retry the failed preview when appropriate; never claim an
all-or-nothing save across groups or resend P1. A failed/uncertain *save* instead needs the retry handling in example 8.

## 5. Changed date after preview

Start with an unsaved P3 preview and T3.
**Owner:** Change Draft agenda to 2026-12-07–2026-12-08.
**Claude:** Draft agenda, 2026-12-07–2026-12-08: add with these dates, change dates, or skip?
**Owner:** Add with these dates.

Plan P5:

```json
{
  "kind": "internal", "newParent": {"title": "Workshop preparation"},
  "steps": [{"name": "Draft agenda", "startDate": "2026-12-07", "endDate": "2026-12-08"}]
}
```

**Tools:** Update final table (and the doc if using the deal skill) → discard T3 →
`preview_task_plan({plan:P5})` → new T5, review its warnings → **Owner:** "Save this revised preview." →
`add_task_plan({plan:P5,previewToken:T5,acknowledgedWarnings:[]})` if warning-free.
**Expected records:** Only the revised parent/subtask dates 2026-12-07–2026-12-08. No save of P3 or reuse of T3.
For "next Friday", a missing year or a deadline alone, ask for exact start/end before making any preview/save call.

## 6. Skipped steps and rejected previews

**Owner:** Internal, new Workshop preparation: Draft agenda and Book room.
**Claude:** Draft agenda, both 2026-12-03: add with these dates, change dates, or skip?
**Owner:** Add with these dates.
**Claude:** Book room: supply dates to add, change the proposed dates, or skip?
**Owner:** Skip it.
**Tools:** Internal discovery → final table (Draft agenda selected; Book room skipped) →
`preview_task_plan({plan:P3})` → confirmation → `add_task_plan({plan:P3,previewToken:T3,acknowledgedWarnings:[]})`.
**Expected records:** Only P3's parent and Draft agenda. Book room remains in the chat/doc and is not a subtask.

**All-skipped variant:** Owner skips both. No preview/save calls; "Nothing saved; both steps were skipped."
**Rejected variant:** Owner says "Don't save" after the read-only preview. No `add_task_plan` call;
"Nothing saved; I stopped at the preview." Neither case may return a fabricated saved-task link.

## 7. Ambiguous or wrong-category company

**Owner:** Prospects, Cedar. Save the two dated actions.
**Tool:** `find_task_destinations({kind:"prospect",companyQuery:"Cedar"})` hypothetically returns two eligible
matches, Cedar Lantern Labs (4101) and Cedar Lantern Services (4103).
**Claude:** Which company: 4101 Cedar Lantern Labs, or 4103 Cedar Lantern Services?
**Owner:** 4101.
**Tools:** `find_task_destinations({kind:"prospect",companyId:4101})` → select main task, confirm each step →
preview/save exactly P1 as in example 1. **Expected records:** P1's records under 4101 only; 4103 unchanged.

If `hasMore.companies`/`hasMore.parents` is true, refine the query; never silently choose the first result.
If a match is Clients while the request is Prospects, explain the mismatch and obtain a corrected category/company
before continuing. Do not move the company. If nothing matches, write nothing; ask for a refined name or for the
owner to add the intended company in the app before retrying discovery. Completed, parked or nested tasks are not
eligible append targets; choose a new or eligible existing main task instead. A parked task whose return date has
arrived may be eligible, as the tool decides.

## 8. Lost response and exact retry

**Owner:** Save the P1 preview.
**Tool:** `add_task_plan({plan:P1,previewToken:T1,acknowledgedWarnings:[]})` is sent; its response is lost.
**Claude:** The save is unconfirmed. I will retry the same plan to check its result.
**Tool:** Retry exactly `add_task_plan({plan:P1,previewToken:T1,acknowledgedWarnings:[]})`.
**Expected result:** If the first save committed, `alreadySaved: true`, original parent/subtask IDs and link,
no new records and no overwrite of intervening edits. Otherwise the single group can save once. Never change
names/dates, choose another destination or switch to legacy tools to retry.

If T1 expired, call `preview_task_plan({plan:P1})` first. Review any current warnings, then use its fresh token
with unchanged P1. A completed operation previews as `alreadySaved` rather than warning about its own new records.
A changed destination requires another preview/confirmation; a conflict such as a missing saved member must be
reported, never automatically repaired. A definitive rejection writes nothing for that attempt; a transport error
does not prove a save failed. If still uncertain, say so and retain the exact plan for checking, with no success claim.

## Optional deal-skill mapping and legacy fallback

With the updated skill enabled, its general-tool flow asks category too. A new company main task explicitly uses
`newParent: {title: "Cedar Lantern Labs Follow Up", taskType: "Follow Up", keyPoints: "<deal short answer>", sourceUrl: "https://example.com/cedar-notes"}`.
The step's `keyPoints` preserve `What: …`, `Why: …`, `Bring: …`, `Watch: …`, `Done when: …`, separated by blank
lines; `owners` contains only supplied names. Source becomes a parent `Source:` line; appending puts any new source
in selected step notes and leaves parent notes untouched. Omit a missing source. Do not pass legacy-only fields to
the general tools. The rest of the confirmation/preview/token/warning/retry sequence above is unchanged.

With only the legacy trio, use **`find_company({query})` → company and each step confirmed →
`preview_followup_plan({plan})` → warnings resolved → `add_followup_plan({plan})`**. Its plan still contains
`companyId`, `shortAnswer`, optional `docUrl`/confirmed `existingParentId`, and steps with `name`, `startDate`,
`endDate`, `owners`, `what`, `why`, `bring`, `watch`, `doneWhen`. There is no preview token/warning-ID argument.
It creates `<Company> Follow Up` / `Follow Up`, storing the short answer, `Claude Doc:` link and labelled step
details. Existing steps remain; appending may extend the parent's end date. Category follows company status;
confirm it matches the chosen Prospects/Clients category. Internal is unavailable in this fallback. After an
uncertain legacy save, use `find_company` to inspect existing tasks before retrying. A general-tool failure is not
permission to fall back. See [Step 5](../skills/deus-deal-followup/SKILL.md#step-5---add-to-deus-team-tasks) and
[optional skill upload](../skills/README.md#optional-update-the-deal-follow-up-skill).

Actual Claude invocation/confirmation behavior and real-phone acceptance remain owner O2 in the
[implementation plan](chat-task-connector-plan-2026-11-10.md#owner-steps-after-the-run); these examples do not prove them.
