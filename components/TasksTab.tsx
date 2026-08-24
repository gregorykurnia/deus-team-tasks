"use client";

import { useMemo, useState } from "react";
import { Task, NewTask } from "@/lib/types";
import { useClientPipeline } from "@/lib/useClientPipeline";
import { loadFieldOptions } from "@/lib/clientLocalConfig";
import { PipelineEntry, TableKey } from "@/lib/clientTypes";
import { Chip } from "./Chip";
import { TaskModal } from "./TaskModal";
import { ClientEntryModal } from "./clients/ClientEntryModal";

type SubTab = "general" | "prospects" | "clients";

const SUBTABS: { id: SubTab; label: string; icon: string }[] = [
  { id: "general", label: "General", icon: "🗂" },
  { id: "prospects", label: "Prospects", icon: "📈" },
  { id: "clients", label: "Clients", icon: "🤝" },
];

function isDoneEntry(r: PipelineEntry) {
  return r.status === "Client / Partner Done Deal";
}

function entryTableKey(r: PipelineEntry): TableKey {
  if (r._raw) return "raw";
  if (r._hold) return "hold";
  return "main";
}

export function TasksTab({
  tasks,
  allNames,
  onAdd,
  onUpdate,
  onDelete,
}: {
  tasks: Task[];
  allNames: string[];
  onAdd: (t: NewTask) => void;
  onUpdate: (id: string, t: NewTask) => void;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState<Task | null>(null);
  const [creating, setCreating] = useState(false);
  const [dateSort, setDateSort] = useState<"asc" | "desc" | null>(null);
  const [subTab, setSubTab] = useState<SubTab>("general");
  const [openClientRow, setOpenClientRow] = useState<PipelineEntry | null>(null);

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

  const sortedTasks = useMemo(() => {
    if (!dateSort) return activeTasks;
    const sorted = [...activeTasks].sort((a, b) => a.startDate.localeCompare(b.startDate));
    return dateSort === "asc" ? sorted : sorted.reverse();
  }, [activeTasks, dateSort]);

  const isLinkedView = subTab !== "general";

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold text-gray-900">Tasks</h1>
        <button
          onClick={() => setCreating(true)}
          className="px-4 py-2 text-sm font-medium text-white bg-accent hover:bg-indigo-700 rounded-lg shadow-sm"
        >
          + Add task
        </button>
      </div>

      <div className="flex border-b border-gray-200 mb-4">
        {SUBTABS.map((t) => {
          const count = t.id === "general" ? generalTasks.length : t.id === "prospects" ? prospectTasks.length : clientTasks.length;
          const active = subTab === t.id;
          return (
            <div
              key={t.id}
              onClick={() => setSubTab(t.id)}
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
              {!isLinkedView && <th className="px-4 py-3 w-[20%]">Key Points</th>}
              <th className="px-4 py-3 w-[8%] text-center">Done</th>
            </tr>
          </thead>
          <tbody>
            {sortedTasks.map((t) => {
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
                  <td className="px-4 py-3">
                    {t.taskType ? (
                      <span className="inline-flex items-center rounded-full bg-gray-100 text-gray-600 px-2 py-0.5 text-xs font-medium whitespace-nowrap">
                        {t.taskType}
                      </span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
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
                  {!isLinkedView && <td className="px-4 py-3 text-gray-600">{t.keyPoints || <span className="text-gray-300">—</span>}</td>}
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
            {sortedTasks.length === 0 && (
              <tr>
                <td colSpan={isLinkedView ? 6 : 7} className="px-4 py-10 text-center text-gray-400">
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
  const s = new Date(start + "T00:00:00").toLocaleDateString("en-US", opts);
  const e = new Date(end + "T00:00:00").toLocaleDateString("en-US", opts);
  return start === end ? s : `${s} – ${e}`;
}
