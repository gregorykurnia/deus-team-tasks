"use client";

// The filters and the date stepper at the top of Plan's panel (guide 6.4, 4.3): Work (all work, a kind, or a task group),
// Person, Rows (timeline only), then ‹ range › and Today. A filter that's on shows its value and a round × to clear it.
import { useRef, useState } from "react";
import type { GroupNavItem } from "@/lib/deskNav";
import { KIND_LABELS, KINDS } from "@/lib/kinds";
import { isAtToday, STEP_UNIT, stepLabel, workLabel, type PlanState } from "@/lib/planView";
import Button from "@/ui/Button";
import FilterButton from "@/ui/FilterButton";
import GroupBadge from "@/ui/GroupBadge";
import Icon from "@/ui/Icon";
import Menu, { MenuChoice, MenuFoot, MenuHeading, MenuSeparator } from "@/ui/Menu";
import styles from "./Plan.module.css";

type Which = "work" | "person" | "rows";

export interface PersonOption {
  name: string;
  owned: number; // open tasks they're responsible for
}

interface PlanToolsProps {
  state: PlanState;
  today: string;
  groups: GroupNavItem[];
  people: PersonOption[];
  day: string | null; // the day Day shows, when it landed on one the address doesn't name
  onState: (next: PlanState) => void;
  onStep: (dir: -1 | 1) => void;
  onToday: () => void;
}

export default function PlanTools({ state, today, groups, people, day, onState, onStep, onToday }: PlanToolsProps) {
  const [open, setOpen] = useState<Which | null>(null);
  const workRef = useRef<HTMLButtonElement>(null);
  const personRef = useRef<HTMLButtonElement>(null);
  const rowsRef = useRef<HTMLButtonElement>(null);
  const toggle = (which: Which) => setOpen((now) => (now === which ? null : which));
  const close = () => setOpen(null);
  const showsRows = state.view === "timeline" && !state.person && state.show !== "events";
  const steps = state.view !== "people";
  const unit = STEP_UNIT[state.view];
  const here = day && state.view === "day" ? { ...state, date: day } : state;
  const atToday = isAtToday(here, today);

  return (
    <div className={styles.filters} role="toolbar" aria-label="Narrow the plan">
      <FilterButton
        ref={workRef}
        icon="filter"
        label="Work"
        value={workLabel(state)}
        expanded={open === "work"}
        onClick={() => toggle("work")}
        onClear={() => onState({ ...state, kind: null, group: null })}
      />
      {state.view !== "people" && (
        <FilterButton
          ref={personRef}
          icon="people"
          label="Person"
          value={state.person}
          expanded={open === "person"}
          onClick={() => toggle("person")}
          onClear={() => onState({ ...state, person: null })}
        />
      )}
      {showsRows && (
        <FilterButton ref={rowsRef} icon="cols" label="Rows" summary={state.rows === "kind" ? "Kind of work" : "People"} expanded={open === "rows"} onClick={() => toggle("rows")} />
      )}
      <span className={styles.spacer} />
      {steps && (
        <div className={styles.stepper}>
          <Button variant="icon" className={styles.stepButton} aria-label={`Previous ${unit}`} title={`Previous ${unit}`} onClick={() => onStep(-1)}>
            <Icon name="left" size={18} />
          </Button>
          <span className={styles.stepLabel} aria-live="polite">
            {stepLabel(here, today)}
          </span>
          <Button variant="icon" className={styles.stepButton} aria-label={`Next ${unit}`} title={`Next ${unit}`} onClick={() => onStep(1)}>
            <Icon name="right" size={18} />
          </Button>
          <Button small disabled={atToday} onClick={onToday}>
            Today
          </Button>
        </div>
      )}

      <Menu open={open === "work"} anchorRef={workRef} onClose={close} label="Work">
        <MenuHeading>Kind of work</MenuHeading>
        <MenuChoice checked={!state.kind && !state.group} onSelect={() => onState({ ...state, kind: null, group: null })}>
          All work
        </MenuChoice>
        {KINDS.map((kind) => (
          <MenuChoice key={kind} checked={state.kind === kind} onSelect={() => onState({ ...state, kind, group: null })}>
            {KIND_LABELS[kind]}
          </MenuChoice>
        ))}
        {groups.length > 0 && (
          <>
            <MenuSeparator />
            <MenuHeading>Task group</MenuHeading>
            {groups.map((g) => (
              <MenuChoice key={g.id} checked={state.group === g.name} onSelect={() => onState({ ...state, kind: null, group: g.name })}>
                <span className={styles.menuGroup}>
                  <GroupBadge badge={g.badge} hue={g.hue} />
                  <span className={styles.menuName}>{g.name}</span>
                </span>
              </MenuChoice>
            ))}
          </>
        )}
      </Menu>

      <Menu open={open === "person"} anchorRef={personRef} onClose={close} label="Person">
        <MenuHeading>Show one person&apos;s work</MenuHeading>
        <MenuChoice checked={!state.person} onSelect={() => onState({ ...state, person: null })}>
          Everyone
        </MenuChoice>
        <MenuSeparator />
        {people.map((p) => (
          <MenuChoice key={p.name} checked={state.person === p.name} onSelect={() => onState({ ...state, person: p.name })}>
            <span className={styles.menuGroup}>
              <span className={styles.menuName}>{p.name}</span>
              <span className={styles.menuCount}>{p.owned.toLocaleString("en-GB")}</span>
            </span>
          </MenuChoice>
        ))}
        <MenuFoot>The number is how many open tasks they own. Tasks they&apos;re kept informed on show outlined.</MenuFoot>
      </Menu>

      <Menu open={open === "rows"} anchorRef={rowsRef} onClose={close} label="Rows">
        <MenuHeading>One row for each</MenuHeading>
        <MenuChoice checked={state.rows === "person"} onSelect={() => onState({ ...state, rows: "person" })}>
          Person responsible
        </MenuChoice>
        <MenuChoice checked={state.rows === "kind"} onSelect={() => onState({ ...state, rows: "kind" })}>
          Kind of work
        </MenuChoice>
        <MenuFoot>A task with several people responsible shows in each of their rows.</MenuFoot>
      </Menu>
    </div>
  );
}
