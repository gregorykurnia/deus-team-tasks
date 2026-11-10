# R1e — Accessibility repairs

Findings first: the two confirmed shared-component faults are repaired. R1d's missing audit
coverage is assigned to **R1eb**, directly after R1e and before the final phase review.

| Finding and breaking input | Repair / disposition | Regression evidence |
| --- | --- | --- |
| R1d-A1, `ui/TaskRow.tsx:199–202`: no deadline announces “None” while the pill says “No dates” or “No deadline”; phone last-action labels concatenate their visible heading/value and repeat the heading in their name. | Use the deadline model's words even with no end date; share the rendered last-action words with its accessible name; separate the phone heading/value with actual whitespace. Date behavior and visible layout are preserved. | Five new unit cases failed before the repair; all six new cases pass after. Both date browser cases fail before, pass after. |
| R1d-A2, `ui/Menu.tsx:113`: an open portalled menu falls outside landmarks. | Wrap ordinary menus in a named region while retaining the menu/menuitem roles, portal, placement and focus handling. Quick-editor dialogs keep their dialog semantics. | Both menu browser cases fail `region` before, pass after; arrows, End, Escape, focus restoration, menu bounds and last-action hit testing pass. |
| R1d-H1, `scripts/a11y/axe.mjs:143`: emulator heap exhaustion left 77 entries unassessed across other app areas. | **R1eb** owns exactly the two retry scopes in `../r1d/audit-coverage.json`, with fresh bounded batches and any repairs assigned before R1. This avoids combining a cross-app audit with these shared-component repairs. | Not rerun or claimed complete in R1e. The original failed sweep and its complete coverage list remain unchanged. |

## Focused checks

- Final light checks passed: `npx tsc --noEmit`, changed-file ESLint, `npm run test:unit`
  (**984 tests, 41 files**) and one `npm run build`. See the corresponding saved logs.
- `npx playwright test tests/smoke/audit-repairs.spec.ts --project=desktop --project=phone`:
  four expected baseline failures; final desktop cases pass in `browser-attempt-2.log`, final phone
  cases pass in `browser-after.log` (`--project=phone --last-failed`).
- The first repair attempt caught a missing text separator. It also exposed my test's incorrect assumption
  that Key points was the last menu item; End correctly reaches Reset to the default. The next attempt's
  phone-only image assertion incorrectly included the hidden, lazy desktop logo; it now checks displayed images.
  All attempts are recorded in the browser logs, rather than represented as a first-pass success.
- The regression spec also asserts no horizontal document overflow, clipped/covered visible date cells,
  unloaded displayed images, runtime errors or console errors, and checks the final menu action is unobscured.
- The exact scoped audit regex and 58 expected IDs are in `audit-scope.json`; `a11y-report.json` and
  `audit-summary.json` prove **58/58 assessed, zero missing/extra entries, setup errors, failures or violations**.
  Command: `node scripts/a11y/axe.mjs --servers --only <regex>` on a fresh emulator stack. No previously
  clean state or prototype reference was regenerated.
- `autorun check` recognizes R1eb as the next task without starting it. All five owned server ports
  (3100, 8180, 4400, 4500, 9150) are free after shutdown; evidence links and `git diff --check` pass.

## Picture findings and dispositions

No additional visual fault was confirmed. Candidates were checked rather than inferred from the code:

- Phone filter text clips at the horizontal strip edge and the quick-add hint ends in an ellipsis.
  Guide §5.14 explicitly allows both; the task titles, dates and last-action words in this fixture are whole.
- The open menu covers underlying task content and phone navigation. Its catcher intentionally suspends that
  background while it is open; Escape closes it and returns focus. Its own action centres remain unobscured.
- The initially open menu cuts through the next item at its bottom scroll boundary. End scrolls the last item
  into full view, with the footnote and rounded base visible, on both sizes. No menu height/design change is needed.
- `images.json` records native dimensions, source paths, pixel differences and 100% crop rectangles.
  Desktop/phone task dates and the phone menu are pixel-identical before/after. The desktop menu differs in
  174 pixels, with unchanged geometry and whole controls. The original R1d prototype references are untouched.

Every gallery image below and all four `crop-*` images were opened at original resolution.

LOOKED: gallery/after-desktop-dates.png · Three rows sit on the white list panel beside the sidebar; bases and frame edges are whole, no overlay covers content, and titles, dates and last-action words are readable.

LOOKED: gallery/after-phone-dates.png · Three cards stack above the pinned navigation; the plus button rises in front of the panel base without covering task text; filters and the hint intentionally shorten, while all task names and dates fit.

LOOKED: gallery/after-desktop-menu.png · The menu floats below Details shown in front of the right-hand task cells; the next item meets its bottom scroll edge, but visible item text and the focus ring are whole.

LOOKED: gallery/after-phone-menu.png · The menu stands below its trigger in front of the cards and navigation; the next item clips at its scroll base, while the focused Company item and visible labels fit inside its edges.

LOOKED: gallery/after-desktop-menu-bottom.png · The scrolled menu keeps its rounded base; earlier items are above the scroll edge, the final reset button and footnote are whole, and its focus ring is clear of the background rows.

LOOKED: gallery/after-phone-menu-bottom.png · The scrolled menu fronts the phone navigation; its reset action and footnote sit wholly above the rounded base and viewport edge, with earlier items above the scroll boundary.

The four corresponding `before-*` task/menu frames were also opened at original size; they show the same
placement, truncation and overlap described above. The faults repaired here are in accessibility semantics.
