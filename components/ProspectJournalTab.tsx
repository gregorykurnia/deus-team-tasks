"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  createEmptyProspectJournalEntry,
  PROSPECT_JOURNAL_FIELDS,
  ProspectJournalEntry,
} from "@/lib/prospectJournalTypes";
import { useProspectJournal } from "@/lib/useProspectJournal";
import { useClientPipeline } from "@/lib/useClientPipeline";
import { PipelineEntry } from "@/lib/clientTypes";
import { downloadCsv } from "@/lib/exportCsv";

const STATUS_OPTIONS = ["", "Very High", "High", "Medium", "Moderately Low", "Low"];

function JournalRow({
  entry,
  onSave,
  onDelete,
  onOpenClient,
  pipelineEntries,
}: {
  entry: ProspectJournalEntry;
  onSave: (entry: ProspectJournalEntry) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onOpenClient: (pipelineEntryId: number) => void;
  pipelineEntries: PipelineEntry[];
}) {
  const [draft, setDraft] = useState(entry);
  const [saving, setSaving] = useState(false);
  const [remarksExpanded, setRemarksExpanded] = useState(false);
  const remarksRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!remarksExpanded) return;
    const frame = window.requestAnimationFrame(() => remarksRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [remarksExpanded]);

  function update(key: keyof ProspectJournalEntry, value: string) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function persist() {
    if (JSON.stringify(draft) === JSON.stringify(entry)) return;
    setSaving(true);
    try {
      await onSave({ ...draft, updatedAt: Date.now() });
    } finally {
      setSaving(false);
    }
  }

  return (
    <tr
      data-pipeline-entry-id={entry.pipelineEntryId}
      className="group align-top bg-white hover:bg-indigo-50/20 transition-colors"
    >
      <td className="sticky left-0 z-10 w-52 min-w-52 border-b border-r border-gray-200 bg-white group-hover:bg-[#fafaff] p-3">
        <div className="flex items-start gap-2">
          <textarea
            value={draft.prospectName}
            onChange={(event) => update("prospectName", event.target.value)}
            onBlur={persist}
            rows={3}
            aria-label="Prospect name"
            placeholder="Prospect name"
            className="min-h-24 w-full resize-none rounded-lg border border-transparent bg-transparent px-2.5 py-2 text-sm font-semibold text-gray-900 outline-none placeholder:font-normal placeholder:text-gray-400 hover:border-gray-200 focus:border-accent/40 focus:bg-white focus:ring-2 focus:ring-accent/10"
          />
          <button
            onClick={() => onDelete(entry.id)}
            aria-label={`Delete ${draft.prospectName || "prospect"}`}
            title="Delete row"
            className="mt-1 shrink-0 rounded-md px-1.5 py-1 text-gray-300 opacity-0 transition hover:bg-red-50 hover:text-red-500 group-hover:opacity-100 focus:opacity-100"
          >
            ×
          </button>
        </div>
        <span className={`ml-2 text-[10px] text-gray-400 transition-opacity ${saving ? "opacity-100" : "opacity-0"}`}>
          Saving…
        </span>
        {entry.pipelineEntryId != null && (
          <button
            onClick={() => onOpenClient(entry.pipelineEntryId!)}
            className="ml-2 mt-2 inline-flex items-center gap-1 rounded-md border border-accent/20 bg-accent/5 px-2.5 py-1.5 text-[11px] font-medium text-accent transition hover:bg-accent/10"
          >
            Client details ↗
          </button>
        )}
        {entry.pipelineEntryId == null && (
          <select
            value=""
            aria-label={`Link ${draft.prospectName || "prospect"} to client pipeline`}
            onChange={(event) => {
              const pipelineEntryId = Number(event.target.value);
              const pipelineEntry = pipelineEntries.find((item) => item.id === pipelineEntryId);
              if (!pipelineEntry) return;
              const next = {
                ...draft,
                pipelineEntryId,
                prospectName: draft.prospectName || pipelineEntry.company,
                updatedAt: Date.now(),
              };
              setDraft(next);
              void onSave(next);
            }}
            className="ml-2 mt-2 block max-w-[160px] rounded-md border border-gray-200 bg-white px-2 py-1.5 text-[11px] text-gray-500 outline-none hover:border-accent/30 focus:border-accent/40 focus:ring-2 focus:ring-accent/10"
          >
            <option value="">Link to pipeline…</option>
            {pipelineEntries.map((pipelineEntry) => (
              <option key={pipelineEntry.id} value={pipelineEntry.id}>{pipelineEntry.company}</option>
            ))}
          </select>
        )}
      </td>
      {PROSPECT_JOURNAL_FIELDS.map((field) => (
        <td key={field.key} className={`${field.key === "detailedRemarks" ? "min-w-[26rem]" : "min-w-72"} border-b border-r border-gray-200 p-3`}>
          {field.key === "detailedRemarks" ? (
            remarksExpanded ? (
              <div className="rounded-lg border border-accent/30 bg-indigo-50/30 p-2.5 shadow-sm">
                <div className="mb-2 flex items-center justify-between gap-2 px-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-accent">Long-form notes</span>
                  <button
                    type="button"
                    onClick={() => setRemarksExpanded(false)}
                    className="rounded-md px-2 py-1 text-[11px] font-medium text-gray-500 transition hover:bg-white hover:text-gray-800"
                  >
                    Collapse ↑
                  </button>
                </div>
                <textarea
                  ref={remarksRef}
                  value={draft.detailedRemarks}
                  onChange={(event) => update("detailedRemarks", event.target.value)}
                  onBlur={persist}
                  rows={8}
                  aria-label={`Detailed remarks for ${draft.prospectName || "prospect"}`}
                  placeholder="Write the full context, history, concerns, or other long-form remarks…"
                  className="min-h-44 w-full resize-y rounded-md border border-white bg-white px-3 py-2.5 text-sm leading-5 text-gray-700 outline-none placeholder:text-gray-300 focus:border-accent/40 focus:ring-2 focus:ring-accent/10"
                />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setRemarksExpanded(true)}
                aria-expanded={false}
                aria-label={`${draft.detailedRemarks ? "View" : "Add"} detailed remarks for ${draft.prospectName || "prospect"}`}
                className="group/remarks min-h-24 w-full rounded-lg border border-dashed border-gray-200 bg-gray-50/50 p-3 text-left transition hover:border-accent/30 hover:bg-indigo-50/30 focus:border-accent/40 focus:outline-none focus:ring-2 focus:ring-accent/10"
              >
                <span className="flex items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400 group-hover/remarks:text-accent">
                  <span>{draft.detailedRemarks ? "Detailed remarks" : "Add detailed remarks"}</span>
                  <span className="text-sm normal-case text-gray-300 group-hover/remarks:text-accent">↗</span>
                </span>
                <span className={`mt-2 block whitespace-pre-wrap text-sm leading-5 ${draft.detailedRemarks ? "line-clamp-4 text-gray-600" : "text-gray-400"}`}>
                  {draft.detailedRemarks || "Click to expand and write long-form notes…"}
                </span>
              </button>
            )
          ) : field.key === "opportunityStatus" ? (
            <select
              value={draft[field.key]}
              onChange={(event) => {
                const next = { ...draft, [field.key]: event.target.value };
                setDraft(next);
                void onSave({ ...next, updatedAt: Date.now() });
              }}
              aria-label={`${field.label} for ${draft.prospectName || "prospect"}`}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-700 outline-none focus:border-accent/40 focus:ring-2 focus:ring-accent/10"
            >
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>{status || "Select status…"}</option>
              ))}
            </select>
          ) : (
            <textarea
              value={draft[field.key]}
              onChange={(event) => update(field.key, event.target.value)}
              onBlur={persist}
              rows={4}
              aria-label={`${field.label} for ${draft.prospectName || "prospect"}`}
              placeholder={`Add ${field.label.toLowerCase()}…`}
              className="min-h-28 w-full resize-y rounded-lg border border-transparent bg-transparent px-3 py-2.5 text-sm leading-5 text-gray-700 outline-none placeholder:text-gray-300 hover:border-gray-200 hover:bg-white focus:border-accent/40 focus:bg-white focus:ring-2 focus:ring-accent/10"
            />
          )}
        </td>
      ))}
    </tr>
  );
}

