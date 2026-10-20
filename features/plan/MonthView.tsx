"use client";

// The Month view (guide 4.12, 6.4): a grid of day cells with the day number (today a blue circle), the team calendar's
// events as grey lines with their times, and deadlines as lines with a kind dot, "N more" beyond four. Busy days are
// amber, weekends paler, days outside the month fainter. Large screens open a day in the Day view; phones show dots, and
// the chosen day is listed under the grid.
import Link from "next/link";
import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { monthTitle, plural } from "@/lib/dates";
import { kindOf, linkedCompany, type CompaniesById } from "@/lib/kinds";
import { dayHeading, dayListsOf, dayWithSomething, cellShown, monthModelOf, nextMonthWithSomething, relativeDay } from "@/lib/planCalendar";
import { whoWords, type PlanState } from "@/lib/planView";
import type { Task } from "@/lib/types";
import type { EventsState } from "@/lib/useCalendarEvents";
import Button from "@/ui/Button";
import EmptyState from "@/ui/EmptyState";
import { kindStyle } from "@/ui/kindStyle";
import { LoadingLine } from "@/ui/Skeleton";
import { NameTag } from "@/ui/Tag";
import DayLists from "./DayLists";
import { CalendarNotice } from "./Timeline";
import styles from "./Plan.module.css";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DOTS = 5; // a phone cell's dots before "+"

interface MonthViewProps {
  state: PlanState;
  today: string;
  month: string; // "yyyy-mm"
  tasks: Task[]; // the open tasks, narrowed by Work and Person
  loading: boolean;
  events: EventsState;
  companies: CompaniesById;
  offline: boolean;
  phone: boolean;
  tools: ReactNode;
  leaving: ReadonlySet<string>;
  filtersOn: boolean;
  taskHref: (id: string) => string;
  dayHref: (iso: string) => string;
  onMonth: (month: string | null) => void; // null is this month
  onToggleDone: (task: Task, done: boolean) => void;
  onClearFilters: () => void;
}

