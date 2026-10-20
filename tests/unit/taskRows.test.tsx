// The task row family (guide 4.6, 4.7, 8): the card, list, day and record rows, the done circle and the selection checkbox.
// What they say to a screen reader and which state they are in. Looks are checked in the gallery against the prototype.
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { PipelineEntry } from "@/lib/clientTypes";
import { companiesById } from "@/lib/kinds";
import type { Task } from "@/lib/types";
import DoneCircle from "@/ui/DoneCircle";
import SelectBox from "@/ui/SelectBox";
import { TaskCard, TaskDayRow, TaskListRow, TaskRecordRow } from "@/ui/TaskRow";

const TODAY = "2026-10-20";
const companies = companiesById([{ id: 1, company: "Pelita Foods", status: "To Follow Up" }] as PipelineEntry[]);
const base: Task = {
  id: "t1",
  task: "Call Pelita Foods about the trial",
  linkedClientId: 1,
  touchPoint: "Call",
  responsible: ["Maya Chen"],
  informed: [{ name: "Kevin Tan", note: "backup" }],
  keyPoints: "Ask about the second outlet.",
  startDate: "2026-10-10",
  endDate: "2026-10-18",
  order: 1,
};
const html = (el: React.ReactElement) => renderToStaticMarkup(el);
const props = { companies, today: TODAY, href: "?task=t1" };

describe("done circle (guide 4.6)", () => {
  it("is labelled with what pressing it does, and the task's name", () => {
    expect(html(<DoneCircle kind="prospect" done={false} title="Call Pelita Foods" />)).toContain('aria-label="Mark done: Call Pelita Foods"');
    expect(html(<DoneCircle kind="prospect" done title="Call Pelita Foods" />)).toContain('aria-label="Mark not done: Call Pelita Foods"');
  });

  it("is its own button", () => {
    expect(html(<DoneCircle kind="client" done={false} title="x" />)).toContain('type="button"');
  });
});

describe("selection checkbox (guide 4.7)", () => {
  it("is a checkbox that can be on, off or mixed", () => {
    expect(html(<SelectBox checked label="Select: x" />)).toContain('aria-checked="true"');
    expect(html(<SelectBox checked={false} label="Select: x" />)).toContain('aria-checked="false"');
    const mixed = html(<SelectBox checked="mixed" label="Select every task in the list" />);
    expect(mixed).toContain('aria-checked="mixed"');
    expect(mixed).toContain('role="checkbox"');
  });
});

describe("card row (Today)", () => {
  it("opens the task from its title, and has its own done button", () => {
    const markup = html(<TaskCard {...props} task={base} />);
    expect(markup).toMatch(/<a [^>]*href="\?task=t1"[^>]*>Call Pelita Foods about the trial<\/a>/);
    expect(markup).toContain('aria-label="Mark done: Call Pelita Foods about the trial"');
  });

  it("shows the company, touch point, last action in its tone, the deadline in words, and who is on it", () => {
    const markup = html(<TaskCard {...props} task={{ ...base, lastActionDate: "2026-10-05" }} />);
    expect(markup).toContain("Pelita Foods");
    expect(markup).toContain("Call");
    expect(markup).toContain("No action for 15 days");
    expect(markup).toContain("2 days late");
    expect(markup).toContain('aria-label="Responsible: Maya Chen. Informed: Kevin Tan (backup)"');
    expect(markup).toContain('data-kind="prospect"');
  });

  it("shows the team badge for internal work, with its group", () => {
    const markup = html(<TaskCard {...props} task={{ ...base, linkedClientId: undefined, taskGroup: "Hiring", priority: "High" }} />);
    expect(markup).toContain("Hiring");
    expect(markup).toContain("High priority");
    expect(markup).toContain('data-kind="internal"');
  });

  it("marks a finished task and one that is leaving", () => {
    const done = html(<TaskCard {...props} task={{ ...base, completed: true, completedAt: new Date(2026, 9, 17, 12).getTime() }} leaving />);
    expect(done).toContain('data-done="true"');
    expect(done).toContain('data-leaving="true"');
    expect(done).toContain('aria-label="Mark not done: Call Pelita Foods about the trial"');
    expect(done).toContain("Done 3 days ago");
    expect(done).not.toContain("days late");
  });

  it("says 'Just changed' when a colleague changed it", () => {
    expect(html(<TaskCard {...props} task={base} justChanged />)).toContain("Just changed");
    expect(html(<TaskCard {...props} task={base} />)).not.toContain("Just changed");
  });

  it("swaps the done circle for a checkbox when selecting, and marks a selected row", () => {
    const markup = html(<TaskCard {...props} task={base} selecting selected />);
    expect(markup).toContain('role="checkbox"');
    expect(markup).toContain('aria-label="Select: Call Pelita Foods about the trial"');
    expect(markup).toContain('data-selected="true"');
    expect(markup).not.toContain("Mark done:");
  });
});

describe("list row (All tasks)", () => {
  it("shows the company, the deadline and the people, and opens the task", () => {
    const markup = html(<TaskListRow {...props} task={base} />);
    expect(markup).toContain('href="?task=t1"');
    expect(markup).toContain("Pelita Foods");
    expect(markup).toContain("2 days late");
    expect(markup).toContain("Responsible: Maya Chen");
  });

  it("says 'No dates' for an undated task", () => {
    expect(html(<TaskListRow {...props} task={{ ...base, startDate: "", endDate: "" }} />)).toContain("No dates");
  });
});

describe("day row (Plan's Day view, a person's page)", () => {
  it("lists who is responsible and who is informed with their part, and the key points", () => {
    const markup = html(<TaskDayRow {...props} task={base} />);
    expect(markup).toContain("Responsible");
    expect(markup).toContain("Maya Chen");
    expect(markup).toContain("Informed");
    expect(markup).toContain("Kevin Tan");
    expect(markup).toContain("backup");
    expect(markup).toContain("Ask about the second outlet.");
  });

  it("says 'Nobody yet' for a task with no owner", () => {
    expect(html(<TaskDayRow {...props} task={{ ...base, responsible: [] }} />)).toContain("Nobody yet");
  });

  it("on a person's page, says their part when they are only informed", () => {
    expect(html(<TaskDayRow {...props} task={base} person="Kevin Tan" />)).toContain("Their part:");
    expect(html(<TaskDayRow {...props} task={{ ...base, informed: [{ name: "Kevin Tan" }] }} person="Kevin Tan" />)).toContain("Kept informed, with no note on their part");
  });
});

describe("record row (inside a company record)", () => {
  it("shows the title and the deadline pill, and opens the task", () => {
    const markup = html(<TaskRecordRow {...props} task={base} />);
    expect(markup).toContain("Call Pelita Foods about the trial");
    expect(markup).toContain("2 days late");
    expect(markup).toContain('href="?task=t1"');
  });
});
