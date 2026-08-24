"use client";

import { TableKey } from "@/lib/clientTypes";
import { FloatingPanel } from "./FloatingPanel";

const MOVE_TARGETS: Record<TableKey, { label: string; icon: string }> = {
  main: { label: "Prospects / Clients & Partners", icon: "📈" },
  raw: { label: "Raw List", icon: "☰" },
  hold: { label: "Hold or Reject", icon: "⊘" },
};

const ORDER: TableKey[] = ["main", "raw", "hold"];

export function ClientMovePopup({
  from,
  anchorRect,
  onMove,
  onClose,
}: {
  from: TableKey;
  anchorRect: DOMRect;
  onMove: (target: TableKey) => void;
  onClose: () => void;
}) {
  const targets = ORDER.filter((tk) => tk !== from);

  return (
    <FloatingPanel anchorRect={anchorRect} width={220} onClose={onClose}>
      <div className="flex items-center justify-between px-2.5 py-2 border-b border-gray-200 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
        <span>Move to</span>
        <button onClick={onClose} className="w-5 h-5 flex items-center justify-center rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700">
          ✕
        </button>
      </div>
      <div className="p-1">
        {targets.map((tk) => (
          <div
            key={tk}
            onClick={() => onMove(tk)}
            className="flex items-center gap-2 px-2.5 py-2 rounded-md cursor-pointer text-xs text-gray-700 hover:bg-accent/10 hover:text-accent"
          >
            <span className="w-3.5 text-center text-gray-400">{MOVE_TARGETS[tk].icon}</span>
            {MOVE_TARGETS[tk].label}
          </div>
        ))}
      </div>
    </FloatingPanel>
  );
}