export default function MonthView(props: MonthViewProps) {
  const { state, today, month, tasks, loading, events, companies, offline, phone } = props;
  const showTasks = state.show !== "events";
  const showEvents = state.show !== "tasks";
  const shownTasks = useMemo(() => (showTasks && !loading ? tasks : []), [showTasks, loading, tasks]);
  const eventList = showEvents && events.status === "ok" ? events.events : null;
  const name = monthTitle(month);

  const model = useMemo(() => monthModelOf(shownTasks, eventList, month, today), [shownTasks, eventList, month, today]);

  // The day chosen on a phone belongs to the month it was chosen in; stepping to another month starts from today or the 1st.
  const [chosen, setChosen] = useState<{ month: string; date: string } | null>(null);
  const selected =
    chosen && chosen.month === month ? chosen.date : today.slice(0, 7) === month ? today : `${month}-01`;
  const choose = (iso: string) => {
    if (iso.slice(0, 7) !== month) props.onMonth(iso.slice(0, 7));
    setChosen({ month: iso.slice(0, 7), date: iso });
    // The day's list is under the grid on a phone: bring it into view.
    requestAnimationFrame(() => {
      const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      document.querySelector("[data-agenda]")?.scrollIntoView({ behavior: calm ? "auto" : "smooth", block: "start" });
    });
  };

  // Empty only once what's shown has answered: the tasks, and the team calendar when it's shown (Events only needs it).
  const answered = !loading && !(showEvents && events.status === "loading") && (showTasks || events.status === "ok");
  const empty = answered && model.total === 0;
  const nextMonth = empty ? nextMonthWithSomething(shownTasks, eventList, month) : null;
  const who = whoWords(state);

  const agendaLists = useMemo(() => dayListsOf(shownTasks, eventList, selected), [shownTasks, eventList, selected]);
  const previous = useMemo(() => (phone ? dayWithSomething(shownTasks, eventList, selected, -1) : null), [phone, shownTasks, eventList, selected]);
  const next = useMemo(() => (phone ? dayWithSomething(shownTasks, eventList, selected, 1) : null), [phone, shownTasks, eventList, selected]);

  const informed = (t: Task) => !!state.person && !t.responsible.includes(state.person);

  return (
    <>
      <section className={styles.panel} aria-label={name}>
        {props.tools}
        {loading && <LoadingLine>Loading tasks</LoadingLine>}
        {!loading && showEvents && events.status === "loading" && <LoadingLine>Loading events</LoadingLine>}
        {showEvents && events.status !== "ok" && events.status !== "loading" && (
          <div className={styles.note}>
            <div>
              <CalendarNotice status={events.status} offline={offline} compact />
            </div>
          </div>
        )}
        {empty && (
          <div className={styles.monthEmpty}>
            <EmptyState
              size="small"
              icon="cal"
              title={`Nothing in ${name}`}
              actions={
                <>
                  {nextMonth && (
                    <Button small onClick={() => props.onMonth(nextMonth)}>
                      Go to {monthTitle(nextMonth)}
                    </Button>
                  )}
                  {month !== today.slice(0, 7) && (
                    <Button small onClick={() => props.onMonth(null)}>
                      Back to this month
                    </Button>
                  )}
                  {props.filtersOn && (
                    <Button small onClick={props.onClearFilters}>
                      Clear filters
                    </Button>
                  )}
                </>
              }
            >
              {showTasks ? `No deadlines${eventList ? " and no team events" : ""} this month${who}.` : "No team events this month."}
            </EmptyState>
          </div>
        )}
        <div className={styles.monthWrap}>
          <div className={styles.weekdays} aria-hidden="true">
            {WEEKDAYS.map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
          <div className={styles.monthGrid}>
            {model.cells.map((cell) => {
              const summary = `${dayHeading(cell.iso, today)}: ${cell.deadlines.length ? plural(cell.deadlines.length, "deadline") : "no deadlines"}${cell.events.length ? `, ${plural(cell.events.length, "event")}` : ""}`;
              const flags = {
                "data-outside": cell.outside || undefined,
                "data-today": cell.today || undefined,
                "data-weekend": cell.weekend || undefined,
                "data-busy": cell.busy || undefined,
                "data-selected": (phone && cell.iso === selected) || undefined,
              };
              if (phone) {
                return (
                  <button key={cell.iso} type="button" className={styles.monthCell} {...flags} aria-pressed={cell.iso === selected} aria-label={summary} onClick={() => choose(cell.iso)}>
                    <span className={styles.dayNumber} aria-hidden="true">
                      {cell.day}
                    </span>
                    <span className={styles.dots} aria-hidden="true">
                      {cell.items.slice(0, DOTS).map((item, i) =>
                        item.kind === "event" ? (
                          <i key={i} data-event="" />
                        ) : (
                          <i key={i} style={kindStyle(kindOf(item.task!, companies))} />
                        )
                      )}
                      {cell.items.length > DOTS && <b>+</b>}
                    </span>
                  </button>
                );
              }
              const { shown, more } = cellShown(cell.items);
              return (
                <div key={cell.iso} className={styles.monthCell} {...flags}>
                  <Link href={props.dayHref(cell.iso)} className={styles.dayNumber} aria-label={summary} title={summary} aria-current={cell.today ? "date" : undefined}>
                    {cell.day}
                  </Link>
                  <div className={styles.cellItems}>
                    {shown.map((item) =>
                      item.kind === "event" ? (
                        <span key={`e-${item.event!.id}`} className={styles.cellEvent} title={item.event!.title}>
                          {!item.event!.allDay && <b>{item.event!.startTime} </b>}
                          {item.event!.title}
                        </span>
                      ) : (
                        <CellTask key={item.task!.id} task={item.task!} kindStyleOf={kindStyle(kindOf(item.task!, companies))} late={(item.task!.endDate ?? "") < today} informed={informed(item.task!)} href={props.taskHref(item.task!.id)} where={linkedCompany(item.task!, companies)?.company ?? item.task!.taskGroup ?? "Internal"} />
                      )
                    )}
                    {more > 0 && (
                      <Link href={props.dayHref(cell.iso)} className={styles.cellMore} aria-label={`${plural(more, "more item")} on ${dayHeading(cell.iso, today)}, open the day`}>
                        {more.toLocaleString("en-GB")} more
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className={`${styles.legend} ${styles.monthLegend}`}>
          <span>
            <i style={{ background: "var(--pro)" }} />
            Prospects
          </span>
          <span>
            <i style={{ background: "var(--cli)" }} />
            Clients
          </span>
          <span>
            <i style={{ background: "var(--int)" }} />
            Internal
          </span>
          <span>
            <i style={{ background: "var(--event-mark)" }} />
            Team calendar
          </span>
          <span>
            <i style={{ background: "var(--crunch)" }} />
            Busy day
          </span>
        </div>
      </section>

      {phone && !loading && (
        <div className={styles.agenda} data-agenda="">
          <div className={styles.agendaHead}>
            <h2>{dayHeading(selected, today)}</h2>
            <NameTag kind={selected === today ? "prospect" : "internal"}>{relativeDay(selected, today)}</NameTag>
          </div>
          <DayLists
            iso={selected}
            today={today}
            lists={agendaLists}
            showTasks={showTasks}
            showEvents={showEvents}
            events={events}
            offline={offline}
            compact
            person={state.person}
            who={who}
            filtersOn={props.filtersOn}
            companies={companies}
            leaving={props.leaving}
            previous={previous}
            next={next}
            taskHref={props.taskHref}
            onGoto={choose}
            onToggleDone={props.onToggleDone}
            onClearFilters={props.onClearFilters}
          />
        </div>
      )}
    </>
  );
}

function CellTask({ task, kindStyleOf, late, informed, href, where }: { task: Task; kindStyleOf: CSSProperties; late: boolean; informed: boolean; href: string; where: string }) {
  const words = [task.task, where].filter(Boolean).join(", ");
  return (
    <Link href={href} scroll={false} className={styles.cellTask} style={kindStyleOf} data-late={late || undefined} data-informed={informed || undefined} title={words}>
      <i aria-hidden="true" />
      {task.task}
    </Link>
  );
}
