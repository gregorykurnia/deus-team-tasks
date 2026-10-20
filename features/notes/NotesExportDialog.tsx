"use client";

// Export (guide 5.12, E1): the notes shown now (search and filters apply, in the list's order), or one prospect's notes
// from its ⋯, one row each, with the columns and the file's name. With nothing shown, there's nothing to export.
import type { CompaniesById } from "@/lib/kinds";
import { plural } from "@/lib/dates";
import { downloadCsv } from "@/lib/exportCsv";
import { notesCsv } from "@/lib/exports";
import type { ProspectJournalEntry } from "@/lib/prospectJournalTypes";
import Button from "@/ui/Button";
import Dialog from "@/ui/Dialog";
import Icon from "@/ui/Icon";
import { useToast } from "@/ui/Toaster";
import styles from "./Notes.module.css";

interface NotesExportDialogProps {
  entries: ProspectJournalEntry[];
  companies: CompaniesById;
  filtered: boolean;
  one?: string; // one prospect's notes, by name
  today: string;
  onClose: () => void;
}

export default function NotesExportDialog({ entries, companies, filtered, one, today, onClose }: NotesExportDialogProps) {
  const toast = useToast();
  const n = entries.length;
  const file = notesCsv([], companies, today, one);

  function download() {
    const csv = notesCsv(entries, companies, today, one);
    downloadCsv(csv.filename, csv.headers, csv.rows);
    onClose();
    toast(`Downloaded ${csv.filename}`);
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={one ? `Export the notes for ${one}` : "Export qualification notes"}
      initialFocus={n ? "[data-download]" : "[data-cancel]"}
      actions={
        <>
          <Button data-cancel onClick={onClose}>
            Cancel
          </Button>
          <Button variant="main" data-download disabled={!n} onClick={download}>
            <Icon name="download" size={16} />
            Download
          </Button>
        </>
      }
    >
      {n ? (
        <>
          <p>
            {one ? (
              "One row, with these columns:"
            ) : (
              <>
                <b>{plural(n, "prospect")}</b>
                {filtered ? ", as shown now" : ""}, one row each, with these columns:
              </>
            )}
          </p>
          <div className={styles.columns}>
            {file.headers.map((h) => (
              <span key={h}>{h}</span>
            ))}
          </div>
          <div className={styles.file}>
            <Icon name="download" size={18} />
            <div>
              <b>{file.filename}</b>
              <small>A comma-separated spreadsheet file. It opens in Excel, Numbers and Google Sheets.</small>
            </div>
          </div>
        </>
      ) : (
        <p>No notes are shown right now, so there’s nothing to export. Clear the search or filters first.</p>
      )}
    </Dialog>
  );
}
