import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import type { Page } from "@playwright/test";
import type { previewCompanyChanges, CompanyChangesSaved, listCompanies } from "../../lib/companyChatServer";
import { auditLayout } from "../../scripts/compare/layout.mjs";
import { EMULATOR_HOST, readFields, seed } from "../support/emulator";
import { company, isoDay, seedCompanies, seedTasks, stored, task } from "./data";
import { test as base, expect } from "./fixtures";

const test = base.extend<{ connector: Client }>({
  connector: async ({ baseURL }, use) => {
    expect(baseURL).toBe("http://localhost:3100");
    expect(EMULATOR_HOST).toBe("127.0.0.1:8180");
    const client = new Client({ name: "chat-companies-e1", version: "1.0.0" });
    try {
      await client.connect(new StreamableHTTPClientTransport(new URL("/api/mcp/mcp-smoke-emulator-only", baseURL)));
      await use(client);
    } finally {
      await client.close();
    }
  },
});

const maya = "Maya Chen";
const budi = "Budi Santoso";
const groups = ["To approach", "Active", "No or not now", "Active clients and partners"] as const;
const slugs = ["to-approach", "active", "no-or-not-now"];
const newNames = ["Aster Solar", "Birch Logistics", "Cedar Ceramics"];
const initialNames = [["Moss Labs"], ["Kelana Foods", "Maple Markets"], ["Rimba Textiles"], ["Harbor Systems"]];
const mayaNames = [[newNames[0]], [newNames[1], ...initialNames[1]], initialNames[2], initialNames[3]];
const row = (page: Page, name: string) => page.getByRole("article", { name, exact: true });
const picCell = (page: Page, name: string, pic: string) => row(page, name).getByRole("button", { name: `PIC: ${pic}. Change`, exact: true });
const toolbar = (page: Page) => page.getByRole("toolbar", { name: "Filter, sort and export" });
const pipeline = () => stored("clients", "pipeline");

async function toolReply(client: Client, name: string, args: Record<string, unknown>) {
  const result = CallToolResultSchema.parse(await client.callTool({ name, arguments: args }));
  const content = result.content.find((part) => part.type === "text");
  if (!content) throw new Error(`${name} returned no text result.`);
  return { result, text: content.text };
}

async function call<T>(client: Client, name: string, args: Record<string, unknown>): Promise<T> {
  const { result, text } = await toolReply(client, name, args);
  expect(result.isError, text).not.toBe(true);
  return JSON.parse(text) as T;
}

const list = (client: Client, filters: Partial<Parameters<typeof listCompanies>[0]>) =>
  call<Awaited<ReturnType<typeof listCompanies>>>(client, "list_companies", filters);
const preview = (client: Client, changes: Record<string, unknown>) =>
  call<Awaited<ReturnType<typeof previewCompanyChanges>>>(client, "preview_company_changes", changes);
const apply = (client: Client, changes: Record<string, unknown>) =>
  call<CompanyChangesSaved>(client, "apply_company_changes", changes);

async function pickGroup(page: Page, group: string) {
  const tile = page.getByRole("group", { name: "Groups of companies" }).getByRole("button", { name: new RegExp(`^${group}\\s*\\d`) });
  await tile.click();
  await expect(tile).toHaveAttribute("aria-pressed", "true");
}

async function expectRows(page: Page, names: string[]) {
  await expect(page.getByRole("article")).toHaveCount(names.length);
  for (const name of names) await expect(row(page, name)).toBeVisible();
}

