"use client";

// The selection bar (guide 4.7, D-008): a white glass pill floating at the bottom centre with how many are chosen,
// "Select all 1,579", then Mark done (Mark not done among finished tasks), Park (Bring back among parked tasks, N19),
// Move to group, Delete and a close ×. On
// phones it takes the tab bar's place, full width, with the actions as icon-and-label buttons under the count. While it
// shows, the body carries data-selecting, so the tab bar steps aside and toasts sit above it.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { GroupNavItem } from "@/lib/deskNav";
import type { TaskView } from "@/lib/taskQueries";
import { moveNote } from "@/lib/taskSelection";
import { plural } from "@/lib/dates";
import Button from "@/ui/Button";
import GroupBadge from "@/ui/GroupBadge";
import Icon, { type IconName } from "@/ui/Icon";
import Menu, { MenuFoot, MenuHeading, MenuItem, MenuSeparator } from "@/ui/Menu";
import Spinner from "@/ui/Spinner";
import { useIsClient } from "@/ui/useIsClient";
import ParkMenu from "./ParkMenu";
import styles from "./SelectionBar.module.css";

export type BulkAction = "done" | "reopen" | "park" | "unpark" | "move" | "delete";

interface SelectionBarProps {
  line: string; // "3 selected"
  offer: number | null; // "Select all 1,579"
  chosen: number;
  view: TaskView; // among finished tasks the first action is Mark not done, among parked ones Bring back
  today: string;
  busy: BulkAction | null;
  groups: GroupNavItem[];
  companyTasks: number; // chosen tasks tied to a company, which keep it when moved
  onSelectAll: () => void;
  onDone: () => void;
  onPark: (until: string | null) => void;
  onUnpark: () => void;
  onMove: (group: string | null) => void;
  onNewGroup: () => void;
  onDelete: () => void;
  onStop: () => void;
}

const num = (n: number) => n.toLocaleString("en-GB");

export default function SelectionBar(props: SelectionBarProps) {
  const client = useIsClient();
  useEffect(() => {
    document.body.dataset.selecting = "";
    return () => {
      delete document.body.dataset.selecting;
    };
  }, []);
  if (!client) return null;
  return createPortal(<Bar {...props} />, document.body);
}

function Bar({ line, offer, chosen, view, today, busy, groups, companyTasks, onSelectAll, onDone, onPark, onUnpark, onMove, onNewGroup, onDelete, onStop }: SelectionBarProps) {
  const [moving, setMoving] = useState(false);
  const [parking, setParking] = useState(false);
  const moveRef = useRef<HTMLButtonElement>(null);
  const parkRef = useRef<HTMLButtonElement>(null);
  const none = chosen === 0;
  const note = moveNote(companyTasks);

  const action = (which: BulkAction, icon: IconName, label: string, onClick: () => void, extra?: string) => (
    <button
      ref={which === "move" ? moveRef : which === "park" ? parkRef : undefined}
      type="button"
      className={[styles.action, extra].filter(Boolean).join(" ")}
      disabled={none}
      aria-disabled={(busy !== null && !none) || undefined}
      aria-busy={busy === which || undefined}
      aria-haspopup={which === "move" || which === "park" ? "menu" : undefined}
      aria-expanded={which === "move" ? moving : which === "park" ? parking : undefined}
      onClick={() => busy === null && onClick()}
    >
      {busy === which ? <Spinner /> : <Icon name={icon} size={17} />}
      <span>{label}</span>
    </button>
  );

  return (
    <div className={styles.bar} role="region" aria-label="Selected tasks">
      <div className={styles.count}>
        <b role="status">{line}</b>
        {offer !== null && (
          <button type="button" className={styles.all} onClick={onSelectAll} disabled={busy !== null}>
            Select all {num(offer)}
          </button>
        )}
      </div>
      <div className={styles.actions}>
        {view === "parked" && action("unpark", "undo", "Bring back", onUnpark)}
        {view === "done" ? action("reopen", "undo", "Mark not done", onDone) : action("done", "check", "Mark done", onDone)}
        {view === "open" && action("park", "pause", "Park", () => setParking(true))}
        {action("move", "folder", "Move to group", () => setMoving(true))}
        {action("delete", "trash", "Delete", onDelete, styles.red)}
      </div>
      <Button variant="icon" aria-label="Stop selecting" title="Stop selecting (Esc)" onClick={onStop} disabled={busy !== null}>
        <Icon name="x" size={18} />
      </Button>

      <ParkMenu open={parking} anchorRef={parkRef} onClose={() => setParking(false)} count={chosen} today={today} onPark={onPark} alignRight />

      <Menu open={moving} anchorRef={moveRef} onClose={() => setMoving(false)} label="Move to group" alignRight>
        <MenuHeading>{`Move ${plural(chosen, "task")} to`}</MenuHeading>
        {groups.map((g) => (
          <MenuItem key={g.id} onSelect={() => onMove(g.name)}>
            <span className={styles.group}>
              <GroupBadge badge={g.badge} hue={g.hue} />
              <span className={styles.groupName}>{g.name}</span>
            </span>
          </MenuItem>
        ))}
        {groups.length > 0 && <MenuSeparator />}
        <MenuItem icon="x" onSelect={() => onMove(null)}>
          No group
        </MenuItem>
        <MenuItem icon="plus" onSelect={onNewGroup}>
          New group…
        </MenuItem>
        {note && <MenuFoot>{note}</MenuFoot>}
      </Menu>
    </div>
  );
}
