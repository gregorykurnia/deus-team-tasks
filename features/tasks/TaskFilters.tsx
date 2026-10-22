"use client";

// The filters, sort and details shown above the list (guide 6.2, 4.3, 5.6). A filter that's on shows its value and a
// round × that clears it. Sort and Finished always have a choice, so they show it without being "on". Select, beside
// Details shown, turns selecting several on and off (guide 4.7).
import { useRef, useState, type Ref } from "react";
import { COLUMNS, DEFAULT_COLUMNS, toggleColumn, type ColumnId } from "@/lib/taskColumns";
import type { SortDir, TaskSortKey } from "@/lib/taskQueries";
import {
  directionLabels,
  sortMenuKeys,
  sortSummary,
  SORT_LABELS,
  type DueChoice,
  type FinishedRange,
  type TaskViewState,
} from "@/lib/taskView";
import { TASK_TYPES, type TaskType } from "@/lib/types";
import FilterButton, { FilterToggle } from "@/ui/FilterButton";
import Menu, { MenuCheck, MenuChoice, MenuFoot, MenuHeading, MenuItem, MenuNumber, MenuSeparator } from "@/ui/Menu";
import styles from "./Tasks.module.css";

type Which = "due" | "range" | "type" | "idle" | "sort" | "details";

const DUE_LABELS: Record<DueChoice, string> = { overdue: "Overdue", soon: "Next 3 days", active: "Under way today", nodate: "No dates" };
const RANGE_LABELS: Record<FinishedRange, string> = { week: "Last 7 days", month: "Last 30 days", all: "Any time" };
const IDLE_CHOICES = [3, 7, 14, 30];

interface TaskFiltersProps {
  state: TaskViewState;
  inGroup: boolean;
  sort: { key: TaskSortKey; dir: SortDir };
  shown: ColumnId[];
  onState: (next: TaskViewState) => void;
  onShown: (shown: ColumnId[]) => void;
  selecting: boolean;
  onSelecting: () => void;
  selectRef?: Ref<HTMLButtonElement>; // gets focus back when selecting stops
}

