"use client";

// Task rows in their variants and states (task 2.7): card, list, day and record rows, with done, overdue, within three days,
// undated, last action in each tone, just changed, selected and leaving. The done circle and the Select switch are live.
// The rows are dated from a fixed demo day, so the server (in UTC) and the browser (UTC+7) render the same thing; screens
// use useToday instead.
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { PipelineEntry } from "@/lib/clientTypes";
import { addDays } from "@/lib/dates";
import { companiesById, DEAL_DONE_STATUS } from "@/lib/kinds";
import type { Task } from "@/lib/types";
import Button from "@/ui/Button";
import SelectBox from "@/ui/SelectBox";
import { TaskCard, TaskDayRow, TaskListRow, TaskRecordRow } from "@/ui/TaskRow";

const TODAY = "2026-10-20";
const companies = companiesById([
  { id: 1, company: "Pelita Foods", status: "To Follow Up" },
  { id: 2, company: "Arunika Labs", status: DEAL_DONE_STATUS },
] as PipelineEntry[]);

function task(id: string, fields: Partial<Task>): Task {
  return { id, task: id, responsible: [], informed: [], keyPoints: "", startDate: "", endDate: "", order: 0, ...fields };
}

const TASKS: Task[] = [
  task("t1", {
    task: "Call Pelita Foods about the trial",
    linkedClientId: 1,
    touchPoint: "Call",
    startDate: addDays(TODAY, -10),
    endDate: addDays(TODAY, -2),
    lastActionDate: addDays(TODAY, -15),
    responsible: ["Maya Chen"],
    informed: [{ name: "Kevin Tan", note: "backup" }],
    keyPoints: "Ask about the second outlet, and whether the trial ends on the 6th.",
  }),
  task("t2", {
    task: "Send the revised proposal with volume pricing",
    linkedClientId: 2,
    touchPoint: "Email",
    startDate: addDays(TODAY, -3),
    endDate: addDays(TODAY, 2),
    lastActionDate: addDays(TODAY, -9),
    responsible: ["Kevin Tan", "Nadia Pratama"],
  }),
  task("t3", {
    task: "Book the venue for the partner event",
    taskGroup: "Partner events",
    priority: "High",
    startDate: addDays(TODAY, 1),
    endDate: addDays(TODAY, 12),
    responsible: ["Budi Santoso"],
    informed: [{ name: "Maya Chen" }],
  }),
  task("t4", { task: "Draft the hiring plan for the Surabaya branch", taskGroup: "Hiring" }),
  task("t5", {
    task: "Share the retail rollout case study",
    linkedClientId: 2,
    completed: true,
    completedAt: new Date(`${addDays(TODAY, -3)}T12:00:00`).getTime(),
    endDate: addDays(TODAY, -1),
    responsible: ["Nadia Pratama"],
  }),
  task("t6", {
    task: "Review the trial usage, then prepare the contract draft",
    linkedClientId: 1,
    touchPoint: "Meeting",
    endDate: addDays(TODAY, 6),
    lastActionDate: addDays(TODAY, -3),
    responsible: ["Maya Chen", "Budi Santoso"],
  }),
];

const open = (id: string) => `?task=${id}`;

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="min-w-0" aria-label={title}>
      <h3 className="mb-3 text-[12.5px] font-bold text-muted">{title}</h3>
      <div className="flex flex-col gap-1.5 rounded-panel bg-glass p-1.5">{children}</div>
    </section>
  );
}

export default function TaskRowDemos() {
  const [marked, setMarked] = useState<Record<string, number>>({}); // marked done in this demo, and when
  const [gone, setGone] = useState<string[]>([]); // left the list
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<string[]>(["t2"]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const live = timers.current;
    return () => live.forEach(clearTimeout);
  }, []);

  // Marked done, a row leaves the open list; marked not done (a finished one), it only changes back.
  function toggleDone(t: Task, done: boolean) {
    if (!done) {
      setMarked((m) => ({ ...m, [t.id]: 0 }));
      return;
    }
    setMarked((m) => ({ ...m, [t.id]: new Date(`${TODAY}T12:00:00`).getTime() })); // done on the demo day
    timers.current.push(setTimeout(() => setGone((l) => [...l, t.id]), 900));
  }

  const shown = TASKS.filter((t) => !gone.includes(t.id));
  const allPicked = shown.length > 0 && shown.every((t) => picked.includes(t.id));
  const headState = allPicked ? true : picked.some((id) => shown.some((t) => t.id === id)) ? "mixed" : false;

  return (
    <div className="flex w-full flex-col gap-8">
      <div className="flex flex-wrap items-center gap-3">
        <Button aria-pressed={selecting} onClick={() => setSelecting((v) => !v)}>
          Select
        </Button>
        <Button
          onClick={() => {
            setMarked({});
            setGone([]);
            setPicked(["t2"]);
          }}
        >
          Reset rows
        </Button>
        {selecting && (
          <span className="flex items-center gap-2 text-[13px] font-semibold text-ink-2">
            <SelectBox
              checked={headState}
              label="Select every task in the list"
              onClick={() => setPicked(allPicked ? [] : shown.map((t) => t.id))}
            />
            {picked.filter((id) => shown.some((t) => t.id === id)).length} selected
          </span>
        )}
      </div>

      <Panel title="Card rows (Today)">
        {shown.map((t) => {
          const doneAt = marked[t.id];
          const shownTask = doneAt ? { ...t, completed: true, completedAt: doneAt } : doneAt === 0 ? { ...t, completed: false, completedAt: undefined } : t;
          return (
            <TaskCard
              key={t.id}
              task={shownTask}
              companies={companies}
              today={TODAY}
              href={open(t.id)}
              onToggleDone={(done) => toggleDone(t, done)}
              leaving={!!doneAt}
              justChanged={t.id === "t6"}
              selecting={selecting}
              selected={picked.includes(t.id)}
              onSelect={() => setPicked((l) => (l.includes(t.id) ? l.filter((x) => x !== t.id) : [...l, t.id]))}
            />
          );
        })}
      </Panel>

      <Panel title="List rows (All tasks)">
        {[TASKS[0], TASKS[1], TASKS[3], TASKS[4]].map((t) => (
          <TaskListRow key={t.id} task={t} companies={companies} today={TODAY} href={open(t.id)} />
        ))}
      </Panel>

      <Panel title="Day rows (Plan's Day view and a person's page)">
        <TaskDayRow task={TASKS[0]} companies={companies} today={TODAY} href={open("t1")} />
        <TaskDayRow task={TASKS[0]} companies={companies} today={TODAY} href={open("t1")} person="Kevin Tan" />
        <TaskDayRow task={TASKS[2]} companies={companies} today={TODAY} href={open("t3")} person="Maya Chen" />
        <TaskDayRow task={TASKS[3]} companies={companies} today={TODAY} href={open("t4")} />
      </Panel>

      <Panel title="Record rows (inside a company record)">
        {[TASKS[0], TASKS[5], TASKS[4]].map((t) => (
          <TaskRecordRow key={t.id} task={t} companies={companies} today={TODAY} href={open(t.id)} />
        ))}
      </Panel>
    </div>
  );
}
