// The hero (guide 4.10, 6.1): the day in a sentence, where to start, count chips and the open tasks by kind on the left,
// and the two-week chart in an inner card on the right.
import Link from "next/link";
import { KIND_LABELS, KINDS } from "@/lib/kinds";
import type { Hero as HeroModel, TwoWeeks } from "@/lib/today";
import type { EventsState } from "@/lib/useCalendarEvents";
import Notice from "@/ui/Notice";
import { Skeleton } from "@/ui/Skeleton";
import { KIND_TOKEN } from "@/ui/kindStyle";
import QuickCapture from "./QuickCapture";
import TwoWeekChart from "./TwoWeekChart";
import styles from "./Today.module.css";

interface HeroProps {
  hero: HeroModel | null; // null while the tasks load
  weeks: TwoWeeks | null;
  events: EventsState;
  error: boolean;
  onAdd: (text: string) => Promise<boolean>;
}

export default function Hero({ hero, weeks, events, error, onAdd }: HeroProps) {
  if (error) {
    return (
      <section className={styles.hero} aria-label="Today at a glance">
        <div className={styles.heroNote}>
          <Notice tone="error" title="Couldn't load tasks.">
            Check your connection and reload the page.
          </Notice>
        </div>
      </section>
    );
  }
  if (!hero || !weeks) {
    return (
      <section className={styles.hero} aria-label="Today at a glance" aria-busy="true">
        <div className={styles.heroText}>
          <Skeleton height={26} width="80%" />
          <span className={styles.gapSm} />
          <Skeleton height={26} width="55%" />
          <span className={styles.gapMd} />
          <Skeleton height={14} width="70%" />
          <div className={styles.chips}>
            <Skeleton height={36} width={110} />
            <Skeleton height={36} width={130} />
          </div>
        </div>
        <div className={styles.weeks}>
          <Skeleton height={16} width="40%" />
          <span className={styles.gapMd} />
          <Skeleton height={120} />
        </div>
      </section>
    );
  }
  return (
    <section className={styles.hero} aria-label="Today at a glance">
      <div className={styles.heroText}>
        <h2>{hero.headline}</h2>
        <p>{hero.lede}</p>
        {hero.empty ? (
          <div className={styles.heroCapture}>
            <QuickCapture id="capture-hero" label="Add the first task" onAdd={onAdd} />
          </div>
        ) : (
          <>
            <div className={styles.chips}>
              {hero.chips.map((c) => (
                <Link key={c.key} href={c.href} className={styles.chip} data-tone={c.tone}>
                  <i>{c.count.toLocaleString("en-GB")}</i>
                  {c.label}
                </Link>
              ))}
            </div>
            <div className={styles.kinds} role="group" aria-label="Open tasks by kind of work">
              {KINDS.map((k) => (
                <span key={k}>
                  <i style={{ background: `var(--${KIND_TOKEN[k]})` }} />
                  {KIND_LABELS[k]} <b>{hero.kinds[k].toLocaleString("en-GB")}</b>
                </span>
              ))}
            </div>
          </>
        )}
      </div>
      <TwoWeekChart weeks={weeks} events={events} />
    </section>
  );
}
