"use client";

// New flow (guide 5.3, 5.5, M4): a name is all it needs. Then it opens in editing with its first step ready. Creating
// needs the connection; when it fails the dialog stays with what was typed, and the button says Try again.
import { useState } from "react";
import { failureMessage } from "@/lib/connection";
import Button from "@/ui/Button";
import Dialog from "@/ui/Dialog";
import Field from "@/ui/Field";
import { TextInput } from "@/ui/Inputs";
import { useToast } from "@/ui/Toaster";
import styles from "./Flows.module.css";

interface NewFlowDialogProps {
  onClose: () => void;
  onCreate: (name: string) => Promise<void>;
}

export default function NewFlowDialog({ onClose, onCreate }: NewFlowDialogProps) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [missing, setMissing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tries, setTries] = useState(0);

  async function submit() {
    if (busy) return;
    setTries((n) => n + 1);
    if (!name.trim()) {
      setMissing(true);
      return;
    }
    setBusy(true);
    try {
      await onCreate(name);
    } catch (err) {
      setFailed(true);
      toast(failureMessage(err, "The flow wasn’t created. Check your connection and try again."), { error: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      busy={busy}
      title="New flow"
      initialFocus="input"
      actions={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="main" busy={busy} busyLabel="Creating…" onClick={submit}>
            {failed ? "Try again" : "Create flow"}
          </Button>
        </>
      }
    >
      <p className={styles.dialogText}>Name the process, like “New client onboarding”. Then add its steps.</p>
      <Field label="Name" error={missing ? "Give the flow a name, so the team can find it." : undefined} focusKey={tries}>
        {(control) => (
          <TextInput
            {...control}
            value={name}
            placeholder="Flow name"
            autoComplete="off"
            onChange={(e) => {
              setName(e.target.value);
              if (e.target.value.trim()) setMissing(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void submit();
              }
            }}
          />
        )}
      </Field>
    </Dialog>
  );
}
