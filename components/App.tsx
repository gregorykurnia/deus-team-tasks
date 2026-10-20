"use client";

import { useEffect, useMemo, useState } from "react";
import { useTasks } from "@/lib/useTasks";
import { KNOWN_NAMES } from "@/lib/types";
import { namesInUse } from "@/lib/people";
import { OfflineError } from "@/lib/connection";
import { Sidebar, TabId } from "./Sidebar";
import { TasksTab } from "./TasksTab";
import { GanttTab } from "./GanttTab";
import { DailyTab } from "./DailyTab";
import { AssigneeTab } from "./AssigneeTab";
import { CalendarTab } from "./CalendarTab";
import { FlowTab } from "./FlowTab";
import { ClientsTab } from "./ClientsTab";
import { ProspectJournalTab } from "./ProspectJournalTab";
import { ClientsHistoricalTab } from "./ClientsHistoricalTab";

export default function App() {
  const { tasks, loading, addTask, updateTask, deleteTask } = useTasks();
  const [tab, setTab] = useState<TabId>("operational");
  const [journalPipelineId, setJournalPipelineId] = useState<number | null>(null);
  const [clientDetailsId, setClientDetailsId] = useState<number | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);

  const completedCount = useMemo(() => tasks.filter((t) => t.completed).length, [tasks]);
  const visibleTasks = useMemo(
    () => (showCompleted ? tasks : tasks.filter((t) => !t.completed)),
    [tasks, showCompleted]
  );

  const allNames = useMemo(() => namesInUse(tasks, KNOWN_NAMES), [tasks]);

  // The old screens don't wait for their writes, so a refused or failed one
  // would vanish without a word. Say so until the new screens replace them.
  useEffect(() => {
    function onRejection(e: PromiseRejectionEvent) {
      const err = e.reason;
      if (!(err instanceof OfflineError) && err?.name !== "FirebaseError") return;
      e.preventDefault();
      window.alert(err instanceof OfflineError ? err.message : `The change wasn't saved: ${err.message}`);
    }
    window.addEventListener("unhandledrejection", onRejection);
    return () => window.removeEventListener("unhandledrejection", onRejection);
  }, []);

  return (
    <div className="flex-1 flex">
      <Sidebar active={tab} onChange={setTab} />

      <div className="flex-1 flex flex-col min-w-0">
        <header
          className="border-b border-gray-200 bg-white/80 backdrop-blur sticky top-0 z-20"
          style={{ paddingTop: "env(safe-area-inset-top)" }}
        >
          <div className="pl-14 pr-4 md:px-6 h-14 flex items-center gap-2">
            <span className="text-xs text-gray-400 hidden sm:inline">Handover & rollout plan</span>
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

        <main
          className="flex-1 w-full px-3 py-4 md:px-6 md:py-6 overflow-x-hidden"
          style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
        >
          {loading ? (
            <div className="text-gray-400 text-sm py-20 text-center">Loading tasks…</div>
          ) : (
            <>
              {(tab === "operational" || tab === "task-prospects" || tab === "task-clients") && (
                <TasksTab
                  subTab={tab === "operational" ? "general" : tab === "task-prospects" ? "prospects" : "clients"}
                  tasks={visibleTasks}
                  allTasks={tasks}
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
              {tab === "calendar" && (
                <CalendarTab tasks={visibleTasks} allNames={allNames} onUpdate={(id, t) => updateTask(id, t)} onDelete={deleteTask} />
              )}
              {tab === "flow" && <FlowTab />}
              {tab === "clients" && (
                <ClientsTab
                  initialEntryId={clientDetailsId}
                  onEntryOpened={() => setClientDetailsId(null)}
                  onOpenJournal={(pipelineEntryId) => {
                    setJournalPipelineId(pipelineEntryId);
                    setTab("prospect-journal");
                  }}
                />
              )}
              {tab === "clients-historical" && <ClientsHistoricalTab />}
              {tab === "prospect-journal" && (
                <ProspectJournalTab
                  focusPipelineEntryId={journalPipelineId}
                  onEntryFocused={() => setJournalPipelineId(null)}
                  onOpenClient={(pipelineEntryId) => {
                    setClientDetailsId(pipelineEntryId);
                    setTab("clients");
                  }}
                />
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
