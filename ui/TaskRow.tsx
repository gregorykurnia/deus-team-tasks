"use client";

// The task row family (guide 4.6): a done circle, the title, then urgency and people, tinted by the kind of work.
// The whole row opens the task through its title; the done circle is its own button above it. While selecting several,
// a click anywhere on the row toggles its checkbox instead (guide 4.7). What a row says comes from taskRowModel, so every
// variant agrees: Card (Today), List (All tasks), Day (Plan's Day view, a person's page), Record (a company).
import Link from "next/link";
import type { MouseEvent } from "react";
import type { CompaniesById } from "@/lib/kinds";
import { taskRowModel, type RowModel } from "@/lib/taskRow";
import type { Task } from "@/lib/types";
import type { Tone } from "@/lib/urgency";
import Avatar from "./Avatar";
import AvatarStack from "./AvatarStack";
import DoneCircle from "./DoneCircle";
import Icon from "./Icon";
import { kindStyle } from "./kindStyle";
import Pill, { type PillTone } from "./Pill";
import SelectBox from "./SelectBox";
import { LiveTag } from "./Tag";
import styles from "./TaskRow.module.css";

interface RowProps {
  task: Task;
  companies: CompaniesById;
  today: string; // from useToday: the browser's date, so the server (in UTC) never renders a different one
  href: string; // opens the task, such as "?task=abc"
  onToggleDone?: (done: boolean) => void; // what the task becomes: true when marked done, false when marked not done
  selecting?: boolean; // shows a checkbox in place of the done circle
  selected?: boolean;
  onSelect?: () => void;
  leaving?: boolean; // a task just marked done, on its way out of an open list
  justChanged?: boolean; // a colleague's change: the arrive glow and "Just changed"
}

const PILL_TONES: Record<RowModel["deadline"]["tone"], PillTone> = { red: "red", amber: "amber", plain: "calm", none: "none", done: "done" };
const TONE_CLASS: Record<Tone, string | undefined> = { plain: undefined, amber: styles.amber, red: styles.red };

// The pill sits above the row's link, so its full date shows on hover (guide 4.4); a click on it still opens the task.
function DeadlinePill({ row }: { row: RowModel }) {
  const { tone, label } = row.deadline;
  return (
    <span className={`${styles.lift} ${styles.pillBox}`}>
      <Pill tone={PILL_TONES[tone]} icon={tone === "red" ? "alert" : undefined} title={row.deadlineTitle}>
        {label}
      </Pill>
    </span>
  );
}

function Lead({ task, row, selecting, selected, onToggleDone, onSelect }: RowProps & { row: RowModel }) {
  return (
    <span className={styles.lead}>
      {selecting ? (
        <SelectBox checked={!!selected} label={`Select: ${task.task}`} onClick={onSelect} />
      ) : (
        <DoneCircle kind={row.kind} done={row.done} title={task.task} onClick={() => onToggleDone?.(!row.done)} />
      )}
    </span>
  );
}

// While selecting, the title is plain text: the row's click toggles the checkbox rather than opening the task.
function Title({ task, href, selecting }: { task: Task; href: string; selecting?: boolean }) {
  return (
    <p className={styles.title}>
      {selecting ? (
        task.task
      ) : (
        <Link href={href} className={styles.open} data-row-link>
          {task.task}
        </Link>
      )}
    </p>
  );
}

// Company or group, touch point, "High priority", the last action in its tone, "Just changed".
function Meta({ row, justChanged, only }: { row: RowModel; justChanged?: boolean; only?: "place" }) {
  const bits = [
    row.place && (
      <span key="place" className={styles.place}>
        {row.place}
      </span>
    ),
    !only && row.touchPoint && <span key="touch">{row.touchPoint}</span>,
    !only && row.highPriority && <span key="prio">High priority</span>,
    !only && row.lastAction && (
      <span key="last" className={TONE_CLASS[row.lastAction.tone]}>
        {row.lastAction.label}
      </span>
    ),
    justChanged && <LiveTag key="live" />,
  ].filter(Boolean);
  return bits.length ? <p className={styles.meta}>{bits}</p> : null;
}

// The attributes every variant carries: the state hooks the stylesheet reads, the kind's colours, and the row's click.
// A click that lands on the row but not on a control (the pill or the people, which sit above the title's link) opens the
// task as the link would; while selecting, it toggles the checkbox.
function rowProps(row: RowModel, { selected, leaving, justChanged, selecting, onSelect }: RowProps) {
  return {
    "data-kind": row.kind,
    "data-done": row.done || undefined,
    "data-selected": selected || undefined,
    "data-leaving": leaving || undefined,
    "data-new": justChanged || undefined,
    "data-selecting": selecting || undefined,
    style: kindStyle(row.kind),
    onClick(e: MouseEvent<HTMLElement>) {
      if (!(e.target instanceof Element) || e.target.closest("a, button, input")) return;
      if (selecting) onSelect?.();
      else e.currentTarget.querySelector<HTMLAnchorElement>("a[data-row-link]")?.click();
    },
  };
}

