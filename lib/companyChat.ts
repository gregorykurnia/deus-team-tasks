// Pure checks for the company changes a chat proposes. Saving supplies the new company IDs.
import type { PipelineEntry } from "./clientTypes";
import { COMPANY_GROUP_LABELS, COMPANY_GROUPS, companyGroup, DEAL_DONE_STATUS, NOT_NOW_ANSWER, TEAM_PIC, type CompanyGroup } from "./companies";
import { MEETING_SOON, moveChoices, newCompanyData, newCompanyFields, type CompanyPatch, type NewCompanyData } from "./companyEdit";
import { companyNameKey, matchingCompanies } from "./companySearch";
import type { CompanySettings } from "./companySettingsModel";
import { isIsoDay } from "./dates";
import { rolesIn } from "./flows";
import { namesInUse } from "./people";
import { closestNames, personNameKey } from "./peopleInput";
import type { Flow, Task } from "./types";

export const MAX_COMPANY_ADDS = 50;
export const MAX_COMPANY_PIC_CHANGES = 200;

const ADD_GROUPS = COMPANY_GROUPS.filter((group) => group !== "dealDone");
const CHOICE_FIELDS = ["type", "priority", "status"] as const;
const DETAIL_FIELDS = [TEAM_PIC, "pic", "industry", "sourcing", "notes", "product", "reach", ...CHOICE_FIELDS] as const;
const ADD_FIELDS = ["company", "group", "allowDuplicate", ...DETAIL_FIELDS];

export interface CompanyChangesContext {
  companies: readonly PipelineEntry[];
  tasks: readonly Pick<Task, "responsible" | "informed">[];
  flows: readonly Flow[];
  settings: CompanySettings;
  today: string;
}

interface CompanyMatch {
  id: number;
  company: string;
  group: string;
}

export interface CompanyPicChange extends CompanyMatch {
  before: string | null;
  after: string | null;
  unchanged: boolean;
}

export interface CompanyChangesPreview {
  add: { group: string; data: NewCompanyData }[];
  setPic: CompanyPicChange[];
  seenPics: Record<number, string | null>;
  warnings: { company: string; matches: CompanyMatch[] }[];
  alreadyExists: (CompanyMatch & { requestedCompany: string })[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));

function checkKeys(value: Record<string, unknown>, keys: readonly string[], path: string, errors: string[]) {
  for (const key of Object.keys(value)) {
    if (!keys.includes(key)) errors.push(`${path} has an unknown field "${key}".`);
  }
}

function readList(value: unknown, path: string, errors: string[]): unknown[] {
  if (Array.isArray(value)) return value;
  if (value !== undefined) errors.push(`${path} must be a list.`);
  return [];
}

function describeCompany(company: PipelineEntry): CompanyMatch {
  return { id: company.id, company: company.company, group: COMPANY_GROUP_LABELS[companyGroup(company)] };
}

export function companyPic(company: PipelineEntry): string | null {
  const pic = company[TEAM_PIC];
  return typeof pic === "string" && pic.trim() ? pic : null;
}

function teamNames(context: CompanyChangesContext): Map<string, string> {
  const names = new Map<string, string>();
  // If a flow and a task use different spellings of the same name, keep the task's spelling.
  for (const name of [...namesInUse([...context.tasks]), ...namesInUse([], [], rolesIn([...context.flows]))]) {
    const key = personNameKey(name);
    if (key !== "full team" && !names.has(key)) names.set(key, name.trim());
  }
  return names;
}

function resolvePic(value: string, names: ReadonlyMap<string, string>, path: string, errors: string[]): string | undefined {
  const pic = names.get(personNameKey(value));
  if (pic !== undefined) return pic;
  const closest = closestNames(value, names.values());
  const suggested = closest.length ? ` Closest team names are ${closest.join(", ")}.` : "";
  errors.push(`${path} "${value}" is an unknown team name.${suggested}`);
}

