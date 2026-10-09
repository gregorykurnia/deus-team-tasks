# Clients Historical — Page Plan

**Status:** Part 1 (client list, client count, sector count). Part 2 to follow.

## Where it lives

- **Sidebar:** new item "Clients Historical" under the existing **Clients** group (next to Client Pipeline and Prospect Journal).
- **Code:** new tab id in `components/Sidebar.tsx`, render branch in `components/App.tsx`, new component `components/ClientsHistoricalTab.tsx`.
- **Data:** new collection `historicalClients` in the existing `deus-client-tracker` Firestore project (same `clientsDb` the pipeline uses). It is separate from `pipeline`, so editing pipeline rows does not change this list.

## Section 1 — Client list

- Two levels only: **clients** (heads) and **subsidiaries** under a head.
- A head can have zero subsidiaries. Not every head has any.
- Each head expands/collapses to show its subsidiaries, indented. Heads start expanded.
- **Head row:** name, **Sector** (typed directly in the cell), **Count head** checkbox, subsidiary count.
- **Subsidiary row:** name only. No sector of its own (it inherits the head's). Can be moved to another head.
- **Actions:** add client, add subsidiary to a head, rename, move subsidiary, delete.
- **Delete rule:** a head can only be deleted once it has no subsidiaries (move or delete them first).
- **Sorting:** click Client, Sector, Count head or Subs to sort the heads (the pipeline's behavior: first click ascending, next click reverses). Clients start A to Z. A head with no sector always sorts last. Subsidiaries always stay A to Z under their head. On phones the header row is hidden, so the toolbar has a sort dropdown with a direction button instead.

## Section 2 — Client count

Total clients counts every subsidiary, plus each head whose **Count head** is on.

```
Total = (heads with Count head ON) + (all subsidiaries)
```

- **Count head** is set per head. Default is ON.
- A head with Count head OFF stays visible in the list, but is not counted.
- Summary cards at the top of the page show: **Total** · Heads counted · Heads not counted · Subsidiaries (see Design guidelines).

Example:

| Head | Count head | Subsidiaries | Contributes |
|---|---|---|---|
| Head A | ON | 3 | 4 |
| Head B | OFF | 2 | 2 |
| Head C | ON | 0 | 1 |
| **Total** | | | **7** |

## Section 3 — Companies per sector

- Table: sector → number of companies, sorted by count (highest first).
- An **Unassigned** row catches heads with no sector.
- A sector's count = counted heads in that sector + all subsidiaries under heads in that sector.
- Same counting rule as Section 2, so the sector rows add up to the Section 2 Total. This is a useful check on the page.

## Data model (proposed)

```
historicalClients/{id}
  name:     string
  parentId: string | null   // null = head; otherwise the id of its head
  sector:   string | null   // heads only; subsidiaries leave this null
  countHead: boolean        // heads only; default true
```

Sector is free text, typed by hand. Entries are matched to existing sectors ignoring case and extra spaces, so "retail" and "Retail" count as one sector.

## Decisions I made (change any of these)

| # | Question | My default |
|---|---|---|
| 1 | Where does the list come from? | Entered on this page. Not pulled from pipeline rows with "Client / Partner Done Deal". |
| 2 | Is Sector free text or a list? | Free text typed in the cell. Matched ignoring case and extra spaces, so "retail" and "Retail" count together. |
| 3 | Do subsidiaries carry the head's sector? | Yes. Only heads have a sector field. |
| 4 | Is Count head on by default? | Yes. |
| 5 | Does sector count use the same head-count rule? | Yes, so sector rows sum to the Total. |
| 6 | How deep does the hierarchy go? | Two levels. No subsidiary of a subsidiary. |

## Out of scope for now

- **Time data.** No start/end year or active vs. churned status in Part 1.

## Design guidelines

**Goal:** the page should look like it was always part of the app. It follows the **Client Pipeline** page (its sibling in the Clients group), not a new look. When in doubt, copy the closest existing pattern. If nothing close exists, pick the nearest one and flag it instead of inventing a style.

### Guardrails (protect the existing UI)

- **Existing files get additive edits only:** one `NAV` entry and one `TabId` member in `Sidebar.tsx`; one import and one render branch in `App.tsx`. Nothing else in existing files changes.
- **Do not touch** `app/globals.css`, `app/layout.tsx`, the sidebar's look, or any existing tab's components or styles.
- **No new dependencies, no new CSS file, no new fonts, no new global classes.** All styling is Tailwind utilities inside the new component.
- **No new colors.** Use only what the app already uses: `accent` (#4f46e5, via `bg-accent` / `text-accent`), the gray scale, and `red` / `amber` / `emerald` only when they carry meaning (nothing on this page is a warning, so mostly not needed).
- **No dark mode, no new icon library.** The app uses plain unicode glyphs (`▸ ✎ ✕ + ↓ ⌕`). Do the same.
- **No page padding, max-width or background on the page root.** `App.tsx`'s `<main>` already provides `px-3 py-4 md:px-6 md:py-6`. The root is a plain `<div>` that fills the width like the other tabs.
- **Z-index:** don't create new sticky layers. The top bar is `z-20`, the sidebar `z-50`, modals `z-[200]`, toasts `z-[300]`. New modals and toasts reuse the last two.

### Typography and color

- Font inherits Geist from the body. Never set `font-family`.
- Page title `text-[22px] font-semibold text-gray-900 tracking-tight`; subtitle `text-[13px] text-gray-400 mt-0.5`.
- Body text `text-[13px]`; names `font-semibold text-gray-900`; secondary text `text-xs text-gray-500`; empty values show `—` in `text-gray-400`.
- Column headers and card labels: `text-[11px] font-semibold uppercase tracking-wide text-gray-400`.
- Numbers use `tabular-nums` so counts line up.
- Corners: cards `rounded-lg`, list/table containers `rounded-xl`, modals `rounded-2xl`, buttons and inputs `rounded-md`, chips `rounded-full`.
- Every card/container: `bg-white border border-gray-200 shadow-sm`.

### Layout, top to bottom

1. **Header row** (same markup as Client Pipeline): title + subtitle on the left; on the right a secondary "↓ Export to CSV" button and the primary "+ Add client" button. Wraps with `flex-wrap gap-3 mb-5`.
2. **Summary cards** (Section 2): `flex flex-wrap gap-3 mb-5`, four cards: **Total clients**, **Heads counted**, **Heads not counted**, **Subsidiaries**. Copy the pipeline card exactly: `flex-1 min-w-[130px] bg-white border border-gray-200 rounded-lg px-5 py-3.5 shadow-sm`, label `text-[11px] font-medium text-gray-400 uppercase tracking-wide mb-1.5`, value `text-2xl font-semibold text-gray-900 leading-none`, footnote `text-[11px] text-gray-400 mt-1`. Values stay `text-gray-900` (no red/amber).
3. **Toolbar:** search box (same classes as the pipeline search: `h-9 pl-8 pr-2.5 text-[13px] border border-gray-200 rounded-md outline-none focus:border-accent focus:ring-2 focus:ring-accent/10`), then a right-aligned "Expand all / Collapse all" secondary button.
4. **Content grid:** `grid gap-5 items-start lg:grid-cols-[minmax(0,1fr)_340px]`. Client list on the left (Section 1), "Companies per sector" card on the right (Section 3). Below `lg` they stack, list first.

### Client list (Section 1)

- Container: `bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden`. Header strip `bg-gray-50 border-b border-gray-200 px-3.5 py-2.5`, columns: Client · Sector · Count head · Subs · (actions).
- **Head row:** `px-3.5 py-3 border-b border-gray-100 hover:bg-[#FAFBFD] transition-colors`. A `▸` chevron button at the left (`text-[10px] text-gray-400`, `rotate-90` when open, same as the sidebar groups), then the name in `font-semibold text-gray-900`. A head with no subsidiaries shows no chevron but keeps the same left alignment.
- **Subsidiary rows:** indented under the head with the same left guide line as the sidebar sub-menu (`ml-* pl-* border-l border-gray-200`), name in `text-gray-600`, row background `bg-gray-50/50`. Visibly secondary, never louder than the head.
- **Sector cell:** set → colored chip using `colorFor(sector)` from `lib/colors.ts` (same name always gets the same color, case-insensitive), sized like the pipeline badges `rounded-full px-2.5 py-0.5 text-[11px] font-medium`. Empty → the dashed placeholder pill from `ClientBadge` (`border border-dashed border-gray-300 rounded-full px-2 py-0.5 text-[11px] text-gray-400`) reading "+ sector". Subsidiary rows leave this cell blank.
- **Count head:** a checkbox with `accent-accent`, `h-4 w-4`, labelled for screen readers. When OFF, keep the row fully readable (do not fade it); just show a small `text-[11px] text-gray-400` "not counted" note next to the name.
- **Editing:** click-to-edit exactly like pipeline cells: editable cells get `cursor-pointer hover:bg-gray-50/60` and open the existing `ClientTextPopup` (anchored floating panel). Edits save immediately, no Save button. Do not build a second inline-edit style.
- **Row actions** (right side): the pipeline's 30px square icon buttons `w-[30px] h-[30px] rounded-md border border-gray-200 text-gray-400 hover:bg-gray-50 hover:text-gray-700`: add subsidiary (+), delete (✕, `hover:bg-red-50 hover:text-red-700`). Subsidiary rows also get Move. Each has `title` and `aria-label`.
- Long names wrap (`break-words`), never push the layout wider.

### Sector card (Section 3)

- Same container style as the list, card title `text-[13px] font-semibold text-gray-900` with a one-line `text-[11px] text-gray-400` subtitle ("Counted heads + subsidiaries").
- One row per sector: colored chip (via `colorFor`), the count right-aligned `text-[13px] font-semibold text-gray-900 tabular-nums`, and a thin proportional bar underneath (`h-1.5 rounded-full bg-gray-100`, fill = that sector's `solid` color from `colorFor`). Sorted by count, highest first.
- **Unassigned** is always last, in neutral gray, regardless of count.
- Footer row `bg-gray-50 border-t border-gray-200 font-semibold`: "Total" and the number, which must equal the Total summary card.
- Sectors with a count of 0 (for example a sector whose only head has Count head OFF and no subsidiaries) are not listed.

### Add / edit dialogs

- Same modal as `ClientEntryModal`: overlay `fixed inset-0 bg-black/45 z-[200] flex items-center justify-center p-5`, panel `bg-white border border-gray-200 rounded-2xl shadow-xl p-7 w-full max-w-lg max-h-[90vh] overflow-y-auto`, title `text-base font-semibold text-gray-900`, ✕ close button top-right.
- Fields: label `block text-xs font-medium text-gray-600 mb-1` (required marked with `text-accent *`), input `w-full h-9 text-[13px] border border-gray-200 rounded-md px-2.5 outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 bg-white`.
- Footer uses the same secondary + primary button classes as the header buttons. Clicking the overlay or pressing Escape closes it, as in the pipeline.
- Delete uses `window.confirm`, like the other pages. Blocking a head delete (it still has subsidiaries) shows the bottom-right toast: `fixed bottom-5 right-5 z-[300] bg-gray-900 text-white text-[13px] rounded-lg px-4 py-2.5 shadow-lg`.

### States

- **Loading:** `text-gray-400 text-sm py-20 text-center` — "Loading clients…".
- **Empty (no clients yet):** the Prospect Journal empty state: `h-12 w-12 rounded-xl bg-indigo-50 text-xl text-accent` glyph tile, title `text-sm font-semibold text-gray-800`, sub `text-sm text-gray-400`, and a `border border-accent/20 bg-accent/5 text-accent rounded-lg px-3 py-2 text-sm font-medium` "+ Add first client" button.
- **No search match:** same layout, "No matching clients" / "Try another search term."
- **Summary cards while empty:** show `0`, not hidden.

### Responsive and interaction

- Works from 375px up. The mobile hamburger sits top-left, so the page needs no extra top spacing; the app's header already handles it.
- No horizontal scroll on the page itself. Anything wide scrolls inside its own card with `overflow-x-auto`. No `100vw` tricks.
- Below `md`, the sector chip and Count head control wrap under the client name inside the row instead of squeezing columns; the "Subs" column is hidden below `sm` (the count shows next to the chevron instead).
- Hover, focus and active states are always present: `transition-colors` on rows and buttons, `focus:ring-2 focus:ring-accent/10` on inputs, minimum 30px tap targets (the pipeline's size).
- Every client starts expanded on each page load, including clients added later. Collapsing a client is local to the page and resets on reload. Search matches head and subsidiary names and auto-expands heads that have a matching subsidiary.

### Visual QA before calling it done

- [ ] Side by side with Client Pipeline: header, cards, buttons, search box have the same heights, radii, colors and spacing.
- [ ] `git diff` on existing files shows only the three additive edits (Sidebar `NAV`, Sidebar `TabId`, App import and render branch).
- [ ] Every other tab renders the same as before (click through all ten).
- [ ] Sidebar: new item is highlighted when active; Clients group opens automatically; collapsed and mobile sidebar still work.
- [ ] Checked at 375px, 768px and 1280px wide: no page-level horizontal scroll, nothing overlaps the sidebar or top bar.
- [ ] States: loading, empty, search with no match, one head, many heads with and without subsidiaries, very long names, a head with Count head OFF, many sectors, no sectors set.
- [ ] Sector rows add up to the Total card in every state above.
- [ ] `npm run lint` and `npm run build` pass.

## Implementation touchpoints

- `components/Sidebar.tsx`: add `clients-historical` to `NAV` (under Clients group) and to the `TabId` union.
- `components/App.tsx`: render `ClientsHistoricalTab` when `tab === "clients-historical"`.
- `components/ClientsHistoricalTab.tsx`: new page (sections 1–3), built to the design guidelines above. Reuses `ClientTextPopup` / `FloatingPanel` for click-to-edit and `colorFor` from `lib/colors.ts` for sector colors.
- `lib/useHistoricalClients.ts`: Firestore hook for `historicalClients`, same pattern as `lib/useClientPipeline.ts`.
- `lib/historicalClientTypes.ts`: types and count helpers (so the page and the sector table use one counting function), plus the sector-name matching.
- Check that the `deus-client-tracker` Firestore rules allow reads and writes on the new collection.

## Part 2

To follow.
