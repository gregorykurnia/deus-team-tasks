// The side bar's counts and task groups (guide 3).
import { describe, expect, it } from "vitest";
import type { PipelineEntry } from "@/lib/clientTypes";
import { groupNavItems, navCounts } from "@/lib/deskNav";
import { companiesById } from "@/lib/kinds";
import type { Task } from "@/lib/types";

const TODAY = "2026-10-20";

function task(id: string, fields: Partial<Task> = {}): Task {
  return { id, task: `Task ${id}`, responsible: [], informed: [], keyPoints: "", startDate: "", endDate: "", order: 0, ...fields };
}

const companies = companiesById([{ id: 1, company: "Pelita Foods", status: "To Follow Up" }] as PipelineEntry[]);

describe("side bar counts", () => {
  it("counts open tasks, and for Today the overdue and due-soon ones", () => {
    const tasks = [
      task("late", { endDate: "2026-10-18" }),
      task("soon", { endDate: "2026-10-22" }),
      task("later", { endDate: "2026-11-30" }),
      task("undated"),
      task("done", { endDate: "2026-10-18", completed: true }),
    ];
    expect(navCounts(tasks, TODAY)).toEqual({ today: 2, tasks: 4 });
  });
});

describe("task groups in the side bar", () => {
  const groups = [
    { id: "g1", name: "partner events", starred: false },
    { id: "g2", name: "Hiring", starred: false },
    { id: "g3", name: "Website", starred: true },
  ];

  it("lists important groups first, then A to Z, with a badge hue in the order they were made", () => {
    const items = groupNavItems(groups, [], companies);
    expect(items.map((g) => g.name)).toEqual(["Website", "Hiring", "partner events"]);
    expect(items.map((g) => g.hue)).toEqual([2, 1, 0]);
    expect(items.map((g) => g.badge)).toEqual(["WE", "HI", "PE"]);
  });

  it("counts a group's open tasks, company work included", () => {
    const tasks = [
      task("a", { taskGroup: "Hiring" }),
      task("b", { taskGroup: "Hiring", completed: true }),
      task("c", { taskGroup: "Hiring", linkedClientId: 1 }),
    ];
    expect(groupNavItems(groups, tasks, companies).find((g) => g.id === "g2")?.open).toBe(2);
  });
});
