# R1d accessibility and scoped comparison — 2026-11-10

Findings first: **two accessibility rule types remain open, and the full audit did not finish.**
The scoped comparison completed all 16 state/size pairs with no execution errors. Its screenshots and
native-pixel crops did not establish an additional visual defect. R1e owns the findings and missing audit
coverage below; no repair or next task was started here.

## Complete findings and dispositions

| ID | Source and breaking state | Evidence and disposition |
| --- | --- | --- |
| R1d-A1 | `ui/TaskRow.tsx:291` (date-cell accessible names; `cellWords` at lines 199–202). In `017-all-tasks-normal-desktop`, undated rows display **No dates** but their button name is **Deadline: None. Change**. Phone last-action cells are also reported. | Serious `label-content-name-mismatch`: 40 state/size entries, 363 node occurrences, 17 distinct selectors. **R1e:** repair confirmed label/name mismatches, preserving visible wording and date behavior; add a failing assertion and recheck affected states. Every state, selector, HTML fragment and axe explanation is in [the raw report](a11y-report.json); [rule index](a11y-summary.json). |
| R1d-A2 | `ui/Menu.tsx:113`, portalled by `ui/Menu.tsx:39`. Open Details shown in `034-all-tasks-details-shown-desktop`; the menu sits outside page landmarks. Other open menus reproduce the same rule. | Moderate best-practice `region`: 24 state/size entries, 24 node occurrences, one shared menu selector. **R1e:** assess and repair landmark coverage without changing menu semantics, focus or placement; recheck affected menu routes. The rule index contains the complete state list; this is not a contrast exception. |
| R1d-H1 | Full sweep in `scripts/a11y/axe.mjs:143–148`, with servers started at lines 34–37. At `247-flows-onboarding-desktop`, emulator writes return HTTP 500 `UNKNOWN`; its log reports `java.lang.OutOfMemoryError: Java heap space`. | The invocation inherited a task-driver `JAVA_TOOL_OPTIONS=-Xmx2g` cap. One audit attempt ran for 2,170.2 seconds, then the exhausted stack was explicitly stopped (exit **-15**, not a passing check). Final saved report: **207 assessed, six failed, 71 not reached**, out of 284 expected reports. **R1e:** finish only the 77 unassessed entries on fresh emulator stacks, and recheck the repaired accessibility states. [Coverage, complete failed-state messages and exact retry commands](audit-coverage.json), [heap error excerpt](emulator-failure.log), [interruption metadata](audit-interruption.json), [audit log](a11y.log). |

The six failed attempts are `247-flows-onboarding-{desktop,phone}`, `250-flows-no-steps-yet-phone`,
`254-flows-edit-a-flow-{desktop,phone}` and `255-flows-saving-desktop`. They failed during fixture clear/seed,
so they provide no accessibility result. Other assessed states have no recorded setup/step errors.
One additional install storyboard (`269-installing-and-opening-with-no-connection-open-the-board`) is
deliberately skipped at both sizes by the existing harness; it is not included in the 284 expected reports.

`audit-coverage.json` assigns all missing coverage to R1e and provides two exact `retryScopes[].command`
values: 38 states at both sizes, then `250-flows-no-steps-yet` on phone only. Do not rerun the broad sweep.
The latter state's desktop result was obtained while shutdown was being prepared; the final saved report,
rather than the earlier interruption snapshot, is the source of all counts above.

## Visual candidates inspected

| Candidate | Evidence | Disposition |
| --- | --- | --- |
| Client second-row deadline appears shortened in a tall comparison preview. | [100% deadline crop](crops/020-all-tasks-clients-phone-second-deadline.png) shows the whole **In 8 days** pill with padding on its right. | Not confirmed; no repair. |
| Rows pass behind pinned phone navigation; Plan's first due card continues behind it. | All five `*-phone-first-frame.png` crops retain the initial 390×844 viewport. The same scrolling/fixed-navigation relationship occurs in the prototype. The first task identity is readable. | Existing scrolling behavior, not a newly established defect. G09's [reachability review](../G09-fresh-eyes.md) proves final rows and details can be scrolled clear; no reachability was inferred from a tall screenshot alone. |
| Text or the next field meets the sheet footer, and lower dates are initially off-screen. | Three phone footer crops and desktop date/footer crops show the scroll boundary, with whole fixed actions. | Expected scroll continuation; G09's dates/notes reachability evidence is retained. The task title, category and subtask entry remain above the actions. |
| Task names, company/group labels and quick-entry placeholders end in ellipses. | Every relevant desktop/phone pair plus the first-frame crops. | Guide §5.14 specifies two-line titles and shortened single-line labels. Full-name access was checked in G09; do not remove this documented behavior. |

