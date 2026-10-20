// Kinds of work (guide 5.2): a task tied to no company is internal work; a task
// tied to a company is prospect work, or client work once that company's deal is done.
import type { PipelineEntry } from "./clientTypes";
import type { Task } from "./types";

export type Kind = "prospect" | "client" | "internal";

export const KINDS: Kind[] = ["prospect", "client", "internal"];

export const KIND_LABELS: Record<Kind, string> = {
  prospect: "Prospects",
  client: "Clients",
  internal: "Internal",
};

// The stored status that puts a company in Deal done (Q3).
export const DEAL_DONE_STATUS = "Client / Partner Done Deal";

export type CompaniesById = ReadonlyMap<number, PipelineEntry>;

export function companiesById(companies: PipelineEntry[]): Map<number, PipelineEntry> {
  return new Map(companies.map((c) => [c.id, c]));
}

export function isDealDone(company: PipelineEntry): boolean {
  return company.status === DEAL_DONE_STATUS;
}

// The company a task is tied to, if it still exists. A task whose company was
// deleted counts as internal work.
export function linkedCompany(task: Pick<Task, "linkedClientId">, companies: CompaniesById): PipelineEntry | undefined {
  return task.linkedClientId == null ? undefined : companies.get(task.linkedClientId);
}

export function kindOf(task: Pick<Task, "linkedClientId">, companies: CompaniesById): Kind {
  const company = linkedCompany(task, companies);
  if (!company) return "internal";
  return isDealDone(company) ? "client" : "prospect";
}

export function tasksOfKind<T extends Pick<Task, "linkedClientId">>(tasks: T[], kind: Kind, companies: CompaniesById): T[] {
  return tasks.filter((t) => kindOf(t, companies) === kind);
}
