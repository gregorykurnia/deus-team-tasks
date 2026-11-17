import { describe, expect, it } from "vitest";
import { auditFailed } from "../../scripts/a11y/status.mjs";

describe("accessibility command status", () => {
  it("passes completed scans with no recipe errors or violations", () => {
    expect(auditFailed([{ id: "tasks-desktop", errors: [], violations: [] }])).toBe(false);
  });

  it.each([
    { id: "flows-phone", failed: "Seeding tasks/flows failed: 500" },
    { id: "tasks-desktop", errors: ["never went live"], violations: [] },
    { id: "tasks-desktop", errors: [], violations: [{ rule: "label-content-name-mismatch" }] },
  ])("fails the command for an incomplete or inaccessible state: $id", (state) => {
    expect(auditFailed([{ id: "clean", errors: [], violations: [] }, state])).toBe(true);
  });
});
