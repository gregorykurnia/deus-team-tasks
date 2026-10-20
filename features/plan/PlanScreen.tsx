"use client";

// Plan (guide 6.4): the coming weeks as a timeline (opens first), a month, one day, and who carries what. The view lives in
// the address, so a link from Today lands on the right day and a reload keeps it. This step builds the bar, the filters,
// the stepper and the Timeline; Month, Day and People follow (3.6, 3.7) and say so until they do. Every source loads on
// its own: tasks can show while the team calendar is still loading, and the reverse.
import { usePathname, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { over } from "@/desk/areas";
import { useCompanies, useCompaniesById, useTaskGroups, useTasks } from "@/desk/DeskData";
import PageHeader from "@/desk/PageHeader";
import { useConnection } from "@/lib/connection";
import { groupNavItems } from "@/lib/deskNav";
import { loadPerPerson } from "@/lib/planMath";
import { planTasks } from "@/lib/planTimeline";
import {
  atToday,
  clearedPlanFilters,
  planFiltersOn,
  planParams,
  planSubtitle,
  parsePlan,
  stepped,
  timelineFrom,
  TIMELINE_DAYS,
  type PlanState,
} from "@/lib/planView";
import { isPerson } from "@/lib/people";
import { useCalendarEvents } from "@/lib/useCalendarEvents";
import EmptyState from "@/ui/EmptyState";
import Notice from "@/ui/Notice";
import { useToday } from "@/ui/useToday";
import PlanBar from "./PlanBar";
import PlanTools from "./PlanTools";
import Timeline from "./Timeline";
import styles from "./Plan.module.css";

export default function PlanScreen() {
  const pathname = usePathname();
  const search = useSearchParams();
  const today = useToday();
  const { status } = useConnection();
  const tasks = useTasks();
  const groups = useTaskGroups();
  const companies = useCompanies();
  const byId = useCompaniesById();

  const parsed = useMemo(() => parsePlan(search), [search]);
  // A task group that's gone (deleted since the link was made) narrows to nothing, so it's let go once groups are known.
  const groupsKnown = !groups.loading && !groups.error;
  const state: PlanState = useMemo(
    () => (parsed.group && groupsKnown && !groups.rows.some((g) => g.name === parsed.group) ? { ...parsed, group: null } : parsed),
    [parsed, groupsKnown, groups.rows]
  );
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

  const events = useCalendarEvents(from, TIMELINE_DAYS);

  const waiting = (s: { loading: boolean; fromCache: boolean; rows: unknown[] }) => s.loading || (s.fromCache && s.rows.length === 0 && status === "connecting");
  const tasksFailed = !!tasks.error && tasks.rows.length === 0;
  const offlineEmpty = status === "offline" && tasks.fromCache && tasks.rows.length === 0 && !tasks.error;
  const pending = !today || waiting(tasks) || companies.loading;
  const ready = !pending && !tasksFailed && !offlineEmpty;

  const open = useMemo(() => tasks.rows.filter((t) => !t.completed), [tasks.rows]);
  const narrowed = useMemo(() => (ready ? planTasks(open, state, byId) : []), [ready, open, state, byId]);
  const people = useMemo(
    () => loadPerPerson(open, today ?? undefined).filter((p) => isPerson(p.name)).map((p) => ({ name: p.name, owned: p.owned })).sort((a, b) => a.name.localeCompare(b.name)),
    [open, today]
  );
  const groupItems = useMemo(() => groupNavItems(groups.rows, tasks.rows, byId), [groups.rows, tasks.rows, byId]);

  const header = (
    <PageHeader
      title="Plan"
      subtitle={today ? planSubtitle(state, today) : undefined}
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

  const tools =
    today && from ? (
      <PlanTools
        state={state}
        today={today}
        groups={groupItems}
        people={people}
        onState={(next) => update(() => next)}
        onStep={(dir) => update((now) => stepped(now, dir, today))}
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
          hasTasks={open.length > 0}
          loading={!ready}
          events={events}
          companies={byId}
          offline={status === "offline"}
          tools={tools}
          taskHref={(id) => over(pathname, search, `task=${id}`)}
          dayHref={(iso) => hrefFor({ ...state, view: "day", date: iso })}
          newTaskHref={over(pathname, search, "task=new")}
          filtersOn={planFiltersOn(state)}
          onClearFilters={() => update((now) => clearedPlanFilters(now))}
          onThisWeek={() => update((now) => atToday(now, today))}
        />
      ) : (
        <section className={styles.panel} aria-label={state.view === "timeline" ? "Timeline" : state.view}>
          {tools}
          {today && (
            <div className={styles.note}>
              <div>
                <Notice tone="info" title={`${{ timeline: "Timeline", month: "Month", day: "Day", people: "People" }[state.view]} isn't built yet.`}>
                  It arrives in the next step of the rebuild. The Timeline works now.
                </Notice>
              </div>
            </div>
          )}
        </section>
      )}
    </>
  );
}
