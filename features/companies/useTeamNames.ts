"use client";

// The team members a PIC can be: the names the people picker offers on tasks (on tasks and in flows' roles), A to Z, so
// a company's PIC is the same person as on its tasks. loading: the tasks haven't arrived yet, so the list isn't complete.
import { useMemo } from "react";
import { useFlows, useTasks } from "@/desk/DeskData";
import { namesInUse } from "@/lib/people";
import type { FlowRole } from "@/lib/types";

export function useTeamNames(): { names: string[]; loading: boolean } {
  const tasks = useTasks();
  const flows = useFlows();
  const names = useMemo(() => {
    const roles: FlowRole[] = flows.rows.flatMap((f) => [...f.steps.flatMap((s) => s.roles), ...(f.decision?.branches.flatMap((b) => b.roles) ?? [])]);
    return namesInUse(tasks.rows, [], roles);
  }, [tasks.rows, flows.rows]);
  return { names, loading: tasks.loading };
}
