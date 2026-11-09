---
name: "deus-deal-followup"
description: Turn a DEUS prospect or client meeting (transcript, recording text or rough notes) into the full sales follow-up in one go - a meeting summary, an internal deal plan (where the deal stands, what's missing to win it, what happens next, earliest realistic close) and follow-up actions with a ready-to-send message to the prospect, then (when connected) adds its dated steps to Deus Team Tasks. Use this whenever Greg or anyone at DEUS pastes or uploads a meeting transcript or notes from a call with a prospect, client or partner about DEUS Game-Based Assessment (Discover), Enhance or Potentia, or asks "summarize this meeting and what's next", "how do we close this", "deal plan for [company]", "what should we follow up", "draft the follow-up", "rangkum meeting ini", "langkah selanjutnya", "gimana biar closing", in English, Indonesian or mixed, even if they only ask for one of the three parts or never say "deal".
---

# DEUS deal follow-up

After a sales meeting, DEUS needs three things fast: a summary people can share, an honest internal view of how to win the deal, and the next moves already drafted. This skill produces all three from one transcript, grounded in what DEUS actually sells and charges.

Before writing, read:
- `references/deus-offer.md` - modules, pricing, credibility claims, case studies and known weak spots. Use it to check what was said in the meeting and to plan the deal. Never quote a price or claim to a prospect that isn't in it.
- `references/sales-playbook.md` - deal stages, qualification checklist, common objections with good answers, the trial playbook, and the DEUS team list (for recognizing who is speaking only).

## No owners

Never assign a task, gap or step to a named person or role, whether at DEUS or at the prospect, and never guess who is responsible for something. The team decides who does what. This applies everywhere in this skill: the summary's action items, the deal plan, the step-by-step path, the action list and the follow-up message. Describe what needs to happen and by when, and leave the who out. Don't add an Owner column. The one exception is Step 5's confirmation table, which has an Owners column that says "Not assigned" unless the user names someone there.

## Dates

Every action and every step gets a clear due date. Dates are the part people act on, so never leave them vague.

**Format.** Always weekday, day, month and year: "Thu, 12 Nov 2026". For a meeting slot add the time and WIB: "Tue, 17 Nov 2026, 10:00 WIB". Never write "next week", "soon", "ASAP", "TBD" or "early December" on its own.

**Agreed or suggested.** Mark each date as one of:
- **Agreed** - said or settled in the meeting (convert relative dates like "minggu depan" or "Jumat ini" into a real date from the meeting date).
- **Suggested** - not agreed, so recommend one yourself, with a short reason ("2 working days after the meeting, while it's fresh"; "1 week before the demo, to leave time for review").

Don't stop to ask the user for dates; pick sensible ones and show the reasoning. The user can change them.

**Starting point.** Count from the meeting date. If it isn't known, count from today and say so in the chat reply.

**Work backward from fixed points.** When a meeting, demo, trial session or deadline has a date, plan everything that prepares for it backward from that date, so no prep task is due after the thing it prepares for. Then plan what follows it forward.

**Default timings** (use when nothing was agreed; adjust when the deal calls for it, and say why):

| Action | Suggested due |
|---|---|
| Thank-you / follow-up message to the prospect | Same working day as the meeting, or the next working day if the meeting ended late |
| Send materials DEUS promised (sample report, deck, trial link) | Within 2 working days, unless a date was promised |
| Send materials that must be prepared or checked first (technical brief, validation paper, construct map) | 1-2 weeks, per the playbook's lead time; promise a specific date in the follow-up message |
| Fix our own slips (unclear prices, unanswered questions) | Before the next contact with the prospect |
| Propose a meeting, demo or trial session | In the follow-up message, with 2 weekday options 5-10 working days out |
| Send the calendar invite once a slot is agreed | Within 1 working day of agreeing |
| Prepare for an internal-team or expert meeting (materials, demo account, agenda) | Start 1-2 weeks before; ready 2 working days before |
| Final run-through / test the demo or trial link | 1 working day before |
| Reminder message to the prospect | 1 working day before the meeting |
| Chase if no reply | 3 working days after the last message; a second, lighter chase 1 week after that |
| Results walkthrough after a trial batch | About 1 week after the batch finishes |
| Decision ask / proposal | Right after the results walkthrough, and before the prospect's budget window closes |

**Calendar checks.** Use working days only (Monday to Friday). Skip Indonesian public holidays and cuti bersama for that year (look them up with web search when available, otherwise say the date should be checked), and apply the playbook's timing rules (year-end slowdown, Ramadan and Lebaran, the prospect's budget cycle). If a suggested date lands on one of these, move it and say why.

**Keep it consistent.** The same action has the same date everywhere it appears (deal plan, action list, follow-up message). The date options offered to the prospect must fit after the prep tasks they depend on.

If the user asks for only one part (just the summary, just the follow-up message), do that part only, but still use the references so it's accurate.

