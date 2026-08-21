"use client";

const TABS = [
  { id: "tasks", label: "Tasks" },
  { id: "gantt", label: "Gantt / Deadline" },
  { id: "daily", label: "Daily View" },
  { id: "assignee", label: "Assignee View" },
  { id: "flow", label: "Flow" },
] as const;

export type TabId = (typeof TABS)[number]["id"];

export function Tabs({ active, onChange }: { active: TabId; onChange: (id: TabId) => void }) {
  return (
    <div className="flex gap-1 border-b border-gray-200">
      {TABS.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors ${
            active === t.id
              ? "text-accent border-b-2 border-accent -mb-px"
              : "text-gray-500 hover:text-gray-800"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
