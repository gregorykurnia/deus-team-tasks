"use client";

import { useEffect, useMemo, useState } from "react";
import { useClientPipeline } from "@/lib/useClientPipeline";
import { useTasks } from "@/lib/useTasks";
import { loadColConfig, loadFieldOptions, saveColConfig, saveFieldOptions } from "@/lib/clientLocalConfig";
import { BUILTIN_COLS, ColumnDef, ColumnType, FIELD_TITLES, PipelineEntry, PipelineTab, PRIO_ORDER, TableKey } from "@/lib/clientTypes";
import { daysSince } from "@/lib/clientHelpers";
import { ClientTable } from "./clients/ClientTable";
import { ClientEntryModal } from "./clients/ClientEntryModal";
import { ClientTextPopup } from "./clients/ClientTextPopup";
import { ClientDatePopup } from "./clients/ClientDatePopup";
import { ClientDropdownPopup } from "./clients/ClientDropdownPopup";
import { ClientMovePopup } from "./clients/ClientMovePopup";
import { ClientColumnManager } from "./clients/ClientColumnManager";

const TABS: { id: PipelineTab; label: string; icon: string }[] = [
  { id: "prospect", label: "Prospects & Active", icon: "📈" },
  { id: "done", label: "Clients & Partners", icon: "🤝" },
  { id: "rawlist", label: "Raw List", icon: "☰" },
  { id: "holdreject", label: "Hold or Reject", icon: "⊘" },
];

const ADD_LABELS: Record<PipelineTab, string> = {
  prospect: "Add prospect",
  done: "Add prospect",
  rawlist: "Add to raw list",
  holdreject: "Add to hold / reject",
};

function tableKeyForTab(tab: PipelineTab): TableKey {
  if (tab === "rawlist") return "raw";
  if (tab === "holdreject") return "hold";
  return "main";
}

function rowTableKey(r: PipelineEntry): TableKey {
  if (r._raw) return "raw";
  if (r._hold) return "hold";
  return "main";
}

type TextPopupState = { field: string; row: PipelineEntry; anchorRect: DOMRect; multiline: boolean; isNumber: boolean };
type DatePopupState = { field: string; row: PipelineEntry; anchorRect: DOMRect };
type DropdownPopupState = { field: string; row: PipelineEntry; anchorRect: DOMRect };
type MovePopupState = { row: PipelineEntry; anchorRect: DOMRect };
type ModalState = { kind: TableKey; editing: PipelineEntry | null; prefill: Partial<PipelineEntry> | null };

