"use client";

// Menus (guide 4.3): a floating card that opens below its button, or above when there's no room, kept 12px inside the
// window. Variants: pick one, pick several, a number, a red item, a disabled item with its reason, a colour palette.
// Arrow keys move, Enter picks, Esc or a tap outside closes, and focus goes back to the button.
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import Button from "./Button";
import Icon, { type IconName } from "./Icon";
import type { OptionTone } from "./OptionChip";
import { inView, placeMenu } from "./placeMenu";
import { useIsClient } from "./useIsClient";
import { hasLayer } from "./overlayStack";
import { useOverlay } from "./useOverlay";
import styles from "./Menu.module.css";

interface MenuProps {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>; // the button that opened it
  onClose: () => void;
  label: string; // what the menu is for, as a screen reader hears it: "Due"
  alignRight?: boolean;
  form?: boolean; // a quick editor: Tab moves between its field and buttons instead of closing it, and it is 340px wide. It holds a field and buttons, not items, so it is a dialog (ARIA lets a menu hold only items)
  initialFocus?: string[]; // selectors for what gets focus, in place of the chosen item, the first item or the field
  children: ReactNode;
}

const MenuContext = createContext<{ close: () => void } | null>(null);

function useMenu() {
  const menu = useContext(MenuContext);
  if (!menu) throw new Error("A menu item has to sit inside a Menu.");
  return menu;
}

export default function Menu(props: MenuProps) {
  const client = useIsClient();
  if (!props.open || !client) return null;
  return createPortal(<MenuPanel {...props} />, document.body);
}

const ITEMS = '[role^="menuitem"]:not(:disabled)';

function MenuPanel({ anchorRef, onClose, label, alignRight, form, initialFocus, children }: MenuProps) {
  const panel = useRef<HTMLDivElement>(null);
  // A menu opened from inside a dialog (an option's colour) sits above it; decided once, as it opens.
  const [overDialog] = useState(() => hasLayer("dialog"));
  useOverlay({ kind: "menu", onClose, panel, restore: anchorRef, trap: form, initialFocus: initialFocus ?? ['[aria-checked="true"]', ITEMS, "input"] });

  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  // Placed before it is painted, so it never shows in the wrong place, and placed again when the page scrolls or the
  // window changes size, so it stays with its button. A button scrolled out of sight closes it.
  useLayoutEffect(() => {
    const el = panel.current!;
    function place() {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const box = anchor.getBoundingClientRect();
      const viewport = { width: window.innerWidth, height: window.innerHeight };
      if (!inView(box, viewport)) {
        closeRef.current();
        return;
      }
      el.style.maxHeight = ""; // measure its full height
      const { left, top, maxHeight } = placeMenu(box, { width: el.offsetWidth, height: el.offsetHeight }, viewport, { alignRight });
      el.style.left = `${left}px`;
      el.style.top = `${top}px`;
      el.style.maxHeight = `min(440px, ${maxHeight}px)`;
      el.style.visibility = "visible";
    }
    place();
    const onScroll = (e: Event) => {
      if (e.target instanceof Node && el.contains(e.target)) return; // the menu's own list scrolling
      place();
    };
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", place);
    };
  }, [anchorRef, alignRight]);

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "Tab") {
      if (!form) onClose();
      return;
    }
    // A field keeps its own arrow keys, except the number field of a menu row (4.5), where they move between items.
    const active = document.activeElement;
    if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
      if (!active.closest('[role^="menuitem"]') || (e.key !== "ArrowDown" && e.key !== "ArrowUp")) return;
    }
    const items = [...panel.current!.querySelectorAll<HTMLElement>(ITEMS)];
    const at = items.findIndex((el) => el === active || el.contains(active));
    const go = (i: number) => {
      e.preventDefault();
      items[(i + items.length) % items.length]?.focus();
    };
    if (e.key === "ArrowDown") go(at + 1);
    else if (e.key === "ArrowUp") go(at - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(items.length - 1);
  }

  return (
    <MenuContext.Provider value={{ close: onClose }}>
      <div className={overDialog ? `${styles.catcher} ${styles.overDialog}` : styles.catcher} onClick={onClose} aria-hidden="true" />
      <div ref={panel} className={[styles.menu, form && styles.form, overDialog && styles.overDialog].filter(Boolean).join(" ")} role={form ? "dialog" : "menu"} aria-label={label} onKeyDown={onKeyDown} style={{ visibility: "hidden" }}>
        {children}
      </div>
    </MenuContext.Provider>
  );
}