export function TaskCard(props: RowProps) {
  const row = taskRowModel(props.task, props.companies, props.today);
  return (
    <article {...rowProps(row, props)} className={`${styles.row} ${styles.card}`}>
      <Lead {...props} row={row} />
      <span className={styles.badge} aria-hidden="true">
        {row.badge.kind === "company" ? row.badge.initials : <Icon name="team" size={19} />}
      </span>
      <div className={styles.main}>
        <Title task={props.task} href={props.href} selecting={props.selecting} />
        <Meta row={row} justChanged={props.justChanged} />
      </div>
      <div className={`${styles.right} ${styles.lift}`}>
        <DeadlinePill row={row} />
        <AvatarStack responsible={props.task.responsible} informed={props.task.informed} />
      </div>
    </article>
  );
}

export function TaskListRow(props: RowProps) {
  const row = taskRowModel(props.task, props.companies, props.today);
  return (
    <article {...rowProps(row, props)} className={`${styles.row} ${styles.list}`}>
      <Lead {...props} row={row} />
      <div className={styles.main}>
        <Title task={props.task} href={props.href} selecting={props.selecting} />
        {/* The details have their own cells: only the live tag goes under the title. */}
        {props.justChanged && (
          <p className={styles.meta}>
            <LiveTag />
          </p>
        )}
      </div>
      <span className={`${styles.cell} ${styles.about}`}>
        <span className={styles.label}>About</span>
        {row.place ?? <span className={styles.none}>–</span>}
      </span>
      <span className={`${styles.cell} ${styles.deadline}`}>
        <DeadlinePill row={row} />
      </span>
      <span className={`${styles.cell} ${styles.people} ${styles.lift}`}>
        <AvatarStack responsible={props.task.responsible} informed={props.task.informed} />
      </span>
    </article>
  );
}

interface DayRowProps extends RowProps {
  person?: string; // on a person's page: the person being looked at
}

export function TaskDayRow(props: DayRowProps) {
  const { task, person } = props;
  const row = taskRowModel(task, props.companies, props.today);
  const informedNote = person ? task.informed.find((p) => p.name === person) : undefined;
  return (
    <article {...rowProps(row, props)} className={`${styles.row} ${styles.day}`}>
      <Lead {...props} row={row} />
      <div className={styles.dayMain}>
        <div className={styles.dayTop}>
          <div className={styles.dayTitle}>
            <Title task={task} href={props.href} selecting={props.selecting} />
            <Meta row={row} justChanged={props.justChanged} />
          </div>
          <DeadlinePill row={row} />
        </div>
        {informedNote && (
          <p className={styles.theirPart}>
            <Icon name="info" size={15} />
            {informedNote.note ? (
              <>
                Their part: <b>{informedNote.note}</b>
              </>
            ) : (
              "Kept informed, with no note on their part"
            )}
          </p>
        )}
        <div className={styles.line}>
          <span className={styles.lineLabel}>Responsible</span>
          <span className={styles.who}>
            {task.responsible.length ? (
              task.responsible.map((name) => (
                <span key={name} className={name === person ? `${styles.person} ${styles.me}` : styles.person}>
                  <Avatar name={name} size="chip" className={styles.tiny} />
                  <span>{name}</span>
                </span>
              ))
            ) : (
              <span className={styles.none}>Nobody yet</span>
            )}
          </span>
        </div>
        {task.informed.length > 0 && (
          <div className={styles.line}>
            <span className={styles.lineLabel}>Informed</span>
            <span className={styles.informed}>
              {task.informed.map((p) => (
                <span key={p.name} className={p.name === person ? styles.me : undefined}>
                  {p.name}
                  {p.note && <em>{p.note}</em>}
                </span>
              ))}
            </span>
          </div>
        )}
        {task.keyPoints && <p className={styles.key}>{task.keyPoints}</p>}
      </div>
    </article>
  );
}

export function TaskRecordRow(props: RowProps) {
  const row = taskRowModel(props.task, props.companies, props.today);
  return (
    <article {...rowProps(row, props)} className={`${styles.row} ${styles.record}`}>
      <Lead {...props} row={row} />
      <div className={styles.main}>
        <Title task={props.task} href={props.href} selecting={props.selecting} />
      </div>
      <DeadlinePill row={row} />
    </article>
  );
}
