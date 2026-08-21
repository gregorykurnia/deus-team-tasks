"use client";

import { useMemo, useState } from "react";
import { Task } from "@/lib/types";
import { Chip } from "./Chip";
import { TaskModal } from "./TaskModal";

export function AssigneeTab({
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
  const [person, setPerson] = useState(allNames[0] ?? "");
  const [editing, setEditing] = useState<Task | null>(null);

  const responsibleTasks = useMemo(
    () => tasks.filter((t) => t.responsible.includes(person)),
    [tasks, person]
  );
  const informedTasks = useMemo(
    () => tasks.filter((t) => t.informed.some((p) => p.name === person)),
    [tasks, person]
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold text-gray-900">Assignee View</h1>
        <select
          value={person}
          onChange={(e) => setPerson(e.target.value)}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium outline-none focus:ring-2 focus:ring-accent/30"
        >
          {allNames.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>

      {!person && <div className="text-gray-400">No names yet — add a task first.</div>}

      {person && (
        <div className="grid gap-6 md:grid-cols-2">
          <Section
            title="Responsible"
            hint="Owns and drives the task"
            color="bg-indigo-50 text-indigo-700"
            tasks={responsibleTasks}
            onClick={setEditing}
          />
          <Section
            title="Informed"
            hint="Kept in the loop"
            color="bg-gray-100 text-gray-600"
            tasks={informedTasks}
            onClick={setEditing}
            note={(t) => t.informed.find((p) => p.name === person)?.note}
          />
        </div>
      )}

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

function Section({
  title,
  hint,
  color,
  tasks,
  onClick,
  note,
}: {
  title: string;
  hint: string;
  color: string;
  tasks: Task[];
  onClick: (t: Task) => void;
  note?: (t: Task) => string | undefined;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
        <span className={`text-xs font-semibold uppercase tracking-wide px-2 py-1 rounded-full ${color}`}>
          {title}
        </span>
        <span className="text-xs text-gray-400">{hint}</span>
        <span className="ml-auto text-xs text-gray-400">{tasks.length}</span>
      </div>
      <div className="divide-y divide-gray-100">
        {tasks.length === 0 && <div className="px-5 py-8 text-center text-gray-400 text-sm">No tasks.</div>}
        {tasks.map((t) => (
          <div
            key={t.id}
            onClick={() => onClick(t)}
            className="px-5 py-3 hover:bg-indigo-50/40 cursor-pointer transition-colors"
          >
            <div className="text-sm font-medium text-gray-800">{t.task}</div>
            <div className="mt-1 flex items-center gap-2 text-xs text-gray-400">
              <span>{fmtRange(t.startDate, t.endDate)}</span>
              {note?.(t) && <span className="text-gray-500">· {note(t)}</span>}
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
  );
}

function fmtRange(start: string, end: string) {
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  const s = new Date(start + "T00:00:00").toLocaleDateString("en-US", opts);
  const e = new Date(end + "T00:00:00").toLocaleDateString("en-US", opts);
  return start === end ? s : `${s} – ${e}`;
}
