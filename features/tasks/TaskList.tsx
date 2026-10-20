"use client";

// The list (guide 6.2, 5.7): column heads that sort, then one row per task, 100 at a time. The head and every row share
// one grid, built from the details shown. On phones the head goes and each row becomes a card (the Sort menu stays).
import { COLUMNS, columnLabel, listGrid, type ColumnId } from "@/lib/taskColumns";
import type { CompaniesById } from "@/lib/kinds";
import type { SortDir, TaskSortKey } from "@/lib/taskQueries";
import type { Task } from "@/lib/types";
import Button from "@/ui/Button";
import type { GroupLook } from "@/ui/GroupBadge";
import Icon from "@/ui/Icon";
import { TaskListRow } from "@/ui/TaskRow";
import type { CSSProperties } from "react";
import styles from "./Tasks.module.css";

const num = (n: number) => n.toLocaleString("en-GB");

interface TaskListProps {
  tasks: Task[]; // what's shown, in order
  hidden: number; // matching tasks beyond them
  pageSize: number;
  columns: ColumnId[];
  finished: boolean;
  sort: { key: TaskSortKey; dir: SortDir };
  inGroup: boolean;
  companies: CompaniesById;
  groupLooks: ReadonlyMap<string, GroupLook>;
  today: string;
  leaving: ReadonlySet<string>;
  hrefFor: (id: string) => string;
  onSort: (key: TaskSortKey) => void;
  onToggleDone: (task: Task, done: boolean) => void;
  onMore: () => void;
}

export default function TaskList({ tasks, hidden, pageSize, columns, finished, sort, inGroup, companies, groupLooks, today, leaving, hrefFor, onSort, onToggleDone, onMore }: TaskListProps) {
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
      <div className={styles.thead} style={{ "--cols": listGrid(columns) } as CSSProperties}>
        <span />
        {head("Description", "desc")}
        {COLUMNS.filter((c) => columns.includes(c.id)).map((c) => head(columnLabel(c, finished), c.id === "end" && finished ? "doneAt" : c.sort))}
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
            onToggleDone={(done) => onToggleDone(t, done)}
          />
        ))}
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
