// The launch data step (task 4.8): the old browser settings turned into the shared record, the sector backfill, and a
// round trip of import and restore against the emulator.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { terminate } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { clientsDb } from "@/lib/firebaseClients";
import { DEFAULT_COMPANY_SETTINGS, readCompanySettings } from "@/lib/companySettings";
import { droppedByImport, sectorBackfill, settingsFromOldDevice, valuesWithoutOption, type OldDeviceExport } from "@/scripts/launch/launchData";
import { doc, setDoc, updateDoc } from "firebase/firestore";
import { backfillFor, readBackup, restore, restorePlan, seedCopy, stable, writeSectors, writeSettings, type Backup } from "@/scripts/launch/launchWrites";
import { clearAll, readFields } from "../support/emulator";

const none: OldDeviceExport = { options: null, columns: null };
const col = (key: string, label: string, extra: Record<string, unknown> = {}) => ({ key, label, type: "text", visible: true, custom: false, ...extra });

describe("settings from the old device", () => {
  it("keeps the new design's defaults when that browser kept nothing", () => {
    const { settings, warnings } = settingsFromOldDevice(none);
    expect(settings).toEqual(readCompanySettings(DEFAULT_COMPANY_SETTINGS));
    expect(warnings).toEqual([]);
  });

  it("keeps the design's colours for options still on their old colour, and maps picked ones", () => {
    const { settings } = settingsFromOldDevice({
      ...none,
      options: {
        status: [
          { label: "To Follow Up", bg: "#EFF6FF", color: "" }, // old default: design's amber
          { label: "Meeting Soon", bg: "#FFE4F0", color: "" }, // picked: nearest is pink
          { label: " Proposal Sent ", bg: "#E0F2FE", color: "" },
          { label: "proposal sent", bg: "#000000", color: "" }, // same name again: dropped
          { label: "", bg: "#FFFFFF", color: "" },
        ],
      },
    });
    const status = settings.options.status;
    expect(status.find((o) => o.name === "To Follow Up")).toMatchObject({ colour: "amber", role: "followUp" });
    expect(status.find((o) => o.name === "Meeting Soon")?.colour).toBe("pink");
    expect(status.filter((o) => o.name.toLowerCase() === "proposal sent")).toEqual([{ name: "Proposal Sent", colour: "sky" }]);
    // Deal done wasn't in that list, so it comes back locked, first.
    expect(status[0]).toMatchObject({ name: "Client / Partner Done Deal", role: "dealDone" });
    expect(settings.options.answer).toEqual(DEFAULT_COMPANY_SETTINGS.options.answer.map((o) => expect.objectContaining(o)));
  });

  it("warns when a locked option's name isn't among that browser's options", () => {
    const { warnings } = settingsFromOldDevice({ ...none, options: { status: [{ label: "Follow up", bg: "#EFF6FF", color: "" }] } });
    expect(warnings.join("\n")).toContain('"To Follow Up" isn\'t among');
  });

  it("carries renamed and hidden columns over, and adds own columns as own fields", () => {
    const { settings } = settingsFromOldDevice({
      options: { cx_1: [{ label: "Yes", bg: "#ECFDF5", color: "" }], cx_9: [{ label: "Orphan", bg: "#ECFDF5", color: "" }] },
      columns: {
        main: [
          col("product", "Products offered"),
          col("pic", "PIC", { visible: false }),
          col("notes", "Next Actions"), // never renamed: the design's label stays
          col("since", "Since", { type: "computed" }),
          col("cx_1", "Signed NDA", { type: "dropdown", custom: true }),
          col("cx_2", "Status", { type: "textarea", custom: true, visible: false }), // name taken
        ],
        raw: [col("notes", "Remarks"), col("sourcing", "Sourcing", { visible: false })],
      },
    });
    const active = settings.fields.active;
    expect(active.find((f) => f.key === "product")?.label).toBe("Products offered");
    expect(active.find((f) => f.key === "notes")?.label).toBe("Next actions");
    expect(active.find((f) => f.key === "pic")?.shown).toBe(false);
    expect(active.slice(-2)).toEqual([
      { key: "cx_1", label: "Signed NDA", type: "choice", shown: true, own: true },
      { key: "cx_2", label: "Status 2", type: "long", shown: false, own: true },
    ]);
    expect(settings.fields.dealDone.some((f) => f.key === "cx_1")).toBe(true);
    expect(settings.fields.noOrNotNow).toEqual(DEFAULT_COMPANY_SETTINGS.fields.noOrNotNow);
    expect(settings.fields.toApproach.find((f) => f.key === "notes")?.label).toBe("Remarks");
    expect(settings.fields.toApproach.find((f) => f.key === "sourcing")?.shown).toBe(false);
    expect(settings.options.cx_1).toEqual([{ name: "Yes", colour: "green" }]);
    expect(settings.options.cx_9).toBeUndefined();
  });

  it("reports what the import replaces and the values no option has", () => {
    const { settings } = settingsFromOldDevice(none);
    const stored = readCompanySettings({ options: { status: [{ name: "Tried", colour: "pink" }] } });
    expect(droppedByImport(stored, settings)).toEqual(['status: option "Tried"']);
    expect(droppedByImport(null, settings)).toEqual([]);
    expect(valuesWithoutOption([{ status: "Old one" }, { status: "Old one" }, { status: "To Follow Up" }], settings)).toEqual([
      'status: "Old one" on 2 companies has no option',
    ]);
  });
});

