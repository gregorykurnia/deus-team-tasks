"use client";

// The Plan timeline (guide 4.12, 6.4): summary chips and a legend, then four weeks with a header of weeks and days, a row of
// deadline counts, the team calendar's counts, and a lane for each person or kind of work. Bars run from start to
// deadline, a deadline alone is a diamond, no deadline fades out to the right. Phones scroll the weeks sideways from
// today with the avatars pinned. Every number and bar has words (title and label), so nothing depends on colour.
import Link from "next/link";
import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { groupHref } from "@/desk/areas";
import { dayLabel, parseIso, plural, shortDate, weekdayDate } from "@/lib/dates";
import type { CompaniesById } from "@/lib/kinds";
import { linkedCompany } from "@/lib/kinds";
import { useArrival } from "@/lib/liveChanges";
import { LANE_CAP, timelineOf, type Bar, type Lane } from "@/lib/planTimeline";
import { TIMELINE_DAYS, weekStart, type PlanState } from "@/lib/planView";
import { eventOnDay, eventTimes } from "@/lib/today";
import type { Task } from "@/lib/types";
import { deadlineSignal } from "@/lib/urgency";
import type { EventsState } from "@/lib/useCalendarEvents";
import Avatar from "@/ui/Avatar";
import Button, { buttonClass } from "@/ui/Button";
import EmptyState from "@/ui/EmptyState";
import Icon, { type IconName } from "@/ui/Icon";
import { kindStyle } from "@/ui/kindStyle";
import Notice from "@/ui/Notice";
import { Skeleton } from "@/ui/Skeleton";
import styles from "./Plan.module.css";

const WEEKDAY_LETTER = ["S", "M", "T", "W", "T", "F", "S"];
const INSIGHT_ICONS: Record<string, IconName> = { busiest: "alert", quiet: "sun", before: "clock", undated: "info" };
const ROW_HEIGHT = 32; // one line of bars in a lane
const FIRST_GUESS = 32; // a column's width before it is measured

interface TimelineProps {
  state: PlanState;
  from: string;
  today: string;
  tasks: Task[]; // the open tasks to draw, already narrowed (none when only events are shown)
  groupId: string | null; // the Work filter's task group, for the chips' links
  hasTasks: boolean; // there are tasks at all, narrowed or not
  loading: boolean;
  events: EventsState;
  companies: CompaniesById;
  offline: boolean;
  tools: ReactNode; // the filters and the stepper, at the top of the panel
  taskHref: (id: string) => string;
  dayHref: (iso: string) => string;
  newTaskHref: string;
  onClearFilters: () => void;
  filtersOn: boolean;
  onThisWeek: () => void;
}

