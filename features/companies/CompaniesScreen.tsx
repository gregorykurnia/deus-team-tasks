"use client";

// Companies (guide 6.5): the four groups as tiles, where to act on Active, filters, sort, search and the list. The view
// (group, search, filters, sort) lives in the address, so a link lands on the right list and a reload keeps it. Every source
// loads on its own. Search covers the group you are in and says where else it found something. Every cell opens its quick
// editor, ⋯ opens the row menu, and a company opens its record over the list (?company=, so a reload keeps it). New
// company is ?newCompany=1, and the Fields sheet ?fields=<group>. Options open from a field or a choice editor, and Export
// says what the file holds before it downloads.
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useCompanies, useCompaniesById, useCompanyOptions, useNotes, useTasks } from "@/desk/DeskData";
import { over } from "@/desk/areas";
import PageHeader from "@/desk/PageHeader";
import { useOverParam } from "@/desk/useOverParam";
import type { PipelineEntry } from "@/lib/clientTypes";
import { PartlyChanged } from "@/lib/taskWrites";
import { deleteBlocked, deleteWording, hasField, isKeptInStep, partlyDeleteWording, RENAME_MISSING } from "@/lib/companyEdit";
import {
  COMPANY_GROUP_LABELS,
  COMPANY_GROUPS,
  companiesInGroup,
  companyGroup,
  groupSizes,
  productOptions,
  whereToActCounts,
  type CompanyGroup,
} from "@/lib/companies";
import type { CompanyField } from "@/lib/companySettings";
import { failureMessage, useConnection } from "@/lib/connection";
import {
  clearedFilters,
  countNoun,
  emptyCase,
  filtersOn,
  GROUP_EMPTY_COPY,
  groupFields,
  listCompanies,
  lookOf,
  narrowedBeyondSearch,
  PAGE_SIZE,
  parseCompanyView,
  searchedWords,
  shownFields,
  sortedByHead,
  viewParams,
  effectiveSort,
  type CompanyViewState,
} from "@/lib/companyView";
import { plural } from "@/lib/dates";
import EmptyState from "@/ui/EmptyState";
import Icon from "@/ui/Icon";
import Button, { buttonClass } from "@/ui/Button";
import { Confirm } from "@/ui/Dialog";
import Sheet from "@/ui/Sheet";
import { useToast } from "@/ui/Toaster";
import { SearchField } from "@/ui/Inputs";
import Notice from "@/ui/Notice";
import { LoadingLine, Skeleton, SkeletonRow } from "@/ui/Skeleton";
import { useMediaQuery } from "@/ui/useMediaQuery";
import { useToday } from "@/ui/useToday";
import CellEditor from "./CellEditor";
import CompanyFilters from "./CompanyFilters";
import CompanyList from "./CompanyList";
import CompanyRecord from "./CompanyRecord";
import ExportDialog from "./ExportDialog";
import FieldsSheet from "./FieldsSheet";
import GroupTiles from "./GroupTiles";
import MoveDialog from "./MoveDialog";
import NewCompanySheet from "./NewCompanySheet";
import OptionsDialog, { type OptionChanges } from "./OptionsDialog";
import RowMenu from "./RowMenu";
import { notesLink, useCompanyActions } from "./useCompanyActions";
import WhereToAct from "./WhereToAct";
import styles from "./Companies.module.css";

const TABLET_AND_SMALLER = "(max-width: 900px)";
const SEARCH_DELAY_MS = 180;

type EditField = Pick<CompanyField, "key" | "label" | "type">;
const NAME_FIELD: EditField = { key: "company", label: "Company name", type: "text" };

