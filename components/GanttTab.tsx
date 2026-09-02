"use client";

import { useMemo, useState } from "react";
import { Task } from "@/lib/types";
import { colorFor } from "@/lib/colors";
import { useTaskGroups } from "@/lib/useTaskGroups";
import { useClientPipeline } from "@/lib/useClientPipeline";
import { PipelineEntry } from "@/lib/clientTypes";
import { Chip } from "./Chip";
import { TaskModal } from "./TaskModal";

const DAY_WIDTH = 36;
const UNGROUPED = "__ungrouped__";
const UNGROUPED_LABEL = "Ungrouped";
const PROSPECTS = "__prospects__";
const PROSPECTS_LABEL = "Prospect Tasks";
const CLIENTS = "__clients__";
const CLIENTS_LABEL = "Client Tasks";

function isDoneEntry(r: PipelineEntry) {
  return r.status === "Client / Partner Done Deal";
}

function toDate(s: string) {
  return new Date(s + "T00:00:00");
}
function diffDays(a: Date, b: Date) {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}
function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function effectiveRange(t: Task): { s: Date; e: Date } | null {
  const sValid = t.startDate && !isNaN(toDate(t.startDate).getTime());
  const eValid = t.endDate && !isNaN(toDate(t.endDate).getTime());
  if (sValid && eValid) return { s: toDate(t.startDate), e: toDate(t.endDate) };
  if (eValid) return { s: toDate(t.endDate), e: toDate(t.endDate) };
  if (sValid) return { s: toDate(t.startDate), e: toDate(t.startDate) };
  return null;
}

