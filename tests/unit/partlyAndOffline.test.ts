// Words for a change that only partly saved (N13), the offline banner on each screen (D-014) and the also-found line (N3).
import { describe, expect, it } from "vitest";
import { alsoFound } from "@/lib/alsoFound";
import { partlyDeleteWording } from "@/lib/companyEdit";
import { offlineBannerWords } from "@/lib/offlineWords";
import { partlyGroupChange } from "@/lib/taskGroups";
import { PartlyChanged } from "@/lib/taskWrites";
import type { PipelineEntry } from "@/lib/clientTypes";
import type { ProspectJournalEntry } from "@/lib/prospectJournalTypes";
import { createEmptyProspectJournalEntry } from "@/lib/prospectJournalTypes";

describe("a group renamed or deleted part way (N13)", () => {
  it("says how far a rename got and that doing it again finishes it", () => {
    const words = partlyGroupChange("rename", new PartlyChanged(450, 750, null, null));
    expect(words).toContain("450 of 1,200 tasks");
    expect(words).toContain("the other 750");
    expect(words).toContain("try again");
  });

  it("says a delete's tasks are ungrouped when only the group itself is left", () => {
    const words = partlyGroupChange("delete", new PartlyChanged(3, 0, null, null));
    expect(words).toContain("3 tasks are now ungrouped");
    expect(words).toContain("the group itself wasn’t deleted");
  });

  it("says one task in the singular", () => {
    expect(partlyGroupChange("delete", new PartlyChanged(0, 1, null, null))).toContain("0 of 1 task ");
  });
});

describe("a company deleted part way (N13)", () => {
  it("says how many tasks became internal work and that the company is still there", () => {
    const words = partlyDeleteWording("Pelita Foods", 450, 50);
    expect(words).toContain("450 of 500 tasks of Pelita Foods became internal work");
    expect(words).toContain("the other 50");
    expect(words).toContain("Pelita Foods wasn’t deleted");
  });
});

describe("the offline banner per screen (D-014)", () => {
  const at = "at 09:12";
  it("says changes can't be saved on most screens", () => {
    for (const path of ["/", "/tasks", "/tasks/groups/g1", "/plan", "/companies", "/past"]) {
      expect(offlineBannerWords(path, at)).toBe("You are seeing what was loaded at 09:12. Changes can't be saved until you are back online.");
    }
  });
  it("says qualification notes keep writing on the device", () => {
    for (const path of ["/notes", "/notes/abc"]) {
      const words = offlineBannerWords(path, at);
      expect(words).toContain("kept on this device");
      expect(words).not.toContain("Changes can't be saved");
    }
  });
  it("says flows can be read but not edited", () => {
    expect(offlineBannerWords("/flows/f1", at)).toContain("Flows can be read but not edited");
  });
  it("says nothing has loaded when nothing has", () => {
    expect(offlineBannerWords("/notes", null)).toBe("Nothing has loaded yet. Everything will appear once you are back online.");
  });
});

describe("what else a search finds (N3)", () => {
  const company = (id: number, name: string) => ({ id, company: name, status: "Active" }) as PipelineEntry;
  const notes = (id: string, name: string, remarks = ""): ProspectJournalEntry => ({ ...createEmptyProspectJournalEntry(id), prospectName: name, detailedRemarks: remarks });

  it("counts the companies and the notes that mention the words", () => {
    const found = alsoFound("pelita", [company(1, "Pelita Foods"), company(2, "Tirta Water")], [notes("n1", "Pelita Foods"), notes("n2", "Other", "met pelita staff"), notes("n3", "Nobody")]);
    expect(found).toEqual({ companies: 1, notes: 2 });
  });
  it("says nothing when neither mentions them, or the search is empty", () => {
    expect(alsoFound("zzz", [company(1, "Pelita Foods")], [notes("n1", "Pelita Foods")])).toBeNull();
    expect(alsoFound("  ", [company(1, "Pelita Foods")], [])).toBeNull();
  });
});
