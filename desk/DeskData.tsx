"use client";

// The app's data: one live subscription per collection for every screen
// (plan §2). Screens read it through the small hooks below.
import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { QueryDocumentSnapshot } from "firebase/firestore";
import type { PipelineEntry } from "@/lib/clientTypes";
import type { HistoricalClient } from "@/lib/historicalClientTypes";
import { useCompanySettings, type CompanySettings } from "@/lib/companySettings";
import { companiesById, type CompaniesById } from "@/lib/kinds";
import { useLiveQuery, type LiveRows } from "@/lib/liveQuery";
import type { ProspectJournalEntry } from "@/lib/prospectJournalTypes";
import type { TaskGroup } from "@/lib/taskGroups";
import type { Flow, Task } from "@/lib/types";
import { companiesQuery, toCompany } from "@/lib/useClientPipeline";
import { flowsQuery, toFlow } from "@/lib/useFlows";
import { pastClientsQuery, toPastClient } from "@/lib/useHistoricalClients";
import { notesQuery, toNotes } from "@/lib/useProspectJournal";
import { taskGroupsQuery, toTaskGroup } from "@/lib/useTaskGroups";
import { tasksQuery, toTask } from "@/lib/useTasks";

interface Desk {
  tasks: LiveRows<Task>;
  groups: LiveRows<TaskGroup>; // in the order they were made
  companies: LiveRows<PipelineEntry>;
  companiesById: CompaniesById;
  settings: { settings: CompanySettings; loading: boolean; stored: boolean }; // the team's company options and fields, or the defaults
  notes: LiveRows<ProspectJournalEntry>;
  pastClients: LiveRows<HistoricalClient>;
  flows: LiveRows<Flow>;
}

const DeskContext = createContext<Desk | null>(null);

const taskRows = (docs: QueryDocumentSnapshot[]) => docs.map(toTask);
const groupRows = (docs: QueryDocumentSnapshot[]) => docs.map(toTaskGroup);
const companyRows = (docs: QueryDocumentSnapshot[]) => docs.map(toCompany);
const pastClientRows = (docs: QueryDocumentSnapshot[]) => docs.map(toPastClient);
const flowRows = (docs: QueryDocumentSnapshot[]) => docs.map(toFlow);

export function DeskData({ children }: { children: ReactNode }) {
  const tasks = useLiveQuery("tasks", tasksQuery, taskRows);
  const groups = useLiveQuery("taskGroups", taskGroupsQuery, groupRows);
  const companies = useLiveQuery("companies", companiesQuery, companyRows);
  const settings = useCompanySettings();
  const notes = useLiveQuery("notes", notesQuery, toNotes);
  const pastClients = useLiveQuery("pastClients", pastClientsQuery, pastClientRows);
  const flows = useLiveQuery("flows", flowsQuery, flowRows);
  const byId = useMemo(() => companiesById(companies.rows), [companies.rows]);

  const desk = useMemo(
    () => ({ tasks, groups, companies, companiesById: byId, settings, notes, pastClients, flows }),
    [tasks, groups, companies, byId, settings, notes, pastClients, flows]
  );
  return <DeskContext.Provider value={desk}>{children}</DeskContext.Provider>;
}

function useDesk(): Desk {
  const desk = useContext(DeskContext);
  if (!desk) throw new Error("DeskData is missing above this screen.");
  return desk;
}

export const useTasks = () => useDesk().tasks;
export const useTaskGroups = () => useDesk().groups;
export const useCompanies = () => useDesk().companies;
export const useCompaniesById = () => useDesk().companiesById;
export const useCompanyOptions = () => useDesk().settings;
export const useNotes = () => useDesk().notes;
export const usePastClients = () => useDesk().pastClients;
export const useFlows = () => useDesk().flows;
