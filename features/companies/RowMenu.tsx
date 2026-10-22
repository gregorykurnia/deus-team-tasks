"use client";

// The row menu (guide 4.9): Open company, Create a follow-up task, Last action: today, Park or Bring back (Active, N20),
// Move to another group, the qualification notes (or start them), and Delete company in red, disabled with its reason
// until it can run.
import { useRouter } from "next/navigation";
import { useId, type RefObject } from "react";
import type { PipelineEntry } from "@/lib/clientTypes";
import Menu, { MenuFoot, MenuItem, MenuSeparator } from "@/ui/Menu";

interface RowMenuProps {
  company: PipelineEntry;
  anchorRef: RefObject<HTMLElement | null>;
  hasLastAction: boolean; // the group keeps a last action
  notes: { href: string; label: string };
  onClose: () => void;
  onOpen: () => void;
  onFollowUp: () => void;
  onToday: () => void;
  onMove: () => void;
  parking?: { parked: boolean; onPark: () => void; onBringBack: () => void }; // Active only
  onDelete: () => void;
  deleteBlocked: string | null; // why Delete company can't run yet
}

export default function RowMenu({ company, anchorRef, hasLastAction, notes, onClose, onOpen, onFollowUp, onToday, onMove, parking, onDelete, deleteBlocked }: RowMenuProps) {
  const router = useRouter();
  const reasonId = useId();
  return (
    <Menu open anchorRef={anchorRef} onClose={onClose} label={`More for ${company.company}`} alignRight>
      <MenuItem icon="building" onSelect={onOpen}>
        Open company
      </MenuItem>
      <MenuItem icon="plus" onSelect={onFollowUp}>
        Create a follow-up task
      </MenuItem>
      {hasLastAction && (
        <MenuItem icon="clock" onSelect={onToday}>
          Last action: today
        </MenuItem>
      )}
      {parking &&
        (parking.parked ? (
          <MenuItem icon="undo" onSelect={parking.onBringBack}>
            Bring back
          </MenuItem>
        ) : (
          <MenuItem icon="pause" onSelect={parking.onPark}>
            Park
          </MenuItem>
        ))}
      <MenuItem icon="swap" onSelect={onMove}>
        Move to another group
      </MenuItem>
      <MenuItem icon="note" onSelect={() => router.push(notes.href)}>
        {notes.label}
      </MenuItem>
      <MenuSeparator />
      <MenuItem icon="trash" danger onSelect={onDelete} disabled={!!deleteBlocked} describedBy={deleteBlocked ? reasonId : undefined}>
        Delete company
      </MenuItem>
      {deleteBlocked && <MenuFoot id={reasonId}>{deleteBlocked}</MenuFoot>}
    </Menu>
  );
}