test("E1: confirmed chat saves appear in Prospects and a stale chat cannot overwrite an app edit", { tag: "@phone" }, async ({ connector, page, isMobile }, testInfo) => {
  test.setTimeout(120_000);
  const outreach = isoDay(5);
  const add = [
    { company: newNames[0], group: "To approach", teamPic: "  maya chen  ", industry: "Renewable energy", reach: outreach },
    { company: newNames[1], group: "Active", teamPic: maya, status: "To Follow Up", priority: "High", pic: "Dewi", product: "Fleet tracking" },
    { company: newNames[2], group: "No or not now", product: "Ceramic tiles" },
  ];
  await seedTasks([task("team", { responsible: [maya, budi] })]);
  await seedCompanies([
    company(1, { company: initialNames[0][0], _raw: true, teamPic: budi }),
    company(2, { company: initialNames[1][0], teamPic: budi }),
    company(3, { company: initialNames[1][1] }),
    company(4, { company: initialNames[2][0], _hold: true, answer: "Not now" }),
    company(5, { company: initialNames[3][0], status: "Client / Partner Done Deal", teamPic: budi }),
  ]);
  // The client PIC column is optional. Show it in this fixture so its filter can be exercised too.
  await seed("tasks", "settings", [{ id: "companies", fields: { dealDone: [{ key: "teamPic", label: "PIC", type: "person", shown: true }] } }]);

  const saved = await test.step("choose companies from the connector list, preview, confirm and resend the adds", async () => {
    const before = await pipeline();
    const targets: number[] = [];
    for (const [index, group] of groups.entries()) {
      const listing = await list(connector, { group });
      expect(listing.companies.map((entry) => entry.company)).toEqual(initialNames[index]);
      if (group !== "To approach") targets.push(...listing.companies.map((entry) => entry.id));
    }
    expect(targets).toEqual([2, 3, 4, 5]);
    const changes = { add, setPic: [{ pic: maya, companyIds: targets }] };
    const proposed = await preview(connector, changes);
    expect(proposed.errors).toEqual([]);
    expect(proposed.preview?.add.map(({ group, data }) => [group, data.company])).toEqual(newNames.map((name, i) => [groups[i], name]));
    expect(proposed.preview?.seenPics).toEqual({ 2: budi, 3: null, 4: null, 5: budi });
    expect(proposed.preview?.setPic.map(({ id, after }) => [id, after])).toEqual(targets.map((id) => [id, maya]));
    expect(await pipeline(), "preview must not write").toEqual(before);

    const confirmed = await apply(connector, { ...changes, seenPics: proposed.preview?.seenPics });
    expect(confirmed.alreadyExists).toEqual([]);
    expect(confirmed.notAdded).toEqual([]);
    expect(confirmed.added.map(({ group, company }) => [group, company])).toEqual(newNames.map((name, i) => [groups[i], name]));
    expect(confirmed.pics).toEqual({ status: "saved", changes: proposed.preview?.setPic });
    const after = await pipeline();
    expect(after.filter(({ id }) => before.some((doc) => doc.id === id))).toEqual(before.map((doc) =>
      targets.includes(Number(doc.id)) ? { ...doc, teamPic: maya } : doc));

    const replay = await apply(connector, { add });
    expect(replay).toEqual({ added: [], notAdded: [], pics: { status: "none" }, alreadyExists: confirmed.added.map((entry) => ({ ...entry, requestedCompany: entry.company })) });
    expect(await pipeline(), "replaying the adds must leave the pipeline intact").toEqual(after);
    return confirmed;
  });

  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") browserErrors.push(message.text()); });

  await test.step("open Prospects, check each visible value and filter, and capture the saved rows", async () => {
    // Load the ordinary page, then reload a group deep link before the smaller captures.
    await page.goto("/companies");
    await expect(page.getByRole("heading", { name: "Prospects" })).toBeVisible();
    await expect(row(page, newNames[1])).toBeVisible();
    await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
    for (const [index, group] of groups.entries()) {
      await pickGroup(page, group);
      await expectRows(page, index < newNames.length ? [newNames[index], ...initialNames[index]] : initialNames[index]);
      for (const name of mayaNames[index]) await expect(picCell(page, name, maya)).toBeVisible();
      if (index === 0) await expect(row(page, newNames[index]).getByRole("button", { name: /^Industry: Renewable energy\./ })).toBeVisible();
      if (index === 1) {
        await expect(row(page, newNames[index]).getByRole("button", { name: /^Status: To Follow Up\./ })).toBeVisible();
        await expect(row(page, newNames[index]).getByRole("button", { name: /^Products: Fleet tracking\./ })).toBeVisible();
      }
      if (index === 2) {
        if (!isMobile) await expect(picCell(page, newNames[index], "empty")).toBeVisible();
        await expect(row(page, newNames[index]).getByRole("button", { name: /^Answer: Not now\./ })).toBeVisible();
        await expect(row(page, newNames[index]).getByRole("button", { name: /^Products: Ceramic tiles\./ })).toBeVisible();
      }
      if (index < slugs.length) await capture(slugs[index]);
      await toolbar(page).getByRole("button", { name: "PIC", exact: true }).click();
      await page.getByRole("menuitemradio", { name: `${maya} (${mayaNames[index].length})`, exact: true }).click();
      await expectRows(page, mayaNames[index]);
      await toolbar(page).getByRole("button", { name: "Clear the pic filter" }).click();
      expect((await list(connector, { group, pic: "maya CHEN" })).companies.map((entry) => entry.company)).toEqual(mayaNames[index]);
    }
    expect((await list(connector, { group: "No or not now", pic: null, query: "cedar" })).companies).toMatchObject([{ company: newNames[2], pic: null }]);

    await page.setViewportSize(isMobile ? { width: 320, height: 740 } : { width: 1280, height: 900 });
    await page.goto("/companies?group=to-approach");
    await page.reload();
    await expect(picCell(page, newNames[0], maya)).toBeVisible();
    await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
    for (const [index, slug] of slugs.entries()) {
      await pickGroup(page, groups[index]);
      await expect(row(page, newNames[index])).toBeVisible();
      await capture(slug);
    }

    async function capture(slug: string) {
      const width = page.viewportSize()?.width;
      expect((await auditLayout(page)).errors, `${slug} at ${width}px`).toEqual([]);
      expect(await page.getByRole("searchbox", { name: "Search companies" }).evaluate((input: HTMLInputElement) => {
        const style = getComputedStyle(input);
        const placeholder = getComputedStyle(input, "::placeholder");
        const canvas = document.createElement("canvas").getContext("2d")!;
        canvas.font = `${placeholder.fontWeight} ${placeholder.fontSize} ${placeholder.fontFamily}`;
        const available = input.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
        return canvas.measureText(input.placeholder).width <= available;
      }), "the search hint should fit").toBe(true);
      // On a phone, scroll the rows above the fixed tab bar in the actual viewport.
      if (isMobile) await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      const firstPic = page.getByRole("article").getByRole("button", { name: `PIC: ${maya}. Change`, exact: true }).first();
      await expect(firstPic).toBeInViewport();
      expect(await firstPic.evaluate((el) => {
        const box = el.getBoundingClientRect();
        return el.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
      }), "first row PIC should be reachable at its centre").toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`${slug}-${width}.png`), animations: "disabled" });
      await page.evaluate(() => window.scrollTo(0, 0));
    }
  });

  await test.step("compare each chat document with one saved through New company", async () => {
    for (const [index, entry] of add.entries()) {
      const name = `${entry.company} Sheet`;
      await page.getByRole("link", { name: "New company" }).first().click();
      const sheet = page.getByRole("dialog", { name: "New company" });
      await sheet.getByRole("textbox", { name: "Company name" }).fill(name);
      const groupOption = entry.group === "Active" ? /^Active Prospects/ : new RegExp(`^${entry.group}`);
      await sheet.getByRole("radio", { name: groupOption }).click();
      if (entry.teamPic) await sheet.getByRole("combobox", { name: /^PIC/ }).selectOption(maya);
      if (entry.reach) await sheet.getByLabel(/^Planned outreach/).fill(entry.reach);
      if (entry.industry) await sheet.getByRole("textbox", { name: /^Industry/ }).fill(entry.industry);
      if (entry.pic) await sheet.getByRole("textbox", { name: /^Contact person/ }).fill(entry.pic);
      if (entry.product) await sheet.getByRole("textbox", { name: /^Products/ }).fill(entry.product);
      if (entry.status) await sheet.getByRole("combobox", { name: /^Status/ }).selectOption(entry.status);
      if (entry.priority) await sheet.getByRole("combobox", { name: /^Priority/ }).selectOption(entry.priority);
      if (entry.group === "No or not now") await sheet.getByRole("combobox", { name: /^Answer/ }).selectOption("Not now");
      await sheet.getByRole("button", { name: "Add company" }).click();
      await expect(page.getByRole("status").getByText(`${name} added to ${groups[index]}`, { exact: true })).toBeVisible();
      const sheetId = (await pipeline()).find(({ company }) => company === name)?.id;
      expect(sheetId).toBeDefined();
      const sheetDoc = await readFields("clients", `pipeline/${sheetId}`);
      const chatId = saved.added[index].id;
      expect(sheetDoc).toMatchObject({ id: Number(sheetId), company: name });
      expect(await readFields("clients", `pipeline/${chatId}`)).toEqual({ ...sheetDoc, id: chatId, company: entry.company });
    }
  });

  await test.step("edit one PIC in the app, then refuse the entire stale chat request", async () => {
    await pickGroup(page, "Active");
    const changes = { setPic: [{ pic: null, companyIds: [2, 3] }] };
    const proposed = await preview(connector, changes);
    expect(proposed.errors).toEqual([]);
    expect(proposed.preview?.seenPics).toEqual({ 2: maya, 3: maya });

    const [edited, untouched] = initialNames[1];
    await picCell(page, edited, maya).click();
    await page.getByRole("menu", { name: "PIC", exact: true }).getByRole("menuitemradio", { name: budi }).click();
    await expect(page.getByRole("status").getByText("PIC updated", { exact: true })).toBeVisible();
    await expect.poll(() => readFields("clients", "pipeline/2")).toMatchObject({ teamPic: budi });
    const before = await pipeline();
    const stale = await toolReply(connector, "apply_company_changes", { ...changes, seenPics: proposed.preview?.seenPics });
    expect(stale.result.isError).toBe(true);
    expect(stale.text).toContain(`PIC changed since the preview for ${edited} (company 2). Preview again.`);
    expect(await pipeline()).toEqual(before);
    await page.reload();
    await expect(picCell(page, edited, budi)).toBeVisible();
    await expect(picCell(page, untouched, maya)).toBeVisible();
  });
  expect(browserErrors).toEqual([]);
});
