"use client";

// The live status at the foot of the side bar and in More (guide 3, 5.8).
import { useConnection, type ConnectionStatus } from "@/lib/connection";
import styles from "./LiveDot.module.css";

const DOT: Record<ConnectionStatus, string> = {
  live: styles.dot,
  connecting: `${styles.dot} ${styles.waiting}`,
  offline: `${styles.dot} ${styles.off}`,
};

const LABEL: Record<ConnectionStatus, string> = {
  live: "Live, everyone's up to date",
  connecting: "Connecting…", // provisional until the studio answers N4
  offline: "Offline. Changes can't be saved.",
};

export default function LiveDot() {
  const { status } = useConnection();
  return (
    <div className={styles.live} role="status">
      <span className={DOT[status]} aria-hidden="true" />
      {LABEL[status]}
    </div>
  );
}
