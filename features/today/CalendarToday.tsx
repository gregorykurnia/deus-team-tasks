// Calendar today (guide 5.9, 6.1): the team calendar's events for today, read only, each with its times or "All day"
// and a button that opens it in the team calendar. If the calendar isn't connected an info notice says so, and if it
// fails an amber one does; tasks always carry on.
import Link from "next/link";
import { eventsOnDay, eventTimes, EVENT_LIMIT } from "@/lib/today";
import type { EventsState } from "@/lib/useCalendarEvents";
import { plural } from "@/lib/dates";
import { buttonClass } from "@/ui/Button";
import EmptyState from "@/ui/EmptyState";
import Icon from "@/ui/Icon";
import Notice from "@/ui/Notice";
import Panel from "@/ui/Panel";
import { Skeleton, LoadingLine } from "@/ui/Skeleton";
import { ReadOnlyTag } from "@/ui/Tag";
import styles from "./Today.module.css";

interface CalendarTodayProps {
  events: EventsState;
  today: string | null;
  offline: boolean;
}

export default function CalendarToday({ events, today, offline }: CalendarTodayProps) {
  let body;
  if (events.status === "loading" || !today) {
    body = (
      <>
        <LoadingLine>Loading events</LoadingLine>
        {[1, 2, 3].map((n) => (
          <div key={n} className={styles.event} aria-hidden="true">
            <span className={styles.eventBar} />
            <div>
              <Skeleton height={13} width="70%" />
              <span className={styles.gapSm} />
              <Skeleton height={10} width="35%" />
            </div>
            <span />
          </div>
        ))}
      </>
    );
  } else if (events.status === "off") {
    body = (
      <div className={styles.panelNote}>
        <Notice tone="info" title="The team calendar isn't connected.">
          Meetings and events will show here once it&apos;s set up. Tasks work as usual.
        </Notice>
      </div>
    );
  } else if (events.status === "failed") {
    body = (
      <div className={styles.panelNote}>
        <Notice tone="warning" title="Couldn't load today's events.">
          {offline ? "They will appear when you are back online." : "The team calendar didn't respond. Tasks work as usual."}
        </Notice>
      </div>
    );
  } else {
    const list = eventsOnDay(events.events, today);
    const shown = list.slice(0, EVENT_LIMIT);
    body = list.length ? (
      <>
        {shown.map((e) => (
          <div key={e.id} className={styles.event}>
            <span className={styles.eventBar} />
            <div className={styles.eventText}>
              <p>{e.title}</p>
              <small>{eventTimes(e)}</small>
            </div>
            {e.link ? (
              <a
                className={styles.eventOpen}
                href={e.link}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Open “${e.title}” in the team calendar`}
                title="Open in the team calendar"
              >
                <Icon name="ext" size={14} />
              </a>
            ) : (
              <span />
            )}
          </div>
        ))}
        {list.length > shown.length && (
          <div className={styles.eventsMore}>
            <Link href="/plan?view=day" className={buttonClass("quiet", true)}>
              {plural(list.length - shown.length, "more event")} today
            </Link>
          </div>
        )}
      </>
    ) : (
      <EmptyState size="small" icon="cal" title="No events today">
        Nothing is on the team calendar.
      </EmptyState>
    );
  }
  return (
    <Panel
      title="Calendar today"
      tools={
        <span title="Events come from the team calendar and can't be changed here">
          <ReadOnlyTag />
        </span>
      }
    >
      {body}
    </Panel>
  );
}
