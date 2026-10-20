"use client";

// Needs attention (guide 6.1): the kind switch with counts, quick capture, then Overdue, Due in the next 3 days, Under
// way today and Needs a date, six each at most. A task just marked done stays in its place while it leaves.
import Link from "next/link";
import type { CompaniesById, Kind } from "@/lib/kinds";
import { plural } from "@/lib/dates";
import type { Attention, SectionKey } from "@/lib/today";
import { buttonClass } from "@/ui/Button";
import EmptyState from "@/ui/EmptyState";
import Notice from "@/ui/Notice";
import Panel, { PanelRows } from "@/ui/Panel";
import Segmented from "@/ui/Segmented";
import { useMediaQuery } from "@/ui/useMediaQuery";
import { LoadingLine, SkeletonRow } from "@/ui/Skeleton";
import { TaskCard } from "@/ui/TaskRow";
import QuickCapture from "./QuickCapture";
import styles from "./Today.module.css";

export type KindChoice = Kind | "all";

const DOTS: Record<SectionKey, string> = {
  overdue: "var(--red)",
  soon: "var(--amber)",
  active: "var(--blue)",
  nodate: "var(--faint)",
};

const NAMES: Record<Kind, { noun: string; for: string; team: string }> = {
  prospect: { noun: "prospect", for: "for prospects", team: "prospects" },
  client: { noun: "client", for: "for clients", team: "existing clients" },
  internal: { noun: "internal", for: "internal", team: "the team" },
};

interface NeedsAttentionProps {
  pending: boolean; // the tasks (or the companies that tell their kind) haven't arrived
  error: boolean;
  attention: Attention | null;
  kind: KindChoice;
  onKind: (kind: KindChoice) => void;
  openCount: number; // every open task, for the foot
  companies: CompaniesById;
  today: string;
  leaving: ReadonlySet<string>;
  onDone: (id: string) => void;
  onAdd: (text: string) => Promise<boolean>;
}

export default function NeedsAttention({ pending, error, attention, kind, onKind, openCount, companies, today, leaving, onDone, onAdd }: NeedsAttentionProps) {
  const phone = useMediaQuery("(max-width: 640px)");
  const ready = !pending && !error && attention;
  const count = (k: KindChoice) => (ready ? attention.counts[k] : undefined);
  const kindQuery = kind === "all" ? "" : `&kind=${kind}`;

  const tools = (
    <div className={styles.kindSwitch}>
      <Segmented<KindChoice>
        label="Kind of work"
        full={phone}
        value={kind}
        onChange={(v) => v && onKind(v)}
        options={[
          { value: "all", label: "All", count: count("all") },
          { value: "prospect", label: "Prospects", count: count("prospect") },
          { value: "client", label: "Clients", count: count("client") },
          { value: "internal", label: "Internal", count: count("internal") },
        ]}
      />
    </div>
  );

  let body;
  if (error) {
    body = (
      <div className={styles.panelNote}>
        <Notice tone="error" title="Couldn't load tasks.">
          Check your connection and reload the page.
        </Notice>
      </div>
    );
  } else if (pending || !attention) {
    body = (
      <>
        <LoadingLine>Loading tasks</LoadingLine>
        <PanelRows>
          {[1, 2, 3, 4].map((n) => (
            <SkeletonRow key={n} />
          ))}
        </PanelRows>
      </>
    );
  } else if (attention.none) {
    body =
      kind === "all" || openCount === 0 ? (
        <EmptyState size="small" icon="sun" title="A clear day">
          Tasks that are overdue, due soon or under way show up here, grouped by how urgent they are.
        </EmptyState>
      ) : (
        <EmptyState
          size="small"
          icon="done"
          title={`No ${NAMES[kind].noun} work needs attention`}
          actions={
            <Link href={`/tasks?kind=${kind}`} className={buttonClass("secondary", true)}>
              See all {NAMES[kind].noun} tasks
            </Link>
          }
        >
          Nothing for {NAMES[kind].team} is overdue, due soon, under way or missing a date.
        </EmptyState>
      );
  } else {
    body = (
      <>
        {attention.calm && (
          <div className={styles.calmNotice}>
            <Notice tone="success">
              Nothing {kind === "all" ? "" : `${NAMES[kind].for} `}is overdue or due in the next three days.
            </Notice>
          </div>
        )}
        {attention.sections.map((s) => (
          <div key={s.key}>
            <h3 className={styles.groupLabel}>
              <i style={{ background: DOTS[s.key] }} />
              {s.label}
              <span className={styles.groupCount}>{s.count.toLocaleString("en-GB")}</span>
              {s.hidden > 0 && (
                <Link className={styles.more} href={`/tasks?due=${s.key}${kindQuery}`}>
                  See all {s.count.toLocaleString("en-GB")}
                </Link>
              )}
            </h3>
            <PanelRows>
              {s.shown.map((t) => (
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
          </div>
        ))}
      </>
    );
  }

  return (
    <Panel
      title="Needs attention"
      tools={tools}
      foot={
        ready && openCount > 0 ? (
          <Link href="/tasks" className={buttonClass("quiet", true)}>
            All {plural(openCount, "open task")}
          </Link>
        ) : undefined
      }
    >
      {ready && <QuickCapture id="capture" label="New task" onAdd={onAdd} />}
      {body}
    </Panel>
  );
}
