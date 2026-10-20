// Tags (guide 4.4): the kind of work, the company group, outside tags, the live tag, read only and sector.
import type { ReactNode } from "react";
import type { Kind } from "@/lib/kinds";
import Icon, { type IconName } from "./Icon";
import { KIND_TOKEN } from "./kindStyle";
import styles from "./Tag.module.css";

const KIND_TAGS: Record<Kind, string> = { prospect: "Prospect work", client: "Client work", internal: "Internal" };

export function KindTag({ kind }: { kind: Kind }) {
  return <span className={`${styles.tag} ${styles[KIND_TOKEN[kind]]}`}>{KIND_TAGS[kind]}</span>;
}

export type GroupTone = "toApproach" | "active" | "dealDone" | "noOrNotNow";
const GROUP_ICONS: Record<GroupTone, IconName> = { toApproach: "flag", active: "bolt", dealDone: "done", noOrNotNow: "pause" };

export function GroupTag({ group, children }: { group: GroupTone; children: ReactNode }) {
  return (
    <span className={`${styles.gtag} ${styles[group]}`}>
      <Icon name={GROUP_ICONS[group]} size={14} />
      {children}
    </span>
  );
}

// Connected but not part of it: dashed, no fill.
export function OutsideTag({ children }: { children: ReactNode }) {
  return <span className={styles.outside}>{children}</span>;
}

export function LiveTag({ children = "Just changed" }: { children?: ReactNode }) {
  return (
    <span className={styles.live}>
      <span className={styles.dot} aria-hidden="true" />
      {children}
    </span>
  );
}

export function ReadOnlyTag({ children = "Read only" }: { children?: ReactNode }) {
  return (
    <span className={styles.readOnly}>
      <Icon name="lock" size={13} />
      {children}
    </span>
  );
}

export function SectorTag({ children }: { children: ReactNode }) {
  return <span className={styles.sector}>{children}</span>;
}
