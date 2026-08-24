import { NewPipelineEntry } from "./clientTypes";

// Seed data ported verbatim from the standalone client-pipeline-tracker app.
export const SEED_PIPELINE: (NewPipelineEntry & { id: number })[] = [
  { id: 1, company: "PT Indah Subur Sejati", type: "Client", date: "2026-06-08", status: "Waiting For Our Actions", pic: "Hariyanto", sourcing: "Pak Chris Connection", product: "DEUS Enhance", priority: "High", industry: "Retail", notes: "To send proposal", target: "2026-06-09" },
  { id: 2, company: "Inventing Robotic School", type: "Partner", date: "2026-06-08", status: "Waiting For Our Actions", pic: "Alif Fikri", sourcing: "Greg Connection (SSI)", product: "Potentia", priority: "High", industry: "Education Technology", notes: "Send poster by today - Onboarding on 10 June", target: "2026-06-10" },
  { id: 3, company: "PT Surganya Motor Indonesia (PlanetBan)", type: "Client", date: "2026-06-05", status: "To Follow Up", pic: "Imelda Nursalim", sourcing: "Pak Chris Connection", product: "DEUS Discover, DEUS Enhance", priority: "High", industry: "Transportation", notes: "", target: "" },
  { id: 4, company: "PT Defasindo Kreasi Prima (D&F)", type: "Client", date: "2026-06-05", status: "Waiting For Our Actions", pic: "Denny", sourcing: "Pak Chris Connection", product: "DEUS Enhance, Retail Plan", priority: "High", industry: "Retail", notes: "Need to Reach Out to the HR", target: "" },
  { id: 5, company: "PT Catur Mitra Sejati Sentosa (Mitra10)", type: "Client", date: "2026-06-03", status: "Scheduling In Progress", pic: "Apriyanto", sourcing: "Pak Chris Connection", product: "DEUS Enhance", priority: "Medium", industry: "Construction", notes: "Need to set next meeting", target: "2026-06-11" },
  { id: 6, company: "Yongki Komaladi", type: "Client", date: "2026-05-07", status: "To Follow Up", pic: "Julius", sourcing: "Pak Chris Connection", product: "DEUS Consultancy, DEUS Retail Plan", priority: "Medium", industry: "Retail", notes: "", target: "" },
  { id: 7, company: "PT Taman Safari Indonesia", type: "Client", date: "2026-06-09", status: "Waiting For Our Actions", pic: "Almira", sourcing: "Greg Network (ManagerFest)", product: "", priority: "Low", industry: "Tourism", notes: "To contact PIC", target: "2026-06-10" },
];
