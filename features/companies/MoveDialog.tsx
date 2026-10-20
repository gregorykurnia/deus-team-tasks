"use client";

// Moving a company to another group (guide 5.10, B5): the other three groups as options, what's already known carried
// over as grey chips, then only what the new group's list shows. It says when tasks switch between prospect and client
// work. When the move fails the dialog stays, with what was typed.
import { useId, useState } from "react";
import type { PipelineEntry } from "@/lib/clientTypes";
import { defaultMoveTarget, kindSwitchNote, moveChoices, movePatch, movePlan, moveTargets, type CompanyPatch } from "@/lib/companyEdit";
import { COMPANY_GROUP_LABELS, companyGroup, type CompanyGroup } from "@/lib/companies";
import type { CompanySettings } from "@/lib/companySettings";
import { failureMessage } from "@/lib/connection";
import Button from "@/ui/Button";
import Dialog from "@/ui/Dialog";
import Icon from "@/ui/Icon";
import Notice from "@/ui/Notice";
import { GroupTag } from "@/ui/Tag";
import { DetailField, GroupOptions, storedValues } from "./CompanyInputs";
import styles from "./Companies.module.css";

interface MoveDialogProps {
  company: PipelineEntry;
  to?: CompanyGroup; // the group chosen first; the usual next one otherwise
  settings: CompanySettings;
  openTasks: number;
  today: string;
  onClose: () => void;
  onMove: (to: CompanyGroup, values: CompanyPatch) => Promise<void>;
}

export default function MoveDialog({ company, to: initialTo, settings, openTasks, today, onClose, onMove }: MoveDialogProps) {
  const from = companyGroup(company);
  const [to, setTo] = useState<CompanyGroup>(initialTo && initialTo !== from ? initialTo : defaultMoveTarget(from));
  // The plan as the dialog opened for each group, so carried values don't jump about as fields are filled in.
  const [plan, setPlan] = useState(() => movePlan(company, to, settings, openTasks, today));
  const [values, setValues] = useState<CompanyPatch>(plan.values);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const groupsId = useId();

  function pick(group: CompanyGroup) {
    const next = movePlan(company, group, settings, openTasks, today);
    setTo(group);
    setPlan(next);
    setValues(next.values);
    setFailed(null);
  }

  async function submit() {
    if (busy) return;
    setBusy(true);
    setFailed(null);
    try {
      await onMove(to, movePatch(company, storedValues(plan.toFill, values)));
      onClose();
    } catch (err) {
      setBusy(false);
      setFailed(failureMessage(err, "Check your connection and try again. Nothing was lost."));
    }
  }

  const label = COMPANY_GROUP_LABELS[to];
  const note = kindSwitchNote(plan.kindSwitch, to);
  return (
    <Dialog
      open
      wide
      onClose={onClose}
      busy={busy}
      title={`Move ${company.company}`}
      initialFocus='[aria-checked="true"]'
      actions={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="main" busy={busy} busyLabel="Moving…" onClick={() => void submit()}>
            <Icon name="swap" size={16} />
            Move to {label}
          </Button>
        </>
      }
    >
      <p className={styles.moveFrom} id={groupsId}>
        From <GroupTag group={from}>{COMPANY_GROUP_LABELS[from]}</GroupTag> to:
      </p>
      <GroupOptions groups={moveTargets(from)} value={to} onChange={pick} labelledBy={groupsId} />
      {plan.carried.length > 0 && (
        <>
          <h3 className={styles.moveHead}>
            <Icon name="check" size={15} />
            Carried over
          </h3>
          <div className={styles.carry}>
            {plan.carried.map(({ field, text }) => (
              <span key={field.key} title={`${field.label}: ${text}`}>
                <em>{field.label}</em>
                {text}
              </span>
            ))}
          </div>
        </>
      )}
      {plan.toFill.length > 0 && (
        <>
          <h3 className={styles.moveHead}>
            <Icon name="edit" size={15} />
            What {label} needs
          </h3>
          <div className={styles.moveFields}>
            {plan.toFill.map((f) => (
              <DetailField
                key={f.key}
                field={f}
                value={values[f.key]}
                options={moveChoices(settings, f.key)}
                onChange={(v) => setValues((now) => ({ ...now, [f.key]: v }))}
              />
            ))}
          </div>
          <p className={styles.help}>Anything else can be filled in later from the record.</p>
        </>
      )}
      {note && (
        <p className={styles.syncNote}>
          <Icon name="info" size={16} />
          <span>{note}</span>
        </p>
      )}
      {failed && (
        <div className={styles.dialogNotice}>
          <Notice tone="error" title={`Couldn't move ${company.company}.`}>
            {failed}
          </Notice>
        </div>
      )}
    </Dialog>
  );
}
