"use client";

// The live status at the foot of the side bar and in More (guide 3, 5.8).
import { useConnection } from "@/lib/connection";
import styles from "./LiveDot.module.css";

export default function LiveDot() {
  const { online } = useConnection();
  return (
    <div className={styles.live} role="status">
      <span className={online ? styles.dot : `${styles.dot} ${styles.off}`} aria-hidden="true" />
      {online ? "Live, everyone's up to date" : "Offline. Changes can't be saved."}
    </div>
  );
}
