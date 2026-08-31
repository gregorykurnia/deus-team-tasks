"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Task, NewTask, TASK_TYPES } from "@/lib/types";
import { useClientPipeline } from "@/lib/useClientPipeline";
import { loadFieldOptions } from "@/lib/clientLocalConfig";
import { useTaskGroups } from "@/lib/useTaskGroups";
import { PipelineEntry } from "@/lib/clientTypes";
import { Chip } from "./Chip";
import { TaskModal } from "./TaskModal";
import { ClientEntryModal } from "./clients/ClientEntryModal";

const UNGROUPED = "__ungrouped__";
const UNGROUPED_LABEL = "Pre-Incentive Technical";

type SubTab = "general" | "prospects" | "clients";

const LINKED_COLS = [
  "company",
  "description",
  "type",
  "date",
  "responsible",
  "keyPoints",
  "lastAction",
  "daysSince",
  "done",
] as const;

const DEFAULT_LINKED_COL_WIDTHS: Record<(typeof LINKED_COLS)[number], number> = {
  company: 160,
  description: 190,
  type: 170,
  date: 170,
  responsible: 170,
  keyPoints: 260,
  lastAction: 150,
  daysSince: 140,
  done: 90,
};

const LINKED_COL_WIDTHS_STORAGE_KEY = "linkedTaskTableColWidths";
const MIN_COL_WIDTH = 60;

function loadColWidths(): Record<string, number> {
  if (typeof window === "undefined") return DEFAULT_LINKED_COL_WIDTHS;
  try {
    const raw = window.localStorage.getItem(LINKED_COL_WIDTHS_STORAGE_KEY);
    return raw ? { ...DEFAULT_LINKED_COL_WIDTHS, ...JSON.parse(raw) } : { ...DEFAULT_LINKED_COL_WIDTHS };
  } catch {
    return { ...DEFAULT_LINKED_COL_WIDTHS };
  }
}

function isDoneEntry(r: PipelineEntry) {
  return r.status === "Client / Partner Done Deal";
}

function entryTableKey(r: PipelineEntry): "main" | "raw" | "hold" {
  if (r._raw) return "raw";
  if (r._hold) return "hold";
  return "main";
}

function ResizableTh({
  id,
  children,
  className,
  last,
  onResizeStart,
}: {
  id: string;
  children: React.ReactNode;
  className?: string;
  last?: boolean;
  onResizeStart: (id: string, e: React.MouseEvent) => void;
}) {
  return (
    <th className={`relative px-4 py-3 overflow-hidden ${className ?? ""}`}>
      <div className="truncate">{children}</div>
      {!last && (
        <div
          onMouseDown={(e) => onResizeStart(id, e)}
          onClick={(e) => e.stopPropagation()}
          className="absolute right-0 top-0 z-10 h-full w-2 -mr-1 cursor-col-resize select-none touch-none hover:bg-accent/40 active:bg-accent/60"
        />
      )}
    </th>
  );
}

