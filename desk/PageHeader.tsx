"use client";

// The page header (guide 3): the title with a short subtitle, then search and
// the main action. On phones search moves under the title, and a New task
// action leaves the header for the tab bar's + button.
import type { ReactNode } from "react";
import Link from "next/link";
import Icon from "@/ui/Icon";
import { ConnectionBanner } from "./ConnectionBanner";
import styles from "./PageHeader.module.css";

export interface PageAction {
  label: string;
  href: string;
  newTask?: boolean; // the tab bar's + covers it on phones
}

interface PageHeaderProps {
  title: string;
  subtitle?: ReactNode;
  search?: ReactNode;
  phoneSearchHref?: string; // on phones the search field becomes a round search button that goes here (Today, guide 6.1)
  lead?: ReactNode; // before the title: a task group's badge
  tools?: ReactNode; // between the search and the action: a task group's star and menu
  action?: PageAction;
}

export default function PageHeader({ title, subtitle, search, phoneSearchHref, lead, tools, action }: PageHeaderProps) {
  return (
    <header>
      <div className={styles.bar}>
        {lead}
        <div className={styles.titles}>
          <h1 className={styles.title}>{title}</h1>
          {subtitle && <span className={styles.subtitle}>{subtitle}</span>}
        </div>
        <span className={styles.spacer} />
        {search && <div className={phoneSearchHref ? `${styles.search} ${styles.searchOffPhone}` : styles.search}>{search}</div>}
        {phoneSearchHref && (
          <Link className={styles.phoneAction} href={phoneSearchHref} aria-label="Search">
            <Icon name="search" />
          </Link>
        )}
        {tools}
        {action && (
          <>
            <Link className={styles.action} href={action.href} scroll={false}>
              <Icon name="plus" size={16} />
              {action.label}
            </Link>
            {!action.newTask && (
              <Link className={styles.phoneAction} href={action.href} scroll={false} aria-label={action.label}>
                <Icon name="plus" />
              </Link>
            )}
          </>
        )}
      </div>
      <ConnectionBanner />
    </header>
  );
}
