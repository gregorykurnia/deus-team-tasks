"use client";

// One day's lists (guide 6.4): the tasks split into Deadline today / Deadline on this day, Starting and Under way, beside
// the team calendar's events with their times and a link to each. Large screens put them side by side; Month's phone
// list stacks them under the grid. A day with nothing says so and points to the days around it. The events say when the
// calendar isn't connected or couldn't be read, and tasks carry on.
import { shortDate, weekdayDate } from "@/lib/dates";
import { eventTimes } from "@/lib/today";
import { dayHeading, taskCount, type DayLists as DayListsModel } from "@/lib/planCalendar";
import type { CompaniesById } from "@/lib/kinds";
import type { EventsState } from "@/lib/useCalendarEvents";
import type { Task } from "@/lib/types";
import Button from "@/ui/Button";
import EmptyState from "@/ui/EmptyState";
import Icon from "@/ui/Icon";
import Panel, { PanelRows } from "@/ui/Panel";
import { LoadingLine, Skeleton, SkeletonRow } from "@/ui/Skeleton";
import { ReadOnlyTag } from "@/ui/Tag";
import { TaskDayRow } from "@/ui/TaskRow";
import { CalendarNotice } from "./Timeline";
import styles from "./Plan.module.css";

interface DayListsProps {
  iso: string;
  today: string;
  lists: DayListsModel;
  showTasks: boolean;
  showEvents: boolean;
  events: EventsState;
  offline: boolean;
  compact?: boolean; // under Month's grid: stacked, with a smaller empty state
  person: string | null;
  who: string; // " for Maya Chen", " in client work", or ""
  filtersOn: boolean;
  companies: CompaniesById;
  leaving: ReadonlySet<string>;
  previous: string | null; // the day before with something
  next: string | null; // the day after with something
  taskHref: (id: string) => string;
  onGoto: (iso: string) => void;
  onToggleDone: (task: Task, done: boolean) => void;
  onClearFilters: () => void;
}

export default function DayLists(props: DayListsProps) {
  const { iso, today, lists, showTasks, showEvents, events, offline, compact = false, person, who, filtersOn, companies, leaving } = props;
  const tasks = taskCount(lists);
  const eventsReady = events.status === "ok";
  const nothing = tasks === 0 && lists.events.length === 0 && (eventsReady || !showEvents);

  if (nothing) {
    const what =
      !showTasks ? "No team events" : !showEvents ? "No tasks start, finish or run" : "No tasks start, finish or run, and there are no team events";
    return (
      <section className={styles.dayEmpty}>
        <EmptyState
          size={compact ? "small" : "large"}
          icon="cal"
          title={`Nothing on ${dayHeading(iso, today)}`}
          actions={
            <>
              {props.previous && (
                <Button small onClick={() => props.onGoto(props.previous!)}>
                  <Icon name="left" size={16} />
                  {shortDate(props.previous, today)}
                </Button>
              )}
              {props.next && (
                <Button small onClick={() => props.onGoto(props.next!)}>
                  Next with something: {weekdayDate(props.next, today)}
                  <Icon name="right" size={16} />
                </Button>
              )}
              {filtersOn && (
                <Button small onClick={props.onClearFilters}>
                  Clear filters
                </Button>
              )}
            </>
          }
        >
          {`${what}${who} on this day.`}
        </EmptyState>
      </section>
    );
  }

  const section = (key: string, label: string, color: string, rows: Task[]) =>
    rows.length > 0 && (
      <div key={key}>
        <div className={styles.groupLabel}>
          <i style={{ background: color }} />
          {label}
          <span className={styles.groupCount}>{rows.length.toLocaleString("en-GB")}</span>
        </div>
        <PanelRows>
          {rows.map((t) => (
            <TaskDayRow
              key={t.id}
              task={t}
              companies={companies}
              today={today}
              href={props.taskHref(t.id)}
              person={person ?? undefined}
              leaving={leaving.has(t.id)}
              onToggleDone={(done) => props.onToggleDone(t, done)}
            />
          ))}
        </PanelRows>
      </div>
    );

  const taskPanel = showTasks && (
    <Panel title="Tasks" count={tasks}>
      {tasks > 0 ? (
        <>
          {section("deadline", iso === today ? "Deadline today" : "Deadline on this day", "var(--amber)", lists.deadline)}
          {section("starting", "Starting", "var(--blue)", lists.starting)}
          {section("underWay", "Under way", "var(--outside-line)", lists.underWay)}
        </>
      ) : (
        <EmptyState size="small" icon="done" title="No tasks on this day">
          {`Nothing starts, finishes or runs${person ? ` for ${person}` : ""}.`}
        </EmptyState>
      )}
    </Panel>
  );

  let eventBody;
  if (events.status === "loading") {
    eventBody = (
      <>
        <LoadingLine>Loading events</LoadingLine>
        {[1, 2].map((n) => (
          <div key={n} className={styles.event} aria-hidden="true">
            <span className={styles.eventBar} />
            <div>
              <Skeleton height={13} width="70%" />
              <span className={styles.gap} />
              <Skeleton height={10} width="35%" />
            </div>
            <span />
          </div>
        ))}
      </>
    );
  } else if (events.status !== "ok") {
    eventBody = (
      <div className={styles.panelNote}>
        <CalendarNotice status={events.status} offline={offline} />
      </div>
    );
  } else if (lists.events.length === 0) {
    eventBody = (
      <EmptyState size="small" icon="cal" title="No events">
        Nothing is on the team calendar.
      </EmptyState>
    );
  } else {
    eventBody = lists.events.map((e) => (
      <div key={e.id} className={styles.event}>
        <span className={styles.eventBar} />
        <div className={styles.eventText}>
          <p>{e.title}</p>
          <small>{eventTimes(e)}</small>
        </div>
        {e.link ? (
          <a className={styles.eventOpen} href={e.link} target="_blank" rel="noopener noreferrer" aria-label={`Open “${e.title}” in the team calendar`} title="Open in the team calendar">
            <Icon name="ext" size={14} />
          </a>
        ) : (
          <span />
        )}
      </div>
    ));
  }
  const eventPanel = showEvents && (
    <Panel
      title="Team calendar"
      count={lists.events.length || undefined}
      tools={
        <span title="Events come from the team calendar and can't be changed here">
          <ReadOnlyTag />
        </span>
      }
    >
      {eventBody}
    </Panel>
  );

  if (compact) {
    return (
      <div className={styles.agendaPanels}>
        {taskPanel}
        {eventPanel}
      </div>
    );
  }
  return (
    <div className={showTasks && showEvents ? styles.board : `${styles.board} ${styles.one}`}>
      {taskPanel}
      {eventPanel && <div className={styles.rail}>{eventPanel}</div>}
    </div>
  );
}

// While the tasks load: the panel's shape with rows' shapes, and the words.
export function DayLoading() {
  return (
    <section className={styles.panel} aria-label="Loading the day">
      <LoadingLine>Loading tasks</LoadingLine>
      {[1, 2, 3].map((n) => (
        <SkeletonRow key={n} />
      ))}
    </section>
  );
}
