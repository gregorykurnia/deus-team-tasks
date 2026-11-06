"use client";

import { useState } from "react";
import { useTaskTypes } from "@/desk/DeskData";
import { addOption, SettingsError } from "@/lib/companySettings";
import { failureMessage } from "@/lib/connection";
import Button from "@/ui/Button";
import Dialog from "@/ui/Dialog";
import Field from "@/ui/Field";
import { TextInput } from "@/ui/Inputs";

interface AddTaskTypeDialogProps {
  onClose: () => void;
  onAdded: (name: string) => void;
}

export default function AddTaskTypeDialog({ onClose, onAdded }: AddTaskTypeDialogProps) {
  const taskTypes = useTaskTypes();
  const [name, setName] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [tries, setTries] = useState(0);
  const takenMessage = (value: string) => `There's already a task type called “${value}”. Pick another name.`;

  async function add() {
    if (busy) return;
    setTries((n) => n + 1);
    const clean = name.trim();
    if (!clean) return setError("Give the task type a name.");
    if (clean === "-") return setError("Choose a name other than “-”.");
    if (taskTypes.some((t) => t.name.trim().toLowerCase() === clean.toLowerCase())) return setError(takenMessage(clean));
    setError(undefined);
    setBusy(true);
    try {
      await addOption("taskType", clean, "violet");
      onAdded(clean);
    } catch (err) {
      setError(err instanceof SettingsError && err.problem === "taken" ? takenMessage(clean) : failureMessage(err, "The task type couldn't be added. Check your connection and try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      busy={busy}
      title="Add task type"
      initialFocus="input"
      actions={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="main" busy={busy} busyLabel="Adding…" onClick={add}>
            Add type
          </Button>
        </>
      }
    >
      <Field label="Name" hint="New types are available to everyone on the team." error={error} focusKey={tries}>
        {(control) => (
          <TextInput
            {...control}
            value={name}
            placeholder="Task type name"
            autoComplete="off"
            disabled={busy}
            onChange={(e) => {
              setName(e.target.value);
              setError(undefined);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void add();
              }
            }}
          />
        )}
      </Field>
    </Dialog>
  );
}