function additionValues(raw: Record<string, unknown>, group: CompanyGroup, path: string, errors: string[]): CompanyPatch {
  const values: CompanyPatch = {};
  for (const key of DETAIL_FIELDS) {
    const value = raw[key];
    if (typeof value === "string") values[key] = value.trim();
    else if (value !== undefined) errors.push(`${path}.${key} must be text.`);
  }

  if (raw.status !== undefined && group !== "active") errors.push(`${path}.status is only allowed for Active companies.`);
  if (raw.reach !== undefined) {
    if (group !== "toApproach") errors.push(`${path}.reach is only allowed for companies in To approach.`);
    else if (!isIsoDay(values.reach)) errors.push(`${path}.reach must be a calendar date in yyyy-mm-dd format.`);
  }
  return values;
}

function additionData(company: string, group: CompanyGroup, values: CompanyPatch, context: CompanyChangesContext,
  names: ReadonlyMap<string, string>, path: string, errors: string[]): NewCompanyData {
  if (group === "active" && values.status === undefined) {
    values.status = MEETING_SOON;
    values.date = context.today;
  }
  if (group === "noOrNotNow") values.answer = NOT_NOW_ANSWER;

  for (const key of CHOICE_FIELDS) {
    const value = values[key];
    if (typeof value !== "string") continue;
    const options = moveChoices(context.settings, key).map((option) => option.name.trim()).filter(
      (name) => key !== "status" || name !== DEAL_DONE_STATUS,
    );
    if (!options.includes(value)) {
      errors.push(`${path}.${key} "${value}" is unknown. ${options.length ? `Choose from ${options.join(", ")}.` : "There are no available options."}`);
    }
  }
  const pic = values[TEAM_PIC];
  if (typeof pic === "string" && pic) values[TEAM_PIC] = resolvePic(pic, names, `${path}.${TEAM_PIC}`, errors);

  // The chat accepts details even when a column is hidden or shown only in another group.
  const sheetFields = newCompanyFields(context.settings, group);
  const otherFields = [...context.settings.fields[group], ...Object.values(context.settings.fields).flat()];
  const fields = Object.keys(values).map((key) => sheetFields.find((field) => field.key === key)
    ?? otherFields.find((field) => field.key === key) ?? { key, type: "text" as const });
  return newCompanyData(company, group, fields, values);
}

type PicAtPreview = Pick<CompanyPicChange, "id" | "company" | "before">;

// The same comparison can be run on the PICs read inside the save transaction.
export function checkSeenPics(seenPics: unknown, companies: readonly PicAtPreview[]): string[] {
  if (seenPics !== undefined && !isRecord(seenPics)) return ["seenPics must be an object keyed by company ID."];
  const errors: string[] = [];
  for (const { id, company, before } of companies) {
    if (!seenPics || !Object.hasOwn(seenPics, id)) {
      errors.push(`seenPics is missing company ${id} (${company}). Include its PIC from the preview.`);
    } else {
      const seen = seenPics[id];
      if (seen !== null && typeof seen !== "string") errors.push(`seenPics for company ${id} must be a name or null.`);
      else if (seen !== before) errors.push(`PIC changed since the preview for ${company} (company ${id}). Preview again.`);
    }
  }
  return errors;
}

