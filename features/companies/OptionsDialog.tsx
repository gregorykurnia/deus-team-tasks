"use client";

// A choice field's options (guide 6.5, C3): each with its colour, its name, how many companies use it, and remove. A name
// is changed in place and saved on Enter or on leaving it, and every company using it follows; the message says how
// many. Removing asks first and says how many companies it's cleared from. The locked options (Deal done, Follow-up due,
// and High, Not now and No: gap N9) say why, and only their colour changes. A new option is added with a colour.
import { useEffect, useMemo, useRef, useState } from "react";
import type { PipelineEntry } from "@/lib/clientTypes";
import {
  addOption,
  CompaniesBehindError,
  LOCKED_DEPEND,
  lockReason,
  OPTION_COLOURS,
  recolourOption,
  removeOption,
  renameOption,
  SettingsError,
  type ChoiceOption,
  type CompanyField,
  type CompanySettings,
  type OptionColour,
} from "@/lib/companySettings";
import { failureMessage } from "@/lib/connection";
import { plural } from "@/lib/dates";
import Button from "@/ui/Button";
import Dialog, { Confirm } from "@/ui/Dialog";
import Icon from "@/ui/Icon";
import { TextInput } from "@/ui/Inputs";
import Menu, { MenuHeading, MenuPalette, Swatch, TONE_NAMES } from "@/ui/Menu";
import Notice from "@/ui/Notice";
import { useToast } from "@/ui/Toaster";
import { usePending } from "./usePending";
import styles from "./Settings.module.css";

const NEW = "+new"; // the new option's row, where an error or a colour belongs to it

export interface OptionChanges {
  onRenamed?: (fieldKey: string, from: string, to: string) => void; // a filter on the old name follows it
  onRemoved?: (fieldKey: string, name: string) => void; // a filter on it is let go
}

interface OptionsDialogProps extends OptionChanges {
  field: Pick<CompanyField, "key" | "label">;
  settings: CompanySettings;
  companies: PipelineEntry[];
  onClose: () => void;
}

const nextColour = (count: number): OptionColour => OPTION_COLOURS[count % OPTION_COLOURS.length];
const without = (drafts: Record<string, string>, name: string) => Object.fromEntries(Object.entries(drafts).filter(([k]) => k !== name));
const removeWording = (n: number) =>
  n === 0 ? "No company uses it." : n === 1 ? "It will be cleared from the 1 company that uses it." : `It will be cleared from the ${plural(n, "company", "companies")} that use it.`;
