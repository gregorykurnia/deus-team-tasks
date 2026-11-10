# G09 visual finish — 2026-11-10

The original G08 captures remain unchanged. All 26 key images were opened at native resolution before
reading the implementation. Native-pixel Plan, sheet-edge/date-base and phone-list-base crops were also
opened. The two required shapes are desktop 1440×900 and phone 390×844.

## Original-image observations

Paths below are relative to this gallery. Each observation describes the picture before judging it.

LOOKED: desktop/prospect-destination-list.png · Six rows sit inside the task panel; sidebar is beside it, nothing crosses the frame; company/group labels ellipsize, titles and controls remain readable.

LOOKED: desktop/prospect-main-open.png · Task sheet sits over the dimmed list; title, category and two subtasks lead; footer rests below the scroll body with no covered subtask or clipped action.

LOOKED: desktop/prospect-main-source.png · Long notes end inside their field above the footer; earlier text is cropped at the scroll top; source URL is whole and readable.

LOOKED: desktop/prospect-subtask-dates.png · Three dates sit on one row above Responsible; the footer covers the scroll boundary below Key points; date values and all actions are whole.

LOOKED: desktop/prospect-subtask-notes-start.png · Notes begin below Key points in the sheet; the field continues to the footer boundary; visible paragraphs are readable and actions sit in front below them.

LOOKED: desktop/prospect-subtask-notes-middle.png · Middle paragraphs fill the scrolling field; preceding/following text is clipped at its boundaries; header/footer stay in front and visible lines are readable.

LOOKED: desktop/prospect-subtask-notes-end.png · Note 80 and the owner line sit above the field's bottom border; earlier text clips at the top; footer is separate and final text is whole.

LOOKED: desktop/client-destination-list.png · Client rows sit under the selected Clients tab; badges align in their columns; no frame or control overlap, company/group labels intentionally ellipsize.

LOOKED: desktop/client-main-open.png · Client sheet overlays the dim list; description and both subtasks are fully above the fixed footer; category, dates and button text are readable.

LOOKED: desktop/internal-destination-list.png · Internal parents and indented children sit within the panel; sidebar stays alongside; long group label ellipsizes while dates and controls remain whole.

LOOKED: desktop/internal-main-open.png · Internal description sits above its two subtasks; touch-point controls meet the scroll boundary at the footer; task identity and primary actions remain unobscured.

LOOKED: desktop/internal-appended-subtasks.png · Completed child sits above two appended children; task title is partly above the scroll boundary; dates, strike-through text and footer actions remain readable.

LOOKED: desktop/plan-parent-and-subtask.png · Two child cards sit beneath the day strip, with parent labels above their notes; all frame edges fit, but a fourth text line leaks below each preview ellipsis.

LOOKED: phone/prospect-destination-list.png · Prospect cards sit below category/filter controls; pinned navigation overlays lower scrolling cards; top task and category are clear, long lower title and input placeholder ellipsize.

LOOKED: phone/prospect-main-open.png · Bottom sheet overlays the list; category/title and two subtasks sit above the fixed actions; company name ellipsizes, task text and dates fit without overlap.

LOOKED: phone/prospect-main-source.png · Last notes and source URL end above the field border and footer; earlier text clips beneath the header; the source and all action labels remain whole.

LOOKED: phone/prospect-subtask-dates.png · Start/Deadline sit side by side, Last action beneath; header/footer frame the scroll body; dates, calendar buttons and empty Responsible fit without overlap.

LOOKED: phone/prospect-subtask-notes-start.png · Notes start beneath their label and continue to the footer boundary; pinned header/actions are in front; visible paragraphs are complete and readable.

LOOKED: phone/prospect-subtask-notes-middle.png · Notes 41–47 fill the sheet; note 48 meets the lower scroll edge; header/footer remain in front, text is readable and not horizontally clipped.

LOOKED: phone/prospect-subtask-notes-end.png · Note 80 and owner text sit inside the field above its base; earlier text clips at the top; final lines clear the footer and remain readable.

LOOKED: phone/client-destination-list.png · Client cards sit beneath the selected Clients tab; bottom navigation overlaps later scrollable rows; first task/date and category are whole, placeholder ellipsizes.

LOOKED: phone/client-main-open.png · Client title and two child cards stand above the fixed footer; company label ellipsizes beside Open company; task/date/action text is readable and unobstructed.

LOOKED: phone/internal-destination-list.png · Internal parent and first child sit above navigation; next child crosses behind it; selected category, first title/date and controls remain readable.

LOOKED: phone/internal-main-open.png · Internal title leads above two child cards; task-type field meets the footer boundary; primary task/subtask targets and fixed action text stay whole.

LOOKED: phone/internal-appended-subtasks.png · Completed child and two appended cards stack above actions; description is above the scrolled frame; count, dates and child names remain readable.

LOOKED: phone/plan-parent-and-subtask.png · Two child cards sit above navigation with parent names and dates visible; top day strip is scrolled off; each notes box leaks a partial fourth line below its ellipsis.

## Faults and disposition

- **G08-V1 confirmed:** both Plan previews show a partial fourth line in bottom padding. Repair the existing
  TaskDayRow preview by clipping an inner text span while keeping the padded outer surface. Keep the existing
  three-line preview and full notes in the sheet. Before evidence: original desktop/phone Plan images above.
- Other inspected frames: no additional confirmed visual fault. Company/group ellipses preserve adjacent
  controls; partial notes/rows at scroll boundaries are reachable by scrolling (G08 checks last-row access,
  whole expanded notes and saved values). The main task, category and subtask list are visible initially.
  No new design gap or redesign is needed.

Focused reproduction: `npm run mcp:smoke -- --only=task-plan-visual`. It uses the existing local MCP/emulator
setup, rechecks only the affected Plan scenario on both shapes and saves its images/manifest under `g09/`.
Original G08 captures and their saved-state manifest are retained as before evidence.

## Repaired images

LOOKED: g09/desktop/plan-parent-and-subtask.png · Two task cards sit inside the day panel; sidebar and day strip remain clear; notes end in three whole lines above clean padding, with readable parent names/dates and no covered controls.

LOOKED: g09/phone/plan-parent-and-subtask.png · Two cards sit fully above fixed navigation; day strip is intentionally scrolled above the frame; notes end with a clean ellipsis and bottom padding, and names/dates remain readable.

Native-pixel before/after notes crops, base crops and frame-edge crops were opened at original resolution.
No remaining visual fault was found in the repaired states. [Pixel comparison](g09/pixel-comparison.json):
phone differences occur only in the two removed text strips (y=400–404, 688–692). Desktop differences are
the removed strips plus 21 edge/shadow raster pixels (maximum channel delta 8/255), with no moved controls.

Regression proof: [before failure](g09/regression-before.txt), [after pass](g09/regression-after.txt),
[saved state and capture manifest](g09/manifest.json). Before: `desktop: Key points preview exposes text
below three lines (74.53125px > 56.550000000000004px)`. After: both viewports pass the three-line height,
layout, console/network, child-link and exact date/notes checks, with unchanged task/company snapshots.

DECISION: Keep the existing three-line preview using an inner clipped span rather than shorten stored notes;
this fixes the padded-clamp fault while preserving the approved surface and full sheet content.

DECISION: Add a Plan-only harness selector rather than rerun G08's whole flow gallery; it preserves the
original evidence and rechecks both affected shapes using the same fixtures and safety guards.
