"use client";

import { useMemo, useState } from "react";
import { useTasks } from "@/lib/useTasks";
import { KNOWN_NAMES } from "@/lib/types";
import { Sidebar, TabId } from "./Sidebar";
import { TasksTab } from "./TasksTab";
import { GanttTab } from "./GanttTab";
import { DailyTab } from "./DailyTab";
import { AssigneeTab } from "./AssigneeTab";
import { FlowTab } from "./FlowTab";
import { ClientsTab } from "./ClientsTab";

export default function App() {
  const { tasks, loading, addTask, updateTask, deleteTask } = useTasks();
  const [tab, setTab] = useState<TabId>("tasks");
  const [showCompleted, setShowCompleted] = useState(false);

  const completedCount = useMemo(() => tasks.filter((t) => t.completed).length, [tasks]);
  const visibleTasks = useMemo(
    () => (showCompleted ? tasks : tasks.filter((t) => !t.completed)),
    [tasks, showCompleted]
  );

  const allNames = useMemo(() => {
    const set = new Set<string>(KNOWN_NAMES);
    tasks.forEach((t) => {
      t.responsible.forEach((r) => set.add(r));
      t.informed.forEach((p) => set.add(p.name));
    });
    set.delete("Full Team");
    return Array.from(set).sort();
  }, [tasks]);

  return (
    <div className="flex-1 flex">
      <Sidebar active={tab} onChange={setTab} />

      <div className="flex-1 flex flex-col min-w-0">
        <header className="border-b border-gray-200 bg-white/80 backdrop-blur sticky top-0 z-20">
          <div className="px-6 h-14 flex items-center gap-2">
            <span className="text-xs text-gray-400">Handover & rollout plan</span>
            {completedCount > 0 && (
              <button
                onClick={() => setShowCompleted((v) => !v)}
                className={`ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  showCompleted
                    ? "bg-accent/10 border-accent/30 text-accent"
                    : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50"
                }`}
              >
                {showCompleted ? "Hide" : "Show"} completed
                <span className="text-gray-400">({completedCount})</span>
              </button>
            )}
          </div>
        </header>

        <main className="flex-1 w-full px-6 py-6">
          {loading ? (
            <div className="text-gray-400 text-sm py-20 text-center">Loading tasks…</div>
          ) : (
            <>
              {tab === "tasks" && (
                <TasksTab
                  tasks={visibleTasks}
                  allNames={allNames}
                  onAdd={addTask}
                  onUpdate={(id, t) => updateTask(id, t)}
                  onDelete={deleteTask}
                />
              )}
              {tab === "gantt" && (
                <GanttTab tasks={visibleTasks} allNames={allNames} onUpdate={(id, t) => updateTask(id, t)} onDelete={deleteTask} />
              )}
              {tab === "daily" && (
                <DailyTab tasks={visibleTasks} allNames={allNames} onUpdate={(id, t) => updateTask(id, t)} onDelete={deleteTask} />
              )}
              {tab === "assignee" && (
                <AssigneeTab tasks={visibleTasks} allNames={allNames} onUpdate={(id, t) => updateTask(id, t)} onDelete={deleteTask} />
              )}
              {tab === "flow" && <FlowTab />}
              {tab === "prospects" && <ClientsTab initialTab="prospect" />}
              {tab === "clients" && <ClientsTab initialTab="done" />}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
