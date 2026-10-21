#!/usr/bin/env bash
# Emulator dry run of the launch data step (task 4.8): starts the Firestore emulator, loads a copy of the data into
# it, runs the import with --write, checks it, then restores the backup the import made and checks that too. The
# emulator stops at the end, and nothing reaches the live projects.
#
#   scripts/launch/dry-run.sh [SETTINGS_FILE] [COPY_DIR]
#
# SETTINGS_FILE: the export from export-settings.js (default: the made-up sample-settings.json).
# COPY_DIR: a backup to dry-run on, such as one from `npm run launch-data -- backup --live` (default: sample-copy/).
set -euo pipefail
cd "$(dirname "$0")/../.."
SETTINGS="${1:-scripts/launch/sample-settings.json}"
COPY="${2:-scripts/launch/sample-copy}"
RUN="npx jiti scripts/launch/data.ts"
npx firebase emulators:exec --only firestore --project demo-deus --log-verbosity QUIET \
  "$RUN seed --emulator '$COPY' && $RUN import --emulator --settings '$SETTINGS' --write && $RUN restore --emulator --latest --write"