export function ClientsTab() {
  const { entries, loading, nextId, saveEntry, deleteEntry } = useClientPipeline();
  const { addTask } = useTasks();

  async function handleFollowUp(row: PipelineEntry) {
    const today = new Date().toISOString().slice(0, 10);
    await addTask({
      task: `Follow up: ${row.company}`,
      responsible: [],
      informed: [],
      keyPoints: "",
      startDate: today,
      endDate: today,
      order: Date.now(),
      linkedClientId: row.id,
    });
  }

  const [tab, setTab] = useState<PipelineTab>("prospect");
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterProduct, setFilterProduct] = useState("");
  const [filterPriority, setFilterPriority] = useState("");
  const [sortKey, setSortKey] = useState("date");
  const [sortDir, setSortDir] = useState<1 | -1>(1);

  const [fieldOptions, setFieldOptions] = useState(() => loadFieldOptions());
  const [colConfig, setColConfig] = useState(() => loadColConfig());
  const [colMgrOpen, setColMgrOpen] = useState(false);

  const [modal, setModal] = useState<ModalState | null>(null);
  const [textPopup, setTextPopup] = useState<TextPopupState | null>(null);
  const [datePopup, setDatePopup] = useState<DatePopupState | null>(null);
  const [dropdownPopup, setDropdownPopup] = useState<DropdownPopupState | null>(null);
  const [movePopup, setMovePopup] = useState<MovePopupState | null>(null);

  useEffect(() => {
    saveFieldOptions(fieldOptions);
  }, [fieldOptions]);
  useEffect(() => {
    saveColConfig(colConfig);
  }, [colConfig]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      setModal(null);
      setTextPopup(null);
      setDatePopup(null);
      setDropdownPopup(null);
      setMovePopup(null);
      setColMgrOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const isDone = (r: PipelineEntry) => r.status === "Client / Partner Done Deal";
  const isRaw = (r: PipelineEntry) => r._raw === true;
  const isHold = (r: PipelineEntry) => r._hold === true;

  const prospects = useMemo(() => entries.filter((r) => !isDone(r) && !isRaw(r) && !isHold(r)), [entries]);
  const doneDeals = useMemo(() => entries.filter(isDone), [entries]);
  const rawList = useMemo(() => entries.filter(isRaw), [entries]);
  const holdList = useMemo(() => entries.filter(isHold), [entries]);

  const statuses = useMemo(() => Array.from(new Set(entries.map((d) => d.status).filter(Boolean))) as string[], [entries]);
  const products = useMemo(() => Array.from(new Set(entries.map((d) => d.product).filter(Boolean))) as string[], [entries]);

  function sortMain(rows: PipelineEntry[]): PipelineEntry[] {
    const cols = colConfig.main;
    return [...rows].sort((a, b) => {
      if (sortKey === "priority") {
        const d = (PRIO_ORDER[a.priority ?? ""] ?? 3) - (PRIO_ORDER[b.priority ?? ""] ?? 3);
        return d !== 0 ? d * sortDir : new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime();
      }
      if (sortKey === "company") return (a.company ?? "").localeCompare(b.company ?? "") * sortDir;
      if (sortKey === "date" || sortKey === "since") return (new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime()) * sortDir;
      if (sortKey === "target") return ((a.target || "9999") < (b.target || "9999") ? -1 : 1) * sortDir;
      const col = cols.find((c) => c.key === sortKey);
      if (col && col.type === "number") return ((parseFloat(String(a[sortKey])) || 0) - (parseFloat(String(b[sortKey])) || 0)) * sortDir;
      return String(a[sortKey] ?? "").localeCompare(String(b[sortKey] ?? "")) * sortDir;
    });
  }
  function sortRaw(rows: PipelineEntry[]): PipelineEntry[] {
    const cols = colConfig.raw;
    return [...rows].sort((a, b) => {
      if (sortKey === "priority") {
        const d = (PRIO_ORDER[a.priority ?? ""] ?? 3) - (PRIO_ORDER[b.priority ?? ""] ?? 3);
        return d !== 0 ? d * sortDir : 0;
      }
      if (sortKey === "company") return (a.company ?? "").localeCompare(b.company ?? "") * sortDir;
      if (sortKey === "reach") return ((a.reach || "9999") < (b.reach || "9999") ? -1 : 1) * sortDir;
      const col = cols.find((c) => c.key === sortKey);
      if (col && col.type === "number") return ((parseFloat(String(a[sortKey])) || 0) - (parseFloat(String(b[sortKey])) || 0)) * sortDir;
      return String(a[sortKey] ?? "").localeCompare(String(b[sortKey] ?? "")) * sortDir;
    });
  }
  function sortHold(rows: PipelineEntry[]): PipelineEntry[] {
    const cols = colConfig.hold;
    return [...rows].sort((a, b) => {
      const col = cols.find((c) => c.key === sortKey);
      if (col && col.type === "number") return ((parseFloat(String(a[sortKey])) || 0) - (parseFloat(String(b[sortKey])) || 0)) * sortDir;
      return String(a[sortKey] ?? "").localeCompare(String(b[sortKey] ?? "")) * sortDir;
    });
  }

  let visibleRows: PipelineEntry[];
  let summaryRows: PipelineEntry[];
  if (tab === "rawlist") {
    let rows = [...rawList];
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter((r) => `${r.company}${r.sourcing}${r.industry}${r.notes}`.toLowerCase().includes(q));
    }
    if (filterPriority) rows = rows.filter((r) => r.priority === filterPriority);
    visibleRows = sortRaw(rows);
    summaryRows = rawList;
  } else if (tab === "holdreject") {
    let rows = [...holdList];
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter((r) => `${r.company}${r.reason}`.toLowerCase().includes(q));
    }
    visibleRows = sortHold(rows);
    summaryRows = holdList;
  } else {
    let rows = tab === "done" ? doneDeals : prospects;
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter((r) => `${r.company}${r.pic}${r.sourcing}${r.product}`.toLowerCase().includes(q));
    }
    if (filterStatus) rows = rows.filter((r) => r.status === filterStatus);
    if (filterProduct) rows = rows.filter((r) => r.product === filterProduct);
    if (filterPriority) rows = rows.filter((r) => r.priority === filterPriority);
    visibleRows = sortMain(rows);
    summaryRows = tab === "done" ? doneDeals : prospects;
  }

  const tk = tableKeyForTab(tab);
  const visibleCols = colConfig[tk].filter((c) => c.visible);

  function handleSort(key: string) {
    if (sortKey === key) setSortDir((d) => (d === 1 ? -1 : 1) as 1 | -1);
    else {
      setSortKey(key);
      setSortDir(1);
    }
  }

  function handleResize(key: string, width: number) {
    setColConfig((prev) => ({
      ...prev,
      [tk]: prev[tk].map((c) => (c.key === key ? { ...c, width } : c)),
    }));
  }

  async function persist(entry: PipelineEntry) {
    await saveEntry(entry);
  }

  function openTextPopup(field: string, row: PipelineEntry, el: HTMLElement, multiline = false, isNumber = false) {
    setDropdownPopup(null);
    setDatePopup(null);
    setMovePopup(null);
    setTextPopup({ field, row, anchorRect: el.getBoundingClientRect(), multiline, isNumber });
  }
  function openDatePopup(field: string, row: PipelineEntry, el: HTMLElement) {
    setTextPopup(null);
    setDropdownPopup(null);
    setMovePopup(null);
    setDatePopup({ field, row, anchorRect: el.getBoundingClientRect() });
  }
  function openDropdownPopup(field: string, row: PipelineEntry, el: HTMLElement) {
    setTextPopup(null);
    setDatePopup(null);
    setMovePopup(null);
    setDropdownPopup({ field, row, anchorRect: el.getBoundingClientRect() });
  }
  function openMovePopup(row: PipelineEntry, el: HTMLElement) {
    setTextPopup(null);
    setDatePopup(null);
    setDropdownPopup(null);
    setMovePopup({ row, anchorRect: el.getBoundingClientRect() });
  }

  function buildMovePrefill(r: PipelineEntry, targetTk: TableKey): Partial<PipelineEntry> {
    const cols = colConfig[targetTk] ?? BUILTIN_COLS[targetTk];
    const prefill: Partial<PipelineEntry> = {};
    cols.forEach((col) => {
      const v = r[col.key];
      if (v !== undefined && v !== "") (prefill as Record<string, unknown>)[col.key] = v;
    });
    return prefill;
  }

  function handleMove(target: TableKey) {
    if (!movePopup) return;
    const prefill = buildMovePrefill(movePopup.row, target);
    setMovePopup(null);
    setModal({ kind: target, editing: null, prefill });
  }

  function openAddModal() {
    setModal({ kind: tableKeyForTab(tab), editing: null, prefill: null });
  }
  function openEditModal(row: PipelineEntry) {
    setModal({ kind: rowTableKey(row), editing: row, prefill: null });
  }

  async function handleSaveModal(patch: Partial<PipelineEntry>) {
    if (!modal) return;
    const id = modal.editing ? modal.editing.id : nextId();
    const entry: PipelineEntry = { id, ...patch } as PipelineEntry;
    await persist(entry);
    setModal(null);
  }

  async function handleDelete(row: PipelineEntry) {
    const messages: Record<TableKey, string> = {
      main: "Remove this entry from the pipeline?",
      raw: "Remove this entry from the raw list?",
      hold: "Remove this entry?",
    };
    if (!confirm(messages[rowTableKey(row)])) return;
    await deleteEntry(row.id);
  }

  function getFieldTitle(field: string): string {
    if (FIELD_TITLES[field]) return FIELD_TITLES[field];
    for (const key of ["main", "raw", "hold"] as TableKey[]) {
      const col = colConfig[key].find((c) => c.key === field);
      if (col) return col.label;
    }
    return field;
  }

  const total = summaryRows.length;
  const highPrio = summaryRows.filter((r) => r.priority === "High").length;
  const overdue = summaryRows.filter((r) => (r.date ? daysSince(r.date) > 14 : false)).length;
  const followUp = summaryRows.filter((r) => r.status === "To Follow Up").length;

  const isRawOrHoldTab = tab === "rawlist" || tab === "holdreject";
  const emptyTitles: Record<PipelineTab, { title: string; sub: string }> = {
    prospect: { title: "No entries found", sub: "Try adjusting your filters or add a new prospect" },
    done: { title: "No entries found", sub: "Try adjusting your filters or add a new prospect" },
    rawlist: { title: "Raw list is empty", sub: "Add companies you plan to reach out to" },
    holdreject: { title: "No entries here", sub: "Add companies you've put on hold or rejected" },
  };

  if (loading) {
    return <div className="text-gray-400 text-sm py-20 text-center">Loading pipeline…</div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
        <div>
          <div className="text-[22px] font-semibold text-gray-900 tracking-tight">Client Pipeline</div>
          <div className="text-[13px] text-gray-400 mt-0.5">Track prospects, follow-ups, and deals across all products</div>
        </div>
        <button onClick={openAddModal} className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md text-[13px] font-medium bg-accent text-white hover:opacity-90">
          + {ADD_LABELS[tab]}
        </button>
      </div>

      <div className="flex flex-wrap gap-3 mb-5">
        <div className="flex-1 min-w-[130px] bg-white border border-gray-200 rounded-lg px-5 py-3.5 shadow-sm">
          <div className="text-[11px] font-medium text-gray-400 uppercase tracking-wide mb-1.5">Total</div>
          <div className="text-2xl font-semibold text-gray-900 leading-none">{total}</div>
          <div className="text-[11px] text-gray-400 mt-1">{tab === "done" ? "clients & partners" : "in pipeline"}</div>
        </div>
        <div className="flex-1 min-w-[130px] bg-white border border-gray-200 rounded-lg px-5 py-3.5 shadow-sm">
          <div className="text-[11px] font-medium text-gray-400 uppercase tracking-wide mb-1.5">High Priority</div>
          <div className={`text-2xl font-semibold leading-none ${highPrio > 0 ? "text-red-600" : "text-gray-900"}`}>{highPrio}</div>
          <div className="text-[11px] text-gray-400 mt-1">need attention</div>
        </div>
        <div className="flex-1 min-w-[130px] bg-white border border-gray-200 rounded-lg px-5 py-3.5 shadow-sm">
          <div className="text-[11px] font-medium text-gray-400 uppercase tracking-wide mb-1.5">To Follow Up</div>
          <div className={`text-2xl font-semibold leading-none ${followUp > 0 ? "text-amber-600" : "text-gray-900"}`}>{followUp}</div>
          <div className="text-[11px] text-gray-400 mt-1">awaiting action</div>
        </div>
        <div className="flex-1 min-w-[130px] bg-white border border-gray-200 rounded-lg px-5 py-3.5 shadow-sm">
          <div className="text-[11px] font-medium text-gray-400 uppercase tracking-wide mb-1.5">No Contact 14d+</div>
          <div className={`text-2xl font-semibold leading-none ${overdue > 0 ? "text-red-600" : "text-emerald-600"}`}>{overdue}</div>
          <div className="text-[11px] text-gray-400 mt-1">may be going cold</div>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap mb-4">
        <div className="relative flex-1 min-w-[200px] max-w-[280px]">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs">🔍</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search company, PIC..."
            className="w-full h-9 pl-8 pr-2.5 text-[13px] border border-gray-200 rounded-md outline-none focus:border-accent focus:ring-2 focus:ring-accent/10"
          />
        </div>
        {!isRawOrHoldTab && (
          <>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="w-[170px] h-9 text-[13px] border border-gray-200 rounded-md px-2.5 outline-none focus:border-accent bg-white">
              <option value="">All statuses</option>
              {statuses.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <select value={filterProduct} onChange={(e) => setFilterProduct(e.target.value)} className="w-[180px] h-9 text-[13px] border border-gray-200 rounded-md px-2.5 outline-none focus:border-accent bg-white">
              <option value="">All products</option>
              {products.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </>
        )}
        {tab !== "holdreject" && (
          <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)} className="w-[130px] h-9 text-[13px] border border-gray-200 rounded-md px-2.5 outline-none focus:border-accent bg-white">
            <option value="">All priorities</option>
            <option>High</option>
            <option>Medium</option>
            <option>Low</option>
          </select>
        )}
        <div className="flex-1" />
        <button onClick={() => setColMgrOpen(true)} title="Manage columns" className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-md text-[13px] font-medium border border-gray-200 text-gray-700 hover:bg-gray-50">
          ▦ Columns
        </button>
      </div>

      <div className="flex border-b border-gray-200">
        {TABS.map((t) => {
          const count = t.id === "prospect" ? prospects.length : t.id === "done" ? doneDeals.length : t.id === "rawlist" ? rawList.length : holdList.length;
          const active = tab === t.id;
          return (
            <div
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-medium cursor-pointer border-b-2 -mb-px whitespace-nowrap ${
                active ? "text-accent border-accent" : "text-gray-400 border-transparent hover:text-gray-600"
              }`}
            >
              <span className="text-xs">{t.icon}</span>
              {t.label}
              <span className={`text-[11px] font-semibold rounded-full px-1.5 ${active ? "bg-accent/10 text-accent" : "bg-gray-100 text-gray-400"}`}>{count}</span>
            </div>
          );
        })}
      </div>

      <ClientTable
        tableKey={tk}
        columns={visibleCols}
        rows={visibleRows}
        sortKey={sortKey}
        sortDir={sortDir}
        fieldOptions={fieldOptions}
        emptyTitle={emptyTitles[tab].title}
        emptySub={emptyTitles[tab].sub}
        onSort={handleSort}
        onResize={handleResize}
        onOpenText={openTextPopup}
        onOpenDate={openDatePopup}
        onOpenDropdown={openDropdownPopup}
        onMove={openMovePopup}
        onEdit={openEditModal}
        onDelete={handleDelete}
        onFollowUp={handleFollowUp}
      />

      {modal && (
        <ClientEntryModal
          kind={modal.kind}
          editing={modal.editing}
          prefill={modal.prefill}
          fieldOptions={fieldOptions}
          onSave={handleSaveModal}
          onClose={() => setModal(null)}
        />
      )}

      {textPopup && (
        <ClientTextPopup
          title={getFieldTitle(textPopup.field)}
          value={String(textPopup.row[textPopup.field] ?? "")}
          multiline={textPopup.multiline}
          isNumber={textPopup.isNumber}
          anchorRect={textPopup.anchorRect}
          onSave={(value) => {
            persist({ ...textPopup.row, [textPopup.field]: value });
          }}
          onClose={() => setTextPopup(null)}
        />
      )}

      {datePopup && (
        <ClientDatePopup
          title={getFieldTitle(datePopup.field)}
          value={String(datePopup.row[datePopup.field] ?? "")}
          anchorRect={datePopup.anchorRect}
          onSave={(value) => {
            persist({ ...datePopup.row, [datePopup.field]: value });
          }}
          onClose={() => setDatePopup(null)}
        />
      )}

      {dropdownPopup && (
        <ClientDropdownPopup
          title={getFieldTitle(dropdownPopup.field)}
          options={fieldOptions[dropdownPopup.field] ?? []}
          current={String(dropdownPopup.row[dropdownPopup.field] ?? "")}
          anchorRect={dropdownPopup.anchorRect}
          onSelect={(label) => {
            persist({ ...dropdownPopup.row, [dropdownPopup.field]: label });
            setDropdownPopup(null);
          }}
          onOptionsChange={(options) => {
            const field = dropdownPopup.field;
            const oldOptions = fieldOptions[field] ?? [];
            setFieldOptions((prev) => ({ ...prev, [field]: options }));
            // If a rename occurred (same count, one label differs at same position), propagate to rows.
            if (options.length === oldOptions.length) {
              for (let i = 0; i < options.length; i++) {
                if (oldOptions[i]?.label !== options[i]?.label) {
                  const oldLabel = oldOptions[i].label;
                  const newLabel = options[i].label;
                  entries.forEach((r) => {
                    if (r[field] === oldLabel) persist({ ...r, [field]: newLabel });
                  });
                }
              }
            }
          }}
          onClose={() => setDropdownPopup(null)}
        />
      )}

      {movePopup && <ClientMovePopup from={rowTableKey(movePopup.row)} anchorRect={movePopup.anchorRect} onMove={handleMove} onClose={() => setMovePopup(null)} />}

      {colMgrOpen && (
        <ClientColumnManager
          tabLabel={tk === "main" ? "Prospects & Active / Clients" : tk === "raw" ? "Raw List" : "Hold or Reject"}
          columns={colConfig[tk]}
          onToggleVis={(key) => setColConfig((prev) => ({ ...prev, [tk]: prev[tk].map((c) => (c.key === key ? { ...c, visible: !c.visible } : c)) }))}
          onRename={(key, label) => setColConfig((prev) => ({ ...prev, [tk]: prev[tk].map((c) => (c.key === key ? { ...c, label } : c)) }))}
          onWidthChange={(key, width) => setColConfig((prev) => ({ ...prev, [tk]: prev[tk].map((c) => (c.key === key ? { ...c, width } : c)) }))}
          onDeleteCustom={(key) => {
            if (!confirm("Remove this column? Data stored in this column will remain but won't be shown.")) return;
            setColConfig((prev) => ({ ...prev, [tk]: prev[tk].filter((c) => c.key !== key) }));
          }}
          onAddColumn={(label, type: ColumnType) => {
            const key = `cx_${Date.now()}`;
            const newCol: ColumnDef = { key, label, type, width: null, visible: true, custom: true, sortKey: key };
            setColConfig((prev) => ({ ...prev, [tk]: [...prev[tk], newCol] }));
            if (type === "dropdown") setFieldOptions((prev) => (prev[key] ? prev : { ...prev, [key]: [] }));
          }}
          onClose={() => setColMgrOpen(false)}
        />
      )}
    </div>
  );
}