## Step 1 - Understand the meeting

1. **Who's who.** Infer names and organizations from how people address each other ("Pak Greg", "Bu Wiri") and what they say. DEUS people are listed in the playbook. Keep a speaker label rather than guess.
2. **Date.** Use the date the user gives; otherwise say it wasn't stated. Convert relative dates ("minggu depan", "awal tahun depan") into real dates from today and say so.
3. **What the prospect actually needs.** Recruitment, internal talent (promotion, high-potential programs), L&D, performance management, or children's assessment. Their buyer type changes which module to lead with - see the playbook.
4. **Signal vs noise.** Drop audio checks, screen-sharing chatter and filler. Keep anything about needs, current tools, volume, budget, timing, decision makers, objections, prices and promises.

## Step 2 - Meeting summary (shareable)

If the `meeting-summary` skill is available, follow its structure and rules. Otherwise use: header (date, attendees with organization, purpose), context, the topics discussed, decisions, action items table (Action | Due; no Owner column) and open questions. If the `meeting-summary` skill asks for owners, leave them out anyway.

Because this part may be forwarded to the prospect, its action items show only dates that were **agreed** in the meeting (in the format from "Dates"). Where no date was agreed, write "Not agreed yet". The suggested dates go in the internal deal plan and the action list.

Rules that matter because the summary may be forwarded to the prospect:
- English by default, whatever the meeting language, unless the user asks otherwise.
- Record only what was said. Separate agreed from discussed from assumed.
- Stay neutral. No sales spin and no internal judgments in this part - those go in the deal plan.
- Include prices only as they were quoted in the meeting.

## Step 3 - Deal plan (internal)

This is candid and for DEUS only. Write it as if advising Greg before his next move.

