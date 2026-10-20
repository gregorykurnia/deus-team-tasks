"use client";

// Editing a flow (guide 4.16, 6.8, D-018): the same path, with titles and descriptions as fields written in place, step
// tools (up, down, add after, remove), roles as a label with suggestions and a people picker, the decision after the last
// step with its outcomes (good or bad, and what happens next), and add lines. Removing a step, a role, an outcome or the
// decision offers Undo; a step that an outcome went back to takes that loop with it, and the outcome ends the flow.
import { useEffect, useRef, type ChangeEvent, type FocusEvent } from "react";
import {
  addDecision,
  addOutcome,
  addRole,
  addStep,
  blankOutcome,
  blankStep,
  moveRole,
  moveStep,
  outcomesBackTo,
  removeDecision,
  removeOutcome,
  removeRole,
  removeStep,
  restoreOutcome,
  restoreRole,
  restoreStep,
  roleKey,
  ROLE_LABELS,
  setLoop,
  setRoleNames,
  setTone,
  UNTITLED_STEP,
  type FlowTextKey,
} from "@/lib/flows";
import type { NameCount } from "@/lib/people";
import type { Flow, FlowBranch, FlowStep } from "@/lib/types";
import Button from "@/ui/Button";
import Combobox from "@/ui/Combobox";
import Icon from "@/ui/Icon";
import { SelectInput } from "@/ui/Inputs";
import PeoplePicker from "@/ui/PeoplePicker";
import Segmented from "@/ui/Segmented";
import { LiveTag } from "@/ui/Tag";
import { useToast } from "@/ui/Toaster";
import type { FlowEditing } from "./useFlowEditing";
import styles from "./Flows.module.css";

export const fieldId = (flowId: string, key: FlowTextKey) => `flow-${flowId}-${key.replace(/\./g, "-")}`;

interface FlowEditorProps {
  editing: FlowEditing;
  labels: string[]; // role labels in use, on every flow
  names: NameCount[]; // names in use
  changed: Set<string>;
}

