// Task details' part for the team calendar (C04): the checks a marked task's dates and times need, in the sheet's
// words, and the line saying where the saved task stands on the calendar.
import type { CalendarStatus, CalendarTimeErrors } from "@/lib/taskCalendar";
import { validateCalendarTimes } from "@/lib/taskCalendar";
import type { Task } from "@/lib/types";
import Button from "@/ui/Button";
import Icon from "@/ui/Icon";
import Spinner from "@/ui/Spinner";
import type { TaskDraft } from "./draft";
import styles from "./TaskSheet.module.css";

// The calendar's date checks (lib/taskCalendar) in the sheet's own words: its end date is the Deadline here.
const CALENDAR_DATE_WORDS: CalendarTimeErrors = {
  startDate: "Add a start date to put this on the team calendar.",
  endDate: "Add a deadline to put this on the team calendar.",
};
const CALENDAR_ORDER = "The deadline must be on or after the start date.";
export const CALENDAR_FIELDS = ["startDate", "endDate", "startTime", "endTime"] as const;

// The calendar's checks, with its date messages in the sheet's words (the times keep lib/taskCalendar's own).
export function calendarErrors(draft: TaskDraft): CalendarTimeErrors {
  const errors = validateCalendarTimes(draft);
  if (errors.startDate) errors.startDate = CALENDAR_DATE_WORDS.startDate;
  if (errors.endDate) errors.endDate = draft.endDate && draft.startDate ? CALENDAR_ORDER : CALENDAR_DATE_WORDS.endDate;
  return errors;
}

// A company task's key depends on its company, so its status waits until the companies have loaded.
export const calendarWritesShown = (task: Task, companiesLoading: boolean) => task.linkedClientId == null || !companiesLoading;

// Where the saved task stands on the team calendar (C04): on it, being added, or not up to date with Try again.
export function CalendarStatusLine({ status, link, onRetry }: { status: CalendarStatus; link?: string; onRetry: () => void }) {
  if (status === "adding")
    return (
      <p className={styles.calendarStatus} role="status">
        <Spinner />
        <span>Adding to the team calendar…</span>
      </p>
    );
  if (status === "stale")
    return (
      <p className={`${styles.calendarStatus} ${styles.calendarStale}`} role="status">
        <Icon name="alert" size={16} />
        <span>The team calendar isn&rsquo;t up to date.</span>
        <Button small onClick={onRetry}>
          <Icon name="sync" size={15} />
          Try again
        </Button>
      </p>
    );
  return (
    <p className={`${styles.calendarStatus} ${styles.calendarOn}`} role="status">
      <Icon name="cal" size={16} />
      <span>On the team calendar</span>
      {link && (
        <a className={styles.calendarOpen} href={link} target="_blank" rel="noopener noreferrer" aria-label="Open in the team calendar" title="Open in the team calendar">
          <Icon name="ext" size={14} />
        </a>
      )}
    </p>
  );
}
