"use client";

// The sector picker (guide 4.13, R6): sectors already in use with how many companies use each, and a note under the field
// that says, before saving, whether what is typed is the same sector as one in use (and saved that way) or a new one.
// Nothing is highlighted until an arrow key, so Enter keeps what was typed ("Food" doesn't become "Food and beverage").
import { sectorNote, suggestSectors, type SectorCount } from "@/lib/sectors";
import Combobox from "./Combobox";
import Notice from "./Notice";
import styles from "./SectorPicker.module.css";

interface SectorPickerProps {
  id?: string;
  "aria-label"?: string;
  "aria-invalid"?: boolean | "true";
  "aria-describedby"?: string;
  value: string;
  onChange: (value: string) => void;
  sectors: SectorCount[];
}

export default function SectorPicker({ value, onChange, sectors, ...aria }: SectorPickerProps) {
  const note = sectorNote(value, sectors);
  const options = suggestSectors(value, sectors).map((s) => ({
    key: s.name,
    content: (
      <>
        <span>{s.name}</span>
        <small>{s.count === 1 ? "1 company" : `${s.count.toLocaleString("en-GB")} companies`}</small>
      </>
    ),
  }));
  return (
    <div className={styles.picker}>
      <div className={styles.box}>
        <Combobox {...aria} placeholder="Pick a sector or type a new one" text={value} onText={onChange} options={options} heading="Sectors in use" onPick={onChange} highlightFirst={false} />
      </div>
      <div className={styles.note} aria-live="polite">
        {note && (
          <Notice tone="inline">
            {note.kind === "same" ? `Same sector as “${note.sector}”, so it’s saved that way.` : `“${note.sector}” will be a new sector.`}
          </Notice>
        )}
      </div>
    </div>
  );
}
