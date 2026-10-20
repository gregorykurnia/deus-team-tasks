// Notices (guide 4.14): a message in one of five tones. An error is announced at once.
import type { ReactNode } from "react";
import Icon, { type IconName } from "./Icon";
import styles from "./Notice.module.css";

export type NoticeTone = "info" | "warning" | "error" | "success" | "inline" | "inlineMuted";

const ICONS: Partial<Record<NoticeTone, IconName>> = { info: "info", warning: "alert", error: "alert", success: "check" };

interface NoticeProps {
  tone?: NoticeTone; // info by default
  title?: string; // the bold lead-in
  children?: ReactNode;
  action?: ReactNode;
}

export default function Notice({ tone = "info", title, children, action }: NoticeProps) {
  const icon = ICONS[tone];
  return (
    <div className={`${styles.notice} ${styles[tone]}`} role={tone === "error" ? "alert" : undefined}>
      {icon && <Icon name={icon} size={18} />}
      <div className={styles.body}>
        <p>
          {title && <b>{title} </b>}
          {children}
        </p>
        {action}
      </div>
    </div>
  );
}
