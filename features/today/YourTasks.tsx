"use client";

// Your tasks (N36, provisional): for the signed-in person only, above the hero. Their tasks that are overdue or due in
// the next three days, five at most, and a link to all of theirs on Plan › People. Built from the guide's parts (Panel,
// TaskCard, Notice); copy rule 2 allows "your" for the signed-in person since N33.
import Link from "next/link";
import type { CompaniesById } from "@/lib/kinds";
import type { Yours } from "@/lib/today";
import { buttonClass } from "@/ui/Button";
import Notice from "@/ui/Notice";
import Panel, { PanelRows } from "@/ui/Panel";
import { SkeletonRow } from "@/ui/Skeleton";
import { TaskCard } from "@/ui/TaskRow";
import styles from "./Today.module.css";

interface YourTasksProps {
  name: string;
  yours: Yours | null; // null while the tasks load
  companies: CompaniesById;
  today: string;
  leaving: ReadonlySet<string>;
  onDone: (id: string) => void;
}

export default function YourTasks({ name, yours, companies, today, leaving, onDone }: YourTasksProps) {
  const href = `/plan?view=people&person=${encodeURIComponent(name)}`;
  let body;
  if (!yours) {
    body = (
      <PanelRows>
        {[1, 2].map((n) => (
          <SkeletonRow key={n} />
        ))}
      </PanelRows>
    );
  } else if (yours.shown.length === 0) {
    body = (
      <div className={styles.calmNotice}>
        <Notice tone="success">
          {yours.open === 0 ? "You have no open tasks." : "Nothing of yours is overdue or due in the next three days."}
        </Notice>
      </div>
    );
  } else {
    body = (
      <>
        <p className={styles.yoursSummary}>{yours.summary}</p>
        <PanelRows>
          {yours.shown.map((t) => (
            <TaskCard
              key={t.id}
              task={t}
              companies={companies}
              today={today}
              href={`/?task=${t.id}`}
              onToggleDone={() => onDone(t.id)}
              leaving={leaving.has(t.id)}
            />
          ))}
        </PanelRows>
      </>
    );
  }

  return (
    <div className={styles.yours}>
      <Panel
        title="Your tasks"
        count={yours?.open}
        foot={
          yours && yours.open > 0 ? (
            <Link href={href} className={buttonClass("quiet", true)}>
              See all your tasks
            </Link>
          ) : undefined
        }
      >
        {body}
      </Panel>
    </div>
  );
}
