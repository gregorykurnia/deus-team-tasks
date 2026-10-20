"use client";

// The switches under Plan's title (guide 6.4, 4.2): the view on the left (Timeline, Month, Day, People) and what to show
// on the right (Tasks and events, Tasks, Events). People shows tasks only, so it has no show switch.
import type { PlanShow, PlanState, PlanViewName } from "@/lib/planView";
import Segmented from "@/ui/Segmented";
import { useMediaQuery } from "@/ui/useMediaQuery";
import styles from "./Plan.module.css";

const SMALL_SCREEN = "(max-width: 760px)";

interface PlanBarProps {
  state: PlanState;
  onState: (next: PlanState) => void;
}

export default function PlanBar({ state, onState }: PlanBarProps) {
  const phone = useMediaQuery(SMALL_SCREEN);
  return (
    <div className={styles.tbar}>
      <Segmented<PlanViewName>
        label="View"
        full={phone}
        value={state.view}
        onChange={(view) => view && onState({ ...state, view, date: view === "day" ? null : state.date })}
        options={[
          { value: "timeline", label: "Timeline" },
          { value: "month", label: "Month" },
          { value: "day", label: "Day" },
          { value: "people", label: "People" },
        ]}
      />
      <span className={styles.spacer} />
      {state.view !== "people" && (
        <Segmented<PlanShow>
          label="Show"
          full={phone}
          value={state.show}
          onChange={(show) => show && onState({ ...state, show })}
          options={[
            { value: "all", label: "Tasks and events" },
            { value: "tasks", label: "Tasks" },
            { value: "events", label: "Events" },
          ]}
        />
      )}
    </div>
  );
}
