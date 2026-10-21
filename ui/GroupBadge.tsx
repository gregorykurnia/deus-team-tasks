// A task group's badge (guide 3, 6.2): its initials on one of six hues, handed out in the order groups were made.
// Small in lists and the side bar, large in a group's header, round on the phone's group chips.
import type { CSSProperties } from "react";
import styles from "./GroupBadge.module.css";

export interface GroupLook {
  badge: string; // initials
  hue: number; // 0 to 5
}

interface GroupBadgeProps extends GroupLook {
  size?: "small" | "large" | "round";
}

export default function GroupBadge({ badge, hue, size = "small" }: GroupBadgeProps) {
  const style = { "--badge-bg": `var(--grp-${hue}-bg)`, "--badge-ink": `color-mix(in srgb, var(--grp-${hue}) 80%, #000)` } as CSSProperties;
  return (
    <span className={`${styles.badge} ${styles[size]}`} style={style} aria-hidden="true">
      {badge}
    </span>
  );
}
