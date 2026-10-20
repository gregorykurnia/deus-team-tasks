"use client";

// No connection (A3, guide 5.8): the banner under the page header, and the
// toast when the connection comes back. Task 2.5's Toaster takes over the toast.
import { useEffect, useState } from "react";
import { getConnection, subscribeConnection, useConnection } from "@/lib/connection";
import Icon from "@/ui/Icon";
import styles from "./ConnectionBanner.module.css";

const TOAST_LIFE_MS = 5200; // --toast-life

// "at 09:12", or "on 18 Oct at 09:12" when the data is from an earlier day.
function loadedWhen(loadedAt: number, now = new Date()): string {
  const at = new Date(loadedAt);
  const time = at.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  if (at.toDateString() === now.toDateString()) return `at ${time}`;
  return `on ${at.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} at ${time}`;
}

export function ConnectionBanner() {
  const { online, loadedAt } = useConnection();
  // The status region stays in the page, so the banner is announced when it appears.
  return (
    <div role="status">
      {!online && (
        <div className={styles.banner}>
          <Icon name="wifi" />
          <p>
            <b>No connection.</b>{" "}
            {loadedAt
              ? `You are seeing what was loaded ${loadedWhen(loadedAt)}. Changes can't be saved until you are back online.`
              : "Nothing has loaded yet. Everything will appear once you are back online."}
          </p>
        </div>
      )}
    </div>
  );
}

export function BackOnlineToast() {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    let wasOffline = !getConnection().online;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = subscribeConnection(() => {
      clearTimeout(timer);
      if (!getConnection().online) {
        wasOffline = true;
        setShown(false);
      } else if (wasOffline) {
        wasOffline = false;
        setShown(true);
        timer = setTimeout(() => setShown(false), TOAST_LIFE_MS);
      }
    });
    return () => {
      unsubscribe();
      clearTimeout(timer);
    };
  }, []);

  return (
    <div className={styles.toasts} role="status">
      {shown && (
        <div className={styles.toast}>
          <Icon name="check" />
          Back online. Everything is up to date.
        </div>
      )}
    </div>
  );
}
