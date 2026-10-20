"use client";

// The flows A to Z (guide 6.8, M4), with a search that covers names, descriptions, steps, outcomes, roles and people. Each
// has a badge with its step count, the name, "5 steps · a decision" and when it was last edited.
import Link from "next/link";
import { flowEdited, flowName, flowSummary } from "@/lib/flows";
import { plural } from "@/lib/dates";
import type { Flow } from "@/lib/types";
import EmptyState from "@/ui/EmptyState";
import Icon from "@/ui/Icon";
import { SearchField } from "@/ui/Inputs";
import styles from "./Flows.module.css";

interface FlowsListProps {
  all: number;
  shown: Flow[];
  query: string;
  current: string | null;
  today: string;
  hrefFor: (id: string) => string;
  replace: boolean; // large screens swap the open flow; phones step into it
  onQuery: (q: string) => void;
  onPick: () => void;
}

export default function FlowsList({ all, shown, query, current, today, hrefFor, replace, onQuery, onPick }: FlowsListProps) {
  const q = query.trim();
  return (
    <section className={styles.panel} aria-label="Flows">
      <div className={styles.find}>
        <SearchField label="Find a flow" value={query} onChange={onQuery} placeholder="Find a flow, a step or a person" className={styles.search} />
      </div>
      {q ? (
        <p className={styles.result} role="status">
          <b>{shown.length.toLocaleString("en-US")}</b> of {plural(all, "flow")} mention “{q}”
          <button type="button" className={styles.linkButton} onClick={() => onQuery("")}>
            Clear
          </button>
        </p>
      ) : (
        <p className={styles.result}>
          <b>{plural(all, "flow")}</b>, A to Z
        </p>
      )}
      {shown.length ? (
        <div className={styles.list}>
          {shown.map((f) => {
            const edited = flowEdited(f.updatedAt, today);
            return (
              <Link key={f.id} href={hrefFor(f.id)} replace={replace} scroll={false} className={styles.item} aria-current={current === f.id ? "true" : undefined} onClick={onPick}>
                <span className={styles.badge} aria-hidden="true">
                  {f.steps.length ? <b>{f.steps.length.toLocaleString("en-US")}</b> : <Icon name="flow" size={18} />}
                </span>
                <span className={styles.itemMain}>
                  <span className={styles.itemName}>{flowName(f)}</span>
                  <span className={styles.itemSub}>
                    <span>{flowSummary(f)}</span>
                    {edited && <span>{edited}</span>}
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
      ) : (
        <EmptyState size="small" icon="search" title={`No flow mentions “${q}”`}>
          This looks at names, descriptions, steps, outcomes, roles and people.
        </EmptyState>
      )}
    </section>
  );
}
