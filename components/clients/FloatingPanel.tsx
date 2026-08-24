"use client";

import { useEffect, useRef, useState } from "react";

export function FloatingPanel({
  anchorRect,
  width = 244,
  onClose,
  children,
}: {
  anchorRect: DOMRect;
  width?: number;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    function place() {
      if (!ref.current) return;
      const h = ref.current.offsetHeight || 200;
      let top = anchorRect.bottom + 6;
      let left = anchorRect.left;
      if (left + width > window.innerWidth - 8) left = window.innerWidth - width - 8;
      if (top + h > window.innerHeight - 8) top = anchorRect.top - 6 - h;
      setPos({ top: Math.max(8, top), left: Math.max(8, left) });
    }
    place();
  }, [anchorRect, width]);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    // Defer so the triggering click doesn't immediately close the panel.
    const t = setTimeout(() => document.addEventListener("mousedown", onDown), 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", onDown);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      style={{ position: "fixed", top: pos?.top ?? -9999, left: pos?.left ?? -9999, width, zIndex: 500 }}
      className="bg-white border border-gray-200 rounded-lg shadow-lg"
    >
      {children}
    </div>
  );
}
