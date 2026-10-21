// A company as stored in the client tracker's pipeline collection.

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
  answer?: string; // No or not now only: "Not now" (on hold) or "No" (rejected)
  _raw?: boolean;
  _hold?: boolean;
  // custom columns (key like "cx_<timestamp>") hold arbitrary scalar values
  [key: string]: string | number | boolean | undefined;
}

export type TableKey = "main" | "raw" | "hold";
