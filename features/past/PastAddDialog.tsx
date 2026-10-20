"use client";

// Add a past client (guide 6.7, 5.3, 5.5, R1, R2, R3, R6, R9): the name (the only thing needed), the sector with the
// sectors in use, and where it sits: a parent company, counted in the totals unless turned off, or a subsidiary of a
// chosen parent, which takes the parent's sector unless one is typed. "Adding…" shows while it saves; when it fails, the
// dialog stays with what was typed and the button says Try again.
import { useState } from "react";
import { failureMessage } from "@/lib/connection";
import { countHelp, NAME_MISSING, PARENT_MISSING, parentLine, parentsToPick } from "@/lib/pastEdit";
import { initials } from "@/lib/people";
import type { HistoricalClient } from "@/lib/pastClients";
import type { SectorCount } from "@/lib/sectors";
import Button from "@/ui/Button";
import { Chip } from "@/ui/ChipGroup";
import Dialog from "@/ui/Dialog";
import Field from "@/ui/Field";
import Icon from "@/ui/Icon";
import { SearchField, TextInput } from "@/ui/Inputs";
import Notice from "@/ui/Notice";
import SectorPicker from "@/ui/SectorPicker";
import Segmented from "@/ui/Segmented";
import type { NewPastClient } from "./usePastActions";
import styles from "./Past.module.css";

const SHOWN = 30;

interface PastAddDialogProps {
  clients: HistoricalClient[];
  sectors: SectorCount[];
  labelOf: (c: HistoricalClient) => string; // a company's sector as the record shows it
  subsOf: (id: string) => number;
  onClose: () => void;
  onAdd: (input: NewPastClient) => Promise<string>;
  onAdded: (id: string, parentId: string | null) => void;
}

