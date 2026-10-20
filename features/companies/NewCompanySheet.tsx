"use client";

// New company (guide 6.5, 5.3, 5.5, B1, B3): a form with Save. Only the name is needed; it says so when it's missing and
// takes focus back to it. The group it goes in, then what that group's list shows and the contact person. When adding
// fails the sheet stays, with what was typed.
import { useId, useState } from "react";
import { useCompanies } from "@/desk/DeskData";
import { maxCompanyId, moveChoices, NAME_MISSING, newCompanyFields, type CompanyPatch } from "@/lib/companyEdit";
import { COMPANY_GROUPS, DEAL_DONE_STATUS, groupFlags, type CompanyGroup } from "@/lib/companies";
import type { CompanySettings } from "@/lib/companySettings";
import { addCompany } from "@/lib/companyWrites";
import { failureMessage } from "@/lib/connection";
import Button from "@/ui/Button";
import Field from "@/ui/Field";
import { TextInput } from "@/ui/Inputs";
import Sheet, { SheetSpacer } from "@/ui/Sheet";
import { useToast } from "@/ui/Toaster";
import { DetailField, GroupOptions, storedValues } from "./CompanyInputs";
import styles from "./Companies.module.css";

interface NewCompanySheetProps {
  group: CompanyGroup; // the group being looked at
  settings: CompanySettings;
  onClose: () => void;
  onAdded: (id: number, name: string, group: CompanyGroup) => void;
}

export default function NewCompanySheet({ group: initialGroup, settings, onClose, onAdded }: NewCompanySheetProps) {
  const companies = useCompanies();
  const toast = useToast();
  const [name, setName] = useState("");
  const [group, setGroup] = useState<CompanyGroup>(initialGroup);
  const [values, setValues] = useState<CompanyPatch>({});
  const [missing, setMissing] = useState(false);
  const [tries, setTries] = useState(0);
  const [busy, setBusy] = useState(false);
  const groupLabel = useId();

  const fields = newCompanyFields(settings, group);
  const error = missing && !name.trim() ? NAME_MISSING : undefined;

  async function submit() {
    if (busy) return;
    setTries((n) => n + 1);
    const clean = name.trim();
    if (!clean) {
      setMissing(true);
      return;
    }
    setBusy(true);
    try {
      const data: CompanyPatch = { ...storedValues(fields, values), company: clean, ...groupFlags(group) };
      if (group === "dealDone") data.status = DEAL_DONE_STATUS;
      const id = await addCompany(data, maxCompanyId(companies.rows));
      onAdded(id, clean, group);
    } catch (err) {
      setBusy(false);
      toast(failureMessage(err, "The company wasn't added. Check your connection and try again."), { error: true });
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title="New company"
      size="wide"
      initialFocus="input"
      footer={
        <>
          <SheetSpacer />
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="main" busy={busy} busyLabel="Adding…" onClick={() => void submit()}>
            Add company
          </Button>
        </>
      }
    >
      <div className={styles.newForm}>
        <Field label="Company name" error={error} focusKey={tries}>
          {(control) => (
            <TextInput
              {...control}
              className={styles.bigName}
              value={name}
              placeholder="Who are they?"
              autoComplete="off"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void submit();
                }
              }}
            />
          )}
        </Field>
        <div>
          <span className={styles.fieldLabel} id={groupLabel}>
            Goes in
          </span>
          <GroupOptions groups={COMPANY_GROUPS} value={group} onChange={setGroup} labelledBy={groupLabel} four />
        </div>
        {fields.map((f) => (
          <DetailField key={f.key} field={f} value={values[f.key]} options={moveChoices(settings, f.key)} onChange={(v) => setValues((now) => ({ ...now, [f.key]: v }))} />
        ))}
        <p className={styles.help}>Everything except the name is optional, and more fields are in the record once it’s added.</p>
      </div>
    </Sheet>
  );
}
