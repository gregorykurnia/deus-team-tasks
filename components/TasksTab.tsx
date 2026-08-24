"use client";

import { Fragment, useMemo, useState } from "react";
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

function isDoneEntry(r: PipelineEntry) {
  return r.status === "Client / Partner Done Deal";
}

function entryTableKey(r: PipelineEntry): "main" | "raw" | "hold" {
  if (r._raw) return "raw";
  if (r._hold) return "hold";
  return "main";
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
  const [dateSort, setDateSort] = useState<"asc" | "desc" | null>(null);
  const [openClientRow, setOpenClientRow] = useState<PipelineEntry | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
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

  const sortedTasks = useMemo(() => {
    if (!dateSort) return activeTasks;
    const sorted = [...activeTasks].sort((a, b) => a.startDate.localeCompare(b.startDate));
    return dateSort === "asc" ? sorted : sorted.reverse();
  }, [activeTasks, dateSort]);

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

  function addTaskGroup() {
    const name = prompt("Name this task group:")?.trim();
    if (!name || groups.includes(name)) return;
    addGroup(name);
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
  const colCount = isLinkedView ? 6 : 7;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
        <div className="flex items-center gap-2">
          {subTab === "general" && (
            <button
              onClick={addTaskGroup}
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

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50/70 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              {isLinkedView && <th className="px-4 py-3 w-[18%]">Company</th>}
              <th className={`px-4 py-3 ${isLinkedView ? "w-[20%]" : "w-[22%]"}`}>{isLinkedView ? "Description" : "Task"}</th>
              <th className="px-4 py-3 w-[12%]">Type</th>
              <th className="px-4 py-3 w-[14%]">
                <button
                  onClick={() => setDateSort((s) => (s === "asc" ? "desc" : "asc"))}
                  className="flex items-center gap-1 hover:text-gray-700"
                >
                  {isLinkedView ? "Target Date" : "Date"}
                  <span className="text-gray-400">
                    {dateSort === "asc" ? "▲" : dateSort === "desc" ? "▼" : "↕"}
                  </span>
                </button>
              </th>
              <th className="px-4 py-3 w-[14%]">Responsible</th>
              {!isLinkedView && <th className="px-4 py-3 w-[20%]">Informed</th>}
              <th className="px-4 py-3 w-[20%]">Description</th>
              <th className="px-4 py-3 w-[8%] text-center">Done</th>
            </tr>
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
                                  className="inline-flex items-center gap-1 rounded-full bg-accent/10 text-accent px-2.5 py-1 text-xs font-medium hover:bg-accent/20"
                                >
                                  🏢 {linkedEntry.company}
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
                              className="w-full rounded-md border border-transparent bg-transparent py-0.5 pl-0 pr-1 text-xs font-medium text-gray-600 outline-none hover:border-gray-200 focus:border-gray-300 focus:ring-1 focus:ring-accent/30 cursor-pointer"
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
