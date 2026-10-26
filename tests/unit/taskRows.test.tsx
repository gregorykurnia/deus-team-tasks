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
  task: "Follow up on the trial",
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
    expect(markup).toMatch(/<a [^>]*href="\?task=t1"[^>]*>Follow up on the trial<\/a>/);
    expect(markup).toContain('aria-label="Mark done: Follow up on the trial"');
  });

  it("shows the company, touch point, last action in its tone, the deadline in words, and who is on it", () => {
    const markup = html(<TaskCard {...props} task={{ ...base, lastActionDate: "2026-10-05" }} />);
    expect(markup).toMatch(/<span class="[^"]*place[^"]*">Pelita Foods<\/span>/);
    expect(markup).toContain("<span>Call</span>");
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
    expect(done).toContain('aria-label="Mark not done: Follow up on the trial"');
    expect(done).toContain("Done 3 days ago");
    expect(done).not.toContain("days late");
  });

  it("says 'Just changed' when a colleague changed it", () => {
    expect(html(<TaskCard {...props} task={base} justChanged />)).toContain("Just changed");
    expect(html(<TaskCard {...props} task={base} />)).not.toContain("Just changed");
  });

  it("puts the deadline pill and the people above the title's link, so their hover titles show", () => {
    const markup = html(<TaskCard {...props} task={base} />);
    expect(markup).toMatch(/class="[^"]*lift[^"]*"><span[^>]*title="Deadline Sun 18 Oct"/);
    expect(markup).toMatch(/class="[^"]*right[^"]*lift[^"]*"/);
  });

  it("swaps the done circle for a checkbox when selecting, and marks a selected row", () => {
    const markup = html(<TaskCard {...props} task={base} selecting selected />);
    expect(markup).toContain('role="checkbox"');
    expect(markup).toContain('aria-label="Select: Follow up on the trial"');
    expect(markup).toContain('data-selected="true"');
    expect(markup).not.toContain("Mark done:");
    expect(markup).not.toContain("<a "); // a click on the row toggles the checkbox, it doesn't open the task
  });
});

describe("list row (All tasks)", () => {
  it("shows the company, the deadline and the people, and opens the task", () => {
    const markup = html(<TaskListRow {...props} task={base} />);
    expect(markup).toContain('href="?task=t1"');
    expect(markup).toMatch(/data-col="company"><span class="[^"]*label[^"]*">Company<\/span><span[^>]*>Pelita Foods<\/span>/);
    expect(markup).toContain("2 days late");
    expect(markup).toContain("Responsible: Maya Chen");
  });

  it("shows the details chosen, in the catalogue's order, and says so when one is empty", () => {
    const markup = html(<TaskListRow {...props} task={{ ...base, priority: "High", lastActionDate: "2026-10-11" }} columns={["end", "prio", "last", "touch"]} />);
    const order = ["data-col=\"touch\"", "data-col=\"prio\"", "data-col=\"end\"", "data-col=\"last\""].map((c) => markup.indexOf(c));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(order.every((i) => i > -1)).toBe(true);
    expect(markup).toContain("9 days ago"); // under the Last action head, not "Last action 9 days ago" twice
    expect(markup).not.toContain('data-col="company"');
    const empty = html(<TaskListRow {...props} task={base} columns={["type"]} />);
    expect(empty).toContain("None");
    expect(empty).toMatch(/_emptyCell_/);
  });

  it("puts what a hidden detail would say under the title, so hiding a column never hides the task's state", () => {
    const markup = html(<TaskListRow {...props} task={{ ...base, taskGroup: "Year end" }} columns={["type"]} />);
    expect(markup).toMatch(/<p class="[^"]*meta[^"]*"><span class="[^"]*place[^"]*">Pelita Foods<\/span><span class="[^"]*place[^"]*">Year end<\/span><span>2 days late<\/span><\/p>/);
    // On a group's page every task is in it, so the group isn't repeated.
    expect(html(<TaskListRow {...props} task={{ ...base, taskGroup: "Year end" }} columns={["type"]} inGroup />)).not.toContain("Year end");
  });

  it("calls the deadline column Finished on a finished task", () => {
    const done = { ...base, completed: true, completedAt: new Date(2026, 9, 17, 12).getTime() };
    expect(html(<TaskListRow {...props} task={done} columns={["end"]} />)).toContain(">Finished<");
  });

  it("shows the company and the group in columns of their own, and Internal for work with no company", () => {
    const look = new Map([["Hiring", { badge: "HI", hue: 2 }]]);
    const both = html(<TaskListRow {...props} task={{ ...base, taskGroup: "Hiring" }} columns={["company", "group"]} groupLooks={look} />);
    expect(both).toMatch(/data-col="company">.*Pelita Foods.*data-col="group">.*HI.*Hiring/);
    const internal = html(<TaskListRow {...props} task={{ ...base, linkedClientId: undefined, taskGroup: "Hiring" }} columns={["company", "group"]} groupLooks={look} />);
    expect(internal).toMatch(/data-col="company">.*Internal.*data-col="group">.*Hiring/);
    expect(html(<TaskListRow {...props} task={base} columns={["group"]} />)).toMatch(/_emptyCell_/);
  });

  it("shows the status in a column of its own, and In Progress under the title only when that column is hidden", () => {
    const started = { ...base, startedAt: 5 };
    const shown = html(<TaskListRow {...props} task={started} columns={["status"]} />);
    expect(shown).toMatch(/data-col="status">.*In Progress/);
    expect(shown.match(/In Progress/g)).toHaveLength(1);
    expect(html(<TaskListRow {...props} task={started} columns={["type"]} />)).toMatch(/_meta_.*In Progress/);
    expect(html(<TaskListRow {...props} task={base} columns={["status"]} />)).toMatch(/data-col="status">.*To Do/);
    expect(html(<TaskListRow {...props} task={{ ...base, completed: true }} columns={["status"]} />)).toMatch(/data-col="status">.*Done/);
  });

  it("shows only the live tag under the title while just changed, as the details have their own cells", () => {
    const markup = html(<TaskListRow {...props} task={{ ...base, priority: "High" }} justChanged />);
    expect(markup).toContain("Just changed");
    expect(markup).not.toContain("<span>Call</span>");
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
    expect(markup).toContain("Follow up on the trial");
    expect(markup).toContain("2 days late");
    expect(markup).toContain('href="?task=t1"');
  });
});
