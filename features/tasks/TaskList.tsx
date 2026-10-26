"use client";

// The list (guide 6.2, 5.7): column heads that sort, then one row per task, 100 at a time. The head and every row share
// one grid, built from the details shown. When the details shown don't fit, the list scrolls sideways inside its own panel
// with the title pinned, as the companies list does. On phones the head goes and each row becomes a card (the Sort menu stays).
// On a group's page the Group column is left out: every task is in it. A subtask sits indented under its parent (N24).
// While selecting several, the done circles become checkboxes, the head's one ticks every row shown, and a row's click
// ticks it rather than opening the task (guide 4.7). Outside selecting, a detail that can be changed in place opens its
// quick editor from its cell (lib/taskCells), on phones' cards too. Each head has a handle on its right edge that drags
// the column wider or narrower, takes the arrow keys, and goes back to its width on a double-click (N26).
import {
  COLUMNS,
  columnLabel,
  columnSort,
  listGrid,
  listMinWidth,
  resetWidth,
  resizeColumn,
  WIDTH_MAX,
  widthMin,
  type ColumnId,
  type ColumnWidths,
  type WidthKey,
} from "@/lib/taskColumns";
import type { CompaniesById } from "@/lib/kinds";
import type { SubtaskCount } from "@/lib/subtasks";
import type { EditableColumn } from "@/lib/taskCells";
import type { SortDir, TaskSortKey, TaskView } from "@/lib/taskQueries";
import type { Task } from "@/lib/types";
import Button from "@/ui/Button";
import type { GroupLook } from "@/ui/GroupBadge";
import Icon from "@/ui/Icon";
import SelectBox from "@/ui/SelectBox";
import { TaskListRow } from "@/ui/TaskRow";
import { useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import styles from "./Tasks.module.css";

const num = (n: number) => n.toLocaleString("en-GB");

interface TaskListProps {
  tasks: Task[]; // what's shown, in order
  hidden: number; // matching tasks beyond them
  pageSize: number;
  columns: ColumnId[];
  widths: ColumnWidths;
  onWidths: (widths: ColumnWidths) => void;
  view: TaskView;
  sort: { key: TaskSortKey; dir: SortDir };
  inGroup: boolean;
  companies: CompaniesById;
  groupLooks: ReadonlyMap<string, GroupLook>;
  today: string;
  leaving: ReadonlySet<string>;
  all: ReadonlyMap<string, Task>; // every task by id, for a subtask's parent
  subtaskCounts: ReadonlyMap<string, SubtaskCount>;
  hrefFor: (id: string) => string;
  onSort: (key: TaskSortKey) => void;
  onToggleDone: (task: Task, done: boolean) => void;
  onMore: () => void;
  onEdit?: (task: Task, column: EditableColumn, anchor: HTMLElement) => void;
  selecting?: { head: boolean | "mixed"; chosen: ReadonlySet<string>; onHead: () => void; onToggle: (id: string) => void };
}

export default function TaskList({ tasks, hidden, pageSize, columns: chosen, widths, onWidths, view, sort, inGroup, companies, groupLooks, today, leaving, all, subtaskCounts, hrefFor, onSort, onToggleDone, onMore, onEdit, selecting }: TaskListProps) {
  const columns = inGroup ? chosen.filter((c) => c !== "group") : chosen;
  const shown = new Set(tasks.map((t) => t.id));
  const tableRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState<ColumnWidths>({}); // the widths last measured, for a handle's value
  const order: WidthKey[] = ["title", ...COLUMNS.filter((c) => columns.includes(c.id)).map((c) => c.id)];
  // Each track's width as drawn now, in the order above (the circle's left out).
  const measure = () => {
    const tracks = getComputedStyle(headRef.current!).gridTemplateColumns.split(" ").map(parseFloat).slice(1);
    setSeen(Object.fromEntries(order.map((k, i) => [k, Math.round(tracks[i])])));
    return tracks;
  };
  const drag = (key: WidthKey) => (e: PointerEvent<HTMLSpanElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const handle = e.currentTarget;
    const table = tableRef.current!;
    const measured = measure();
    const start = measured[order.indexOf(key)];
    const x = e.clientX;
    let next = widths;
    // While dragging, the grid changes straight on the list; the widths are saved when the pointer lets go.
    const move = (ev: globalThis.PointerEvent) => {
      if (ev.clientX === x && next === widths) return;
      next = resizeColumn(widths, order, measured, key, start + ev.clientX - x);
      table.style.setProperty("--list-cols", listGrid(columns, next));
      table.style.setProperty("--minw", `${listMinWidth(columns, next)}px`);
    };
    const end = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("lostpointercapture", end);
      delete handle.dataset.dragging;
      document.documentElement.style.cursor = "";
      if (next !== widths) onWidths(next);
    };
    handle.setPointerCapture(e.pointerId);
    handle.dataset.dragging = "";
    document.documentElement.style.cursor = "col-resize";
    handle.addEventListener("pointermove", move);
    handle.addEventListener("lostpointercapture", end);
  };
  const nudge = (key: WidthKey) => (e: KeyboardEvent) => {
    const step = { ArrowLeft: -10, ArrowRight: 10 }[e.key];
    if (!step) return;
    e.preventDefault();
    const measured = measure();
    onWidths(resizeColumn(widths, order, measured, key, measured[order.indexOf(key)] + step * (e.shiftKey ? 4 : 1)));
  };
  const handle = (key: WidthKey, label: string) => (
    <span
      role="separator"
      aria-orientation="vertical"
      aria-label={`${label} width`}
      aria-valuenow={widths[key] ?? seen[key] ?? widthMin(key)}
      aria-valuemin={widthMin(key)}
      aria-valuemax={WIDTH_MAX}
      tabIndex={0}
      title="Drag to resize, double-click to reset"
      className={styles.resize}
      onPointerDown={drag(key)}
      onKeyDown={nudge(key)}
      onFocus={measure}
      onDoubleClick={() => {
        if (widths[key] === undefined) return;
        setSeen((now) => resetWidth(now, key));
        onWidths(resetWidth(widths, key));
      }}
    />
  );
  const head = (label: string, key: TaskSortKey | undefined) => {
    if (!key) return <span key={label}>{label}</span>;
    const on = sort.key === key;
    return (
      <button key={label} type="button" className={styles.sortHead} aria-current={on || undefined} onClick={() => onSort(key)}>
        {label}
        {on && (
          <>
            <span className="sr-only">, sorted {sort.dir === "asc" ? "ascending" : "descending"}</span>
            <Icon name={sort.dir === "asc" ? "up" : "down"} size={13} />
          </>
        )}
      </button>
    );
  };
  return (
    <>
      <div className={styles.listWrap}>
        <div ref={tableRef} className={styles.listTable} style={{ "--minw": `${listMinWidth(columns, widths)}px`, "--list-cols": listGrid(columns, widths) } as CSSProperties}>
          <div ref={headRef} className={styles.thead}>
            <span className={styles.pinLead}>{selecting && <SelectBox checked={selecting.head} label="Select every task shown" onClick={selecting.onHead} />}</span>
            <span className={styles.pinTitle}>
              {head("Description", "desc")}
              {handle("title", "Description")}
            </span>
            {COLUMNS.filter((c) => columns.includes(c.id)).map((c) => {
              const label = columnLabel(c, view);
              return (
                <span key={c.id} className={styles.headCell}>
                  {head(label, columnSort(c, view))}
                  {handle(c.id, label)}
                </span>
              );
            })}
          </div>
          <div className={styles.rows}>
            {tasks.map((t) => (
              <TaskListRow
                key={t.id}
                task={t}
                companies={companies}
                today={today}
                href={hrefFor(t.id)}
                columns={columns}
                groupLooks={groupLooks}
                inGroup={inGroup}
                leaving={leaving.has(t.id)}
                subtask={{
                  // Listed under its parent (lib/subtasks), it's indented; listed without it, it names it.
                  nested: !!t.parentId && shown.has(t.parentId),
                  parent: t.parentId && !shown.has(t.parentId) ? all.get(t.parentId)?.task : undefined,
                  count: subtaskCounts.get(t.id),
                }}
                onToggleDone={(done) => onToggleDone(t, done)}
                onEdit={onEdit && !selecting ? (column, anchor) => onEdit(t, column, anchor) : undefined}
                selecting={!!selecting}
                selected={selecting?.chosen.has(t.id)}
                onSelect={() => selecting?.onToggle(t.id)}
              />
            ))}
          </div>
        </div>
      </div>
      {hidden > 0 && (
        <div className={styles.more}>
          Showing {num(tasks.length)} of {num(tasks.length + hidden)}
          <Button small onClick={onMore}>
            Show {num(Math.min(pageSize, hidden))} more
          </Button>
        </div>
      )}
    </>
  );
}
