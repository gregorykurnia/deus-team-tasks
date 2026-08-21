"use client";

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

const STEPS: FlowStep[] = [
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
];

const BRANCHES: FlowBranch[] = [
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

export function FlowTab() {
  return (
    <div>
      <h1 className="text-xl font-semibold text-gray-900 mb-1">Flow</h1>
      <p className="text-sm text-gray-500 mb-6">
        Incentive data handover process — read-only reference, does not affect the Assignee view.
      </p>

      <div className="max-w-xl mx-auto">
        {STEPS.map((s, i) => (
          <div key={s.id}>
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm px-5 py-4">
              <div className="text-sm font-semibold text-gray-800">{s.title}</div>
              <div className="mt-1 text-sm text-gray-600">{s.description}</div>
              <RoleRow roles={s.roles} />
            </div>
            {i < STEPS.length - 1 && <Arrow />}
          </div>
        ))}

        <Arrow />

        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-5 py-3 text-center text-sm font-medium text-gray-500">
          Step 4 — Cross-Check Result
        </div>

        <div className="relative mt-4 grid grid-cols-1 sm:grid-cols-2 gap-5">
          {BRANCHES.map((b) => (
            <div
              key={b.id}
              id={b.id}
              className={`rounded-xl border px-5 py-4 shadow-sm ${
                b.tone === "bad"
                  ? "border-red-200 bg-red-50/60"
                  : "border-emerald-200 bg-emerald-50/60"
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
      </div>
    </div>
  );
}
