"use client";

// One flow (guide 6.8): the top line ("All flows" on phones; Edit flow, or the save line and Done while editing; ⋯), the
// icon, name and description with the meta line (steps and decision, how many people, when it was last edited), then the
// path and the decision. Flows open to read; Edit flow turns the same layout into fields, each saving on its own (D-018).
// With no connection a flow stays readable and editing waits: "Editing needs a connection".
import { useEffect, useRef, useState, type ReactNode } from "react";
import { flowEdited, flowName, flowSummary, peopleIn } from "@/lib/flows";
import { plural } from "@/lib/dates";
import type { NameCount } from "@/lib/people";
import type { Flow } from "@/lib/types";
import Button from "@/ui/Button";
import EmptyState from "@/ui/EmptyState";
import Icon from "@/ui/Icon";
import Menu, { MenuItem, MenuSeparator } from "@/ui/Menu";
import Notice from "@/ui/Notice";
import Spinner from "@/ui/Spinner";
import { LiveTag } from "@/ui/Tag";
import { useChangedParts } from "./flowChanges";
import FlowEditor, { fieldId } from "./FlowEditor";
import FlowPath, { stepAnchor } from "./FlowPath";
import { useFlowEditing } from "./useFlowEditing";
import styles from "./Flows.module.css";

const LIT_MS = 2400;

interface FlowDocumentProps {
  flow: Flow;
  editing: boolean;
  online: boolean;
  today: string;
  labels: string[];
  names: NameCount[];
  focusFirst: boolean; // just created: its first step's title takes the focus
  onBack: () => void;
  onEdit: () => void;
  onDone: (saved: boolean) => void;
  onDelete: () => void;
}

export default function FlowDocument(props: FlowDocumentProps) {
  const changed = useChangedParts(props.flow);
  return props.editing && props.online ? <EditingDoc {...props} changed={changed} /> : <ReadingDoc {...props} changed={changed} />;
}

type DocProps = FlowDocumentProps & { changed: Set<string> };

function ReadingDoc({ flow, online, today, changed, onBack, onEdit, onDelete }: DocProps) {
  // An outcome that loops back jumps to its step and lights it up for a moment.
  const [lit, setLit] = useState<string | null>(null);
  useEffect(() => {
    if (!lit) return;
    const t = setTimeout(() => setLit(null), LIT_MS);
    return () => clearTimeout(t);
  }, [lit]);
  function jump(stepId: string) {
    setLit(stepId);
    const el = document.getElementById(stepAnchor(flow.id, stepId));
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
    el.focus({ preventScroll: true });
  }

  const people = peopleIn(flow).length;
  const edited = flowEdited(flow.updatedAt, today);
  const headId = `flow-${flow.id}-heading`;

  return (
    <article className={styles.doc} aria-labelledby={headId}>
      <DocTop
        name={flowName(flow)}
        onBack={onBack}
        menu={(
          <>
            <MenuItem icon="edit" disabled={!online} onSelect={() => { onEdit(); }}>
              Edit flow
            </MenuItem>
            <MenuSeparator />
            <MenuItem icon="trash" danger disabled={!online} onSelect={() => { onDelete(); }}>
              Delete flow
            </MenuItem>
          </>
        )}
      >
        {online ? (
          <Button small onClick={onEdit}>
            <Icon name="edit" size={16} />
            Edit flow
          </Button>
        ) : (
          <span className={`${styles.save} ${styles.off}`}>
            <Icon name="wifi" size={15} />
            Editing needs a connection
          </span>
        )}
      </DocTop>
      {!online && <OfflineNotice />}
      <header className={styles.head}>
        <span className={styles.icon} aria-hidden="true">
          <Icon name="flow" size={22} />
        </span>
        <div className={styles.id}>
          <h2 id={headId} className={styles.name}>
            <span>{flowName(flow)}</span>
            {changed.has("head") && <LiveTag>Changed just now</LiveTag>}
          </h2>
          {flow.description?.trim() && <p className={styles.desc}>{flow.description}</p>}
          <p className={styles.meta}>
            <span>{flowSummary(flow)}</span>
            {people > 0 && <span>{plural(people, "person", "people")}</span>}
            {edited && <span>{edited}</span>}
          </p>
        </div>
      </header>
      {flow.steps.length ? (
        <FlowPath flow={flow} lit={lit} changed={changed} onJump={jump} />
      ) : (
        <div className={styles.empty}>
          <EmptyState
            size="small"
            icon="flow"
            title="No steps yet"
            actions={
              online ? (
                <Button variant="main" onClick={onEdit}>
                  <Icon name="edit" size={16} />
                  Add the first step
                </Button>
              ) : undefined
            }
          >
            Write the process down step by step, with who does what in each.
          </EmptyState>
        </div>
      )}
    </article>
  );
}

