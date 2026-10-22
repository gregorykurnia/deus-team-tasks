// Changing companies (task 3.9): quick picks, values, the Deal done move, the move dialog's plan, the record's sections
// and warnings, and what a deletion says.
import { describe, expect, it } from "vitest";
import {
  changeMessage,
  defaultMoveTarget,
  deleteBlocked,
  deleteWording,
  fieldText,
  keptInStepNote,
  moveChoices,
  moveMessage,
  movePatch,
  movePlan,
  movesToDealDone,
  newCompanyFields,
  parseValue,
  quickPicks,
  recordAlerts,
  recordSections,
  sameValue,
} from "@/lib/companyEdit";
import { DEAL_DONE_STATUS } from "@/lib/companies";
import { DEFAULT_COMPANY_SETTINGS, type CompanySettings } from "@/lib/companySettings";
import type { PipelineEntry } from "@/lib/clientTypes";

const TODAY = "2026-10-20";
const co = (fields: Partial<PipelineEntry> = {}): PipelineEntry => ({ id: 1, company: "Halcyon Logistics", ...fields });
const settings: CompanySettings = DEFAULT_COMPANY_SETTINGS;

describe("quick editors", () => {
  it("offers Today and Yesterday for the last action, and looks ahead for other dates", () => {
    expect(quickPicks("date", TODAY)).toEqual([
      { label: "Today", iso: "2026-10-20" },
      { label: "Yesterday", iso: "2026-10-19" },
    ]);
    expect(quickPicks("target", TODAY).map((p) => p.iso)).toEqual(["2026-10-20", "2026-10-21", "2026-10-27"]);
  });

  it("saves trimmed text, numbers as numbers, and nothing for an empty field", () => {
    expect(parseValue({ type: "text" }, "  Call back  ")).toBe("Call back");
    expect(parseValue({ type: "text" }, "   ")).toBeUndefined();
    expect(parseValue({ type: "number" }, "1,200")).toBe(1200);
    expect(sameValue(undefined, "")).toBe(true);
    expect(sameValue(12, "12")).toBe(true);
  });

  it("says what changed, and how many linked tasks followed", () => {
    expect(changeMessage("Status", false, 0)).toBe("Status updated");
    expect(changeMessage("Target date", true, 1)).toBe("Target date cleared. 1 linked task now matches");
    expect(changeMessage("Last action", false, 3)).toBe("Last action updated. 3 linked tasks now match");
  });

  it("writes dates in full and numbers with separators", () => {
    expect(fieldText(co({ target: "2026-11-03" }), { key: "target", type: "date" })).toBe("3 Nov 2026");
    expect(fieldText(co({ size: 12000 }), { key: "size", type: "number" })).toBe("12,000");
    expect(fieldText(co(), { key: "pic", type: "text" })).toBe("");
  });
});

describe("Deal done through the status (5.10)", () => {
  it("moves an Active company, and nothing else", () => {
    expect(movesToDealDone(co({ status: "Meeting Soon" }), "status", DEAL_DONE_STATUS)).toBe(true);
    expect(movesToDealDone(co(), "status", "Meeting Soon")).toBe(false);
    expect(movesToDealDone(co({ _hold: true }), "status", DEAL_DONE_STATUS)).toBe(false);
  });
});

describe("moving between groups (B5, 5.10)", () => {
  it("goes to the usual next group first", () => {
    expect(defaultMoveTarget("toApproach")).toBe("active");
    expect(defaultMoveTarget("active")).toBe("dealDone");
    expect(defaultMoveTarget("noOrNotNow")).toBe("active");
  });

  it("carries over what's known and asks only for what the new group's list shows", () => {
    const lead = co({ _raw: true, priority: "High", type: "Client", industry: "Logistics", reach: "2026-10-18" });
    const plan = movePlan(lead, "active", settings, 0, TODAY);
    expect(plan.carried.map((x) => [x.field.label, x.text])).toEqual([
      ["Priority", "High"],
      ["Type", "Client"],
      ["Industry", "Logistics"],
    ]);
    expect(plan.toFill.map((f) => f.key)).toEqual(["status", "date", "target", "product", "gbaTrials", "notes"]);
    expect(plan.values.status).toBe("Meeting Soon"); // an Active company needs a status
    expect(plan.values.date).toBe(TODAY); // contact was just made
    expect(plan.kindSwitch).toBe(0);
  });

  it("starts No or not now on “Not now”, and says when tasks switch kind", () => {
    const active = co({ status: "To Follow Up", date: "2026-10-01", product: "Wifi" });
    const hold = movePlan(active, "noOrNotNow", settings, 2, TODAY);
    expect(hold.values.answer).toBe("Not now");
    expect(hold.carried.map((x) => x.field.key)).toEqual(["product", "date"]);
    expect(hold.kindSwitch).toBe(0);
    expect(movePlan(active, "dealDone", settings, 2, TODAY).kindSwitch).toBe(2);
    expect(movePlan(co({ status: DEAL_DONE_STATUS }), "active", settings, 3, TODAY).kindSwitch).toBe(3);
  });

  it("never offers Deal done as a status to pick, and lets go of it when leaving Deal done", () => {
    expect(moveChoices(settings, "status").map((o) => o.name)).not.toContain(DEAL_DONE_STATUS);
    const client = co({ status: DEAL_DONE_STATUS, date: "2026-10-10" });
    expect(movePlan(client, "active", settings, 0, TODAY).values.status).toBe("Meeting Soon");
  });

  it("writes only the fields that change, and clears the ones emptied", () => {
    const c = co({ status: "To Follow Up", notes: "Call" });
    expect(movePatch(c, { status: "To Follow Up", notes: "", target: "2026-11-01" })).toEqual({ notes: undefined, target: "2026-11-01" });
  });

  it("says where it went, and what happened to the tasks", () => {
    expect(moveMessage("Halcyon", "dealDone", 2)).toBe("Deal done. Halcyon moved to Active clients and partners. Its 2 open tasks now count as client work.");
    expect(moveMessage("Halcyon", "active", 1)).toBe("Halcyon moved to Active. Its 1 open task now counts as prospect work again.");
    expect(moveMessage("Halcyon", "noOrNotNow", 0)).toBe("Halcyon moved to No or not now.");
  });
});

