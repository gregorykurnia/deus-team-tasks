"use client";

import { useState } from "react";
import { Chip } from "./Chip";

type FlowRole = { label: string; names: string[] };

type FlowStep = {
  id: string;
  title: string;
  description: string;
  roles: FlowRole[];
};

type FlowBranch = {
  id: string;
  label: string;
  tone: "bad" | "good";
  title: string;
  description: string;
  roles: FlowRole[];
  loopTo?: string;
};

type FlowDecision = {
  label: string;
  branches: FlowBranch[];
};

type Flow = {
  id: string;
  name: string;
  description: string;
  steps: FlowStep[];
  decision?: FlowDecision;
};

const FLOWS: Flow[] = [
  {
    id: "incentive",
    name: "Incentive Flow",
    description: "Incentive data handover process — read-only reference, does not affect the Assignee view.",
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
    id: "dkb-requests",
    name: "DKB Requests",
    description: "Bug and minor request handling process — read-only reference, does not affect the Assignee view.",
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

function RoleRow({ roles }: { roles: FlowRole[] }) {
  if (roles.length === 0) return null;
  return (
    <div className="mt-3 space-y-1.5">
      {roles.map((r) => (
        <div key={r.label} className="flex items-start gap-2">
          <span className="w-20 shrink-0 pt-1 text-[11px] uppercase tracking-wide text-gray-400 font-medium">
            {r.label}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {r.names.map((n) => (
              <Chip key={n} name={n} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function Arrow() {
  return (
    <div className="flex justify-center py-1">
      <svg width="20" height="28" viewBox="0 0 20 28" className="text-gray-300">
        <line x1="10" y1="0" x2="10" y2="20" stroke="currentColor" strokeWidth="2" />
        <path d="M4 16 L10 24 L16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

function FlowDiagram({ flow }: { flow: Flow }) {
  return (
    <div className="max-w-xl mx-auto">
      {flow.steps.map((s, i) => (
        <div key={s.id}>
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm px-5 py-4">
            <div className="text-sm font-semibold text-gray-800">{s.title}</div>
            <div className="mt-1 text-sm text-gray-600">{s.description}</div>
            <RoleRow roles={s.roles} />
          </div>
          {(i < flow.steps.length - 1 || flow.decision) && <Arrow />}
        </div>
      ))}

      {flow.decision && (
        <>
          <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-5 py-3 text-center text-sm font-medium text-gray-500">
            {flow.decision.label}
          </div>

          <div className="relative mt-4 grid grid-cols-1 sm:grid-cols-2 gap-5">
            {flow.decision.branches.map((b) => (
              <div
                key={b.id}
                id={b.id}
                className={`rounded-xl border px-5 py-4 shadow-sm ${
                  b.tone === "bad" ? "border-red-200 bg-red-50/60" : "border-emerald-200 bg-emerald-50/60"
                }`}
              >
                <div
                  className={`text-[11px] uppercase tracking-wide font-semibold mb-1 ${
                    b.tone === "bad" ? "text-red-500" : "text-emerald-600"
                  }`}
                >
                  {b.label}
                </div>
                <div className="text-sm font-semibold text-gray-800">{b.title}</div>
                <div className="mt-1 text-sm text-gray-600">{b.description}</div>
                <RoleRow roles={b.roles} />
                {b.loopTo && (
                  <div className="mt-3 flex items-center gap-1.5 text-xs font-medium text-red-500">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                      <path
                        d="M3 12a9 9 0 1 1 3 6.7M3 12v6M3 12h6"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    Return to Step 3 after correction
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function FlowTab() {
  const [active, setActive] = useState(FLOWS[0].id);
  const flow = FLOWS.find((f) => f.id === active) ?? FLOWS[0];

  return (
    <div>
      <h1 className="text-xl font-semibold text-gray-900 mb-1">Flow</h1>
      <p className="text-sm text-gray-500 mb-4">{flow.description}</p>

      <div className="flex gap-1.5 mb-6 border-b border-gray-200 pb-4">
        {FLOWS.map((f) => (
          <button
            key={f.id}
            onClick={() => setActive(f.id)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              active === f.id ? "bg-accent text-white" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            {f.name}
          </button>
        ))}
      </div>

      <FlowDiagram flow={flow} />
    </div>
  );
}