1. **Short answer first.** One or two sentences: the deal moves forward when X and Y happen; the critical path runs through Z; earliest realistic paid start.
2. **Where it stands.** Stage (from the playbook's stage list) and a plain-words read of how likely it is (low / medium / high) with the reasons. No fake percentages.
3. **Qualification.** Go through the playbook checklist. Only flag what blocks progress; an unknown that doesn't block can wait.
4. **Lead offer.** Which module or product to lead with, and what to stop pushing, based on what they already have and what interested them. The prospect's own words are the best evidence.
5. **Gap table.** Gap | Why it blocks. Order by how much each one blocks.
6. **Sequenced path.** Name the single next action that unblocks the most. Draw the dated steps as a timeline when the doc tools allow it. Plan dates with the timing rules in the playbook (holidays, Ramadan/Lebaran, the prospect's budget cycle). Then add a **step-by-step recap** under it so the user doesn't have to remember the reasoning later. For each step, write:
    - the step name and its date(s) in one line, marked Agreed or Suggested (see "Dates")
    - **What:** what actually happens, concretely
    - **Why:** what it unblocks
    - **Bring:** materials needed (only for meetings, sessions and demos)
    - **Watch:** a risk or condition to check (only when there is one)
    - **Done when:** the outcome that lets the next step start, and what changes if it goes differently
7. **Our own slips.** Compare what DEUS said in the meeting against `deus-offer.md`: answers that were vague, inconsistent prices or minimums, promises made, questions left unanswered. List what to fix before the next contact. This protects credibility with expert buyers like HR psychologists.
8. **Side opportunities.** Anything separate that came up (a private practice, another division, a referral), with a suggested way to handle it.

## Step 4 - Follow-up actions

1. **Action list** with no owners (see "No owners" above), as a table sorted by due date: Action | Due | Agreed / Suggested | Why this date. Every row has a date, following "Dates": prep tasks, sending materials, proposing and confirming meetings, reminders, chasers and the decision ask. Group prep tasks under the meeting or session they prepare for when that makes it easier to read.
2. **Follow-up message to the prospect.** Draft it with the message drafting tool if available:
   - Channel: the one used in the meeting (usually WhatsApp chat; email if that's how they talk). Don't assume who sends it; leave the sender's name as [Name] unless the user says who is sending.
   - Language: the language the prospect used in the meeting, so usually polite Indonesian (Bu/Pak, "terima kasih atas waktunya"), short and warm. Mixed Indonesian-English is fine if that's how they spoke.
   - Content: thanks, 2-3 points they cared about, the agreed next step with 2 date options (written in the format from "Dates", and fitting after the prep they depend on), and any material DEUS promised (sample report, validation paper, trial link).
   - Never add a price, discount, claim or commitment that wasn't agreed in the meeting or isn't in `deus-offer.md`.
   - If the meeting ended with "not this year" or no clear next step, write a light keep-in-touch message with one useful item instead of a push.
3. **Offer, don't do.** Offer to save the message as a Gmail draft or put a follow-up reminder or demo on Google Calendar when those tools are connected. Create them only after the user says yes, and never send anything on their behalf.

## Step 5 - Add to Deus Team Tasks

Do this step only when the Deus Team Tasks connector's tools are present in the chat: `find_company`, `preview_followup_plan` and `add_followup_plan`. If they aren't, skip it and don't mention it.

1. **Offer, after the doc.** Once the doc (or Markdown file) is delivered, ask in one line whether to add the deal plan's steps to Deus Team Tasks as a follow-up task. Go on only after the user says yes.
2. **Find the company.** Call `find_company` with the prospect's name. If nothing matches, write nothing: ask the user to add the company under Prospects in the app first, then call `find_company` again. If several match, list them and ask which one.
3. **Show what could be added.** In chat, show the company match (name as stored, group, PIC, and any open follow-up task it already has) and a table of the "Sequenced path" steps only (no slips, no side opportunities):

    | # | Step | Start | End | Owners |
    |---|---|---|---|---|

    Write dates in the format from "Dates", marked Agreed or Suggested as in the deal plan. A one-day step has the same start and end. Owners: write "Not assigned" (see "No owners") unless the user names someone here.
4. **Ask about the company, then each step, one at a time.** Use the chat's question tool (the clickable answer cards) when it's available; otherwise ask in plain chat with the same choices, one step per message.
    - **Company first:** "Add these steps under *<name as stored>* (<group>)?" with the choices "Yes, this company" and "A different company".
    - **Then one question per step, in path order.** Never put two steps in one question, and never ask one question for all of them. Each question names the step and its dates, for example "Step 2 of 6: Send sample report, Thu, 12 Nov 2026 (Suggested). Add it to Deus Team Tasks?", with three choices: "Add with these dates", "Change the dates" and "Skip this step". When the tool takes several questions in one go, each question is still one step.
    - **"Change the dates":** ask for the new start and end in chat, apply them to the table and the doc, then ask about that step again with the new dates.
    - Don't answer for the user or skip a question on your own. Only if the user themselves says something like "add the rest as they are" does that answer the remaining steps.
    - Don't go on until the company and every step have an answer. Then show the final list in one short table: the steps to add with their dates, and the steps skipped. If every step was skipped, write nothing and say so. Skipped steps stay in the doc's deal plan; they just don't become subtasks.
5. **Preview.** Call `preview_followup_plan` with only the steps the user chose to add: `companyId` from `find_company`, `shortAnswer` = the deal plan's short answer, `docUrl` = the Claude Doc link when there is one, and per step `name`, `startDate` and `endDate` as yyyy-mm-dd, `owners` (as in the table), and `what`, `why`, `bring`, `watch`, `doneWhen` from the step-by-step recap. Every field needs text: write "None" for a step with no Bring or Watch.
6. **Fix warnings with the user.** Read each warning to the user in plain words and settle it together: correct a bad date or a start after its end, confirm or move a date in the past, confirm a "Deal done" company (its tasks show under Clients). If a follow-up task already exists, ask whether to add the new steps under it; only on yes, set `existingParentId` to that task's ID (old steps are kept as they are). Preview again after any change, until no warning is left unanswered.
7. **Add.** Call `add_followup_plan` with exactly the previewed plan, only after the user has confirmed the company and answered for every step. Call it once; if it fails, don't retry blindly: call `find_company` to see whether the task already landed. If it answers `alreadySaved: true`, these steps were already in the app and nothing new was written: say so and share its link.
8. **Reply with the link.** One line with the task's link from `add_followup_plan` (for example "Added *Mayora Indah Follow Up* with 6 steps: <link>"). Responsible stays empty in the app; the team assigns people there.

## Delivering it

- **One Claude Doc per prospect meeting** (when Claude Docs tools are available; read the docs skill first): tab 1 "Meeting summary" (shareable), tab 2 "Deal plan (internal)". The internal tab is clearly marked internal so it isn't shared with the prospect by mistake.
- If a doc for this prospect already exists in the conversation or the user links one, add the new meeting as a new summary tab and update the deal plan tab instead of starting over.
- The follow-up message goes in chat (message card), not in the doc.
- Chat reply: one or two lines on the most important point (e.g. "Lead with Drive & Risk; the trial has to land before their 2027 budget closes"), plus the next dated action and anything you assumed (a speaker's name, the meeting date). Don't repeat the doc.
- Without Claude Docs, write a Markdown file with both parts and present it.
- **Quick mode (chat only).** When the user asks a quick question about a deal ("what do we need to close this?", "is this worth chasing?", "quick take") rather than handing over a fresh transcript, answer in chat with no doc: the short answer, the lead offer, the gap table, the sequence of next steps with dates (following "Dates"), and side opportunities, kept to what fits one screen. Offer to put it in the deal plan doc at the end.

## Keep the references current

When the user corrects a price, a module detail or a team member's details, tell them which reference file holds it so they can update the skill (or offer to produce an updated skill file). Prices and claims in `deus-offer.md` are only as good as their last update.
