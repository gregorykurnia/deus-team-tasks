"use client";

// No connection (A3, guide 5.8): the banner under the page header, and the
// toast when the connection comes back.
import { useEffect } from "react";
import { getConnection, subscribeConnection, useConnection } from "@/lib/connection";
import Icon from "@/ui/Icon";
import { useToast } from "@/ui/Toaster";
import styles from "./ConnectionBanner.module.css";

// "at 09:12", or "on 18 Oct at 09:12" when the data is from an earlier day.
function loadedWhen(loadedAt: number, now = new Date()): string {
  const at = new Date(loadedAt);
  const time = at.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  if (at.toDateString() === now.toDateString()) return `at ${time}`;
  return `on ${at.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} at ${time}`;
}

export function ConnectionBanner() {
  const { status, loadedAt } = useConnection();
  // The status region stays in the page, so the banner is announced when it appears.
  return (
    <div role="status">
      {status === "offline" && (
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

// When the connection comes back, a toast says so (guide 5.8).
export function BackOnlineToast() {
  const toast = useToast();

  useEffect(() => {
    // Connecting at the start isn't being offline: only a real offline spell gets the toast.
    let wasOffline = getConnection().status === "offline";
    return subscribeConnection(() => {
      const { status } = getConnection();
      if (status === "offline") wasOffline = true;
      else if (status === "live" && wasOffline) {
        wasOffline = false;
        toast("Back online. Everything is up to date.");
      }
    });
  }, [toast]);

  return null;
}
