// Empty states (guide 4.15): a large one for a screen with nothing yet, a small one inside a panel.
import type { ReactNode } from "react";
import Icon, { type IconName } from "./Icon";
import styles from "./EmptyState.module.css";

interface EmptyStateProps {
  size?: "large" | "small";
  headingLevel?: 2 | 3; // Override when a large message belongs under a panel/document heading.
  icon: IconName;
  title: string;
  children?: ReactNode; // what will appear here, and how
  actions?: ReactNode; // up to two
}

export default function EmptyState({ size = "large", headingLevel = size === "small" ? 3 : 2, icon, title, children, actions }: EmptyStateProps) {
  const small = size === "small";
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <section className={small ? `${styles.empty} ${styles.small}` : styles.empty}>
      <div className={styles.art}>
        <Icon name={icon} size={small ? 20 : 28} />
      </div>
      <Heading className={styles.title}>{title}</Heading>
      {children && <p className={styles.text}>{children}</p>}
      {actions && <div className={styles.actions}>{actions}</div>}
    </section>
  );
}
