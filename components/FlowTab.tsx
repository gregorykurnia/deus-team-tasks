"use client";

import { useEffect, useState } from "react";
import { Chip } from "./Chip";
import { useFlows } from "@/lib/useFlows";
import { Flow, FlowStep, FlowBranch, FlowRole, NewFlow } from "@/lib/types";

function uid(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function emptyStep(n: number): FlowStep {
  return { id: uid("step"), title: `Step ${n}`, description: "", roles: [] };
}

function RoleNamesInput({ names, onChange }: { names: string[]; onChange: (n: string[]) => void }) {
  const [draft, setDraft] = useState("");
  function commit() {
    const raw = draft.trim();
    if (!raw) return;
    onChange([...names, raw]);
    setDraft("");
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-gray-200 bg-white p-1.5">
      {names.map((n, i) => (
        <span key={i} className="inline-flex items-center">
          <Chip name={n} />
          <button
            type="button"
            onClick={() => onChange(names.filter((_, idx) => idx !== i))}
            className="-ml-1.5 text-gray-400 hover:text-gray-700 text-xs px-1"
            aria-label={`Remove ${n}`}
          >
            ×
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            commit();
          } else if (e.key === "Backspace" && !draft && names.length) {
            onChange(names.slice(0, -1));
          }
        }}
        onBlur={commit}
        placeholder="Add name…"
        className="flex-1 min-w-[80px] outline-none text-xs py-0.5 px-1"
      />
    </div>
  );
}

function RoleEditor({ roles, onChange }: { roles: FlowRole[]; onChange: (r: FlowRole[]) => void }) {
  function updateRole(i: number, patch: Partial<FlowRole>) {
    onChange(roles.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function removeRole(i: number) {
    onChange(roles.filter((_, idx) => idx !== i));
  }
  return (
    <div className="mt-3 space-y-2">
      {roles.map((r, i) => (
        <div key={i} className="flex items-start gap-2">
          <input
            value={r.label}
            onChange={(e) => updateRole(i, { label: e.target.value })}
            className="w-24 shrink-0 text-[11px] uppercase tracking-wide text-gray-500 font-medium bg-gray-50 rounded px-1.5 py-1 outline-none focus:ring-1 focus:ring-accent/40"
          />
          <div className="flex-1">
            <RoleNamesInput names={r.names} onChange={(names) => updateRole(i, { names })} />
          </div>
          <button
            type="button"
            onClick={() => removeRole(i)}
            className="text-gray-300 hover:text-red-500 text-xs px-1 pt-1"
            aria-label="Remove role"
          >
            ✕
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...roles, { label: "New Role", names: [] }])}
        className="text-xs font-medium text-accent hover:underline"
      >
        + Add role
      </button>
    </div>
  );
}

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

function StepBox({
  step,
  editing,
  onChange,
  onRemove,
}: {
  step: FlowStep;
  editing: boolean;
  onChange: (patch: Partial<FlowStep>) => void;
  onRemove: () => void;
}) {
  if (!editing) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm px-5 py-4">
        <div className="text-sm font-semibold text-gray-800">{step.title}</div>
        <div className="mt-1 text-sm text-gray-600">{step.description}</div>
        <RoleRow roles={step.roles} />
      </div>
    );
  }
  return (
    <div className="relative rounded-xl border border-accent/40 bg-white shadow-sm px-5 py-4">
      <button
        type="button"
        onClick={onRemove}
        className="absolute top-2.5 right-3 text-gray-300 hover:text-red-500 text-xs"
        aria-label="Remove step"
      >
        ✕
      </button>
      <input
        value={step.title}
        onChange={(e) => onChange({ title: e.target.value })}
        className="w-[90%] text-sm font-semibold text-gray-800 outline-none border-b border-transparent focus:border-accent/40 pb-0.5"
      />
      <textarea
        value={step.description}
        onChange={(e) => onChange({ description: e.target.value })}
        rows={2}
        placeholder="Description…"
        className="mt-1 w-full text-sm text-gray-600 outline-none resize-none border-b border-transparent focus:border-accent/40"
      />
      <RoleEditor roles={step.roles} onChange={(roles) => onChange({ roles })} />
    </div>
  );
}

function FlowDiagram({
  flow,
  editing,
  onPatch,
}: {
  flow: Flow;
  editing: boolean;
  onPatch: (patch: Partial<NewFlow>) => void;
}) {
  function updateStep(id: string, patch: Partial<FlowStep>) {
    onPatch({ steps: flow.steps.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  }
  function removeStep(id: string) {
    onPatch({ steps: flow.steps.filter((s) => s.id !== id) });
  }
  function addStep() {
    onPatch({ steps: [...flow.steps, emptyStep(flow.steps.length + 1)] });
  }

  function updateBranch(id: string, patch: Partial<FlowBranch>) {
    if (!flow.decision) return;
    onPatch({
      decision: { ...flow.decision, branches: flow.decision.branches.map((b) => (b.id === id ? { ...b, ...patch } : b)) },
    });
  }
  function removeBranch(id: string) {
    if (!flow.decision) return;
    onPatch({ decision: { ...flow.decision, branches: flow.decision.branches.filter((b) => b.id !== id) } });
  }
  function addBranch() {
    if (!flow.decision) return;
    onPatch({
      decision: {
        ...flow.decision,
        branches: [
          ...flow.decision.branches,
          { id: uid("branch"), label: "New Branch", tone: "good", title: "New Outcome", description: "", roles: [] },
        ],
      },
    });
  }
  function addDecision() {
    onPatch({ decision: { label: "Decision Point", branches: [] } });
  }
  function removeDecision() {
    onPatch({ decision: null });
  }

  return (
    <div className="max-w-xl mx-auto">
      {flow.steps.map((s, i) => (
        <div key={s.id}>
          <StepBox
            step={s}
            editing={editing}
            onChange={(patch) => updateStep(s.id, patch)}
            onRemove={() => removeStep(s.id)}
          />
          {(i < flow.steps.length - 1 || flow.decision || editing) && <Arrow />}
        </div>
      ))}

      {editing && (
        <button
          type="button"
          onClick={addStep}
          className="w-full mb-2 rounded-xl border border-dashed border-gray-300 text-gray-400 hover:text-accent hover:border-accent/50 text-xs font-medium py-2"
        >
          + Add step
        </button>
      )}

      {flow.decision ? (
        <>
          <div className="relative rounded-xl border border-dashed border-gray-300 bg-gray-50 px-5 py-3 text-center text-sm font-medium text-gray-500">
            {editing ? (
              <input
                value={flow.decision.label}
                onChange={(e) => onPatch({ decision: { ...flow.decision!, label: e.target.value } })}
                className="w-[85%] bg-transparent text-center outline-none"
              />
            ) : (
              flow.decision.label
            )}
            {editing && (
              <button
                type="button"
                onClick={removeDecision}
                className="absolute top-1.5 right-2 text-gray-300 hover:text-red-500 text-xs"
                aria-label="Remove decision"
              >
                ✕
              </button>
            )}
          </div>

          <div className="relative mt-4 grid grid-cols-1 sm:grid-cols-2 gap-5">
            {flow.decision.branches.map((b) => (
              <div
                key={b.id}
                id={b.id}
                className={`relative rounded-xl border px-5 py-4 shadow-sm ${
                  b.tone === "bad" ? "border-red-200 bg-red-50/60" : "border-emerald-200 bg-emerald-50/60"
                }`}
              >
                {editing && (
                  <button
                    type="button"
                    onClick={() => removeBranch(b.id)}
                    className="absolute top-2.5 right-3 text-gray-300 hover:text-red-500 text-xs"
                    aria-label="Remove branch"
                  >
                    ✕
                  </button>
                )}

                {editing ? (
                  <div className="flex items-center gap-2 mb-1 pr-4">
                    <select
                      value={b.tone}
                      onChange={(e) => updateBranch(b.id, { tone: e.target.value as "bad" | "good" })}
                      className={`text-[11px] uppercase tracking-wide font-semibold rounded px-1 py-0.5 border border-gray-200 ${
                        b.tone === "bad" ? "text-red-500" : "text-emerald-600"
                      }`}
                    >
                      <option value="good">good</option>
                      <option value="bad">bad</option>
                    </select>
                    <input
                      value={b.label}
                      onChange={(e) => updateBranch(b.id, { label: e.target.value })}
                      className="flex-1 text-[11px] uppercase tracking-wide font-semibold bg-transparent outline-none"
                    />
                  </div>
                ) : (
                  <div
                    className={`text-[11px] uppercase tracking-wide font-semibold mb-1 ${
                      b.tone === "bad" ? "text-red-500" : "text-emerald-600"
                    }`}
                  >
                    {b.label}
                  </div>
                )}

                {editing ? (
                  <>
                    <input
                      value={b.title}
                      onChange={(e) => updateBranch(b.id, { title: e.target.value })}
                      className="w-full text-sm font-semibold text-gray-800 outline-none bg-transparent"
                    />
                    <textarea
                      value={b.description}
                      onChange={(e) => updateBranch(b.id, { description: e.target.value })}
                      rows={2}
                      placeholder="Description…"
                      className="mt-1 w-full text-sm text-gray-600 outline-none resize-none bg-transparent"
                    />
                  </>
                ) : (
                  <>
                    <div className="text-sm font-semibold text-gray-800">{b.title}</div>
                    <div className="mt-1 text-sm text-gray-600">{b.description}</div>
                  </>
                )}

                {editing ? (
                  <RoleEditor roles={b.roles} onChange={(roles) => updateBranch(b.id, { roles })} />
                ) : (
                  <RoleRow roles={b.roles} />
                )}

                {editing ? (
                  <div className="mt-3 flex items-center gap-1.5 text-xs">
                    <span className="text-gray-400">Loop to:</span>
                    <select
                      value={b.loopTo ?? ""}
                      onChange={(e) => updateBranch(b.id, { loopTo: e.target.value || undefined })}
                      className="text-xs border border-gray-200 rounded px-1 py-0.5"
                    >
                      <option value="">None</option>
                      {flow.steps.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.title}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  b.loopTo && (
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
                      Return to {flow.steps.find((s) => s.id === b.loopTo)?.title ?? b.loopTo} after correction
                    </div>
                  )
                )}
              </div>
            ))}
          </div>

          {editing && (
            <button
              type="button"
              onClick={addBranch}
              className="mt-3 w-full rounded-xl border border-dashed border-gray-300 text-gray-400 hover:text-accent hover:border-accent/50 text-xs font-medium py-2"
            >
              + Add branch
            </button>
          )}
        </>
      ) : (
        editing && (
          <button
            type="button"
            onClick={addDecision}
            className="w-full rounded-xl border border-dashed border-gray-300 text-gray-400 hover:text-accent hover:border-accent/50 text-xs font-medium py-2"
          >
            + Add decision point
          </button>
        )
      )}
    </div>
  );
}

export function FlowTab() {
  const { flows, loading, addFlow, updateFlow, deleteFlow } = useFlows();
  const [active, setActive] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if ((!active || !flows.some((f) => f.id === active)) && flows.length) {
      setActive(flows[0].id);
    }
  }, [flows, active]);

  if (loading) {
    return <div className="text-gray-400 text-sm py-20 text-center">Loading flows…</div>;
  }

  const flow = flows.find((f) => f.id === active) ?? null;

  async function handleAddFlow() {
    const id = await addFlow({
      name: "New Flow",
      description: "Describe this flow…",
      order: flows.length,
      steps: [emptyStep(1)],
    });
    setActive(id);
    setEditing(true);
  }

  async function handleDeleteFlow(id: string) {
    if (!confirm("Delete this flow? This cannot be undone.")) return;
    await deleteFlow(id);
    if (active === id) setActive(null);
  }

  if (!flow) {
    return (
      <div className="text-center py-16">
        <p className="text-sm text-gray-400 mb-3">No flows yet.</p>
        <button
          onClick={handleAddFlow}
          className="px-3 py-1.5 rounded-lg text-sm font-medium bg-accent text-white"
        >
          + New Flow
        </button>
      </div>
    );
  }

  function patch(p: Partial<NewFlow>) {
    if (!flow) return;
    updateFlow(flow.id, p);
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-1">
        {editing ? (
          <input
            value={flow.name}
            onChange={(e) => patch({ name: e.target.value })}
            className="flex-1 text-xl font-semibold text-gray-900 outline-none border-b border-transparent focus:border-accent/40"
          />
        ) : (
          <h1 className="text-xl font-semibold text-gray-900">{flow.name}</h1>
        )}
        <button
          onClick={() => setEditing((v) => !v)}
          className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            editing ? "bg-accent text-white" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
          }`}
        >
          {editing ? "Done Editing" : "Edit"}
        </button>
      </div>

      {editing ? (
        <textarea
          value={flow.description}
          onChange={(e) => patch({ description: e.target.value })}
          rows={2}
          className="mb-4 w-full text-sm text-gray-500 outline-none resize-none border-b border-transparent focus:border-accent/40"
        />
      ) : (
        <p className="text-sm text-gray-500 mb-4">{flow.description}</p>
      )}

      <div className="flex flex-wrap items-center gap-1.5 mb-6 border-b border-gray-200 pb-4">
        {flows.map((f) => (
          <span key={f.id} className="inline-flex items-center">
            <button
              onClick={() => setActive(f.id)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                active === f.id ? "bg-accent text-white" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
              }`}
            >
              {f.name}
            </button>
            {editing && (
              <button
                onClick={() => handleDeleteFlow(f.id)}
                className="-ml-1.5 text-gray-300 hover:text-red-500 text-xs px-1"
                aria-label={`Delete ${f.name}`}
              >
                ✕
              </button>
            )}
          </span>
        ))}
        <button
          onClick={handleAddFlow}
          className="px-3 py-1.5 rounded-lg text-sm font-medium border border-dashed border-gray-300 text-gray-400 hover:text-accent hover:border-accent/50"
        >
          + New Flow
        </button>
      </div>

      <FlowDiagram flow={flow} editing={editing} onPatch={patch} />
    </div>
  );
}
