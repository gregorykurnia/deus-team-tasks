"use client";

// Toasts (guide 4.14): a dark navy pill at the bottom centre, above the tab bar on phones, with a tick, one line, and an
// optional action. They stack upwards and are gone after 5.2 seconds. An error toast is dark red. The time stops while
// the pointer is over them or focus is inside them, so an action can still be reached (WCAG 2.2.1).
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import Icon from "./Icon";
import styles from "./Toaster.module.css";

const LIFE_MS = 5200; // --toast-life
const KEEP_MS = 600_000;

export interface ToastOptions {
  action?: string; // "Undo", "Open", "Try again"
  onAction?: () => void;
  error?: boolean;
  keep?: boolean; // stays until dismissed
}

interface Toast extends ToastOptions {
  id: number;
  message: string;
}

type Show = (message: string, options?: ToastOptions) => void;

const ToastContext = createContext<Show | null>(null);

interface Timer {
  left: number; // ms still to show
  since: number; // when the clock last started
  handle: ReturnType<typeof setTimeout> | null; // null while paused
}

export function ToasterProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(1);
  const timers = useRef(new Map<number, Timer>());
  const holds = useRef({ hover: false, focus: false });

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer?.handle) clearTimeout(timer.handle);
    timers.current.delete(id);
    // The last one gone from under the pointer may never get its pointer leave: nothing is held any more.
    if (timers.current.size === 0) holds.current = { hover: false, focus: false };
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const start = useCallback(
    (id: number, timer: Timer) => {
      timer.since = Date.now();
      timer.handle = setTimeout(() => dismiss(id), timer.left);
    },
    [dismiss]
  );

  const show = useCallback<Show>(
    (message, options = {}) => {
      const id = next.current++;
      setToasts((list) => [...list, { id, message, ...options }]);
      const timer: Timer = { left: options.keep ? KEEP_MS : LIFE_MS, since: 0, handle: null };
      timers.current.set(id, timer);
      if (!holds.current.hover && !holds.current.focus) start(id, timer);
    },
    [start]
  );

  // Stops every toast's clock while held, and starts them again with the time they had left.
  const hold = useCallback(
    (why: "hover" | "focus", on: boolean) => {
      const wasHeld = holds.current.hover || holds.current.focus;
      holds.current[why] = on;
      const held = holds.current.hover || holds.current.focus;
      if (held === wasHeld) return;
      timers.current.forEach((timer, id) => {
        if (held && timer.handle) {
          clearTimeout(timer.handle);
          timer.handle = null;
          timer.left = Math.max(0, timer.left - (Date.now() - timer.since));
        } else if (!held && !timer.handle) start(id, timer);
      });
    },
    [start]
  );

  useEffect(() => {
    const live = timers.current;
    return () => {
      live.forEach((timer) => timer.handle && clearTimeout(timer.handle));
      live.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div
        className={styles.toasts}
        role="status"
        aria-live="polite"
        onPointerEnter={() => hold("hover", true)}
        onPointerLeave={() => hold("hover", false)}
        onFocus={() => hold("focus", true)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) hold("focus", false);
        }}
      >
        {toasts.map((t) => (
          <div key={t.id} className={[styles.toast, t.error && styles.error, !t.action && styles.solo].filter(Boolean).join(" ")}>
            <Icon name={t.error ? "alert" : "done"} />
            <span className={styles.message}>{t.message}</span>
            {t.action && (
              <button
                type="button"
                className={styles.action}
                onClick={() => {
                  t.onAction?.();
                  dismiss(t.id);
                }}
              >
                {t.action}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): Show {
  const show = useContext(ToastContext);
  if (!show) throw new Error("useToast needs a ToasterProvider above it.");
  return show;
}
