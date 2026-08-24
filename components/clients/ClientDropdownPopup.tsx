"use client";

import { useEffect, useRef, useState } from "react";
import { FieldOption } from "@/lib/clientTypes";
import { textColorForBg } from "@/lib/clientHelpers";
import { FloatingPanel } from "./FloatingPanel";

export function ClientDropdownPopup({
  title,
  options,
  current,
  anchorRect,
  onSelect,
  onOptionsChange,
  onClose,
}: {
  title: string;
  options: FieldOption[];
  current: string;
  anchorRect: DOMRect;
  onSelect: (label: string) => void;
  onOptionsChange: (options: FieldOption[]) => void;
  onClose: () => void;
}) {
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newColor, setNewColor] = useState("#EFF6FF");
  const renameRef = useRef<HTMLInputElement>(null);
  const addRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    renameRef.current?.focus();
    renameRef.current?.select();
  }, [renaming]);

  useEffect(() => {
    if (adding) addRef.current?.focus();
  }, [adding]);

  function startRename(label: string) {
    setRenaming(label);
    setRenameDraft(label);
  }

  function confirmRename() {
    const oldLabel = renaming;
    const label = renameDraft.trim();
    if (!oldLabel) return;
    if (!label || label === oldLabel) {
      setRenaming(null);
      return;
    }
    onOptionsChange(options.map((o) => (o.label === oldLabel ? { ...o, label } : o)));
    setRenaming(null);
  }

  function removeOption(label: string) {
    if (!confirm(`Remove option "${label}"?`)) return;
    onOptionsChange(options.filter((o) => o.label !== label));
  }

  function confirmAdd() {
    const label = newLabel.trim();
    if (!label) return;
    if (options.find((o) => o.label === label)) {
      addRef.current?.focus();
      return;
    }
    onOptionsChange([...options, { label, bg: newColor, color: textColorForBg(newColor) }]);
    setAdding(false);
    setNewLabel("");
    setNewColor("#EFF6FF");
  }

  return (
    <FloatingPanel anchorRect={anchorRect} width={244} onClose={onClose}>
      <div className="flex items-center justify-between px-2.5 py-2 border-b border-gray-200 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
        <span>{title}</span>
        <button onClick={onClose} className="w-5 h-5 flex items-center justify-center rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700">
          ✕
        </button>
      </div>
      <div className="p-1 max-h-60 overflow-y-auto">
        <div
          onClick={() => onSelect("")}
          className="flex items-center gap-1.5 px-2 py-1.5 rounded-md cursor-pointer text-xs text-gray-400 hover:bg-gray-50 mb-0.5"
        >
          <span className="w-3.5 text-center text-[10px]">✕</span> None
        </div>
        {options.map((opt) => {
          if (renaming === opt.label) {
            return (
              <div key={opt.label} className="flex items-center gap-1 p-0.5 rounded-md">
                <input
                  ref={renameRef}
                  value={renameDraft}
                  onChange={(e) => setRenameDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") confirmRename();
                    else if (e.key === "Escape") setRenaming(null);
                  }}
                  className="flex-1 h-7 text-xs rounded border border-accent px-1.5 outline-none"
                />
                <button onClick={confirmRename} className="w-[22px] h-[22px] flex items-center justify-center rounded text-emerald-600 hover:bg-gray-100" title="Save">
                  ✓
                </button>
                <button onClick={() => setRenaming(null)} className="w-[22px] h-[22px] flex items-center justify-center rounded text-gray-400 hover:bg-gray-100" title="Cancel">
                  ✕
                </button>
              </div>
            );
          }
          return (
            <div
              key={opt.label}
              className={`group flex items-center gap-1 p-0.5 rounded-md hover:bg-gray-50 ${opt.label === current ? "bg-accent/10" : ""}`}
            >
              <button
                onClick={() => onSelect(opt.label)}
                style={{ background: opt.bg, color: opt.color }}
                className="flex-1 flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium overflow-hidden text-ellipsis whitespace-nowrap text-left"
              >
                <span style={{ background: opt.color, opacity: 0.7 }} className="w-1.5 h-1.5 rounded-full shrink-0" />
                {opt.label}
              </button>
              <div className="flex gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => startRename(opt.label)}
                  className="w-[22px] h-[22px] flex items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-700 text-[10px]"
                  title="Rename"
                >
                  ✎
                </button>
                <button
                  onClick={() => removeOption(opt.label)}
                  className="w-[22px] h-[22px] flex items-center justify-center rounded text-gray-400 hover:bg-red-50 hover:text-red-700 text-[10px]"
                  title="Remove"
                >
                  🗑
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <div className="border-t border-gray-200 p-1">
        {!adding ? (
          <button
            onClick={() => setAdding(true)}
            className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium text-accent hover:bg-accent/10"
          >
            + Add option
          </button>
        ) : (
          <div className="flex flex-col gap-1.5 p-0.5">
            <div className="flex gap-1.5 items-center">
              <input
                type="color"
                value={newColor}
                onChange={(e) => setNewColor(e.target.value)}
                className="w-[30px] h-[30px] border border-gray-200 rounded-md p-0.5 cursor-pointer shrink-0"
              />
              <input
                ref={addRef}
                type="text"
                placeholder="Option name..."
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") confirmAdd();
                }}
                className="flex-1 h-[30px] text-xs border border-gray-200 rounded-md px-2 outline-none focus:border-accent"
              />
            </div>
            <div className="flex gap-1 justify-end">
              <button
                onClick={() => {
                  setAdding(false);
                  setNewLabel("");
                }}
                className="h-7 px-2.5 rounded-md text-xs border border-gray-200 text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button onClick={confirmAdd} className="h-7 px-2.5 rounded-md text-xs bg-accent text-white hover:opacity-90">
                Add
              </button>
            </div>
          </div>
        )}
      </div>
    </FloatingPanel>
  );
}
