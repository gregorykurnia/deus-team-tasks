"use client";

// Export (guide 5.12, 6.7, E1): always the full record, whatever the search and filters show, one row per company with
// each subsidiary after its parent company, and sectors written the way the breakdown shows them. With nothing on record,
// there's nothing to export.
import { downloadCsv } from "@/lib/exportCsv";
import { pastClientsCsv } from "@/lib/exports";
import type { HistoricalClient } from "@/lib/pastClients";
import { parentCompanies, subsidiaries, type Figures } from "@/lib/pastView";
import Button from "@/ui/Button";
import Dialog from "@/ui/Dialog";
import Icon from "@/ui/Icon";
import { useToast } from "@/ui/Toaster";
import styles from "./Past.module.css";

interface PastExportDialogProps {
  clients: HistoricalClient[];
  figures: Figures | null;
  filtered: boolean; // the search or a filter is on: the file still holds everything
  today: string;
  onClose: () => void;
}

export default function PastExportDialog({ clients, figures, filtered, today, onClose }: PastExportDialogProps) {
  const toast = useToast();
  const n = figures ? figures.parents + figures.subs : 0;
  const file = pastClientsCsv([], today);

  function download() {
    const csv = pastClientsCsv(clients, today);
    downloadCsv(csv.filename, csv.headers, csv.rows);
    onClose();
    toast(`Downloaded ${csv.filename}`);
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Export past clients"
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
      {n && figures ? (
        <>
          <p>
            The full record: <b>{parentCompanies(figures.parents)}</b> and <b>{subsidiaries(figures.subs)}</b>, one row each
            {filtered ? ", whatever the search and filters show" : ""}. Each subsidiary follows its parent company. Columns:
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
              <small>A comma-separated spreadsheet file. Sectors are written the way the breakdown shows them.</small>
            </div>
          </div>
        </>
      ) : (
        <p>There are no past clients on record yet, so there’s nothing to export.</p>
      )}
    </Dialog>
  );
}
