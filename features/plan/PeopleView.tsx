"use client";

// Plan's People view (guide 4.12, 6.4): everyone ranked by what they own, each with an owned and informed bar, a two-week
// sparkline of their deadlines and their next one; and one person's page with figures, "Responsible for" and "Kept
// informed on". Names come from tasks, so people aren't accounts. Every bar and figure has words, so nothing depends on
// colour. Marking a task done from a person's page is the only write.
import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { plural } from "@/lib/dates";
import type { CompaniesById } from "@/lib/kinds";
import { byDeadline, nextDueLabel, personLine, personRows, rankLine, searchPeople, SEARCH_FROM, sparkHeight, widestLoad, workWords, type PersonRow } from "@/lib/planPeople";
import type { PlanState } from "@/lib/planView";
import { isOpen } from "@/lib/taskQueries";
import type { Task } from "@/lib/types";
import Avatar from "@/ui/Avatar";
import { buttonClass } from "@/ui/Button";
import EmptyState from "@/ui/EmptyState";
import Icon from "@/ui/Icon";
import { SearchField } from "@/ui/Inputs";
import Panel, { PanelRows } from "@/ui/Panel";
import { LoadingLine, Skeleton } from "@/ui/Skeleton";
import { TaskDayRow } from "@/ui/TaskRow";
import styles from "./Plan.module.css";

interface PeopleViewProps {
  state: PlanState;
  today: string;
  names: string[]; // everyone named on any task, A to Z
  tasks: Task[]; // open tasks narrowed by Work (plus any just marked done, on their way out)
  loading: boolean;
  tools: ReactNode;
  companies: CompaniesById;
  leaving: ReadonlySet<string>;
  filtersOn: boolean; // Work is on
  personHref: (name: string | null) => string;
  viewHref: (view: "timeline" | "day", person: string) => string;
  taskHref: (id: string) => string;
  onToggleDone: (task: Task, done: boolean) => void;
  onClearFilters: () => void;
}

export default function PeopleView(props: PeopleViewProps) {
  const { state, today, names, tasks, loading } = props;
  const rows = useMemo(() => personRows(names, tasks.filter((t) => isOpen(t, today) || props.leaving.has(t.id)), today), [names, tasks, props.leaving, today]);
  if (state.person) {
    const row = rows.find((r) => r.name === state.person) ?? personRows([state.person], [], today)[0];
    return <PersonPage {...props} row={row} loading={loading} />;
  }
  return <Ranking {...props} rows={rows} />;
}

function Ranking({ rows, loading, tools, personHref, filtersOn, onClearFilters, state, today }: PeopleViewProps & { rows: PersonRow[] }) {
  const [query, setQuery] = useState("");
  const shown = searchPeople(rows, query);
  const widest = widestLoad(shown);
  const work = workWords(state);

  let body: ReactNode;
  if (loading) {
    body = (
      <>
        <LoadingLine>Loading tasks</LoadingLine>
        {[1, 2, 3, 4, 5].map((n) => (
          <div key={n} className={styles.pRow} aria-hidden="true">
            <Skeleton height={34} width={34} />
            <div>
              <Skeleton height={12} width="40%" />
              <span className={styles.gap} />
              <Skeleton height={10} width="25%" />
            </div>
            <span />
          </div>
        ))}
      </>
    );
  } else if (rows.length === 0) {
    body = (
      <EmptyState size="small" icon="people" title="Nobody is named on a task yet">
        Name a responsible person on a task and their load shows here. People aren&apos;t accounts: names come from tasks.
      </EmptyState>
    );
  } else if (shown.length === 0) {
    body = (
      <EmptyState size="small" icon="search" title={`Nobody matches “${query.trim()}”`}>
        Try part of a first or last name.
      </EmptyState>
    );
  } else {
    body = (
      <>
        <div className={styles.pHeadRow} aria-hidden="true">
          <span />
          <span>Person</span>
          <span>Owned and informed</span>
          <span>Deadlines, next two weeks</span>
          <span>Next</span>
        </div>
        {shown.map((row) => {
          const most = Math.max(2, ...row.perDay);
          return (
            <Link key={row.name} href={personHref(row.name)} className={styles.pRow} data-person={row.name}>
              <Avatar name={row.name} size="plan" />
              <div className={styles.pName}>
                <p>{row.name}</p>
                <small>
                  {rankLine(row)}
                  {row.overdue > 0 && <span className={styles.toneRed}>, {row.overdue.toLocaleString("en-US")} overdue</span>}
                </small>
              </div>
              <span className={styles.pBar} role="img" aria-label={`Owns ${row.owned.length}, kept informed on ${row.informed.length}`}>
                {row.owned.length > 0 && <i data-part="owned" style={{ width: `${(row.owned.length / widest) * 100}%` }} />}
                {row.informed.length > 0 && <i data-part="informed" style={{ width: `${(row.informed.length / widest) * 100}%` }} />}
              </span>
              <span className={styles.pSpark} role="img" aria-label={`${plural(row.perDay.reduce((a, b) => a + b, 0), "deadline")} in the next two weeks`}>
                {row.perDay.map((count, i) => (
                  <i key={i} data-today={i === 0 || undefined} data-quiet={!count || undefined} style={{ height: sparkHeight(count, most) }} />
                ))}
              </span>
              <span className={styles.pNext}>{row.next ? <>Next due <b>{nextDueLabel(row.next, today)}</b></> : <span className={styles.pNoNext}>No deadlines</span>}</span>
            </Link>
          );
        })}
        <p className={styles.pHelp}>Owned is solid, kept informed is outlined. Names come from tasks; people aren&apos;t accounts.</p>
      </>
    );
  }

  return (
    <section className={styles.panel} aria-label="People">
      {tools}
      <div className={styles.pHead}>
        <h2>Everyone</h2>
        {!loading && <span className={styles.pCount}>{rows.length.toLocaleString("en-GB")}</span>}
        <span className={styles.spacer} />
        {rows.length >= SEARCH_FROM && <SearchField className={styles.pSearch} label="Find a person" placeholder="Find a person" value={query} onChange={setQuery} />}
      </div>
      {work && filtersOn && !loading && (
        <p className={styles.pScope}>
          Counting {work} only.{" "}
          <button type="button" className={styles.pLink} onClick={onClearFilters}>
            Clear filter
          </button>
        </p>
      )}
      {body}
    </section>
  );
}

