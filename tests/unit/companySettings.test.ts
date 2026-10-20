// Shared company settings, against the Firestore emulator. The emulator runs
// firestore.rules, so these writes also show the rules allow settings/companies.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { terminate } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { clientsDb } from "@/lib/firebaseClients";
import { DEAL_DONE_STATUS, FOLLOW_UP_STATUS } from "@/lib/companies";
import {
  addOption,
  addOwnField,
  DEFAULT_COMPANY_SETTINGS,
  nearestOptionColour,
  readCompanySettings,
  recolourOption,
  removeOption,
  removeOwnField,
  renameField,
  renameOption,
  setFieldShown,
  SettingsError,
  type CompanySettings,
} from "@/lib/companySettings";
import type { PipelineEntry } from "@/lib/clientTypes";
import { clearAll, readAll, readFields, seed } from "../support/emulator";

const co = (id: number, fields: Partial<PipelineEntry> = {}): PipelineEntry => ({ id, company: `Company ${id}`, ...fields });

async function storedSettings(): Promise<CompanySettings> {
  return readCompanySettings(await readFields("tasks", "settings/companies"));
}

beforeEach(async () => {
  await clearAll();
});

afterAll(async () => {
  await Promise.all([terminate(db), terminate(clientsDb)]);
});

describe("reading (falls back to the defaults)", () => {
  it("uses the built-in defaults when nothing is stored", () => {
    const s = readCompanySettings(undefined);
    expect(s).toEqual(DEFAULT_COMPANY_SETTINGS);
    expect(s.options.status.filter((o) => o.role).map((o) => [o.name, o.role])).toEqual([
      [DEAL_DONE_STATUS, "dealDone"],
      [FOLLOW_UP_STATUS, "followUp"],
    ]);
    expect(s.fields.active.filter((f) => f.shown).map((f) => f.label)).toEqual([
      "Status",
      "Priority",
      "Last action",
      "Target date",
      "Products",
      "Next actions",
    ]);
  });

  it("keeps what's stored, brings back missing built-in fields and the locked options", () => {
    const s = readCompanySettings({
      options: { status: [{ name: "Meeting Soon", colour: "teal" }, { name: "Odd", colour: "not-a-colour", role: "dealDone" }] },
      fields: { active: [{ key: "status", label: "Stage", type: "choice", shown: false, own: false }] },
    });
    expect(s.options.status.map((o) => [o.name, o.colour, o.role ?? null])).toEqual([
      [FOLLOW_UP_STATUS, "amber", "followUp"],
      [DEAL_DONE_STATUS, "green", "dealDone"],
      ["Meeting Soon", "teal", null],
      ["Odd", "slate", null],
    ]);
    expect(s.fields.active[0]).toEqual({ key: "status", label: "Stage", type: "choice", shown: false, own: false });
    expect(s.fields.active).toHaveLength(DEFAULT_COMPANY_SETTINGS.fields.active.length);
    expect(s.options.priority).toEqual(DEFAULT_COMPANY_SETTINGS.options.priority);
  });
});

