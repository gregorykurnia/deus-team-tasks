import { describe, expect, it } from "vitest";
import type { HistoricalClient } from "@/lib/historicalClientTypes";
import { addedMessage, countHelp, countMessage, deleteWording, parentLine, parentsToPick, subsByParent } from "@/lib/pastEdit";

const client = (id: string, name: string, f: Partial<HistoricalClient> = {}): HistoricalClient => ({
  id,
  name,
  parentId: null,
  sector: null,
  countHead: true,
  createdAt: 1,
  ...f,
});

// 2 counted parents + 1 umbrella, 3 subsidiaries: 5 clients.
const record = () => [
  client("nusa", "Nusa Retail", { sector: "Retail" }),
  client("nusa-1", "Nusa Outlet", { parentId: "nusa" }),
  client("nusa-2", "Nusa Online", { parentId: "nusa" }),
  client("halcyon", "Halcyon Group", { countHead: false }),
  client("halcyon-1", "Halcyon Clinic", { parentId: "halcyon" }),
  client("pelita", "Pelita Foods"),
];

describe("deleting a past client (R8, 5.4)", () => {
  it("is blocked for a parent that still has subsidiaries, saying how many and what to do", () => {
    const w = deleteWording(record()[0], record());
    expect(w).toEqual({
      blocked: true,
      title: "Move or delete its subsidiaries first",
      body: "Nusa Retail still has 2 subsidiaries. Move them to another parent company or delete them, so no subsidiary is left without a parent. Then Nusa Retail can be deleted.",
    });
    expect(deleteWording(record()[3], record()).body).toContain("still has 1 subsidiary. Move it to another parent company or delete it,");
  });

  it("says how the total changes for a subsidiary or a counted company", () => {
    expect(deleteWording(record()[1], record())).toMatchObject({
      blocked: false,
      title: "Delete Nusa Outlet?",
      body: "It comes off the record of past clients for everyone on the team. The client total goes from 5 to 4.",
      confirm: "Delete subsidiary",
    });
    expect(deleteWording(record()[5], record())).toMatchObject({ confirm: "Delete company", body: expect.stringContaining("from 5 to 4.") });
  });

  it("says the totals stay the same for an umbrella company that isn't counted", () => {
    const clients = [client("u", "Umbrella", { countHead: false }), client("p", "Pelita")];
    expect(deleteWording(clients[0], clients).body).toBe("It comes off the record of past clients for everyone on the team. It isn’t counted, so the totals stay the same.");
  });
});

describe("counting a parent company or not (R3)", () => {
  it("says how the client total moves either way", () => {
    expect(countMessage(record()[0], record(), false)).toBe("Nusa Retail no longer counted. Clients: 5 → 4");
    expect(countMessage(record()[3], record(), true)).toBe("Halcyon Group counted again. Clients: 5 → 6");
  });

  it("explains the switch while adding", () => {
    expect(countHelp(true)).toMatch(/^Counts as one client\. Turn this off/);
    expect(countHelp(false)).toMatch(/^Kept on record as an umbrella company\. Its subsidiaries will still count\./);
  });
});

describe("choosing a parent company (R1, R2)", () => {
  it("lists parent companies only, A to Z, matching the typed words and leaving out the current one", () => {
    expect(parentsToPick(record(), "").map((c) => c.name)).toEqual(["Halcyon Group", "Nusa Retail", "Pelita Foods"]);
    expect(parentsToPick(record(), " nusa ").map((c) => c.name)).toEqual(["Nusa Retail"]);
    expect(parentsToPick(record(), "", "nusa").map((c) => c.name)).toEqual(["Halcyon Group", "Pelita Foods"]);
  });

  it("describes each with its sector and subsidiaries", () => {
    const subs = subsByParent(record());
    expect(parentLine("Retail", subs.get("nusa")!)).toBe("Retail · 2 subsidiaries");
    expect(parentLine("", subs.get("pelita")!)).toBe("No sector · 0 subsidiaries");
  });

  it("says where something was added", () => {
    expect(addedMessage("Nusa Mart", "Nusa Retail")).toBe("Nusa Mart added under Nusa Retail");
    expect(addedMessage("Borneo Agro")).toBe("Borneo Agro added");
  });
});
