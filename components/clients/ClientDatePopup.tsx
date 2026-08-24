"use client";

import { useState } from "react";
import { FloatingPanel } from "./FloatingPanel";

export function ClientDatePopup({
  title,
  value,
  anchorRect,
  onSave,
  onClose,
}: {
  title: string;
  value: string;
  anchorRect: DOMRect;
  onSave: (value: string) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(value);

  return (
    <FloatingPanel anchorRect={anchorRect} width={224} onClose={onClose}>
      <div className="flex items-center justify-between px-2.5 py-2 border-b border-gray-200 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
        <span>{title}</span>
        <button onClick={onClose} className="w-5 h-5 flex items-center justify-center rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700">
          ✕
        </button>
      </div>
      <div className="p-3">
        <input
          type="date"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="w-full h-9 text-[13px] border border-gray-200 rounded-md px-2.5 outline-none focus:border-accent focus:ring-2 focus:ring-accent/10"
        />
        <div className="flex gap-1.5 justify-end mt-2.5">
          <button
            onClick={() => {
              onSave("");
              onClose();
            }}
            className="h-[30px] px-3 rounded-md text-xs font-medium border border-gray-200 text-gray-600 hover:bg-gray-50"
          >
            Clear
          </button>
          <button
            onClick={() => {
              onSave(draft);
              onClose();
            }}
            className="h-[30px] px-3 rounded-md text-xs font-medium bg-accent text-white hover:opacity-90"
          >
            ✓ Set
          </button>
        </div>
      </div>
    </FloatingPanel>
  );
}
