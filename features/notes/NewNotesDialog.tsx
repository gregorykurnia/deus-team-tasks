"use client";

// New qualification notes (guide 6.6, 5.3): for a tracked company, picked from a search where companies that have notes
// say "Open its notes", or for someone not tracked yet, which needs a name. Deal done companies are clients, so they
// aren't offered here; their notes still open from the company.
import { useState } from "react";
import type { PipelineEntry } from "@/lib/clientTypes";
import { companyGroup, COMPANY_GROUP_LABELS } from "@/lib/companies";
import { companiesToPick, notesOfCompany } from "@/lib/notesView";
import { initials } from "@/lib/people";
import type { ProspectJournalEntry } from "@/lib/prospectJournalTypes";
import Button from "@/ui/Button";
import Dialog from "@/ui/Dialog";
import Field from "@/ui/Field";
import Icon from "@/ui/Icon";
import { SearchField, TextInput } from "@/ui/Inputs";
import Segmented from "@/ui/Segmented";
import styles from "./Notes.module.css";

const SHOWN = 30;
export const NAME_MISSING = "Give the prospect a name so the team can find these notes.";

interface NewNotesDialogProps {
  companies: PipelineEntry[];
  notes: ProspectJournalEntry[];
  busy: boolean;
  onClose: () => void;
  onCompany: (c: PipelineEntry) => void; // opens its notes, or starts them
  onUntracked: (name: string) => void;
}

export default function NewNotesDialog({ companies, notes, busy, onClose, onCompany, onUntracked }: NewNotesDialogProps) {
  const [mode, setMode] = useState<"company" | "untracked">("company");
  const [search, setSearch] = useState("");
  const [name, setName] = useState("");
  const [missing, setMissing] = useState(false);
  const [tries, setTries] = useState(0);
  const hits = companiesToPick(companies, search, false);

  function start() {
    setTries((n) => n + 1);
    const clean = name.trim();
    if (!clean) {
      setMissing(true);
      return;
    }
    onUntracked(clean);
  }

  return (
    <Dialog
      open
      wide
      onClose={onClose}
      title="New qualification notes"
      busy={busy}
      initialFocus="input"
      actions={
        <>
          <Button onClick={onClose}>Cancel</Button>
          {mode === "untracked" && (
            <Button variant="main" busy={busy} busyLabel="Starting…" onClick={start}>
              Start notes
            </Button>
          )}
        </>
      }
    >
      <p>Who are they for?</p>
      <div className={styles.newBody}>
        <Segmented
          label="Who the notes are for"
          full
          large
          value={mode}
          onChange={(v) => v && setMode(v)}
          options={[
            { value: "company", label: "A tracked company", icon: "building" },
            { value: "untracked", label: "Not tracked yet", icon: "people" },
          ]}
        />
        {mode === "company" ? (
          <>
            <SearchField className={styles.wideSearch} label="Search companies" value={search} onChange={setSearch} placeholder="Search companies" />
            <div className={styles.pickList}>
              {hits.slice(0, SHOWN).map((c) => {
                const group = companyGroup(c);
                const has = !!notesOfCompany(notes, c.id);
                return (
                  <button key={c.id} type="button" className={styles.pickCompany} onClick={() => onCompany(c)} disabled={busy}>
                    <span className={`${styles.mono} ${styles[group]}`} aria-hidden="true">
                      {initials(c.company)}
                    </span>
                    <span className={styles.pickName}>
                      {c.company}
                      <small>{COMPANY_GROUP_LABELS[group]}</small>
                    </span>
                    <span className={styles.go}>
                      {has ? "Open its notes" : "Start notes"}
                      <Icon name="right" size={14} />
                    </span>
                  </button>
                );
              })}
              {hits.length > SHOWN && <p className={styles.help}>{(hits.length - SHOWN).toLocaleString("en-US")} more. Keep typing to narrow it down.</p>}
              {hits.length === 0 && <p className={styles.help}>No company with that name. Choose “Not tracked yet” to write notes now and link them later.</p>}
            </div>
          </>
        ) : (
          <Field label="Prospect name" error={missing && !name.trim() ? NAME_MISSING : undefined} focusKey={tries} hint="No need to add the company first. You can link these notes to it later.">
            {(control) => (
              <TextInput
                {...control}
                value={name}
                placeholder="Like “Borneo Agro, met at the trade fair”"
                autoComplete="off"
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    start();
                  }
                }}
              />
            )}
          </Field>
        )}
      </div>
    </Dialog>
  );
}
