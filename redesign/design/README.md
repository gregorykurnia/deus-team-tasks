# Design progress

| Stage | Status |
|---|---|
| 1. Three directions | Round 1 (A, B, C) rejected as too plain, see D-002; kept in `round-1/`. Round 2 built: `d-glass`, `e-tide`, `f-bento`. Owner chose a mix of D and F in calm blue (D-003): `g-glass-blue`. **Approved (D-004). Done.** |
| 2. Full prototype | In progress in `prototype/` (open `prototype/index.html`; `prototype/map.html` lists every screen and state). Groups 1 and 2 done: shell, Today, All tasks, task groups, task details, selecting several tasks (D-005 to D-008); Plan (D-009, approved D-010). Group 3 built: companies, fields and options, and export (D-011); waiting for the owner's review and three questions in D-011. Next: group 4, qualification notes. |
| 3. Design guide | Not started |
| 4. Coverage | Not started |
| 5. Freeze | Not started |

Notes
- Brief: light mode only, so no dark mode at any stage.
- No app name has been decided yet; each direction uses a placeholder name and a striped placeholder logo.
- Stage 2 groups, one per session: 1 Tasks and Today (W1–W15, D2, D3, D11, A1, A4) **done**; 2 Plan (D1, D4–D10) **done**; 3 Companies, fields and options (B1–B14, C1–C3, E1) **built, owner to review**; 4 Qualification notes (U1–U8, E1); 5 Past clients (R1–R9, E1); 6 Flows, installing and opening offline (M1–M4, A2, A3).
- Prototype build: plain HTML pages sharing `prototype/assets/` (styles, mock data, scripts). `?stress` switches to the stress data set, `?state=` and `?open=` open each state; a dashed "Prototype" control on every page does the same and is not part of the design. Areas not built yet open a placeholder.
- `shots/` holds helper pages so `./shoot redesign/design/shots/*/` can photograph prototype screens for the owner (not part of the design).