const andList = (names: string[]) => (names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`);

export default function OptionsDialog({ field, settings, companies, onClose, onRenamed, onRemoved }: OptionsDialogProps) {
  const toast = useToast();
  const options = useMemo(() => settings.options[field.key] ?? [], [settings.options, field.key]);
  const locked = options.filter((o) => o.role);
  const used = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of companies) {
      const v = c[field.key];
      if (typeof v === "string" && v) counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    return counts;
  }, [companies, field.key]);
  const usedBy = (o: ChoiceOption) => used.get(o.name) ?? 0;

  // What's typed in each name, by the option's name, until it's saved and the settings show the new name.
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState<{ at: string; message: string } | null>(null);
  const [newName, setNewName] = useState("");
  const [newColour, setNewColour] = useState<OptionColour>(() => nextColour(options.length));
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<ChoiceOption | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [palette, setPalette] = useState<string | null>(null);
  const paletteAnchor = useRef<HTMLElement | null>(null);
  const saving = useRef(new Set<string>()); // Enter, then leaving the field, saves once
  const newInput = useRef<HTMLInputElement>(null);
  const colours = usePending<OptionColour>();

  // Try again runs later, maybe once the dialog is closed: it uses the companies as they are then.
  const latest = useRef(companies);
  useEffect(() => {
    latest.current = companies;
  });

  // The option changed but some companies didn't follow (they show the old name, or still have it). Try again runs the
  // same change, which finishes them, and says so; failing again offers Try again again.
  function companiesBehind(message: string, retry: (companies: PipelineEntry[]) => Promise<number>, done: (n: number) => void) {
    toast(`${message} Check your connection and try again.`, {
      error: true,
      action: "Try again",
      onAction: () => void retry(latest.current).then(done, () => companiesBehind(message, retry, done)),
    });
  }

  const renamedMessage = (n: number, name: string) => (n ? `Renamed. ${plural(n, "company", "companies")} now show “${name}”` : `Renamed to “${name}”`);
  const removedMessage = (n: number, name: string) => (n ? `“${name}” removed and cleared from ${plural(n, "company", "companies")}` : `“${name}” removed`);

  const taken = (name: string, except?: string) => options.some((o) => o.name !== except && o.name.trim().toLowerCase() === name.toLowerCase());

  async function rename(o: ChoiceOption) {
    const typed = drafts[o.name];
    if (typed === undefined || saving.current.has(o.name)) return;
    const name = typed.trim();
    if (name === o.name) {
      if (error?.at === o.name) setError(null);
      return;
    }
    if (!name) return setError({ at: o.name, message: "An option needs a name. Remove it instead if it isn’t needed." });
    if (taken(name, o.name)) return setError({ at: o.name, message: `There’s already an option called “${name}”.` });
    saving.current.add(o.name);
    try {
      const n = await renameOption(field.key, o.name, name, companies);
      setDrafts((now) => without(now, o.name)); // the settings have the new name by now: the companies follow after them
      if (error?.at === o.name) setError(null);
      onRenamed?.(field.key, o.name, name);
      toast(renamedMessage(n, name));
    } catch (err) {
      if (err instanceof CompaniesBehindError) {
        // The option has its new name: only companies are left to follow.
        setDrafts((now) => without(now, o.name));
        if (error?.at === o.name) setError(null);
        onRenamed?.(field.key, o.name, name);
        companiesBehind(
          `Renamed to “${name}”, but some companies still show “${o.name}”.`,
          (now) => renameOption(field.key, o.name, name, now),
          (n) => toast(renamedMessage(n, name))
        );
      } else if (err instanceof SettingsError && err.problem === "taken") {
        setError({ at: o.name, message: `There’s already an option called “${name}”.` });
      } else {
        setDrafts((now) => without(now, o.name));
        toast(failureMessage(err, "The option couldn’t be renamed. Check your connection and try again."), { error: true });
      }
    } finally {
      saving.current.delete(o.name);
    }
  }

  async function add() {
    if (adding) return;
    const name = newName.trim();
    if (!name) return setError({ at: NEW, message: "Type the new option first." });
    if (taken(name)) return setError({ at: NEW, message: `There’s already an option called “${name}”.` });
    setAdding(true);
    try {
      await addOption(field.key, name, newColour);
      setNewName("");
      setNewColour(nextColour(options.length + 1));
      if (error?.at === NEW) setError(null);
      toast(`“${name}” added`);
      newInput.current?.focus();
    } catch (err) {
      if (err instanceof SettingsError && err.problem === "taken") setError({ at: NEW, message: `There’s already an option called “${name}”.` });
      else toast(failureMessage(err, "The option couldn’t be added. Check your connection and try again."), { error: true });
    } finally {
      setAdding(false);
    }
  }

  async function recolour(name: string, colour: OptionColour) {
    if (name === NEW) return setNewColour(colour);
    colours.set(name, colour, options.find((o) => o.name === name)?.colour);
    try {
      await recolourOption(field.key, name, colour);
    } catch (err) {
      colours.drop(name);
      toast(failureMessage(err, "The colour couldn’t be changed. Check your connection and try again."), { error: true });
    }
  }

  async function confirmRemove() {
    if (!removing || removeBusy) return;
    const o = removing;
    // Renamed meanwhile (its name was being saved as Remove was pressed): the old name is on no company any more.
    if (!options.some((x) => x.name === o.name)) {
      setRemoving(null);
      toast("That option was just renamed, so it wasn’t removed. Remove it again if it isn’t needed.");
      return;
    }
    setRemoveBusy(true);
    try {
      const n = await removeOption(field.key, o.name, companies);
      onRemoved?.(field.key, o.name);
      setRemoving(null);
      toast(removedMessage(n, o.name));
    } catch (err) {
      setRemoving(null);
      if (err instanceof CompaniesBehindError) {
        // The option is gone: only companies are left to follow.
        onRemoved?.(field.key, o.name);
        companiesBehind(
          `“${o.name}” removed, but some companies still have it.`,
          (now) => removeOption(field.key, o.name, now),
          (n) => toast(removedMessage(n, o.name))
        );
      } else toast(failureMessage(err, "The option couldn’t be removed. Check your connection and try again."), { error: true });
    } finally {
      setRemoveBusy(false);
    }
  }

  function openPalette(anchor: HTMLElement, name: string) {
    paletteAnchor.current = anchor;
    setPalette(name);
  }

  const paletteTone = palette === NEW ? newColour : palette ? colours.value(palette, options.find((o) => o.name === palette)?.colour ?? "slate") : "slate";

  return (
    <>
      <Dialog open onClose={onClose} title={`${field.label} options`} wide initialFocus="[data-done]" actions={<Button variant="main" data-done onClick={onClose}>Done</Button>}>
        <p>Renaming changes it on every company that uses it. Removing clears it from them.</p>
        {locked.length > 0 && (
          <div className={styles.noticeGap}>
            <Notice tone="info" icon="lock">
              <b>{andList(locked.map((o) => o.name))}</b> can’t be renamed or removed: {LOCKED_DEPEND[field.key] ?? "the groups depend on"} {locked.length === 1 ? "it" : "them"}.{" "}
              {locked.length === 1 ? "Its" : "Their"} colour can change.
            </Notice>
          </div>
        )}
        <div className={styles.options}>
          {options.map((o, i) => {
            const n = usedBy(o);
            const tone = colours.value(o.name, o.colour);
            const err = error?.at === o.name ? error.message : null;
            const errId = `option-error-${i}`;
            return (
              <div key={i}>
                <div className={styles.option}>
                  <button
                    type="button"
                    className={styles.swatchButton}
                    aria-haspopup="menu"
                    aria-label={`Colour of ${o.name}: ${TONE_NAMES[tone]}. Change`}
                    onClick={(e) => openPalette(e.currentTarget, o.name)}
                  >
                    <Swatch tone={tone} />
                  </button>
                  {o.role ? (
                    <span className={styles.locked}>
                      <b>{o.name}</b>
                      <small>
                        <Icon name="lock" size={12} />
                        {lockReason(o.role)}
                      </small>
                    </span>
                  ) : (
                    <TextInput
                      value={drafts[o.name] ?? o.name}
                      aria-label={`Rename ${o.name}`}
                      aria-invalid={err ? true : undefined}
                      aria-describedby={err ? errId : undefined}
                      onChange={(e) => {
                        const value = e.target.value;
                        setDrafts((now) => ({ ...now, [o.name]: value }));
                        if (err) setError(null);
                      }}
                      onBlur={() => void rename(o)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void rename(o);
                        }
                      }}
                    />
                  )}
                  <span className={styles.count}>{n ? plural(n, "company", "companies") : "Not used"}</span>
                  {o.role ? (
                    <span className={styles.noRemove} />
                  ) : (
                    <Button variant="icon" aria-label={`Remove ${o.name}`} title="Remove" onClick={() => setRemoving(o)}>
                      <Icon name="trash" size={16} />
                    </Button>
                  )}
                </div>
                {err && (
                  <p id={errId} className={`${styles.err} ${styles.optionError}`}>
                    <Icon name="alert" size={15} />
                    {err}
                  </p>
                )}
              </div>
            );
          })}
        </div>
        <div className={`${styles.option} ${styles.newRow}`}>
          <button
            type="button"
            className={styles.swatchButton}
            aria-haspopup="menu"
            aria-label={`Colour for the new option: ${TONE_NAMES[newColour]}. Change`}
            onClick={(e) => openPalette(e.currentTarget, NEW)}
          >
            <Swatch tone={newColour} />
          </button>
          <TextInput
            ref={newInput}
            value={newName}
            placeholder="New option"
            aria-label="New option"
            autoComplete="off"
            aria-invalid={error?.at === NEW ? true : undefined}
            aria-describedby={error?.at === NEW ? "option-error-new" : undefined}
            onChange={(e) => {
              setNewName(e.target.value);
              if (error?.at === NEW) setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void add();
              }
            }}
          />
          <Button small busy={adding} onClick={() => void add()}>
            <Icon name="plus" size={15} />
            Add
          </Button>
        </div>
        {error?.at === NEW && (
          <p id="option-error-new" className={`${styles.err} ${styles.newError}`}>
            <Icon name="alert" size={15} />
            {error.message}
          </p>
        )}
        <p className={styles.help}>To clear one company’s choice, open the company and choose Clear.</p>
      </Dialog>
      <Menu open={palette !== null} anchorRef={paletteAnchor} onClose={() => setPalette(null)} label="Colour">
        <MenuHeading>Colour</MenuHeading>
        <MenuPalette tones={[...OPTION_COLOURS]} value={paletteTone} onPick={(tone) => palette && void recolour(palette, tone)} />
      </Menu>
      <Confirm
        open={!!removing}
        onClose={() => setRemoving(null)}
        onConfirm={() => void confirmRemove()}
        title={`Remove “${removing?.name ?? ""}”?`}
        confirmLabel="Remove option"
        busyLabel="Removing…"
        busy={removeBusy}
      >
        {removing && removeWording(usedBy(removing))}
      </Confirm>
    </>
  );
}