export default function CompaniesScreen() {
  const pathname = usePathname();
  const router = useRouter();
  const search = useSearchParams();
  const today = useToday();
  const { status, online } = useConnection();
  const companies = useCompanies();
  const byId = useCompaniesById();
  const tasks = useTasks();
  const notes = useNotes();
  const toast = useToast();
  const actions = useCompanyActions();
  const { settings, loading: settingsLoading, error: settingsError } = useCompanyOptions();
  const phone = useMediaQuery(TABLET_AND_SMALLER); // the tab bar layout: the search goes under the title

  const state = useMemo(() => parseCompanyView(search), [search]);
  const fields = groupFields(settings, state.group);
  const shown = shownFields(settings, state.group);

  // The view is written to the address in place, so Back leaves the screen rather than stepping through filters.
  // It's read fresh from the address, so a change that lands while another is still settling isn't lost.
  function update(change: (now: CompanyViewState) => CompanyViewState) {
    const current = new URLSearchParams(window.location.search);
    const query = viewParams(change(parseCompanyView(current)), current).toString();
    window.history.replaceState(null, "", query ? `${pathname}?${query}` : pathname);
  }

  // Search is typed as you go, and the address follows 180ms later. What's typed is never replaced by an older address.
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

  // A group's own filters and order don't carry over to another group; the search does.
  const pickGroup = (group: CompanyGroup) => update((now) => ({ ...now, group, status: null, priority: null, product: null, act: null, sort: null, dir: null }));

  /* ---------- Changing companies (task 3.9) ---------- */

  // What's open over the list. Each holds the company as it was when opened, so a dialog doesn't vanish mid-way if the
  // company changes or goes; editors read the live company.
  const editAnchor = useRef<HTMLElement | null>(null);
  const menuAnchor = useRef<HTMLElement | null>(null);
  const [editing, setEditing] = useState<{ company: PipelineEntry; field: EditField } | null>(null);
  const [rowMenu, setRowMenu] = useState<PipelineEntry | null>(null);
  const [moving, setMoving] = useState<{ company: PipelineEntry; to?: CompanyGroup } | null>(null);
  const [deleting, setDeleting] = useState<PipelineEntry | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const live = (c: PipelineEntry) => byId.get(c.id) ?? c;
  // Delete waits for the tasks and notes as the server has them, so none of the company's are missed.
  const cantDelete = deleteBlocked(tasks, notes, online);
  const openTasksOf = (id: number) => tasks.rows.filter((t) => t.linkedClientId === id && !t.completed).length;

  function edit(anchor: HTMLElement, c: PipelineEntry, field: EditField) {
    editAnchor.current = anchor;
    setEditing({ company: c, field });
  }
  function openRowMenu(anchor: HTMLElement, c: PipelineEntry) {
    menuAnchor.current = anchor;
    setRowMenu(c);
  }

  // The record: ?company=<id>. It waits for the companies to load, and says so when the company isn't there.
  const record = useOverParam("company");
  const recordParam = search.get("company");
  const recordCompany = recordParam ? byId.get(Number(recordParam)) : undefined;
  // The device's copy can be older than the server's: a company is only missing once the server has answered, once
  // there's no connection and the copy is all there is, or once the companies failed to load.
  const settled = !companies.loading && (!companies.fromCache || status === "offline" || !!companies.error);
  const recordMissing = record.open && settled && !recordCompany;
  const deletedHere = useRef<number | null>(null); // deleted from here: the record closes without a second message
  const told = useRef<string | null>(null);
  const closeRecord = record.close;
  useEffect(() => {
    if (!recordMissing || told.current === recordParam) return;
    told.current = recordParam;
    if (deletedHere.current !== Number(recordParam)) {
      const message = companies.error
        ? "Companies couldn't be loaded, so this company can't open. Try again in a moment."
        : online
          ? "This company isn't there any more. Someone may have deleted it."
          : "No connection. This company opens once the connection is back.";
      toast(message, { error: true });
    }
    closeRecord();
  }, [recordMissing, recordParam, companies.error, online, toast, closeRecord]);
  useEffect(() => {
    if (!record.open) told.current = null;
  }, [record.open]);

  // A link straight to a company (from a task, say) shows the list of the group it's in.
  const landed = useRef(false);
  useEffect(() => {
    if (landed.current || !settled) return;
    landed.current = true;
    if (!recordCompany || new URLSearchParams(window.location.search).has("group")) return;
    const group = companyGroup(recordCompany);
    if (group !== state.group) update((now) => ({ ...clearedFilters(now), group, act: null, sort: null, dir: null }));
    // Only as the companies first arrive.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settled]);

  /* ---------- Fields, options and export (task 3.10) ---------- */

  const fieldsOver = useOverParam("fields");
  const fieldsParam = search.get("fields") as CompanyGroup | null;
  const fieldsGroup = fieldsParam && COMPANY_GROUPS.includes(fieldsParam) ? fieldsParam : state.group;
  const [optionsFor, setOptionsFor] = useState<EditField | null>(null);
  const [exporting, setExporting] = useState(false);
  // A filter on an option follows its new name, and goes with it when it's removed.
  const optionChanges: OptionChanges = {
    onRenamed: (key, from, to) => {
      if ((key === "status" || key === "priority") && state[key] === from) update((now) => ({ ...now, [key]: to }));
    },
    onRemoved: (key, name) => {
      if ((key === "status" || key === "priority") && state[key] === name) update((now) => ({ ...now, [key]: null }));
    },
  };

  const newCompany = useOverParam("newCompany");
  function added(id: number, name: string, group: CompanyGroup) {
    // The sheet goes, and the list shows the group it went into with nothing hiding it.
    const params = new URLSearchParams(window.location.search);
    params.delete("newCompany");
    const view = viewParams({ ...clearedFilters(parseCompanyView(params)), group, act: null }, params).toString();
    router.replace(view ? `${pathname}?${view}` : pathname, { scroll: false });
    toast(`${name} added to ${COMPANY_GROUP_LABELS[group]}`, { action: "Open", onAction: () => actions.openOver(`company=${id}`) });
  }

  async function confirmDelete() {
    if (!deleting || deleteBusy) return;
    if (cantDelete) {
      // The tasks or notes went back to loading, or failed, while the confirmation was open: it stays.
      toast(cantDelete, { error: true });
      return;
    }
    setDeleteBusy(true);
    deletedHere.current = deleting.id;
    try {
      await actions.remove(deleting);
      setDeleting(null);
    } catch (err) {
      deletedHere.current = null; // the confirmation stays, to try again
      toast(
        err instanceof PartlyChanged
          ? partlyDeleteWording(deleting.company, err.changed, err.left)
          : failureMessage(err, "The company couldn't be deleted. Check your connection and try again."),
        { error: true }
      );
    } finally {
      setDeleteBusy(false);
    }
  }

  // The 100 shown grow with "Show 100 more" and start over whenever the view changes.
  const viewKey = viewParams(state).toString();
  const [extra, setExtra] = useState({ key: viewKey, rows: 0 });
  const limit = PAGE_SIZE + (extra.key === viewKey ? extra.rows : 0);

  const failed = !!companies.error && companies.rows.length === 0;
  const offlineEmpty = status === "offline" && companies.fromCache && companies.rows.length === 0 && !companies.error;
  const waiting = companies.loading || (companies.fromCache && companies.rows.length === 0 && status === "connecting");
  const pending = !today || waiting || settingsLoading;
  const ready = !pending && !failed && !offlineEmpty;

  const sizes = useMemo(() => (waiting || failed ? null : groupSizes(companies.rows)), [waiting, failed, companies.rows]);
  const listing = useMemo(() => (ready && today ? listCompanies(companies.rows, state, settings, today) : null), [ready, today, companies.rows, state, settings]);
  const active = useMemo(() => companiesInGroup(companies.rows, "active"), [companies.rows]);
  const sort = effectiveSort(state, fields);
  const products = useMemo(() => (listing ? productOptions(listing.scoped) : []), [listing]);
  const shownRows = listing ? listing.sorted.slice(0, limit) : [];
  const hidden = listing ? listing.sorted.length - shownRows.length : 0;
  const look = lookOf(state.group);
  const total = companies.rows.length;
  const filtered = filtersOn(state, fields);

  const searchField = <SearchField label="Search companies" value={typed} onChange={onSearch} placeholder="Search name, contact, source, product" />;

  const newCompanyLink = (variant: "main" | "secondary") => (
    <Link href={over(pathname, search, "newCompany=1")} scroll={false} className={buttonClass(variant)}>
      <Icon name="plus" size={16} />
      {variant === "main" ? "New company" : "Add a company here"}
    </Link>
  );
  let body;
  if (failed) {
    body = (
      <div className={styles.panelNote}>
        <Notice tone="error" title="Couldn't load companies.">
          Check your connection and reload the page.
        </Notice>
      </div>
    );
  } else if (offlineEmpty) {
    body = (
      <EmptyState icon="wifi" title="No connection">
        Companies will appear once you are back online.
      </EmptyState>
    );
  } else if (!listing || !today) {
    body = (
      <>
        <LoadingLine>Loading companies</LoadingLine>
        <div className={styles.skeletons}>
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <SkeletonRow key={n} />
          ))}
        </div>
      </>
    );
  } else if (listing.sorted.length === 0) {
    const which = emptyCase(listing.scoped.length, total);
    if (which === "nothingYet") {
      body = (
        <EmptyState icon="building" title="No companies yet" actions={newCompanyLink("main")}>
          Record the first company you’re talking to, or one you plan to approach. Only the name is needed.
        </EmptyState>
      );
    } else if (which === "groupEmpty") {
      const [title, text] = GROUP_EMPTY_COPY[state.group];
      body = (
        <EmptyState icon={look.icon} title={title} actions={newCompanyLink("secondary")}>
          {text}
        </EmptyState>
      );
    } else {
      const withFilters = narrowedBeyondSearch(state, fields);
      const [, many] = look.noun;
      body = (
        <EmptyState
          icon="search"
          title={`No ${many} match`}
          actions={
            <Button onClick={() => update(clearedFilters)}>{state.q.trim() && !withFilters ? "Clear search" : "Clear filters"}</Button>
          }
        >
          {state.q.trim()
            ? `Nothing in ${look.label} matches “${state.q.trim()}”${withFilters ? " with these filters" : ""}. Search looks at ${searchedWords(state.group)}.`
            : "Nothing matches these filters."}
        </EmptyState>
      );
    }
    // The other groups the search found something in (guide 6.5).
    const elsewhere = which === "nothingMatches" ? listing.elsewhere : [];
    body = (
      <>
        {body}
        {elsewhere.length > 0 && (
          <div className={styles.elsewhere}>
            <span>Found in other groups:</span>
            {elsewhere.map((x) => (
              <button key={x.group} type="button" className={styles.hchip} onClick={() => pickGroup(x.group)}>
                <i className={styles[x.group]}>{x.count.toLocaleString("en-GB")}</i>
                {lookOf(x.group).label}
              </button>
            ))}
          </div>
        )}
      </>
    );
  } else {
    body = (
      <>
        <p className={styles.result} role="status">
          {filtered ? (
            <>
              <b>{listing.sorted.length.toLocaleString("en-GB")}</b> of {countNoun(state.group, listing.scoped.length)} match
              <button type="button" className={styles.linkButton} onClick={() => update(clearedFilters)}>
                Clear filters
              </button>
            </>
          ) : (
            <b>{countNoun(state.group, listing.sorted.length)}</b>
          )}
        </p>
        <CompanyList
          companies={shownRows}
          hidden={hidden}
          pageSize={PAGE_SIZE}
          group={state.group}
          fields={shown}
          settings={settings}
          query={state.q.trim()}
          today={today}
          sort={sort}
          onSort={(key) => update((now) => sortedByHead(now, fields, key))}
          onMore={() => setExtra({ key: viewKey, rows: (extra.key === viewKey ? extra.rows : 0) + PAGE_SIZE })}
          recordHref={(id) => over(pathname, search, `company=${id}`)}
          onEdit={edit}
          onRowMenu={openRowMenu}
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Companies"
        subtitle={sizes ? plural(total, "company", "companies") : undefined}
        search={phone ? undefined : searchField}
        action={{ label: "New company", href: over(pathname, search, "newCompany=1") }}
      />
      {phone && <div className={styles.phoneSearch}>{searchField}</div>}
      <GroupTiles counts={sizes} current={state.group} onPick={pickGroup} />
      {ready && state.group === "active" && active.length > 0 && today && (
        <WhereToAct counts={whereToActCounts(active, today)} current={state.act} onPick={(act) => update((now) => ({ ...now, act }))} />
      )}
      <section className={styles.panel} aria-label={look.label}>
        {settingsError && !failed && (
          // The settings failed to load (provisional until the studio answers N5).
          <div className={styles.panelNote}>
            <Notice tone="warning" title="Couldn’t load the team’s fields and options.">
              The built-in ones show instead. Reload the page to try again.
            </Notice>
          </div>
        )}
        {ready && (
          <CompanyFilters
            state={state}
            fields={fields}
            options={settings.options}
            products={products}
            onState={(next) => update(() => next)}
            onFields={() => actions.openOver(`fields=${state.group}`)}
            onExport={() => setExporting(true)}
          />
        )}
        {body}
      </section>

      {record.open && !recordCompany && !recordMissing && (
        <Sheet open onClose={record.close} title="Company" size="wide">
          <div className={styles.recordNotices}>
            <LoadingLine>Loading the company</LoadingLine>
            <Skeleton height={72} />
            <Skeleton height={40} />
            <Skeleton height={46} />
          </div>
        </Sheet>
      )}
      {recordCompany && today && (
        <CompanyRecord
          key={`record:${recordCompany.id}`}
          company={recordCompany}
          settings={settings}
          today={today}
          online={online}
          actions={actions}
          onClose={record.close}
          onEdit={edit}
          onRename={(anchor, c) => edit(anchor, c, NAME_FIELD)}
          onMove={(c) => setMoving({ company: c })}
          onDelete={setDeleting}
          deleteBlocked={cantDelete}
        />
      )}
      {fieldsOver.open && !settingsLoading && (
        <FieldsSheet
          group={fieldsGroup}
          settings={settings}
          companies={companies.rows}
          online={online}
          onGroup={(g) => router.replace(over(pathname, window.location.search, `fields=${g}`), { scroll: false })}
          onClose={fieldsOver.close}
          {...optionChanges}
        />
      )}
      {optionsFor && <OptionsDialog field={optionsFor} settings={settings} companies={companies.rows} onClose={() => setOptionsFor(null)} {...optionChanges} />}
      {exporting && listing && today && (
        <ExportDialog group={state.group} companies={listing.sorted} fields={shown} filtered={filtered} today={today} onClose={() => setExporting(false)} />
      )}
      {newCompany.open && <NewCompanySheet group={state.group} settings={settings} onClose={newCompany.close} onAdded={added} />}

      {editing && today && (() => {
        const c = live(editing.company);
        const { field } = editing;
        const group = companyGroup(c);
        const dealDone = settings.options.status?.find((o) => o.role === "dealDone")?.name;
        const optionNotes = group === "active" && field.key === "status" && dealDone ? { [dealDone]: "Moves it to Deal done" } : undefined;
        return (
          <CellEditor
            key={`edit:${c.id}:${field.key}`}
            anchorRef={editAnchor}
            onClose={() => setEditing(null)}
            field={field}
            value={c[field.key]}
            options={settings.options[field.key]}
            optionNotes={optionNotes}
            synced={isKeptInStep(field.key) && openTasksOf(c.id) > 0}
            required={field.key === "company" ? RENAME_MISSING : undefined}
            onEditOptions={field.type === "choice" ? () => setOptionsFor(field) : undefined}
            today={today}
            onSave={(value) => (field.key === "company" && typeof value === "string" ? actions.rename(c, value) : actions.setValue(c, field, value))}
          />
        );
      })()}
      {rowMenu && today && (
        <RowMenu
          company={rowMenu}
          anchorRef={menuAnchor}
          hasLastAction={hasField(settings.fields[companyGroup(live(rowMenu))], "date")}
          notes={notesLink(rowMenu, notes.rows)}
          onClose={() => setRowMenu(null)}
          onOpen={() => actions.openOver(`company=${rowMenu.id}`)}
          onFollowUp={() => void actions.followUp(live(rowMenu), today)}
          onToday={() => void actions.logToday(live(rowMenu), today)}
          onMove={() => setMoving({ company: live(rowMenu) })}
          onDelete={() => setDeleting(live(rowMenu))}
          deleteBlocked={cantDelete}
        />
      )}
      {moving && today && (
        <MoveDialog
          key={`move:${moving.company.id}`}
          company={moving.company}
          to={moving.to}
          settings={settings}
          openTasks={openTasksOf(moving.company.id)}
          today={today}
          onClose={() => setMoving(null)}
          onMove={(to, values) => actions.move(live(moving.company), to, values)}
        />
      )}
      <Confirm
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => void confirmDelete()}
        title="Delete this company?"
        quote={deleting?.company}
        confirmLabel="Delete company"
        busyLabel="Deleting…"
        busy={deleteBusy}
      >
        {deleting &&
          deleteWording(
            {
              total: tasks.rows.filter((t) => t.linkedClientId === deleting.id).length,
              open: openTasksOf(deleting.id),
            },
            notes.rows.some((n) => n.pipelineEntryId === deleting.id)
          )}
      </Confirm>
    </>
  );
}
