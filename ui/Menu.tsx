"use client";

// Menus (guide 4.3): a floating card that opens below its button, or above when there's no room, kept 12px inside the
// window. Variants: pick one, pick several, a number, a red item, a disabled item with its reason, a colour palette.
// Arrow keys move, Enter picks, Esc or a tap outside closes, and focus goes back to the button.
import { createContext, useContext, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import Button from "./Button";
import Icon, { type IconName } from "./Icon";
import type { OptionTone } from "./OptionChip";
import { placeMenu } from "./placeMenu";
import { useIsClient } from "./useIsClient";
import { useOverlay } from "./useOverlay";
import styles from "./Menu.module.css";

interface MenuProps {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>; // the button that opened it
  onClose: () => void;
  label: string; // what the menu is for, as a screen reader hears it: "Due"
  alignRight?: boolean;
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

function MenuPanel({ anchorRef, onClose, label, alignRight, children }: MenuProps) {
  const panel = useRef<HTMLDivElement>(null);
  useOverlay({ kind: "menu", onClose, panel, restore: anchorRef, initialFocus: ['[aria-checked="true"]', ITEMS, "input"] });

  // Placed before it is painted, so it never shows in the wrong place.
  useLayoutEffect(() => {
    const el = panel.current!;
    const anchor = anchorRef.current;
    if (!anchor) return;
    const { left, top } = placeMenu(
      anchor.getBoundingClientRect(),
      { width: el.offsetWidth, height: el.offsetHeight },
      { width: window.innerWidth, height: window.innerHeight },
      { alignRight }
    );
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    el.style.visibility = "visible";
  }, [anchorRef, alignRight]);

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "Tab") {
      onClose();
      return;
    }
    if (document.activeElement instanceof HTMLInputElement) return; // a number field keeps its arrow keys
    const items = [...panel.current!.querySelectorAll<HTMLElement>(ITEMS)];
    const at = items.indexOf(document.activeElement as HTMLElement);
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
      <div className={styles.catcher} onClick={onClose} aria-hidden="true" />
      <div ref={panel} className={styles.menu} role="menu" aria-label={label} onKeyDown={onKeyDown} style={{ visibility: "hidden" }}>
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
    <div className={styles.number}>
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

const TONE_NAMES: Record<OptionTone, string> = {
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
          <span className={`${styles.swatch} ${styles[tone]}`} />
        </button>
      ))}
    </div>
  );
}
