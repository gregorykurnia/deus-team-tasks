"use client";

// Reading a flow (guide 4.16, M1 to M3): the steps down a numbered path, each with its title, description and roles, then
// the decision with its outcomes side by side. An outcome either ends the flow or goes back to a step: pressing that jumps
// to the step and lights it up, and the step says which outcome comes back to it.
import { loopTarget, outcomesBackTo, UNTITLED_OUTCOME, UNTITLED_STEP } from "@/lib/flows";
import type { Flow, FlowBranch, FlowRole } from "@/lib/types";
import Icon from "@/ui/Icon";
import PersonChip from "@/ui/PersonChip";
import { LiveTag } from "@/ui/Tag";
import styles from "./Flows.module.css";

export const stepAnchor = (flowId: string, stepId: string) => `flow-${flowId}-step-${stepId}`;

interface FlowPathProps {
  flow: Flow;
  lit: string | null; // the step just jumped to
  changed: Set<string>; // parts a colleague just changed
  onJump: (stepId: string) => void;
}

export default function FlowPath({ flow, lit, changed, onJump }: FlowPathProps) {
  const d = flow.decision;
  return (
    <ol className={styles.steps}>
      {flow.steps.map((s, i) => (
        <li key={s.id} className={lit === s.id ? `${styles.step} ${styles.lit}` : styles.step}>
          <span className={styles.num} aria-hidden="true">
            {i + 1}
          </span>
          <div className={styles.card} id={stepAnchor(flow.id, s.id)} tabIndex={-1}>
            <h3>
              <span>
                <span className="sr-only">Step {i + 1}: </span>
                {s.title.trim() ? s.title : <span className={styles.untitled}>{UNTITLED_STEP}</span>}
              </span>
              {changed.has(s.id) && <LiveTag>Changed just now</LiveTag>}
            </h3>
            {s.description.trim() && <p className={styles.partDesc}>{s.description}</p>}
            <Roles roles={s.roles} />
            {outcomesBackTo(flow, s.id).map((o) => (
              <p key={o.id} className={styles.loopIn}>
                <Icon name="undo" size={15} />
                <span>When the decision is “{o.title.trim() || UNTITLED_OUTCOME}”, the work comes back here</span>
              </p>
            ))}
          </div>
        </li>
      ))}
      {d && (
        <li className={styles.step}>
          <span className={`${styles.num} ${styles.diamond}`} aria-hidden="true">
            <Icon name="diamond" size={14} />
          </span>
          <div className={styles.decision}>
            <p className={styles.decisionKey}>Decision</p>
            <h3>
              <span>{d.label.trim() ? d.label : <span className={styles.untitled}>Untitled decision</span>}</span>
              {changed.has("decision") && <LiveTag>Changed just now</LiveTag>}
            </h3>
            {d.description?.trim() && <p className={styles.partDesc}>{d.description}</p>}
            {d.branches.length ? (
              <div className={styles.outs}>
                {d.branches.map((o) => (
                  <Outcome key={o.id} flow={flow} outcome={o} changed={changed.has(o.id)} onJump={onJump} />
                ))}
              </div>
            ) : (
              <p className={styles.noOutcomes}>No outcomes yet.</p>
            )}
          </div>
        </li>
      )}
    </ol>
  );
}

function Outcome({ flow, outcome: o, changed, onJump }: { flow: Flow; outcome: FlowBranch; changed: boolean; onJump: (stepId: string) => void }) {
  const back = loopTarget(flow, o);
  const good = o.tone === "good";
  return (
    <section className={good ? styles.out : `${styles.out} ${styles.bad}`}>
      <p className={styles.outKey}>
        <Icon name={good ? "check" : "x"} size={13} />
        {good ? "Good outcome" : "Bad outcome"}
      </p>
      <h4>
        <span>{o.title.trim() ? o.title : <span className={styles.untitled}>{UNTITLED_OUTCOME}</span>}</span>
        {changed && <LiveTag>Changed just now</LiveTag>}
      </h4>
      {o.description.trim() && <p className={styles.partDesc}>{o.description}</p>}
      <Roles roles={o.roles} />
      {back ? (
        <button type="button" className={styles.loop} onClick={() => onJump(back.step.id)}>
          <Icon name="undo" size={15} />
          <span>
            Back to step {back.number}: {back.step.title.trim() || UNTITLED_STEP}
          </span>
        </button>
      ) : (
        <p className={styles.ends}>
          <Icon name="flag" size={14} />
          The flow ends here
        </p>
      )}
    </section>
  );
}

function Roles({ roles }: { roles: FlowRole[] }) {
  if (!roles.length) return null;
  return (
    <div className={styles.roles}>
      {roles.map((r, i) => (
        <div key={i} className={styles.role}>
          <span className={styles.roleLabel}>{r.label.trim() || "Role"}</span>
          <span className={styles.roleNames}>
            {r.names.length ? r.names.map((n) => <PersonChip key={n} name={n} compact />) : <span className={styles.noNames}>No names yet</span>}
          </span>
        </div>
      ))}
    </div>
  );
}
