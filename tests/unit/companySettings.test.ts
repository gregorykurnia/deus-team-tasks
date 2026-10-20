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
  fieldNameTaken,
  nearestOptionColour,
  readCompanySettings,
  recolourOption,
  removeOption,
  removedFieldsWithValues,
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

  it("finishes the companies when a rename or removal is run again after they failed to follow", async () => {
    const companies = [co(1, { status: "Meeting Soon" }), co(2, { type: "Partner" })];
    await seed("clients", "pipeline", companies, { keepIdField: true });
    await renameOption("status", "Meeting Soon", "Meeting booked", []); // the companies didn't follow
    await removeOption("type", "Partner", []);
    expect(await renameOption("status", "Meeting Soon", "Meeting booked", companies)).toBe(1);
    expect(await removeOption("type", "Partner", companies)).toBe(1);
    expect(await readFields("clients", "pipeline/1")).toMatchObject({ status: "Meeting booked" });
    expect(await readFields("clients", "pipeline/2")).not.toHaveProperty("type");
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

  it("keeps High, Not now and No: Where to act, follow-up tasks and the No or not now group depend on them (R1)", async () => {
    const s = readCompanySettings({ options: { priority: [{ name: "Medium", colour: "amber" }], answer: [] } });
    expect(s.options.priority.map((o) => [o.name, o.role ?? null])).toEqual([
      ["High", "highPriority"],
      ["Medium", null],
    ]);
    expect(s.options.answer.map((o) => [o.name, o.role])).toEqual([
      ["No", "no"],
      ["Not now", "notNow"],
    ]);
    const companies = [co(1, { priority: "High", answer: "Not now" })];
    await seed("clients", "pipeline", companies, { keepIdField: true });
    await expect(renameOption("priority", "High", "Urgent", companies)).rejects.toMatchObject({ problem: "locked" });
    await expect(removeOption("answer", "Not now", companies)).rejects.toMatchObject({ problem: "locked" });
    await expect(removeOption("answer", "No", companies)).rejects.toMatchObject({ problem: "locked" });
    expect(await readFields("clients", "pipeline/1")).toMatchObject({ priority: "High", answer: "Not now" });
    await recolourOption("priority", "High", "pink");
    expect((await storedSettings()).options.priority[0]).toEqual({ name: "High", colour: "pink", role: "highPriority" });
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

  it("refuses a field name the group already has, ignoring case, and Company name", async () => {
    expect(fieldNameTaken(DEFAULT_COMPANY_SETTINGS.fields.active, " status ")).toBe(true);
    expect(fieldNameTaken(DEFAULT_COMPANY_SETTINGS.fields.active, "Company Name")).toBe(true);
    expect(fieldNameTaken(DEFAULT_COMPANY_SETTINGS.fields.active, "Status", "status")).toBe(false);
    expect(fieldNameTaken(DEFAULT_COMPANY_SETTINGS.fields.toApproach, "Status")).toBe(false);
    await expect(renameField("active", "pic", "priority")).rejects.toMatchObject({ problem: "taken" });
    await expect(renameField("active", "pic", " ")).rejects.toMatchObject({ problem: "missing" });
    await expect(addOwnField("active", "Next Actions", "text")).rejects.toMatchObject({ problem: "taken" });
    expect(await addOwnField("toApproach", "Status", "text")).toMatch(/^cx_/);
  });

  it("counts removed own fields whose values companies still hold", () => {
    const s = readCompanySettings({ fields: { active: [{ key: "cx_1", label: "Region", type: "text", shown: true, own: true }] } });
    const companies = [co(1, { cx_1: "Java", cx_2: "Gone", cx_3: "" }), co(2, { cx_2: "Also gone", cx_4: "Old" }), co(3, { status: "Drop" })];
    expect(removedFieldsWithValues(companies, s)).toBe(2); // cx_2 and cx_4; cx_1 is in use and cx_3 is empty
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
