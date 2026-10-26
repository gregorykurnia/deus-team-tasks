"use client";

// The task row family (guide 4.6): a done circle, the title, then urgency and people, tinted by the kind of work.
// The whole row opens the task through its title; the done circle is its own button above it. While selecting several,
// a click anywhere on the row toggles its checkbox instead (guide 4.7). What a row says comes from taskRowModel, so every
// variant agrees: Card (Today), List (All tasks), Day (Plan's Day view, a person's page), Record (a company).
import Link from "next/link";
import type { CSSProperties, MouseEvent, ReactNode } from "react";
import { shortDate } from "@/lib/dates";
import { isTagged, useArrival } from "@/lib/liveChanges";
import type { CompaniesById } from "@/lib/kinds";
import { COLUMNS, columnLabel, DEFAULT_COLUMNS, listGrid, type ColumnId } from "@/lib/taskColumns";
import { countLabel, type SubtaskCount } from "@/lib/subtasks";
import { taskRowModel, type RowModel } from "@/lib/taskRow";
import { STATUS_LABELS, taskStatus } from "@/lib/taskStatus";
import type { Task } from "@/lib/types";
import type { Tone } from "@/lib/urgency";
import Avatar from "./Avatar";
import AvatarStack from "./AvatarStack";
import DoneCircle from "./DoneCircle";
import Icon from "./Icon";
import OptionChip from "./OptionChip";
import { kindStyle } from "./kindStyle";
import Pill, { type PillTone } from "./Pill";
import SelectBox from "./SelectBox";
import GroupBadge, { type GroupLook } from "./GroupBadge";
import { LiveTag, NameTag } from "./Tag";
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
  // Left out, the row reads the live changes itself: your change glows, a colleague's glows and says "Just changed".
  // Set, it decides for itself (the gallery).
  justChanged?: boolean;
  arrive?: boolean; // the arrive glow alone
}