export function ProspectJournalTab({
  focusPipelineEntryId,
  onEntryFocused,
  onOpenClient,
}: {
  focusPipelineEntryId?: number | null;
  onEntryFocused?: () => void;
  onOpenClient: (pipelineEntryId: number) => void;
}) {
  const { entries, loading, saveEntry, deleteEntry } = useProspectJournal();
  const { entries: pipelineEntries } = useClientPipeline();
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (focusPipelineEntryId == null || loading) return;
    const frame = window.requestAnimationFrame(() => {
      setSearch("");
      document.querySelector(`[data-pipeline-entry-id="${focusPipelineEntryId}"]`)?.scrollIntoView({ behavior: "smooth", block: "center", inline: "start" });
      onEntryFocused?.();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [focusPipelineEntryId, loading, onEntryFocused]);

  const visibleEntries = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return entries;
    return entries.filter((entry) => Object.values(entry).join(" ").toLowerCase().includes(query));
  }, [entries, search]);

  async function addRow() {
    const entry = createEmptyProspectJournalEntry(crypto.randomUUID());
    await saveEntry(entry);
  }

  async function removeRow(id: string) {
    if (window.confirm("Delete this prospect journal row?")) await deleteEntry(id);
  }

  function exportCsv() {
    downloadCsv(
      `prospect-journal-${new Date().toISOString().slice(0, 10)}.csv`,
      ["Prospect", ...PROSPECT_JOURNAL_FIELDS.map((field) => field.label)],
      visibleEntries.map((entry) => [
        entry.prospectName,
        ...PROSPECT_JOURNAL_FIELDS.map((field) => entry[field.key]),
      ])
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2 text-xs font-medium text-accent">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-accent/10">✦</span>
            Clients workspace
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-950">Prospect Journal</h1>
          <p className="mt-1 text-sm text-gray-500">Capture the context behind every opportunity, from need to next step.</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="relative">
            <span className="sr-only">Search journal</span>
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">⌕</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search prospects…"
              className="h-10 w-48 rounded-lg border border-gray-200 bg-white pl-8 pr-3 text-sm outline-none transition focus:border-accent/40 focus:ring-2 focus:ring-accent/10 sm:w-56"
            />
          </label>
          <button onClick={exportCsv} className="h-10 whitespace-nowrap rounded-lg border border-gray-200 bg-white px-3.5 text-sm font-medium text-gray-600 transition hover:bg-gray-50">
            ↓ Export to CSV
          </button>
          <button onClick={addRow} className="h-10 whitespace-nowrap rounded-lg bg-accent px-4 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700">
            + Add prospect
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 text-xs text-gray-400">
        <span className="rounded-full border border-gray-200 bg-white px-2.5 py-1 font-medium text-gray-600">{entries.length} prospects</span>
        <span>Changes save automatically when you leave a cell</span>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-max min-w-full border-separate border-spacing-0 text-left">
            <thead>
              <tr>
                <th className="sticky left-0 top-0 z-30 w-52 min-w-52 border-b border-r border-gray-200 bg-gray-50/95 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 backdrop-blur">
                  Prospect
                </th>
                {PROSPECT_JOURNAL_FIELDS.map((field, index) => (
                  <th key={field.key} className="sticky top-0 z-20 min-w-72 border-b border-r border-gray-200 bg-gray-50/95 px-5 py-3 backdrop-blur">
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 flex h-5 min-w-5 items-center justify-center rounded bg-indigo-100 text-[10px] font-semibold text-indigo-600">{index + 1}</span>
                      <span className="text-xs font-semibold leading-5 text-gray-600">{field.label}</span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleEntries.map((entry) => (
                <JournalRow
                  key={`${entry.id}-${entry.updatedAt}`}
                  entry={entry}
                  onSave={saveEntry}
                  onDelete={removeRow}
                  onOpenClient={onOpenClient}
                  pipelineEntries={pipelineEntries}
                />
              ))}
            </tbody>
          </table>
          {!loading && visibleEntries.length === 0 && (
            <div className="sticky left-0 flex min-h-64 w-[calc(100vw-3rem)] max-w-3xl flex-col items-center justify-center px-6 text-center md:w-[calc(100vw-17rem)]">
              <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50 text-xl text-accent">✦</span>
              <p className="text-sm font-semibold text-gray-800">{search ? "No matching prospects" : "Your journal is ready"}</p>
              <p className="mt-1 max-w-sm text-sm text-gray-400">{search ? "Try another search term." : "Add your first prospect and capture the full opportunity story in one place."}</p>
              {!search && <button onClick={addRow} className="mt-4 rounded-lg border border-accent/20 bg-accent/5 px-3 py-2 text-sm font-medium text-accent hover:bg-accent/10">+ Add first prospect</button>}
            </div>
          )}
          {loading && <div className="sticky left-0 w-[calc(100vw-3rem)] py-24 text-center text-sm text-gray-400 md:w-[calc(100vw-17rem)]">Loading journal…</div>}
        </div>
      </div>
    </section>
  );
}
