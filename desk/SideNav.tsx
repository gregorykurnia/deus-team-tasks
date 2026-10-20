"use client";

// The side bar on screens over 900px (guide 3): brand, areas with counts, task
// groups, install, and the live status.
import { useId, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { groupNavItems, navCounts } from "@/lib/deskNav";
import Icon from "@/ui/Icon";
import { areaOf, AREAS, groupHref, over, type AreaId } from "./areas";
import { useCompaniesById, useTaskGroups, useTasks } from "./DeskData";
import LiveDot from "./LiveDot";
import { useInstalled } from "./useInstalled";
import styles from "./SideNav.module.css";

const num = (n: number) => n.toLocaleString("en-GB");

export default function SideNav() {
  const pathname = usePathname();
  const tasks = useTasks();
  const groups = useTaskGroups();
  const companies = useCompaniesById();
  const installed = useInstalled();
  const groupsHeading = useId();

  const counts = useMemo(() => (tasks.loading ? null : navCounts(tasks.rows)), [tasks]);
  const groupItems = useMemo(() => groupNavItems(groups.rows, tasks.rows, companies), [groups.rows, tasks.rows, companies]);
  // All tasks is current only outside a task group, which has its own entry.
  const isCurrent = (id: AreaId) => (id === "tasks" ? pathname === "/tasks" : areaOf(pathname) === id);
  const countOf = (id: AreaId) => (id === "today" ? counts?.today : id === "tasks" ? counts?.tasks : undefined);

  return (
    <nav className={styles.side} aria-label="Main navigation">
      <div className={styles.brand}>
        <Image className={styles.mark} src="/brand/deus-mark.png" alt="" width={34} height={34} unoptimized />
        DEUS Team Space
      </div>

      <ul className={styles.areas}>
        {AREAS.map((area) => {
          const count = countOf(area.id);
          return (
            <li key={area.id}>
              <Link className={styles.area} href={area.href} aria-current={isCurrent(area.id) ? "page" : undefined}>
                <Icon name={area.icon} size={19} />
                {area.label}
                {count !== undefined && <span className={styles.count}>{num(count)}</span>}
              </Link>
            </li>
          );
        })}
      </ul>

      <section className={styles.groups} aria-labelledby={groupsHeading}>
        <div className={styles.groupsHead}>
          <h2 id={groupsHeading}>Task groups</h2>
          <Link className={styles.add} href="/tasks?newGroup=1" aria-label="New task group" title="New task group">
            <Icon name="plus" size={15} />
          </Link>
        </div>
        {groups.loading ? (
          <div aria-hidden="true">
            <span className={styles.skeleton} />
            <span className={styles.skeleton} />
            <span className={styles.skeleton} />
          </div>
        ) : groupItems.length === 0 ? (
          <p className={styles.empty}>Group internal work by topic, like “Hiring”.</p>
        ) : (
          <ul className={styles.groupList}>
            {groupItems.map((g) => {
              const href = groupHref(g.id);
              return (
                <li key={g.id}>
                  <Link className={styles.group} href={href} aria-current={pathname === href ? "page" : undefined} title={g.name}>
                    <span
                      className={styles.badge}
                      style={{ background: `var(--grp-${g.hue}-bg)`, color: `var(--grp-${g.hue})` }}
                      aria-hidden="true"
                    >
                      {g.badge}
                    </span>
                    <span className={styles.name}>{g.name}</span>
                    {g.starred && (
                      <>
                        <span className="sr-only">, important</span>
                        <Icon name="star" size={13} className={styles.star} />
                      </>
                    )}
                    <span className={styles.groupCount}>{tasks.loading ? null : num(g.open)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className={styles.foot}>
        {!installed && (
          <Link className={styles.install} href={over(pathname, "install=1")}>
            <Icon name="install" size={16} />
            Install the app
          </Link>
        )}
        <LiveDot />
      </div>
    </nav>
  );
}