describe("sector backfill", () => {
  it("gives subsidiaries with no sector their parent's, cleaned", () => {
    const list = sectorBackfill([
      { id: "p", parentId: null, sector: "  Retail  banking " },
      { id: "a", parentId: "p", sector: null },
      { id: "b", parentId: "p", sector: " " },
      { id: "c", parentId: "p" },
      { id: "d", parentId: "p", sector: "Insurance" }, // has its own
      { id: "q", parentId: null, sector: null },
      { id: "e", parentId: "q", sector: null }, // parent has none
      { id: "f", parentId: "gone", sector: null }, // parent is gone
    ]);
    expect(list).toEqual(["a", "b", "c"].map((id) => ({ id, sector: "Retail banking" })));
  });
});

describe("import and restore on the emulator", () => {
  const copy: Backup = {
    settings: [
      { id: "companies", data: { options: { status: [{ name: "Tried", colour: "pink" }] } } }, // in id order, as read back
      { id: "companyIds", data: { next: 7 } },
    ],
    historicalClients: [
      { id: "p", data: { name: "Parent", parentId: null, sector: "Banking", countHead: true, createdAt: 1 } },
      { id: "s", data: { name: "Sub", parentId: "p", sector: null, countHead: true, createdAt: 2 } },
    ],
    pipeline: [{ id: "1", data: { id: 1, company: "Kept" } }],
  };

  beforeEach(async () => {
    await clearAll();
  });

  afterAll(async () => {
    await Promise.all([terminate(db), terminate(clientsDb)]);
  });

  it("writes the settings and sectors, and the backup puts both back", async () => {
    await seedCopy(copy);
    const before = await readBackup();
    expect(stable(before)).toBe(stable(copy));

    const { settings } = settingsFromOldDevice(none);
    await writeSettings(settings);
    expect(await writeSectors(backfillFor(before))).toBe(1);
    expect(readCompanySettings(await readFields("tasks", "settings/companies"))).toEqual(settings);
    expect((await readFields("clients", "historicalClients/s"))?.sector).toBe("Banking");
    expect(backfillFor(await readBackup())).toEqual([]);

    expect(await restore(before)).toEqual({ settings: true, sectors: 1 });
    expect(stable(await readBackup())).toBe(stable(copy));
    expect(await restorePlan(before)).toMatchObject({ settingsChanged: false, sectors: [] });
  });

  it("with the import's record, undoes only what the import changed and nobody changed since", async () => {
    const twoSubs: Backup = {
      ...copy,
      historicalClients: [
        ...copy.historicalClients,
        { id: "t", data: { name: "Sub 2", parentId: "p", countHead: true, createdAt: 3 } }, // no sector field at all
        { id: "u", data: { name: "Sub 3", parentId: "p", sector: null, countHead: true, createdAt: 4 } },
      ],
    };
    await seedCopy(twoSubs);
    const before = await readBackup();
    const { settings } = settingsFromOldDevice(none);
    const sectors = backfillFor(before);
    const record = { settings: JSON.parse(JSON.stringify(settings)), sectors };
    await writeSettings(settings);
    expect(await writeSectors(sectors)).toBe(3);

    // After launch, someone corrects one filled sector: the undo leaves it.
    await updateDoc(doc(clientsDb, "historicalClients", "u"), { sector: "Insurance" });
    const plan = await restorePlan(before, record);
    expect(plan.sectors.map((x) => x.id).sort()).toEqual(["s", "t"]);
    expect(plan.sectorsChangedSince).toBe(1);
    expect(await restore(before, record)).toEqual({ settings: true, sectors: 2 });
    expect((await readFields("clients", "historicalClients/s"))?.sector).toBeNull();
    expect(await readFields("clients", "historicalClients/t")).not.toHaveProperty("sector"); // removed, as it was
    expect((await readFields("clients", "historicalClients/u"))?.sector).toBe("Insurance");

    // Settings changed after the import stay as they are.
    await writeSettings(settings);
    await setDoc(doc(db, "settings", "companies"), { ...record.settings, extra: 1 });
    expect(await restorePlan(before, record)).toMatchObject({ settingsChanged: false, settingsChangedSince: true });
  });

  it("removes the settings record on restore when there was none", async () => {
    await seedCopy({ ...copy, settings: [] });
    const before = await readBackup();
    await writeSettings(settingsFromOldDevice(none).settings);
    await restore(before);
    expect(await readFields("tasks", "settings/companies")).toBeNull();
  });
});
