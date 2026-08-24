"use client";

import { useMemo, useState } from "react";
import { Task } from "@/lib/types";
import { colorFor } from "@/lib/colors";
import { Chip } from "./Chip";
import { TaskModal } from "./TaskModal";

const DAY_WIDTH = 36;

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

  const { start, days } = useMemo(() => {
    if (tasks.length === 0) {
      const today = new Date();
      return { start: addDays(today, -2), days: 30 };
    }
    const starts = tasks.map((t) => toDate(t.startDate).getTime());
    const ends = tasks.map((t) => toDate(t.endDate).getTime());
    const minStart = addDays(new Date(Math.min(...starts)), -2);
    const maxEnd = addDays(new Date(Math.max(...ends)), 3);
    return { start: minStart, days: Math.max(diffDays(minStart, maxEnd), 7) };
  }, [tasks]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayOffset = diffDays(start, today);

  const dayList = Array.from({ length: days }, (_, i) => addDays(start, i));

  return (
    <div>
      <h1 className="text-xl font-semibold text-gray-900 mb-4">Gantt / Deadline</h1>
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
            {tasks.map((t) => {
              const offset = diffDays(start, toDate(t.startDate));
              const span = diffDays(toDate(t.startDate), toDate(t.endDate)) + 1;
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
                  </div>
                </div>
              );
            })}
            {tasks.length === 0 && (
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