No new design gap was established, so the studio handoff/open-items files are unchanged.

## Comparison scope and commands

Exactly one `npm run a11y` invocation; its package command adds `--servers --distinct`. The 143 distinct
entries include one manually captured install storyboard, leaving 142×2 expected report entries.
No broad audit rerun was attempted after the heap failure.

Exactly one comparison invocation, on a fresh emulator after the failed audit's owned process groups stopped:

```sh
npm run compare -- --only '^(017-all-tasks-normal|019-all-tasks-prospects|020-all-tasks-clients|021-all-tasks-internal|062-task-details-company|063-task-details-internal|064-task-details-finished|102-plan-one-day-normal)$'
```

The regex was checked against `scripts/compare/states.mjs` / the prototype map before running:

| State ID | Prototype state |
| --- | --- |
| `017-all-tasks-normal` | `tasks.html` |
| `019-all-tasks-prospects` | `tasks.html?kind=pro` |
| `020-all-tasks-clients` | `tasks.html?kind=cli` |
| `021-all-tasks-internal` | `tasks.html?kind=int` |
| `062-task-details-company` | `tasks.html?open=task-edit` |
| `063-task-details-internal` | `tasks.html?open=task-edit-int` |
| `064-task-details-finished` | `tasks.html?open=task-done` |
| `102-plan-one-day-normal` | `plan.html?view=day` |

Both configured sizes ran: desktop **1440×900**, phone **390×844**. Base pages are full-page captures capped
at 1,800 pixels; sheets retain the viewport height. Native first-viewport crops avoid treating those tall
captures as a phone screen. [Exact scope](scope.json), [comparison results](compare-report.json),
[comparison log](compare.log), [exit/timing](compare-exit.json).

The comparison is a capture/text-difference tool, not a pixel-match assertion. Its visible-text differences
are capped at 40 strings per side per state. All 16 prototype, 16 app and 16 side-by-side images are retained
byte-for-byte; references were generated once and never regenerated. No unchanged G08/G09 evidence was replaced.

### Documented differences versus potential regressions

- Guide §8 / D-020–D-021 deliberately darkens muted/semantic text, the button gradient and field outlines
  from the prototype. Those visible changes are accepted; do not lighten the app to match the prototype.
- Guide §5.14 permits label/title ellipses and horizontal phone filter scrolling. These are separate from
  the axe label/name findings, which still require disposition.
- Separate Company/Group columns (`5d04c41`), status controls (`79c4ad7`), parked work (`4064598`), and the
  existing subtask flow predate this audit. They explain extra rows, different wrapping and taller sheets;
  this report does not treat an older prototype's missing controls as a new defect or newly approve a design.
- Task dates remain independent per the owner's recorded rule and commit `d188c50`; the prototype's old
  kept-in-step notice is not a reason to restore date synchronization.

## Full-resolution picture observations

All 16 comparison pairs below, the two named G09 baselines and all 13 native-pixel crops were opened with
`view_image` at `detail: original`. Descriptions are from the pictures; the candidate/fault lists above
record their disposition. `crops.json` records exact source rectangles at scale 1.

LOOKED: both/017-all-tasks-normal-desktop.png · Rows rest inside the white list beside the sidebar; the capture ends mid-list, titles wrap and labels ellipsize; no action covers text, and headings/dates are readable.

LOOKED: both/017-all-tasks-normal-phone.png · Cards sit below categories and filters; navigation stands in front of lower cards, and both long captures end mid-list; the first task and category are whole, later titles intentionally shorten.

LOOKED: both/019-all-tasks-prospects-desktop.png · Ten prospect rows sit inside the panel; its base and sidebar are whole; company/type labels shorten, with clear task titles, date pills and controls.

