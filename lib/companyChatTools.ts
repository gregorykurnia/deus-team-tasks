import "server-only";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { COMPANY_GROUP_LABELS } from "./companies";
import { MAX_COMPANY_ADDS, MAX_COMPANY_PIC_CHANGES } from "./companyChat";
import { applyCompanyChanges, COMPANY_LIST_PAGE_SIZE, CompanyChangesError, listCompanies, previewCompanyChanges } from "./companyChatServer";
import { isIsoDay } from "./dates";
import { runTaskEditTool, taskEditsEnabled } from "./taskEditTools";

const { toApproach, active, noOrNotNow } = COMPANY_GROUP_LABELS;
const groups = Object.values(COMPANY_GROUP_LABELS).join(", ");
const guidance = `Company groups are ${groups}. A PIC must be an existing team name. Show the exact preview, including warnings, and get the owner's explicit yes to it before applying. For more than 10 PIC changes, show the count and a compact table of company, group and PIC before → after.`;

const text = z.string().trim().min(1, "Enter non-empty text.");
const detail = z.string().optional();
const companyId = z.number().int().nonnegative().describe("The numeric ID returned by list_companies.");
const newCompany = z.object({
  company: text,
  group: z.enum([toApproach, active, noOrNotNow]).optional().describe(`Defaults to ${toApproach}.`),
  teamPic: detail.describe("The existing team name assigned as PIC."),
  pic: detail.describe("The contact person at the company."),
  industry: detail,
  sourcing: detail,
  type: detail,
  priority: detail,
  status: detail.describe(`A current status option. Only for ${active}.`),
  notes: detail,
  product: detail,
  reach: z.string().trim().refine(isIsoDay, "Enter a real yyyy-mm-dd date.").optional().describe(`Only for ${toApproach}.`),
  allowDuplicate: z.boolean().optional().describe("Use true only when the owner approved another copy of an existing company."),
}).strict().superRefine(({ group, status, reach }, ctx) => {
  if (status !== undefined && group !== active) {
    ctx.addIssue({ code: "custom", path: ["status"], message: `Only allowed for ${active} companies.` });
  }
  if (reach !== undefined && group !== undefined && group !== toApproach) {
    ctx.addIssue({ code: "custom", path: ["reach"], message: `Only allowed for companies in ${toApproach}.` });
  }
});

const picLimit = `Change up to ${MAX_COMPANY_PIC_CHANGES} company PICs per call. Please split it into smaller calls.`;
const changes = z.object({
  add: z.array(newCompany).max(MAX_COMPANY_ADDS, `Add up to ${MAX_COMPANY_ADDS} companies per call. Please split it into smaller calls.`).optional(),
  setPic: z.array(z.object({
    pic: text.nullable().describe("An existing team name, or null to clear the PIC."),
    companyIds: z.array(companyId).min(1, "List at least one company ID.").max(MAX_COMPANY_PIC_CHANGES, picLimit),
  }).strict()).max(MAX_COMPANY_PIC_CHANGES, picLimit).optional(),
}).strict();

const picIds = ({ setPic }: z.infer<typeof changes>) => setPic?.flatMap((row) => row.companyIds) ?? [];
const withinPicLimit = (input: z.infer<typeof changes>) => picIds(input).length <= MAX_COMPANY_PIC_CHANGES;
const uniquePicIds = (input: z.infer<typeof changes>) => {
  const ids = picIds(input);
  return new Set(ids).size === ids.length;
};
const seenPicId = z.string().refine((id) => /^(0|[1-9]\d*)$/.test(id) && Number.isSafeInteger(Number(id)), "Use a numeric company ID as the key.");

export const companyChatToolInputs = {
  list_companies: z.object({
    group: z.enum(["all", ...Object.values(COMPANY_GROUP_LABELS)]).optional().describe("Omit or use all to include every group."),
    pic: text.nullable().optional().describe("Match a team PIC by name or use null for companies without a PIC."),
    query: text.optional().describe("Case-insensitive text in the company name."),
    industry: text.optional().describe("Case-insensitive text in the industry."),
    offset: z.number().int().nonnegative().default(0).describe("Number of matching companies to skip."),
  }).strict().default({ offset: 0 }),
  preview_company_changes: changes.refine(withinPicLimit, picLimit).refine(uniquePicIds, "List each company ID only once in setPic."),
  apply_company_changes: changes.extend({
    seenPics: z.record(seenPicId, z.string().nullable()).optional().describe("Copy the preview's seenPics map unchanged. Required for every company in setPic."),
  }).refine(withinPicLimit, picLimit).refine(uniquePicIds, "List each company ID only once in setPic.")
    .refine((input) => picIds(input).every((id) => input.seenPics && Object.hasOwn(input.seenPics, id)),
      { path: ["seenPics"], message: "Include the PIC from the preview for every listed company." }),
};

export function isCompanyChatTool(name: unknown): name is keyof typeof companyChatToolInputs {
  return typeof name === "string" && Object.hasOwn(companyChatToolInputs, name);
}

export function registerCompanyChatTools(server: McpServer) {
  if (!taskEditsEnabled()) return;
  const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
  server.registerTool("list_companies", {
    description: `List up to ${COMPANY_LIST_PAGE_SIZE} companies per page in name then ID order. Combine the group, team PIC, name and industry filters. Each row returns the company ID, name, group, team PIC, contact person, status and industry. total counts all matching companies. When hasMore is true, advance offset by the number of rows received. ${guidance}`,
    inputSchema: companyChatToolInputs.list_companies, annotations: readOnly,
  }, (input) => runTaskEditTool(() => listCompanies(input), "Could not read companies. Try again shortly."));

  server.registerTool("preview_company_changes", {
    description: `Preview up to ${MAX_COMPANY_ADDS} new prospects and ${MAX_COMPANY_PIC_CHANGES} PIC assignments or clears. PIC changes can target any group, including clients and partners. Review the preview's new company fields, PICs before and after, and warnings. Resolve errors before applying. A preview writes nothing. ${guidance}`,
    inputSchema: companyChatToolInputs.preview_company_changes, annotations: readOnly,
  }, (input) => runTaskEditTool(() => previewCompanyChanges(input), "Could not preview company changes. Try again shortly."));

  server.registerTool("apply_company_changes", {
    description: `Save using the original add and setPic lists sent to preview_company_changes and the seenPics map returned by the preview. If a PIC changed since the preview, preview again and ask again. Report added companies, alreadyExists as already there, unconfirmed adds, and the PIC result separately. If a reply is lost or a save is unconfirmed, check the list and preview the remaining changes before saving again. An add with allowDuplicate can create another copy on every apply. ${guidance}`,
    inputSchema: companyChatToolInputs.apply_company_changes,
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  }, (input) => runTaskEditTool(() => applyCompanyChanges(input),
    "Could not confirm whether the company changes were saved. List and preview the companies before trying again.",
    (error) => error instanceof CompanyChangesError));
}
