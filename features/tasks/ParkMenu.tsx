"use client";

// How long to park tasks for (lib/parking): until someone brings them back, a week, two weeks, a month, or a day of
// your own. Used by the task sheet and the selection bar.
import type { RefObject } from "react";
import { plural } from "@/lib/dates";
import { parkChoices } from "@/lib/parking";
import Menu, { MenuDate, MenuFoot, MenuHeading, MenuItem, MenuSeparator } from "@/ui/Menu";

interface ParkMenuProps {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  count: number; // tasks being parked
  today: string;
  onPark: (until: string | null) => void;
  alignRight?: boolean;
}

export default function ParkMenu({ open, anchorRef, onClose, count, today, onPark, alignRight }: ParkMenuProps) {
  return (
    <Menu open={open} anchorRef={anchorRef} onClose={onClose} label="Park" alignRight={alignRight}>
      <MenuHeading>{count === 1 ? "Park this task" : `Park ${plural(count, "task")}`}</MenuHeading>
      {parkChoices(today).map((c) => (
        <MenuItem key={c.label} icon={c.until ? "clock" : "pause"} onSelect={() => onPark(c.until)}>
          {c.label}
        </MenuItem>
      ))}
      <MenuSeparator />
      <MenuDate label="Until" min={today} onApply={onPark} />
      <MenuFoot>Parked tasks leave Today, Plan and the open list, and never show as late. Find them under Parked.</MenuFoot>
    </Menu>
  );
}
