"use client";

import { useMemo, useState } from "react";
import { useTasks } from "@/lib/useTasks";
import { KNOWN_NAMES } from "@/lib/types";
import { Tabs, TabId } from "./Tabs";
import { TasksTab } from "./TasksTab";
import { GanttTab } from "./GanttTab";
import { DailyTab } from "./DailyTab";
import { AssigneeTab } from "./AssigneeTab";
import { FlowTab } from "./FlowTab";

export default function App() {
  const { tasks, loading, addTask, updateTask, deleteTask } = useTasks();
  const [tab, setTab] = useState<TabId>("tasks");

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
    <div className="flex-1 flex flex-col">
      <header className="border-b border-gray-200 bg-white/80 backdrop-blur sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-6 pt-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-accent text-white flex items-center justify-center font-semibold text-sm">
              D
            </div>
            <h1 className="text-base font-semibold text-gray-900">DEUS Team Tasks</h1>
            <span className="text-xs text-gray-400 ml-1">Handover & rollout plan</span>
          </div>
          <Tabs active={tab} onChange={setTab} />
        </div>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-6">
        {loading ? (
          <div className="text-gray-400 text-sm py-20 text-center">Loading tasks…</div>
        ) : (
          <>
            {tab === "tasks" && (
              <TasksTab
                tasks={tasks}
                allNames={allNames}
                onAdd={addTask}
                onUpdate={(id, t) => updateTask(id, t)}
                onDelete={deleteTask}
              />
            )}
            {tab === "gantt" && (
              <GanttTab tasks={tasks} allNames={allNames} onUpdate={(id, t) => updateTask(id, t)} onDelete={deleteTask} />
            )}
            {tab === "daily" && (
              <DailyTab tasks={tasks} allNames={allNames} onUpdate={(id, t) => updateTask(id, t)} onDelete={deleteTask} />
            )}
            {tab === "assignee" && (
              <AssigneeTab tasks={tasks} allNames={allNames} onUpdate={(id, t) => updateTask(id, t)} onDelete={deleteTask} />
            )}
            {tab === "flow" && <FlowTab />}
          </>
        )}
      </main>
    </div>
  );
}
