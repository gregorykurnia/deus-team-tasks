"use client";

import Link from "next/link";
import { Fragment, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { AwayDay } from "@/lib/leave";
import { awayName, awayPeriods } from "@/lib/planAway";
import styles from "./Plan.module.css";

const MONTH_PREVIEW_NAMES = 3;

function Names({ days, labels }: { days: readonly AwayDay[]; labels: string[] }) {
  return days.map((day, i) => (
    <Fragment key={`${day.name}/${i}`}>
      {i > 0 && ", "}
      <span data-waiting={day.waiting} title={day.part === "morning" || day.part === "afternoon" ? day.part : undefined}>{labels[i]}</span>
    </Fragment>
  ));
}

export function MonthAway({ days, dateLabel, href }: { days: AwayDay[]; dateLabel: string; href: string }) {
  const labels = useMemo(() => days.map((day) => awayName(day, true)), [days]);
  const probe = useRef<HTMLSpanElement>(null);
  const [{ count, separateLabel }, setPreview] = useState({ count: 0, separateLabel: false });

  useLayoutEffect(() => {
    const node = probe.current!;
    let current = true;
    const measure = () => {
      if (!current) return;
      const maxHeight = Math.ceil(parseFloat(getComputedStyle(node).lineHeight) * 2);
      const fits = (text: string) => {
        node.textContent = text;
        return node.scrollHeight <= maxHeight && node.scrollWidth <= node.clientWidth;
      };
      let shown = 0;
      for (; shown < Math.min(labels.length, MONTH_PREVIEW_NAMES); shown++) {
        if (!fits(`Away:\u00a0${labels.slice(0, shown + 1).join(", ")}`)) break;
      }
      // Give a long first name both lines when the label would take up part of one.
      const separateLabel = shown === 0 && labels.length > 0 && fits(labels[0]);
      const count = separateLabel ? 1 : shown;
      node.textContent = "";
      setPreview((previous) => previous.count === count && previous.separateLabel === separateLabel ? previous : { count, separateLabel });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    void document.fonts.ready.then(measure);
    return () => { current = false; observer.disconnect(); };
  }, [labels]);

  const more = days.length - count;
  return (
    <div className={styles.monthAway}>
      <div className={styles.awayMonthNames} data-away-preview="">
        <span className={separateLabel ? styles.awayLabel : undefined}>Away:</span>
        {count > 0 && <>{separateLabel ? " " : "\u00a0"}<Names days={days.slice(0, count)} labels={labels} /></>}
        <span ref={probe} className={styles.awayMeasure} aria-hidden="true" />
      </div>
      {more > 0 && (
        <Link className={styles.awayMore} href={href} aria-label={`+${more} more away on ${dateLabel}, open the day`}>+{more} more</Link>
      )}
    </div>
  );
}

export function DayAway({ days, today }: { days: AwayDay[]; today: boolean }) {
  return (
    <p className={styles.dayAway} data-away-day="">
      <strong>{today ? "Away today:" : "Away:"}</strong>{" "}<Names days={days} labels={days.map((day) => awayName(day))} />
    </p>
  );
}

export function PersonAway({ days, today }: { days: AwayDay[]; today: string }) {
  return (
    <div className={styles.personAway}>
      {awayPeriods(days, today).map(({ label, waiting }) => <span key={label} data-waiting={waiting}>{label}</span>)}
    </div>
  );
}
