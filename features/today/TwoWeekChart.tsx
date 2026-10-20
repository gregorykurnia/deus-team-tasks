// The two-week chart (guide 4.12): 14 columns of stacked bars, one per day, each opening Plan on that day. Prospects,
// clients and internal work stack from the bottom, then events at 60% height. Every column has its words, so the chart
// never depends on colour or height.
import Link from "next/link";
import { segmentShares, type TwoWeeks } from "@/lib/today";
import type { EventsState } from "@/lib/useCalendarEvents";
import styles from "./Today.module.css";

export default function TwoWeekChart({ weeks, events }: { weeks: TwoWeeks; events: EventsState }) {
  const { days, max, callout } = weeks;
  return (
    <div className={styles.weeks}>
      <div className={styles.weeksHead}>
        <h3>Next two weeks</h3>
        <span className={callout.calm ? `${styles.callout} ${styles.calm}` : styles.callout}>{callout.text}</span>
      </div>
      <div className={styles.chart}>
        {days.map((d) => (
          <Link
            key={d.iso}
            href={`/plan?view=day&date=${d.iso}`}
            className={styles.column}
            data-today={d.today || undefined}
            data-weekend={d.weekend || undefined}
            title={d.summary}
            aria-label={d.summary}
          >
            {segmentShares(d, max).map((s) => (
              <i key={s.kind} data-segment={s.kind} style={{ height: `${s.share * 100}%` }} />
            ))}
          </Link>
        ))}
      </div>
      <div className={styles.dayNumbers} aria-hidden="true">
        {days.map((d) => (
          <span key={d.iso} data-today={d.today || undefined}>
            {d.today ? (
              <>
                <span className={styles.todayWord}>Today</span>
                <span className={styles.todayNumber}>{Number(d.iso.slice(8))}</span>
              </>
            ) : (
              Number(d.iso.slice(8))
            )}
          </span>
        ))}
      </div>
      <div className={styles.legend}>
        <span>
          <i style={{ background: "var(--pro-chart)" }} />
          Prospects
        </span>
        <span>
          <i style={{ background: "var(--cli-chart)" }} />
          Clients
        </span>
        <span>
          <i style={{ background: "var(--int-chart)" }} />
          Internal
        </span>
        {events.status === "ok" ? (
          <span>
            <i style={{ background: "var(--event-chart)" }} />
            Calendar events
          </span>
        ) : (
          <span className={styles.legendMuted}>{events.status === "loading" ? "Loading calendar events" : "Calendar events unavailable"}</span>
        )}
      </div>
    </div>
  );
}