function PersonPage(props: PeopleViewProps & { row: PersonRow }) {
  const { row, state, today, loading } = props;
  const scope = workWords(state);
  const first = row.name.split(" ")[0];
  const none = !row.owned.length && !row.informed.length;

  const head = (
    <section className={styles.person} aria-label={row.name}>
      <Avatar name={row.name} size="page" />
      <div className={styles.personMain}>
        <h2>{row.name}</h2>
        <p>{loading ? "Loading tasks" : personLine(row, scope)}</p>
        <div className={styles.personActs}>
          <Link href={props.viewHref("timeline", row.name)} className={buttonClass("secondary", true)}>
            <Icon name="cal" size={16} />
            On the timeline
          </Link>
          <Link href={props.viewHref("day", row.name)} className={buttonClass("secondary", true)}>
            <Icon name="sun" size={16} />
            Their day
          </Link>
          <Link href={props.personHref(null)} className={buttonClass("quiet", true)}>
            <Icon name="left" size={16} />
            Everyone
          </Link>
        </div>
      </div>
      <div className={styles.figures}>
        <Figure value={loading ? null : row.owned.length} label="Owned" />
        <Figure value={loading ? null : row.informed.length} label="Kept informed" />
        <Figure value={loading ? null : row.soon} label="Due in 2 weeks" tone={!loading && row.soon >= 4 ? "amber" : undefined} />
        <Figure value={loading ? null : row.overdue} label="Overdue" tone={!loading && row.overdue ? "red" : undefined} />
      </div>
    </section>
  );

  if (loading) {
    return (
      <>
        {head}
        <section className={styles.panel} aria-label="Loading tasks">
          <LoadingLine>Loading tasks</LoadingLine>
        </section>
      </>
    );
  }
  if (none) {
    return (
      <>
        {head}
        <section className={styles.panel} aria-label={`Nothing open for ${row.name}`}>
          <EmptyState
            icon="people"
            title={`Nothing open for ${row.name}`}
            actions={
              <>
                <Link href={props.personHref(null)} className={buttonClass("secondary", true)}>
                  <Icon name="left" size={16} />
                  Everyone
                </Link>
                {props.filtersOn && (
                  <button type="button" className={buttonClass("secondary", true)} onClick={props.onClearFilters}>
                    Clear filter
                  </button>
                )}
              </>
            }
          >
            {`${first} isn't responsible for any open task${scope ? ` of this kind` : ""} and isn't kept informed on any. Name them on a task to give them work.`}
          </EmptyState>
        </section>
      </>
    );
  }

  const list = (tasks: Task[], empty: string) =>
    tasks.length ? (
      <PanelRows>
        {byDeadline(tasks).map((t) => (
          <TaskDayRow
            key={t.id}
            task={t}
            companies={props.companies}
            today={today}
            href={props.taskHref(t.id)}
            person={row.name}
            leaving={props.leaving.has(t.id)}
            onToggleDone={(done) => props.onToggleDone(t, done)}
          />
        ))}
      </PanelRows>
    ) : (
      <EmptyState size="small" icon="done" title={empty} />
    );

  return (
    <>
      {head}
      <div className={styles.personBoard}>
        <Panel title="Responsible for" count={row.owned.length}>
          {list(row.owned, "Not responsible for any open task")}
        </Panel>
        <Panel title="Kept informed on" count={row.informed.length}>
          {list(row.informed, "Not kept informed on any open task")}
        </Panel>
      </div>
    </>
  );
}

// A figure, or its skeleton while the tasks load (null).
function Figure({ value, label, tone }: { value: number | null; label: string; tone?: "amber" | "red" }) {
  return (
    <div className={styles.figure} data-tone={tone}>
      <b>{value === null ? <Skeleton height={28} width={36} /> : value.toLocaleString("en-GB")}</b>
      <span>{label}</span>
    </div>
  );
}
