"use client";

// A task group's star and ⋯ menu in its header (guide 6.2): Rename, Mark as important, Delete. The star is the same
// switch as the menu item, one press away.
import { useRef, useState } from "react";
import Button from "@/ui/Button";
import Icon from "@/ui/Icon";
import Menu, { MenuItem, MenuSeparator } from "@/ui/Menu";
import styles from "./Tasks.module.css";

interface GroupToolsProps {
  name: string;
  starred: boolean;
  onStar: () => void;
  onRename: () => void;
  onDelete: () => void;
}

export default function GroupTools({ name, starred, onStar, onRename, onDelete }: GroupToolsProps) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button type="button" className={styles.star} aria-pressed={starred} aria-label="Important" title={starred ? "Marked as important" : "Mark as important"} onClick={onStar}>
        <Icon name={starred ? "star" : "starline"} size={20} />
      </button>
      <Button ref={anchor} variant="icon" glass aria-label={`Options for ${name}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Icon name="more" />
      </Button>
      <Menu open={open} anchorRef={anchor} onClose={() => setOpen(false)} label={`Options for ${name}`} alignRight>
        <MenuItem icon="edit" onSelect={onRename}>
          Rename group
        </MenuItem>
        <MenuItem icon={starred ? "starline" : "star"} onSelect={onStar}>
          {starred ? "Unmark as important" : "Mark as important"}
        </MenuItem>
        <MenuSeparator />
        <MenuItem icon="trash" danger onSelect={onDelete}>
          Delete group
        </MenuItem>
      </Menu>
    </>
  );
}
