// Task groups on phones (guide 3, 6.2): a row of chips under the title, scrolling sideways, since the side bar is gone.
// On a group's page the first chip goes back to All tasks. "New group" opens the same dialog as the side bar's +.
import Link from "next/link";
import { groupHref } from "@/desk/areas";
import type { GroupNavItem } from "@/lib/deskNav";
import GroupBadge from "@/ui/GroupBadge";
import Icon from "@/ui/Icon";
import styles from "./Tasks.module.css";

interface GroupChipsProps {
  groups: GroupNavItem[];
  currentId: string | null;
  newGroupHref: string;
}

const num = (n: number) => n.toLocaleString("en-GB");

export default function GroupChips({ groups, currentId, newGroupHref }: GroupChipsProps) {
  return (
    <nav className={styles.chips} aria-label="Task groups">
      {currentId && (
        <Link href="/tasks">
          <Icon name="list" size={16} />
          <span className={styles.chipName}>All tasks</span>
        </Link>
      )}
      {groups.map((g) => (
        <Link key={g.id} href={groupHref(g.id)} aria-current={g.id === currentId ? "page" : undefined}>
          <GroupBadge badge={g.badge} hue={g.hue} size="round" />
          <span className={styles.chipName}>{g.name}</span>
          {g.starred && (
            <>
              <span className="sr-only">, important</span>
              <Icon name="star" size={13} className={styles.chipStar} />
            </>
          )}
          <span className={styles.chipCount}>{num(g.open)}</span>
        </Link>
      ))}
      <Link href={newGroupHref} scroll={false} className={styles.chipNew}>
        <Icon name="plus" size={15} />
        New group
      </Link>
    </nav>
  );
}