describe("options (C3)", () => {
  it("renames an option on every company using it, and says how many", async () => {
    const companies = [co(1, { status: "Meeting Soon" }), co(2, { status: "Meeting Soon" }), co(3, { status: "Drop" })];
    await seed("clients", "pipeline", companies, { keepIdField: true });
    expect(await renameOption("status", "Meeting Soon", " Meeting booked ", companies)).toBe(2);
    expect((await storedSettings()).options.status.map((o) => o.name)).toContain("Meeting booked");
    expect((await storedSettings()).options.status.map((o) => o.name)).not.toContain("Meeting Soon");
    expect((await readAll("clients", "pipeline")).map((c) => c.status)).toEqual(["Meeting booked", "Meeting booked", "Drop"]);
  });

  it("refuses a name that's missing or already used, ignoring case", async () => {
    await expect(renameOption("status", "Drop", "meeting soon", [])).rejects.toMatchObject({ problem: "taken" });
    await expect(addOption("priority", "  ", "red")).rejects.toMatchObject({ problem: "missing" });
    await expect(addOption("priority", "high", "red")).rejects.toMatchObject({ problem: "taken" });
  });

  it("removes an option and clears it from every company", async () => {
    const companies = [co(1, { type: "Partner" }), co(2, { type: "Client" })];
    await seed("clients", "pipeline", companies, { keepIdField: true });
    expect(await removeOption("type", "Partner", companies)).toBe(1);
    expect((await storedSettings()).options.type.map((o) => o.name)).toEqual(["Client", "Individual Partner"]);
    expect(await readFields("clients", "pipeline/1")).not.toHaveProperty("type");
    expect(await readFields("clients", "pipeline/2")).toMatchObject({ type: "Client" });
  });

  it("lets Deal done and Follow-up due be recoloured, but not renamed or removed", async () => {
    const companies = [co(1, { status: DEAL_DONE_STATUS })];
    await seed("clients", "pipeline", companies, { keepIdField: true });
    await expect(renameOption("status", DEAL_DONE_STATUS, "Won", companies)).rejects.toBeInstanceOf(SettingsError);
    await expect(removeOption("status", FOLLOW_UP_STATUS, companies)).rejects.toMatchObject({ problem: "locked" });
    expect(await readFields("clients", "pipeline/1")).toMatchObject({ status: DEAL_DONE_STATUS });
    await recolourOption("status", DEAL_DONE_STATUS, "teal");
    expect((await storedSettings()).options.status.find((o) => o.name === DEAL_DONE_STATUS)).toEqual({
      name: DEAL_DONE_STATUS,
      colour: "teal",
      role: "dealDone",
    });
  });

  it("adds an option with its colour", async () => {
    await addOption("type", "Reseller", "pink");
    expect((await storedSettings()).options.type.at(-1)).toEqual({ name: "Reseller", colour: "pink" });
  });
});

describe("fields per group (C1, C2)", () => {
  it("shows, hides and renames a field, for everyone", async () => {
    await setFieldShown("active", "pic", true);
    await renameField("active", "pic", "Main contact");
    expect((await storedSettings()).fields.active.find((f) => f.key === "pic")).toEqual({
      key: "pic",
      label: "Main contact",
      type: "text",
      shown: true,
      own: false,
    });
  });

  it("adds an own choice field with options, and removes only own fields", async () => {
    const key = await addOwnField("active", "Region", "choice", [
      { name: "Jakarta", colour: "blue" },
      { name: " ", colour: "red" },
    ]);
    const s = await storedSettings();
    expect(s.fields.active.at(-1)).toEqual({ key, label: "Region", type: "choice", shown: true, own: true });
    expect(s.options[key]).toEqual([{ name: "Jakarta", colour: "blue" }]);
    await expect(removeOwnField("active", "status")).rejects.toMatchObject({ problem: "notOwn" });
    await removeOwnField("active", key);
    expect((await storedSettings()).fields.active.some((f) => f.key === key)).toBe(false);
  });
});

describe("colours from the old settings", () => {
  it("picks the nearest of the nine", () => {
    expect(nearestOptionColour("#EFF6FF")).toBe("blue");
    expect(nearestOptionColour("#ECFDF5")).toBe("green");
    expect(nearestOptionColour("#FEF2F2")).toBe("red");
    expect(nearestOptionColour("#FFFBEB")).toBe("amber");
    expect(nearestOptionColour("#F5F3FF")).toBe("violet");
    expect(nearestOptionColour("#F9FAFB")).toBe("slate");
    expect(nearestOptionColour("#FDF4FF")).toBe("violet");
    expect(nearestOptionColour("#F0FDF4")).toBe("green");
    expect(nearestOptionColour("nonsense")).toBe("slate");
  });
});
