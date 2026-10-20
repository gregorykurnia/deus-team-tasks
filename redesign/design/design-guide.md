# Design guide

**Draft, stage 3 (2026-10-20).** Not frozen yet: a version number and date go here at stage 5, once the owner approves it.

Direction **G, "Glass in calm blue"** (D-003, D-004). The tokens are in `tokens.css`. The working prototype is in `prototype/`. Open `prototype/index.html`, or `prototype/map.html` for a link to every screen and state. When this guide and the prototype disagree, this guide wins. Every place where it deliberately differs from the prototype is marked **Changed from the prototype**.

**Light mode only.** The brief rules out dark mode at every step, so this guide has no dark theme and no dark tokens. Wherever the process asks for "light and dark", read "light".

Contents
1. Principles
2. Foundations: colour, type, space, radius, elevation and glass, icons, motion
3. The shell and moving around
4. Components
5. Patterns
6. Screens
7. Copy and tone
8. Accessibility
9. Not designed, and open items

---

## 1. Principles

1. **Calm by default, colour on purpose.** Surfaces are white glass over a pale sky-and-aqua wash. Colour means something: blue is the accent and "where you are", the three kinds of work have their own hues, and red and amber are kept for urgency. Nothing is coloured just to decorate.
2. **One standout moment per screen.** Each screen leads with one large thing: Today's hero sentence and two-week chart, the four company tiles, the past-clients total, the flow's decision card. Everything else stays quiet.
3. **Urgency is spelled out, not just coloured.** "2 days late", "No action for 15 days" and "Gone cold" are words first, with colour as a second signal.
4. **Act where you see it.** Mark done, edit a single detail, open the company or open the task, all without leaving the screen (D11, B10). Changes save on their own, and Undo is offered where a change is easy to reverse.
5. **Phone and desk are equals.** Every job works on both. The phone isn't a shrunken desk: it has its own tab bar, bottom sheets and stacked layouts.
6. **Room to breathe, even at scale.** Generous padding and rounded shapes, but every list holds thousands of rows, very long names and other scripts without breaking (see "Stress" in each screen).

---

## 2. Foundations

### 2.1 Colour

All values are in `tokens.css`. Text colours are given for a white surface unless stated.

**Backdrop and surfaces**

| Token | Value | Use |
|---|---|---|
| `--backdrop` | four soft radial washes (`--wash-1` to `--wash-4`) over `--page` #f0f4fa | Behind every screen, fixed while scrolling. Also the launch screen. |
| `--glass` | white 62%, blur 24px, saturate 1.4, 1px `--glass-line` edge, `--shadow` | Side bar, panels, tab bar, search field. |
| `--glass-strong` | white 84% | Rows and cards sitting on a panel. |
| `--surface` | #fff | Hover and selected rows, fields, menus, the current item in navigation. |
| `--surface-sheet` / `--surface-dialog` | white 94% / 97%, blur 30px | Sheets and dialogs. |
| `--scrim` | #1c2848 at 22%, blur 3px | Behind sheets and dialogs. |
| `--hair` / `--fill` | ink at 8% / 5% | Dividers and quiet outlines / quiet filled controls (chips, segmented track, person chips). |
| `--line-field` | #8e95a4, 1.5px inset (hover #616a7d) | The outline of form fields in sheets, dialogs and menus, at 3:1. **Changed from the prototype** (ink at 12%), D-021. |
| `--line-quiet` | ink at 12% | Choice chips, people pickers' person chips and other outlines where the words already show it's a control. |

**Text**

| Token | Value | Contrast | Use |
|---|---|---|---|
| `--ink` | #162036 | 16.2:1 | Titles, values, anything read first. |
| `--ink-2` | #46506a | 8.0:1 | Body text, labels, secondary buttons. |
| `--muted` | #616a7d | 5.4:1 (4.9:1 on the page) | Meta lines, hints, counts, placeholders. **Changed from the prototype** (#6f7a90, 4.3:1). |
| `--faint` | #8e95a4 | 3.0:1 | Never for words. Only the "–" for an empty value, weekend day numbers and disabled icons. **Changed from the prototype** (#a3abbd). |

**Accent.** `--blue` #2f6bea is the one accent: main buttons, links, focus rings, the current place, today, selection. `--blue-2` #4a8af4 is only the light end of decorative gradients (chart bars, the decision icon, selected days) and never sits behind text. Blue words on `--blue-soft` use `--blue-ink` #2b62d7. The main button's gradient runs #2f6bea to #3f75cf. **Changed from the prototype**, which ended on #4a8af4, where white text only reached 3.4:1.

**Kinds of work (W12).** Every task is exactly one kind. The base colour is for marks (dots, bars, done circles), `-soft` is for backgrounds, `-ink` is for words on `-soft`, and `-chart` is for stacked bars.

| Kind | Interface name | Base | Soft | Ink | Chart |
|---|---|---|---|---|---|
| Work for prospects | **Prospects** / "Prospect work" | #2f6bea | #e4edff | #2b62d7 | #2f6bea |
| Work for existing clients | **Clients** / "Client work" | #0f9a6c | #dcf5ea | #0c7a55 | #27b07f |
| Internal work | **Internal** | #5a6a85 | #e8ecf3 | #5a6a85 | #8d9ab1 |
| Team calendar events | **Team calendar** | #b7c3d8 | #e6ecf5 | #3a4a66 | #cbd8ec |

Prospects share the accent blue on purpose: prospect work is the sales team's main work, and the accent is never used for a meaning that clashes with it.

