// Types for the Clients (pipeline tracker) view. Mirrors the standalone
// client-pipeline-tracker app's data model 1:1.

export interface PipelineEntry {
  id: number;
  company: string;
  type?: string;
  date?: string;
  status?: string;
  pic?: string;
  sourcing?: string;
  product?: string;
  priority?: string;
  industry?: string;
  notes?: string;
  target?: string;
  reach?: string;
  reason?: string;
  _raw?: boolean;
  _hold?: boolean;
  // custom columns (key like "cx_<timestamp>") hold arbitrary scalar values
  [key: string]: string | number | boolean | undefined;
}

export type NewPipelineEntry = Omit<PipelineEntry, "id">;

export interface FieldOption {
  label: string;
  bg: string;
  color: string;
}

export type FieldOptionsMap = Record<string, FieldOption[]>;

export type ColumnType = "text" | "number" | "date" | "dropdown" | "textarea" | "computed";

export interface ColumnDef {
  key: string;
  label: string;
  type: ColumnType;
  width: number | null;
  sortKey: string;
  visible: boolean;
  custom: boolean;
}

export type TableKey = "main" | "raw" | "hold";

export type ColConfig = Record<TableKey, ColumnDef[]>;

export type PipelineTab = "prospect" | "done" | "rawlist" | "holdreject";

export const DEFAULT_FIELD_OPTIONS: FieldOptionsMap = {
  type: [
    { label: "Client", bg: "#EFF6FF", color: "#1E40AF" },
    { label: "Partner", bg: "#ECFDF5", color: "#065F46" },
    { label: "Individual Partner", bg: "#FDF4FF", color: "#6B21A8" },
  ],
  status: [
    { label: "Client / Partner Done Deal", bg: "#ECFDF5", color: "#065F46" },
    { label: "To Follow Up", bg: "#EFF6FF", color: "#1E40AF" },
    { label: "Waiting For Our Actions", bg: "#FFFBEB", color: "#92400E" },
    { label: "Scheduling In Progress", bg: "#F5F3FF", color: "#4C1D95" },
    { label: "Meeting Soon", bg: "#ECFDF5", color: "#065F46" },
    { label: "Raw List", bg: "#F9FAFB", color: "#374151" },
    { label: "Drop", bg: "#FEF2F2", color: "#991B1B" },
  ],
  priority: [
    { label: "High", bg: "#FEF2F2", color: "#991B1B" },
    { label: "Medium", bg: "#FFFBEB", color: "#92400E" },
    { label: "Low", bg: "#F0FDF4", color: "#14532D" },
  ],
};

export const BUILTIN_COLS: Record<TableKey, ColumnDef[]> = {
  main: [
    { key: "company", label: "Company", type: "text", width: null, sortKey: "company", visible: true, custom: false },
    { key: "type", label: "Type", type: "dropdown", width: null, sortKey: "type", visible: true, custom: false },
    { key: "date", label: "Last Action", type: "date", width: null, sortKey: "date", visible: true, custom: false },
    { key: "since", label: "Since", type: "computed", width: null, sortKey: "since", visible: true, custom: false },
    { key: "status", label: "Status", type: "dropdown", width: null, sortKey: "status", visible: true, custom: false },
    { key: "pic", label: "PIC", type: "text", width: null, sortKey: "pic", visible: true, custom: false },
    { key: "sourcing", label: "Sourcing", type: "text", width: null, sortKey: "sourcing", visible: true, custom: false },
    { key: "product", label: "Product", type: "text", width: 140, sortKey: "product", visible: true, custom: false },
    { key: "priority", label: "Priority", type: "dropdown", width: null, sortKey: "priority", visible: true, custom: false },
    { key: "industry", label: "Industry", type: "text", width: 140, sortKey: "industry", visible: true, custom: false },
    { key: "notes", label: "Next Actions", type: "textarea", width: 180, sortKey: "notes", visible: true, custom: false },
    { key: "target", label: "Target Date", type: "date", width: 120, sortKey: "target", visible: true, custom: false },
  ],
  raw: [
    { key: "company", label: "Company", type: "text", width: null, sortKey: "company", visible: true, custom: false },
    { key: "type", label: "Type", type: "dropdown", width: null, sortKey: "type", visible: true, custom: false },
    { key: "reach", label: "Planned Reach Out", type: "date", width: 140, sortKey: "reach", visible: true, custom: false },
    { key: "industry", label: "Industry", type: "text", width: null, sortKey: "industry", visible: true, custom: false },
    { key: "sourcing", label: "Sourcing", type: "text", width: null, sortKey: "sourcing", visible: true, custom: false },
    { key: "priority", label: "Priority", type: "dropdown", width: null, sortKey: "priority", visible: true, custom: false },
    { key: "notes", label: "Notes", type: "textarea", width: 200, sortKey: "notes", visible: true, custom: false },
  ],
  hold: [
    { key: "company", label: "Company", type: "text", width: null, sortKey: "company", visible: true, custom: false },
    { key: "type", label: "Type", type: "dropdown", width: null, sortKey: "type", visible: true, custom: false },
    { key: "product", label: "Product Offered", type: "text", width: 160, sortKey: "product", visible: true, custom: false },
    { key: "reason", label: "Reason for Rejection / Hold", type: "textarea", width: 260, sortKey: "reason", visible: true, custom: false },
  ],
};

export const FIELD_TITLES: Record<string, string> = {
  company: "Company",
  pic: "PIC",
  sourcing: "Sourcing",
  product: "Product",
  industry: "Industry",
  notes: "Next Actions",
  reason: "Reason / Hold",
  reach: "Planned Reach Out",
  target: "Target Date",
  date: "Last Action Date",
  type: "Type",
  status: "Status",
  priority: "Priority",
  since: "Days Since",
};

export const PRIO_ORDER: Record<string, number> = { High: 0, Medium: 1, Low: 2, "": 3 };
