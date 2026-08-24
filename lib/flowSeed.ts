import { NewFlow } from "./types";

export const SEED_FLOWS: NewFlow[] = [
  {
    name: "Incentive Flow",
    description: "Incentive data handover process — read-only reference, does not affect the Assignee view.",
    order: 0,
    steps: [
      {
        id: "step-1",
        title: "Step 1 — API Opened by DKB",
        description: "DKB IT opens the API, making incentive data visible on the web.",
        roles: [
          { label: "Responsible", names: ["DKB IT"] },
          { label: "Informed", names: ["Ko Will", "Fir", "Bu Sovie"] },
        ],
      },
      {
        id: "step-2",
        title: "Step 2 — Data Pull via Script",
        description: "Ko Will runs the script to pull the incentive data and hands it off to Bu Sovie as the data PIC.",
        roles: [
          { label: "Responsible", names: ["Ko Will"] },
          { label: "Informed", names: ["Bu Sovie"] },
        ],
      },
      {
        id: "step-3",
        title: "Step 3 — Cross-Check by Bu Sovie",
        description: "Bu Sovie receives the pulled data and cross-checks it against the web production Enhance data.",
        roles: [
          { label: "Responsible", names: ["Bu Sovie"] },
          { label: "Consulted", names: ["Ko Will", "Fir"] },
        ],
      },
    ],
    decision: {
      label: "Step 4 — Cross-Check Result",
      branches: [
        {
          id: "branch-a",
          label: "Branch A — Discrepancies Found",
          tone: "bad",
          title: "❌ Discrepancies Found",
          description: "Bu Sovie flags the issue and informs Lida directly.",
          roles: [
            { label: "Responsible", names: ["Bu Sovie"] },
            { label: "Informed", names: ["Lida"] },
          ],
          loopTo: "step-3",
        },
        {
          id: "branch-b",
          label: "Branch B — All Clear",
          tone: "good",
          title: "✅ All Clear",
          description: "Data is verified and accurate. Incentive processing is good to go.",
          roles: [],
        },
      ],
    },
  },
  {
    name: "DKB Requests",
    description: "Bug and minor request handling process — read-only reference, does not affect the Assignee view.",
    order: 1,
    steps: [
      {
        id: "step-1",
        title: "Step 1 — Lida Reports an Issue",
        description: "Lida flags a bug or minor request and communicates it to Bu Sovie.",
        roles: [
          { label: "Responsible", names: ["Lida"] },
          { label: "Informed", names: ["Bu Sovie"] },
        ],
      },
      {
        id: "step-2",
        title: "Step 2 — Bu Sovie Escalates Internally",
        description: "Bu Sovie relays the bug or minor request to the internal team.",
        roles: [
          { label: "Responsible", names: ["Bu Sovie"] },
          { label: "Informed", names: ["Greg", "Ko Will"] },
        ],
      },
      {
        id: "step-3",
        title: "Step 3 — Assess the Technical Actions",
        description: "Evaluation of the bug or minor request and determines the appropriate technical solution.",
        roles: [
          { label: "Responsible", names: ["Ko Will"] },
          { label: "Consulted", names: ["Fir"] },
        ],
      },
      {
        id: "step-4",
        title: "Step 4 — Alignment Before Execution",
        description:
          "Tech walks management and data through the proposed solution to ensure everyone is on the same page before any changes are made.",
        roles: [
          { label: "Responsible", names: ["Ko Will"] },
          { label: "Informed", names: ["Greg", "Bu Sovie"] },
        ],
      },
      {
        id: "step-5",
        title: "Step 5 — Updates DKB on the Plan",
        description:
          "Account Handler communicates the proposed plan of action to Lida, keeping her informed on what will be done and the expected timeline.",
        roles: [
          { label: "Responsible", names: ["Greg"] },
          { label: "Informed", names: ["Lida"] },
          { label: "Consulted", names: ["Ko Will"] },
        ],
      },
      {
        id: "step-6",
        title: "Step 6 — Execution of the Fix or Requests",
        description: "Once aligned, the fix or change in the system is implemented. Account handler is informed.",
        roles: [
          { label: "Responsible", names: ["Ko Will"] },
          { label: "Informed", names: ["Greg"] },
          { label: "Consulted", names: ["Fir", "Bu Sovie"] },
        ],
      },
      {
        id: "step-7",
        title: "Step 7 — Confirms Completion to DKB",
        description: "Once the fix or request is completed, Account Handler informs Lida that it's been resolved.",
        roles: [
          { label: "Responsible", names: ["Greg"] },
          { label: "Informed", names: ["Lida"] },
        ],
      },
    ],
  },
];
