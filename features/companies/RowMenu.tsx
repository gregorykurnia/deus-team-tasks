"use client";

// The row menu (guide 4.9): Open company, Create a follow-up task, Last action: today, Move to another group, the
// qualification notes (or start them), and Delete company in red.
import { useRouter } from "next/navigation";
import type { RefObject } from "react";
import type { PipelineEntry } from "@/lib/clientTypes";
import Menu, { MenuItem, MenuSeparator } from "@/ui/Menu";

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
  onDelete: () => void;
}

export default function RowMenu({ company, anchorRef, hasLastAction, notes, onClose, onOpen, onFollowUp, onToday, onMove, onDelete }: RowMenuProps) {
  const router = useRouter();
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
      <MenuItem icon="swap" onSelect={onMove}>
        Move to another group
      </MenuItem>
      <MenuItem icon="note" onSelect={() => router.push(notes.href)}>
        {notes.label}
      </MenuItem>
      <MenuSeparator />
      <MenuItem icon="trash" danger onSelect={onDelete}>
        Delete company
      </MenuItem>
    </Menu>
  );
}
