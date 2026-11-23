import { describe, expect, it } from "vitest";
import {
  leaveAddedMessage, leaveAdjustedMessage, leaveCancelledMessage, leaveDecidedMessage, leaveRequestedMessage, leaveWaitingMessage,
} from "@/lib/leaveMessages";

const today = "2026-01-12";
const request = {
  id: "leave + 1", name: "Audrey", email: "audrey+time@deushcs.com",
  type: "annual", start: "2026-01-12", end: "2026-01-14",
} as const;
const requestUrl = "/leave?request=leave%20%2B%201";
const dates = "Mon 12 – Wed 14 Jan";

describe("leave push messages", () => {
  it("tells admins who asked, which dates and how many working days", () => {
    expect(leaveRequestedMessage(request, 3, today)).toEqual({
      title: "Leave request",
      body: "Audrey: Annual leave, Mon 12 – Wed 14 Jan (3 days)",
      url: "/leave?view=team&request=leave%20%2B%201",
    });
    expect(leaveRequestedMessage({ ...request, end: today }, 0.5, today).body)
      .toBe("Audrey: Annual leave, Mon 12 Jan (0.5 day)");
  });

  it("tells the person the decision, with a reason only when rejected", () => {
    expect(leaveDecidedMessage({ ...request, status: "approved", rejectReason: "Old reason" }, today)).toEqual({
      title: "Annual leave approved", body: dates, url: requestUrl,
    });
    expect(leaveDecidedMessage({ ...request, status: "rejected", rejectReason: "Please choose different dates." }, today)).toEqual({
      title: "Annual leave not approved", body: `${dates}\nPlease choose different dates.`, url: requestUrl,
    });
    expect(leaveDecidedMessage({ ...request, status: "rejected", rejectReason: " \n " }, today).body).toBe(dates);
  });

  it("links a person's cancellation to Team and an admin's cancellation to the recipient's request", () => {
    expect(leaveCancelledMessage(request, "Audrey", true, today)).toEqual({
      title: "Audrey cancelled leave",
      body: `Annual leave, ${dates}`,
      url: "/leave?view=team&person=audrey%2Btime%40deushcs.com",
    });
    expect(leaveCancelledMessage(request, "Gregory", false, today)).toEqual({
      title: "Gregory cancelled your leave", body: `Annual leave, ${dates}`, url: requestUrl,
    });
  });

  it("links leave added for a person to their request", () => {
    expect(leaveAddedMessage(request, "Gregory", today)).toEqual({
      title: "Gregory added leave for you", body: `Annual leave, ${dates}`, url: requestUrl,
    });
  });

  it("signs adjustments and links to History", () => {
    expect(leaveAdjustedMessage({ days: 1.5, reason: "Opening balance correction" })).toEqual({
      title: "Your leave balance changed", body: "+1.5 days: Opening balance correction", url: "/leave?view=history",
    });
    expect(leaveAdjustedMessage({ days: -1, reason: "Correction" }).body).toBe("−1 day: Correction");
  });

  it.each([[1, "1 leave request waiting"], [2, "2 leave requests waiting"], [1000, "1,000 leave requests waiting"]])(
    "formats the Team summary for %i waiting", (count, title) => {
      expect(leaveWaitingMessage(count)).toEqual({
        title, body: `Leave: ${count.toLocaleString("en-US")} waiting for you`, url: "/leave?view=team",
      });
    },
  );

  it("has no summary for zero or an invalid count", () => {
    for (const count of [0, -1, 0.5, Number.NaN, Infinity]) expect(leaveWaitingMessage(count)).toBeUndefined();
  });

  it("keeps a 40-character name and the longest type, and bounds long multiline reasons", () => {
    const name = "Audrey ".repeat(5) + "Indah";
    const other = { ...request, name, type: "other" as const };
    const reason = `Coverage\n\t${"😀".repeat(80)}`;
    const shortReason = `Coverage ${"😀".repeat(50)}…`;
    const rejected = leaveDecidedMessage({ ...other, status: "rejected", rejectReason: reason }, today);
    const messages = [
      leaveRequestedMessage(other, 3, today), rejected, leaveAddedMessage(other, name, today),
      leaveCancelledMessage(other, name, true, today), leaveCancelledMessage(other, name, false, today),
      leaveAdjustedMessage({ days: 1.5, reason }), leaveWaitingMessage(2)!,
    ];
    expect(name).toHaveLength(40);
    expect(messages[0].body).toBe(`${name}: Other absence, ${dates} (3 days)`);
    expect(rejected).toMatchObject({ title: "Other absence not approved", body: `${dates}\n${shortReason}` });
    expect(messages[2].title).toBe(`${name} added leave for you`);
    expect(messages[5].body).toBe(`+1.5 days: ${shortReason}`);
    expect(messages.every((message) => message.body.split("\n").length <= 4)).toBe(true);
  });
});
