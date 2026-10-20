"use client";

// The Day view (guide 4.12, 6.4): the date and what's on it, a date picker, the week strip, then the day's lists. The
// first look lands on today if anything is happening there, or else on the next day with something, with a note and
// "Show today" (D5). A date in the address (a link from Today's chart, the timeline or the strip) always wins.
import { useMemo, useState, type ReactNode } from "react";
import { parseIso } from "@/lib/dates";
import type { CompaniesById } from "@/lib/kinds";
import { dayHeading, dayListsOf, daySummary, dayWithSomething, isPickedDay, relativeDay, weekStrip } from "@/lib/planCalendar";
import { whoWords, type PlanState } from "@/lib/planView";
import type { Task } from "@/lib/types";
import type { EventsState } from "@/lib/useCalendarEvents";
import Button from "@/ui/Button";
import Icon from "@/ui/Icon";
import Notice from "@/ui/Notice";
import { NameTag } from "@/ui/Tag";
import DayLists, { DayLoading } from "./DayLists";
import styles from "./Plan.module.css";

interface DayViewProps {
  state: PlanState;
  today: string;
  date: string; // the day shown: the address's, or the one it landed on
  landed: boolean; // it landed on a day other than today (D5)
  holding: boolean; // waiting for the calendar before it can pick a day
  tasks: Task[]; // the open tasks narrowed by Work and Person, none when only events are shown
  loading: boolean;
  events: EventsState;
  companies: CompaniesById;
  offline: boolean;
  tools: ReactNode;
  leaving: ReadonlySet<string>;
  filtersOn: boolean;
  taskHref: (id: string) => string;
  onDate: (iso: string) => void;
  onToggleDone: (task: Task, done: boolean) => void;
  onClearFilters: () => void;
}

export default function DayView(props: DayViewProps) {
  const { state, today, date: iso, tasks, loading, events, offline, holding } = props;
  const showTasks = state.show !== "events";
  const showEvents = state.show !== "tasks";
  const eventList = showEvents && events.status === "ok" ? events.events : null;

  const lists = useMemo(() => dayListsOf(tasks, eventList, iso), [tasks, eventList, iso]);
  const strip = useMemo(() => weekStrip(tasks, eventList, iso), [tasks, eventList, iso]);
  const previous = useMemo(() => dayWithSomething(tasks, eventList, iso, -1), [tasks, eventList, iso]);
  const next = useMemo(() => dayWithSomething(tasks, eventList, iso, 1), [tasks, eventList, iso]);

  const summary = loading ? "" : daySummary(lists);
  const who = whoWords(state);
  // What's typed in the date picker until it is a whole day: a year typed digit by digit isn't a day to go to yet.
  const [typed, setTyped] = useState<string | null>(null);
  const tag = relativeDay(iso, today);

  return (
    <>
      <section className={styles.panel} aria-label="Choose a day">
        {props.tools}
        <div className={styles.dayHead}>
          <div className={styles.dayMain}>
            <h2>{dayHeading(iso, today)}</h2>
            <p>
              <NameTag kind={iso === today ? "prospect" : "internal"}>{tag}</NameTag>
              {summary && <span>{summary}</span>}
            </p>
          </div>
          <label className={styles.picker}>
            <span className="sr-only">Go to a date</span>
            <Icon name="cal" size={16} />
            <input
              type="date"
              value={typed ?? iso}
              aria-label="Go to a date"
              onChange={(e) => {
                const value = e.target.value;
                if (isPickedDay(value)) {
                  setTyped(null);
                  props.onDate(value);
                } else setTyped(value);
              }}
              onBlur={() => setTyped(null)}
            />
          </label>
        </div>
        <div className={styles.strip} role="group" aria-label="Days of this week">
          {strip.map((d) => (
            <button
              key={d.iso}
              type="button"
              className={styles.stripDay}
              data-selected={d.iso === iso || undefined}
              data-today={d.iso === today || undefined}
              aria-pressed={d.iso === iso}
              aria-label={`${dayHeading(d.iso, today)}: ${d.deadlines} ${d.deadlines === 1 ? "deadline" : "deadlines"}, ${d.events} ${d.events === 1 ? "event" : "events"}`}
              onClick={() => props.onDate(d.iso)}
            >
              <span aria-hidden="true">{parseIso(d.iso).toLocaleDateString("en-GB", { weekday: "short" })}</span>
              <b aria-hidden="true">{Number(d.iso.slice(8))}</b>
              <span className={styles.stripCounts} aria-hidden="true">
                {d.deadlines > 0 && <i data-kind="tasks">{d.deadlines.toLocaleString("en-GB")}</i>}
                {d.events > 0 && <i data-kind="events">{d.events.toLocaleString("en-GB")}</i>}
              </span>
            </button>
          ))}
        </div>
      </section>

      {props.landed && !holding && (
        <div className={styles.landed}>
          <Notice
            title="Nothing is happening today."
            action={
              <Button small onClick={() => props.onDate(today)}>
                Show today
              </Button>
            }
          >
            This is the next day with something on it.
          </Notice>
        </div>
      )}

      {loading || holding ? (
        <DayLoading />
      ) : (
        <DayLists
          iso={iso}
          today={today}
          lists={lists}
          showTasks={showTasks}
          showEvents={showEvents}
          events={events}
          offline={offline}
          person={state.person}
          who={who}
          filtersOn={props.filtersOn}
          companies={props.companies}
          leaving={props.leaving}
          previous={previous}
          next={next}
          taskHref={props.taskHref}
          onGoto={props.onDate}
          onToggleDone={props.onToggleDone}
          onClearFilters={props.onClearFilters}
        />
      )}
    </>
  );
}
