"use client";

import { useMemo, useState } from "react";
import { Task } from "@/lib/types";
import { Chip } from "./Chip";
import { TaskModal } from "./TaskModal";

function fmtISO(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function CalendarTab({
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
  const today = fmtISO(new Date());
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [editing, setEditing] = useState<Task | null>(null);

  const tasksByDate = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of tasks) {
      if (!t.startDate && !t.endDate) continue;
      const start = t.startDate || t.endDate;
      const end = t.endDate || t.startDate;
      const d = new Date(start + "T00:00:00");
      const last = new Date(end + "T00:00:00");
      let guard = 0;
      while (d <= last && guard < 400) {
        const key = fmtISO(d);
        const arr = map.get(key) ?? [];
        arr.push(t);
        map.set(key, arr);
        d.setDate(d.getDate() + 1);
        guard++;
      }
    }
    return map;
  }, [tasks]);

  const grid = useMemo(() => {
    const first = new Date(cursor.year, cursor.month, 1);
    const startOffset = first.getDay();
    const gridStart = new Date(cursor.year, cursor.month, 1 - startOffset);
    const days: { date: Date; inMonth: boolean }[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      days.push({ date: d, inMonth: d.getMonth() === cursor.month });
    }
    return days;
  }, [cursor]);

  function shiftMonth(n: number) {
    const d = new Date(cursor.year, cursor.month + n, 1);
    setCursor({ year: d.getFullYear(), month: d.getMonth() });
  }

  function goToday() {
    const d = new Date();
    setCursor({ year: d.getFullYear(), month: d.getMonth() });
    setSelectedDay(today);
  }

  const monthLabel = new Date(cursor.year, cursor.month, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  const selectedTasks = selectedDay ? tasksByDate.get(selectedDay) ?? [] : [];

  return (
    <div>
      <div className="flex items-center gap-3 mb-1">
        <h1 className="text-xl font-semibold text-gray-900">Calendar</h1>
        <span className="text-xs text-gray-400 rounded-full border border-gray-200 px-2 py-0.5">
          Google Calendar sync coming soon
        </span>
      </div>
      <p className="text-sm text-gray-400 mb-4">
        Showing task dates for now — will link 1:1 with Google Calendar events.
      </p>

      <div className="flex items-center gap-3 mb-5">
        <button
          onClick={() => shiftMonth(-1)}
          className="w-9 h-9 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 flex items-center justify-center text-gray-500"
        >
          ‹
        </button>
        <div className="text-sm font-medium text-gray-800 w-40">{monthLabel}</div>
        <button
          onClick={() => shiftMonth(1)}
          className="w-9 h-9 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 flex items-center justify-center text-gray-500"
        >
          ›
        </button>
        <button
          onClick={goToday}
          className="ml-1 px-3 py-2 text-sm font-medium text-accent hover:bg-indigo-50 rounded-lg"
        >
          Today
        </button>
      </div>

      <div className="flex gap-5">
        <div className="flex-1 rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="grid grid-cols-7 border-b border-gray-100">
            {WEEKDAYS.map((w) => (
              <div key={w} className="px-2 py-2 text-center text-xs font-medium text-gray-400">
                {w}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {grid.map(({ date, inMonth }) => {
              const key = fmtISO(date);
              const dayTasks = tasksByDate.get(key) ?? [];
              const isToday = key === today;
              const isSelected = key === selectedDay;
              return (
                <button
                  key={key}
                  onClick={() => setSelectedDay(key)}
                  className={`text-left border-b border-r border-gray-100 min-h-[92px] p-1.5 align-top transition-colors ${
                    inMonth ? "bg-white" : "bg-gray-50/60"
                  } ${isSelected ? "ring-2 ring-inset ring-accent/40" : "hover:bg-indigo-50/30"}`}
                >
                  <div
                    className={`text-xs font-medium mb-1 w-5 h-5 flex items-center justify-center rounded-full ${
                      isToday ? "bg-accent text-white" : inMonth ? "text-gray-600" : "text-gray-300"
                    }`}
                  >
                    {date.getDate()}
                  </div>
                  <div className="space-y-0.5">
                    {dayTasks.slice(0, 3).map((t) => (
                      <div
                        key={t.id}
                        className={`text-[10px] leading-tight truncate rounded px-1 py-0.5 ${
                          t.completed ? "bg-gray-100 text-gray-400 line-through" : "bg-accent/10 text-accent"
                        }`}
                      >
                        {t.task}
                      </div>
                    ))}
                    {dayTasks.length > 3 && (
                      <div className="text-[10px] text-gray-400 px-1">+{dayTasks.length - 3} more</div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="w-72 shrink-0 rounded-xl border border-gray-200 bg-white shadow-sm p-4 h-fit sticky top-20">
          <div className="text-sm font-medium text-gray-800 mb-3">
            {selectedDay
              ? new Date(selectedDay + "T00:00:00").toLocaleDateString("en-US", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })
              : "Select a day"}
          </div>
          {selectedDay && selectedTasks.length === 0 && (
            <div className="text-xs text-gray-400">Nothing scheduled.</div>
          )}
          <div className="space-y-2">
            {selectedTasks.map((t) => (
              <div
                key={t.id}
                onClick={() => setEditing(t)}
                className={`rounded-lg border border-gray-100 p-2.5 cursor-pointer hover:bg-indigo-50/40 transition-colors ${
                  t.completed ? "opacity-50" : ""
                }`}
              >
                <div className={`text-xs font-medium text-gray-800 ${t.completed ? "line-through" : ""}`}>
                  {t.task}
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {t.responsible.map((r) => (
                    <Chip key={r} name={r} />
                  ))}
                </div>
              </div>
            ))}
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
