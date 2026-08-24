"use client";

import { useEffect, useState } from "react";
import { ColumnDef, ColumnType } from "@/lib/clientTypes";

const TYPE_LABELS: Record<ColumnType, string> = {
  text: "Text",
  number: "Number",
  date: "Date",
  dropdown: "Dropdown",
  textarea: "Long text",
  computed: "Auto",
};

function ColRow({
  col,
  onToggleVis,
  onRename,
  onWidthChange,
  onDelete,
}: {
  col: ColumnDef;
  onToggleVis: () => void;
  onRename: (label: string) => void;
  onWidthChange: (width: number | null) => void;
  onDelete: () => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(col.label);

  return (
    <div className={`flex items-center gap-1.5 px-2 py-1.5 border border-gray-200 rounded-md mb-1.5 bg-white ${col.visible ? "" : "opacity-45"}`}>
      <button
        onClick={onToggleVis}
        title={col.visible ? "Hide" : "Show"}
        className="w-[30px] h-[30px] shrink-0 flex items-center justify-center rounded-md border border-gray-200 text-gray-400 hover:bg-gray-50 hover:text-gray-700"
      >
        {col.visible ? "👁" : "🙈"}
      </button>
      {renaming ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            const label = draft.trim();
            if (label && label !== col.label) onRename(label);
            setRenaming(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") {
              setDraft(col.label);
              setRenaming(false);
            }
          }}
          className="flex-1 min-w-0 h-[26px] text-xs rounded border border-accent px-1.5 outline-none"
        />
      ) : (
        <span
          title="Click to rename"
          onClick={() => {
            setDraft(col.label);
            setRenaming(true);
          }}
          className="flex-1 min-w-0 text-[13px] font-medium text-gray-800 cursor-text truncate px-1 py-0.5 rounded hover:bg-gray-50"
        >
          {col.label}
        </span>
      )}
      <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-gray-400 bg-gray-100 rounded px-1.5 py-0.5">
        {TYPE_LABELS[col.type]}
      </span>
      <input
        type="number"
        defaultValue={col.width ?? ""}
        placeholder="auto"
        min={40}
        max={800}
        title="Min width px"
        onBlur={(e) => onWidthChange(e.target.value ? parseInt(e.target.value, 10) : null)}
        className="shrink-0 w-[50px] h-[26px] text-xs rounded border border-gray-200 px-1.5 outline-none focus:border-accent"
      />
      {col.custom ? (
        <button
          onClick={onDelete}
          title="Remove column"
          className="w-[30px] h-[30px] shrink-0 flex items-center justify-center rounded-md border border-gray-200 text-gray-400 hover:bg-red-50 hover:text-red-700"
        >
          🗑
        </button>
      ) : (
        <div className="w-[30px] shrink-0" />
      )}
    </div>
  );
}

export function ClientColumnManager({
  tabLabel,
  columns,
  onToggleVis,
  onRename,
  onWidthChange,
  onDeleteCustom,
  onAddColumn,
  onClose,
}: {
  tabLabel: string;
  columns: ColumnDef[];
  onToggleVis: (key: string) => void;
  onRename: (key: string, label: string) => void;
  onWidthChange: (key: string, width: number | null) => void;
  onDeleteCustom: (key: string) => void;
  onAddColumn: (label: string, type: ColumnType) => void;
  onClose: () => void;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newType, setNewType] = useState<ColumnType>("text");

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  function confirmAdd() {
    const label = newLabel.trim();
    if (!label) return;
    onAddColumn(label, newType);
    setAddOpen(false);
    setNewLabel("");
    setNewType("text");
  }

  return (
    <div
      className="fixed inset-0 bg-black/30 z-[300] flex justify-end"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-[340px] max-w-[95vw] h-screen bg-white border-l border-gray-200 shadow-xl flex flex-col overflow-hidden">
        <div className="p-4 border-b border-gray-200 flex items-start justify-between gap-2.5 shrink-0">
          <div>
            <div className="text-[15px] font-semibold text-gray-900">Manage Columns</div>
            <div className="text-[11px] text-gray-400 mt-0.5">{tabLabel}</div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-md border border-gray-200 text-gray-400 hover:bg-gray-50 hover:text-gray-700">
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2.5">
          {columns.map((col) => (
            <ColRow
              key={col.key}
              col={col}
              onToggleVis={() => onToggleVis(col.key)}
              onRename={(label) => onRename(col.key, label)}
              onWidthChange={(w) => onWidthChange(col.key, w)}
              onDelete={() => onDeleteCustom(col.key)}
            />
          ))}

          <div className="border-t border-gray-200 mt-2 pt-2.5">
            {!addOpen ? (
              <button
                onClick={() => setAddOpen(true)}
                className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium text-accent hover:bg-accent/10"
              >
                + Add column
              </button>
            ) : (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 flex flex-col gap-2.5">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1">Column name</label>
                  <input
                    autoFocus
                    type="text"
                    placeholder="e.g. Contract Value"
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") confirmAdd();
                    }}
                    className="w-full h-8 text-xs border border-gray-200 rounded-md px-2 outline-none focus:border-accent"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1">Type</label>
                  <select
                    value={newType}
                    onChange={(e) => setNewType(e.target.value as ColumnType)}
                    className="w-full h-8 text-xs border border-gray-200 rounded-md px-2 outline-none focus:border-accent"
                  >
                    <option value="text">Text (short)</option>
                    <option value="textarea">Long text</option>
                    <option value="number">Number</option>
                    <option value="date">Date</option>
                    <option value="dropdown">Dropdown (with options)</option>
                  </select>
                </div>
                <div className="flex gap-1.5 justify-end">
                  <button
                    onClick={() => setAddOpen(false)}
                    className="h-[30px] px-3 rounded-md text-xs border border-gray-200 text-gray-600 hover:bg-white"
                  >
                    Cancel
                  </button>
                  <button onClick={confirmAdd} className="h-[30px] px-3 rounded-md text-xs bg-accent text-white hover:opacity-90">
                    ✓ Add
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
