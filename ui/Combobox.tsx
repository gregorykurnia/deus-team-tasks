"use client";

// A text field with a list of suggestions under it, for the people and sector pickers (guide 4.13). The arrow keys move the
// highlight, Enter picks it, Esc closes the list (and nothing else), and Backspace in an empty field can remove the last
// person. The list opens under the nearest positioned ancestor, so a picker's own box sets its width.
import { useId, useState, type KeyboardEvent, type ReactNode } from "react";
import styles from "./Combobox.module.css";

export interface ComboOption {
  key: string;
  content: ReactNode;
  isNew?: boolean; // "Add “Nadia” as a new name"
}

interface ComboboxProps {
  id?: string;
  "aria-label"?: string;
  "aria-invalid"?: boolean | "true";
  "aria-describedby"?: string;
  placeholder?: string;
  text: string;
  onText: (text: string) => void;
  options: ComboOption[];
  heading?: string; // above the options: "Names already in use"
  onPick: (key: string) => void;
  onBackspaceEmpty?: () => void;
  bare?: boolean; // no box of its own: it sits inside a picker's box
  highlightFirst?: boolean; // Enter takes the top option; off, nothing is highlighted until an arrow key
}

export default function Combobox({
  text,
  onText,
  options,
  heading,
  onPick,
  onBackspaceEmpty,
  bare = false,
  highlightFirst = true,
  placeholder,
  ...aria
}: ComboboxProps) {
  const listId = useId();
  const start = highlightFirst ? 0 : -1;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(start);
  const shown = open && options.length > 0;
  const optionId = (i: number) => `${listId}-${i}`;
  // The options can change from outside (a colleague's change, a name picked): the highlight stays on one that exists.
  const clamp = (i: number) => Math.min(i, options.length - 1);
  const current = clamp(active);

  function pick(i: number) {
    const option = options[i];
    if (!option) return;
    onPick(option.key);
    setActive(start);
    setOpen(false);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.nativeEvent.isComposing) return; // Enter or Esc that ends typing in another script
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!shown) {
        setOpen(true);
        setActive(0);
      } else setActive((a) => clamp(clamp(a) + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (shown) setActive((a) => Math.max(clamp(a) - 1, 0));
    } else if (e.key === "Enter") {
      if (shown && current >= 0) {
        e.preventDefault();
        pick(current);
      } else setOpen(false); // nothing highlighted: what was typed stays, and Enter carries on (to save)
    } else if (e.key === "Escape") {
      if (shown) {
        e.preventDefault();
        e.stopPropagation(); // closes the list, not the sheet it sits in
        setOpen(false);
      }
    } else if (e.key === "Backspace") {
      if (!text && onBackspaceEmpty) onBackspaceEmpty();
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  }

  return (
    <>
      <input
        {...aria}
        className={bare ? styles.bare : styles.input}
        role="combobox"
        aria-expanded={shown}
        aria-controls={shown ? listId : undefined}
        aria-autocomplete="list"
        aria-activedescendant={shown && current >= 0 ? optionId(current) : undefined}
        autoComplete="off"
        placeholder={placeholder}
        value={text}
        onChange={(e) => {
          onText(e.target.value);
          setActive(start);
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => setOpen(false)}
      />
      {shown && (
        // The mouse-down keeps focus in the field, so a click on an option still lands. The list is read and scrolled by keys through
        // the field (aria-activedescendant), so it has no tab stop of its own: the a11y checks skip axe's scrollable-region rule for it.
        <div className={styles.list} data-keys-via-input onMouseDown={(e) => e.preventDefault()}>
          {heading && <div className={styles.heading}>{heading}</div>}
          <div id={listId} role="listbox" aria-label={heading ?? "Suggestions"}>
            {options.map((o, i) => (
              <div
                key={o.key}
                id={optionId(i)}
                role="option"
                aria-selected={i === current}
                className={[styles.option, o.isNew && styles.isNew].filter(Boolean).join(" ")}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(i)}
              >
                {o.content}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
