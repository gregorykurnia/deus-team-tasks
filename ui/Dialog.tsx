"use client";

// Dialogs and confirmations (guide 4.11). A dialog is centred, 440px (560px wide). A confirmation is an
// alertdialog: a question as its title, what happens, Cancel focused first, and a red button named for the action.
import { useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Button from "./Button";
import Scrim from "./Scrim";
import { useIsClient } from "./useIsClient";
import { useOverlay } from "./useOverlay";
import styles from "./Dialog.module.css";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  wide?: boolean; // 560px
  alert?: boolean; // role alertdialog, for confirmations
  quote?: string; // a name in a grey box, three lines at most
  initialFocus?: string | string[];
  actions?: ReactNode; // right-aligned
  busy?: boolean; // while its action runs, Esc and the scrim don't close it
  children?: ReactNode;
}

export default function Dialog(props: DialogProps) {
  const client = useIsClient();
  if (!props.open || !client) return null;
  return createPortal(<DialogPanel {...props} />, document.body);
}

function DialogPanel({ onClose, title, wide, alert, quote, initialFocus, actions, busy, children }: DialogProps) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const textId = useId();
  const close = () => {
    if (!busy) onClose();
  };
  const { overSheet } = useOverlay({ kind: "dialog", onClose: close, panel, initialFocus });
  const classes = [styles.dialog, wide && styles.wide, overSheet && styles.overSheet].filter(Boolean).join(" ");

  return (
    <>
      <Scrim onClick={close} over={overSheet} />
      <div
        ref={panel}
        className={classes}
        role={alert ? "alertdialog" : "dialog"}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={children ? textId : undefined}
        tabIndex={-1}
      >
        <h2 id={titleId} className={styles.title}>
          {title}
        </h2>
        {quote && <p className={styles.quote}>{quote}</p>}
        {children && (
          <div id={textId} className={styles.text}>
            {children}
          </div>
        )}
        {actions && <div className={styles.actions}>{actions}</div>}
      </div>
    </>
  );
}

interface ConfirmProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string; // a question: "Delete this task?"
  confirmLabel: string; // named for the action: "Delete task"
  busyLabel?: string;
  busy?: boolean;
  quote?: string;
  children?: ReactNode; // what happens
}

export function Confirm({ open, onClose, onConfirm, title, confirmLabel, busyLabel, busy, quote, children }: ConfirmProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      quote={quote}
      alert
      busy={busy}
      initialFocus="[data-cancel]"
      actions={
        <>
          {/* Closing mid-action would hide an action that carries on: Cancel waits too. */}
          <Button data-cancel onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger" busy={busy} busyLabel={busyLabel} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
    </Dialog>
  );
}
