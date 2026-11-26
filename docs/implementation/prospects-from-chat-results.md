# Prospects from chat

## C1a — Pure checks and preview

- Unit tests compare the three prospect groups' preview data with the company sheet's serializer. They cover PIC spelling, choices, duplicates, clears, and the 50-add and 200-PIC limits.
- The apply checks report a previously added company as `alreadyExists` and refuse a mixed batch when any `seenPics` entry is missing or stale.
- `npx tsc --noEmit`, ESLint on the changed files, and `git diff --check` passed.
- The full unit run passed 1,877 of 1,878 tests. The existing notification-key test hit `spawnSync ... EPERM` in the sandbox. All 52 notification-key and company tests passed in the focused rerun with subprocess access.
