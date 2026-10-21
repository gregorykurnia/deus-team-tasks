# Launch data step (task 4.8)

Two changes to live data, made once, right before `redesign` merges into `main`:

1. **Company options and fields.** The old app keeps them in one browser. The owner's main computer's settings
   (Q4) become the team's shared record, `settings/companies`. Colours someone picked map to the nearest of the nine
   option colours; options still on the old app's colour, and columns never renamed, take the new design's. Hidden
   columns stay hidden, own columns become own fields, and the locked options are always there ("To Follow Up" is
   Follow-up due, Q3). Column widths aren't kept (resizing is gone).
2. **Sectors.** Every subsidiary with no sector of its own gets its parent's (D-016).

Nothing is written without `--write`. Every write saves a backup of `settings` and `historicalClients` (and the
companies, read only) in `launch-data/` first, which stays on this machine and out of git. A live write asks you to
type `live`. Every read comes from the server, so with no connection the step stops instead of backing up an empty copy.

## Steps for the owner

**1. Export the settings** (on the main computer, in the browser you use the old app in). Open the live app, open the
console (Chrome: ⌥⌘J on a Mac), paste all of `scripts/launch/export-settings.js` and press Enter. It saves
`company-settings.json` to Downloads; it only reads. If the console says the export is empty, you're in the wrong
browser or on the wrong address (the import refuses an empty export unless you add `--allow-empty`). Copy it to the server:

```sh
scp -i ~/.ssh/oracle_vm2.key ~/Downloads/company-settings.json ubuntu@100.118.18.29:deus-team-tasks/launch-data/
```

(Make the folder first if it isn't there: `ssh -i ~/.ssh/oracle_vm2.key ubuntu@100.118.18.29 mkdir -p deus-team-tasks/launch-data`.)

**2. Back up the live data and see the plan** (on the server, in `deus-team-tasks`; both only read):

```sh
npm run launch-data -- backup --live
npm run launch-data -- import --live --settings launch-data/company-settings.json
```

The second prints what the import keeps, anything to look at first, what the stored record has that the import
replaces (options or fields added on the preview), company values no option has, and how many subsidiaries get a
sector.

**3. Dry run on a copy** (the emulator, never live): loads the backup from step 2, imports, checks, restores, checks.

```sh
npm run launch-data:dry -- launch-data/company-settings.json launch-data/live-<the backup from step 2>
```

**4. Live run**, right before the merge (asks you to type `live`, backs up again first, then checks what it wrote):

```sh
npm run launch-data -- import --live --settings launch-data/company-settings.json --write
```

**Undo**, if needed. It undoes only what that import changed: the settings record while it still holds what the import
wrote, and the sectors the import filled that nobody has changed since; it says what it leaves alone, and backs up first.

```sh
npm run launch-data -- restore --live launch-data/live-<the backup the live run printed> --write
```

## For the build

- `launchData.ts`: the pure part (old shapes copied in, so deleting `lib/clientLocalConfig.ts` in task 4.7 doesn't break it).
- `launchWrites.ts`: backup, import writes, restore, the emulator copy; uses the app's own Firestore handles.
- `data.ts`: the command. `dry-run.sh` with no arguments runs on `sample-settings.json` and `sample-copy/`, both made up.
- Tests: `tests/unit/launchData.test.ts`.
