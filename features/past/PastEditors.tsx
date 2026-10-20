"use client";

// The small editors in place (guide 6.7, 4.9, R2, R6): a past client's name, and its sector with the sectors already in
// use. Each opens as a menu anchored to what was pressed; Enter or Save saves, and the screen's toast offers Undo.
import { useState, type RefObject } from "react";
import { normalizeSectorKey } from "@/lib/historicalClientTypes";
import { RENAME_MISSING } from "@/lib/pastEdit";
import { sectorNote, suggestSectors, type SectorCount } from "@/lib/sectors";
import Button from "@/ui/Button";
import Field from "@/ui/Field";
import Highlight from "@/ui/Highlight";
import Icon from "@/ui/Icon";
import { TextInput } from "@/ui/Inputs";
import Menu, { MenuFoot, MenuHeading } from "@/ui/Menu";
import styles from "./Past.module.css";

interface EditorProps {
  anchorRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  name: string;
  sub: boolean; // a subsidiary
}

export function RenameEditor({ anchorRef, onClose, name, sub, onSave }: EditorProps & { onSave: (name: string) => void }) {
  const [draft, setDraft] = useState(name);
  const [missing, setMissing] = useState(false);
  const label = sub ? "Subsidiary name" : "Company name";
  function save() {
    const clean = draft.trim();
    if (!clean) {
      setMissing(true);
      return;
    }
    onClose();
    if (clean !== name) onSave(clean);
  }
  return (
    <Menu open anchorRef={anchorRef} onClose={onClose} label={label} form initialFocus={["input"]}>
      <MenuHeading>{label}</MenuHeading>
      <div className={styles.qe}>
        <Field label={label} hideLabel error={missing && !draft.trim() ? RENAME_MISSING : undefined}>
          {(control) => (
            <TextInput
              {...control}
              value={draft}
              autoComplete="off"
              onChange={(e) => setDraft(e.target.value)}
              onFocus={(e) => e.currentTarget.select()}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  save();
                }
              }}
            />
          )}
        </Field>
      </div>
      <div className={styles.qeActs}>
        <span className={styles.spacer} />
        <Button small onClick={onClose}>
          Cancel
        </Button>
        <Button small variant="main" onClick={save}>
          Save
        </Button>
      </div>
    </Menu>
  );
}

interface SectorEditorProps extends EditorProps {
  sector: string; // what the record shows now
  own: boolean; // the company has a sector of its own (a subsidiary without one shows its parent's)
  sectors: SectorCount[];
  onSave: (typed: string) => void;
}

// The sectors in use show as the field is typed in, with how many companies use each. A spelling of one in use says so
// before saving ("Same sector as “Retail”, so it’s saved that way."), and a new one says it will be new.
export function SectorEditor({ anchorRef, onClose, name, sector, own, sectors, onSave }: SectorEditorProps) {
  const [draft, setDraft] = useState(sector);
  const hits = suggestSectors(draft, sectors, 6);
  const note = sectorNote(draft, sectors);
  const current = normalizeSectorKey(sector);
  // Another spelling of the sector shown is no change, and nor is clearing a sector that's only the parent's.
  function save(typed: string) {
    onClose();
    if (normalizeSectorKey(typed) !== current && (own || typed.trim())) onSave(typed);
  }
  return (
    <Menu open anchorRef={anchorRef} onClose={onClose} label={`Sector of ${name}`} form initialFocus={["input"]}>
      <MenuHeading>{`Sector of ${name}`}</MenuHeading>
      <div className={styles.qe}>
        <TextInput
          aria-label="Sector"
          value={draft}
          placeholder="Like “Retail”"
          autoComplete="off"
          onChange={(e) => setDraft(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              save(draft);
            }
          }}
        />
      </div>
      {hits.length > 0 && (
        <div className={styles.secList} role="group" aria-label="Sectors already in use">
          <MenuHeading>Sectors already in use</MenuHeading>
          {hits.map((s) => (
            <button
              key={s.name}
              type="button"
              role="menuitemradio"
              aria-checked={normalizeSectorKey(s.name) === current}
              className={styles.secPick}
              onClick={() => save(s.name)}
            >
              <span className={styles.secPickName}>
                <Highlight text={s.name} query={draft.trim()} />
              </span>
              <small>{s.count === 1 ? "1 company" : `${s.count.toLocaleString("en-GB")} companies`}</small>
            </button>
          ))}
        </div>
      )}
      {note && (
        <MenuFoot>
          <span className={styles.secNote} aria-live="polite">
            <Icon name={note.kind === "same" ? "sync" : "plus"} size={13} />
            {note.kind === "same" ? `Same sector as “${note.sector}”, so it’s saved that way.` : `“${note.sector}” will be a new sector.`}
          </span>
        </MenuFoot>
      )}
      <div className={styles.qeActs}>
        {own && sector && (
          <Button small variant="quiet" onClick={() => save("")}>
            Clear
          </Button>
        )}
        <span className={styles.spacer} />
        <Button small onClick={onClose}>
          Cancel
        </Button>
        <Button small variant="main" onClick={() => save(draft)}>
          Save
        </Button>
      </div>
    </Menu>
  );
}