interface ItemProps {
  children: ReactNode;
  onSelect?: () => void;
  disabled?: boolean;
  keepOpen?: boolean; // stay open after picking
}

// Picking closes the menu, unless the item says to stay.
function usePick({ onSelect, keepOpen }: ItemProps) {
  const { close } = useMenu();
  return () => {
    onSelect?.();
    if (!keepOpen) close();
  };
}

export function MenuItem(props: ItemProps & { icon?: IconName; danger?: boolean; describedBy?: string }) {
  const pick = usePick(props);
  return (
    <button className={props.danger ? `${styles.item} ${styles.danger}` : styles.item} role="menuitem" type="button" disabled={props.disabled} aria-describedby={props.describedBy} onClick={pick}>
      {props.icon && <Icon name={props.icon} size={16} />}
      <span>{props.children}</span>
    </button>
  );
}

// Pick one: a blue tick on the chosen item.
export function MenuChoice(props: ItemProps & { checked: boolean }) {
  const pick = usePick(props);
  return (
    <button className={styles.item} role="menuitemradio" aria-checked={props.checked} type="button" disabled={props.disabled} onClick={pick}>
      <span>{props.children}</span>
      <Icon name="check" size={16} className={styles.tick} />
    </button>
  );
}

// Pick several: a rounded checkbox, blue when on. Stays open.
export function MenuCheck({ keepOpen = true, ...props }: ItemProps & { checked: boolean }) {
  const pick = usePick({ ...props, keepOpen });
  return (
    <button className={styles.item} role="menuitemcheckbox" aria-checked={props.checked} type="button" disabled={props.disabled} onClick={pick}>
      <span className={styles.box} aria-hidden="true">
        <Icon name="check" size={12} />
      </span>
      <span>{props.children}</span>
    </button>
  );
}

export function MenuHeading({ children }: { children: ReactNode }) {
  return (
    <div className={styles.heading} role="presentation">
      {children}
    </div>
  );
}

export function MenuSeparator() {
  return <hr className={styles.separator} />;
}

// A foot line, such as the reason an item is disabled; give the item describedBy with this id.
export function MenuFoot({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p id={id} className={styles.foot}>
      {children}
    </p>
  );
}

// "At least [21] days" with Apply.
export function MenuNumber({ label, unit, initial, onApply }: { label: string; unit: string; initial: number; onApply: (n: number) => void }) {
  const { close } = useMenu();
  const [value, setValue] = useState(String(initial));
  function apply() {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 1) return;
    onApply(n);
    close();
  }
  return (
    // A row of a menu is an item, so the menu holds only items (ARIA); focusing it by arrow keys puts the cursor in the field.
    <div
      className={styles.number}
      role="menuitem"
      tabIndex={-1}
      onFocus={(e) => {
        if (e.target === e.currentTarget) e.currentTarget.querySelector("input")?.focus();
      }}
    >
      <label>
        {label}
        <input
          type="number"
          min={1}
          inputMode="numeric"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              apply();
            }
          }}
        />
      </label>
      {unit}
      <Button small variant="main" onClick={apply}>
        Apply
      </Button>
    </div>
  );
}

export const TONE_NAMES: Record<OptionTone, string> = {
  blue: "Blue",
  sky: "Sky",
  teal: "Teal",
  green: "Green",
  amber: "Amber",
  red: "Red",
  violet: "Violet",
  pink: "Pink",
  slate: "Grey",
};

// One colour as a small square: the palette's, and the options dialog's colour buttons.
export function Swatch({ tone }: { tone: OptionTone }) {
  return <span className={`${styles.swatch} ${styles[tone]}`} aria-hidden="true" />;
}

// A grid of swatches, three across.
export function MenuPalette({ tones, value, onPick }: { tones: OptionTone[]; value: OptionTone; onPick: (tone: OptionTone) => void }) {
  const { close } = useMenu();
  return (
    <div className={styles.palette} role="group" aria-label="Colours">
      {tones.map((tone) => (
        <button
          key={tone}
          className={styles.swatchButton}
          role="menuitemradio"
          aria-checked={tone === value}
          aria-label={TONE_NAMES[tone]}
          type="button"
          onClick={() => {
            onPick(tone);
            close();
          }}
        >
          <Swatch tone={tone} />
        </button>
      ))}
    </div>
  );
}
