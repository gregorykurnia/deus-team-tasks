"use client";

// One prospect's qualification notes (guide 6.6): the save line and ⋯, the name with its group and Open company (or an
// editable name and Link to a tracked company), the likelihood picker, how many headings are written, the nine headings,
// the remarks (folded once long) and the last edit.
//
// Saves as you write (guide 5.3, U4): 0.8s after typing stops, and at once when you leave a field. With no connection
// Firestore keeps the change on the device and saves it once the connection is back (D-014); the save line reads the
// device's pending writes, so it stays honest after a reload. What you're typing is never replaced: while a field has
// focus or unsaved typing it keeps your text, and a colleague's change to it shows "Changed just now" (guide 5.8).
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FocusEvent, type RefObject } from "react";
import type { PipelineEntry } from "@/lib/clientTypes";
import { COMPANY_GROUP_LABELS, type CompanyGroup } from "@/lib/companies";
import type { ConnectionStatus } from "@/lib/connection";
import { plural } from "@/lib/dates";
import { HEADINGS, LIKELIHOODS, isWritten, type Likelihood } from "@/lib/notes";
import {
  changedByOthers,
  editedLine,
  HEADING_LABELS,
  HEADING_PROMPTS,
  labelOf,
  LIKELIHOOD_IDS,
  LIKELIHOOD_WORDS,
  remarksFold,
  wordCount,
  type NotesTextKey,
} from "@/lib/notesView";
import { initials } from "@/lib/people";
import type { ProspectJournalEntry } from "@/lib/prospectJournalTypes";
import { watchNotesPending, writeNotes } from "@/lib/noteWrites";
import Button from "@/ui/Button";
import Icon from "@/ui/Icon";
import Menu, { MenuItem, MenuSeparator } from "@/ui/Menu";
import Notice from "@/ui/Notice";
import { GroupTag, LiveTag, OutsideTag } from "@/ui/Tag";
import Spinner from "@/ui/Spinner";
import { useToast } from "@/ui/Toaster";
import styles from "./Notes.module.css";

export const SAVE_WAIT_MS = 800;
const CHANGED_SHOWS_MS = 60_000; // "just now"

// Writing that reached the device but not the server because the notes were deleted meanwhile (an offline stretch
// while a colleague deleted them): kept per notes id until copied, as the notes themselves are gone.
const lostWriting = new Map<string, Partial<Record<NotesTextKey, string>>>();

function lostText(id: string): string {
  const kept = lostWriting.get(id) ?? {};
  return (Object.keys(kept) as NotesTextKey[])
    .filter((k) => kept[k]?.trim())
    .map((k) => `${labelOf(k)}\n${kept[k]}`)
    .join("\n\n");
}

interface NotesDocumentProps {
  entry: ProspectJournalEntry;
  name: string;
  company: PipelineEntry | undefined;
  group: CompanyGroup | null;
  status: ConnectionStatus;
  today: string;
  onBack: () => void;
  onLink: (anchor: RefObject<HTMLElement | null>) => void;
  onExport: () => void;
  onDelete: () => void;
}