// What a row shows of the live changes (guide 5.8): its own entry only, so only the row that changed draws again.
function useArrivalProps<P extends RowProps>(props: P): P {
  const arrival = useArrival("tasks", props.justChanged === undefined ? props.task.id : null);
  if (props.justChanged !== undefined) return props;
  return { ...props, justChanged: isTagged(arrival), arrive: arrival !== "none" };
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

// "In Progress", first in the line under the title wherever the task shows.
function InProgress() {
  return (
    <span className={styles.status}>
      <OptionChip tone="blue">{STATUS_LABELS.inProgress}</OptionChip>
    </span>
  );
}

// In Progress, company or group, touch point, "High priority", the last action in its tone, "Just changed".
function Meta({ row, justChanged, only }: { row: RowModel; justChanged?: boolean; only?: "place" }) {
  const bits = [
    row.inProgress && <InProgress key="status" />,
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
function rowProps(row: RowModel, { selected, leaving, justChanged, arrive, selecting, onSelect }: RowProps) {
  return {
    "data-kind": row.kind,
    "data-done": row.done || undefined,
    "data-selected": selected || undefined,
    "data-leaving": leaving || undefined,
    "data-new": justChanged || arrive || undefined,
    "data-selecting": selecting || undefined,
    style: kindStyle(row.kind),
    onClick(e: MouseEvent<HTMLElement>) {
      if (!(e.target instanceof Element) || e.target.closest("a, button, input")) return;
      if (selecting) onSelect?.();
      else e.currentTarget.querySelector<HTMLAnchorElement>("a[data-row-link]")?.click();
    },
  };
}

export function TaskCard(input: RowProps) {
  const props = useArrivalProps(input);
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

interface ListRowProps extends RowProps {
  columns?: ColumnId[]; // the details shown, in the catalogue's order
  groupLooks?: ReadonlyMap<string, GroupLook>; // for a group's badge in the Group column
  inGroup?: boolean; // on a group's own page every task is in it, so it is not repeated
  subtask?: SubtaskLine;
}

// Subtasks on the list (lib/subtasks): a subtask under its parent is indented, one listed without it names it, and a
// parent counts its subtasks done.
export interface SubtaskLine {
  nested?: boolean;
  parent?: string; // the parent's description
  count?: SubtaskCount;
}

// One of the chosen details. Empty ones say so with a dash, and drop out of the phone's card.
function ListCell({ id, task, row, groupLooks, today }: { id: ColumnId; task: Task; row: RowModel; groupLooks?: ReadonlyMap<string, GroupLook>; today: string }) {
  const column = COLUMNS.find((c) => c.id === id)!;
  let content: ReactNode = null;
  let wrap = false;
  switch (id) {
    case "company":
      content = row.badge.kind === "company" ? <NameTag kind={row.kind}>{row.place}</NameTag> : <NameTag kind="internal">Internal</NameTag>;
      break;
    case "group": {
      const look = task.taskGroup ? groupLooks?.get(task.taskGroup) : undefined;
      content = task.taskGroup && (
        <span className={styles.group}>
          {look && <GroupBadge {...look} />}
          <span className={styles.groupName}>{task.taskGroup}</span>
        </span>
      );
      break;
    }
    case "status": {
      const status = taskStatus(task);
      content = status === "inProgress" ? <InProgress /> : STATUS_LABELS[status];
      break;
    }
    case "type":
      content = task.taskType;
      break;
    case "touch":
      content = task.touchPoint;
      break;
    case "prio":
      content = task.priority && <span className={task.priority === "High" ? styles.red : undefined}>{task.priority}</span>;
      break;
    case "start":
      content = task.startDate && shortDate(task.startDate, today);
      break;
    case "end":
      content = <DeadlinePill row={row} />;
      break;
    case "last": {
      const last = row.lastAction;
      // Under the "Last action" head, "Last action 9 days ago" says it twice: the words that follow are enough.
      const words = last?.label.replace(/^Last action /, "");
      content = last && words && (
        <span className={TONE_CLASS[last.tone]} title={last.label}>
          {words.charAt(0).toUpperCase() + words.slice(1)}
        </span>
      );
      break;
    }
    case "resp":
      content = task.responsible.length > 0 && (
        <span className={styles.who}>
          <AvatarStack responsible={task.responsible} />
          {task.responsible.length === 1 && <span className={styles.whoName}>{task.responsible[0].split(" ")[0]}</span>}
        </span>
      );
      break;
    case "inf":
      content = task.informed.map((p) => p.name.split(" ")[0] + (p.note ? ` (${p.note})` : "")).join(", ");
      wrap = true;
      break;
    case "key":
      content = task.keyPoints;
      wrap = true;
      break;
  }
  const empty = !content;
  const classes = [styles.cell, id === "end" && styles.deadline, wrap && styles.wrap, empty && styles.emptyCell, id === "resp" && styles.lift].filter(Boolean);
  const label = columnLabel(column, row.done ? "done" : row.parked ? "parked" : "open");
  return (
    <span className={classes.join(" ")} data-col={id}>
      {/* "No action for 15 days" already names the detail: "Last action No action for 15 days" would say it twice. */}
      <span className={id === "last" && row.lastAction?.tone === "red" ? "sr-only" : styles.label}>{label}</span>
      {empty ? (
        <>
          <span aria-hidden="true" className={styles.none}>
            –
          </span>
          <span className="sr-only">None</span>
        </>
      ) : (
        content
      )}
    </span>
  );
}

export function TaskListRow(input: ListRowProps) {
  const props = useArrivalProps(input);
  const { task, columns = DEFAULT_COLUMNS, groupLooks, inGroup, today, subtask } = props;
  const row = taskRowModel(task, props.companies, today);
  const company = row.badge.kind === "company" ? row.place : null;
  // What a hidden detail would have said goes under the title, so hiding a column never hides the task's state.
  const meta = [
    row.inProgress && !columns.includes("status") && <InProgress key="status" />,
    subtask?.parent && (
      <span key="parent" className={styles.place}>
        Subtask of {subtask.parent}
      </span>
    ),
    subtask?.count && (
      <span key="subtasks" className={styles.subCount}>
        <Icon name="tree" size={13} />
        {countLabel(subtask.count)}
      </span>
    ),
    !columns.includes("company") && company && (
      <span key="company" className={styles.place}>
        {company}
      </span>
    ),
    !columns.includes("group") && !inGroup && task.taskGroup && (
      <span key="group" className={styles.place}>
        {task.taskGroup}
      </span>
    ),
    !columns.includes("end") && !row.done && row.deadline.tone !== "plain" && <span key="deadline">{row.deadline.label}</span>,
    props.justChanged && <LiveTag key="live" />,
  ].filter(Boolean);
  return (
    <article {...rowProps(row, props)} data-sub={subtask?.nested || undefined} className={`${styles.row} ${styles.list}`} style={{ ...kindStyle(row.kind), "--cols": listGrid(columns) } as CSSProperties}>
      <Lead {...props} row={row} />
      <div className={styles.main}>
        <Title task={task} href={props.href} selecting={props.selecting} />
        {meta.length > 0 && <p className={styles.meta}>{meta}</p>}
      </div>
      {COLUMNS.filter((c) => columns.includes(c.id)).map((c) => (
        <ListCell key={c.id} id={c.id} task={task} row={row} groupLooks={groupLooks} today={today} />
      ))}
    </article>
  );
}

interface DayRowProps extends RowProps {
  person?: string; // on a person's page: the person being looked at
}

export function TaskDayRow(input: DayRowProps) {
  const props = useArrivalProps(input);
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

export function TaskRecordRow(input: RowProps) {
  const props = useArrivalProps(input);
  const row = taskRowModel(props.task, props.companies, props.today);
  return (
    <article {...rowProps(row, props)} className={`${styles.row} ${styles.record}`}>
      <Lead {...props} row={row} />
      <div className={styles.main}>
        <Title task={props.task} href={props.href} selecting={props.selecting} />
        {row.inProgress && (
          <p className={styles.meta}>
            <InProgress />
          </p>
        )}
      </div>
      <DeadlinePill row={row} />
    </article>
  );
}