export function TasksTab({
  subTab,
  tasks,
  allNames,
  onAdd,
  onUpdate,
  onDelete,
}: {
  subTab: SubTab;
  tasks: Task[];
  allNames: string[];
  onAdd: (t: NewTask) => void;
  onUpdate: (id: string, t: NewTask) => void;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState<Task | null>(null);
  const [creating, setCreating] = useState(false);
  type SortKey = "date" | "lastAction" | "daysSince" | "company" | "description" | "type";
  const [sortState, setSortState] = useState<{ key: SortKey; dir: "asc" | "desc" } | null>(null);
  function toggleSort(key: SortKey) {
    setSortState((prev) => (prev && prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  }
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [minDaysSince, setMinDaysSince] = useState<string>("");
  const [colWidths, setColWidths] = useState<Record<string, number>>(loadColWidths);
  const resizingRef = useRef<{ id: string; startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    function onMove(e: MouseEvent) {
      const r = resizingRef.current;
      if (!r) return;
      const next = Math.max(MIN_COL_WIDTH, r.startWidth + (e.clientX - r.startX));
      setColWidths((prev) => ({ ...prev, [r.id]: next }));
    }
    function onUp() {
      if (!resizingRef.current) return;
      resizingRef.current = null;
      setColWidths((prev) => {
        try {
          window.localStorage.setItem(LINKED_COL_WIDTHS_STORAGE_KEY, JSON.stringify(prev));
        } catch {}
        return prev;
      });
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  function startResize(id: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    resizingRef.current = { id, startX: e.clientX, startWidth: colWidths[id] ?? DEFAULT_LINKED_COL_WIDTHS[id as keyof typeof DEFAULT_LINKED_COL_WIDTHS] ?? 150 };
  }

  const [openClientRow, setOpenClientRow] = useState<PipelineEntry | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [addingGroup, setAddingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [groupError, setGroupError] = useState<string | null>(null);
  const { groups, addGroup } = useTaskGroups();

  const { entries, saveEntry } = useClientPipeline();
  const fieldOptions = useMemo(() => loadFieldOptions(), []);
  const entryById = useMemo(() => new Map(entries.map((e) => [e.id, e])), [entries]);

  const generalTasks = useMemo(
    () => tasks.filter((t) => t.linkedClientId == null || !entryById.has(t.linkedClientId)),
    [tasks, entryById]
  );
  const prospectTasks = useMemo(
    () => tasks.filter((t) => t.linkedClientId != null && entryById.has(t.linkedClientId) && !isDoneEntry(entryById.get(t.linkedClientId)!)),
    [tasks, entryById]
  );
  const clientTasks = useMemo(
    () => tasks.filter((t) => t.linkedClientId != null && entryById.has(t.linkedClientId) && isDoneEntry(entryById.get(t.linkedClientId)!)),
    [tasks, entryById]
  );

  const activeTasks = subTab === "general" ? generalTasks : subTab === "prospects" ? prospectTasks : clientTasks;
  const isLinkedView = subTab !== "general";

  const filteredTasks = useMemo(() => {
    if (!isLinkedView) return activeTasks;
    return activeTasks.filter((t) => {
      if (typeFilter && t.taskType !== typeFilter) return false;
      if (minDaysSince !== "") {
        const ds = daysSince(t.lastActionDate);
        if (ds === null || ds < Number(minDaysSince)) return false;
      }
      return true;
    });
  }, [activeTasks, isLinkedView, typeFilter, minDaysSince]);

  const sortedTasks = useMemo(() => {
    if (!sortState) return filteredTasks;
    const { key, dir } = sortState;
    const sorted = [...filteredTasks].sort((a, b) => {
      if (key === "date") return a.startDate.localeCompare(b.startDate);
      if (key === "lastAction") return (a.lastActionDate ?? "").localeCompare(b.lastActionDate ?? "");
      if (key === "daysSince") {
        const da = daysSince(a.lastActionDate) ?? -Infinity;
        const db = daysSince(b.lastActionDate) ?? -Infinity;
        return da - db;
      }
      if (key === "company") {
        const ca = a.linkedClientId != null ? entryById.get(a.linkedClientId)?.company ?? "" : "";
        const cb = b.linkedClientId != null ? entryById.get(b.linkedClientId)?.company ?? "" : "";
        return ca.localeCompare(cb);
      }
      if (key === "type") return (a.taskType ?? "").localeCompare(b.taskType ?? "");
      return a.task.localeCompare(b.task);
    });
    return dir === "asc" ? sorted : sorted.reverse();
  }, [filteredTasks, sortState, entryById]);

  const allGroups = useMemo(() => {
    if (subTab !== "general") return [];
    const used = new Set(generalTasks.map((t) => t.taskGroup).filter(Boolean) as string[]);
    return Array.from(new Set([...groups, ...used]));
  }, [groups, generalTasks, subTab]);

  const sections = useMemo(() => {
    if (subTab !== "general") return [{ id: UNGROUPED, label: "", tasks: sortedTasks }];
    const byGroup = new Map<string, Task[]>();
    allGroups.forEach((g) => byGroup.set(g, []));
    byGroup.set(UNGROUPED, []);
    sortedTasks.forEach((t) => {
      const key = t.taskGroup && byGroup.has(t.taskGroup) ? t.taskGroup : UNGROUPED;
      byGroup.get(key)!.push(t);
    });
    return [...allGroups.map((g) => ({ id: g, label: g, tasks: byGroup.get(g)! })), { id: UNGROUPED, label: UNGROUPED_LABEL, tasks: byGroup.get(UNGROUPED)! }];
  }, [allGroups, sortedTasks, subTab]);

  const displayedSections = useMemo(
    () => (activeGroupId ? sections.filter((s) => s.id === activeGroupId) : sections),
    [sections, activeGroupId]
  );

  const showGroupHeaders = subTab === "general";

  function openAddTaskGroup() {
    setNewGroupName("");
    setGroupError(null);
    setAddingGroup(true);
  }

  function submitAddTaskGroup() {
    const name = newGroupName.trim();
    if (!name) {
      setGroupError("Enter a name.");
      return;
    }
    if (groups.includes(name)) {
      setGroupError("A group with that name already exists.");
      return;
    }
    addGroup(name)
      .then(() => setAddingGroup(false))
      .catch((err) => {
        console.error("Failed to add task group:", err);
        setGroupError("Couldn't create the task group. Please try again.");
      });
  }

  function toggleGroup(id: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const title = subTab === "general" ? "Operational Tasks" : subTab === "prospects" ? "Prospect Tasks" : "Client Tasks";
  const colCount = isLinkedView ? LINKED_COLS.length : 7;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
        <div className="flex items-center gap-2">
          {subTab === "general" && (
            <button
              onClick={openAddTaskGroup}
              className="px-4 py-2 text-sm font-medium text-accent bg-accent/10 hover:bg-accent/20 rounded-lg"
            >
              + Add Task Group
            </button>
          )}
          <button
            onClick={() => setCreating(true)}
            className="px-4 py-2 text-sm font-medium text-white bg-accent hover:bg-indigo-700 rounded-lg shadow-sm"
          >
            + Add task
          </button>
        </div>
      </div>

      {showGroupHeaders && (
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <button
            onClick={() => setActiveGroupId(null)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              activeGroupId === null
                ? "bg-accent text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            All
          </button>
          {sections.map((section) => (
            <button
              key={section.id}
              onClick={() => setActiveGroupId(section.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                activeGroupId === section.id
                  ? "bg-accent text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {section.label}
              <span
                className={`ml-1.5 text-[10px] font-semibold rounded-full px-1.5 ${
                  activeGroupId === section.id ? "bg-white/20" : "bg-gray-200 text-gray-500"
                }`}
              >
                {section.tasks.length}
              </span>
            </button>
          ))}
        </div>
      )}

      {isLinkedView && (
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <label className="flex items-center gap-2 text-xs font-medium text-gray-500">
            Type
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 outline-none focus:border-accent focus:ring-1 focus:ring-accent/30"
            >
              <option value="">All</option>
              {TASK_TYPES.map((tt) => (
                <option key={tt} value={tt}>
                  {tt}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-xs font-medium text-gray-500">
            Days since last action ≥
            <input
              type="number"
              min={0}
              value={minDaysSince}
              onChange={(e) => setMinDaysSince(e.target.value)}
              placeholder="0"
              className="w-16 rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 outline-none focus:border-accent focus:ring-1 focus:ring-accent/30"
            />
          </label>
          {(typeFilter || minDaysSince !== "") && (
            <button
              onClick={() => {
                setTypeFilter("");
                setMinDaysSince("");
              }}
              className="text-xs font-medium text-accent hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className={`w-full table-fixed text-sm ${isLinkedView ? "min-w-[1320px]" : "min-w-[900px]"}`}>
          {isLinkedView && (
            <colgroup>
              {LINKED_COLS.map((id) => (
                <col key={id} style={{ width: colWidths[id] ?? DEFAULT_LINKED_COL_WIDTHS[id] }} />
              ))}
            </colgroup>
          )}
          <thead>
            {isLinkedView ? (
              <tr className="border-b border-gray-200 bg-gray-50/70 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                <ResizableTh id="company" onResizeStart={startResize}>
                  <button onClick={() => toggleSort("company")} className="flex items-center gap-1 hover:text-gray-700">
                    Company
                    <span className="text-gray-400">
                      {sortState?.key === "company" ? (sortState.dir === "asc" ? "▲" : "▼") : "↕"}
                    </span>
                  </button>
                </ResizableTh>
                <ResizableTh id="description" onResizeStart={startResize}>
                  <button onClick={() => toggleSort("description")} className="flex items-center gap-1 hover:text-gray-700">
                    Description
                    <span className="text-gray-400">
                      {sortState?.key === "description" ? (sortState.dir === "asc" ? "▲" : "▼") : "↕"}
                    </span>
                  </button>
                </ResizableTh>
                <ResizableTh id="type" onResizeStart={startResize}>
                  <button onClick={() => toggleSort("type")} className="flex items-center gap-1 hover:text-gray-700">
                    Type
                    <span className="text-gray-400">
                      {sortState?.key === "type" ? (sortState.dir === "asc" ? "▲" : "▼") : "↕"}
                    </span>
                  </button>
                </ResizableTh>
                <ResizableTh id="date" onResizeStart={startResize}>
                  <button onClick={() => toggleSort("date")} className="flex items-center gap-1 hover:text-gray-700">
                    Target Date
                    <span className="text-gray-400">
                      {sortState?.key === "date" ? (sortState.dir === "asc" ? "▲" : "▼") : "↕"}
                    </span>
                  </button>
                </ResizableTh>
                <ResizableTh id="responsible" onResizeStart={startResize}>
                  Responsible
                </ResizableTh>
                <ResizableTh id="keyPoints" onResizeStart={startResize}>
                  Description
                </ResizableTh>
                <ResizableTh id="lastAction" onResizeStart={startResize}>
                  <button onClick={() => toggleSort("lastAction")} className="flex items-center gap-1 hover:text-gray-700">
                    Last Action Date
                    <span className="text-gray-400">
                      {sortState?.key === "lastAction" ? (sortState.dir === "asc" ? "▲" : "▼") : "↕"}
                    </span>
                  </button>
                </ResizableTh>
                <ResizableTh id="daysSince" onResizeStart={startResize}>
                  <button onClick={() => toggleSort("daysSince")} className="flex items-center gap-1 hover:text-gray-700">
                    Days Since Last Action
                    <span className="text-gray-400">
                      {sortState?.key === "daysSince" ? (sortState.dir === "asc" ? "▲" : "▼") : "↕"}
                    </span>
                  </button>
                </ResizableTh>
                <ResizableTh id="done" onResizeStart={startResize} className="text-center" last>
                  Done
                </ResizableTh>
              </tr>
            ) : (
              <tr className="border-b border-gray-200 bg-gray-50/70 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                <th className="px-4 py-3 w-[22%]">Task</th>
                <th className="px-4 py-3 w-[14%]">Type</th>
                <th className="px-4 py-3 w-[14%]">
                  <button
                    onClick={() => toggleSort("date")}
                    className="flex items-center gap-1 hover:text-gray-700"
                  >
                    Date
                    <span className="text-gray-400">
                      {sortState?.key === "date" ? (sortState.dir === "asc" ? "▲" : "▼") : "↕"}
                    </span>
                  </button>
                </th>
                <th className="px-4 py-3 w-[14%]">Responsible</th>
                <th className="px-4 py-3 w-[20%]">Informed</th>
                <th className="px-4 py-3 w-[20%]">Description</th>
                <th className="px-4 py-3 w-[8%] text-center">Done</th>
              </tr>
            )}
          </thead>
          <tbody>
            {displayedSections.map((section) => {
              if (showGroupHeaders && section.tasks.length === 0 && section.id === UNGROUPED && sections.length > 1) return null;
              const collapsed = showGroupHeaders && collapsedGroups.has(section.id);
              return (
                <Fragment key={section.id}>
                  {showGroupHeaders && (
                    <tr className="border-b border-gray-100 bg-gray-50/60">
                      <td colSpan={colCount} className="px-4 py-2">
                        <button
                          onClick={() => toggleGroup(section.id)}
                          className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500 hover:text-gray-700"
                        >
                          <span className={`text-[10px] transition-transform ${collapsed ? "" : "rotate-90"}`}>▸</span>
                          {section.label}
                          <span className="text-[11px] font-semibold rounded-full px-1.5 bg-gray-200 text-gray-500">
                            {section.tasks.length}
                          </span>
                        </button>
                      </td>
                    </tr>
                  )}
                  {!collapsed &&
                    section.tasks.map((t) => {
                      const linkedEntry = t.linkedClientId != null ? entryById.get(t.linkedClientId) : undefined;
                      return (
                        <tr
                          key={t.id}
                          onClick={() => setEditing(t)}
                          className={`border-b border-gray-100 last:border-0 hover:bg-indigo-50/40 cursor-pointer transition-colors align-top ${
                            t.completed ? "opacity-50" : ""
                          }`}
                        >
                          {isLinkedView && (
                            <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                              {linkedEntry ? (
                                <button
                                  onClick={() => setOpenClientRow(linkedEntry)}
                                  title={linkedEntry.company}
                                  className="inline-flex max-w-full items-center gap-1 rounded-full bg-accent/10 text-accent px-2.5 py-1 text-xs font-medium hover:bg-accent/20"
                                >
                                  <span className="shrink-0">🏢</span>
                                  <span className="truncate">{linkedEntry.company}</span>
                                </button>
                              ) : (
                                <span className="text-gray-300">—</span>
                              )}
                            </td>
                          )}
                          <td className={`px-4 py-3 text-gray-800 font-medium ${t.completed ? "line-through" : ""}`}>
                            {t.task}
                          </td>
                          <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                            <select
                              value={t.taskType ?? ""}
                              onChange={(e) => {
                                const { id, ...rest } = t;
                                onUpdate(id, { ...rest, taskType: (e.target.value || undefined) as Task["taskType"] });
                              }}
                              className="w-full rounded-md border border-transparent bg-transparent py-0.5 pl-0 pr-4 text-xs font-medium text-gray-600 outline-none hover:border-gray-200 focus:border-gray-300 focus:ring-1 focus:ring-accent/30 cursor-pointer"
                            >
                              <option value="">—</option>
                              {TASK_TYPES.map((tt) => (
                                <option key={tt} value={tt}>
                                  {tt}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{fmtRange(t.startDate, t.endDate)}</td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1">
                              {t.responsible.map((r) => (
                                <Chip key={r} name={r} />
                              ))}
                            </div>
                          </td>
                          {!isLinkedView && (
                            <td className="px-4 py-3">
                              <div className="flex flex-wrap gap-1">
                                {t.informed.length === 0 && <span className="text-gray-300">—</span>}
                                {t.informed.map((p, i) => (
                                  <Chip key={i} name={p.name} note={p.note} variant="outline" />
                                ))}
                              </div>
                            </td>
                          )}
                          <td className="px-4 py-3 text-gray-600">{t.keyPoints || <span className="text-gray-300">—</span>}</td>
                          {isLinkedView && (
                            <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{fmtDate(t.lastActionDate)}</td>
                          )}
                          {isLinkedView && (
                            <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                              {daysSince(t.lastActionDate) ?? <span className="text-gray-300">—</span>}
                            </td>
                          )}
                          <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-center gap-2.5">
                              <input
                                type="checkbox"
                                checked={!!t.completed}
                                onChange={() => {
                                  const { id, ...rest } = t;
                                  onUpdate(id, { ...rest, completed: !t.completed });
                                }}
                                className="rounded border-gray-300 text-accent focus:ring-accent/30 cursor-pointer"
                              />
                              <button
                                onClick={() => {
                                  if (confirm(`Delete "${t.task}"?`)) onDelete(t.id);
                                }}
                                title="Delete"
                                className="w-[22px] h-[22px] inline-flex items-center justify-center rounded-md text-gray-400 hover:bg-red-50 hover:text-red-700"
                              >
                                🗑
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                </Fragment>
              );
            })}
            {sortedTasks.length === 0 && (
              <tr>
                <td colSpan={colCount} className="px-4 py-10 text-center text-gray-400">
                  {subTab === "general" ? "No tasks yet. Add your first one." : `No ${subTab} follow-ups yet.`}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {addingGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-lg">
            <h2 className="text-base font-semibold text-gray-900 mb-3">New task group</h2>
            <input
              autoFocus
              type="text"
              value={newGroupName}
              onChange={(e) => {
                setNewGroupName(e.target.value);
                setGroupError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitAddTaskGroup();
                if (e.key === "Escape") setAddingGroup(false);
              }}
              placeholder="Group name"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent/30"
            />
            {groupError && <p className="mt-2 text-xs text-red-600">{groupError}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setAddingGroup(false)}
                className="px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={submitAddTaskGroup}
                className="px-3 py-1.5 text-sm font-medium text-white bg-accent hover:bg-indigo-700 rounded-lg"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {editing && (
        <TaskModal
          initial={editing}
          allNames={allNames}
          groups={subTab === "general" ? allGroups : undefined}
          linkedClientLabel={editing.linkedClientId != null ? entryById.get(editing.linkedClientId)?.company : undefined}
          onOpenClient={
            editing.linkedClientId != null && entryById.has(editing.linkedClientId)
              ? () => setOpenClientRow(entryById.get(editing.linkedClientId!)!)
              : undefined
          }
          onClose={() => setEditing(null)}
          onSave={(t) => {
            onUpdate(editing.id, t);
            setEditing(null);
          }}
          onDelete={() => {
            onDelete(editing.id);
            setEditing(null);
          }}
        />
      )}
      {creating && (
        <TaskModal
          allNames={allNames}
          groups={subTab === "general" ? allGroups : undefined}
          onClose={() => setCreating(false)}
          onSave={(t) => {
            onAdd(t);
            setCreating(false);
          }}
        />
      )}

      {openClientRow && (
        <ClientEntryModal
          kind={entryTableKey(openClientRow)}
          editing={openClientRow}
          prefill={null}
          fieldOptions={fieldOptions}
          onSave={async (patch) => {
            await saveEntry({ ...openClientRow, ...patch } as PipelineEntry);
            setOpenClientRow(null);
          }}
          onClose={() => setOpenClientRow(null)}
        />
      )}
    </div>
  );
}

function fmtRange(start: string, end: string) {
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  const fmt = (d: string) => (d ? new Date(d + "T00:00:00").toLocaleDateString("en-US", opts) : "");
  const s = fmt(start);
  const e = fmt(end);
  if (!s && !e) return "—";
  if (!s || !e || start === end) return s || e;
  return `${s} – ${e}`;
}

function fmtDate(d?: string) {
  if (!d) return "—";
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" };
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", opts);
}

function daysSince(d?: string) {
  if (!d) return null;
  const start = new Date(d + "T00:00:00").getTime();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((today.getTime() - start) / 86400000);
}
