"use client";

// Quick capture (guide 4.8): a dashed field that takes a sentence and adds the task on Enter, keeping the focus for the
// next one. What was typed stays when the task couldn't be added.
import { useState } from "react";
import Icon from "@/ui/Icon";
import styles from "./Today.module.css";

interface QuickCaptureProps {
  id: string;
  label: string; // the field's name for a screen reader
  placeholder?: string;
  onAdd: (text: string) => Promise<boolean>; // true when added
}

export default function QuickCapture({ id, label, placeholder = "Add a task, like “Call Pelita Foods about the trial”", onAdd }: QuickCaptureProps) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  async function add() {
    const sentence = text.trim();
    if (!sentence || busy) return;
    setBusy(true);
    const added = await onAdd(sentence);
    setBusy(false);
    if (added) setText("");
  }

  return (
    <div className={styles.capture}>
      <span className={styles.plus}>
        <Icon name="plus" size={14} />
      </span>
      <label className="sr-only" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        value={text}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.nativeEvent.isComposing) {
            e.preventDefault();
            void add();
          }
        }}
      />
      <span className={styles.hint}>Enter to add</span>
    </div>
  );
}