export default function FlowEditor({ editing, labels, names, changed }: FlowEditorProps) {
  const toast = useToast();
  const f = editing.shown;

  // Something just added takes the focus once it's on screen.
  const focusNext = useRef<string | null>(null);
  useEffect(() => {
    if (!focusNext.current) return;
    const el = document.getElementById(focusNext.current);
    if (el) {
      focusNext.current = null;
      el.focus();
    }
  }, [f]);
  const then = (id: string) => {
    focusNext.current = id;
  };

  const text = (k: FlowTextKey) => textProps(editing, k);

  function addStepAt(afterId?: string) {
    const s = blankStep();
    then(fieldId(f.id, `${s.id}.title`));
    editing.change((x) => addStep(x, s, afterId));
  }

  function removeStepAt(s: FlowStep, n: number) {
    const loops = outcomesBackTo(f, s.id).length;
    let removed: ReturnType<typeof removeStep>["removed"] = null;
    editing.change((x) => {
      const r = removeStep(x, s.id);
      removed = r.removed;
      return r.flow;
    });
    const name = s.title.trim() ? `“${s.title.trim()}”` : `Step ${n}`;
    toast(
      loops
        ? `${name} removed. ${loops === 1 ? "The outcome that went back to it now ends" : "The outcomes that went back to it now end"} the flow.`
        : `${name} removed`,
      { action: "Undo", onAction: () => removed && editing.change((x) => restoreStep(x, removed!)) }
    );
  }

  function moveStepBy(s: FlowStep, by: -1 | 1, n: number) {
    // The same button stays under the pointer, unless it can't go further that way.
    const last = n + by === 1 || n + by === f.steps.length;
    then(`${fieldId(f.id, s.id)}-${last ? (by < 0 ? "down" : "up") : by < 0 ? "up" : "down"}`);
    editing.change((x) => moveStep(x, s.id, by));
  }

  const d = f.decision;
  return (
    <ol className={`${styles.steps} ${styles.editing}`}>
      {f.steps.map((s, i) => (
        <li key={s.id} className={styles.step}>
          <span className={styles.num} aria-hidden="true">
            {i + 1}
          </span>
          <div className={styles.card}>
            <div className={styles.tools}>
              <span className={styles.toolsKey}>Step {i + 1}</span>
              {changed.has(s.id) && <LiveTag>Changed just now</LiveTag>}
              <span className={styles.spacer} />
              <Button variant="icon" id={`${fieldId(f.id, s.id)}-up`} aria-label={`Move step ${i + 1} up`} disabled={i === 0} onClick={() => moveStepBy(s, -1, i + 1)}>
                <Icon name="up2" size={16} />
              </Button>
              <Button
                variant="icon"
                id={`${fieldId(f.id, s.id)}-down`}
                aria-label={`Move step ${i + 1} down`}
                disabled={i === f.steps.length - 1}
                onClick={() => moveStepBy(s, 1, i + 1)}
              >
                <Icon name="down2" size={16} />
              </Button>
              <Button variant="icon" aria-label={`Add a step after step ${i + 1}`} title="Add a step after this one" onClick={() => addStepAt(s.id)}>
                <Icon name="plus" size={16} />
              </Button>
              <Button variant="icon" className={styles.red} aria-label={`Remove step ${i + 1}`} onClick={() => removeStepAt(s, i + 1)}>
                <Icon name="trash" size={16} />
              </Button>
            </div>
            <label className="sr-only" htmlFor={fieldId(f.id, `${s.id}.title`)}>
              Step {i + 1} title
            </label>
            <input className={styles.title} placeholder="What happens in this step?" autoComplete="off" {...text(`${s.id}.title`)} />
            <label className="sr-only" htmlFor={fieldId(f.id, `${s.id}.description`)}>
              Step {i + 1} description
            </label>
            <textarea className={styles.text} rows={1} placeholder="Describe it, so anyone can follow" {...text(`${s.id}.description`)} />
            <RolesEditor part={s} partName={`step ${i + 1}`} editing={editing} labels={labels} names={names} then={then} />
          </div>
        </li>
      ))}

      <li className={styles.step}>
        <span className={`${styles.num} ${styles.ghost}`} aria-hidden="true">
          <Icon name="plus" size={16} />
        </span>
        <button type="button" className={styles.addStep} onClick={() => addStepAt()}>
          <Icon name="plus" size={16} />
          {f.steps.length ? "Add a step" : "Add the first step"}
        </button>
      </li>

      {!d && f.steps.length > 0 && (
        <li className={styles.step}>
          <span className={`${styles.num} ${styles.diamond} ${styles.ghost}`} aria-hidden="true">
            <Icon name="diamond" size={14} />
          </span>
          <button
            type="button"
            className={styles.addDecision}
            onClick={() => {
              then(fieldId(f.id, "decision.label"));
              editing.change(addDecision);
            }}
          >
            <Icon name="plus" size={16} />
            <span>
              Add a decision
              <small>One per flow, after the last step. Its outcomes can send the work back to an earlier step.</small>
            </span>
          </button>
        </li>
      )}

      {d && (
        <li className={styles.step}>
          <span className={`${styles.num} ${styles.diamond}`} aria-hidden="true">
            <Icon name="diamond" size={14} />
          </span>
          <div className={styles.decision}>
            <div className={styles.tools}>
              <span className={styles.toolsKey}>Decision</span>
              {changed.has("decision") && <LiveTag>Changed just now</LiveTag>}
              <span className={styles.spacer} />
              <Button
                variant="quietRed"
                small
                onClick={() => {
                  const kept = d;
                  editing.change(removeDecision);
                  toast("Decision removed", { action: "Undo", onAction: () => editing.change((x) => (x.decision ? x : { ...x, decision: kept })) });
                }}
              >
                <Icon name="trash" size={15} />
                Remove the decision
              </Button>
            </div>
            <label className="sr-only" htmlFor={fieldId(f.id, "decision.label")}>
              The decision
            </label>
            <input className={`${styles.title} ${styles.question}`} placeholder="The question, like “Does the client accept?”" autoComplete="off" {...text("decision.label")} />
            <label className="sr-only" htmlFor={fieldId(f.id, "decision.description")}>
              How to decide
            </label>
            <textarea className={styles.text} rows={1} placeholder="How to decide (optional)" {...text("decision.description")} />
            <div className={styles.outs}>
              {d.branches.map((o, i) => (
                <OutcomeEditor key={o.id} flow={f} outcome={o} n={i + 1} editing={editing} labels={labels} names={names} changed={changed.has(o.id)} then={then} />
              ))}
              <button
                type="button"
                className={styles.addOutcome}
                onClick={() => {
                  const o = blankOutcome("bad");
                  then(fieldId(f.id, `${o.id}.title`));
                  editing.change((x) => addOutcome(x, o));
                }}
              >
                <Icon name="plus" size={16} />
                Add an outcome
              </button>
            </div>
          </div>
        </li>
      )}
    </ol>
  );
}

