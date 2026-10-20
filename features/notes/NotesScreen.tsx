"use client";

// Qualification notes (guide 6.6): the list on the left and one prospect's notes on the right; on phones the list, then
// one prospect full screen with "All notes". /notes/<id> is the prospect open, and the view (search, likelihood, tracked
// or not, order) lives in the address. /notes?company=<id> opens a company's notes, or starts them (U5). New notes is
// ?newNotes=1. The screen sits in the notes layout, so moving between prospects keeps what's typed in the search.
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useCompanies, useCompaniesById, useNotes } from "@/desk/DeskData";
import { over } from "@/desk/areas";
import { ConnectionBanner } from "@/desk/ConnectionBanner";
import PageHeader from "@/desk/PageHeader";
import { useOverParam } from "@/desk/useOverParam";
import type { PipelineEntry } from "@/lib/clientTypes";
import { failureMessage, useConnection } from "@/lib/connection";
import { plural } from "@/lib/dates";
import { createNotes, deleteNotes, linkNotes, startNotesForCompany } from "@/lib/noteWrites";
import {
  clearedNotesView,
  companyOf,
  groupOfNotes,
  listNotes,
  notesFiltersOn,
  notesName,
  notesOfCompany,
  notesViewParams,
  PAGE_SIZE,
  parseNotesView,
  type NotesViewState,
} from "@/lib/notesView";
import type { ProspectJournalEntry } from "@/lib/prospectJournalTypes";
import Button from "@/ui/Button";
import { Confirm } from "@/ui/Dialog";
import EmptyState from "@/ui/EmptyState";
import { SearchField } from "@/ui/Inputs";
import Notice from "@/ui/Notice";
import { LoadingLine, Skeleton, SkeletonRow } from "@/ui/Skeleton";
import { useToast } from "@/ui/Toaster";
import { useMediaQuery } from "@/ui/useMediaQuery";
import { useToday } from "@/ui/useToday";
import LinkMenu from "./LinkMenu";
import NewNotesDialog from "./NewNotesDialog";
import NotesDocument from "./NotesDocument";
import NotesExportDialog from "./NotesExportDialog";
import NotesList from "./NotesList";
import styles from "./Notes.module.css";

const TABLET_AND_SMALLER = "(max-width: 900px)";
const SEARCH_DELAY_MS = 200;

const GONE = "These notes aren’t there any more. Someone may have deleted them.";

