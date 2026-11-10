# G08 — Saved connector tasks in the app

G09 inspected these originals and repaired the Plan notes preview. See [G09 observations and before/after
evidence](G09-review.md); reproduce only the repaired states with
`npm run mcp:smoke -- --only=task-plan-visual` (output: `g09/`).

Invented data only, saved through `preview_task_plan` / `add_task_plan` on the real local MCP endpoint.
The development app and all fixtures use Firestore at `127.0.0.1:8180`. Calendar responses are mocked;
external browser requests fail the run. No production setting, account or record is involved.

Reproduce: `npm run mcp:smoke -- --only=task-plan-browser`. The existing `--only=browser` and default
commands also include this check after the legacy follow-up browser check. The harness owns its servers.
Run the required main-page check separately with `npx playwright test tests/smoke/tasks.spec.ts
--output=test-results/task-plan-page-spec` so Playwright preserves this gallery.

`manifest.json` contains the six inputs, tool-returned URLs/IDs, actual stored parent/child records,
capture paths and fourteen desktop/phone scenario/Plan check records. Preview tokens and secrets are absent.
Each category has a new main task with two selected steps and an existing main task with two appended steps
plus its preserved completed child. Every returned link is opened; the same parent is then reached through
Today → All tasks / Tasks → category. Each selected subtask's dates, notes and empty Responsible are checked;
the first is reloaded. The old child's completed state, dates, notes and owner are checked separately.
The final task/company snapshots equal the snapshots before browsing.

There are 26 full-size PNGs (13 at 1440×900, 13 at 390×844) and 20 crops at native pixel size.
All key images and crops were opened at original resolution. The measurements verify dimensions and existence;
the browser checks page overflow, control coverage, expanded notes, date-field width and console/network errors.

| State | Desktop | Phone |
|---|---|---|
| Prospects list | [Open](desktop/prospect-destination-list.png) | [Open](phone/prospect-destination-list.png) |
| Prospect main task | [Open](desktop/prospect-main-open.png) | [Open](phone/prospect-main-open.png) |
| Saved source URL | [Open](desktop/prospect-main-source.png) | [Open](phone/prospect-main-source.png) |
| Subtask dates / empty owner | [Open](desktop/prospect-subtask-dates.png) | [Open](phone/prospect-subtask-dates.png) |
| Notes start | [Open](desktop/prospect-subtask-notes-start.png) | [Open](phone/prospect-subtask-notes-start.png) |
| Notes middle | [Open](desktop/prospect-subtask-notes-middle.png) | [Open](phone/prospect-subtask-notes-middle.png) |
| Notes end / supplied owners | [Open](desktop/prospect-subtask-notes-end.png) | [Open](phone/prospect-subtask-notes-end.png) |
| Clients list | [Open](desktop/client-destination-list.png) | [Open](phone/client-destination-list.png) |
| Client main task | [Open](desktop/client-main-open.png) | [Open](phone/client-main-open.png) |
| Internal list | [Open](desktop/internal-destination-list.png) | [Open](phone/internal-destination-list.png) |
| Internal main task | [Open](desktop/internal-main-open.png) | [Open](phone/internal-main-open.png) |
| Appended / completed subtasks | [Open](desktop/internal-appended-subtasks.png) | [Open](phone/internal-appended-subtasks.png) |
| Plan parent/subtask relationship | [Open](desktop/plan-parent-and-subtask.png) | [Open](phone/plan-parent-and-subtask.png) |

## Look findings for G09

- **G08-V1 → G09:** Plan's three-line Key points preview shows part of a fourth line inside its bottom
  padding, on desktop and phone. See the Plan shots and their base crops. This is an existing rendering fault,
  not lost saved prose: the exact full 80-note value and supplied-owner line are verified after reload and
  visible in the task sheet. G09 is the already-planned owner of visual repairs; no app CSS is changed in G08.
- Company/group badges and two-line list titles intentionally ellipsize; the opened task shows its full name,
  and the company can be opened. Notes continue beyond the sheet's scroll boundaries; the start/middle/end
  shots prove reachability, and the last note, owner and source sit above the fixed footer. Controls remain
  readable. Phone lists continue behind navigation but the last row is scrolled into reach before opening.