**Company groups (B2).** To approach is teal (`--g-lead` #0b7c74, soft #d9f3f1, ink #0b776f), Active uses the Prospects blue, Deal done the Clients green, and No or not now the Internal slate. Each group also has an icon: flag, bolt, done circle, pause.

**Urgency and status**

| Meaning | Colour | Where |
|---|---|---|
| Missed, too long without action, bad outcome, delete | `--red` #d92f43, soft #ffe5e8, ink #c52b3d | Deadline pills, last action, target date, "Gone cold", bad outcomes, delete buttons. |
| Close, getting late, crunch, offline | `--amber` #b25f00, soft #fff0d9, ink #a65800 | Within 3 days, 7 to 13 days without action, busy days, the offline banner and dot. |
| Done, saved, live, good outcome | `--green` #0f9a6c, ink #0c7a55 | Done pills, the "Saved" tick, the live dot, good outcomes, written-heading ticks. |
| High priority (where to act) | `--violet` #6a3fbd, soft #efe6ff | Only the "High priority" card on Companies, so it doesn't read as urgency. |
| Crunch day | `--crunch` #ffd99a | Timeline columns and month cells. |
| Important group | `--star` #f0a71b | The star on important task groups. |
| Search match | `--mark` #fff1b8 | Highlighted words in results. |

**Likelihood (U2).** Five calm blues, from `--lk-vhigh` #1f4fd1 down to `--lk-low` #cfdcf6. "Not rated" is grey stripes. Red and green are never used here, so a low rating reads as information rather than an alarm (D-014).

**Choice options (C3).** Nine pairs that people pick when they add an option: blue, sky, teal, green, amber, red, violet, pink, slate (`--opt-*`). Each has a pale background and words at 4.5:1 or better.

**Task group badges.** Six pairs (`--grp-0` to `--grp-5`), handed out in the order groups are created. The badge shows the group's initials. It's decorative, because the name is always beside it.

**People.** Six soft gradients (`--av-0` to `--av-5`), chosen from the person's name so the same person always gets the same colour. Initials are the first letters of the first and last words. For names in Chinese, Japanese or Korean script, they're the first two characters.

**The "outside" outline.** A 1.5px dashed `--outside-line` means "connected but not part of it": informed people (not owners), umbrella companies not counted in the totals, notes not tracked yet, and the dashed tile for not counted.

### 2.2 Type

**Plus Jakarta Sans** (Google Fonts), weights 400 to 800, with system UI fonts as fallback. It's modern and slightly rounded, so it fits the soft shapes, and it has clear figures. Every number in a column, a count or a chart uses tabular figures (`--num`).

| Role | Size (phone) | Weight | Line height | Tracking | Examples |
|---|---|---|---|---|---|
| Display number | 80 (68 below 1240, 58 on phones) | 800 | .95 | -0.05em | Past clients total, in a blue-to-teal gradient. |
| Page title | 34 (28) | 800 | 1.1 | -0.03em | "Today", "Tasks", a group's name. |
| Hero sentence | 26 (19) | 800 | 1.22 | -0.025em | "Two tasks are overdue and one company has gone quiet". Same style for a person (26/22), the notes document title (28/22) and a day (24/20). |
| Big figure | 34 (24) | 800 | 1.1 | -0.03em | Company group tiles. Figures in cards are 24 to 30. |
| Sheet / dialog title | 19 | 800 | 1.25 | -0.02em | "New task", "Delete this task?" |
| Panel title | 17 | 700 | 1.3 | -0.01em | "Needs attention", "Calendar today". |
| Section title | 15 | 800 | 1.35 | -0.01em | "Next two weeks", "Where to act", a flow step. |
| Row title | 15 (14.5 in tables) | 700 | 1.35 | -0.01em | A task's description, a company's name. At most 2 lines, then "…". |
| Body | 14.5 (14) | 500 | 1.45 | 0 | Everything else. |
| Writing | 15 (14.5) | 500 | 1.6 | 0 | Qualification notes, remarks, flow descriptions. |
| Small | 13 | 500 to 600 | 1.45 | 0 | Meta lines, notices, menus, results lines. |
| Label | 12.5 | 600 to 700 | 1.4 | 0 | Column heads, field labels, pills, tags. |
| Micro | 10.5 to 11.5 | 700 | 1.3 | 0 | Tab bar labels, day letters, chart counts. |

Rules
- Sentence case everywhere: titles, buttons, labels, menu items.
- Weight carries the hierarchy more than size: 800 for titles and big numbers, 700 for things you click or scan, 500 for reading.
- No italics. No all-caps, except initials.
- Long text never breaks the layout. The page sets `overflow-wrap: anywhere`, single-line labels end in "…" with the full text on hover, and row titles stop at two lines.

### 2.3 Space and layout

**Spacing.** The base is 4px, with half steps (2, 6, 10, 14) where rows need them. The tokens are `--sp-1` (2) to `--sp-16` (34).
- Between page sections: 22px (16px on phones).
- Between rows in a list: 6px. Rows are separate rounded cards, not lines in a table.
- Inside a row: 12 to 14px of padding, and 12 to 14px between the done circle, the badge and the text.
- Inside a panel: 8px, so rows almost reach the panel's edge and the glass shows round them.

**Page frame.** It's 1480px at most, centred, with 20px padding (28px on the right) and a 252px side bar beside the content, 24px apart. Content columns always use `minmax(0, 1fr)`, so long content can't push them wider.

**Breakpoints**

| Width | What changes |
|---|---|
| 1240px and under | Today's right column and the past-clients totals stack under the main content. A person's figures wrap under their name. |
| 1100px and under | Lists drop their least useful columns (for example the task list's start date and the People sparkline). The company tiles shrink. |
| 900px and under | **Phone and tablet layout.** The side bar becomes the tab bar. Page search and "New task" leave the header, and search sits under the title. Sheets rise from the bottom. List-and-detail screens (notes, flows) show one side at a time. |
| 760px and under | Tables become cards: the done circle on the left, the title across, details wrap underneath with small labels, and the deadline pill sits top right. The timeline pins its names on the left. |
| 640px and under | Phone type sizes. Segmented controls fill the width. Today's task rows drop their badge. |

Phones get 14px page padding and 130px at the bottom, so nothing hides under the tab bar. The safe area at the bottom is respected in sheet footers.

### 2.4 Radius

Everything is rounded. Bigger and more important surfaces get larger radii.

| Token | Value | Use |
|---|---|---|
| `--r-xl` | 30 (26 on phones) | Side bar, hero, sheets, the notes and flow documents. |
| `--r-dialog` | 26 | Dialogs. |
| `--r-l` | 22 | Panels, tiles, banners, figure cards. |
| `--r-menu` | 18 | Menus. Also the flow and decision cards. |
| `--r-m` | 16 | Rows, cards, notices. |
| `--r-field` | 14 | Fields, people pickers. |
| `--r-s` | 12 | Small cards, menu items, inner boxes. |
| `--r-xs` | 10 | Cells you can edit in place, small icon buttons. |
| `--r-pill` | 99 | Buttons, chips, pills, segmented controls, search, toasts. |

The company badge, task badge and group badge are rounded squares (radius about a third of their size). People are always circles. Flow step numbers are circles, and the decision is a rotated rounded square (a diamond).

### 2.5 Elevation and glass

Three levels, and frosted glass only at the first.
1. **Glass**: side bar, panels, tab bar. `--glass` with blur and `--shadow` (a hairline plus a long, soft, blue-tinted shadow).
2. **On glass**: rows and cards at 84% white with `--shadow-row`. On hover they turn white and lift (`--shadow-hover`).
3. **Floating**: sheets, dialogs, menus, the selection bar and toasts use `--shadow-pop`, a deeper blue-tinted shadow. Toasts are dark navy and are the only dark surface.

Selected or current items turn solid white with `--shadow-current`, or get a 1.5 to 2px blue ring when they sit among white items. Shadows are always tinted blue-navy, never grey or black.

### 2.6 Icons

They're drawn on a 24px grid, as 2.1px strokes with round caps and joins, in `currentColor`. Sizes: 18px by default, 19px in the side bar, 21px in the tab bar, 13 to 16px inside buttons, chips and pills. Icons always come with words, except icon-only buttons, which have a text label for screen readers and a tooltip.

| Icon | Means |
|---|---|
| sun | Today |
| list (two ticks and lines) | All tasks |
| calendar | Plan, dates |
| building | Companies, "a company" |
| note | Qualification notes |
| archive box | Past clients |
| flow (two boxes joined) | Flows |
| team | Internal work, people |
| plus | Add, new |
| check / done circle | Done, saved, good outcome |
| alert circle | Overdue, error |
| clock | Target date |
| snowflake | Gone cold |
| hourglass | Waiting on our follow-up |
| flag | High priority, To approach |
| bolt | Active |
| pause | No or not now |
| lock | Read only |
| crossed-out wifi | No connection |
| sync arrows | Kept in step with the company (B12), back online |
| external link | Open in the team calendar |
| star (filled / outline) | Important / mark as important |
| tree | Subsidiaries |
| diamond | Decision |
| undo arrow | Undo, mark not done, back to a step |
| sliders / columns | Fields / details shown |
| download | Export, install |
| phone with arrow | Install the app |
| phone, mail, people, chat, pin | Touch points: Call, Email, Meeting, Message, Visit |

### 2.7 Motion

Quick, small and gentle. Motion confirms what just happened. It never decorates.

| What | How | Time |
|---|---|---|
| Hover on rows and cards | background and shadow | .15s |
| Menu opens | fades in, rises 4px, scales from 98% | .14s ease-out |
| Scrim, dialog, selection bar | fade | .16 to .18s |
| Drawer (large screens) | slides 40px in from the right, fading in | .22s `--ease-out` |
| Bottom sheet (phones) | rises 40px, fading in | .25s `--ease-out` |
| Toast | rises 12px, fading in. Stays 5.2s | .22s |
| A task marked done | the circle fills at once, the title is struck through, then after .35s the row slides 14px right and fades | .5s |
| Something new or just changed (yours or a colleague's) | blue ring and glow that fades out | 1.8s |
| Loading | skeleton shimmer 1.4s, spinner .8s per turn | |

With **reduce motion** turned on, all animation and transitions are cut to an instant. Nothing depends on motion to be understood.

---

## 3. The shell and moving around (A4)

Every area is one step away on large screens, and one or two on phones.

### Side bar (over 900px)
A glass column, `--r-xl`, sticky, the full height of the window.
- **Brand:** the company logo (a striped placeholder until the rebuild) and the app's name. "Team desk" is a placeholder.
- **Areas**, in this order: Today, All tasks, Plan, Companies, Qualification notes, Past clients, Flows. Today and All tasks show a count (due soon or overdue / open). The current area is a white pill with a blue icon, and its count becomes a blue badge.
- **Task groups:** a heading with a "+" (New task group), then every group, important ones first with a star, then A to Z. Each shows its badge, its name (ending in "…" if long) and its open count. The list scrolls on its own when there are many. With no groups: "Group internal work by topic, like “Hiring”."
- **Install the app** (blue words, phone icon), hidden once installed.
- **Live status** at the foot: a green dot with a soft halo, "Live, everyone's up to date", or an amber dot, "Offline. Changes can't be saved."

### Tab bar (900px and under)
A floating glass bar 20px above the bottom edge, with 28px corners, at most 560px wide, centred. From left to right: **Today**, **Tasks**, a raised round **+** button (New task, a 56px blue gradient with a white edge), **Companies**, **More**. The current tab is a white pill with a blue icon and label. "More" counts as current on Plan, Qualification notes, Past clients and Flows.

### More (phones)
A bottom sheet listing Plan, Qualification notes, Past clients and Flows, each with a one-line description ("Deadlines, events and who carries what"). Then "Install on this phone" (hidden once installed) and the live status.

### Task groups on phones
A row of chips under the Tasks title that scrolls sideways: "All tasks" (inside a group), every group with its badge, star and count, then "+ New group". The current group has a blue ring. Any group is two taps away.

### Page header
The page title (34px, 800) with a short subtitle on the same baseline (the date, "128 open tasks", the range shown). Then search (a glass pill, 300px) and the main action (blue gradient button). On phones the search becomes a full-width field under the title, or a round search button on Today. The main action moves to the tab bar's + button, or stays in the page where it isn't "New task" (New company, New notes, Add a past client, New flow).

### Live updates (A1)
Changes by anyone appear without reloading. What changed gets the blue "arrive" glow, and where it helps, a small blue "Just changed" tag in its meta line. Qualification notes and flows say "Changed just now" on the heading or step. When a lot arrives at once, a toast names the colleague ("Kevin Tan’s changes just came in").

---

## 4. Components

Each component lists its variants and every state. "Hover" applies to pointer devices only; phones go straight from default to pressed.

### 4.1 Buttons

| Variant | Look | Use |
|---|---|---|
| **Main** (`cta`) | 44px pill, `--cta` gradient, white 700 text, blue glow | One per view at most: New task, Add task, Save changes, Create group, New company. |
| **Main, small** | 34px | Main actions inside panels and dialogs where 44px is too big. |
| **Danger** (`cta danger`) | 44px pill, solid `--red`, white text, red glow | Only the confirm button in delete dialogs. |
| **Secondary** (`btn`) | 40px pill, white 80% with a hairline ring, `--ink-2` 600 | Cancel, Mark done, Export, Fields, Edit flow. |
| **Small** (`btn sm`) | 34px | Inside rows, panel footers, empty states. |
| **Quiet** (`btn quiet`) | No background until hover (`--fill`) | "All 128 open tasks", "Show more", Change. |
| **Quiet red** (`btn quiet red`) | Red words | Delete in a sheet's footer. |
| **Icon** (`icon-btn`) | 40px circle, `--ink-2`. The glass version is 44px | Close, row menu (⋯), previous and next. |
| **Link** | Blue 700, underlined on hover | "See all 12", "Open company", "Show today". |
| **Add line** | Dashed blue outline, blue words, white on hover | "Add a step", "Add a decision", "Add an outcome", the quick capture field. |

States: default · hover (lighter or white, for the main button 5% brighter) · pressed (no extra style, the action follows at once) · focus (2.5px blue ring, offset 2px) · disabled (50% for main, 40 to 55% for others, no glow, `not-allowed` cursor) · busy (the label changes to "Adding…" or "Moving…" with a small spinner, and the button can't be pressed twice).

### 4.2 Segmented control
A pill track (`--fill`, 4px padding) holding 2 to 4 options. The chosen option is a white pill with `--shadow-current`. Options can carry a count in `--muted`. On phones it fills the width and the options share it equally. Uses: Kind of work (All, Prospects, Clients, Internal), Open or Done, Plan's views (Timeline, Month, Day, People), what Plan shows (Tasks and events, Tasks, Events), task priority (High, Medium, Low, where pressing the chosen one again clears it), Companies or By sector (past clients, phones).

### 4.3 Filter button and menus
- **Filter button** (`fbtn`): a 36px white pill with an icon, a label and a down arrow. When it's on, it turns `--blue-soft` with a blue ring, shows the value ("Due **Overdue**") and gets a round × to clear it. On phones the filters scroll sideways in one row.
- **Results line** under the filters: "**24** of 128 open tasks". When search finds nothing in this company group but something in others: "Found in other groups", with a chip for each group.
- **Menu**: a white floating card (`--r-menu`, `--shadow-pop`), at least 230px wide and at most 340px, scrolling after 440px. It opens below its button, or above when there's no room, and is kept 12px inside the window. Items are 9px by 12px, 600 weight, with a rounded `--fill` on hover. A small grey heading can start a group. Variants: **pick one** (a blue tick on the chosen item), **pick several** (a rounded checkbox, blue when on), **number** (an "At least [21] days" field with Apply), **red item** (delete), **disabled item** with a reason in its foot line ("Company tasks stay with their companies"), **colour palette** (a grid of 3 × 3 swatches). Esc or a tap outside closes it, and focus goes back to its button.

### 4.4 Chips, pills and tags

| Name | Look | Use |
|---|---|---|
| **Choice chip** (`chip`) | 36px white pill with a grey ring. Pressed: `--blue-soft` with a blue ring | Touch point, "Mark as important", quick dates (Today, Tomorrow, In a week). |
| **Count chip** (`hchip`) | White pill with a coloured count bubble on the left | Today's hero (Overdue, Due in 3 days, No action for 14+ days, Need a date), "Found in other groups". |
| **Insight chip** | White glass pill with a round tinted icon | Plan's summary: busiest day, longest quiet stretch, overdue before the range, no dates. |
| **Deadline pill** | 12.5px 700, tabular figures | `p-red` "2 days late" with an alert icon · `p-amber` "Today", "Tomorrow", "In 3 days" · `p-calm` "In 12 days", "4 Dec" · `p-none` (a ring, no fill) "No dates", "No deadline" · `p-done` "Done yesterday". The full date shows on hover. |
| **Kind tag** | Small pill in the kind's soft colour | The task sheet's header ("Prospect work"), the company column in the task list. |
| **Group tag** (`gtag`) | Pill in the company group's colour with its icon | Company record, notes list. |
| **Option chip** (`ochip`) | Pill in the option's colours | Status, type, priority and own choice fields. Several in one cell end with "+2". |
| **Outside tags** | Dashed or ringed, no fill | "Not counted", "Not tracked yet". |
| **Live tag** | Blue words with a blue dot | "Just changed". |
| **Read only** | A lock with grey words | The team calendar. |
| **Sector** | Grey pill | Past clients. |

### 4.5 People
- **Avatar**: a circle with initials on the person's hue and a 2.5px white edge. 30px in lists, 34px on Plan and Today, 24 to 28px in chips, 56 to 72px on a person's page.
- **Informed person**: a white circle with a 1.5px dashed grey edge and grey initials. Owners are solid; people only kept informed are outlined. The same rule applies to timeline bars and month dots.
- **Stack**: avatars overlap by 9px, up to 3, then "+4". Its label lists everyone: "Responsible: Maya Chen. Informed: Kevin Tan (backup)".
- **Person chip**: a grey pill with an avatar, the name and a ×. It's used in people pickers and flow roles. The person you're looking at (a person's page) is shown in blue.
- **Load meter**: five small bars, blue when lit (Today's "Who's carrying what").

### 4.6 Task rows
A task looks the same family everywhere: a done circle, then the title, then urgency and people. It's tinted by its kind.

| Variant | Where | Anatomy |
|---|---|---|
| **Card row** | Today | Done circle · badge (company initials in the kind colour, or the team icon) · title and meta (company or group, touch point, "High priority" for internal, last action in its tone, "Just changed") · deadline pill · people stack. On phones the badge is hidden, and the pill and people stack on the right. |
| **List row** | All tasks, a task group | Done circle or checkbox · title (with meta when a column is hidden) · the chosen columns. On phones it becomes a card (see 2.3). |
| **Day row** | Plan's Day view, a person's page | Done circle · title, company and deadline pill · "Responsible" and "Informed" lines with person chips and each informed person's part · key points in a grey box (3 lines at most) · on a person's page, "Their part" in a blue strip. |
| **Record row** | Inside a company record | A smaller white row: done circle, title, pill. |
| **Timeline bar, month line** | Plan | See 4.12. |

States, for every variant
- **Default**: 84% white card.
- **Hover**: white, lifted.
- **Focus**: blue ring. The whole row opens the task, and the done circle is its own button.
- **Done**: the circle filled with the kind colour and a white tick. The title is struck through in `--muted` and the badge is greyed. In open lists the row then **leaves** (slides and fades). In Done lists it stays, with "Done 3 days ago".
- **Overdue**: red pill "2 days late" with an alert icon. On the timeline, a red edge or a red diamond.
- **Within 3 days**: amber pill.
- **Undated**: "No dates" ringed pill, listed under "Needs a date" (D3).
- **Last action**: plain under 7 days, amber at 7 to 13 days ("Last action 9 days ago"), red at 14 or more ("No action for 15 days"). Company tasks only.
- **New or changed**: the blue arrive glow for 1.8s, and "Just changed" for a colleague's change.
- **Selected** (selecting several): `#f2f6ff` with a blue ring, and the checkbox filled.

**Done circle.** 24px, with a 2px ring in the kind colour. Its invisible hit area reaches 44px. Hover tints it 12%. **Changed from the prototype:** the ring is at full colour (the prototype used 60% opacity, about 2.5:1), so it stays visible as a control. Its label reads "Mark done: Call Pelita Foods about the trial".

### 4.7 Selecting several (D-008)
- **Select** in the toolbar turns the done circles into **checkboxes** (22px rounded squares, blue with a white tick when on). The head checkbox can be "mixed" (a minus).
- The **selection bar** floats at the bottom centre: a white glass pill with a blue ring. It shows "**3** selected" and "Select all 1,579", then Mark done (or Mark not done among finished tasks), Move to group and Delete (red), and a close ×. On phones it takes the tab bar's place, full width, with the actions as icon-and-label buttons under the count.
- Actions are disabled (40%) while nothing is selected.

### 4.8 Quick capture (W1)
A 52px field at the top of "Needs attention", with a dashed blue outline, a blue + bubble and the placeholder "Add a task, like “Call Pelita Foods about the trial”". On focus it turns solid white with a blue edge and shows "Enter to add" (hidden on phones). Enter adds the task and keeps the focus there for the next one. The toast "Task added" offers **Add details**.

### 4.9 Company list and editing in place (B10)
- **Rows** are cards like tasks. The first column (badge in the group's colour, name, contact under it) stays pinned on the left when the list scrolls sideways (22 columns in stress). Headers sort (see 5.6).
- **Cell**: every value is a button. On hover it gets a faint blue fill and outline, meaning "you can change this". Empty values show a faint "–".
- **Quick editor**: a menu anchored to the cell. **Choice**: the options as option chips, the chosen one ticked, and "Clear" at the foot. **Date**: a date field and quick picks (Today, Tomorrow, In a week; for last action, Today and Yesterday), then Clear and Save. **Text**: a field or a 130px text box, then Save. It saves on Enter or Save, and the toast offers Undo.
- **Row menu** (⋯, faint until hover, always visible on phones): Open company, Create a follow-up task, Last action: today, Move to another group, Qualification notes (or Start qualification notes), Delete company.
- **Urgency in cells**: last action and target date use the same tones as tasks. A missed planned outreach is amber.

### 4.10 Panels, tiles and figures
- **Panel**: glass, `--r-l`, 8px padding. Its head has a 17px title, a count in `--muted` and tools on the right. Its foot has a centred quiet button ("All 128 open tasks").
- **Hero**: white 70%, `--r-xl`, `--shadow-hero`. Today: the sentence, the count chips and the counts by kind on the left, and the two-week chart in an inner card on the right. Past clients: the display number, then the sum of figure cards.
- **Group tile** (Companies): a white glass card with the group's icon in a tinted square, the name, a 34px count and a short description ("Prospects we’re working"). A soft halo of the group's colour sits in the top right. When chosen, it's white with a 2px ring in the group's colour. Four across, two by two on phones.
- **Where-to-act card**: a round tinted icon, a 24px count, "of 42", the label, and a thin bar showing the share. When pressed, a 2px ring in its tone.
- **Figure card**: white, a 30px number, a label. The total card is the blue gradient with white text. Signs (+, =) sit between the cards in `--faint`. **Not counted** is a dashed card across the whole width.
- **Person figures**: four small white cards (owned, informed, overdue in red, due soon in amber).

### 4.11 Sheets and dialogs
- **Sheet** (`sheet`): a floating panel 16px in from the right, top and bottom on large screens, 540px wide (the company record is 620px, the install sheet 460px). On phones it's a **bottom sheet**: full width, 28px top corners, a grab handle, and it rises to just under the top of the screen. A **short sheet** fits its content (quick capture, More, Install). Anatomy: a head (19px title, a kind or group tag, a close button) · a scrolling body (24px padding, 20px on phones) · a foot (hairline above, destructive action left, Cancel and the main action right).
- **Dialog**: centred, 440px (560px wide variant), `--r-dialog`, 24px padding. It has a title, a body, an optional quoted name in a grey box (3 lines at most) and the actions right-aligned. On phones it sits 14px above the bottom edge.
- **Confirmation**: a dialog with `role="alertdialog"`. The title is a question ("Delete this task?"), the body says what happens ("It will be removed for everyone on the team."), then Cancel (focused first) and the red main button named for the action ("Delete task").
- A scrim sits behind both, and the page behind doesn't scroll. Esc, the close button or a tap on the scrim closes them, and focus returns to what opened them. A confirmation can sit on top of a sheet.

### 4.12 Charts and time

| Chart | Anatomy | States |
|---|---|---|
| **Two weeks** (Today) | 14 columns of stacked rounded bars (prospects, clients, internal, events at 60% height), today ringed in blue, weekends hatched. A callout: "Thu 23 is the busiest, with 4 deadlines" (amber) or "No crunch ahead" (calm). A legend underneath. Each day opens Plan on that day. | Events unavailable: the legend says "Calendar events unavailable" and no event bars are shown. |
| **Timeline** (Plan) | A header of weeks and days (today a blue circle). Rows are people (avatar, name, load) or kinds of work. Bars run from start to deadline in the kind's gradient with white text. A deadline only is a diamond. No deadline fades out to the right. Missed: a red inner edge or a red diamond. Informed: a dashed outline. Crunch days are amber columns, weekends faintly grey. Team calendar row: counts per day (ringed for all-day). | Row folded at 4 lines: "Show 3 more". Nothing in range: a small empty card inside the grid. Events off or failed: a notice in the calendar row. Phones: scrolls sideways from today, with avatars pinned. |
| **Month** | 7 columns of cells: day number (today a blue circle), events as grey lines with times, tasks as lines with a kind dot ("+3 more"). Busy days are amber, weekends paler, days outside the month at 50%. | Phones: dots only (up to 3 plus a count), and the chosen day is listed under the grid. |
| **Week strip** (Day) | 7 rounded day cards with the weekday, a big date and count badges (amber for tasks, grey for events). The chosen day is the blue gradient. | Today not chosen: blue ring. |
| **Owned and informed** (People) | A thin bar: owned is solid blue, informed is a blue outline. A two-week sparkline. "Next: Thu 23". | |
| **Likelihood meter** | Five rising bars, lit in blue up to the rating, with the word. | Not rated: all grey, with "Not rated" in `--faint`. |
| **Likelihood spread** | One bar split into five blues and grey stripes, with a legend of counts that each filter the list. | |
| **Sector bars** | One row per sector: name, count, share, and a thin blue bar. "No sector" is striped grey and on its own line, under a dashed rule. Then the total. | Top 8, then "Show all 45 sectors". |
| **Headings written** | Nine small ticks, green when written, with "6 of 9 headings written". | |

### 4.13 Form fields
- **Field**: a label above (13px 700 `--ink-2`) with "optional" in `--muted` beside it. The input is 46px, white, `--r-field`, with a 1.5px inset `--line-field` outline (3:1 grey, D-021), darker on hover. On focus, a 2px blue outline plus a 4px soft blue halo. Placeholders use `--muted` and give an example ("Their part, like “backup”").
- **Variants**: single line · text box (92px minimum, grows; the big version at 17px 700 is for the task description) · select (a custom arrow) · date (tabular figures, with a round × to clear) · number · **switch** (42 × 26, blue when on) · **segmented** (priority, about) · **chip group** (touch point) · **search** (a pill with an icon).
- **People picker** (W4): a field holding person chips, with a borderless input after them. Typing shows suggestions under it: "Names already in use", each with an avatar and its open-task count, then "Add “Nadia” as a new name". Arrow keys move the highlight, Enter picks, and Backspace in an empty field removes the last person.
- **Informed list**: one white row per person (avatar, name, a "Their part" note field, ×), then an "Add someone to keep informed" line. On phones the note goes under the name.
- **Sector picker** (R6): suggests sectors already in use, with how many companies use each. If what's typed matches one when case and spaces are ignored, a note says so before saving: "Same sector as “Retail”, so it’s saved that way." A new one says "“Agritech” will be a new sector."
- **Editing in place** (notes headings, flow titles, the notes title): no visible box until hover (a 3% tint) or focus (a white field with a blue outline). It reads as a document, not a form, so it keeps the light treatment rather than the 3:1 field outline (D-021).
- **Required missing**: a 2px red outline with a soft red halo, and under it a red line with an alert icon that says what to do ("Add a short description so the team knows what this is."). Focus moves to the field. The error clears as soon as it's fixed.
- **Kept in step note** (B12): a blue-soft box with the sync icon: "The deadline and last action stay in step with Halcyon Logistics. Changing them here updates the company too." The fields it covers carry a small sync icon in the company record.

### 4.14 Notices and messages

| Variant | Look | Use |
|---|---|---|
| **Banner** | Amber glass strip across the page, under the header, with the crossed-out wifi icon | "**No connection.** You are seeing what was loaded at 09:12. Changes can't be saved until you are back online." |
| **Notice, info** | White with a hairline ring, a grey info icon | "**The team calendar isn't connected.** Meetings and events will show here once it's set up. Tasks work as usual." |
| **Notice, warning** | Amber soft | "**Couldn't load today's events.** The team calendar didn't respond. Tasks work as usual." A target date missed in a company record. |
| **Notice, error** | Red soft | Inside a dialog after a failed save: "**Couldn't create the group.** Check your connection and try again. Nothing was lost." |
| **Notice, success** | Green soft | "**Installed on this device.**" |
| **Inline note** | Blue soft strip | Kept in step, "Their part", "Back to step 2 comes here", sector spelling. Grey version for an umbrella company ("Its subsidiaries still count"). |
| **Toast** | Dark navy pill at the bottom centre (above the tab bar on phones). A green tick icon, a message of one line, an optional action button (Undo, Open, Add details, Try again). Gone after 5.2s | Confirms every change. |
| **Error toast** | Dark red, pink alert icon | "No connection. The task wasn't added." "Couldn’t save the sector. Please try again." |

Only one banner shows at a time. Toasts stack upwards and never cover the selection bar.

### 4.15 Empty, loading and saving
- **Empty, large**: centred. A 64px rounded square with a white-to-blue gradient and a blue icon, then a 17px title, one or two sentences that say what will appear here and how, and up to two actions. Example: "**No flows yet** · Write down how a recurring process moves between people. · New flow".
- **Empty, small**: the same at 44px with a 15px title, inside panels ("No events today · Nothing is on the team calendar.").
- **Nothing matches**: an empty state that repeats what was searched ("Nothing open matches “budget”"), with "Clear search" or "Clear filters", and on Companies chips that point to matches in other groups.
- **Loading**: skeleton rows with the same shape as the real rows, shimmering, plus a small line, "Loading tasks", with a spinner. Each source loads on its own: tasks can show while events are still loading, and the reverse.
- **Saving** (notes, flows): a quiet line at the top right. "Saving…" in grey, then "Saved" with a green tick. Offline, it reads in amber: "Kept on this device. Saves when you're back online."
- **Busy** (past clients): a blue-soft box with a spinner, "Moving Nusa Retail…", and the button disabled.

### 4.16 Tree, flow path and decision
- **Tree** (past clients): the parent row is a card, and opening it shows subsidiaries under a 2px grey branch line with a short elbow to each row. Long lists show the first ones, then "Show its other 312 subsidiaries". It ends with an add line: "Add a subsidiary", where Enter adds it.
- **Flow path**: numbered circles (white, blue number, blue ring) joined by a soft blue-to-aqua line. Each step is a white card with its title, description and roles. A role is a label column (140px, grey) with person chips, and roles are separated by dashed hairlines.
- **Decision**: a diamond marker, and a card with a blue-to-white-to-aqua gradient, "DECISION" as a small blue label, and the question at 19px. **Outcomes** sit side by side (one column on phones and while editing). Each is a white card with a 3px top edge in green (good) or red (bad), a "Good outcome" or "Bad outcome" tag, a title, a description and roles. Then either "The flow ends here" or a blue chip, "Back to step 2: Set up the accounts", which jumps to that step and highlights it.
- **Editing** keeps the same layout: titles and descriptions become in-place fields, step tools appear (up, down, remove), roles become label fields with people pickers, and there are add lines ("Add a step", "Add a decision", "Add an outcome").

---

## 5. Patterns

### 5.1 Urgency rules (one rule set everywhere)

| Signal | Plain | Amber | Red |
|---|---|---|---|
| Task deadline | more than 3 days away ("In 12 days", or the date after 30 days) | today, tomorrow, within 3 days | missed ("2 days late") |
| Days since last action (company tasks, Active and Deal done companies) | under 7 | 7 to 13 | 14 or more: "No action for 15 days", "Gone cold" |
| Company target date | more than 3 days away | within 3 days | missed |
| Planned outreach (To approach) | ahead | missed | |
| Crunch (Plan) | | at least 2 deadlines on a day, well above the average | |

Urgency always has words, and colour is the second signal. Done tasks never show urgency.

### 5.2 Kinds of work (W12)
A task tied to no company is **Internal**. A task tied to a company is **Prospect work**, or **Client work** once that company is in Deal done. When a company moves to or from Deal done, its tasks change kind, and the move dialog says so. Kinds have fixed colours (2.1) and the fixed order Prospects, Clients, Internal.

### 5.3 How changes save

| Model | Where | Behaviour |
|---|---|---|
| **Form with Save** | Task details, new company, new notes, new flow, add a past client, task group | Written in one go. Save checks required fields. Cancel discards. |
| **Each change saves itself** | Company fields, quick editors, past clients' names and sectors, group importance, mark done | A toast confirms with Undo. No Save button anywhere in the company record. |
| **Saves as you write** | Qualification notes, flows in editing | Saves 0.8s after typing stops, and at once when you leave the field. A quiet "Saving…", then "Saved". Never asks. |

### 5.4 Undo or confirm
- **Confirm first** whenever something is deleted for everyone and can't be brought back simply: a task, a task group, several tasks, a company, a choice option, an own field, a flow, qualification notes, a past client or a subsidiary. The dialog names the thing and says what happens to whatever depends on it ("Its 6 tasks stay and become ungrouped. You'll find them under Internal.").
- **Undo instead** for anything easy to reverse: mark done, mark not done, move to a group, a field change, a status change, a move between company groups, not counted, removing a flow step or outcome (D-018).
- **Blocked**: a parent company with subsidiaries can't be deleted. The dialog explains why and offers "Show its subsidiaries" (R8).

### 5.5 Required fields
Only what the inventory requires: a task's description, a company's name, a task group's name (which must also be unique, ignoring case), a past client's name, a flow's name, and the name of notes not tracked yet. Nothing is marked "required". Optional fields say "optional" instead, because nearly everything is.

### 5.6 Find, narrow and order
- Search runs as you type and covers what the inventory lists for each area. Matches are highlighted in `--mark` where the text is shown.
- Filters are pills that show their value and clear with ×. A results line says "24 of 128".
- Sort by tapping a column head, or from the sort menu on phones. Direction labels are in words ("Earliest first", "Longest without action first", "A to Z"). **Empty values always go last**, whichever way round.
- Defaults: tasks by deadline, earliest first. Prospect work by latest deadline first, undated last (W14). Finished tasks most recent first. Companies by most recent action. To approach by soonest planned outreach. Qualification notes by last edited. Past clients by name, A to Z. Flows A to Z.
- "Details shown" (W15) and the company group's fields are remembered on the device between visits.

### 5.7 Long lists
- Today caps each section at 6, with "See all 14".
- Lists show 100 rows, then "Showing 100 of 2,400" with "Show 100 more".
- Timeline rows show 4 lines, then "Show 3 more".
- Sectors show the top 8, then "Show all".
- Subsidiaries under a search match show only the matches, then "Show its other n subsidiaries".
- Counts use thousands separators (1,579) and tabular figures.

### 5.8 Live, offline and loading
- **Live** (A1): see section 3. Your own typing is never replaced while you type: if a colleague changes the heading you're writing in, your text stays and the heading shows "Changed just now".
- **No connection** (A3): the app always opens. The banner says when the data shown was loaded, and the side bar dot turns amber. Changes are refused with an error toast that says what wasn't saved ("No connection. The task wasn't added."), and forms keep what was typed. The exception is **qualification notes**, which keep writing on the device and save when the connection is back (D-014). **Flows** are read only offline. Opened offline for the first time, each area shows a "No connection" empty state that says it will fill in once the connection is back. When it returns: "Back online. Everything is up to date."
- **Loading**: each source (tasks, companies, notes, past clients, flows, team calendar events) loads on its own, with its own skeleton.

### 5.9 Team calendar events (D7 to D10)
Events are read only, marked with the lock and "Read only". Each shows its start and end time, or "All day", and has an open button that goes to the team calendar in a new tab. Events never get a done circle. If the calendar isn't connected, an info notice says so. If it fails, an amber notice does. Tasks always carry on.

### 5.10 Moving between company groups (B5)
A dialog shows the four groups as options. Under **Carried over** it lists what's already known as grey chips. Then it asks only for what the new group's list shows (for example Answer, Reason and Revisit after for No or not now). It says when tasks switch between prospect and client work. The toast offers Undo. Setting an Active company's status to Deal done moves it the same way.

### 5.11 Names and spellings
Every name field (responsible, informed, flow roles and people) offers the names already in use first, and a new name second (W4). Role labels offer labels already in use. Sectors are matched ignoring case and spaces, and shown in the spelling most companies use (R6). Products are free text, separated by commas, and the Product filter merges different spellings the same way (D-012).

### 5.12 Export (E1)
The Export button opens a small dialog that says what will be in the file ("24 active prospects, as filtered, with these columns:", the columns as chips) and the file name. Then Download. If nothing is shown, the dialog says there's nothing to export. Companies and notes export what's shown (search and filters apply). Past clients always export the full record. 
### 5.13 Phones and large screens
- Sheets become bottom sheets. Menus stay anchored, but are kept inside the screen.
- Tables become cards. Columns become labelled details that wrap, and empty details are hidden.
- List-and-detail screens (notes, flows) show the list first, then one item full screen with a back link ("All notes", "All flows").
- Hover-only things (row menus at 55%, cell outlines) are always visible or not needed on touch.
- Every tap target is at least 40px. Small circles and checkboxes get an invisible 10px margin.

### 5.14 Stress
Every screen has to hold:
- Names thousands of characters long with no spaces, and names in Chinese, Japanese, Korean, Arabic, Thai and Cyrillic scripts.
- Thousands of rows: 2,400 tasks, 3,200 companies, 1,500 notes, 1,200 parents with 4,369 subsidiaries (340 under one), 60 flows (one with 40 steps).
- 30 people. A step with 12 roles and 30 names. A decision with 6 outcomes. 22 company fields shown. 23 statuses.
- Every optional field empty.

The rules that make that work:
- `minmax(0, …)` columns, so nothing pushes a layout wider.
- "…" with the full text on hover for single-line labels, and two lines at most for titles.
- `overflow-wrap: anywhere`.
- The pinned first column in wide tables.
- Folded lists (5.7).
- Sideways-scrolling filter rows on phones.
- Counts with separators.

Each screen's stress version is reached with `?stress` (see `map.html`).

---

## 6. Screens

For every screen: what it's for, how it's laid out on large screens and on phones, and every state. Each state is built in the prototype at both widths. Open it from `map.html`, or add `?state=…` or `?open=…` (and `&stress`) to the page. Light mode only.

### 6.1 Today (`index.html`): W1, W5, W12, W13, D2, D3, D4, D7, D9, D10, D11, A1, A4
The #1 daily job (D-007): see what needs attention today and act on it.
- **Large screens:** the header ("Today", the long date, search for tasks, companies and notes, New task). Then the **hero**: a sentence that sums up the day ("Two tasks are overdue and one company has gone quiet"), a line that says where to start, count chips, open counts by kind, and the **two-week chart**. Then a board: **Needs attention** (kind switch with counts, quick capture, then sections Overdue · Due in the next 3 days · Under way today · Needs a date, 6 each at most) beside a column with **Calendar today** (read only) and **Who's carrying what** (top 6 people with their load, each opening their Plan page).
- **Phones:** the hero stacks (the sentence, chips, counts, then the chart), then Needs attention with the switch at full width, then the calendar, then people. A round search button sits in the header.
- **States:** normal · one kind (Prospects, Clients, Internal) · no work of one kind ("No client work needs attention", with "See all client tasks") · nothing due in the next three days (hero: "Nothing is due in the next three days", plus a green notice in the list) · nothing yet (hero: "Nothing on the list yet" with the capture field in the hero, list: "A clear day", people: "Nobody is assigned yet") · loading (everything, or only events) · calendar not connected · events failed · no connection, with data or with nothing loaded · live change · a task just marked done (struck through, then it leaves) · stress.

### 6.2 All tasks and task groups (`tasks.html`): W5, W6, W8 to W15, D2, D3, D11, A1, D-008
- **Large screens:** the header ("Tasks", "128 open tasks", search, New task). A toolbar with the kind switch and Open or Done. Filters: Due (overdue, next 3 days, under way today, no dates yet), Task type, "No action for" (any, 3, 7, 14, 30 days or more, or a number of your own), Finished (last 7 days, last 30 days, any time) in Done. Then Sort ("Sort **Deadline, earliest first**"), Details shown and **Select** ("Selecting" while on). Then the results line, the column heads and the rows. The default details are Company or group, Task type, Deadline, Last action and Responsible. Touch point, Priority, Start, Informed and Key points can be added. Done tasks show "Finished" in place of the deadline.
- **A task group:** the header becomes the group's badge (44px), its name, its open count, a star (important), "Search this group", a ⋯ menu (Rename, Delete) and New task. There's no kind switch. New tasks start in that group.
- **Phones:** group chips under the title, search at full width, the switches at full width, filters in one sideways row, rows as cards.
- **States:** open · by kind · no action for 14+ days, or none matching · overdue, next 3 days, no dates · finished (last 7 days, any time) · no results from search ("No tasks match", with Clear search) or from filters · no tasks of one kind · nothing yet · no finished tasks yet · details-shown menu · sort menu · no-action menu · loading · offline (with data, nothing loaded) · live change · one group, a long group name, an empty group · new group (and name missing, name taken, couldn't create) · rename · delete group · no groups yet · selecting: none chosen, some, all matching (1,579), move to a group (company tasks stay, and the menu says so; a new group can be made from it), delete selected, mark not done among finished tasks, offline · stress (2,400 tasks).

### 6.3 Task details (a sheet over any screen): W1 to W4, W7, B12, B13, D11
- **Quick** (new): a short sheet with the description (big text box, "What needs doing?"), **About** (A company / Internal work), and the company or task group. "Add details" opens the rest. Enter saves.
- **Full**: Task type and Priority · Touch point chips · Start, Deadline and Last action · the kept-in-step note for company tasks · Responsible (one or more) · Informed (with their part) · Key points. The head shows the kind tag. For an existing task, the company row has "Open company" (B13), and the foot has Delete (left), Mark done or Mark not done, and Save changes.
- **Phones:** a bottom sheet, with rows of three dates becoming two plus one.
- **States:** quick · full · description missing · company task · internal task · finished task ("Finished task", Mark not done) · name suggestions · adding a new name · delete confirmation · offline (Save is refused with an error toast, and the sheet stays open with the text kept) · stress (long names, many people).

### 6.4 Plan (`plan.html`): D1 to D11
- **Large screens:** the header ("Plan", the range or date shown, New task). The view switch (Timeline, Month, Day, People) on the left, and what to show (Tasks and events, Tasks, Events) on the right. Filters: Work (all, a kind or a task group), Person, Rows (by person or by kind of work, timeline only), and the date stepper (‹ range ›, Today).
- **Timeline** (opens first): summary chips (busiest day, longest quiet stretch, overdue before the range, no dates, which links to All tasks), a legend, then four weeks stepping two at a time (see 4.12).
- **Month:** the month grid, with "Back to this month".
- **Day:** the date and a summary ("4 tasks, 3 events"), a date picker and the week strip. The first look lands on today if anything is happening, or else on the next day with something, with a note and "Show today" (D5). Then Deadline today · Starting · Under way (day rows), beside Events (times, all day, links).
- **People:** a search field, everyone ranked by how much they own (owned and informed bar, two-week sparkline, next deadline). **One person:** their header with figures, then "Responsible for" and "Kept informed on" side by side, with their part on each task.
- **Phones:** the stepper takes a full row above the filters. The timeline scrolls sideways from today with avatars pinned. Month shows dots, with the chosen day listed below. Day and People stack.
- **States:** for every view, normal and stress (30 people with rows folded, 60 tasks and 25 events in a day) · one slice (clients, internal, a group) · one person · tasks only or events only · nothing in range · nothing yet · nothing today (lands on the next day) · nothing on a chosen day · a person with no tasks · loading (everything, events only) · calendar not connected · failed (also in events only) · offline (with data, nothing loaded) · live change · menus (Work, Person, Rows).

### 6.5 Companies (`companies.html`): B1 to B14, C1 to C3, E1, U5
- **Large screens:** the header ("Companies", search, New company). The **four group tiles**. On Active only, **Where to act**: four cards (Gone cold, Waiting on our follow-up, High priority, Target date close or missed), each with a count "of 42" and a filter. The toolbar has filters (Status, Priority, Product, where the group has them), Sort, Fields and Export. Then the list (4.9).
- **Company record** (a 620px sheet): the badge, the name, the group tag, the contact. Actions: Follow-up task, Last action: today, Qualification notes (or Start qualification notes), Move, and ⋯ (Rename, Move to another group, Delete company). Then a notice for urgency ("Target date missed 3 days ago"), the group's fields as label and value pairs that each open an editor in place, and its **tasks** (open, with the kept-in-step note, then "3 finished"). There's no Save button. The foot says "Changes save as you make them, for everyone." (offline: "Offline. Changes can’t be saved.").
- **Fields sheet** (per group): a switch per field (whether the list shows it) and rename. Own fields are tagged "Own" and can be removed. "Add a field" chooses short text, long text, number, date or choice (with options). **Options dialog**: each option with its colour, name, how many companies use it, and remove. Deal done and Follow-up due are locked, with a lock and the reason, and can only be recoloured.
- **Phones:** tiles two by two, where-to-act cards two by two, rows as cards with labelled details, and the record as a bottom sheet with labels above values.
- **States:** each group (To approach, Active, Deal done, No or not now) · where-to-act filters · search, only in another group, no results, priority filter · sort menu, by target date, by name · nothing yet ("No companies yet") · one group empty · loading · offline (with data, nothing loaded, and the record read only) · live change · quick edits (status, target date, next actions) · row menu · records (active, gone cold with target missed, to approach, no or not now) · follow-up task created, or failed with Try again · delete confirmation · new company, and name missing · move (to approach to active, active to no or not now, status set to Deal done) · fields (Active, No or not now) · add a field · remove an own field · status options (23 in stress) · remove an option · export (all, filtered, nothing to export) · stress (3,200 companies, 22 fields, scrolling sideways with the name pinned).

### 6.6 Qualification notes (`notes.html`): U1 to U8, E1, A1
- **Large screens:** the header ("Qualification notes", "10 prospects", search, New notes). On the left (330 to 400px): **How likely** (the spread bar and legend filters), the filters (All prospects, Tracked companies, Not tracked yet), order and Export, then the list. Each item shows the name, the group tag or "Not tracked yet", when it was last edited, the likelihood meter and, while searching, the matching snippet under its heading. On the right: the **document**. A top line with the save state and ⋯ (Delete, Export these notes) · the name (an editable title for notes not tracked yet) with the group and "Open company", or "Link to a tracked company" · the **Likelihood** picker (five pills with meters, and Clear) · "6 of 9 headings written" · the nine headings in order, each an in-place text area with a prompt while empty · **Remarks**, folded to three lines once long ("Show all remarks · 240 words") · the last edit line.
- **Phones:** the list first, then one prospect full screen with "All notes" to go back. The header and search hide while a document is open.
- **States:** normal · every heading empty · remarks folded, unfolded, very long · saving · offline, still writing ("Kept on this device…") · from a company (has notes, starts notes) · not tracked yet · link to a tracked company · only not tracked · new notes (for a tracked company with the company picker, where companies that already have notes are marked; not tracked yet; name missing) · search ("7 of 10 prospects mention “budget”") · stress search · no results · one likelihood, by likelihood, not rated · delete · export, export of a search · nothing yet · loading · offline with nothing loaded · live change ("Changed just now") · no prospect chosen yet ("Choose a prospect") · stress (1,500).

### 6.7 Past clients (`past.html`): R1 to R9, E1, A1
- **Large screens:** the header ("Past clients", search, Export, Add a past client). The **totals**: "Clients we’ve served", the display number, a sentence, and "Copy these figures". Then the sum: Parent companies counted + Subsidiaries = Clients in total, and the dashed **Not counted** tile under it. Below, a two-column layout. On the left, **the record**: column heads (Name, Sector, Subsidiaries) with order, "Show all subsidiaries", then the parent rows with their trees. On the right, the sticky **By sector** panel.
- **Phones:** the totals stack, the figures stay three across, and a switch (Companies / By sector) shows one side.
- **States:** normal · one parent open · 340 subsidiaries under one parent · only not counted · nothing counted yet ("No counted companies yet") · search ("nusa", "retail", no results) · one sector, no sector · order by most subsidiaries, order menu · add, add a subsidiary of…, name missing, quick add in a parent · sector typed another way · sector editor · rename · move · no other parent to move to · parent menu · delete blocked · delete a subsidiary · delete a company (saying how the total changes) · adding or moving in progress · saving fails then Try again · rename fails (error toast with Try again) · export · nothing yet · loading · offline (with data, nothing loaded) · live change ("Just added", totals update) · only one parent company · stress (1,200 parents, 45 sectors).

### 6.8 Flows (`flows.html`): M1 to M4, A1
- **Large screens:** the header ("Flows", New flow). On the left, the flows A to Z with a search that covers steps, outcomes, roles and people. Each item has a badge with its step count, the name and "5 steps · decision". On the right, the flow: the icon, name and description, the meta line (steps and decision, how many people, when it was last edited), Edit flow and ⋯ (Edit flow, Delete). Then the path and the decision (4.16).
- **Editing:** the same layout, with "Saving…" then "Saved" in the top line, and **Done** to go back to reading. Offline, Edit flow is replaced by "Editing needs a connection" in amber.
- **Phones:** the list first, then one flow full screen with "All flows". Outcomes in one column.
- **States:** a flow with a loop back · three outcomes · no decision · no steps yet ("No steps yet", with Add the first step) · editing · saving · name suggestions · adding a decision · new flow, name missing · menu · delete · nothing yet ("No flows yet") · loading · offline (read only: "Editing needs a connection") · offline with nothing loaded · live change ("Changed just now") · no flow chosen ("Choose a flow") · stress (40 steps, 12 roles, 30 names, 6 outcomes, 60 flows).

### 6.9 Installing and opening with no connection (`install.html`): A2, A3
- **Install sheet:** the app icon, the name and "For phones and computers. Everything stays in step on each." Three things it gives (opens like an app, opens with no connection, always the latest version). Then **Install**, where the browser offers it, or the three Safari steps on iPhone and iPad. Installed: a green notice.
- **App icon:** the company logo on a light tile (white to pale blue and aqua), kept inside the circle that some devices crop to. **Launch screen:** the backdrop, the icon and the name, then Today. Bar colour: #eef3fb. The app opens on Today, full screen, in any orientation.
- **States:** a browser that offers installing · iPhone · already installed · installed app (no install entry anywhere) · opened offline with data (Today, All tasks, Plan, Companies, Past clients) · notes keep writing · flows read only · opened offline for the first time (Today, Companies, Flows) · back online.

---

## 7. Copy and tone

### Voice
Plain, calm and specific, like a capable colleague. Short sentences. Say what happened and what to do next. No exclamation marks, no jokes, no blame. English only (brief).

### Rules
1. **Sentence case**, everywhere.
2. **No "you" for ownership.** Nobody signs in, so there's no "your tasks". The Today list is "Needs attention", not "Your tasks" (D-006). "You" is fine for the person using the screen ("Changes can't be saved until you are back online").
3. **Name the thing.** "Delete “Hiring”?", "Halcyon Logistics deleted", "Follow-up task created for Pelita Foods".
4. **Say what happens to what depends on it.** "Its 6 tasks stay and become ungrouped." "Renamed to “Warm” everywhere: 12 companies." "Cleared from 4 companies."
5. **Numbers.** Figures in lists, counts and pills (1,579, 3 days). In sentences, zero to ten are words at the start ("Two tasks are overdue"). Plurals are always right ("1 task", "2 tasks").
6. **Time is relative where it helps.** "Today", "Tomorrow", "In 3 days", "2 days late", "Yesterday", "9 days ago", with the full date on hover. Otherwise "23 Oct" (with the year when it isn't this year), and for the day heading "Thursday, 23 October". Times use 24 hours ("09:30 to 10:00"). Weeks start on Monday.
7. **Buttons are verbs**, named for what they do: "Add task", "Save changes", "Delete task", "Create group", "Mark done", "Move", "Download". Cancel is always "Cancel".
8. **Failures:** "Couldn't [do the thing]." plus what to do: "Check your connection and try again. Nothing was lost." Offline: "No connection. [The thing] wasn't [done]."
9. **Empty states** say what will appear and how to get it there, never just "No data".
10. **Placeholders** give an example, not an instruction: "Add a task, like “Call Pelita Foods about the trial”".
11. Curly quotes and apostrophes (“ ” ’) in the interface. "…" (one character) for unfinished actions ("Saving…") and cut-off text.

### Words used in the interface
| Concept | Interface word | Not |
|---|---|---|
| A thing to do | Task | To-do, item, ticket |
| Named set of internal tasks | Task group | Project, list, folder |
| The three kinds of work | Prospects / Clients / Internal (Prospect work, Client work) | Sales, customers |
| Responsible person | Responsible | Owner, assignee |
| Informed person and their note | Informed, their part / Kept informed on | CC, watcher |
| End date | Deadline | Due date, end |
| Last action date | Last action | Last touched |
| Key points | Key points | Notes (taken by qualification notes) |
| How you're in touch | Touch point | Channel |
| The company groups | To approach / Active / Deal done / No or not now | Leads, pipeline, won, lost |
| No contact for 14+ days | Gone cold | Stale, inactive |
| Status "Follow-up due" | Waiting on our follow-up | |
| Structured prospect notes | Qualification notes | Assessment |
| How likely an opportunity is | Likelihood: Very high, High, Medium, Moderately low, Low, Not rated | Score, probability |
| Free-form remarks | Remarks | Comments |
| Notes for a prospect not tracked | Not tracked yet | Unlinked, orphan |
| Company we've served | Past client | Alumni |
| Top-level company | Parent company | Group, holding |
| Company under a parent | Subsidiary | Child, branch |
| Parent kept out of totals | Not counted (an umbrella company) | Excluded, hidden |
| Process documentation | Flow, step, role, decision, outcome (good or bad) | Workflow, SOP |
| Outside scheduling account | Team calendar, event | Google Calendar (unless the rebuild names it) |
| Own fields | Own field | Custom field |
| Spreadsheet file | Export, ".csv" | Download data |

---

## 8. Accessibility

Target: **WCAG 2.2 AA**.

**Contrast.** Body text is at least 4.5:1 and large text and controls at least 3:1. The guide's text tokens meet this (2.1). These were raised from the prototype (D-020, approved in D-021):

| Pair | Prototype | Guide |
|---|---|---|
| Muted text on white / on the page | #6f7a90: 4.3 / 3.9 | #616a7d: 5.4 / 4.9 |
| Blue words on blue soft | 4.1 | `--blue-ink` 4.7 |
| Red words on red soft | 4.0 | `--red-ink` 4.7 |
| Amber words on amber soft | 4.1 | `--amber-ink` 4.7 |
| Green words on green soft | 3.1 | `--green-ink` 4.7 |
| Teal words on teal soft | 4.4 | `--g-lead-ink` 4.7 |
| White on the main button's light end | 3.4 | 4.5 (gradient ends on #3f75cf) |
| Green option chip | 4.5 (4.48) | 4.7 |
| Done circle ring (Internal, 60%) | 2.5 | full colour: 5.6 |
| Form field outline | ink at 12%: about 1.3 | #8e95a4: 3.0 |

Field outlines (D-021): form fields in sheets, dialogs and menus have a 3:1 grey outline (`--line-field`, #8e95a4). Fields edited in place in documents (notes, flows) have no outline at rest, as a deliberate exception: their heading labels them, and on hover and focus they show a tint and a strong blue outline. Group badges, avatar initials and chart fills are decorative, because the name or the number is always shown next to them.

**Colour is never the only signal.** Urgency has words, kinds have names in legends and tags, informed people are outlined as well as paler, good and bad outcomes say "Good" or "Bad", "Not counted" has a tag, and likelihood has its word.

**Keyboard**
- Everything can be reached with Tab, in reading order. The focus ring is a 2.5px blue outline with a 2px offset. Fields show the blue outline and halo.
- Enter adds from quick capture and the subsidiary line, and submits single-field dialogs. Esc closes the top menu, sheet or dialog, or stops selecting, and focus goes back to what opened it.
- In suggestion lists, the arrow keys move and Enter picks. In the people picker, Backspace in an empty field removes the last person.
- Sheets and dialogs keep focus inside them. Confirmations focus Cancel first. New-task sheets focus the description. Menus focus the chosen item.

**Screen readers**
- Landmarks: the side bar and tab bar are "Main navigation", there's one `main`, and every panel is a section labelled by its title.
- Current place uses `aria-current="page"`. Switches and toggles use `aria-pressed`, checkboxes `role="checkbox"` with `aria-checked` (including "mixed"), menus `role="menu"` with `menuitemradio` or `menuitemcheckbox`, sheets `role="dialog"` with `aria-modal`, and confirmations `role="alertdialog"`.
- Sortable column heads carry `aria-sort`. Fields in error use `aria-invalid` and `aria-describedby`, pointing at the error.
- Toasts and the live status are `role="status"` (polite). The save state and banners are announced the same way.
- Icon-only buttons have labels that name their target: "Mark done: Call Pelita Foods…", "Open “Board update” in the team calendar", "Clear the due filter". Avatar stacks read the full list of people. Charts have a text label per bar ("Thu 23: 4 deadlines, 2 events"), and meters read "Load 3 of 5".
- Decorative icons and badges are hidden from screen readers. An empty value's "–" reads "none".

**Touch and zoom.** Targets are at least 40px (44px for the main buttons and tab bar). Layouts reflow down to 320px wide and at 200% zoom without sideways scrolling, except the timeline and wide company tables, which scroll inside their own panel by design.

**Motion.** Reduce motion turns off all animation (2.7). Nothing flashes.

**Language.** The page language is English (`lang="en"`). Names in other scripts are shown as typed.

---

## 9. Not designed, and open items

**Not designed, by decision**
- Dark mode (brief).
- Signing in, restricted access and shared-link visitors: nobody signs in and everyone can do everything (D-005).
- Two people typing in the same notes heading at the same moment (D-014).

**Open, for the owner**
- **The app's name.** "Team desk" is a placeholder everywhere.
- **The company logo** goes into the striped placeholder at the rebuild. If its colours clash with the calm blue, the owner decides then (brief).
- The selecting-several job story (D-008) and the owner's earlier choices (D-012, D-016, D-018) are recorded in `decisions.md`. Any change after the freeze goes through `needs.md`.
