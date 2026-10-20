"use client";

// Companies (guide 6.5): the four groups as tiles, where to act on Active, filters, sort, search and the list. The view
// (group, search, filters, sort) lives in the address, so a link lands on the right list and a reload keeps it. Every source
// loads on its own. Search covers the group you are in and says where else it found something. The cells, the record, New
// company, Fields and Export come with tasks 3.9 and 3.10.
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useCompanies, useCompanyOptions } from "@/desk/DeskData";
import PageHeader from "@/desk/PageHeader";
import { useConnection } from "@/lib/connection";
import { companiesInGroup, groupSizes, productOptions, whereToActCounts, type CompanyGroup } from "@/lib/companies";
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
import Button from "@/ui/Button";
import { SearchField } from "@/ui/Inputs";
import Notice from "@/ui/Notice";
import { LoadingLine, SkeletonRow } from "@/ui/Skeleton";
import { useMediaQuery } from "@/ui/useMediaQuery";
import { useToday } from "@/ui/useToday";
import CompanyFilters from "./CompanyFilters";
import CompanyList from "./CompanyList";
import GroupTiles from "./GroupTiles";
import WhereToAct from "./WhereToAct";
import styles from "./Companies.module.css";

const TABLET_AND_SMALLER = "(max-width: 900px)";
const SEARCH_DELAY_MS = 180;

export default function CompaniesScreen() {
  const pathname = usePathname();
  const search = useSearchParams();
  const today = useToday();
  const { status } = useConnection();
  const companies = useCompanies();
  const { settings, loading: settingsLoading } = useCompanyOptions();
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

  const searchField = <SearchField label="Search companies" value={typed} onChange={onSearch} placeholder="Search companies" />;

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
        <EmptyState icon="building" title="No companies yet">
          Record the first company you’re talking to, or one you plan to approach. Only the name is needed.
        </EmptyState>
      );
    } else if (which === "groupEmpty") {
      const [title, text] = GROUP_EMPTY_COPY[state.group];
      body = (
        <EmptyState icon={look.icon} title={title}>
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
        />
      </>
    );
  }

  return (
    <>
      <PageHeader title="Companies" subtitle={sizes ? plural(total, "company", "companies") : undefined} search={phone ? undefined : searchField} />
      {phone && <div className={styles.phoneSearch}>{searchField}</div>}
      <GroupTiles counts={sizes} current={state.group} onPick={pickGroup} />
      {ready && state.group === "active" && active.length > 0 && today && (
        <WhereToAct counts={whereToActCounts(active, today)} current={state.act} onPick={(act) => update((now) => ({ ...now, act }))} />
      )}
      <section className={styles.panel} aria-label={look.label}>
        {ready && <CompanyFilters state={state} fields={fields} options={settings.options} products={products} onState={(next) => update(() => next)} />}
        {body}
      </section>
    </>
  );
}