- Fixed two capture faults: navigation now waits for the actual Tasks heading, category URL and six filtered
  rows; main-task shots wait for the correct description and subtask count. The completed-child assertion
  uses the app's actual `Finished task` dialog name. The early, unsettled captures were replaced.

## Original-resolution observations

LOOKED: desktop/prospect-destination-list.png · Six rows sit in the Tasks panel; badges ellipsize, edges stay inside the frame, and navigation covers no row.
LOOKED: desktop/prospect-main-open.png · The sheet overlays the blurred list; both child rows sit above its fixed footer, with whole titles and dates.
LOOKED: desktop/prospect-main-source.png · The notes field reaches its rounded base above the footer; earlier lines scroll off the top, and the source URL is whole.
LOOKED: desktop/prospect-subtask-dates.png · Three dates and the empty Responsible field sit above the footer; Key points continues below the scrolling edge.
LOOKED: desktop/prospect-subtask-notes-start.png · Notes 1–8 sit inside the expanded field; later text continues below the footer boundary, with no sideways cut.
LOOKED: desktop/prospect-subtask-notes-middle.png · Notes 41–48 remain readable between the fixed header and footer; neighboring lines leave the scrolling edges.
LOOKED: desktop/prospect-subtask-notes-end.png · Note 80 and the complete supplied-owner line sit above the field base and footer; earlier lines leave the top.
LOOKED: desktop/client-destination-list.png · Six green-coded rows sit within the panel; company/group badges ellipsize, while row titles and dates remain readable.
LOOKED: desktop/client-main-open.png · The client-tagged sheet overlays the list; two complete child rows and date pills sit clear of the fixed actions.
LOOKED: desktop/internal-destination-list.png · Six grey-coded rows sit within the panel; both parent counts and dates are readable, with no navigation overlap.
LOOKED: desktop/internal-main-open.png · The Internal sheet shows its whole name and two children; lower fields continue behind the scrolling boundary above the footer.
LOOKED: desktop/internal-appended-subtasks.png · Three children stack above the footer; the old completed child is struck through, and the parent title scrolls partly off the top.
LOOKED: desktop/plan-parent-and-subtask.png · Two child cards sit in the Tasks panel with whole parent breadcrumbs; notes previews leak a partial fourth line at their bases (G08-V1).
LOOKED: phone/prospect-destination-list.png · Prospect cards stack beneath the category switch; lower cards continue behind fixed navigation, and long titles/badges ellipsize.
LOOKED: phone/prospect-main-open.png · The bottom sheet overlays the list; the full main name and both dated children sit above the fixed actions, with an ellipsized company badge.
LOOKED: phone/prospect-main-source.png · Note 80 and the whole source URL sit above the rounded field base and fixed actions; earlier text scrolls off the top.
LOOKED: phone/prospect-subtask-dates.png · Full Start and Deadline fields share a row above Last action and empty Responsible; the fixed actions cover no date text.
LOOKED: phone/prospect-subtask-notes-start.png · Notes begin inside the expanded field below its label; later notes continue beneath the scroll edge above the fixed footer.
LOOKED: phone/prospect-subtask-notes-middle.png · Notes 41–47 sit between the fixed header and footer; adjacent lines are clipped only at the scrolling boundaries.
LOOKED: phone/prospect-subtask-notes-end.png · Note 80 and the complete owner line sit above the field base and footer; earlier notes leave the top of the scrolling region.
LOOKED: phone/client-destination-list.png · The rollout card and its count sit above child cards; the lower row continues behind navigation, with whole visible dates.
LOOKED: phone/client-main-open.png · The client-tagged sheet shows the whole rollout name and two child titles above its footer; only the compact company badge ellipsizes.
LOOKED: phone/internal-destination-list.png · Internal cards stack under the selected switch; the handover title/count are whole, and lower cards continue behind navigation.
LOOKED: phone/internal-main-open.png · The full handover name and both dated children sit above the footer; lower task-type content continues at the scroll edge.
LOOKED: phone/internal-appended-subtasks.png · The completed child and two appended children stack above the footer; their titles/dates are whole, while the parent name is scrolled away.
LOOKED: phone/plan-parent-and-subtask.png · Both child cards and full parent breadcrumbs sit above navigation; the scrolled header leaves the top, and preview bases leak another line (G08-V1).