function EditingDoc({ flow, labels, names, changed, focusFirst, onBack, onDone, onDelete }: DocProps) {
  const editing = useFlowEditing(flow);
  const f = editing.shown;
  const headId = `flow-${flow.id}-heading`;

  // A new flow opens with its first step ready to write; an existing one with its name.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const first = focusFirst && f.steps[0] ? fieldId(f.id, `${f.steps[0].id}.title`) : fieldId(f.id, "name");
    requestAnimationFrame(() => document.getElementById(first)?.focus());
  }, [f, focusFirst]);

  function done() {
    const saved = !editing.saving;
    editing.flush();
    onDone(saved);
  }

  return (
    <article className={`${styles.doc} ${styles.editingDoc}`} aria-labelledby={headId}>
      <DocTop
        name={flowName(f)}
        onBack={() => {
          editing.flush();
          onBack();
        }}
        menu={(
          <>
            <MenuItem icon="check" onSelect={() => { done(); }}>
              Done editing
            </MenuItem>
            <MenuSeparator />
            <MenuItem icon="trash" danger onSelect={() => { editing.flush(); onDelete(); }}>
              Delete flow
            </MenuItem>
          </>
        )}
      >
        {editing.saving ? (
          <span className={styles.save} role="status">
            <Spinner />
            Saving…
          </span>
        ) : (
          <span className={`${styles.save} ${styles.saved}`} role="status">
            <Icon name="done" size={15} />
            Saved
          </span>
        )}
        <Button variant="main" small onClick={done}>
          <Icon name="check" size={16} />
          Done
        </Button>
      </DocTop>
      <header className={styles.head}>
        <span className={styles.icon} aria-hidden="true">
          <Icon name="flow" size={22} />
        </span>
        <div className={styles.id}>
          <h2 id={headId} className="sr-only">
            {flowName(f)}
          </h2>
          <label className="sr-only" htmlFor={fieldId(f.id, "name")}>
            Flow name
          </label>
          <input
            className={styles.nameInput}
            placeholder="Name the flow"
            autoComplete="off"
            {...textField(editing, "name")}
          />
          {changed.has("head") && <LiveTag>Changed just now</LiveTag>}
          <label className="sr-only" htmlFor={fieldId(f.id, "description")}>
            Flow description
          </label>
          <textarea
            className={`${styles.text} ${styles.headText}`}
            rows={1}
            placeholder="What is this flow for, and when does it start?"
            {...textField(editing, "description")}
          />
        </div>
      </header>
      <FlowEditor editing={editing} labels={labels} names={names} changed={changed} />
    </article>
  );
}

function textField(editing: ReturnType<typeof useFlowEditing>, k: string) {
  return {
    id: fieldId(editing.shown.id, k),
    value: editing.text(k),
    onChange: (e: { currentTarget: { value: string } }) => editing.type(k, e.currentTarget.value),
    onFocus: () => editing.focus(k),
    onBlur: () => editing.blur(k),
  };
}

function DocTop({ name, onBack, menu, children }: { name: string; onBack: () => void; menu: ReactNode; children: ReactNode }) {
  const menuButton = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className={styles.docTop}>
      <span className={styles.back}>
        <Button variant="quiet" small onClick={onBack}>
          <Icon name="left" size={16} />
          All flows
        </Button>
      </span>
      <span className={styles.spacer} />
      {children}
      <Button ref={menuButton} variant="icon" aria-label="More for this flow" aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}>
        <Icon name="more" />
      </Button>
      {menuOpen && (
        <Menu open anchorRef={menuButton} onClose={() => setMenuOpen(false)} label={`More for ${name}`} alignRight>
          {menu}
        </Menu>
      )}
    </div>
  );
}

function OfflineNotice() {
  return (
    <div className={styles.docNotice}>
      <Notice tone="warning" title="No connection.">
        You can read every flow loaded before. Changes can be made once you’re back online.
      </Notice>
    </div>
  );
}
