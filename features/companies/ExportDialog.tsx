"use client";

// Export (guide 5.12, E1): what's in the file before it downloads. The companies shown now (search and filters apply, in
// the list's order, past the 100 on screen), with the company name and the fields the group's list shows, and the file's
// name. With nothing shown, it says there's nothing to export.
import type { PipelineEntry } from "@/lib/clientTypes";
import type { CompanyGroup } from "@/lib/companies";
import type { CompanyField } from "@/lib/companySettings";
import { countNoun, lookOf } from "@/lib/companyView";
import { plural } from "@/lib/dates";
import { downloadCsv } from "@/lib/exportCsv";
import { companiesCsv } from "@/lib/exports";
import Button from "@/ui/Button";
import Dialog from "@/ui/Dialog";
import Icon from "@/ui/Icon";
import { useToast } from "@/ui/Toaster";
import styles from "./Settings.module.css";

interface ExportDialogProps {
  group: CompanyGroup;
  companies: PipelineEntry[]; // shown now, in order
  fields: CompanyField[]; // the ones the list shows
  filtered: boolean;
  today: string;
  onClose: () => void;
}

const NAME_COLUMN = { key: "company", label: "Company" };

export default function ExportDialog({ group, companies, fields, filtered, today, onClose }: ExportDialogProps) {
  const toast = useToast();
  const label = lookOf(group).label;
  const n = companies.length;
  const columns = [NAME_COLUMN, ...fields];
  const file = companiesCsv([], columns, label, today).filename;

  function download() {
    const csv = companiesCsv(companies, columns, label, today);
    downloadCsv(csv.filename, csv.headers, csv.rows);
    onClose();
    toast(`Downloaded ${csv.filename}`);
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Export ${label}`}
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
            <b>{countNoun(group, n)}</b>
            {filtered ? ", as filtered now" : ""}, in the current order, with the {plural(columns.length, "field")} the list shows:
          </p>
          <div className={styles.columns}>
            {columns.map((f) => (
              <span key={f.key}>{f.label}</span>
            ))}
          </div>
          <div className={styles.file}>
            <Icon name="download" size={18} />
            <div>
              <b>{file}</b>
              <small>A comma-separated spreadsheet file. It opens in Excel, Numbers and Google Sheets.</small>
            </div>
          </div>
        </>
      ) : (
        <p>No companies are shown right now, so there’s nothing to export. Clear the filters or pick another group.</p>
      )}
    </Dialog>
  );
}
