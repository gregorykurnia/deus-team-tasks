"use client";

import { useEffect, useMemo, useState } from "react";
import { useHistoricalClients } from "@/lib/useHistoricalClients";
import {
  buildGroups,
  canonicalSector,
  ClientGroup,
  countSummary,
  HistoricalClient,
  sectorLabelMap,
  sectorSummary,
  SortDir,
  SortKey,
  sortGroups,
} from "@/lib/historicalClientTypes";
import { colorFor } from "@/lib/colors";
import { downloadCsv } from "@/lib/exportCsv";
import { ClientTextPopup } from "./clients/ClientTextPopup";
import { HistoricalClientDialog, MoveClientDialog } from "./clients/HistoricalClientDialogs";

type Dialog = { kind: "addHead" } | { kind: "addSub"; head: HistoricalClient } | { kind: "move"; sub: HistoricalClient };

type Popup = { client: HistoricalClient; field: "name" | "sector"; anchorRect: DOMRect };

const UNASSIGNED_CHIP = { bg: "#F2F4F8", color: "#5A6278" };

function SectorChip({ label }: { label: string }) {
  const c = colorFor(label);
  return (
    <span
      className="inline-flex max-w-full items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium whitespace-nowrap"
      style={{ background: c.bg, color: c.text }}
    >
      <span className="truncate">{label}</span>
    </span>
  );
}

function SortHeader({
  label,
  sortKey,
  active,
  dir,
  onSort,
  align = "left",
}: {
  label: string;
  sortKey: SortKey;
  active: SortKey;
  dir: SortDir;
  onSort: (key: SortKey) => void;
  align?: "left" | "right";
}) {
  const isActive = active === sortKey;
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      title={`Sort by ${label.toLowerCase()}`}
      className={`flex w-full items-center cursor-pointer select-none text-[11px] font-semibold text-gray-400 uppercase tracking-wide hover:text-gray-600 ${align === "right" ? "justify-end" : ""}`}
    >
      {label}
      <span className={`ml-1 text-[10px] ${isActive ? "text-accent opacity-100" : "opacity-40"}`}>
        {isActive ? (dir === 1 ? "▲" : "▼") : "⇅"}
      </span>
    </button>
  );
}

function StatCard({ label, value, note }: { label: string; value: number; note: string }) {
  return (
    <div className="flex-1 min-w-[130px] bg-white border border-gray-200 rounded-lg px-5 py-3.5 shadow-sm">
      <div className="text-[11px] font-medium text-gray-400 uppercase tracking-wide mb-1.5">{label}</div>
      <div className="text-2xl font-semibold text-gray-900 leading-none tabular-nums">{value}</div>
      <div className="text-[11px] text-gray-400 mt-1">{note}</div>
    </div>
  );
}

const ACTION_BUTTON = "w-[30px] h-[30px] flex items-center justify-center rounded-md border border-gray-200 text-gray-400 hover:bg-gray-50 hover:text-gray-700";
const DELETE_BUTTON = "w-[30px] h-[30px] flex items-center justify-center rounded-md border border-gray-200 text-gray-400 hover:bg-red-50 hover:text-red-700";

