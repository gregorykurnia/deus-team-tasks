"use client";

// Plan (guide 6.4): the coming weeks as a timeline (opens first), a month, one day, and who carries what. The view lives in
// the address, so a link from Today lands on the right day and a reload keeps it. People ranks who carries what and opens
// one person's page. Every source loads on its own: tasks can show while the team calendar is still loading, and the
// reverse.
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { over } from "@/desk/areas";
import { useCompanies, useCompaniesById, useTaskGroups, useTasks } from "@/desk/DeskData";
import PageHeader from "@/desk/PageHeader";
import { failureMessage, useConnection } from "@/lib/connection";
import { groupNavItems } from "@/lib/deskNav";
import { eventsWindow, landing, monthWindow, somethingOn, windowHas } from "@/lib/planCalendar";
import { loadPerPerson } from "@/lib/planMath";
import { planTasks } from "@/lib/planTimeline";
import {
  atToday,
  clearedPlanFilters,
  planFiltersOn,
  planParams,
  planSubtitle,
  parsePlan,
  monthOf,
  stepped,
  timelineFrom,
  TIMELINE_DAYS,
  type PlanState,
} from "@/lib/planView";
import { isPerson, namesInUse } from "@/lib/people";
import { setTasksDone } from "@/lib/taskWrites";
import type { Task } from "@/lib/types";
import { useCalendarEvents } from "@/lib/useCalendarEvents";
import EmptyState from "@/ui/EmptyState";
import Notice from "@/ui/Notice";
import { useMediaQuery } from "@/ui/useMediaQuery";
import { useToast } from "@/ui/Toaster";
import { useToday } from "@/ui/useToday";
import DayView from "./DayView";
import MonthView from "./MonthView";
import PeopleView from "./PeopleView";
import PlanBar, { SMALL_SCREEN } from "./PlanBar";
import PlanTools from "./PlanTools";
import Timeline from "./Timeline";
import styles from "./Plan.module.css";

const LEAVE_MS = 900; // a task marked done stays in the Day list while it slides away (guide 2.7)