function idFromPath(pathname: string): string | null {
  const m = pathname.match(/^\/notes\/([^/]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

export default function NotesScreen() {
  const pathname = usePathname();
  const router = useRouter();
  const search = useSearchParams();
  const today = useToday();
  const { status, online } = useConnection();
  const notes = useNotes();
  const companies = useCompanies();
  const byId = useCompaniesById();
  const toast = useToast();
  const phone = useMediaQuery(TABLET_AND_SMALLER);

  const notesId = idFromPath(pathname);
  const state = useMemo(() => parseNotesView(search), [search]);

  // The view is written to the address in place, read fresh so a change that lands while another settles isn't lost.
  function update(change: (now: NotesViewState) => NotesViewState) {
    const current = new URLSearchParams(window.location.search);
    const query = notesViewParams(change(parseNotesView(current)), current).toString();
    window.history.replaceState(null, "", query ? `${window.location.pathname}?${query}` : window.location.pathname);
  }
  // Where a prospect's notes are, with the view kept.
  const notesHref = (id: string | null, view: NotesViewState = parseNotesView(new URLSearchParams(window.location.search))) => {
    const query = notesViewParams(view).toString();
    return `${id ? `/notes/${encodeURIComponent(id)}` : "/notes"}${query ? `?${query}` : ""}`;
  };

  // Search is typed as you go, and the address follows a moment later. What's typed is never replaced by an older address.
  const [typed, setTyped] = useState(state.q);
  const committed = useRef(state.q);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    if (state.q !== committed.current) {
      committed.current = state.q;
      setTyped(state.q);
    }
  }, [state.q]);
  useEffect(() => () => clearTimeout(timer.current), []);
  function onSearch(value: string) {
    setTyped(value);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      committed.current = value;
      update((now) => ({ ...now, q: value }));
    }, SEARCH_DELAY_MS);
  }

  // The device's copy can be older than the server's: notes are only missing once the server has answered, or once there's
  // no connection and the copy is all there is.
  const settled = !notes.loading && (!notes.fromCache || status === "offline");
  const companiesSettled = !companies.loading && (!companies.fromCache || status === "offline");
  const entry = notesId ? notes.rows.find((n) => n.id === notesId) : undefined;

  // Just created or started here: its first heading takes the focus once it's on screen.
  const focusFirst = useRef<string | null>(null);
  useEffect(() => {
    if (!entry || focusFirst.current !== entry.id) return;
    focusFirst.current = null;
    requestAnimationFrame(() => document.getElementById(`notes-clientNeed-${entry.id}`)?.focus());
  }, [entry]);

  function openNotes(id: string, { replace = true, fresh = false } = {}) {
    if (fresh) focusFirst.current = id;
    const href = notesHref(id, fresh ? clearedNotesView(state) : undefined);
    if (replace) router.replace(href, { scroll: false });
    else router.push(href, { scroll: false });
  }

  // Starting notes for a company in one action (U5). Starting needs the connection; writing doesn't.
  async function startFor(c: PipelineEntry, replace = true): Promise<void> {
    const own = notesOfCompany(notes.rows, c.id);
    if (own) {
      openNotes(own.id, { replace });
      return;
    }
    if (!online) {
      toast(`No connection. Notes for ${c.company} can’t be started yet.`, { error: true });
      if (search.has("company")) router.replace(notesHref(null), { scroll: false });
      return;
    }
    try {
      const id = await startNotesForCompany(c, notes.rows);
      openNotes(id, { replace, fresh: true });
      toast(`Notes started for ${c.company}`);
    } catch (err) {
      console.error("Notes couldn't be started", err);
      toast(`Notes for ${c.company} couldn’t be started. Check your connection and try again.`, { error: true });
      if (search.has("company")) router.replace(notesHref(null), { scroll: false });
    }
  }
  // From New notes, which stays busy until the notes open.
  function pickCompany(c: PipelineEntry) {
    setStarting(true);
    void startFor(c).finally(() => setStarting(false));
  }

  // /notes?company=<id>, from a company's record or row menu.
  const companyParam = search.get("company");
  const handled = useRef<string | null>(null);
  useEffect(() => {
    if (!companyParam || handled.current === companyParam || !settled || !companiesSettled) return;
    handled.current = companyParam;
    const c = byId.get(Number(companyParam));
    if (!c) {
      toast("This company isn’t there any more. Someone may have deleted it.", { error: true });
      router.replace(notesHref(null), { scroll: false });
      return;
    }
    void startFor(c);
    // Once per company link, when both sources are in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyParam, settled, companiesSettled]);

  // Notes that are gone (gap N10): opened from a link after they were deleted, or deleted by a colleague while open.
  const deletedHere = useRef<string | null>(null);
  const told = useRef<string | null>(null);
  const missing = !!notesId && settled && !entry;
  useEffect(() => {
    if (!missing || told.current === notesId) return;
    told.current = notesId;
    if (deletedHere.current !== notesId) {
      toast(notes.error ? "Qualification notes couldn't be loaded, so these notes can't open. Try again in a moment." : online ? GONE : "No connection. These notes open once the connection is back.", { error: true });
    }
    router.replace(notesHref(null), { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missing, notesId]);
  useEffect(() => {
    if (!missing) told.current = null;
  }, [missing]);

  const listing = useMemo(() => (settled || notes.rows.length ? listNotes(notes.rows, state, byId) : null), [settled, notes.rows, state, byId]);

  // On large screens a prospect is always open: the first in the list, when none is chosen.
  const first = listing?.rows[0]?.entry.id;
  useEffect(() => {
    if (phone || notesId || companyParam || !first) return;
    // Anything else open over the screen (New notes, a task) stays open.
    router.replace(`/notes/${encodeURIComponent(first)}${window.location.search}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phone, notesId, companyParam, first]);

  // "All notes" steps back to the list when that's where the prospect was opened from.
  const fromList = useRef(false);
  function back() {
    if (fromList.current) {
      fromList.current = false;
      router.back();
    } else router.push(notesHref(null), { scroll: false });
  }

  // 100 at a time, starting over whenever the view changes.
  const viewKey = notesViewParams(state).toString();
  const [extra, setExtra] = useState({ key: viewKey, rows: 0 });
  const limit = PAGE_SIZE + (extra.key === viewKey ? extra.rows : 0);

  /* ---------- New, link, delete, export ---------- */

  const newNotes = useOverParam("newNotes");
  const [starting, setStarting] = useState(false);
  async function startUntracked(name: string) {
    setStarting(true);
    try {
      const id = await createNotes(name);
      openNotes(id, { fresh: true });
    } catch (err) {
      toast(failureMessage(err, "The notes weren’t started. Check your connection and try again."), { error: true });
    } finally {
      setStarting(false);
    }
  }

  const [linking, setLinking] = useState<{ entry: ProspectJournalEntry; anchor: RefObject<HTMLElement | null> } | null>(null);
  async function link(e: ProspectJournalEntry, c: PipelineEntry) {
    try {
      const undo = await linkNotes(e, c);
      toast(`Linked to ${c.company}. The notes now open from the company too.`, {
        action: "Undo",
        onAction: () => void undo().catch((err) => toast(failureMessage(err, "The link couldn't be undone."), { error: true })),
      });
    } catch (err) {
      toast(failureMessage(err, "The notes weren’t linked. Check your connection and try again."), { error: true });
    }
  }

  const [deleting, setDeleting] = useState<ProspectJournalEntry | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  async function confirmDelete() {
    if (!deleting || deleteBusy) return;
    const name = notesName(deleting, byId);
    setDeleteBusy(true);
    deletedHere.current = deleting.id;
    try {
      await deleteNotes(deleting.id);
      setDeleting(null);
      router.replace(notesHref(null), { scroll: false });
      toast(`Notes for ${name} deleted`);
    } catch (err) {
      deletedHere.current = null;
      setDeleting(null);
      toast(failureMessage(err, "The notes weren’t deleted. Check your connection and try again."), { error: true });
    } finally {
      setDeleteBusy(false);
    }
  }

  const [exporting, setExporting] = useState<"shown" | "one" | null>(null);

  /* ---------- What shows ---------- */

  const failed = !!notes.error && notes.rows.length === 0;
  const offlineEmpty = status === "offline" && notes.fromCache && notes.rows.length === 0 && !notes.error;
  const waiting = !today || !listing || (notes.fromCache && notes.rows.length === 0 && status === "connecting");
  const nothingYet = !waiting && !failed && !offlineEmpty && notes.rows.length === 0;
  const hideHeader = phone && !!notesId;

  const searchField = <SearchField label="Search all notes" value={typed} onChange={onSearch} placeholder="Search everything written" />;

  let content;
  if (failed) {
    content = (
      <div className={styles.screenNote}>
        <Notice tone="error" title="Couldn't load qualification notes.">
          Check your connection and reload the page.
        </Notice>
      </div>
    );
  } else if (offlineEmpty) {
    content = (
      <div className={styles.screenNote}>
        <EmptyState icon="wifi" title="No connection">
          Qualification notes will appear once you are back online.
        </EmptyState>
      </div>
    );
  } else if (waiting) {
    content = (
      <div className={styles.wrap}>
        <div className={styles.col}>
          <section className={styles.panel} aria-label="Prospects">
            <div className={styles.filters}>
              <LoadingLine>Loading qualification notes</LoadingLine>
            </div>
            <div className={styles.skeletons}>
              {[1, 2, 3, 4, 5].map((n) => (
                <SkeletonRow key={n} />
              ))}
            </div>
          </section>
        </div>
        {!phone && <DocSkeleton />}
      </div>
    );
  } else if (nothingYet) {
    content = (
      <div className={styles.screenNote}>
        <EmptyState
          icon="note"
          title="No qualification notes yet"
          actions={
            <>
              <Button variant="main" onClick={() => router.push(over(pathname, search, "newNotes=1"), { scroll: false })}>
                New notes
              </Button>
              <Button onClick={() => router.push("/companies")}>Go to companies</Button>
            </>
          }
        >
          Notes assess every prospect under the same nine headings, with a likelihood to compare them. Start from a company’s record, or here for someone you haven’t tracked yet.
        </EmptyState>
      </div>
    );
  } else if (listing && today) {
    let doc;
    if (entry) {
      const company = companyOf(entry, byId);
      const name = notesName(entry, byId);
      doc = (
        <NotesDocument
          key={entry.id}
          entry={entry}
          name={name}
          company={company}
          group={groupOfNotes(entry, byId)}
          status={status}
          today={today}
          onBack={back}
          onLink={(anchor) => setLinking({ entry, anchor })}
          onExport={() => setExporting("one")}
          onDelete={() => setDeleting(entry)}
        />
      );
    } else if (notesId || companyParam) {
      doc = <DocSkeleton />;
    } else {
      doc = (
        <article className={`${styles.doc} ${styles.docNone}`}>
          <EmptyState icon="note" title="Choose a prospect">
            Their notes open here. Every prospect is assessed under the same nine headings.
          </EmptyState>
        </article>
      );
    }
    content = (
      <div className={notesId || companyParam ? `${styles.wrap} ${styles.open}` : styles.wrap}>
        <NotesList
          entries={notes.rows}
          rows={listing.rows}
          companies={byId}
          state={state}
          limit={limit}
          current={notesId}
          today={today}
          replace={!phone}
          hrefFor={(id) => notesHref(id, state)}
          onPick={() => {
            if (phone) fromList.current = true;
          }}
          onState={(next) => update(() => next)}
          onClear={() => {
            setTyped("");
            committed.current = "";
            update(clearedNotesView);
          }}
          onMore={() => setExtra({ key: viewKey, rows: (extra.key === viewKey ? extra.rows : 0) + PAGE_SIZE })}
          onExport={() => setExporting("shown")}
        />
        {doc}
      </div>
    );
  }

  return (
    <>
      {/* A prospect open full screen on a phone has no page header, but still says when there's no connection. */}
      {hideHeader && <ConnectionBanner />}
      {!hideHeader && (
        <>
          <PageHeader
            title="Qualification notes"
            subtitle={settled || notes.rows.length ? plural(notes.rows.length, "prospect") : undefined}
            search={phone ? undefined : searchField}
            action={{ label: "New notes", href: over(pathname, search, "newNotes=1") }}
          />
          {phone && !nothingYet && <div className={styles.phoneSearch}>{searchField}</div>}
        </>
      )}
      {content}

      {newNotes.open && (
        <NewNotesDialog
          companies={companies.rows}
          notes={notes.rows}
          busy={starting}
          onClose={newNotes.close}
          onCompany={pickCompany}
          onUntracked={(name) => void startUntracked(name)}
        />
      )}
      {linking && (
        <LinkMenu
          anchorRef={linking.anchor}
          companies={companies.rows}
          notes={notes.rows}
          onClose={() => setLinking(null)}
          onPick={(c) => void link(linking.entry, c)}
        />
      )}
      {exporting && listing && today && (exporting !== "one" || entry) && (
        <NotesExportDialog
          entries={exporting === "one" ? (entry ? [entry] : []) : listing.rows.map((r) => r.entry)}
          companies={byId}
          filtered={notesFiltersOn(state)}
          one={exporting === "one" && entry ? notesName(entry, byId) : undefined}
          today={today}
          onClose={() => setExporting(null)}
        />
      )}
      <Confirm
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => void confirmDelete()}
        title={deleting ? `Delete the notes for ${notesName(deleting, byId)}?` : "Delete these notes?"}
        confirmLabel="Delete notes"
        busyLabel="Deleting…"
        busy={deleteBusy}
      >
        {deleting && `All nine headings and the remarks go, for everyone on the team.${companyOf(deleting, byId) ? " The company itself stays." : ""}`}
      </Confirm>
    </>
  );
}

function DocSkeleton() {
  return (
    <article className={styles.doc} aria-hidden="true">
      <Skeleton height={30} width="50%" />
      <div style={{ marginTop: 18 }}>
        <Skeleton height={18} width="70%" />
      </div>
      {[1, 2, 3, 4].map((n) => (
        <div key={n} style={{ marginTop: 30, display: "flex", flexDirection: "column", gap: 10 }}>
          <Skeleton height={14} width="30%" />
          <Skeleton height={44} />
        </div>
      ))}
    </article>
  );
}
