# G09 — Fresh-eyes findings and reachability evidence

All 12 checker images were opened at original resolution using literal paths. Their bytes match the
preserved `phone/` originals. The checker saw still frames of scrollable content. The supplementary
phone captures below show the flagged content after scrolling or opening its existing detail view.
No additional app rendering fault was confirmed; the Plan clipping repair remains unchanged.

## Original pictures

LOOKED: phone/prospect-destination-list.png · First task card sits above navigation; the next card passes behind it; a filter fragment meets the right edge and the child title ends in an ellipsis.

LOOKED: phone/prospect-main-open.png · Task name and two children sit above fixed actions; company text ellipsizes beside a fully visible Open company link; dates and buttons fit.

LOOKED: phone/prospect-main-source.png · Source and final paragraphs clear the field base and footer; preceding text is clipped by the top scroll boundary beneath the header.

LOOKED: phone/prospect-subtask-dates.png · Start/Deadline sit side by side with Last action beneath; complete date values, calendar controls and actions fit; upper content is scrolled off.

LOOKED: phone/prospect-subtask-notes-start.png · Notes begin below their label in an expanded field; its continuation meets the footer boundary; visible paragraphs and fixed actions are readable.

LOOKED: phone/prospect-subtask-notes-middle.png · Notes 41–47 sit within the field; note 48 begins at the lower boundary; the fixed footer is in front of the continuation.

LOOKED: phone/prospect-subtask-notes-end.png · Final note and owner line clear the field base; an earlier paragraph begins above the top scroll boundary; fixed actions remain whole.

LOOKED: phone/client-destination-list.png · First client card clears navigation; a later child passes behind it; the next filter is clipped at the horizontal scroll edge, with primary labels readable.

LOOKED: phone/client-main-open.png · Title and two subtasks clear the action bar; company name ellipsizes next to Open company; task names, dates and controls remain readable.

LOOKED: phone/internal-destination-list.png · First task and child sit above navigation; the following child continues behind it; the next filter appears only at the right scroll edge.

LOOKED: phone/internal-main-open.png · Task identity and both children clear fixed actions; the lower edge of Task type meets the scrolling body's footer boundary.

LOOKED: phone/internal-appended-subtasks.png · Completed child and two appended children sit above the actions; description is scrolled above the frame; names, dates, count and Task type are readable.

## Decisions covering every reported item

DECISION: not fixed navigation overlap in 01/08/10, note boundaries in 03/06/07, or Task type's lower edge in 11,
because these are scroll boundaries rather than lost content: all three final rows scroll wholly above
navigation, notes 48 and 74 become whole in the body, and Task type becomes fully visible and hit-testable.
Removing fixed navigation/actions or snapping every scroll to paragraph boundaries would alter the approved layout.

DECISION: not fixed the filter slivers in 01/08/10, because design-guide 6.2 and 5.14 explicitly specify
sideways-scrolling phone filters. No action for and Sort both scroll fully into view and remain hit-testable;
the visible fragment is the next offscreen button, not an unlabeled control.

DECISION: not fixed the shortened task title in 01 or company names in 02/09, because design-guide 5.14
specifies two-line titles and ellipsized single-line labels. Opening the task shows its complete title;
Open company shows each complete company name in a wrapping heading. Expanding every compact label would
push the initially visible subtask list downward without adding a missing capability.

DECISION: not fixed the unspecified reports for 04/05/12, because no fault was identified and the full-size
images show complete date inputs, readable starting notes and readable appended children respectively.

## Supplementary captures

Paths here are relative to this gallery. All 11 key images and eight native-pixel base/edge crops were opened
at original resolution. These are additional scroll/detail states; original before images are retained.

LOOKED: reachability/phone/prospect-list-scrolled.png · Last prospect card and its badge sit completely above navigation; earlier rows clip at the top; two-line title ellipses remain intentional.

LOOKED: reachability/phone/client-list-scrolled.png · Last client card's title, date, badge and group clear navigation; the first row is scrolled above the frame; visible detail text is whole.

LOOKED: reachability/phone/internal-list-scrolled.png · Last internal card and all its details clear navigation; earlier content clips at the top; dates and controls remain readable.

LOOKED: reachability/phone/prospect-filters-scrolled.png · No action for is whole within the filter strip; adjacent filters clip at its scroll edges; lower task cards still pass behind fixed navigation.

LOOKED: reachability/phone/internal-filters-scrolled.png · Sort and its full value sit within the filter strip; neighboring filters clip at the edges; the task list remains beneath it.

LOOKED: reachability/phone/prospect-company-open.png · The complete company name wraps beside its badge above the record actions; lower fields meet the footer boundary; no title text is clipped.

LOOKED: reachability/phone/client-company-open.png · Complete client name wraps above the category and contact; record actions remain clear; lower fields reach the fixed save-state footer.

LOOKED: reachability/phone/internal-task-type.png · Task type and its entire border sit centrally above Add task type; earlier child text clips under the header and later dates meet the footer boundary.

LOOKED: reachability/phone/prospect-full-subtask-title.png · The entire formerly shortened title wraps in its field beneath the parent link; company label remains compact; fixed actions clear the title and details.

LOOKED: reachability/phone/prospect-note-48.png · Note 48 is whole near the top of the field with following paragraphs below; the preceding paragraph clips at the header and later continuation meets the footer.

LOOKED: reachability/phone/prospect-source-note-74.png · Note 74 is whole below the header with notes 75–80 beneath it; preceding text clips at the top and source continuation remains below the scroll frame.

Reproduce: `npm run mcp:smoke -- --only=task-plan-reachability`.
The mode reuses the isolated MCP/emulator fixture setup, blocks external browser requests, and changes no
app data while navigating (task/company snapshots are compared afterwards). It covers only phone states
because every checker finding is from the phone; desktop rendering is unchanged and already inspected.

Evidence: [capture manifest](reachability/manifest.json), [successful run](reachability/check.txt).
The first run failed in the new harness with `TypeError: Cannot read properties of undefined (reading 'company')`:
the emulator reader returns document IDs as strings. The lookup now compares the numeric linked ID as a
string; the complete focused check then passed. Original failure log: `/tmp/g09-reachability-initial-failure.log`.