describe("the record (6.5)", () => {
  it("puts every field the group has in sections, and keeps a place for the team's own", () => {
    const fields = [...settings.fields.active, { key: "cx_1", label: "Budget", type: "number" as const, shown: true, own: true }];
    const sections = recordSections(fields);
    expect(sections.map((s) => s.title)).toEqual(["Where we stand", "What’s happening", "Who they are", "Added by the team"]);
    expect(sections[0].fields.map((f) => f.key)).toEqual(["status", "priority", "product", "gbaTrials"]);
    expect(sections[3].fields.map((f) => f.key)).toEqual(["cx_1"]);
    expect(recordSections(settings.fields.noOrNotNow).at(-1)?.fields).toEqual([]);
  });

  it("warns when an Active company has gone cold or a target date was missed", () => {
    const alerts = recordAlerts(co({ date: "2026-10-01", target: "2026-10-17" }), settings.fields.active, TODAY);
    expect(alerts.map((a) => [a.tone, a.title])).toEqual([
      ["error", "Gone cold."],
      ["warning", "Target date missed 3 days ago."],
    ]);
    expect(alerts[0].text).toBe("No action for 19 days.");
    expect(recordAlerts(co({ date: "2026-10-18", target: "2026-10-25" }), settings.fields.active, TODAY)).toEqual([]);
  });

  it("warns when a planned outreach has passed in To approach", () => {
    const alerts = recordAlerts(co({ _raw: true, reach: "2026-10-15" }), settings.fields.toApproach, TODAY);
    expect(alerts.map((a) => a.title)).toEqual(["Outreach was planned 5 days ago."]);
  });

  it("names the dates kept in step with the open tasks", () => {
    expect(keptInStepNote(settings.fields.active, 1)).toBe("The last action and target date stay in step with this task. Change either side and the other follows.");
    expect(keptInStepNote(settings.fields.noOrNotNow, 3)).toBe("The last action stays in step with these 3 tasks. Change either side and the other follows.");
    expect(keptInStepNote(settings.fields.active, 0)).toBeNull();
    expect(keptInStepNote(settings.fields.toApproach, 2)).toBeNull();
  });
});

describe("deleting (B14)", () => {
  it("says the tasks stay as internal work and the notes stay without a company", () => {
    expect(deleteWording({ total: 0, open: 0 }, false)).toBe("It will be removed for everyone on the team.");
    expect(deleteWording({ total: 5, open: 2 }, true)).toBe(
      "It will be removed for everyone on the team. Its 5 tasks (2 open) stay, as internal work. Its qualification notes stay too, without a company."
    );
    expect(deleteWording({ total: 1, open: 1 }, false)).toBe("It will be removed for everyone on the team. Its 1 task stays, as internal work.");
  });

  it("waits until the tasks and notes are as the server has them, with no error", () => {
    const ready = { loading: false, fromCache: false, error: null };
    const failed = { ...ready, error: new Error("denied") };
    expect(deleteBlocked(ready, ready, true)).toBeNull();
    expect(deleteBlocked(ready, ready, false)).toBe("Deleting needs a connection.");
    expect(deleteBlocked({ ...ready, loading: true }, ready, true)).toBe("Its tasks and qualification notes are still loading.");
    expect(deleteBlocked(ready, { ...ready, fromCache: true }, true)).toBe("Its tasks and qualification notes are still loading.");
    expect(deleteBlocked(failed, ready, true)).toBe("Couldn’t load its tasks, so it can’t be deleted yet. Reload the page.");
    expect(deleteBlocked(ready, failed, true)).toBe("Couldn’t load its qualification notes, so it can’t be deleted yet. Reload the page.");
    expect(deleteBlocked(failed, { ...failed, fromCache: true }, true)).toBe("Couldn’t load its tasks and qualification notes, so it can’t be deleted yet. Reload the page.");
  });
});

describe("new company (B1, B3)", () => {
  it("asks for what the group's list shows, and the contact person", () => {
    expect(newCompanyFields(settings, "active").map((f) => f.key)).toEqual(["pic", "status", "priority", "date", "target", "product", "gbaTrials", "notes"]);
    expect(newCompanyFields(settings, "noOrNotNow").map((f) => f.key)).toContain("pic");
  });
});
