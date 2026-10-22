"use client";

// The filters and sort above the list (guide 6.5, 4.3, 5.6): Status, Priority and Product where the group has them, then
// Sort, Select (Active only, to park several, N20), Fields and Export. A filter that's on shows its value and a round ×
// that clears it.
import { useRef, useState, type Ref } from "react";
import { NO_VALUE, type ProductOption } from "@/lib/companies";
import type { ChoiceOption, CompanyField } from "@/lib/companySettings";
import {
  availableFilters,
  directionLabels,
  effectiveSort,
  filterValueLabel,
  productLabel,
  sortChoices,
  sortSummary,
  type CompanyViewState,
} from "@/lib/companyView";
import FilterButton, { FilterAction, FilterToggle } from "@/ui/FilterButton";
import Menu, { MenuChoice, MenuFoot, MenuHeading, MenuSeparator } from "@/ui/Menu";
import OptionChip from "@/ui/OptionChip";
import styles from "./Companies.module.css";

type Which = "product" | "sort";

interface CompanyFiltersProps {
  state: CompanyViewState;
  fields: CompanyField[]; // every field the group has
  options: Record<string, ChoiceOption[]>;
  products: ProductOption[]; // written in the group, spellings merged
  onState: (next: CompanyViewState) => void;
  onFields: () => void;
  onExport: () => void;
  selecting?: boolean; // Active only: undefined leaves Select out
  onSelecting: () => void;
  selectRef?: Ref<HTMLButtonElement>; // gets focus back when selecting stops
}

export default function CompanyFilters({ state, fields, options, products, onState, onFields, onExport, selecting, onSelecting, selectRef }: CompanyFiltersProps) {
  const [open, setOpen] = useState<Which | null>(null);
  const productRef = useRef<HTMLButtonElement>(null);
  const sortRef = useRef<HTMLButtonElement>(null);
  const toggle = (which: Which) => setOpen((now) => (now === which ? null : which));
  const close = () => setOpen(null);
  const has = availableFilters(fields);
  const sort = effectiveSort(state, fields);
  const dirs = directionLabels(sort.key, fields.find((f) => f.key === sort.key));

  return (
    <div className={styles.filters} role="toolbar" aria-label="Filter, sort and export">
      {has.status && <ChoiceFilter name="status" label="Status" any="Any status" state={state} options={options.status ?? []} onState={onState} />}
      {has.priority && <ChoiceFilter name="priority" label="Priority" any="Any priority" state={state} options={options.priority ?? []} onState={onState} />}
      {has.product && (
        <>
          <FilterButton
            ref={productRef}
            icon="filter"
            label="Product"
            value={state.product ? productLabel(state.product, products) : null}
            expanded={open === "product"}
            onClick={() => toggle("product")}
            onClear={() => onState({ ...state, product: null })}
          />
          <Menu open={open === "product"} anchorRef={productRef} onClose={close} label="Product">
            <MenuHeading>Product</MenuHeading>
            <MenuChoice checked={!state.product} onSelect={() => onState({ ...state, product: null })}>
              Any product
            </MenuChoice>
            {products.map((p) => (
              <MenuChoice key={p.key} checked={state.product === p.key} onSelect={() => onState({ ...state, product: p.key })}>
                {`${p.label} (${p.count.toLocaleString("en-GB")})`}
              </MenuChoice>
            ))}
            {products.length === 0 && <MenuFoot>No company here has a product yet.</MenuFoot>}
          </Menu>
        </>
      )}
      <FilterButton ref={sortRef} icon="sort" label="Sort" summary={sortSummary(sort, fields)} expanded={open === "sort"} onClick={() => toggle("sort")} />
      <Menu open={open === "sort"} anchorRef={sortRef} onClose={close} label="Sort by">
        <MenuHeading>Sort by</MenuHeading>
        {sortChoices(fields, state.parked).map((c) => (
          <MenuChoice key={c.key} checked={sort.key === c.key} onSelect={() => onState({ ...state, sort: c.key, dir: null })}>
            {c.label}
          </MenuChoice>
        ))}
        <MenuSeparator />
        <MenuChoice checked={sort.dir === "asc"} onSelect={() => onState({ ...state, sort: sort.key, dir: "asc" })}>
          {dirs[0]}
        </MenuChoice>
        <MenuChoice checked={sort.dir === "desc"} onSelect={() => onState({ ...state, sort: sort.key, dir: "desc" })}>
          {dirs[1]}
        </MenuChoice>
        <MenuFoot>
          Companies without a value always go last.{" "}
          {state.parked ? "Normally: the soonest to come back first." : state.group === "toApproach" ? "Normally: planned outreach, soonest first." : "Normally: most recent action first."}
        </MenuFoot>
      </Menu>
      {selecting !== undefined && <FilterToggle ref={selectRef} icon="checks" label={selecting ? "Selecting" : "Select"} pressed={selecting} onClick={onSelecting} />}
      <FilterAction icon="sliders" label="Fields" opens="dialog" onClick={onFields} />
      <FilterAction icon="download" label="Export" opens="dialog" onClick={onExport} />
    </div>
  );
}

// Status and Priority: pick one of the field's options, or "None" for companies without one.
function ChoiceFilter({ name, label, any, state, options, onState }: { name: "status" | "priority"; label: string; any: string; state: CompanyViewState; options: ChoiceOption[]; onState: (next: CompanyViewState) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const value = state[name];
  return (
    <>
      <FilterButton
        ref={ref}
        icon={name === "status" ? "choice" : "flag"}
        label={label}
        value={value ? filterValueLabel(value) : null}
        expanded={open}
        onClick={() => setOpen((now) => !now)}
        onClear={() => onState({ ...state, [name]: null })}
      />
      <Menu open={open} anchorRef={ref} onClose={() => setOpen(false)} label={label}>
        <MenuHeading>{label}</MenuHeading>
        <MenuChoice checked={!value} onSelect={() => onState({ ...state, [name]: null })}>
          {any}
        </MenuChoice>
        {options.map((o) => (
          <MenuChoice key={o.name} checked={value === o.name} onSelect={() => onState({ ...state, [name]: o.name })}>
            <OptionChip tone={o.colour}>{o.name}</OptionChip>
          </MenuChoice>
        ))}
        <MenuChoice checked={value === NO_VALUE} onSelect={() => onState({ ...state, [name]: NO_VALUE })}>
          None
        </MenuChoice>
      </Menu>
    </>
  );
}
