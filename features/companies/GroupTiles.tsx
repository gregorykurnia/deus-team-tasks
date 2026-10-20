"use client";

// The four groups, sized (guide 4.10, B2): a white glass card with the group's icon in a tinted square, its name, a count
// and a line about it. The chosen one is white with a 2px ring in the group's colour. Four across, two by two on phones.
import { GROUP_LOOKS } from "@/lib/companyView";
import type { CompanyGroup } from "@/lib/companies";
import Icon from "@/ui/Icon";
import { Skeleton } from "@/ui/Skeleton";
import styles from "./Companies.module.css";

interface GroupTilesProps {
  counts: Record<CompanyGroup, number> | null; // null while companies load
  current: CompanyGroup;
  onPick: (group: CompanyGroup) => void;
}

export default function GroupTiles({ counts, current, onPick }: GroupTilesProps) {
  return (
    <div className={styles.tiles} role="group" aria-label="Groups of companies">
      {GROUP_LOOKS.map((g) => (
        <button key={g.id} type="button" className={`${styles.tile} ${styles[g.id]}`} aria-pressed={current === g.id} onClick={() => onPick(g.id)}>
          <span className={styles.tileTop}>
            <i>
              <Icon name={g.icon} size={16} />
            </i>
            <span>{g.label}</span>
          </span>
          <b className={styles.tileCount}>{counts ? counts[g.id].toLocaleString("en-GB") : <Skeleton width={46} height={30} />}</b>
          <small>{g.blurb}</small>
        </button>
      ))}
    </div>
  );
}
