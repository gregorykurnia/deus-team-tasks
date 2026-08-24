"use client";

import { useEffect, useRef, useState } from "react";
import { FloatingPanel } from "./FloatingPanel";

export function ClientTextPopup({
  title,
  value,
  multiline,
  isNumber,
  anchorRect,
  onSave,
  onClose,
}: {
  title: string;
  value: string;
  multiline?: boolean;
  isNumber?: boolean;
  anchorRect: DOMRect;
  onSave: (value: string) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    if (!multiline && inputRef.current && "select" in inputRef.current) {
      (inputRef.current as HTMLInputElement).select();
    }
  }, [multiline]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  function save() {
    onSave(multiline ? draft.trim() : isNumber ? draft : draft.trim());
    onClose();
  }

  return (
    <FloatingPanel anchorRect={anchorRect} width={280} onClose={onClose}>
      <div className="flex items-center justify-between px-2.5 py-2 border-b border-gray-200 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
        <span>{title}</span>
        <button onClick={onClose} className="w-5 h-5 flex items-center justify-center rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700">
          ✕
        </button>
      </div>
      <div className="p-3">
        {multiline ? (
          <textarea
            ref={inputRef as React.RefObject<HTMLTextAreaElement>}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={4}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === "Enter") save();
            }}
            className="w-full text-[13px] border border-gray-200 rounded-md px-2.5 py-2 outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 resize-y"
          />
        ) : (
          <input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            type={isNumber ? "number" : "text"}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
            }}
            className="w-full h-9 text-[13px] border border-gray-200 rounded-md px-2.5 outline-none focus:border-accent focus:ring-2 focus:ring-accent/10"
          />
        )}
        <div className="flex items-center justify-between mt-2">
          <span className="text-[11px] text-gray-400">{multiline ? "Ctrl+Enter to save" : ""}</span>
          <button
            onClick={save}
            className="h-[30px] px-3 rounded-md text-xs font-medium bg-accent text-white hover:opacity-90"
          >
            ✓ Save
          </button>
        </div>
      </div>
    </FloatingPanel>
  );
}
