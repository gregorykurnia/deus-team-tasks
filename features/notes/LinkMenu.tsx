"use client";

// Link to a tracked company (U6): a searchable menu of companies. One that already has notes is marked and can't be
// picked, as each company has at most one set.
import { useState, type RefObject } from "react";
import type { PipelineEntry } from "@/lib/clientTypes";
import { companyGroup, COMPANY_GROUP_LABELS } from "@/lib/companies";
import { companiesToPick, notesOfCompany } from "@/lib/notesView";
import { initials } from "@/lib/people";
import type { ProspectJournalEntry } from "@/lib/prospectJournalTypes";
import { TextInput } from "@/ui/Inputs";
import Menu, { MenuFoot, MenuHeading, MenuItem } from "@/ui/Menu";
import styles from "./Notes.module.css";

const SHOWN = 40;

interface LinkMenuProps {
  anchorRef: RefObject<HTMLElement | null>;
  companies: PipelineEntry[];
  notes: ProspectJournalEntry[];
  onClose: () => void;
  onPick: (c: PipelineEntry) => void;
}

export default function LinkMenu({ anchorRef, companies, notes, onClose, onPick }: LinkMenuProps) {
  const [search, setSearch] = useState("");
  const hits = companiesToPick(companies, search, true);
  return (
    <Menu open form anchorRef={anchorRef} onClose={onClose} label="Link to a tracked company" initialFocus={["input"]}>
      <MenuHeading>Link to a tracked company</MenuHeading>
      <div className={styles.menuSearch}>
        <TextInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search companies" aria-label="Search companies" autoComplete="off" />
      </div>
      <div className={styles.menuList}>
        {hits.slice(0, SHOWN).map((c) => {
          const group = companyGroup(c);
          const has = !!notesOfCompany(notes, c.id);
          return (
            <MenuItem key={c.id} disabled={has} onSelect={() => onPick(c)}>
              <span className={styles.menuCompany}>
                <span className={`${styles.mono} ${styles[group]}`} aria-hidden="true">
                  {initials(c.company)}
                </span>
                <b>{c.company}</b>
                <small>{has ? "Has notes" : COMPANY_GROUP_LABELS[group]}</small>
              </span>
            </MenuItem>
          );
        })}
      </div>
      {hits.length > SHOWN && <MenuFoot>{(hits.length - SHOWN).toLocaleString("en-US")} more. Keep typing to narrow it down.</MenuFoot>}
      {hits.length === 0 && <MenuFoot>No tracked company has that name.</MenuFoot>}
      <MenuFoot>Each company has at most one set of notes.</MenuFoot>
    </Menu>
  );
}