interface OutcomeEditorProps {
  flow: Flow;
  outcome: FlowBranch;
  n: number;
  editing: FlowEditing;
  labels: string[];
  names: NameCount[];
  changed: boolean;
  then: (id: string) => void;
}

function OutcomeEditor({ flow, outcome: o, n, editing, labels, names, changed: live, then }: OutcomeEditorProps) {
  const toast = useToast();
  const text = (k: FlowTextKey) => textProps(editing, k);
  const good = o.tone === "good";
  const thenId = `${fieldId(flow.id, o.id)}-then`;
  return (
    <section className={good ? styles.out : `${styles.out} ${styles.bad}`}>
      <div className={styles.tools}>
        <Segmented
          label={`Outcome ${n} is`}
          options={[
            { value: "good", label: "Good", icon: "check" },
            { value: "bad", label: "Bad", icon: "x" },
          ]}
          value={o.tone}
          onChange={(tone) => tone && tone !== o.tone && editing.change((x) => setTone(x, o.id, tone))}
        />
        {live && <LiveTag>Changed just now</LiveTag>}
        <span className={styles.spacer} />
        <Button
          variant="icon"
          className={styles.red}
          aria-label={`Remove outcome ${n}`}
          onClick={() => {
            let gone: ReturnType<typeof removeOutcome> | null = null;
            editing.change((x) => {
              gone = removeOutcome(x, o.id);
              return gone.flow;
            });
            toast("Outcome removed", {
              action: "Undo",
              onAction: () => gone?.outcome && editing.change((x) => restoreOutcome(x, gone!.index, gone!.outcome!)),
            });
          }}
        >
          <Icon name="trash" size={16} />
        </Button>
      </div>
      <label className="sr-only" htmlFor={fieldId(flow.id, `${o.id}.title`)}>
        Outcome {n} title
      </label>
      <input className={`${styles.title} ${styles.titleSmall}`} placeholder="What happens then?" autoComplete="off" {...text(`${o.id}.title`)} />
      <label className="sr-only" htmlFor={fieldId(flow.id, `${o.id}.description`)}>
        Outcome {n} description
      </label>
      <textarea className={styles.text} rows={1} placeholder="Describe it (optional)" {...text(`${o.id}.description`)} />
      <RolesEditor part={o} partName={`outcome ${n}`} editing={editing} labels={labels} names={names} then={then} />
      <div className={styles.then}>
        <label className={styles.toolsKey} htmlFor={thenId}>
          Then
        </label>
        <SelectInput id={thenId} value={o.loopTo && flow.steps.some((s) => s.id === o.loopTo) ? o.loopTo : ""} onChange={(e) => editing.change((x) => setLoop(x, o.id, e.target.value))}>
          <option value="">The flow ends here</option>
          {flow.steps.map((s, i) => (
            <option key={s.id} value={s.id}>
              Go back to step {i + 1}: {s.title.trim() || UNTITLED_STEP}
            </option>
          ))}
        </SelectInput>
      </div>
    </section>
  );
}

