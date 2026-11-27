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
