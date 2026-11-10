# R1ec — Empty/offline heading order

**Finding first: R1eb-A1 is repaired.** Before this change, `ui/EmptyState.tsx:21` emitted
`h3` directly after `desk/PageHeader.tsx:34`'s `h1`, e.g. Flows with nothing saved or
nothing loaded offline. The regression failed with `Expected: "H2", Received: "H3"`
at both sizes. No remaining heading-order or visual-layout fault was found in scope.

## Repair and nesting

Large page messages now default to `h2`; small messages retain `h3` under their panel
or document heading. The explicit `headingLevel` prop keeps large empty day/person
messages and the gallery example at `h3` below their existing `h2`. No wording,
CSS, data access or action changes. `FlowDocument`'s small empty state remains `h3`
below its `h2`, as do the Today panels. Unit regressions cover page-level messages,
a real Panel, and heading overrides independent of visual size.

## Audit evidence

[audit-summary.json](audit-summary.json): exactly **30/30** affected entries, with
zero violations, setup errors, failures, missing or extra entries. No unrelated
state was audited. R1eb's original reports and the existing prototype references
retain every saved hash in [preserved-evidence.json](preserved-evidence.json).

- [Initial eight clean entries](01-interrupted-report.json): the first audit process
  ended with signal 15 / exit 143 before its wrapper could copy the report. The cause
  was not established. The partial report was preserved and its owned server groups
  stopped; no clean entry was repeated.
- [Four remaining Today/Tasks/Plan entries](01-resume-today-tasks-plan.json).
- [Eighteen Companies/Notes/Past/Flows entries](02-companies-notes-past-flows.json).
- [Exact resume commands and timings](audit-runs.json); each stack verified all five
  local ports free afterward. Original command is in `01-today-tasks-plan.log`.

The existing axe runner used local `next dev`, `NEXT_PUBLIC_USE_EMULATOR=1`, emulator
8180, `MCP_TASK_PLANS_ENABLED=0`, and a 2 GiB emulator heap. The saved guard results
accepted the runner-authorized scoped checks. The intentional offline recipes cause
expected Firestore transport warnings, not runtime exceptions or setup failures.

Recheck with the existing harness, using only the original scope:

```sh
scope=$(jq -r '.[0].repairScopes[0].regex' test-results/task-plan-connector/r1eb/findings.json)
JAVA_TOOL_OPTIONS=-Xmx2g MCP_TASK_PLANS_ENABLED=0 npm run a11y -- --only "$scope"
```

## Visual review

The four frames cover 1440 × 900 desktop and 390 × 844 phone, both empty and offline.
Full-resolution before/after frames and 100% message/edge/navigation crops are saved
here. `visual-diff.json` records full-frame and message-region pixel differences.

| State | Before | After |
| --- | --- | --- |
| Desktop empty | [before](desktop-empty-before.png) | [after](desktop-empty-after.png) |
| Desktop offline | [before](desktop-offline-before.png) | [after](desktop-offline-after.png) |
| Phone empty | [before](phone-empty-before.png) | [after](phone-empty-after.png) |
| Phone offline | [before](phone-offline-before.png) | [after](phone-offline-after.png) |

**Visual fault list: empty.** All four message regions are pixel-identical before
and after. Three complete frames are identical; the desktop empty frame differs
by only 19 pixels around the sidebar's bottom shadow (outside the message).
I initially misread the batched image display as omitting the offline phone bar.
Reopening the full image individually and comparing file hashes confirmed the bar
was present in every saved frame; there is no capture or application fault.
The phone navigation crop includes the raised plus and both frame edges.

LOOKED: desktop-empty-before.png · Icon tile sits above the message inside the wide glass card; New flow sits below; side navigation is separate; no edge clipping or covered text.
LOOKED: desktop-empty-after.png · Same icon, message and button placement; card and sidebar edges stay whole, text is readable and the action is unobscured.
LOOKED: desktop-offline-before.png · Amber banner sits above the narrow card; icon tile sits above the centered message; sidebar is clear; all text fits.
LOOKED: desktop-offline-after.png · Banner, card and sidebar retain their positions, with no overlaps, cut edges or incomplete text.
LOOKED: phone-empty-before.png · Icon, text and New flow sit within the card; raised plus sits above the bottom bar; both clear the card; all text is whole.
LOOKED: phone-empty-after.png · Card and New flow remain on the first screen, well above the bar; the raised plus and frame edges are whole, with readable text.
LOOKED: phone-offline-before.png · Banner sits above the card, icon above the readable message; the raised plus sits above the bottom bar, clear of the card; all text and edges are whole.
LOOKED: phone-offline-after.png · Banner and card remain whole; the raised plus sits above the visible bottom bar, clear of the message; all text is readable and uncovered.

## Checks and decisions

See `unit-before.log` and `browser-before.log` for the failing regression, and
`unit-after.log`, `browser-final.log`, type/lint logs and `build.log` for final checks.
Only `tests/smoke/empty-headings.spec.ts` ran: this is heading markup and its look check,
not a new/reworked flow. No data suite applies; no Firestore read/write code changed.
The scoped audit is the required recheck, not a repeated broad phase audit.

DECISION: Use the guide's page/panel defaults with explicit nested overrides instead of replacing every h3, preserving document and panel hierarchy.
DECISION: Preserve the eight completed audit entries and resume the missing 22 instead of repeating the interrupted batch, retaining complete evidence without redundant checks.