export default function Timeline(props: TimelineProps) {
  const { state, from, today, tasks, hasTasks, loading, events, companies, offline } = props;
  const eventsOnly = state.show === "events";
  const wantEvents = state.show !== "tasks";
  const eventList = wantEvents && events.status === "ok" ? events.events : null;

  // A column's width decides whether a bar's words fit inside it, so it is measured and the bars placed again.
  const daysRef = useRef<HTMLDivElement>(null);
  const [columnWidth, setColumnWidth] = useState(FIRST_GUESS);
  useLayoutEffect(() => {
    const el = daysRef.current;
    if (!el) return;
    const measure = () => {
      const width = Math.round(el.clientWidth / TIMELINE_DAYS);
      if (width > 0) setColumnWidth(width);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // The chips link to the same Work in All tasks, or the group's own list. All tasks has no person filter.
  const listHref = state.kind ? `/tasks?kind=${state.kind}` : props.groupId ? groupHref(props.groupId) : "/tasks";
  const model = useMemo(
    () =>
      timelineOf({ tasks: eventsOnly ? [] : tasks, events: eventList, from, today, rows: state.rows, person: state.person, companies, columnWidth, listHref }),
    [tasks, eventsOnly, eventList, from, today, state.rows, state.person, companies, columnWidth, listHref]
  );

  // Lanes unfolded with "Show more" fold again when the view changes.
  const viewKey = [state.person, state.kind, state.group, state.rows, state.show, from].join("|");
  const [unfolded, setUnfolded] = useState<{ key: string; lanes: ReadonlySet<string> }>({ key: viewKey, lanes: new Set() });
  const open = unfolded.key === viewKey ? unfolded.lanes : new Set<string>();
  function toggle(laneKey: string) {
    const next = new Set(open);
    if (next.has(laneKey)) next.delete(laneKey);
    else next.add(laneKey);
    setUnfolded({ key: viewKey, lanes: next });
  }

  // Phones start at today's column, with room for the pinned avatars. Large screens show all four weeks.
  const scroller = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (el.scrollWidth <= el.clientWidth) {
      el.scrollLeft = 0;
      return;
    }
    const day = el.querySelector<HTMLElement>("[data-today]");
    el.scrollLeft = day ? Math.max(0, day.getBoundingClientRect().left - el.getBoundingClientRect().left + el.scrollLeft - 56 - 44) : 0;
  }, [from]);

  const label = (iso: string) => weekdayDate(iso, today);
  const weeks = Array.from({ length: TIMELINE_DAYS / 7 }, (_, w) => model.days[w * 7]);

  const columns = (
    <div className={styles.cols} aria-hidden="true">
      {model.days.map((iso, i) => (
        <i
          key={iso}
          className={[isWeekendDay(iso) && styles.weekend, model.crunch.has(iso) && styles.crunch, i === model.todayIndex && styles.today]
            .filter(Boolean)
            .join(" ")}
        />
      ))}
    </div>
  );

  const head = (
    <div className={`${styles.row} ${styles.head}`}>
      <div className={styles.label} />
      <div className={styles.track}>
        <div className={styles.weeks}>
          {weeks.map((iso) => {
            const current = iso === weekStart(today);
            return (
              <span key={iso} className={styles.week} data-current={current || undefined}>
                {current ? "This week" : `Week of ${shortDate(iso, today)}`}
              </span>
            );
          })}
        </div>
        <div className={styles.days} ref={daysRef}>
          {model.days.map((iso, i) => (
            <Link
              key={iso}
              href={props.dayHref(iso)}
              className={styles.day}
              data-today={i === model.todayIndex || undefined}
              data-weekend={isWeekendDay(iso) || undefined}
              title={longDay(iso)}
              aria-current={i === model.todayIndex ? "date" : undefined}
            >
              <span aria-hidden="true">{WEEKDAY_LETTER[parseIso(iso).getDay()]}</span>
              <b aria-hidden="true">{Number(iso.slice(8))}</b>
              <span className="sr-only">Open {longDay(iso)}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );

  const deadlines =
    eventsOnly || loading ? null : (
      <div className={styles.row}>
        <div className={styles.label}>
          <span className={styles.labelIcon}>
            <Icon name="clock" size={15} />
          </span>
          <div className={styles.lineText}>
            <p>Deadlines</p>
          </div>
          <span className="sr-only">Deadlines</span>
        </div>
        <div className={`${styles.track} ${styles.cells}`}>
          {model.days.map((iso, i) =>
            model.deadlines[i] ? (
              <span key={iso} className={styles.count} data-crunch={model.crunch.has(iso) || undefined} title={`${label(iso)}: ${plural(model.deadlines[i], "deadline")}`}>
                {model.deadlines[i].toLocaleString("en-GB")}
                <span className="sr-only"> {model.deadlines[i] === 1 ? "deadline" : "deadlines"}</span>
              </span>
            ) : (
              <span key={iso} />
            )
          )}
        </div>
      </div>
    );

  let calendarTrack: ReactNode = null;
  if (wantEvents) {
    if (events.status === "loading") {
      calendarTrack = (
        <div className={styles.track}>
          <span className={styles.skeletonCell}>
            <Skeleton height={22} />
          </span>
        </div>
      );
    } else if (events.status !== "ok") {
      calendarTrack = (
        <div className={styles.track}>
          <div className={styles.note}>
            <div>
              <CalendarNotice status={events.status} offline={offline} compact />
            </div>
          </div>
        </div>
      );
    } else {
      calendarTrack = (
        <div className={`${styles.track} ${styles.cells} ${eventsOnly ? styles.tall : ""}`}>
          {model.days.map((iso, i) => {
            const list = events.events.filter((e) => eventOnDay(e, iso));
            if (!list.length) return <span key={iso} />;
            const words = list.map((e) => `${eventTimes(e)} ${e.title}`).join("\n");
            if (!eventsOnly) {
              return (
                <Link key={iso} href={props.dayHref(iso)} className={styles.eventCount} data-all-day={model.allDay[i] || undefined} title={words}>
                  {list.length.toLocaleString("en-GB")}
                  <span className="sr-only">
                    {" "}
                    {list.length === 1 ? "event" : "events"} on {label(iso)}. Open the day
                  </span>
                </Link>
              );
            }
            const shown = list.slice(0, 6);
            return (
              <span key={iso} className={styles.eventStack}>
                {shown.map((e) => (
                  <Link key={e.id} href={props.dayHref(iso)} className={styles.eventTime} data-all-day={e.allDay || undefined} title={`${eventTimes(e)}, ${e.title}`}>
                    {e.allDay ? "Day" : e.startTime}
                    <span className="sr-only">
                      {" "}
                      {e.title}, {eventTimes(e)}
                    </span>
                  </Link>
                ))}
                {list.length > shown.length && (
                  <Link href={props.dayHref(iso)} className={styles.eventTime} data-more="" aria-label={`${plural(list.length - shown.length, "more event")}, open the day`}>
                    +{list.length - shown.length}
                  </Link>
                )}
              </span>
            );
          })}
        </div>
      );
    }
  }
  const calendar = calendarTrack && (
    <div className={styles.row}>
      <div className={styles.label}>
        <span className={styles.labelIcon}>
          <Icon name="cal" size={15} />
        </span>
        <div className={styles.lineText}>
          <p>Team calendar</p>
          <small className={styles.readOnly}>
            <Icon name="lock" size={12} />
            Read only
          </small>
        </div>
        <span className="sr-only">Team calendar, read only</span>
      </div>
      {calendarTrack}
    </div>
  );

  let lanes: ReactNode = null;
  if (loading) {
    lanes = [0, 1, 2, 3].map((n) => (
      <div key={n} className={`${styles.row} ${styles.lane}`} aria-hidden="true">
        <div className={styles.label}>
          <Skeleton width={34} height={34} />
        </div>
        <div className={styles.track} style={{ height: ROW_HEIGHT * 2 + 16 }}>
          <span style={{ position: "absolute", top: 10, left: `${8 + n * 9}%`, width: "28%" }}>
            <Skeleton height={24} />
          </span>
          <span style={{ position: "absolute", top: 42, left: `${30 + n * 7}%`, width: "20%" }}>
            <Skeleton height={24} />
          </span>
        </div>
      </div>
    ));
  } else if (!eventsOnly) {
    lanes = model.lanes.map((lane) => (
      <LaneRow key={lane.key} lane={lane} open={open.has(lane.key)} onToggle={() => toggle(lane.key)} {...props} />
    ));
    if (!model.lanes.length) {
      const who = [state.person, workWords(state)].filter(Boolean).join(", ");
      const last = model.days[TIMELINE_DAYS - 1];
      lanes = (
        <div className={styles.empty}>
          {!hasTasks ? (
            <EmptyState icon="cal" title="Nothing planned yet" actions={<NewTaskLink href={props.newTaskHref} />}>
              Tasks with dates show up here as bars from their start to their deadline, one row per person.
            </EmptyState>
          ) : (
            <EmptyState
              size="small"
              icon="cal"
              title={`No tasks between ${shortDate(from, today)} and ${shortDate(last, today)}`}
              actions={
                <>
                  {props.filtersOn && (
                    <Button small onClick={props.onClearFilters}>
                      Clear filters
                    </Button>
                  )}
                  {from !== weekStart(today) && (
                    <Button small onClick={props.onThisWeek}>
                      Back to this week
                    </Button>
                  )}
                </>
              }
            >
              {who ? `Nothing dated in these four weeks for ${who}.` : "Nothing dated falls in these four weeks."}
            </EmptyState>
          )}
        </div>
      );
    }
  }

  const style = { "--days": TIMELINE_DAYS } as CSSProperties;
  const chips = model.insights.map((insight) => {
    const icon = INSIGHT_ICONS[insight.key];
    const body = (
      <>
        <i className={styles.insightIcon}>
          <Icon name={icon} size={15} />
        </i>
        <span>
          {insight.lead}
          <b>{insight.bold}</b>
          {insight.tail}
        </span>
      </>
    );
    const cls = `${styles.insight} ${styles[insight.tone]}`;
    if (insight.day) {
      return (
        <Link key={insight.key} href={props.dayHref(insight.day)} className={cls}>
          {body}
        </Link>
      );
    }
    if (insight.href) {
      return (
        <Link key={insight.key} href={insight.href} className={cls}>
          {body}
        </Link>
      );
    }
    return (
      <span key={insight.key} className={cls}>
        {body}
      </span>
    );
  });

  return (
    <>
      {!eventsOnly && !loading && (
        <div className={styles.summary}>
          {chips}
          <span className={styles.spacer} />
          <Legend person={!!state.person} crunch={model.crunch.size > 0} />
        </div>
      )}
      <section className={`${styles.panel} ${styles.tlPanel}`} aria-label="Timeline">
        {props.tools}
        {eventsOnly && events.status !== "ok" && events.status !== "loading" && (
          <div className={styles.note}>
            <div>
              <CalendarNotice status={events.status} offline={offline} />
            </div>
          </div>
        )}
        <div className={styles.scroll} ref={scroller}>
          <div className={styles.tl} style={style}>
            {columns}
            {head}
            {deadlines}
            {calendar}
            {lanes}
          </div>
        </div>
      </section>
    </>
  );
}

function isWeekendDay(iso: string): boolean {
  const day = parseIso(iso).getDay();
  return day === 0 || day === 6;
}

function longDay(iso: string): string {
  return parseIso(iso).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function workWords(state: PlanState): string | null {
  if (state.kind) return `${{ prospect: "prospect", client: "client", internal: "internal" }[state.kind]} work`;
  return state.group;
}

function NewTaskLink({ href }: { href: string }) {
  return (
    <Link href={href} scroll={false} className={buttonClass("secondary")}>
      <Icon name="plus" size={16} />
      New task
    </Link>
  );
}

function Legend({ person, crunch }: { person: boolean; crunch: boolean }) {
  return (
    <div className={styles.legend}>
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
      {person && (
        <span>
          <i className={styles.dash} />
          Kept informed
        </span>
      )}
      <span>
        <i className={styles.pin} />
        Deadline only
      </span>
      {crunch && (
        <span>
          <i style={{ background: "var(--crunch)" }} />
          Crunch
        </span>
      )}
    </div>
  );
}

export function CalendarNotice({ status, offline, compact = false }: { status: "off" | "failed"; offline: boolean; compact?: boolean }) {
  if (status === "off") {
    return (
      <Notice tone="info" title="The team calendar isn't connected.">
        {compact ? undefined : "Meetings and events will show here once it's set up. Tasks work as usual."}
      </Notice>
    );
  }
  return (
    <Notice tone="warning" title="Couldn't load the team calendar.">
      {compact ? undefined : offline ? "Events will appear when you are back online." : "It didn't respond. Tasks work as usual."}
    </Notice>
  );
}

interface LaneRowProps extends TimelineProps {
  lane: Lane;
  open: boolean;
  onToggle: () => void;
}

function LaneRow({ lane, open, onToggle, state, today, companies, taskHref }: LaneRowProps) {
  const shownRows = open ? lane.rows : Math.min(lane.rows, LANE_CAP);
  const hidden = lane.bars.filter((b) => b.row >= shownRows).length;
  const sub = state.person ? `${lane.owned.toLocaleString("en-GB")} owned, ${lane.informed.toLocaleString("en-GB")} informed` : plural(lane.bars.length, "task");
  const more = hidden > 0 || (open && lane.rows > LANE_CAP);
  return (
    <div className={`${styles.row} ${styles.lane}`}>
      <div className={styles.label}>
        {lane.person ? (
          <Avatar name={lane.person} size="plan" />
        ) : lane.kind ? (
          <span className={styles.kindMark} style={kindStyle(lane.kind)} aria-hidden="true">
            {lane.name[0]}
          </span>
        ) : (
          <span className={styles.nobody} aria-hidden="true">
            ?
          </span>
        )}
        <div className={styles.lineText}>
          <p title={lane.name}>{lane.name}</p>
          <small>{sub}</small>
          {lane.peak && lane.peak.count >= 4 && (
            <small className={styles.amber}>
              {lane.peak.count.toLocaleString("en-GB")} at once on {dayLabel(lane.peak.iso)}
            </small>
          )}
        </div>
        <span className="sr-only">
          {lane.name}, {sub}
        </span>
        {more && (
          <button type="button" className={styles.more} aria-expanded={open} onClick={onToggle}>
            <span className={styles.moreLong}>{open ? "Show fewer" : `Show ${hidden.toLocaleString("en-GB")} more`}</span>
            <span className={styles.moreShort} aria-hidden="true">
              {open ? "−" : `+${hidden.toLocaleString("en-GB")}`}
            </span>
            <span className="sr-only">{open ? "Show fewer" : `Show ${plural(hidden, "more task")}`} for {lane.name}</span>
          </button>
        )}
      </div>
      <div className={styles.track} style={{ height: shownRows * ROW_HEIGHT + 14 }}>
        {lane.bars
          .filter((b) => b.row < shownRows)
          .map((b) => (
            <BarLink key={b.task.id} bar={b} person={state.person} today={today} companies={companies} href={taskHref(b.task.id)} />
          ))}
      </div>
    </div>
  );
}

function BarLink({ bar, person, today, companies, href }: { bar: Bar; person: string | null; today: string; companies: CompaniesById; href: string }) {
  const { task } = bar;
  const arrival = useArrival("tasks", task.id);
  const where = linkedCompany(task, companies)?.company ?? task.taskGroup ?? "Internal";
  const dates = [
    task.startDate && `starts ${shortDate(task.startDate, today)}`,
    task.endDate ? `deadline ${shortDate(task.endDate, today)}${bar.late ? ` (${deadlineSignal(task, today).label})` : ""}` : "no deadline",
  ]
    .filter(Boolean)
    .join(", ");
  const people = task.responsible.length ? ` Responsible: ${task.responsible.join(", ")}.` : "";
  const informed = bar.informed ? ` ${person} is kept informed.` : "";
  const words = `${task.task}. ${where}. ${dates[0].toUpperCase()}${dates.slice(1)}.${people}${informed}`;
  const style: CSSProperties = {
    ...kindStyle(bar.kind),
    left: `${(bar.first / TIMELINE_DAYS) * 100}%`,
    width: `${(bar.span / TIMELINE_DAYS) * 100}%`,
    top: bar.row * ROW_HEIGHT + 8,
  };
  return (
    <Link
      href={href}
      scroll={false}
      className={styles.bar}
      style={style}
      title={words}
      aria-label={words}
      data-clip-left={bar.clipLeft || undefined}
      data-clip-right={bar.clipRight || undefined}
      data-open-end={bar.openEnd || undefined}
      data-diamond={bar.diamond || undefined}
      data-late={bar.late || undefined}
      data-informed={bar.informed || undefined}
      data-new={arrival !== "none" || undefined}
    >
      <span className={styles.fill} style={{ width: bar.inside ? "100%" : `${(bar.columns / bar.span) * 100}%` }}>
        {bar.inside && <span className={styles.words}>{task.task}</span>}
      </span>
      {!bar.inside && <span className={styles.words}>{task.task}</span>}
    </Link>
  );
}
