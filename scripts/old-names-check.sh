#!/usr/bin/env bash
# Old-names check (task 4.7): the old UI's component and helper names, and its /old route, must not come back in the
# new code. Prints nothing when clean; otherwise prints each hit and exits 1.
#
#   scripts/old-names-check.sh
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

DIRS=(app desk ui features styles)
OLD_NAMES='App|Sidebar|TasksTab|Chip|TaskModal|PeopleInput|GanttTab|DailyTab|AssigneeTab|CalendarTab|ClientsTab|ClientTable|ClientEntryModal|ClientBadge|FloatingPanel|ClientDatePopup|ClientDropdownPopup|ClientMovePopup|ClientTextPopup|ClientColumnManager|ProspectJournalTab|ClientsHistoricalTab|HistoricalClientDialogs|FlowTab|ServiceWorkerRegister|GCalEvent|clientLocalConfig|clientColumnResize|clientHelpers|colors'
OLD_ROUTE='/old([^A-Za-z0-9_-]|$)'

hits=$({ grep -rnwE "$OLD_NAMES" "${DIRS[@]}" || true; grep -rnE "$OLD_ROUTE" "${DIRS[@]}" || true; })
if [ -n "$hits" ]; then
  echo "$hits"
  exit 1
fi
