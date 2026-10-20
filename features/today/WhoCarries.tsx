// Who's carrying what (guide 6.1): the six people who own the most open tasks, each with a load meter, opening their
// Plan page.
import Link from "next/link";
import { PEOPLE_LIMIT, type Carrier } from "@/lib/today";
import { buttonClass } from "@/ui/Button";
import Avatar from "@/ui/Avatar";
import EmptyState from "@/ui/EmptyState";
import { LoadMeter } from "@/ui/Meter";
import Panel, { PanelRows } from "@/ui/Panel";
import { Skeleton } from "@/ui/Skeleton";
import Notice from "@/ui/Notice";
import styles from "./Today.module.css";

interface WhoCarriesProps {
  people: Carrier[] | null; // null while the tasks load
  error: boolean;
}

export default function WhoCarries({ people, error }: WhoCarriesProps) {
  let body;
  if (error) {
    body = (
      <div className={styles.panelNote}>
        <Notice tone="error" title="Couldn't load tasks.">
          Check your connection and reload the page.
        </Notice>
      </div>
    );
  } else if (!people) {
    body = (
      <PanelRows>
        {[1, 2, 3].map((n) => (
          <div key={n} className={styles.who} aria-hidden="true">
            <Skeleton height={34} width={34} />
            <div>
              <Skeleton height={12} width="60%" />
              <span className={styles.gapSm} />
              <Skeleton height={10} width="40%" />
            </div>
            <span />
          </div>
        ))}
      </PanelRows>
    );
  } else if (people.length === 0) {
    body = (
      <EmptyState size="small" icon="team" title="Nobody is assigned yet">
        Name a responsible person on a task and their load shows here.
      </EmptyState>
    );
  } else {
    body = (
      <>
        <PanelRows>
          {people.slice(0, PEOPLE_LIMIT).map((p) => (
            <Link key={p.name} href={`/plan?view=people&person=${encodeURIComponent(p.name)}`} className={styles.who}>
              <Avatar name={p.name} size="plan" />
              <div className={styles.whoText}>
                <p>{p.name}</p>
                <small>
                  Owns {p.owned.toLocaleString("en-GB")}
                  {p.away ? ", out of office today" : `, informed on ${p.informed.toLocaleString("en-GB")}`}
                </small>
              </div>
              <LoadMeter load={p.load} />
            </Link>
          ))}
        </PanelRows>
        {people.length > PEOPLE_LIMIT && (
          <div className={styles.eventsMore}>
            <Link href="/plan?view=people" className={buttonClass("quiet", true)}>
              All {people.length.toLocaleString("en-GB")} people
            </Link>
          </div>
        )}
      </>
    );
  }
  return <Panel title="Who's carrying what">{body}</Panel>;
}