export function buildCompanyChanges(input: unknown, context: CompanyChangesContext, mode: "preview" | "apply" = "preview"): {
  preview: CompanyChangesPreview | null;
  errors: string[];
} {
  if (!isRecord(input)) return { preview: null, errors: ["Company changes must be an object."] };
  const errors: string[] = [];
  checkKeys(input, mode === "apply" ? ["add", "setPic", "seenPics"] : ["add", "setPic"], "Company changes", errors);
  const additions = readList(input.add, "add", errors);
  const picEdits = readList(input.setPic, "setPic", errors);
  if (additions.length > MAX_COMPANY_ADDS) errors.push(`Add up to ${MAX_COMPANY_ADDS} companies per call. Please split it into smaller calls.`);
  if (picEdits.length > MAX_COMPANY_PIC_CHANGES || picEdits.reduce<number>((count, entry) =>
    count + (isRecord(entry) && Array.isArray(entry.companyIds) ? entry.companyIds.length : 0), 0) > MAX_COMPANY_PIC_CHANGES) {
    errors.push(`Change up to ${MAX_COMPANY_PIC_CHANGES} company PICs per call. Please split it into smaller calls.`);
  }
  if (errors.length) return { preview: null, errors };

  const preview: CompanyChangesPreview = { add: [], setPic: [], seenPics: {}, warnings: [], alreadyExists: [] };
  const names = teamNames(context);
  const addedNames = new Set<string>();
  for (const [index, raw] of additions.entries()) {
    const path = `add[${index}]`;
    if (!isRecord(raw)) {
      errors.push(`${path} must be a company object.`);
      continue;
    }
    checkKeys(raw, ADD_FIELDS, path, errors);
    if (raw.allowDuplicate !== undefined && typeof raw.allowDuplicate !== "boolean") errors.push(`${path}.allowDuplicate must be a boolean.`);
    const group = raw.group === undefined ? "toApproach" : ADD_GROUPS.find(
      (key) => raw.group === key || raw.group === COMPANY_GROUP_LABELS[key],
    );
    if (!group) errors.push(`${path}.group must be To approach, Active or No or not now.`);
    const company = typeof raw.company === "string" ? raw.company.trim() : "";
    const nameKey = companyNameKey(company);
    if (!nameKey) errors.push(`${path}.company needs a company name.`);
    if (!nameKey || !group) continue;

    if (addedNames.has(nameKey)) {
      errors.push(`${path}.company "${company}" appears twice in this call.`);
      continue;
    }
    addedNames.add(nameKey);
    const values = additionValues(raw, group, path, errors);
    const matches = matchingCompanies(company, context.companies);
    const exact = matches.find((match) => companyNameKey(match.company) === nameKey);
    if (exact && raw.allowDuplicate !== true) {
      const existing = describeCompany(exact);
      if (mode === "apply") preview.alreadyExists.push({ ...existing, requestedCompany: company });
      else errors.push(`"${company}" matches "${existing.company}" in ${existing.group} (company ${existing.id}). Use allowDuplicate only after the owner confirms.`);
      continue;
    }
    const close = matches.filter((match) => companyNameKey(match.company) !== nameKey).map(describeCompany);
    if (close.length) preview.warnings.push({ company, matches: close });
    preview.add.push({ group: COMPANY_GROUP_LABELS[group], data: additionData(company, group, values, context, names, path, errors) });
  }

  const companies = new Map(context.companies.map((company) => [company.id, company]));
  const editedIds = new Set<number>();
  for (const [index, raw] of picEdits.entries()) {
    const path = `setPic[${index}]`;
    if (!isRecord(raw)) {
      errors.push(`${path} must be an object with a PIC and company IDs.`);
      continue;
    }
    checkKeys(raw, ["pic", "companyIds"], path, errors);
    let after: string | null | undefined;
    if (raw.pic === null) after = null;
    else if (typeof raw.pic === "string" && raw.pic.trim()) after = resolvePic(raw.pic.trim(), names, `${path}.pic`, errors);
    else errors.push(`${path}.pic must be a team name or null to clear it.`);
    if (!Array.isArray(raw.companyIds) || !raw.companyIds.length) {
      errors.push(`${path}.companyIds must list at least one company ID.`);
      continue;
    }
    for (const id of raw.companyIds) {
      if (typeof id !== "number" || !Number.isSafeInteger(id) || id < 0) {
        errors.push(`${path}.companyIds must contain numeric company IDs.`);
        continue;
      }
      if (editedIds.has(id)) {
        errors.push(`Company ${id} appears twice in setPic.`);
        continue;
      }
      editedIds.add(id);
      const company = companies.get(id);
      if (!company) {
        errors.push(`Company ${id} could not be found.`);
        continue;
      }
      if (after === undefined) continue;
      const before = companyPic(company);
      preview.setPic.push({ ...describeCompany(company), before, after, unchanged: before === after });
      preview.seenPics[id] = before;
    }
  }
  if (mode === "apply") errors.push(...checkSeenPics(input.seenPics, preview.setPic));
  return { preview: errors.length ? null : preview, errors };
}
