# Prospects from chat

## C1a — Pure checks and preview

- Unit tests compare the three prospect groups' preview data with the company sheet's serializer. They cover PIC spelling, choices, duplicates, clears, and the 50-add and 200-PIC limits.
- The apply checks report a previously added company as `alreadyExists` and refuse a mixed batch when any `seenPics` entry is missing or stale.
- `npx tsc --noEmit`, ESLint on the changed files, and `git diff --check` passed.
- The full unit run passed 1,877 of 1,878 tests. The existing notification-key test hit `spawnSync ... EPERM` in the sandbox. All 52 notification-key and company tests passed in the focused rerun with subprocess access.

## C1b — Server save

- The emulator tests checked saved docs against the preview, a legacy company ID, the shared app counter, and the Jakarta day at 18:00 UTC. The app's pipeline reader, PIC filter, and CSV export read the saved values.
- Three PIC edits commit together, including a clear on a client. A missing company or stale PIC prevents the entire PIC transaction from writing. A stale preview caught before the adds stops the whole save.
- Tests cover add and PIC failures partway through a batch, lost replies, overlapping app and chat creates, and a concurrent edit during a PIC transaction. Ordinary add retries return `alreadyExists`. Each apply with `allowDuplicate: true` authorizes another copy.
- TypeScript, ESLint, and all 1,878 unit tests passed. The full emulator suite passed 432 tests, and the focused emulator rerun passed 50 tests after the final retry changes.

## C2 — The three connector tools

- The HTTP route hides and refuses company tools with the edit flag off. With it on, the tools publish their read and write annotations, app group names, and exact-preview confirmation rule. The route rejects unknown keys, missing preview PICs, duplicate IDs, and more than 200 PIC changes before running the handler.
- The protocol smoke read 250 seeded companies in pages of 100, 100 and 50. It checked totals, group names, combined filters, PIC name matching, companies without a PIC, and a legacy ID inherited from its document. The full protocol suite passed 205 database-preservation comparisons.
- Route tests verify the preview and apply payloads, preserve partial and unconfirmed results, and surface a stale PIC without exposing private backend errors. Emulator data tests cover partial writes, lost replies and concurrent changes during the PIC transaction.
- TypeScript, ESLint on changed code, all 1,894 unit tests, and all 434 emulator data tests passed.

## E1 — End to end on the emulators

- The real MCP HTTP endpoint listed all four groups, previewed without writing, added three prospects and assigned one PIC across four existing companies in three groups, including a client. The Prospects PIC filters and MCP list agreed on the exact matching companies.
- All three raw Firestore documents matched the fields saved by the New company sheet, allowing for each record's ID and name. Resending the adds returned three `alreadyExists` results and left the pipeline intact. An app PIC edit invalidated a two-company preview, and reloading confirmed both current values.
- Playwright captured all three prospect groups at 1440, 1280, 390 and 320 px under `test-results/chat-companies-*`. The layout check caught page overflow from a sorted table header, and the visual check caught a clipped search hint. The table scrolls in its panel, the shorter hint fits, and the scrolled phone captures show the cards above the fixed tab bar.
- Eight smoke tests passed across `chat-companies.spec.ts` and `companies.spec.ts`. Both connector tests passed again after the final search hint and capture changes. All 1,894 unit tests, TypeScript, ESLint, and the local build passed.

## R1 — Phase review

- Saved data: ids come from the shared counter and each create refuses a taken id. Group flags match the New company sheet. PICs are stored in the team spelling. The duplicate check uses normalized names, and `seenPics` is checked before any add and again inside the PIC transaction. The only write outside `pipeline` is the id counter `settings/companyIds`, which is the app's own rule.
- Fixed: `list_companies` name search now finds "P.T. Lake-View, Tbk" from "Lakeview", as the duplicate check does. An allowed duplicate's preview now names the company it copies. A new Active company with no "Meeting Soon" option now gets a clear "needs a status" error. `find_company` calls its `pic` the contact person and points to the new tools when the edit flag is on.
- Dropped (accepted in the brief): a repeat apply with `allowDuplicate` adds another copy (the tool description says so), and choice values are matched case-sensitively (the error lists the options). The search hint that E1 shortened is design gap N43.
- Unit 1,894 passed, company data tests 14 passed, `mcp:smoke --only=protocol` passed. TypeScript and ESLint are clean.