export function ClientsHistoricalTab() {
  const { clients, loading, addClient, updateClient, deleteClient } = useHistoricalClients();
  const [search, setSearch] = useState("");
  // Heads start expanded. This set holds only the heads the user has collapsed.
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [popup, setPopup] = useState<Popup | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const groups = useMemo(() => buildGroups(clients), [clients]);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>(1);
  const sortedGroups = useMemo(() => sortGroups(groups, sortKey, sortDir), [groups, sortKey, sortDir]);

  // Same as the pipeline: first click sorts ascending, the next click reverses.
  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 1 ? -1 : 1));
    else {
      setSortKey(key);
      setSortDir(1);
    }
  }
  const counts = useMemo(() => countSummary(groups), [groups]);
  const labels = useMemo(() => sectorLabelMap(clients), [clients]);
  const sectors = useMemo(() => sectorSummary(groups, labels), [groups, labels]);
  const sectorOptions = useMemo(() => Array.from(labels.values()).sort((a, b) => a.localeCompare(b)), [labels]);

  const query = search.trim().toLowerCase();
  const visibleRows = useMemo(() => {
    if (!query) return sortedGroups.map((group) => ({ group, subs: group.subs }));
    const matches = (value: string) => value.toLowerCase().includes(query);
    return sortedGroups.flatMap((group) => {
      const headMatch = matches(group.head.name) || matches(group.head.sector ?? "");
      const subs = headMatch ? group.subs : group.subs.filter((sub) => matches(sub.name));
      return headMatch || subs.length > 0 ? [{ group, subs }] : [];
    });
  }, [sortedGroups, query]);

  const headsWithSubs = groups.filter((group) => group.subs.length > 0).map((group) => group.head.id);
  const allOpen = headsWithSubs.length > 0 && headsWithSubs.every((id) => !collapsed.has(id));

  function isOpen(headId: string, visibleSubCount: number) {
    return query ? visibleSubCount > 0 : !collapsed.has(headId);
  }

  function toggleHead(headId: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(headId)) next.delete(headId);
      else next.add(headId);
      return next;
    });
  }

  function toggleAll() {
    setCollapsed(allOpen ? new Set(headsWithSubs) : new Set());
  }

  // Runs a Firestore write. Shows a toast and returns false if it fails.
  async function run(action: () => Promise<void>) {
    try {
      await action();
      return true;
    } catch (error) {
      console.error(error);
      setToast("Couldn't save. Please try again.");
      return false;
    }
  }

  async function savePopup(target: Popup, value: string) {
    const trimmed = value.trim();
    if (target.field === "name") {
      if (!trimmed || trimmed === target.client.name) return;
      await run(() => updateClient(target.client.id, { name: trimmed }));
      return;
    }
    const next = canonicalSector(trimmed, labels);
    if (next === (target.client.sector ?? null)) return;
    await run(() => updateClient(target.client.id, { sector: next }));
  }

  function openPopup(client: HistoricalClient, field: Popup["field"], el: HTMLElement) {
    setPopup({ client, field, anchorRect: el.getBoundingClientRect() });
  }

  async function removeHead(group: ClientGroup) {
    if (group.subs.length > 0) {
      setToast(`Move or delete the ${group.subs.length} subsidiaries under "${group.head.name}" first.`);
      return;
    }
    if (!window.confirm(`Delete "${group.head.name}"?`)) return;
    await run(() => deleteClient(group.head.id));
  }

  async function removeSub(sub: HistoricalClient) {
    if (!window.confirm(`Delete "${sub.name}"?`)) return;
    await run(() => deleteClient(sub.id));
  }

  function exportCsv() {
    const rows: string[][] = [];
    for (const { head, subs } of sortedGroups) {
      rows.push([head.name, "Client", "", head.sector ?? "", head.countHead ? "Yes" : "No"]);
      for (const sub of subs) rows.push([sub.name, "Subsidiary", head.name, head.sector ?? "", "Yes"]);
    }
    downloadCsv(
      `clients-historical-${new Date().toISOString().slice(0, 10)}.csv`,
      ["Name", "Type", "Parent", "Sector", "Counted in total"],
      rows
    );
  }

  if (loading) {
    return <div className="text-gray-400 text-sm py-20 text-center">Loading clients…</div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
        <div>
          <div className="text-[22px] font-semibold text-gray-900 tracking-tight">Clients Historical</div>
          <div className="text-[13px] text-gray-400 mt-0.5">Past clients, their subsidiaries, and how they break down by sector</div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={exportCsv} className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-md text-[13px] font-medium border border-gray-200 bg-white text-gray-600 hover:bg-gray-50">
            ↓ Export to CSV
          </button>
          <button onClick={() => setDialog({ kind: "addHead" })} className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md text-[13px] font-medium bg-accent text-white hover:opacity-90">
            + Add client
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mb-5">
        <StatCard label="Total clients" value={counts.total} note="counted heads + subsidiaries" />
        <StatCard label="Heads counted" value={counts.headsCounted} note="clients in the total" />
        <StatCard label="Heads not counted" value={counts.headsNotCounted} note="listed, left out of the total" />
        <StatCard label="Subsidiaries" value={counts.subsidiaries} note="always counted" />
      </div>

      <div className="flex items-center gap-2 flex-wrap mb-4">
        <div className="relative flex-1 min-w-[200px] max-w-[280px]">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs">🔍</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search client, subsidiary, sector..."
            className="w-full h-9 pl-8 pr-2.5 text-[13px] border border-gray-200 rounded-md outline-none focus:border-accent focus:ring-2 focus:ring-accent/10"
          />
        </div>
        <div className="flex items-center gap-1.5 sm:hidden">
          <select
            value={sortKey}
            onChange={(e) => {
              setSortKey(e.target.value as SortKey);
              setSortDir(1);
            }}
            aria-label="Sort clients by"
            className="h-9 text-[13px] border border-gray-200 rounded-md px-2.5 outline-none focus:border-accent bg-white"
          >
            <option value="name">Client</option>
            <option value="sector">Sector</option>
            <option value="count">Count head</option>
            <option value="subs">Subs</option>
          </select>
          <button
            onClick={() => setSortDir((d) => (d === 1 ? -1 : 1))}
            aria-label={sortDir === 1 ? "Sorted ascending. Reverse order" : "Sorted descending. Reverse order"}
            className="h-9 w-9 rounded-md border border-gray-200 text-[12px] text-gray-600 hover:bg-gray-50"
          >
            {sortDir === 1 ? "▲" : "▼"}
          </button>
        </div>
        <div className="flex-1" />
        {headsWithSubs.length > 0 && (
          <button onClick={toggleAll} className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-md text-[13px] font-medium border border-gray-200 text-gray-700 hover:bg-gray-50">
            {allOpen ? "Collapse all" : "Expand all"}
          </button>
        )}
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="hidden sm:flex items-center gap-x-3 px-3.5 py-2.5 bg-gray-50 border-b border-gray-200">
            <div className="flex-1 min-w-0">
              <SortHeader label="Client" sortKey="name" active={sortKey} dir={sortDir} onSort={handleSort} />
            </div>
            <div className="shrink-0 sm:w-[150px]">
              <SortHeader label="Sector" sortKey="sector" active={sortKey} dir={sortDir} onSort={handleSort} />
            </div>
            <div className="shrink-0 sm:w-[96px]">
              <SortHeader label="Count head" sortKey="count" active={sortKey} dir={sortDir} onSort={handleSort} />
            </div>
            <div className="shrink-0 sm:w-12">
              <SortHeader label="Subs" sortKey="subs" active={sortKey} dir={sortDir} onSort={handleSort} align="right" />
            </div>
            <div className="shrink-0 sm:w-[72px]" />
          </div>

          {visibleRows.length === 0 && (
            <div className="flex min-h-64 flex-col items-center justify-center px-6 py-14 text-center">
              <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50 text-xl text-accent">◈</span>
              <p className="text-sm font-semibold text-gray-800">{query ? "No matching clients" : "Your client list is empty"}</p>
              <p className="mt-1 max-w-sm text-sm text-gray-400">
                {query ? "Try another search term." : "Add your first client, then attach its subsidiaries."}
              </p>
              {!query && (
                <button onClick={() => setDialog({ kind: "addHead" })} className="mt-4 rounded-lg border border-accent/20 bg-accent/5 px-3 py-2 text-sm font-medium text-accent hover:bg-accent/10">
                  + Add first client
                </button>
              )}
            </div>
          )}

          {visibleRows.map(({ group, subs }) => {
            const { head } = group;
            const open = isOpen(head.id, subs.length);
            const headSector = canonicalSector(head.sector ?? "", labels);
            return (
              <div key={head.id}>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3.5 py-3 border-b border-gray-100 hover:bg-[#FAFBFD] transition-colors">
                  <div className="flex min-w-0 flex-1 basis-full items-center gap-1.5 sm:basis-[200px]">
                    {group.subs.length > 0 ? (
                      <button
                        onClick={() => toggleHead(head.id)}
                        disabled={!!query}
                        title={query ? "Clear the search to collapse or expand" : undefined}
                        aria-label={open ? `Collapse ${head.name}` : `Expand ${head.name}`}
                        aria-expanded={open}
                        className="w-5 h-5 shrink-0 flex items-center justify-center rounded text-[10px] text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-40 disabled:hover:bg-transparent"
                      >
                        <span className={`transition-transform ${open ? "rotate-90" : ""}`}>▸</span>
                      </button>
                    ) : (
                      <span className="w-5 shrink-0" />
                    )}
                    <button
                      onClick={(e) => openPopup(head, "name", e.currentTarget)}
                      className="min-w-0 -mx-1 break-words rounded px-1 py-0.5 text-left text-[13px] font-semibold text-gray-900 hover:bg-gray-100 transition-colors"
                    >
                      {head.name}
                    </button>
                    {!head.countHead && <span className="shrink-0 text-[11px] text-gray-400">not counted</span>}
                    {group.subs.length > 0 && <span className="sm:hidden shrink-0 text-xs text-gray-400">· {group.subs.length} subs</span>}
                  </div>

                  <div className="shrink-0 sm:w-[150px]">
                    <button onClick={(e) => openPopup(head, "sector", e.currentTarget)} className="max-w-full rounded-full hover:brightness-95 transition-[filter]">
                      {headSector ? (
                        <SectorChip label={headSector} />
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-gray-300 px-2 py-0.5 text-[11px] text-gray-400 whitespace-nowrap hover:bg-gray-50 hover:text-gray-600">
                          + sector
                        </span>
                      )}
                    </button>
                  </div>

                  <label className="shrink-0 inline-flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer select-none whitespace-nowrap sm:w-[96px]">
                    <input
                      type="checkbox"
                      checked={head.countHead}
                      onChange={() => run(() => updateClient(head.id, { countHead: !head.countHead }))}
                      aria-label={`Count ${head.name} in total`}
                      className="h-4 w-4 accent-accent cursor-pointer"
                    />
                    Count
                  </label>

                  <div className="hidden sm:block shrink-0 w-12 text-right text-xs tabular-nums text-gray-500">{group.subs.length}</div>

                  <div className="ml-auto flex shrink-0 items-center justify-end gap-1 sm:w-[72px]">
                    <button onClick={() => setDialog({ kind: "addSub", head })} title="Add subsidiary" aria-label={`Add subsidiary to ${head.name}`} className={ACTION_BUTTON}>
                      +
                    </button>
                    <button onClick={() => removeHead(group)} title="Delete" aria-label={`Delete ${head.name}`} className={DELETE_BUTTON}>
                      ✕
                    </button>
                  </div>
                </div>

                {open &&
                  subs.map((sub) => (
                    <div
                      key={sub.id}
                      className="relative flex flex-wrap items-center gap-x-3 gap-y-2 pl-12 pr-3.5 py-2.5 border-b border-gray-100 bg-gray-50/50 hover:bg-gray-50 transition-colors sm:pl-[52px]"
                    >
                      <span aria-hidden className="pointer-events-none absolute top-0 bottom-0 left-6 border-l border-gray-200" />
                      <div className="flex min-w-0 flex-1 basis-0 items-center sm:basis-[200px]">
                        <button
                          onClick={(e) => openPopup(sub, "name", e.currentTarget)}
                          className="min-w-0 -mx-1 break-words rounded px-1 py-0.5 text-left text-[13px] font-medium text-gray-600 hover:bg-gray-100 transition-colors"
                        >
                          {sub.name}
                        </button>
                      </div>
                      <div className="hidden shrink-0 sm:block sm:w-[150px]" />
                      <div className="hidden shrink-0 sm:block sm:w-[96px]" />
                      <div className="hidden sm:block shrink-0 w-12" />
                      <div className="ml-auto flex shrink-0 items-center justify-end gap-1 sm:w-[72px]">
                        <button onClick={() => setDialog({ kind: "move", sub })} title="Move to another client" aria-label={`Move ${sub.name}`} className={ACTION_BUTTON}>
                          ⇄
                        </button>
                        <button onClick={() => removeSub(sub)} title="Delete" aria-label={`Delete ${sub.name}`} className={DELETE_BUTTON}>
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            );
          })}
        </div>

        <aside className="min-w-0 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="px-4 py-3 border-b border-gray-200">
            <div className="text-[13px] font-semibold text-gray-900">Companies per sector</div>
            <div className="text-[11px] text-gray-400 mt-0.5">Counted heads + their subsidiaries</div>
          </div>

          {sectors.total === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-gray-400">No companies counted yet</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {sectors.rows.map((row) => {
                const pct = (row.count / sectors.total) * 100;
                return (
                  <div key={row.key} className="px-4 py-3">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <SectorChip label={row.label} />
                      <span className="text-[13px] font-semibold text-gray-900 tabular-nums">{row.count}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: colorFor(row.label).solid }} />
                    </div>
                  </div>
                );
              })}
              {sectors.unassigned > 0 && (
                <div className="px-4 py-3">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium" style={UNASSIGNED_CHIP}>
                      Unassigned
                    </span>
                    <span className="text-[13px] font-semibold text-gray-900 tabular-nums">{sectors.unassigned}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
                    <div className="h-full rounded-full bg-gray-300" style={{ width: `${(sectors.unassigned / sectors.total) * 100}%` }} />
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-between bg-gray-50 border-t border-gray-200 px-4 py-2.5 text-[13px] font-semibold text-gray-900">
            <span>Total</span>
            <span className="tabular-nums">{sectors.total}</span>
          </div>
        </aside>
      </div>

      {popup && (
        <ClientTextPopup
          key={`${popup.client.id}-${popup.field}`}
          title={popup.field === "sector" ? "Sector" : popup.client.parentId ? "Subsidiary name" : "Client name"}
          value={popup.field === "sector" ? popup.client.sector ?? "" : popup.client.name}
          anchorRect={popup.anchorRect}
          onSave={(value) => {
            void savePopup(popup, value);
          }}
          onClose={() => setPopup(null)}
        />
      )}

      {dialog?.kind === "addHead" && (
        <HistoricalClientDialog
          mode="head"
          sectorOptions={sectorOptions}
          onClose={() => setDialog(null)}
          onSave={async (values) => {
            const saved = await run(() =>
              addClient({
                name: values.name,
                parentId: null,
                sector: canonicalSector(values.sector, labels),
                countHead: values.countHead,
              })
            );
            if (saved) setDialog(null);
          }}
        />
      )}

      {dialog?.kind === "addSub" && (
        <HistoricalClientDialog
          mode="sub"
          parentName={dialog.head.name}
          sectorOptions={sectorOptions}
          onClose={() => setDialog(null)}
          onSave={async (values) => {
            const saved = await run(() =>
              addClient({ name: values.name, parentId: dialog.head.id, sector: null, countHead: true })
            );
            if (saved) setDialog(null);
          }}
        />
      )}

      {dialog?.kind === "move" && (
        <MoveClientDialog
          sub={dialog.sub}
          heads={groups.map((group) => group.head).filter((head) => head.id !== dialog.sub.parentId)}
          onClose={() => setDialog(null)}
          onSave={async (headId) => {
            const saved = await run(() => updateClient(dialog.sub.id, { parentId: headId }));
            if (saved) setDialog(null);
          }}
        />
      )}

      {toast && (
        <div className="fixed bottom-5 right-5 z-[300] bg-gray-900 text-white text-[13px] rounded-lg px-4 py-2.5 shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
