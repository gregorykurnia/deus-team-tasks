"use client";

import { ColumnDef, FieldOptionsMap, PipelineEntry, TableKey } from "@/lib/clientTypes";
import { daysSince, formatDate, formatDateShort, targetDiffDays } from "@/lib/clientHelpers";
import { startColumnResize } from "@/lib/clientColumnResize";
import { ClientBadge } from "./ClientBadge";

function DaysCell({ n }: { n: number }) {
  if (n < 0) return <span className="text-xs font-medium text-gray-400">—</span>;
  if (n === 0) return <span className="text-xs font-medium text-gray-400">Today</span>;
  const cls = n > 14 ? "text-red-600" : n > 7 ? "text-amber-600" : "text-gray-400";
  return <span className={`text-xs font-medium ${cls}`}>{n}d ago</span>;
}

function TargetDateCell({ t }: { t: string }) {
  if (!t) return <span className="text-xs text-gray-400 whitespace-nowrap">—</span>;
  const diff = targetDiffDays(t);
  const label = formatDateShort(t);
  if (diff < 0) return <span className="text-xs font-medium text-red-600 whitespace-nowrap">{label} ⚠</span>;
  if (diff <= 3) return <span className="text-xs font-medium text-amber-600 whitespace-nowrap">{label} ({diff === 0 ? "today" : `${diff}d`})</span>;
  return <span className="text-xs text-gray-500 whitespace-nowrap">{label}</span>;
}

function NoteCell({ text }: { text?: string }) {
  if (!text) return <span className="text-gray-400 text-xs italic">—</span>;
  return <div className="text-gray-600 text-xs leading-relaxed line-clamp-2">{text}</div>;
}

