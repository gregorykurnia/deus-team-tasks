"use client";

import { useMemo, useState } from "react";
import { Task } from "@/lib/types";
import { Chip } from "./Chip";
import { TaskModal } from "./TaskModal";

function toDate(s: string) {
  return new Date(s + "T00:00:00");
}
function fmtISO(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function DailyTab({
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
  const defaultDate = useMemo(() => {
    const today = fmtISO(new Date());
    const active = tasks.find((t) =>
      t.startDate ? t.startDate <= today && (!t.endDate || today <= t.endDate) : t.endDate === today
    );
    if (active) return today;
    const upcoming = [...tasks]
      .filter((t) => t.startDate)
      .sort((a, b) => a.startDate.localeCompare(b.startDate))
      .find((t) => t.startDate >= today);
    return upcoming?.startDate ?? today;
  }, [tasks]);

  const [selected, setSelected] = useState(defaultDate);
  const [editing, setEditing] = useState<Task | null>(null);

  const dayTasks = tasks
    .filter((t) => (t.startDate ? t.startDate <= selected && (!t.endDate || selected <= t.endDate) : t.endDate === selected))
    .sort((a, b) => a.responsible[0]?.localeCompare(b.responsible[0] ?? "") ?? 0);

  const selDate = toDate(selected);
  const isToday = selected === fmtISO(new Date());

  function shift(n: number) {
    const d = toDate(selected);
    d.setDate(d.getDate() + n);
    setSelected(fmtISO(d));
  }

  return (
    <div>
      <h1 className="text-xl font-semibold text-gray-900 mb-4">Daily View</h1>

      <div className="flex items-center gap-3 mb-5">
        <button
          onClick={() => shift(-1)}
          className="w-9 h-9 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 flex items-center justify-center text-gray-500"
        >
          ‹
        </button>
        <input
          type="date"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/30"
        />
        <button
          onClick={() => shift(1)}
          className="w-9 h-9 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 flex items-center justify-center text-gray-500"
        >
          ›
        </button>
        <button
          onClick={() => setSelected(fmtISO(new Date()))}
          className="ml-1 px-3 py-2 text-sm font-medium text-accent hover:bg-indigo-50 rounded-lg"
        >
          Today
        </button>
        <div className="ml-auto text-sm text-gray-500">
          {selDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
          {isToday && <span className="ml-2 text-accent font-medium">· Today</span>}
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm divide-y divide-gray-100 min-h-[200px]">
        {dayTasks.length === 0 && (
          <div className="px-6 py-12 text-center text-gray-400">Nothing scheduled on this day.</div>
        )}
        {dayTasks.map((t) => (
          <div
            key={t.id}
            onClick={() => setEditing(t)}
            className={`px-5 py-4 flex items-start gap-4 hover:bg-indigo-50/40 cursor-pointer transition-colors ${
              t.completed ? "opacity-50" : ""
            }`}
          >
            <div className="w-16 shrink-0 pt-0.5 text-xs text-gray-400 font-medium">
              {t.completed
                ? "Done"
                : t.startDate === t.endDate
                ? "Single day"
                : t.startDate === selected
                ? "Starts"
                : t.endDate === selected
                ? "Ends"
                : "Ongoing"}
            </div>
            <div className="flex-1 min-w-0">
              <div className={`text-sm font-medium text-gray-800 ${t.completed ? "line-through" : ""}`}>{t.task}</div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {t.responsible.map((r) => (
                  <Chip key={r} name={r} />
                ))}
                {t.informed.map((p, i) => (
                  <Chip key={`i${i}`} name={p.name} note={p.note} variant="outline" />
                ))}
              </div>
              {t.keyPoints && <div className="mt-2 text-xs text-gray-500">{t.keyPoints}</div>}
            </div>
          </div>
        ))}
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
