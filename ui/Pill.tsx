// Deadline pills (guide 4.4). The tone is shown by the words too, so colour is never the only signal.
import Icon, { type IconName } from "./Icon";
import styles from "./Pill.module.css";

export type PillTone = "red" | "amber" | "calm" | "none" | "done";

interface PillProps {
  tone: PillTone;
  icon?: IconName;
  title?: string; // the full date, shown on hover
  children: string;
}

export default function Pill({ tone, icon, title, children }: PillProps) {
  return (
    <span className={`${styles.pill} ${styles[tone]}`} title={title}>
      {icon && <Icon name={icon} size={13} />}
      {children}
    </span>
  );
}
