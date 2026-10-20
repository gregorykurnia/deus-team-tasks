"use client";

// The tab bar at 900px and under (guide 3): Today, Tasks, the raised + for a
// new task, Companies, and More for the other areas.
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import Icon from "@/ui/Icon";
import { areaOf, MORE_AREAS, over } from "./areas";
import { markMoreOpenedHere } from "./MoreSheet";
import styles from "./TabBar.module.css";

export default function TabBar() {
  const pathname = usePathname();
  const router = useRouter();
  const area = areaOf(pathname);
  const current = (on: boolean) => (on ? "page" : undefined);

  function openMore() {
    markMoreOpenedHere();
    router.push(over(pathname, "more=1"), { scroll: false });
  }

  return (
    <nav className={styles.tabbar} aria-label="Main navigation">
      <Link className={styles.tab} href="/" aria-current={current(area === "today")}>
        <Icon name="sun" size={21} />
        Today
      </Link>
      <Link className={styles.tab} href="/tasks" aria-current={current(area === "tasks")}>
        <Icon name="list" size={21} />
        Tasks
      </Link>
      <Link className={styles.add} href={over(pathname, "task=new")} scroll={false} aria-label="New task">
        <Icon name="plus" size={21} />
      </Link>
      <Link className={styles.tab} href="/companies" aria-current={current(area === "companies")}>
        <Icon name="building" size={21} />
        Companies
      </Link>
      <button
        className={styles.tab}
        type="button"
        aria-haspopup="dialog"
        aria-current={current(MORE_AREAS.some((a) => a.id === area))}
        onClick={openMore}
      >
        <Icon name="more" size={21} />
        More
      </button>
    </nav>
  );
}
