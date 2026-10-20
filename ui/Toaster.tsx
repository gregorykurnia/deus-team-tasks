"use client";

// Toasts (guide 4.14): a dark navy pill at the bottom centre, above the tab bar on phones, with a tick, one line, and an
// optional action. They stack upwards and are gone after 5.2 seconds. An error toast is dark red.
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

export function ToasterProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const show = useCallback<Show>(
    (message, options = {}) => {
      const id = next.current++;
      setToasts((list) => [...list, { id, message, ...options }]);
      timers.current.set(id, setTimeout(() => dismiss(id), options.keep ? KEEP_MS : LIFE_MS));
    },
    [dismiss]
  );

  useEffect(() => {
    const live = timers.current;
    return () => {
      live.forEach(clearTimeout);
      live.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className={styles.toasts} role="status" aria-live="polite">
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