LOOKED: both/019-all-tasks-prospects-phone.png · The first prospect card rests above navigation; later cards pass behind it and the long capture ends mid-row; the selected category and first title/date are whole, later titles shorten.

LOOKED: both/020-all-tasks-clients-desktop.png · Six client rows sit above the panel's rounded base; sidebar remains alongside; names and dates are readable, some type labels ellipsize, and no control overlays a row.

LOOKED: both/020-all-tasks-clients-phone.png · Client cards stack within the panel above its visible base; navigation overlaps middle scroll content; the first title/date and category fit, and the second deadline is whole in its native crop.

LOOKED: both/021-all-tasks-internal-desktop.png · Fifteen rows rest within the panel above its complete base; sidebar is separate; titles wrap, group labels shorten, and dates and actions remain readable.

LOOKED: both/021-all-tasks-internal-phone.png · Internal cards sit below the selected tab; fixed navigation fronts the next card and the capture cuts later rows; the first task, deadline and category are readable, while side-scrolling chips clip at their edge.

LOOKED: both/062-task-details-company-desktop.png · The right sheet floats over a blurred list; its rounded base contains whole actions; company/task text fits, and lower date fields continue below the scroll boundary.

LOOKED: both/062-task-details-company-phone.png · A bottom sheet fronts the list; title, company and subtask entry sit above the fixed footer; the placeholder ellipsizes and the next field meets the scroll edge, while actions are whole.

LOOKED: both/063-task-details-internal-desktop.png · Internal fields sit inside the floating sheet; its date row ends directly above the fixed footer without clipped values; the full title, group and action labels fit.

LOOKED: both/063-task-details-internal-phone.png · Internal title, group and subtask entry stack above the footer; priority ends above its boundary and later dates are below the scroll; text and fixed actions remain whole.

LOOKED: both/064-task-details-finished-desktop.png · The finished-task sheet fronts the blurred list; Done is selected and the rounded base contains Mark not done and Save changes; titles fit, with lower fields off-screen.

LOOKED: both/064-task-details-finished-phone.png · The finished-task bottom sheet fronts the page; Done and identity are clear above fixed actions; its placeholder shortens and a later label meets the scroll edge, while button text fits.

LOOKED: both/102-plan-one-day-normal-desktop.png · The day strip rests above task cards beside a calendar panel; both panel bases fit, no overlay covers content, and card names, dates and the note preview remain whole.

LOOKED: both/102-plan-one-day-normal-phone.png · Day controls sit above the first due card; navigation fronts its lower date/person details and later cards continue below the capture; the task identity is readable and the later note preview ends cleanly.

LOOKED: ../g09/desktop/plan-parent-and-subtask.png · Two child cards rest inside the day panel beside the sidebar; names, parent labels and dates fit, notes end in whole lines, and no footer or frame edge covers a control.

LOOKED: ../g09/phone/plan-parent-and-subtask.png · Both child cards and their bases sit above navigation; the day strip is scrolled above the frame, names/dates fit, and each preview ends with a clean ellipsis and padding.

## Decisions and checks

DECISION: Use eight verified flow states at both sizes instead of every prototype state; this covers destinations, saved task sheets and the touched Plan day view without expanding R1d.

DECISION: Stop the proven heap-exhausted audit and hand its exact missing coverage to R1e instead of repeating the broad sweep; its single-attempt failure and all obtained findings remain reviewable.

DECISION: Preserve the app and prototype references instead of making repairs during this row; R1d explicitly records findings and R1e owns repairs and focused rechecks.

- Accessibility: one partial/failed sweep; two rule types, six failed attempts and 71 not-reached entries are recorded, not described as a pass.
- Comparison: 16/16 selected state/size captures completed, zero recorded setup/step/page errors; every comparison and crop inspected at original size.
- Artifacts: exact state/size coverage, report partitions, PNG dimensions, source-copy hashes and local evidence links verified; immutable evidence manifest retained.
- Safety/delivery: emulator-only development servers, fictional fixtures, unchanged activation settings, only owned process groups stopped; final test ports free and `git diff --check` clean.

This is a docs/evidence-only row. Per the brief's Checks section, artifact verification replaces unrelated
TypeScript, lint, unit, data and build reruns. No production data/settings or owner-only action was needed.
