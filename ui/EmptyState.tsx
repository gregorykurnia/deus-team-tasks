// Empty states (guide 4.15): a large one for a screen with nothing yet, a small one inside a panel.
import type { ReactNode } from "react";
import Icon, { type IconName } from "./Icon";
import styles from "./EmptyState.module.css";

interface EmptyStateProps {
  size?: "large" | "small";
  icon: IconName;
  title: string;
  children?: ReactNode; // what will appear here, and how
  actions?: ReactNode; // up to two
}

export default function EmptyState({ size = "large", icon, title, children, actions }: EmptyStateProps) {
  const small = size === "small";
  return (
    <section className={small ? `${styles.empty} ${styles.small}` : styles.empty}>
      <div className={styles.art}>
        <Icon name={icon} size={small ? 20 : 28} />
      </div>
      <h3 className={styles.title}>{title}</h3>
      {children && <p className={styles.text}>{children}</p>}
      {actions && <div className={styles.actions}>{actions}</div>}
    </section>
  );
}
