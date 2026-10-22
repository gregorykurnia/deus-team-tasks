"use client";

// New task group, and Rename (guide 6.2, 5.5): one name field. The name is required and can't be one already taken, ignoring
// case. A group can be marked important when it's made. When saving fails the dialog stays, with what was typed.
import { useState } from "react";
import { PartlyChanged } from "@/lib/taskWrites";
import { createTaskGroup, GroupNameError, groupNameProblem, partlyGroupChange, renameTaskGroup, type GroupNameProblem, type GroupRef } from "@/lib/taskGroups";
import type { Task } from "@/lib/types";
import Button from "@/ui/Button";
import { ChoiceChip } from "@/ui/ChipGroup";
import Dialog from "@/ui/Dialog";
import Field from "@/ui/Field";
import { TextInput } from "@/ui/Inputs";
import Notice from "@/ui/Notice";
import styles from "./Tasks.module.css";

interface GroupDialogProps {
  group?: GroupRef; // renaming this one; leave out to make a new group
  groups: GroupRef[];
  tasks: Task[];
  onClose: () => void;
  onCreated?: (id: string, name: string) => void; // a new group was made
  onRenamed?: (tasks: number) => void; // the group was renamed, with how many tasks went with it
}

export default function GroupDialog({ group, groups, tasks, onClose, onCreated, onRenamed }: GroupDialogProps) {
  const [name, setName] = useState(group?.name ?? "");
  const [important, setImportant] = useState(false);
  const [problem, setProblem] = useState<GroupNameProblem | null>(null);
  const [failed, setFailed] = useState(false);
  const [partly, setPartly] = useState<string | null>(null); // a rename that only partly saved, in words
  const [busy, setBusy] = useState(false);
  const [tries, setTries] = useState(0);
  const verb = group ? "rename" : "create";

  async function submit() {
    if (busy) return;
    setTries((n) => n + 1);
    setFailed(false);
    setPartly(null);
    const found = groupNameProblem(name, groups, group?.id);
    setProblem(found);
    if (found) return;
    setBusy(true);
    try {
      if (group) onRenamed?.(await renameTaskGroup(group, name, groups, tasks));
      else onCreated?.(await createTaskGroup(name, groups, important), name.trim());
    } catch (err) {
      if (err instanceof GroupNameError) setProblem(err.problem);
      else if (err instanceof PartlyChanged) {
        setPartly(partlyGroupChange("rename", err));
        setFailed(true);
      } else setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  const error =
    problem === "missing" ? "Give the group a name." : problem === "taken" ? `There's already a group called “${name.trim()}”. Pick another name.` : undefined;

  return (
    <Dialog
      open
      onClose={onClose}
      busy={busy}
      title={group ? "Rename task group" : "New task group"}
      initialFocus="input"
      actions={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="main" busy={busy} busyLabel={group ? "Saving…" : "Creating…"} onClick={submit}>
            {failed ? "Try again" : group ? "Save" : "Create group"}
          </Button>
        </>
      }
    >
      <p className={styles.dialogText}>{group ? "Its tasks stay where they are." : "Keep related work together, like “Hiring” or “Year end”. Company and internal tasks can both go in."}</p>
      {failed && (
        <div className={styles.dialogNotice}>
          <Notice tone="error" title={partly ? "The group was only partly renamed." : `Couldn't ${verb} the group.`}>
            {partly ?? "Check your connection and try again. Nothing was lost."}
          </Notice>
        </div>
      )}
      <Field label="Name" error={error} focusKey={tries}>
        {(control) => (
          <TextInput
            {...control}
            value={name}
            placeholder="Group name"
            autoComplete="off"
            onChange={(e) => {
              setName(e.target.value);
              setProblem(null);
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
      {!group && (
        <div className={styles.dialogField}>
          <ChoiceChip pressed={important} icon={important ? "star" : "starline"} onClick={() => setImportant(!important)}>
            Mark as important
          </ChoiceChip>
          <p className={styles.help}>Important groups sit at the top of the list.</p>
        </div>
      )}
    </Dialog>
  );
}