export function ClientTable({
  tableKey,
  columns,
  rows,
  sortKey,
  sortDir,
  fieldOptions,
  emptyTitle,
  emptySub,
  onSort,
  onResize,
  onOpenText,
  onOpenDate,
  onOpenDropdown,
  onMove,
  onEdit,
  onDelete,
}: {
  tableKey: TableKey;
  columns: ColumnDef[];
  rows: PipelineEntry[];
  sortKey: string;
  sortDir: 1 | -1;
  fieldOptions: FieldOptionsMap;
  emptyTitle: string;
  emptySub: string;
  onSort: (key: string) => void;
  onResize: (key: string, width: number) => void;
  onOpenText: (field: string, row: PipelineEntry, el: HTMLElement, multiline?: boolean, isNumber?: boolean) => void;
  onOpenDate: (field: string, row: PipelineEntry, el: HTMLElement) => void;
  onOpenDropdown: (field: string, row: PipelineEntry, el: HTMLElement) => void;
  onMove: (row: PipelineEntry, el: HTMLElement) => void;
  onEdit: (row: PipelineEntry) => void;
  onDelete: (row: PipelineEntry) => void;
}) {
  function startResize(e: React.MouseEvent, colKey: string) {
    startColumnResize(e, colKey, onResize);
  }

  function badgeOption(field: string, label?: string) {
    return (fieldOptions[field] ?? []).find((o) => o.label === label) ?? null;
  }

  function builtinCell(col: ColumnDef, r: PipelineEntry): React.ReactNode {
    const key = col.key;
    if (tableKey === "main") {
      switch (key) {
        case "company":
          return (
            <td key={key} className="px-3.5 py-3 border-b border-gray-100 font-semibold text-gray-900 cursor-pointer hover:bg-gray-50/60" onClick={(e) => onOpenText("company", r, e.currentTarget)}>
              {r.company}
              {r.industry ? <span className="block text-[11px] font-normal text-gray-400 mt-0.5">{r.industry}</span> : null}
            </td>
          );
        case "type":
          return (
            <td key={key} className="px-3.5 py-3 border-b border-gray-100">
              <ClientBadge label={r.type ?? ""} option={badgeOption("type", r.type)} onClick={(e) => onOpenDropdown("type", r, e.currentTarget)} />
            </td>
          );
        case "date":
          return (
            <td key={key} className="px-3.5 py-3 border-b border-gray-100 cursor-pointer hover:bg-gray-50/60" onClick={(e) => onOpenDate("date", r, e.currentTarget)}>
              {r.date ? <span className="text-xs text-gray-500 whitespace-nowrap">{formatDate(r.date)}</span> : <span className="text-xs text-gray-400">—</span>}
            </td>
          );
        case "since":
          return (
            <td key={key} className="px-3.5 py-3 border-b border-gray-100">
              {r.date ? <DaysCell n={daysSince(r.date)} /> : <span className="text-xs text-gray-400">—</span>}
            </td>
          );
        case "status":
          return (
            <td key={key} className="px-3.5 py-3 border-b border-gray-100">
              <ClientBadge label={r.status ?? ""} option={badgeOption("status", r.status)} onClick={(e) => onOpenDropdown("status", r, e.currentTarget)} />
            </td>
          );
        case "pic":
          return (
            <td key={key} className="px-3.5 py-3 border-b border-gray-100 text-gray-600 cursor-pointer hover:bg-gray-50/60" onClick={(e) => onOpenText("pic", r, e.currentTarget)}>
              {r.pic || "—"}
            </td>
          );
        case "sourcing":
          return (
            <td key={key} className="px-3.5 py-3 border-b border-gray-100 text-gray-400 text-xs cursor-pointer hover:bg-gray-50/60" onClick={(e) => onOpenText("sourcing", r, e.currentTarget)}>
              {r.sourcing || "—"}
            </td>
          );
        case "product":
          return (
            <td key={key} className="px-3.5 py-3 border-b border-gray-100 text-gray-600 text-xs max-w-[140px] break-words cursor-pointer hover:bg-gray-50/60" onClick={(e) => onOpenText("product", r, e.currentTarget)}>
              {r.product || "—"}
            </td>
          );
        case "priority":
          return (
            <td key={key} className="px-3.5 py-3 border-b border-gray-100">
              <ClientBadge label={r.priority ?? ""} option={badgeOption("priority", r.priority)} onClick={(e) => onOpenDropdown("priority", r, e.currentTarget)} />
            </td>
          );
        case "industry":
          return (
            <td key={key} className="px-3.5 py-3 border-b border-gray-100 text-gray-400 max-w-[140px] break-words cursor-pointer hover:bg-gray-50/60" onClick={(e) => onOpenText("industry", r, e.currentTarget)}>
              {r.industry || "—"}
            </td>
          );
        case "notes":
          return (
            <td key={key} className="px-3.5 py-3 border-b border-gray-100 cursor-pointer hover:bg-gray-50/60" onClick={(e) => onOpenText("notes", r, e.currentTarget, true)}>
              <NoteCell text={r.notes} />
            </td>
          );
        case "target":
          return (
            <td key={key} className="px-3.5 py-3 border-b border-gray-100 cursor-pointer hover:bg-gray-50/60" onClick={(e) => onOpenDate("target", r, e.currentTarget)}>
              <TargetDateCell t={r.target ?? ""} />
            </td>
          );
        default:
          return <td key={key} className="px-3.5 py-3 border-b border-gray-100" />;
      }
    }
    if (tableKey === "raw") {
      switch (key) {
        case "company":
          return (
            <td key={key} className="px-3.5 py-3 border-b border-gray-100 font-semibold text-gray-900 cursor-pointer hover:bg-gray-50/60" onClick={(e) => onOpenText("company", r, e.currentTarget)}>
              {r.company}
            </td>
          );
        case "type":
          return (
            <td key={key} className="px-3.5 py-3 border-b border-gray-100">
              <ClientBadge label={r.type ?? ""} option={badgeOption("type", r.type)} onClick={(e) => onOpenDropdown("type", r, e.currentTarget)} />
            </td>
          );
        case "reach":
          return (
            <td key={key} className="px-3.5 py-3 border-b border-gray-100 cursor-pointer hover:bg-gray-50/60" onClick={(e) => onOpenDate("reach", r, e.currentTarget)}>
              {r.reach ? <span className="text-xs text-gray-500 whitespace-nowrap">{formatDate(r.reach)}</span> : <span className="text-xs text-gray-400">—</span>}
            </td>
          );
        case "industry":
          return (
            <td key={key} className="px-3.5 py-3 border-b border-gray-100 text-gray-400 max-w-[140px] break-words cursor-pointer hover:bg-gray-50/60" onClick={(e) => onOpenText("industry", r, e.currentTarget)}>
              {r.industry || "—"}
            </td>
          );
        case "sourcing":
          return (
            <td key={key} className="px-3.5 py-3 border-b border-gray-100 text-gray-400 text-xs cursor-pointer hover:bg-gray-50/60" onClick={(e) => onOpenText("sourcing", r, e.currentTarget)}>
              {r.sourcing || "—"}
            </td>
          );
        case "priority":
          return (
            <td key={key} className="px-3.5 py-3 border-b border-gray-100">
              <ClientBadge label={r.priority ?? ""} option={badgeOption("priority", r.priority)} onClick={(e) => onOpenDropdown("priority", r, e.currentTarget)} />
            </td>
          );
        case "notes":
          return (
            <td key={key} className="px-3.5 py-3 border-b border-gray-100 cursor-pointer hover:bg-gray-50/60" onClick={(e) => onOpenText("notes", r, e.currentTarget, true)}>
              <NoteCell text={r.notes} />
            </td>
          );
        default:
          return <td key={key} className="px-3.5 py-3 border-b border-gray-100" />;
      }
    }
    // hold
    switch (key) {
      case "company":
        return (
          <td key={key} className="px-3.5 py-3 border-b border-gray-100 font-semibold text-gray-900 cursor-pointer hover:bg-gray-50/60" onClick={(e) => onOpenText("company", r, e.currentTarget)}>
            {r.company}
          </td>
        );
      case "type":
        return (
          <td key={key} className="px-3.5 py-3 border-b border-gray-100">
            <ClientBadge label={r.type ?? ""} option={badgeOption("type", r.type)} onClick={(e) => onOpenDropdown("type", r, e.currentTarget)} />
          </td>
        );
      case "product":
        return (
          <td key={key} className="px-3.5 py-3 border-b border-gray-100 text-xs max-w-[160px] break-words cursor-pointer hover:bg-gray-50/60" onClick={(e) => onOpenText("product", r, e.currentTarget)}>
            {r.product || "—"}
          </td>
        );
      case "reason":
        return (
          <td key={key} className="px-3.5 py-3 border-b border-gray-100 text-gray-600 max-w-[260px] break-words cursor-pointer hover:bg-gray-50/60" onClick={(e) => onOpenText("reason", r, e.currentTarget, true)}>
            <NoteCell text={r.reason} />
          </td>
        );
      default:
        return <td key={key} className="px-3.5 py-3 border-b border-gray-100" />;
    }
  }

  function customCell(col: ColumnDef, r: PipelineEntry): React.ReactNode {
    const val = r[col.key];
    if (col.type === "dropdown") {
      const label = typeof val === "string" ? val : "";
      return (
        <td key={col.key} className="px-3.5 py-3 border-b border-gray-100">
          <ClientBadge label={label} option={badgeOption(col.key, label)} onClick={(e) => onOpenDropdown(col.key, r, e.currentTarget)} />
        </td>
      );
    }
    if (col.type === "date") {
      const d = typeof val === "string" ? val : "";
      return (
        <td key={col.key} className="px-3.5 py-3 border-b border-gray-100 cursor-pointer hover:bg-gray-50/60" onClick={(e) => onOpenDate(col.key, r, e.currentTarget)}>
          {d ? <span className="text-xs text-gray-500 whitespace-nowrap">{formatDate(d)}</span> : <span className="text-xs text-gray-400">—</span>}
        </td>
      );
    }
    if (col.type === "textarea") {
      const text = typeof val === "string" ? val : "";
      return (
        <td key={col.key} className="px-3.5 py-3 border-b border-gray-100 cursor-pointer hover:bg-gray-50/60" onClick={(e) => onOpenText(col.key, r, e.currentTarget, true)}>
          <NoteCell text={text} />
        </td>
      );
    }
    const display = val !== undefined && val !== null && val !== "" ? String(val) : null;
    return (
      <td
        key={col.key}
        className={`px-3.5 py-3 border-b border-gray-100 text-gray-600 cursor-pointer hover:bg-gray-50/60 ${col.type === "number" ? "tabular-nums" : ""}`}
        onClick={(e) => onOpenText(col.key, r, e.currentTarget, false, col.type === "number")}
      >
        {display ?? <span className="text-gray-400 text-xs">—</span>}
      </td>
    );
  }

  const colspan = columns.length + 1;

  return (
    <div className="bg-white border border-gray-200 border-t-0 rounded-b-lg overflow-x-auto shadow-sm">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            {columns.map((col) => {
              const sortable = !!col.sortKey && !col.custom;
              const style = col.width ? { minWidth: col.width, width: col.width } : undefined;
              return (
                <th
                  key={col.key}
                  style={style}
                  onClick={sortable ? () => onSort(col.sortKey) : undefined}
                  className={`relative px-3.5 py-2.5 bg-gray-50 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide border-b border-gray-200 whitespace-nowrap select-none ${sortable ? "cursor-pointer hover:text-gray-600" : ""}`}
                >
                  {col.label}
                  {sortable && (
                    <span className={`ml-1 text-[10px] ${sortKey === col.sortKey ? "text-accent opacity-100" : "opacity-40"}`}>
                      {sortKey === col.sortKey ? (sortDir === 1 ? "▲" : "▼") : "⇅"}
                    </span>
                  )}
                  <div
                    onMouseDown={(e) => startResize(e, col.key)}
                    className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-accent/40"
                  />
                </th>
              );
            })}
            <th className="w-[70px] bg-gray-50 border-b border-gray-200" />
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={colspan} className="text-center py-14 px-5 text-gray-400">
                <div className="text-3xl mb-3 opacity-40">📭</div>
                <p className="text-sm">{emptyTitle}</p>
                <span className="text-xs block mt-1">{emptySub}</span>
              </td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr key={r.id} className="hover:bg-[#FAFBFD]">
                {columns.map((col) => (col.custom ? customCell(col, r) : builtinCell(col, r)))}
                <td className="px-3.5 py-3 border-b border-gray-100">
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={(e) => onMove(r, e.currentTarget)} title="Move to..." className="w-[30px] h-[30px] flex items-center justify-center rounded-md border border-gray-200 text-gray-400 hover:bg-gray-50 hover:text-gray-700">
                      ⇄
                    </button>
                    <button onClick={() => onEdit(r)} title="Edit" className="w-[30px] h-[30px] flex items-center justify-center rounded-md border border-gray-200 text-gray-400 hover:bg-gray-50 hover:text-gray-700">
                      ✎
                    </button>
                    <button onClick={() => onDelete(r)} title="Delete" className="w-[30px] h-[30px] flex items-center justify-center rounded-md border border-gray-200 text-gray-400 hover:bg-red-50 hover:text-red-700">
                      🗑
                    </button>
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