export default function NotesDocument({ entry, name, company, group, status, today, onBack, onLink, onExport, onDelete }: NotesDocumentProps) {
  const toast = useToast();
  const router = useRouter();
  const id = entry.id;

  // What's typed here and not yet back from the data: shown in place of the stored text.
  const [drafts, setDrafts] = useState<Partial<Record<NotesTextKey, string>>>({});
  const draftsRef = useRef(drafts);
  const dirty = useRef(new Set<NotesTextKey>()); // typed since the last save
  const focused = useRef<NotesTextKey | null>(null);
  const ownWrites = useRef<Partial<Record<NotesTextKey, string>>>({}); // what this device last wrote, per field
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [waiting, setWaiting] = useState(false); // typing not yet handed to the save
  const [pending, setPending] = useState(false); // handed over, not yet on the server
  const [notSaved, setNotSaved] = useState(false); // the server refused the last save; the text stays here
  const [changed, setChanged] = useState<Partial<Record<NotesTextKey, number>>>({});
  const [remarksOpen, setRemarksOpen] = useState(false);

  const setDraftsBoth = useCallback((next: Partial<Record<NotesTextKey, string>>) => {
    draftsRef.current = next;
    setDrafts(next);
  }, []);

  useEffect(() => watchNotesPending(id, setPending), [id]);

  const stored = useRef(entry);
  const mounted = useRef(true);
  useEffect(() => {
    stored.current = entry;
  }, [entry]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const flushRef = useRef<() => void>(() => {});

  const failed = useCallback(
    (err: unknown, patch: Partial<Record<NotesTextKey, string>>, before: Partial<Record<NotesTextKey, string>>) => {
      const keys = Object.keys(patch) as NotesTextKey[];
      if ((err as { code?: string })?.code === "not-found") {
        // Notes deleted meanwhile are the screen's to explain; writing they never got is kept to copy (gap N10).
        if (!keys.some((k) => patch[k]?.trim())) return;
        const first = !lostWriting.has(id);
        lostWriting.set(id, { ...lostWriting.get(id), ...patch });
        if (!first) return;
        // One message for every queued save that failed the same way.
        setTimeout(() => {
          toast("Your writing in these notes couldn’t be saved: they were deleted meanwhile.", {
            error: true,
            keep: true,
            action: "Copy it",
            onAction: () =>
              void navigator.clipboard.writeText(lostText(id)).then(
                () => {
                  lostWriting.delete(id);
                  toast("Writing copied, ready to paste");
                },
                () => toast("It couldn’t be copied. Try again from the message.", { error: true })
              ),
          });
        }, 300);
        return;
      }
      console.error("Notes couldn't be saved", err);
      // The server refused: what was written comes back as unsaved typing, so it stays on the screen and goes out with
      // the next save, and the stored text rolling back isn't taken for a colleague's change.
      if (mounted.current) {
        const next = { ...draftsRef.current };
        for (const k of keys) {
          if (next[k] === undefined || next[k] === patch[k]) next[k] = patch[k];
          dirty.current.add(k);
          ownWrites.current[k] = before[k];
        }
        draftsRef.current = next;
        setDrafts(next);
        setChanged((c) => Object.fromEntries(Object.entries(c).filter(([k]) => !keys.includes(k as NotesTextKey))));
        setNotSaved(true);
      }
      toast("Your latest writing couldn’t be saved. It’s still here: try again, or copy it somewhere safe.", {
        error: true,
        keep: true,
        action: "Try again",
        onAction: () => {
          if (mounted.current) flushRef.current();
        },
      });
    },
    [id, toast]
  );

  const flush = useCallback(() => {
    clearTimeout(timer.current);
    setWaiting(false);
    if (dirty.current.size === 0) return;
    const patch: Partial<Record<NotesTextKey, string>> = {};
    const before: Partial<Record<NotesTextKey, string>> = {};
    for (const k of dirty.current) {
      const v = draftsRef.current[k] ?? "";
      patch[k] = v;
      before[k] = stored.current[k] ?? "";
      ownWrites.current[k] = v;
    }
    dirty.current.clear();
    setNotSaved(false);
    // Saving… from the moment it's handed over, not from the device's next snapshot.
    setPending(true);
    void writeNotes(id, patch).catch((err) => failed(err, patch, before));
  }, [id, failed]);
  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  // Leaving the notes, the page or the app saves what's typed.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("beforeunload", flush);
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("beforeunload", flush);
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onHide);
      flush();
    };
  }, [flush]);

  // A new version of the notes: a colleague's changes show, unless it's a field being written in here, which keeps its
  // text and says it was changed. Drafts that the data has caught up with go.
  const prev = useRef(entry);
  useEffect(() => {
    const before = prev.current;
    prev.current = entry;
    const others = before === entry ? [] : changedByOthers(before, entry, ownWrites.current);
    if (others.length) {
      const at = Date.now();
      setChanged((now) => ({ ...now, ...Object.fromEntries(others.map((k) => [k, at])) }));
    }
    const next = { ...draftsRef.current };
    let dropped = false;
    for (const k of Object.keys(next) as NotesTextKey[]) {
      const busy = focused.current === k || dirty.current.has(k);
      if (busy) continue;
      if (next[k] === (entry[k] ?? "") || others.includes(k)) {
        delete next[k];
        dropped = true;
      }
    }
    if (dropped) setDraftsBoth(next);
  }, [entry, setDraftsBoth]);

  // "Changed just now" fades after a minute.
  useEffect(() => {
    const times = Object.values(changed);
    if (!times.length) return;
    const next = Math.min(...times) + CHANGED_SHOWS_MS - Date.now();
    const t = setTimeout(() => {
      const now = Date.now();
      setChanged((c) => Object.fromEntries(Object.entries(c).filter(([, at]) => now - at < CHANGED_SHOWS_MS)));
    }, Math.max(0, next));
    return () => clearTimeout(t);
  }, [changed]);

  const value = (k: NotesTextKey) => drafts[k] ?? entry[k] ?? "";

  function type(k: NotesTextKey, v: string) {
    setDraftsBoth({ ...draftsRef.current, [k]: v });
    dirty.current.add(k);
    setWaiting(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, SAVE_WAIT_MS);
  }
  function focus(k: NotesTextKey) {
    focused.current = k;
    if (!(k in draftsRef.current)) setDraftsBoth({ ...draftsRef.current, [k]: entry[k] ?? "" });
  }
  function blur(k: NotesTextKey) {
    if (focused.current === k) focused.current = null;
    flush();
    // Nothing typed, or already saved: the stored text shows again, a colleague's change included.
    const d = draftsRef.current[k];
    if (d !== undefined && !dirty.current.has(k) && (d === (entry[k] ?? "") || changed[k])) {
      const next = { ...draftsRef.current };
      delete next[k];
      setDraftsBoth(next);
    }
  }

  function setLikelihood(l: Likelihood | "") {
    if (l === entry.opportunityStatus) return;
    void writeNotes(id, { opportunityStatus: l }).catch((err) => {
      if ((err as { code?: string })?.code === "not-found") return;
      console.error("Likelihood couldn't be saved", err);
      toast("The likelihood couldn’t be saved. Check your connection and try again.", { error: true });
    });
  }

  // Every text field saves the same way; each says which it is in data-k.
  const keyOf = (e: { currentTarget: HTMLElement }) => e.currentTarget.dataset.k as NotesTextKey;
  const onText = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => type(keyOf(e), e.currentTarget.value);
  const onFocusText = (e: FocusEvent<HTMLElement>) => focus(keyOf(e));
  const onBlurText = (e: FocusEvent<HTMLElement>) => blur(keyOf(e));

  const offline = status === "offline";
  // One live region whose words change, so each change is announced (guide 8).
  const saveState = offline ? "kept" : notSaved && !waiting ? "notSaved" : waiting || pending ? "saving" : "saved";
  const saveLine = (
    <span className={`${styles.save} ${saveState === "saving" ? "" : styles[saveState]}`} role="status">
      {saveState === "kept" ? (
        <>
          <Icon name="wifi" size={15} />
          Kept on this device. Saves when you’re back online.
        </>
      ) : saveState === "notSaved" ? (
        <>
          <Icon name="alert" size={15} />
          Not saved.
          <Button variant="link" small onClick={flush}>
            Try again
          </Button>
        </>
      ) : saveState === "saving" ? (
        <>
          <Spinner />
          Saving…
        </>
      ) : (
        <>
          <Icon name="done" size={15} />
          Saved
        </>
      )}
    </span>
  );

  const menuButton = useRef<HTMLButtonElement>(null);
  const linkButton = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const written = HEADINGS.filter((h) => isWritten(value(h.key))).length;
  const remarks = value("detailedRemarks");
  // Being written in (a draft is kept while it has focus or unsaved typing), the remarks stay open.
  const folded = remarksFold(remarks) && !remarksOpen && !("detailedRemarks" in drafts);
  const headId = `notes-name-${id}`;
  const lkId = `notes-likely-${id}`;
  const tracked = !!company && !!group;

  return (
    <article className={styles.doc} aria-labelledby={headId}>
      <div className={styles.docTop}>
        <span className={styles.back}>
          <Button variant="quiet" small onClick={() => { flush(); onBack(); }}>
            <Icon name="left" size={16} />
            All notes
          </Button>
        </span>
        <span className={styles.spacer} />
        {saveLine}
        <Button ref={menuButton} variant="icon" aria-label="More for these notes" aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}>
          <Icon name="more" />
        </Button>
      </div>

      <header className={styles.docHead}>
        <span className={`${styles.mono} ${styles.monoLarge} ${tracked ? styles[group] : styles.monoUntracked}`} aria-hidden="true">
          {initials(name)}
        </span>
        <div className={styles.docId}>
          {tracked ? (
            <>
              <h2 id={headId} className={styles.docName}>
                {company.company}
              </h2>
              <p className={styles.docMeta}>
                <GroupTag group={group}>{COMPANY_GROUP_LABELS[group]}</GroupTag>
                <Link className={styles.textLink} href={`/companies?company=${company.id}`}>
                  Open company
                  <Icon name="arrow" size={15} />
                </Link>
              </p>
            </>
          ) : (
            <>
              <h2 id={headId} className="sr-only">
                {name}
              </h2>
              <label className="sr-only" htmlFor={`notes-title-${id}`}>
                Prospect name
              </label>
              <input
                id={`notes-title-${id}`}
                className={styles.nameInput}
                placeholder="Who is this prospect?"
                autoComplete="off"
                value={value("prospectName")} data-k={"prospectName"} onChange={onText} onFocus={onFocusText} onBlur={onBlurText}
              />
              <p className={styles.docMeta}>
                <OutsideTag>Not tracked yet</OutsideTag>
                <button ref={linkButton} type="button" className={styles.textLink} onClick={() => onLink(linkButton)}>
                  <Icon name="building" size={15} />
                  Link to a tracked company
                </button>
                {changed.prospectName && <LiveTag>Changed just now</LiveTag>}
              </p>
            </>
          )}
        </div>
      </header>

      {offline && (
        <div className={styles.docNotice}>
          <Notice tone="warning" title="No connection.">
            Keep writing: what you type stays on this device and saves when you’re back online.
          </Notice>
        </div>
      )}

      <div className={styles.likely}>
        <span className={styles.likelyLabel} id={lkId}>
          How likely is this opportunity?
        </span>
        <div className={styles.picker} role="radiogroup" aria-labelledby={lkId}>
          {LIKELIHOODS.map((l, i) => (
            <button
              key={l}
              type="button"
              role="radio"
              aria-checked={entry.opportunityStatus === l}
              className={`${styles.pick} ${styles[LIKELIHOOD_IDS[l]]}`}
              onClick={() => setLikelihood(l)}
            >
              <span className={styles.meter} aria-hidden="true">
                {[1, 2, 3, 4, 5].map((n) => (
                  <i key={n} data-lit={n <= LIKELIHOODS.length - i || undefined} />
                ))}
              </span>
              {LIKELIHOOD_WORDS[l]}
            </button>
          ))}
        </div>
        {LIKELIHOODS.includes(entry.opportunityStatus as Likelihood) && (
          <button type="button" className={styles.clear} onClick={() => setLikelihood("")}>
            Clear
          </button>
        )}
      </div>

      <div className={styles.progress}>
        <span className={styles.ticks} aria-hidden="true">
          {HEADINGS.map((h) => (
            <i key={h.key} data-on={isWritten(value(h.key)) || undefined} />
          ))}
        </span>
        {written === HEADINGS.length ? "All nine headings written" : `${written} of 9 headings written`}
      </div>

      <div className={styles.body}>
        {HEADINGS.map((h) => {
          const text = value(h.key);
          return (
            <section key={h.key} className={isWritten(text) ? styles.heading : `${styles.heading} ${styles.blank}`}>
              <div className={styles.headingTop}>
                <label htmlFor={`notes-${h.key}-${id}`}>{HEADING_LABELS[h.key]}</label>
                {changed[h.key] && <LiveTag>Changed just now</LiveTag>}
              </div>
              <textarea id={`notes-${h.key}-${id}`} className={styles.text} rows={rowsFor(text, 1, 14)} placeholder={HEADING_PROMPTS[h.key]} value={value(h.key)} data-k={h.key} onChange={onText} onFocus={onFocusText} onBlur={onBlurText} />
            </section>
          );
        })}
      </div>

      <section className={styles.remarks}>
        <h3>
          Remarks {changed.detailedRemarks && <LiveTag>Changed just now</LiveTag>}
          <span>Longer history, concerns and context. Folded away when it gets long, so skimming stays easy.</span>
        </h3>
        {folded ? (
          <div className={styles.folded}>
            <p>{remarks}</p>
            <Button
              small
              onClick={() => {
                setRemarksOpen(true);
                requestAnimationFrame(() => document.getElementById(`notes-remarks-${id}`)?.focus());
              }}
            >
              <Icon name="down" size={16} />
              Show all remarks · {plural(wordCount(remarks), "word")}
            </Button>
          </div>
        ) : (
          <>
            <label className="sr-only" htmlFor={`notes-remarks-${id}`}>
              Remarks
            </label>
            <textarea
              id={`notes-remarks-${id}`}
              className={styles.text}
              rows={rowsFor(remarks, 3, 30)}
              placeholder="History, concerns, context. As long as you need."
              value={value("detailedRemarks")} data-k={"detailedRemarks"} onChange={onText} onFocus={onFocusText} onBlur={onBlurText}
            />
            {remarksFold(remarks) && (
              <button type="button" className={styles.fold} onClick={() => setRemarksOpen(false)}>
                <Icon name="up" size={15} />
                Fold the remarks away
              </button>
            )}
          </>
        )}
      </section>

      <p className={styles.foot}>{editedLine(entry.updatedAt, today)}. Saved automatically as you write.</p>

      {menuOpen && (
        <Menu open anchorRef={menuButton} onClose={() => setMenuOpen(false)} label="More for these notes" alignRight>
          {tracked ? (
            <MenuItem icon="building" onSelect={() => router.push(`/companies?company=${company.id}`)}>
              Open {company.company}
            </MenuItem>
          ) : (
            <MenuItem icon="building" onSelect={() => onLink(menuButton)}>
              Link to a tracked company
            </MenuItem>
          )}
          <MenuItem icon="download" onSelect={() => { flush(); onExport(); }}>
            Export these notes
          </MenuItem>
          <MenuSeparator />
          <MenuItem icon="trash" danger onSelect={() => { flush(); onDelete(); }}>
            Delete these notes
          </MenuItem>
        </Menu>
      )}
    </article>
  );
}

// Text areas start at about the height of what's in them (field-sizing grows them where browsers can).
function rowsFor(text: string, min: number, max: number): number {
  const lines = Math.ceil(text.length / 78) + (text.match(/\n/g) ?? []).length;
  return Math.max(min, Math.min(max, lines));
}
