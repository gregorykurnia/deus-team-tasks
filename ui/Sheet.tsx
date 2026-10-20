"use client";

// Sheets (guide 4.11): a drawer 16px in from the right on large screens, a bottom sheet with a grab handle on
// phones. A head with the title, a tag and a close button; a scrolling body; an optional foot.
import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Button from "./Button";
import Icon from "./Icon";
import Scrim from "./Scrim";
import { useIsClient } from "./useIsClient";
import { LARGE_SCREEN, useMediaQuery } from "./useMediaQuery";
import { useOverlay } from "./useOverlay";
import styles from "./Sheet.module.css";

export type SheetSize = "default" | "wide" | "narrow"; // 540px, the company record's 620px, the install sheet's 460px

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  tag?: ReactNode; // a kind or group tag beside the title
  size?: SheetSize;
  short?: boolean; // fits its content: quick capture, More, Install
  phoneOnly?: boolean; // only exists at 900px and under
  footer?: ReactNode;
  initialFocus?: string | string[]; // selectors for what gets focus; the first control by default
  children: ReactNode;
}

export default function Sheet(props: SheetProps) {
  const client = useIsClient();
  const large = useMediaQuery(LARGE_SCREEN);
  // A phone-only sheet left open on a large screen (opened, then the window widened or turned, or its
  // address opened on a computer) closes, so it can't lock the page or hold focus while hidden.
  const hidden = !!props.phoneOnly && large;
  const { open, onClose } = props;
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  useEffect(() => {
    if (open && hidden) closeRef.current();
  }, [open, hidden]);
  if (!open || !client || hidden) return null;
  return createPortal(<SheetPanel {...props} />, document.body);
}

// Pushes the footer's actions apart: the destructive one on the left, the others on the right.
export function SheetSpacer() {
  return <span className={styles.spacer} />;
}

function SheetPanel({ onClose, title, tag, size = "default", short, phoneOnly, footer, initialFocus, children }: SheetProps) {
  const panel = useRef<HTMLElement>(null);
  const titleId = useId();
  useOverlay({ kind: "sheet", onClose, panel, initialFocus });
  const classes = [styles.sheet, styles[size], short && styles.short, phoneOnly && styles.phoneOnly].filter(Boolean).join(" ");

  return (
    <>
      <Scrim onClick={onClose} phoneOnly={phoneOnly} />
      <section ref={panel} className={classes} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <span className={styles.grab} aria-hidden="true" />
        <div className={styles.head}>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          {tag}
          <span className={styles.spacer} />
          <Button variant="icon" aria-label="Close" onClick={onClose}>
            <Icon name="x" />
          </Button>
        </div>
        <div className={styles.body}>{children}</div>
        {footer && <div className={styles.foot}>{footer}</div>}
      </section>
    </>
  );
}
