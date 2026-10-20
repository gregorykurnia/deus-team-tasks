"use client";

// What every overlay shares (guide 4.11, 8): Esc closes the top one, focus goes in and comes back,
// Tab stays inside a sheet or dialog, and a sheet or dialog stops the page behind from scrolling.
// Call it from the component that mounts when the overlay opens.
import { useEffect, useRef, useState, type RefObject } from "react";
import { closeTopLayer, hasLayer, lockCount, pushLayer, type LayerKind } from "./overlayStack";

interface OverlayOptions {
  kind: LayerKind;
  onClose: () => void;
  panel: RefObject<HTMLElement | null>;
  restore?: RefObject<HTMLElement | null>; // what gets focus back; the focused element at opening by default
  initialFocus?: string | string[]; // selectors inside the panel, tried in order
  trap?: boolean; // keep Tab inside; on for sheets and dialogs
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

let escapeBound = false;
function bindEscape() {
  if (escapeBound) return;
  escapeBound = true;
  document.addEventListener("keydown", (e) => {
    // React listens on the same node, so a picker's stopPropagation can't stop this: it marks the key
    // handled with preventDefault instead (Esc closes its list, not the sheet around it).
    if (e.defaultPrevented || e.isComposing) return;
    if (e.key === "Escape" && closeTopLayer()) {
      e.preventDefault();
      e.stopPropagation();
    }
  });
}

let savedOverflow: string | null = null;
function lockScroll() {
  if (savedOverflow !== null) return;
  savedOverflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";
}
function unlockScroll() {
  if (savedOverflow === null || lockCount() > 0) return;
  document.body.style.overflow = savedOverflow;
  savedOverflow = null;
}

export function useOverlay({ kind, onClose, panel, restore, initialFocus, trap = kind !== "menu" }: OverlayOptions) {
  // A dialog opened over a sheet sits above it; this is decided once, as it opens.
  const [overSheet] = useState(() => kind === "dialog" && hasLayer("sheet"));
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    const el = panel.current;
    if (!el) return;
    bindEscape();
    const opener = restore?.current ?? (document.activeElement as HTMLElement | null);
    const lock = kind !== "menu";
    const remove = pushLayer({ kind, lock, close: () => closeRef.current() });
    if (lock) lockScroll();

    const wanted = [initialFocus ?? []].flat();
    const first = wanted.map((selector) => el.querySelector<HTMLElement>(selector)).find(Boolean) ?? el.querySelector<HTMLElement>(FOCUSABLE) ?? el;
    first.focus({ preventScroll: true });

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Tab" || !trap) return;
      const items = [...el!.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const head = items[0];
      const tail = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === head || document.activeElement === el)) {
        e.preventDefault();
        tail.focus();
      } else if (!e.shiftKey && document.activeElement === tail) {
        e.preventDefault();
        head.focus();
      }
    }
    el.addEventListener("keydown", onKeyDown);

    return () => {
      el.removeEventListener("keydown", onKeyDown);
      remove();
      if (lock) unlockScroll();
      const active = document.activeElement;
      if (opener?.isConnected && (!active || active === document.body || el.contains(active))) opener.focus({ preventScroll: true });
    };
    // The overlay's component mounts when it opens, so this runs once per opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { overSheet };
}
