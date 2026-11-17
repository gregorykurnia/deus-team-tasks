import { describe, expect, it } from "vitest";
import { assignmentMessage, assignmentRecipients, assignmentTaskId } from "@/lib/assignNotify";

const audrey = { email: "audrey@deushcs.com", name: "Audrey", active: true };
const greg = { email: "greg@deushcs.com", name: "Gregory", active: true };
const task = { id: "task & 1", task: "Send the quote", endDate: "2025-11-20" };

describe("assignment notice decisions and words", () => {
  it("matches normalized names once, excluding Full Team, unlinked, blank and inactive names", () => {
    const result = assignmentRecipients([" Ａｕｄｒｅｙ ", "audrey", "Full Team", "FULL   TEAM", "Nobody", " ", null, "Gregory"], [],
      [audrey, { ...audrey, email: "duplicate@deushcs.com" }, { ...greg, active: false }, { ...greg, name: "Full Team" }]);
    expect(result).toEqual({ owed: [audrey], notified: ["Audrey"] });
  });
  it("keeps only current linked names, records the sender and does not send to them", () => {
    expect(assignmentRecipients(["Audrey", "Gregory"], ["Removed", "aUDRey"], [audrey, greg], greg.email))
      .toEqual({ owed: [], notified: ["Audrey", "Gregory"] });
    expect(assignmentRecipients([], ["Audrey"], [audrey])).toEqual({ owed: [], notified: [] });
    expect(assignmentRecipients(["Audrey"], [], [audrey]).owed).toEqual([audrey]);
  });
  it.each([undefined, null, "Audrey", {}, [null, 4, ""]])("accepts missing or malformed stored lists %#", (value) => {
    expect(assignmentRecipients(value, value, [audrey])).toEqual({ owed: [], notified: [] });
  });
  it("builds the task, kind, deadline and same-origin task link", () => {
    expect(assignmentMessage(task, undefined, "prospect")).toEqual({ title: "New task for you",
      body: "Send the quote\nDeadline Thu 20 Nov · Prospect work", url: "/?task=task%20%26%201" });
    expect(assignmentMessage(task, undefined, "client").body).toContain("Client work");
    expect(assignmentMessage({ ...task, endDate: "" }).body).toBe("Send the quote\nNo deadline · Internal");
    expect(assignmentMessage({ ...task, endDate: "2026-02-30" }).body).toContain("No deadline");
  });
  it("names the current main task for a subtask", () => {
    expect(assignmentMessage(task, "Main task").body).toBe("Send the quote\nSubtask of Main task · Deadline Thu 20 Nov");
  });
  it("cuts 120-character and unicode names to 60 including ellipsis, keeping the deadline line", () => {
    const body = assignmentMessage({ ...task, task: "🌞".repeat(120) }, "m".repeat(120)).body;
    expect(body).toBe(`${"🌞".repeat(59)}…\nSubtask of ${"m".repeat(59)}… · Deadline Thu 20 Nov`);
    expect(body.split("\n")).toHaveLength(2);
    expect(assignmentMessage({ ...task, task: "a\n\nb\r\nc\td" }).body).toMatch(/^a b c d\nDeadline/);
    expect(assignmentMessage({ ...task, task: " " }).body).toMatch(/^Untitled task\n/);
  });
  it("validates Firestore IDs by UTF-8 bytes and rejects invalid or unsafe paths", () => {
    for (const id of [null, "", ".", "..", "__private__", "a/b", "a\n", "\ud800", "é".repeat(751)]) expect(assignmentTaskId(id)).toBe(false);
    for (const id of ["a", "a&b", "🌞", "é".repeat(750)]) expect(assignmentTaskId(id)).toBe(true);
  });
});