export function GanttTab({
  tasks,
  allNames,
  onUpdate,
  onDelete,
}: {
  tasks: Task[];
  allNames: string[];
  onUpdate: (id: string, t: Task) => void;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState<Task | null>(null);
  const { groups } = useTaskGroups();
  const { entries } = useClientPipeline();
  const entryById = useMemo(() => new Map(entries.map((e) => [e.id, e])), [entries]);
  const [groupFilter, setGroupFilter] = useState<string>("");

  const usedGroups = useMemo(() => {
    const used = new Set(
      tasks.filter((t) => t.linkedClientId == null).map((t) => t.taskGroup).filter(Boolean) as string[]
    );
    return Array.from(new Set([...groups, ...used]));
  }, [groups, tasks]);

  function isProspectTask(t: Task) {
    return t.linkedClientId != null && entryById.has(t.linkedClientId) && !isDoneEntry(entryById.get(t.linkedClientId)!);
  }
  function isClientTask(t: Task) {
    return t.linkedClientId != null && entryById.has(t.linkedClientId) && isDoneEntry(entryById.get(t.linkedClientId)!);
  }

  const filteredTasks = useMemo(() => {
    if (!groupFilter) return tasks;
    if (groupFilter === PROSPECTS) return tasks.filter(isProspectTask);
    if (groupFilter === CLIENTS) return tasks.filter(isClientTask);
    if (groupFilter === UNGROUPED)
      return tasks.filter((t) => t.linkedClientId == null && (!t.taskGroup || !usedGroups.includes(t.taskGroup)));
    return tasks.filter((t) => t.linkedClientId == null && t.taskGroup === groupFilter);
  }, [tasks, groupFilter, usedGroups, entryById]);

  const { start, days } = useMemo(() => {
    const ranges = filteredTasks.map(effectiveRange).filter((r): r is { s: Date; e: Date } => r !== null);
    if (ranges.length === 0) {
      const today = new Date();
      return { start: addDays(today, -2), days: 30 };
    }
    const starts = ranges.map((r) => r.s.getTime());
    const ends = ranges.map((r) => r.e.getTime());
    const minStart = addDays(new Date(Math.min(...starts)), -2);
    const maxEnd = addDays(new Date(Math.max(...ends)), 3);
    return { start: minStart, days: Math.max(diffDays(minStart, maxEnd), 7) };
  }, [filteredTasks]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayOffset = diffDays(start, today);

  const dayList = Array.from({ length: days }, (_, i) => addDays(start, i));

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold text-gray-900">Gantt / Deadline</h1>
        <label className="flex items-center gap-2 text-xs font-medium text-gray-500">
          Task group
          <select
            value={groupFilter}
            onChange={(e) => setGroupFilter(e.target.value)}
            className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 outline-none focus:border-accent focus:ring-1 focus:ring-accent/30"
          >
            <option value="">All</option>
            {usedGroups.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
            <option value={UNGROUPED}>{UNGROUPED_LABEL}</option>
            <option value={PROSPECTS}>{PROSPECTS_LABEL}</option>
            <option value={CLIENTS}>{CLIENTS_LABEL}</option>
          </select>
        </label>
      </div>
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <div style={{ width: 260 + days * DAY_WIDTH, minWidth: "100%" }}>
            {/* Header */}
            <div className="flex sticky top-0 z-10 bg-white border-b border-gray-200">
              <div className="sticky left-0 z-20 w-[260px] shrink-0 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500 border-r border-gray-200 bg-white">
                Task
              </div>
              <div className="relative flex">
                {dayList.map((d, i) => {
                  const isToday = i === todayOffset;
                  const isMonthStart = d.getDate() === 1 || i === 0;
                  return (
                    <div
                      key={i}
                      style={{ width: DAY_WIDTH }}
                      className={`shrink-0 text-center py-2 border-r border-gray-100 ${
                        isToday ? "bg-indigo-50" : ""
                      }`}
                    >
                      <div className="text-[10px] text-gray-400">
                        {isMonthStart ? d.toLocaleDateString("en-US", { month: "short" }) : ""}
                      </div>
                      <div className={`text-xs font-medium ${isToday ? "text-accent" : "text-gray-600"}`}>
                        {d.getDate()}
                      </div>
                      <div className="text-[10px] text-gray-300">
                        {d.toLocaleDateString("en-US", { weekday: "narrow" })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Rows */}
            {filteredTasks.map((t) => {
              const range = effectiveRange(t);
              const offset = range ? diffDays(start, range.s) : 0;
              const span = range ? diffDays(range.s, range.e) + 1 : 0;
              const c = colorFor(t.responsible[0] ?? "?");
              return (
                <div
                  key={t.id}
                  className={`flex border-b border-gray-100 last:border-0 group ${t.completed ? "opacity-50" : ""}`}
                >
                  <div className="sticky left-0 z-10 w-[260px] shrink-0 px-4 py-3 border-r border-gray-200 bg-white group-hover:bg-gray-50/60">
                    <div className={`text-sm text-gray-800 font-medium line-clamp-2 ${t.completed ? "line-through" : ""}`}>
                      {t.task}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {t.responsible.map((r) => (
                        <Chip key={r} name={r} />
                      ))}
                    </div>
                  </div>
                  <div className="relative group-hover:bg-gray-50/60" style={{ width: days * DAY_WIDTH, height: 56 }}>
                    {todayOffset >= 0 && todayOffset < days && (
                      <div
                        className="absolute top-0 bottom-0 w-px bg-red-300"
                        style={{ left: todayOffset * DAY_WIDTH + DAY_WIDTH / 2 }}
                      />
                    )}
                    {range ? (
                      <button
                        onClick={() => setEditing(t)}
                        style={{
                          left: offset * DAY_WIDTH + 3,
                          width: Math.max(span * DAY_WIDTH - 6, 10),
                          background: c.solid,
                          top: 14,
                        }}
                        className="absolute h-7 rounded-md shadow-sm hover:brightness-110 transition"
                        title={t.task}
                      />
                    ) : (
                      <button
                        onClick={() => setEditing(t)}
                        style={{ left: 3, top: 14 }}
                        className="absolute h-7 px-2 rounded-md border border-dashed border-gray-300 text-[11px] text-gray-400 flex items-center hover:bg-gray-50"
                        title={t.task}
                      >
                        No dates
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            {filteredTasks.length === 0 && (
              <div className="px-4 py-10 text-center text-gray-400">No tasks to display.</div>
            )}
          </div>
        </div>
      </div>

      {editing && (
        <TaskModal
          initial={editing}
          allNames={allNames}
          onClose={() => setEditing(null)}
          onSave={(t) => {
            onUpdate(editing.id, { ...editing, ...t });
            setEditing(null);
          }}
          onDelete={() => {
            onDelete(editing.id);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}