// A text field written in place, named in data-k.
const keyOf = (e: { currentTarget: HTMLElement }) => e.currentTarget.dataset.k as FlowTextKey;
function textProps(editing: FlowEditing, k: FlowTextKey) {
  return {
    id: fieldId(editing.shown.id, k),
    "data-k": k,
    value: editing.text(k),
    onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => editing.type(keyOf(e), e.currentTarget.value),
    onFocus: (e: FocusEvent<HTMLElement>) => editing.focus(keyOf(e)),
    onBlur: (e: FocusEvent<HTMLElement>) => editing.blur(keyOf(e)),
  };
}

interface RolesEditorProps {
  part: FlowStep | FlowBranch;
  partName: string; // "step 2", "outcome 1"
  editing: FlowEditing;
  labels: string[];
  names: NameCount[];
  then: (id: string) => void;
}

function RolesEditor({ part, partName, editing, labels, names, then }: RolesEditorProps) {
  const toast = useToast();
  const flowId = editing.shown.id;
  const roleId = (i: number) => fieldId(flowId, roleKey(part.id, i));

  return (
    <div className={styles.editRoles}>
      {part.roles.map((r, i) => {
        const key = roleKey(part.id, i);
        const typed = editing.text(key);
        const q = typed.trim().toLowerCase();
        const offered = labels.filter((l) => l.toLowerCase() !== q && (!q || l.toLowerCase().includes(q))).slice(0, 7);
        const label = r.label.trim() || "this role";
        return (
          <div key={i} className={styles.editRole}>
            <div className={styles.editRoleLabel} onFocus={() => editing.focus(key)} onBlur={() => editing.blur(key)}>
              <Combobox
                id={roleId(i)}
                aria-label={`Role ${i + 1} in ${partName}`}
                placeholder="Role, like “Responsible”"
                text={typed}
                onText={(v) => editing.type(key, v)}
                options={offered.map((l) => ({ key: l, content: <span>{l}</span> }))}
                heading="Roles already in use"
                highlightFirst={false}
                onPick={(l) => editing.setText(key, l)}
              />
            </div>
            <div className={styles.editRoleNames}>
              <PeoplePicker
                aria-label={`People in ${label}`}
                placeholder="Type a name"
                value={r.names}
                suggestions={names}
                onChange={(next) => editing.change((x) => setRoleNames(x, part.id, i, next))}
              />
            </div>
            <div className={styles.roleActs}>
              <Button variant="icon" aria-label={`Move ${label} up`} disabled={i === 0} onClick={() => editing.change((x) => moveRole(x, part.id, i, -1))}>
                <Icon name="up" size={15} />
              </Button>
              <Button
                variant="icon"
                aria-label={`Move ${label} down`}
                disabled={i === part.roles.length - 1}
                onClick={() => editing.change((x) => moveRole(x, part.id, i, 1))}
              >
                <Icon name="down" size={15} />
              </Button>
              <Button
                variant="icon"
                aria-label={`Remove ${label}`}
                onClick={() => {
                  editing.change((x) => removeRole(x, part.id, i));
                  toast(r.label.trim() ? `Role “${r.label.trim()}” removed` : "Role removed", {
                    action: "Undo",
                    onAction: () => editing.change((x) => restoreRole(x, part.id, i, r)),
                  });
                }}
              >
                <Icon name="x" size={15} />
              </Button>
            </div>
          </div>
        );
      })}
      <span className={styles.addRole}>
        <Button
          variant="quiet"
          small
          onClick={() => {
            then(roleId(part.roles.length));
            editing.change((x) => addRole(x, part.id));
          }}
        >
          <Icon name="plus" size={15} />
          Add a role
        </Button>
      </span>
    </div>
  );
}

// Labels offered for a role: the usual ones, then every label in use, without repeats (ignoring case).
export function roleLabelsInUse(inUse: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const l of [...ROLE_LABELS, ...inUse.map((x) => x.trim())]) {
    const k = l.toLowerCase();
    if (!l || seen.has(k)) continue;
    seen.add(k);
    out.push(l);
  }
  return out;
}
