"use client";

// A choice field's options (guide 6.5, C3): each with its colour, its name, how many companies use it, and remove. Drag
// its handle or use the arrow keys to change the order. A name is saved on Enter or on leaving it, and every company
// using it follows. Removing asks first and says how many companies it's cleared from. The locked options (Deal done,
// Follow-up due, and High, Not now and No: gap N9) say why, and can be recoloured and moved. A new option is added with a colour.
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { PipelineEntry } from "@/lib/clientTypes";
import {
  addOption,
  CompaniesBehindError,
  LOCKED_DEPEND,
  lockReason,
  moveOption,
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
const MOVE_HELP = "Drag, or use the up and down arrow keys";

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
  // The order shown while moves save, by name. Every settings snapshot is a fresh copy, so it's compared by the names in
  // order, not by identity. It's kept until the last queued move has saved and the stored order has moved on from
  // what it was then (to this order, or a colleague's).
  const storedOrder = options.map((o) => o.name).join("\n");
  const latestStoredOrder = useRef(storedOrder);
  useEffect(() => {
    latestStoredOrder.current = storedOrder;
  });
  const [pendingOrder, setPendingOrder] = useState<{ names: string[]; settledFrom: string | null } | null>(null);
  const movesSaving = useRef(0);
  const moveFailed = useRef(false); // one of the queued moves didn't save
  const showPending = pendingOrder !== null && (pendingOrder.settledFrom === null || pendingOrder.settledFrom === storedOrder);
  const orderedOptions = useMemo(() => {
    if (!showPending) return options;
    const byName = new Map(options.map((o) => [o.name, o]));
    const listed = pendingOrder.names.flatMap((name) => byName.get(name) ?? []);
    return [...listed, ...options.filter((o) => !pendingOrder.names.includes(o.name))]; // a colleague's new option
  }, [options, pendingOrder, showPending]);
  const shownOrder = orderedOptions.map((o) => o.name).join("\n");
  const optionList = useRef<HTMLDivElement>(null);
  const cancelDrag = useRef<(() => void) | null>(null);
  const lastMove = useRef(Promise.resolve());
  const movedHandle = useRef<HTMLButtonElement | null>(null);
  const moveHelpId = useId();
  const [announcement, setAnnouncement] = useState("");

  // A change from the live list can have moved, renamed or removed the row under the pointer. A snapshot that leaves
  // the names and their order as they were doesn't let go of it.
  useLayoutEffect(() => () => cancelDrag.current?.(), [shownOrder]);

  useLayoutEffect(() => {
    const handle = movedHandle.current;
    movedHandle.current = null;
    if (!handle?.isConnected) return;
    // Moving a row in the DOM can blur its button even though the row is keyed by name.
    if (document.activeElement === document.body) handle.focus({ preventScroll: true });
    if (document.activeElement === handle) handle.scrollIntoView({ block: "nearest" });
  }, [shownOrder]);

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

  async function move(from: number, to: number, handle: HTMLButtonElement) {
    if (to === from || to < 0 || to >= orderedOptions.length) return;
    const next = [...orderedOptions];
    const [option] = next.splice(from, 1);
    next.splice(to, 0, option);
    movedHandle.current = handle;
    setPendingOrder({ names: next.map((o) => o.name), settledFrom: null });
    setAnnouncement(`${option.name} moved to ${to + 1} of ${next.length}`);
    movesSaving.current += 1;

    // If arrows are pressed quickly, the transactions still save the moves in the order they were made.
    const save = lastMove.current.catch(() => {}).then(() => moveOption(field.key, option.name, to));
    lastMove.current = save;
    try {
      await save;
    } catch (err) {
      moveFailed.current = true;
      toast(failureMessage(err, "The order couldn’t be changed. Check your connection and try again."), { error: true });
    } finally {
      movesSaving.current -= 1;
    }
    if (movesSaving.current > 0) return;
    if (moveFailed.current) {
      moveFailed.current = false;
      // Show the stored order again: the moves that did save are in it.
      setPendingOrder(null);
      setAnnouncement("The order couldn’t be changed");
    } else {
      // The stored order may not have caught up yet: keep this one until it moves.
      setPendingOrder((now) => now && { ...now, settledFrom: latestStoredOrder.current });
    }
  }

  function nudge(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    const step = e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0;
    if (!step) return;
    e.preventDefault();
    // A name still saving would make the move ask for the old name: the arrow waits until it has saved.
    if (!cancelDrag.current && !saving.current.size) void move(index, index + step, e.currentTarget);
  }

  function startDrag(e: PointerEvent<HTMLButtonElement>, from: number) {
    const list = optionList.current;
    if (!list || e.button !== 0 || !e.isPrimary || cancelDrag.current) return;
    e.preventDefault();
    const handle = e.currentTarget;
    const pointerId = e.pointerId;
    // Leaving a name field saves it. While a name saves, the row isn't lifted: its move would ask for the old name.
    handle.focus({ preventScroll: true });
    if (saving.current.size) return;
    handle.setPointerCapture(pointerId);

    const listTop = list.getBoundingClientRect().top - list.scrollTop;
    const rows = Array.from(list.children, (child) => {
      const row = child as HTMLElement;
      const { top, height, bottom } = row.getBoundingClientRect();
      return { row, top: top - listTop, height, bottom: bottom - listTop, centre: top - listTop + height / 2 };
    });
    const lifted = rows[from];
    const last = rows[rows.length - 1];
    const step = lifted.height + parseFloat(getComputedStyle(list).rowGap);
    const grab = e.clientY - listTop - lifted.top;
    let clientY = e.clientY;
    let to = from;
    let frame = 0;

    // Keep the DOM in place while the handle has the pointer. The row follows it and its neighbours make a gap.
    const preview = () => {
      const top = clientY - list.getBoundingClientRect().top + list.scrollTop - grab;
      const centre = top + lifted.height / 2;
      to = from;
      while (to > 0 && centre <= rows[to - 1].centre) to--;
      while (to < rows.length - 1 && centre >= rows[to + 1].centre) to++;

      const liftedTop = Math.max(rows[0].top, Math.min(top, last.bottom - lifted.height));
      const gapTop = to <= from ? rows[to].top : rows[to].bottom - lifted.height;
      list.style.setProperty("--drop-top", `${gapTop}px`);
      rows.forEach(({ row }, index) => {
        let shift = 0;
        if (index === from) shift = liftedTop - lifted.top;
        else if (index >= to && index < from) shift = step;
        else if (index > from && index <= to) shift = -step;
        row.style.transform = shift ? `translateY(${shift}px)` : "";
      });
    };

    // A long list scrolls when the pointer reaches within one handle of its top or bottom.
    const scroll = () => {
      frame = 0;
      const { top, bottom } = list.getBoundingClientRect();
      const edge = handle.offsetHeight;
      const distance = Math.min(0, clientY - top - edge) + Math.max(0, clientY - bottom + edge);
      const before = list.scrollTop;
      list.scrollTop += Math.max(-edge, Math.min(edge, distance)) / 4;
      if (list.scrollTop !== before) frame = requestAnimationFrame(scroll);
    };
    const track = (event: globalThis.PointerEvent) => {
      if (event.pointerId !== pointerId || event.clientY === clientY) return;
      clientY = event.clientY;
      preview();
      if (!frame) frame = requestAnimationFrame(scroll);
    };
    const stop = () => {
      cancelDrag.current = null;
      cancelAnimationFrame(frame);
      handle.removeEventListener("pointermove", track);
      handle.removeEventListener("pointerup", drop);
      handle.removeEventListener("pointercancel", cancel);
      handle.removeEventListener("lostpointercapture", cancel);
      list.removeEventListener("scroll", preview);
      if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId);
      delete list.dataset.dragging;
      delete lifted.row.dataset.lifted;
      list.style.removeProperty("--drop-top");
      list.style.removeProperty("--drop-height");
      rows.forEach(({ row }) => { row.style.transform = ""; });
    };
    const cancel = (event: globalThis.PointerEvent) => {
      if (event.pointerId === pointerId) stop();
    };
    const drop = (event: globalThis.PointerEvent) => {
      if (event.pointerId !== pointerId) return;
      clientY = event.clientY;
      preview();
      stop();
      void move(from, to, handle);
    };

    cancelDrag.current = stop;
    list.dataset.dragging = "";
    lifted.row.dataset.lifted = "";
    list.style.setProperty("--drop-height", `${lifted.height}px`);
    preview();
    handle.addEventListener("pointermove", track);
    handle.addEventListener("pointerup", drop);
    handle.addEventListener("pointercancel", cancel);
    handle.addEventListener("lostpointercapture", cancel);
    list.addEventListener("scroll", preview);
  }

  function close() {
    if (cancelDrag.current) cancelDrag.current(); // Escape lets go of the row first.
    else onClose();
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
      <Dialog open onClose={close} title={`${field.label} options`} wide initialFocus="[data-done]" actions={<Button variant="main" data-done onClick={onClose}>Done</Button>}>
        <p>Renaming changes it on every company that uses it. Removing clears it from them.</p>
        {locked.length > 0 && (
          <div className={styles.noticeGap}>
            <Notice tone="info" icon="lock">
              <b>{andList(locked.map((o) => o.name))}</b> can’t be renamed or removed: {LOCKED_DEPEND[field.key] ?? "the groups depend on"} {locked.length === 1 ? "it" : "them"}.{" "}
              {locked.length === 1 ? "Its" : "Their"} colour and position can change.
            </Notice>
          </div>
        )}
        <span id={moveHelpId} hidden>{MOVE_HELP}</span>
        <span className="sr-only" aria-live="polite" aria-atomic="true">{announcement}</span>
        <div ref={optionList} className={styles.options}>
          {orderedOptions.map((o, i) => {
            const n = usedBy(o);
            const tone = colours.value(o.name, o.colour);
            const err = error?.at === o.name ? error.message : null;
            const errId = `${moveHelpId}-error-${i}`;
            return (
              <div key={o.name}>
                <div className={styles.option}>
                  <button
                    type="button"
                    className={styles.moveHandle}
                    aria-label={`Move ${o.name}`}
                    aria-describedby={moveHelpId}
                    title={MOVE_HELP}
                    onPointerDown={(e) => startDrag(e, i)}
                    onKeyDown={(e) => nudge(e, i)}
                  >
                    <Icon name="grip" size={16} />
                  </button>
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
