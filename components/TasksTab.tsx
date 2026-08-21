"use client";

import { useState } from "react";
import { Task, NewTask } from "@/lib/types";
import { Chip } from "./Chip";
import { TaskModal } from "./TaskModal";

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

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50/70 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              <th className="px-4 py-3 w-[32%]">Task</th>
              <th className="px-4 py-3 w-[16%]">Responsible</th>
              <th className="px-4 py-3 w-[22%]">Informed</th>
              <th className="px-4 py-3 w-[30%]">Key Points</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((t) => (
              <tr
                key={t.id}
                onClick={() => setEditing(t)}
                className="border-b border-gray-100 last:border-0 hover:bg-indigo-50/40 cursor-pointer transition-colors align-top"
              >
                <td className="px-4 py-3 text-gray-800 font-medium">
                  {t.task}
                  <div className="mt-1 text-xs font-normal text-gray-400">
                    {fmtRange(t.startDate, t.endDate)}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {t.responsible.map((r) => (
                      <Chip key={r} name={r} />
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {t.informed.length === 0 && <span className="text-gray-300">—</span>}
                    {t.informed.map((p, i) => (
                      <Chip key={i} name={p.name} note={p.note} variant="outline" />
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-600">{t.keyPoints || <span className="text-gray-300">—</span>}</td>
              </tr>
            ))}
            {tasks.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-gray-400">
                  No tasks yet. Add your first one.
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
    </div>
  );
}

function fmtRange(start: string, end: string) {
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  const s = new Date(start + "T00:00:00").toLocaleDateString("en-US", opts);
  const e = new Date(end + "T00:00:00").toLocaleDateString("en-US", opts);
  return start === end ? s : `${s} – ${e}`;
}