export default function TaskFilters({ state, inGroup, sort, shown, onState, onShown, selecting, onSelecting, selectRef }: TaskFiltersProps) {
  const [open, setOpen] = useState<Which | null>(null);
  const dueRef = useRef<HTMLButtonElement>(null);
  const rangeRef = useRef<HTMLButtonElement>(null);
  const typeRef = useRef<HTMLButtonElement>(null);
  const idleRef = useRef<HTMLButtonElement>(null);
  const sortRef = useRef<HTMLButtonElement>(null);
  const detailsRef = useRef<HTMLButtonElement>(null);
  const toggle = (which: Which) => setOpen((now) => (now === which ? null : which));
  const close = () => setOpen(null);
  const done = state.view === "done";
  // A parked task has no urgency and no last action to chase, so Due and No action for are open work's only.
  const idleApplies = state.view === "open" && !inGroup && state.kind !== "internal";
  const customIdle = state.idle !== null && !IDLE_CHOICES.includes(state.idle);
  const dirs = directionLabels(sort.key);

  return (
    <div className={styles.filters} role="toolbar" aria-label="Filter and sort">
      {done ? (
        <FilterButton ref={rangeRef} icon="clock" label="Finished" summary={RANGE_LABELS[state.range]} expanded={open === "range"} onClick={() => toggle("range")} />
      ) : state.view === "open" ? (
        <FilterButton
          ref={dueRef}
          icon="clock"
          label="Due"
          value={state.due ? DUE_LABELS[state.due] : null}
          expanded={open === "due"}
          onClick={() => toggle("due")}
          onClear={() => onState({ ...state, due: null })}
        />
      ) : null}
      <FilterButton
        ref={typeRef}
        icon="filter"
        label="Type"
        value={state.type ? (state.type === "-" ? "No type" : state.type) : null}
        expanded={open === "type"}
        onClick={() => toggle("type")}
        onClear={() => onState({ ...state, type: null })}
      />
      {idleApplies && (
        <FilterButton
          ref={idleRef}
          icon="clock"
          label="No action for"
          value={state.idle ? `${state.idle}+ days` : null}
          expanded={open === "idle"}
          onClick={() => toggle("idle")}
          onClear={() => onState({ ...state, idle: null })}
        />
      )}
      <FilterButton ref={sortRef} icon="sort" label="Sort" summary={sortSummary(sort.key, sort.dir)} expanded={open === "sort"} onClick={() => toggle("sort")} />
      <span className={styles.spacer} />
      <FilterToggle ref={selectRef} icon="checks" label={selecting ? "Selecting" : "Select"} pressed={selecting} onClick={onSelecting} />
      <FilterButton ref={detailsRef} icon="cols" label="Details shown" expanded={open === "details"} onClick={() => toggle("details")} />

      <Menu open={open === "due"} anchorRef={dueRef} onClose={close} label="Due">
        <MenuHeading>Due</MenuHeading>
        <MenuChoice checked={!state.due} onSelect={() => onState({ ...state, due: null })}>
          Any time
        </MenuChoice>
        {(["overdue", "soon", "active", "nodate"] as const).map((due) => (
          <MenuChoice key={due} checked={state.due === due} onSelect={() => onState({ ...state, due })}>
            {{ overdue: "Overdue", soon: "In the next 3 days", active: "Under way today", nodate: "No dates yet" }[due]}
          </MenuChoice>
        ))}
      </Menu>

      <Menu open={open === "range"} anchorRef={rangeRef} onClose={close} label="Finished">
        <MenuHeading>Finished</MenuHeading>
        {(["week", "month", "all"] as const).map((range) => (
          <MenuChoice key={range} checked={state.range === range} onSelect={() => onState({ ...state, range })}>
            {{ week: "In the last 7 days", month: "In the last 30 days", all: "Any time" }[range]}
          </MenuChoice>
        ))}
      </Menu>

      <Menu open={open === "type"} anchorRef={typeRef} onClose={close} label="Task type">
        <MenuHeading>Task type</MenuHeading>
        <MenuChoice checked={!state.type} onSelect={() => onState({ ...state, type: null })}>
          Any type
        </MenuChoice>
        {TASK_TYPES.map((type: TaskType) => (
          <MenuChoice key={type} checked={state.type === type} onSelect={() => onState({ ...state, type })}>
            {type}
          </MenuChoice>
        ))}
        <MenuChoice checked={state.type === "-"} onSelect={() => onState({ ...state, type: "-" })}>
          No type
        </MenuChoice>
      </Menu>

      <Menu open={open === "idle"} anchorRef={idleRef} onClose={close} label="No action for">
        <MenuHeading>Company tasks with no action for</MenuHeading>
        <MenuChoice checked={!state.idle} onSelect={() => onState({ ...state, idle: null })}>
          Any
        </MenuChoice>
        {IDLE_CHOICES.map((days) => (
          <MenuChoice key={days} checked={state.idle === days} onSelect={() => onState({ ...state, idle: days })}>
            {days} days or more
          </MenuChoice>
        ))}
        <MenuSeparator />
        <MenuNumber label="At least" unit="days" initial={customIdle ? state.idle! : 21} onApply={(days) => onState({ ...state, idle: days })} />
      </Menu>

      <Menu open={open === "sort"} anchorRef={sortRef} onClose={close} label="Sort by">
        <MenuHeading>Sort by</MenuHeading>
        {sortMenuKeys(state.view, inGroup).map((key) => (
          <MenuChoice key={key} checked={sort.key === key} onSelect={() => onState({ ...state, sort: key, dir: null })}>
            {SORT_LABELS[key]}
          </MenuChoice>
        ))}
        <MenuSeparator />
        <MenuChoice checked={sort.dir === "asc"} onSelect={() => onState({ ...state, sort: sort.key, dir: "asc" })}>
          {dirs[0]}
        </MenuChoice>
        <MenuChoice checked={sort.dir === "desc"} onSelect={() => onState({ ...state, sort: sort.key, dir: "desc" })}>
          {dirs[1]}
        </MenuChoice>
        <MenuFoot>Tasks without a value always go last.</MenuFoot>
      </Menu>

      <Menu open={open === "details"} anchorRef={detailsRef} onClose={close} label="Details shown" alignRight>
        <MenuHeading>Details shown</MenuHeading>
        {COLUMNS.filter((c) => !(inGroup && c.id === "group")).map((c) => (
          <MenuCheck key={c.id} checked={shown.includes(c.id)} onSelect={() => onShown(toggleColumn(shown, c.id))}>
            {c.label}
          </MenuCheck>
        ))}
        <MenuSeparator />
        <MenuItem keepOpen onSelect={() => onShown(DEFAULT_COLUMNS)}>
          Reset to the default
        </MenuItem>
        <MenuFoot>Remembered on this device.</MenuFoot>
      </Menu>
    </div>
  );
}