export default function PlanScreen() {
  const pathname = usePathname();
  const search = useSearchParams();
  const today = useToday();
  const toast = useToast();
  const phone = useMediaQuery(SMALL_SCREEN);
  const { status } = useConnection();
  const tasks = useTasks();
  const groups = useTaskGroups();
  const companies = useCompanies();
  const byId = useCompaniesById();

  const parsed = useMemo(() => parsePlan(search), [search]);
  // A task group that's gone (deleted since the link was made) narrows to nothing, so it's let go once groups are known.
  // People opens a person's page only for a person: a placeholder such as "Full Team" shows everyone.
  const groupsKnown = !groups.loading && !groups.error;
  const state: PlanState = useMemo(() => {
    let next = parsed.group && groupsKnown && !groups.rows.some((g) => g.name === parsed.group) ? { ...parsed, group: null } : parsed;
    if (next.view === "people" && next.person && !isPerson(next.person)) next = { ...next, person: null };
    return next;
  }, [parsed, groupsKnown, groups.rows]);
  const from = today ? timelineFrom(state, today) : null;

  // The view is written to the address in place, so Back leaves the screen rather than stepping through filters.
  function update(change: (now: PlanState) => PlanState) {
    const current = new URLSearchParams(window.location.search);
    const query = planParams(change(parsePlan(current)), current).toString();
    window.history.replaceState(null, "", query ? `${pathname}?${query}` : pathname);
  }
  const hrefFor = (next: PlanState) => {
    const query = planParams(next, new URLSearchParams(search.toString())).toString();
    return query ? `${pathname}?${query}` : pathname;
  };

  // The events asked for follow the view: four weeks on the Timeline, the month's weeks for Month and Day (lib/planCalendar).
  const range = today && from ? eventsWindow(state, today, from, TIMELINE_DAYS) : null;
  const events = useCalendarEvents(range?.start ?? null, range?.days ?? TIMELINE_DAYS);

  const waiting = (s: { loading: boolean; fromCache: boolean; rows: unknown[] }) => s.loading || (s.fromCache && s.rows.length === 0 && status === "connecting");
  const tasksFailed = !!tasks.error && tasks.rows.length === 0;
  const offlineEmpty = status === "offline" && tasks.fromCache && tasks.rows.length === 0 && !tasks.error;
  const pending = !today || waiting(tasks) || companies.loading;
  const ready = !pending && !tasksFailed && !offlineEmpty;

  // Open tasks, plus any just marked done that are still on their way out of the Day list.
  const [leaving, setLeaving] = useState<ReadonlySet<string>>(new Set());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const live = timers.current;
    return () => live.forEach(clearTimeout);
  }, []);
  const open = useMemo(() => tasks.rows.filter((t) => !t.completed), [tasks.rows]);
  const listed = useMemo(() => tasks.rows.filter((t) => !t.completed || leaving.has(t.id)), [tasks.rows, leaving]);
  const narrowed = useMemo(() => (ready ? planTasks(listed, state, byId) : []), [ready, listed, state, byId]);

  function stopLeaving(id: string) {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setLeaving((set) => {
      const next = new Set(set);
      next.delete(id);
      return next;
    });
  }

  async function markDone(task: Task) {
    if (task.completed) return;
    setLeaving((set) => new Set(set).add(task.id));
    try {
      const undo = await setTasksDone([task], true);
      timers.current.set(task.id, setTimeout(() => stopLeaving(task.id), LEAVE_MS));
      toast("Marked done", {
        action: "Undo",
        onAction: () => {
          stopLeaving(task.id);
          undo().catch((err) => toast(failureMessage(err, "The change couldn't be undone."), { error: true }));
        },
      });
    } catch (err) {
      stopLeaving(task.id);
      toast(failureMessage(err, "The task couldn't be marked done. Check your connection and try again."), { error: true });
    }
  }

  // The day Day shows. A date in the address wins; without one it lands on today if anything is happening, or else on the
  // next day with something (D5). That is worked out here, so the stepper, Today and the header agree with it.
  const showsTasks = state.show !== "events";
  const eventList = state.show !== "tasks" && events.status === "ok" ? events.events : null;
  const dayTasks = useMemo(() => (showsTasks ? narrowed : []), [showsTasks, narrowed]);
  const landed = useMemo(
    () => (today && ready && state.view === "day" && !state.date ? landing(dayTasks, eventList, today) : null),
    [today, ready, state.view, state.date, dayTasks, eventList]
  );
  // Waiting on the calendar to pick a day matters only when the tasks alone don't settle it.
  const holding = !!today && state.view === "day" && !state.date && state.show !== "tasks" && events.status === "loading" && !somethingOn(dayTasks, null, today);
  const shown: PlanState = state.view === "day" && today && !state.date ? { ...state, date: landed?.date ?? today } : state;
  // A landed day past the events asked for (only tasks ahead of it) gets its own month's events, for the day's lists. The
  // landing itself stays on the first answer, so the day doesn't move again once they arrive.
  const farWindow = landed?.landed && range && state.show !== "tasks" && !windowHas(range, landed.date) ? monthWindow(landed.date.slice(0, 7)) : null;
  const farEvents = useCalendarEvents(farWindow?.start ?? null, farWindow?.days ?? TIMELINE_DAYS);
  const dayEvents = farWindow ? farEvents : events;
  const people = useMemo(
    () => loadPerPerson(open, today ?? undefined).filter((p) => isPerson(p.name)).map((p) => ({ name: p.name, owned: p.owned })).sort((a, b) => a.name.localeCompare(b.name)),
    [open, today]
  );
  // People counts everyone named on a task, narrowed by Work only: a Person in the address is the page that opens.
  const names = useMemo(() => namesInUse(tasks.rows), [tasks.rows]);
  const peopleTasks = useMemo(
    () => (ready && state.view === "people" ? planTasks(listed, { ...state, person: null }, byId) : []),
    [ready, state, listed, byId]
  );
  const groupItems = useMemo(() => groupNavItems(groups.rows, tasks.rows, byId), [groups.rows, tasks.rows, byId]);

  const header = (
    <PageHeader
      title="Plan"
      subtitle={today ? planSubtitle(shown, today) : undefined}
      action={{ label: "New task", href: over(pathname, search, "task=new"), newTask: true }}
    />
  );

  if (tasksFailed) {
    return (
      <>
        {header}
        <div className={styles.screenNote}>
          <Notice tone="error" title="Couldn't load tasks.">
            Check your connection and reload the page.
          </Notice>
        </div>
      </>
    );
  }
  if (offlineEmpty) {
    return (
      <>
        {header}
        <EmptyState icon="wifi" title="No connection">
          The plan will appear once you are back online.
        </EmptyState>
      </>
    );
  }

  const offline = status === "offline";
  const filtersOn = planFiltersOn(state);
  const taskHref = (id: string) => over(pathname, search, `task=${id}`);
  const dayHref = (iso: string) => hrefFor({ ...state, view: "day", date: iso });
  const clearFilters = () => update((now) => clearedPlanFilters(now));

  const tools =
    today && from ? (
      <PlanTools
        state={state}
        today={today}
        groups={groupItems}
        people={people}
        day={shown.date}
        onState={(next) => update(() => next)}
        onStep={(dir) => update((now) => stepped({ ...now, date: now.date ?? shown.date }, dir, today))}
        onToday={() => update((now) => atToday(now, today))}
      />
    ) : null;

  return (
    <>
      {header}
      {companies.error && (
        <div className={styles.screenNote}>
          <Notice tone="warning" title="Couldn't load companies.">
            Tasks for a company may show as internal work until they are back.
          </Notice>
        </div>
      )}
      {groups.error && state.group && (
        <div className={styles.screenNote}>
          <Notice tone="warning" title="Couldn't load task groups.">
            The group filter may not match until they are back.
          </Notice>
        </div>
      )}
      <PlanBar state={state} onState={(next) => update(() => next)} />
      {state.view === "timeline" && today && from ? (
        <Timeline
          state={state}
          from={from}
          today={today}
          tasks={narrowed}
          groupId={state.group ? (groups.rows.find((g) => g.name === state.group)?.id ?? null) : null}
          hasTasks={open.length > 0}
          loading={!ready}
          events={events}
          companies={byId}
          offline={offline}
          tools={tools}
          taskHref={taskHref}
          dayHref={dayHref}
          newTaskHref={over(pathname, search, "task=new")}
          filtersOn={filtersOn}
          onClearFilters={clearFilters}
          onThisWeek={() => update((now) => atToday(now, today))}
        />
      ) : state.view === "month" && today ? (
        <MonthView
          state={state}
          today={today}
          month={monthOf(state, today)}
          tasks={narrowed}
          loading={!ready}
          events={events}
          companies={byId}
          offline={offline}
          phone={phone}
          tools={tools}
          leaving={leaving}
          filtersOn={filtersOn}
          taskHref={taskHref}
          dayHref={dayHref}
          onMonth={(month) => update((now) => ({ ...now, month: month === today.slice(0, 7) ? null : month }))}
          onToggleDone={markDone}
          onClearFilters={clearFilters}
        />
      ) : state.view === "day" && today ? (
        <DayView
          state={state}
          today={today}
          date={shown.date ?? today}
          landed={!!landed?.landed}
          holding={holding}
          tasks={dayTasks}
          loading={!ready}
          events={dayEvents}
          companies={byId}
          offline={offline}
          tools={tools}
          leaving={leaving}
          filtersOn={filtersOn}
          taskHref={taskHref}
          onDate={(date) => update((now) => ({ ...now, date }))}
          onToggleDone={markDone}
          onClearFilters={clearFilters}
        />
      ) : state.view === "people" && today ? (
        <PeopleView
          state={state}
          today={today}
          names={names}
          tasks={peopleTasks}
          loading={!ready}
          tools={tools}
          companies={byId}
          leaving={leaving}
          filtersOn={!!(state.kind || state.group)}
          personHref={(name) => hrefFor({ ...state, view: "people", person: name })}
          viewHref={(view, person) => hrefFor({ ...state, view, person, date: null })}
          taskHref={taskHref}
          onToggleDone={markDone}
          onClearFilters={clearFilters}
        />
      ) : null}
    </>
  );
}
