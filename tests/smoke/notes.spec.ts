// Qualification notes (the 1.3 job stories, on the new UI since 4.3): long remarks are written and saved line for line.
// The other 1.3 stories are guarded in notes-screen.spec: notes started from a company, writing that saves on leaving and
// stays after a reload, how likely, notes for someone not tracked yet, search, delete, and writing with no connection.
import { test, expect } from "./fixtures";
import { storedById } from "./data";
import { seed } from "../support/emulator";

test("U3: long remarks are written under Remarks and saved as written", async ({ page }) => {
  await seed("clients", "prospectJournal", [{ id: "n1", prospectName: "Pelita Foods", clientNeed: "", detailedRemarks: "", updatedAt: 1 }], { keepIdField: true });
  await page.goto("/notes/n1");
  const remarks = page.getByRole("textbox", { name: "Remarks", exact: true });
  await remarks.fill("Met the COO twice.\nThey want a pilot in two depots.");
  await page.getByRole("textbox", { name: "Client need", exact: true }).focus();
  await expect
    .poll(async () => (await storedById("clients", "prospectJournal", "n1"))?.detailedRemarks)
    .toBe("Met the COO twice.\nThey want a pilot in two depots.");
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Remarks", exact: true })).toHaveValue("Met the COO twice.\nThey want a pilot in two depots.");
});
