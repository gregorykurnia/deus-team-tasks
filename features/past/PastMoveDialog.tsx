"use client";

// Moving a subsidiary (guide 6.7, R2, R9): the parent companies it could go under, with a search. "Moving to …" shows
// while it saves, then the dialog closes and the toast offers Undo; when it fails, the dialog says so and nothing changed.
// With no other parent company on record, it says so and offers to add one.
import { useState } from "react";
import { failureMessage } from "@/lib/connection";
import { parentsToPick } from "@/lib/pastEdit";
import type { HistoricalClient } from "@/lib/pastClients";
import Button from "@/ui/Button";
import Dialog from "@/ui/Dialog";
import Icon from "@/ui/Icon";
import { SearchField } from "@/ui/Inputs";
import Notice from "@/ui/Notice";
import Spinner from "@/ui/Spinner";
import { ParentList } from "./PastAddDialog";
import styles from "./Past.module.css";

// One function for every render, so it runs only when its element appears.
const focusOnMount = (el: HTMLElement | null) => el?.focus();

interface PastMoveDialogProps {
  sub: HistoricalClient;
  clients: HistoricalClient[];
  labelOf: (c: HistoricalClient) => string;
  subsOf: (id: string) => number;
  onClose: () => void;
  onMove: (to: string) => Promise<void>;
  onAddParent: () => void;
}

export default function PastMoveDialog({ sub, clients, labelOf, subsOf, onClose, onMove, onAddParent }: PastMoveDialogProps) {
  const [find, setFind] = useState("");
  const [moving, setMoving] = useState<HistoricalClient | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const from = clients.find((c) => c.id === sub.parentId);
  const others = parentsToPick(clients, "", sub.parentId);

  async function moveTo(p: HistoricalClient) {
    if (moving) return;
    setMoving(p);
    setFailed(null);
    try {
      await onMove(p.id);
      onClose();
    } catch (err) {
      setMoving(null);
      setFailed(failureMessage(err, "Check your connection and choose again. Nothing was changed."));
    }
  }

  if (others.length === 0) {
    return (
      <Dialog
        open
        onClose={onClose}
        title={`Move ${sub.name}`}
        initialFocus="[data-add-parent]"
        actions={
          <>
            <Button onClick={onClose}>Close</Button>
            <Button variant="main" data-add-parent onClick={onAddParent}>
              <Icon name="plus" size={16} />
              Add a parent company
            </Button>
          </>
        }
      >
        <p>{`There’s no other parent company to move it to. Add the new parent company first, then move ${sub.name} there.`}</p>
      </Dialog>
    );
  }

  return (
    <Dialog
      open
      wide
      onClose={onClose}
      busy={!!moving}
      title={`Move ${sub.name}`}
      initialFocus="input"
      actions={
        <Button onClick={onClose} disabled={!!moving}>
          Cancel
        </Button>
      }
    >
      <p>
        Now under <b>{from?.name}</b>. Choose its new parent company. Subsidiaries always count, so the totals stay the same.
      </p>
      {failed && (
        // Focus comes here from the "Moving…" line that's gone, so it stays in the dialog.
        <div className={styles.dialogNotice} role="alert" tabIndex={-1} ref={focusOnMount}>
          <Notice tone="error" title={`Couldn’t move ${sub.name}.`}>
            {failed}
          </Notice>
        </div>
      )}
      {moving ? (
        <div className={styles.moving} role="status" tabIndex={-1} ref={focusOnMount}>
          <Spinner />
          {`Moving to ${moving.name}…`}
        </div>
      ) : (
        <div className={styles.where}>
          <SearchField className={styles.wideSearch} label="Search parent companies" value={find} onChange={setFind} placeholder="Search parent companies" />
          <ParentList parents={parentsToPick(clients, find, sub.parentId)} labelOf={labelOf} subsOf={subsOf} action="Move here" onPick={(p) => void moveTo(p)} />
        </div>
      )}
    </Dialog>
  );
}