export default function PastAddDialog({ clients, sectors, labelOf, subsOf, onClose, onAdd, onAdded }: PastAddDialogProps) {
  const [name, setName] = useState("");
  const [sector, setSector] = useState("");
  const [mode, setMode] = useState<"parent" | "sub">("parent");
  const [parentId, setParentId] = useState<string | null>(null);
  const [counted, setCounted] = useState(true);
  const [find, setFind] = useState("");
  const [missing, setMissing] = useState<"name" | "parent" | null>(null);
  const [tries, setTries] = useState(0);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const parent = parentId ? clients.find((c) => c.id === parentId && !c.parentId) : undefined;
  const anyParent = clients.some((c) => !c.parentId);

  // Choosing a parent fills in its sector, unless one is typed already.
  function choose(p: HistoricalClient) {
    setParentId(p.id);
    if (!sector.trim()) setSector(labelOf(p));
    if (missing === "parent") setMissing(null);
  }

  async function submit() {
    if (busy) return;
    setTries((n) => n + 1);
    const clean = name.trim();
    if (!clean) {
      setMissing("name");
      return;
    }
    if (mode === "sub" && !parent) {
      setMissing("parent");
      return;
    }
    setMissing(null);
    setBusy(true);
    setFailed(null);
    try {
      const id = await onAdd({ name: clean, sector, parentId: mode === "sub" ? parent!.id : null, counted });
      onAdded(id, mode === "sub" ? parent!.id : null);
    } catch (err) {
      setBusy(false);
      setFailed(failureMessage(err, "Check your connection and try again. What you typed is still here."));
    }
  }

  const hits = mode === "sub" && !parent ? parentsToPick(clients, find) : [];
  return (
    <Dialog
      open
      wide
      onClose={onClose}
      busy={busy}
      title="Add a past client"
      initialFocus="input"
      actions={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="main" busy={busy} busyLabel="Adding…" onClick={() => void submit()}>
            {failed ? "Try again" : "Add past client"}
          </Button>
        </>
      }
    >
      <p>A company we’ve finished work with. Only the name is needed.</p>
      {failed && (
        <div className={styles.dialogNotice} role="alert">
          <Notice tone="error" title={`Couldn’t save ${name.trim() || "the company"}.`}>
            {failed}
          </Notice>
        </div>
      )}
      <div className={styles.form}>
        <Field label="Name" error={missing === "name" && !name.trim() ? NAME_MISSING : undefined} focusKey={tries}>
          {(control) => (
            <TextInput
              {...control}
              value={name}
              placeholder="Like “Meridian Bank”"
              autoComplete="off"
              disabled={busy}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void submit();
                }
              }}
            />
          )}
        </Field>
        <Field label="Sector" optional>
          {(control) => <SectorPicker {...control} value={sector} onChange={setSector} sectors={sectors} />}
        </Field>
        <div>
          <span className={styles.fieldLabel} id="past-add-where">
            Where it sits
          </span>
          <Segmented
            label="Where it sits"
            full
            large
            value={mode}
            onChange={(v) => v && !busy && setMode(v)}
            options={[
              { value: "parent", label: "A parent company", icon: "building" },
              { value: "sub", label: "A subsidiary of…", icon: "tree" },
            ]}
          />
          {mode === "parent" ? (
            <div className={styles.where}>
              <Chip pressed={counted} icon={counted ? "check" : "minus"} disabled={busy} onClick={() => setCounted(!counted)}>
                Count it in the totals
              </Chip>
              <p className={styles.help}>{countHelp(counted)}</p>
            </div>
          ) : parent ? (
            <div className={styles.where}>
              <div className={styles.chosen}>
                <span className={styles.mono} aria-hidden="true">
                  {initials(parent.name)}
                </span>
                <div className={styles.pickName}>
                  {parent.name}
                  <small>{parentLine(labelOf(parent), subsOf(parent.id))}</small>
                </div>
                <Button small variant="quiet" disabled={busy} onClick={() => setParentId(null)}>
                  Change
                </Button>
              </div>
              <p className={styles.help}>Subsidiaries always count, even when their parent company doesn’t.</p>
            </div>
          ) : !anyParent ? (
            <p className={`${styles.help} ${styles.where}`}>There’s no parent company on record yet. Add this one as a parent company first.</p>
          ) : (
            <div className={styles.where}>
              <SearchField className={styles.wideSearch} label="Search parent companies" value={find} onChange={setFind} placeholder="Search parent companies" />
              {missing === "parent" && (
                <p className={styles.error} role="alert">
                  <Icon name="alert" size={15} />
                  {PARENT_MISSING}
                </p>
              )}
              <ParentList parents={hits} labelOf={labelOf} subsOf={subsOf} action="Choose" onPick={choose} short />
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
}

interface ParentListProps {
  parents: HistoricalClient[];
  labelOf: (c: HistoricalClient) => string;
  subsOf: (id: string) => number;
  action: string; // "Choose", "Move here"
  onPick: (p: HistoricalClient) => void;
  short?: boolean;
  disabled?: boolean;
}

// Parent companies to choose from, 30 at a time, each with its sector and how many subsidiaries it has.
export function ParentList({ parents, labelOf, subsOf, action, onPick, short, disabled }: ParentListProps) {
  return (
    <div className={short ? `${styles.pickList} ${styles.short}` : styles.pickList}>
      {parents.slice(0, SHOWN).map((p) => (
        <button key={p.id} type="button" className={styles.pickParent} onClick={() => onPick(p)} disabled={disabled}>
          <span className={styles.mono} aria-hidden="true">
            {initials(p.name)}
          </span>
          <span className={styles.pickName}>
            {p.name}
            <small>{parentLine(labelOf(p), subsOf(p.id))}</small>
          </span>
          <span className={styles.go}>
            {action}
            <Icon name="right" size={14} />
          </span>
        </button>
      ))}
      {parents.length > SHOWN && <p className={styles.help}>{`${(parents.length - SHOWN).toLocaleString("en-GB")} more. Keep typing to narrow it down.`}</p>}
      {parents.length === 0 && <p className={styles.help}>No parent company has that name.</p>}
    </div>
  );
}
