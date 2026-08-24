"use client";

import { useState } from "react";
import { NewTask, Task } from "@/lib/types";
import { PeopleInput } from "./PeopleInput";

export function TaskModal({
  initial,
  prefill,
  allNames,
  linkedClientLabel,
  onOpenClient,
  onSave,
  onDelete,
  onClose,
}: {
  initial?: Task;
  prefill?: Partial<NewTask>;
  allNames: string[];
  linkedClientLabel?: string;
  onOpenClient?: () => void;
  onSave: (task: NewTask) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const [task, setTask] = useState(initial?.task ?? prefill?.task ?? "");
  const [responsible, setResponsible] = useState<{ name: string; note?: string }[]>(
    (initial?.responsible ?? prefill?.responsible ?? []).map((n) => ({ name: n }))
  );
  const [informed, setInformed] = useState<{ name: string; note?: string }[]>(
    initial?.informed ?? prefill?.informed ?? []
  );
  const [keyPoints, setKeyPoints] = useState(initial?.keyPoints ?? prefill?.keyPoints ?? "");
  const [startDate, setStartDate] = useState(initial?.startDate ?? prefill?.startDate ?? "");
  const [endDate, setEndDate] = useState(initial?.endDate ?? prefill?.endDate ?? "");
  const [completed, setCompleted] = useState(initial?.completed ?? false);
  const linkedClientId = initial?.linkedClientId ?? prefill?.linkedClientId;

  function handleSave() {
    if (!task.trim()) {
      alert("Task description is required.");
      return;
    }
    onSave({
      task: task.trim(),
      responsible: responsible.map((r) => r.name),
      informed,
      keyPoints: keyPoints.trim(),
      startDate,
      endDate,
      order: initial?.order ?? Date.now(),
      completed,
      linkedClientId,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-semibold text-gray-900">
            {initial ? "Edit Task" : "New Task"}
          </h2>
          {initial && (
            <label className="flex items-center gap-2 text-sm font-medium text-gray-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={completed}
                onChange={(e) => setCompleted(e.target.checked)}
                className="rounded border-gray-300 text-accent focus:ring-accent/30"
              />
              Completed
            </label>
          )}
        </div>

        {linkedClientId != null && (
          <button
            onClick={onOpenClient}
            className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-accent/10 text-accent px-2.5 py-1 text-xs font-medium hover:bg-accent/20"
          >
            🏢 {linkedClientLabel ?? "Linked client"}
          </button>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Task <span className="text-accent">*</span>
            </label>
            <textarea
              value={task}
              onChange={(e) => setTask(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-gray-200 p-2 text-sm outline-none focus:ring-2 focus:ring-accent/30"
              placeholder="Describe the task…"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Start date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-lg border border-gray-200 p-2 text-sm outline-none focus:ring-2 focus:ring-accent/30"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                End date
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full rounded-lg border border-gray-200 p-2 text-sm outline-none focus:ring-2 focus:ring-accent/30"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Responsible <span className="text-gray-400 font-normal">(owns the task)</span>
            </label>
            <PeopleInput values={responsible} onChange={setResponsible} suggestions={allNames} placeholder="Add name…" />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Informed <span className="text-gray-400 font-normal">(kept in the loop — optionally "Name (role)")</span>
            </label>
            <PeopleInput values={informed} onChange={setInformed} suggestions={allNames} placeholder="Add name…" />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Key points</label>
            <textarea
              value={keyPoints}
              onChange={(e) => setKeyPoints(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-gray-200 p-2 text-sm outline-none focus:ring-2 focus:ring-accent/30"
              placeholder="Notes, expectations, caveats…"
            />
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between">
          <div>
            {onDelete && (
              <button
                onClick={onDelete}
                className="text-sm text-red-600 hover:text-red-700 font-medium"
              >
                Delete task
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 text-sm font-medium text-white bg-accent hover:bg-indigo-700 rounded-lg"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
