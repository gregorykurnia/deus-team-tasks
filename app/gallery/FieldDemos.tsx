"use client";

// Fields in their states (task 2.6): a form like the new-task sheet, the single controls, segmented controls, filter
// buttons and the pickers. They are live, so keyboard use can be tried here.
import { useRef, useState, type ReactNode } from "react";
import Button from "@/ui/Button";
import { Chip, ChipGroup } from "@/ui/ChipGroup";
import Field from "@/ui/Field";
import FilterButton from "@/ui/FilterButton";
import { DateInput, InPlaceField, NumberInput, QuickDates, SearchField, SelectInput, Switch, TextArea, TextInput } from "@/ui/Inputs";
import Menu, { MenuChoice } from "@/ui/Menu";
import PeoplePicker, { InformedList } from "@/ui/PeoplePicker";
import SectorPicker from "@/ui/SectorPicker";
import Segmented from "@/ui/Segmented";
import type { Informed } from "@/ui/AvatarStack";

const NAMES = [
  { name: "Maya Chen", open: 5 },
  { name: "Kevin Tan", open: 2 },
  { name: "Nadia Pratama", open: 3 },
  { name: "Budi Santoso", open: 0 },
  { name: "Dian Nadira", open: 1 },
];
const SECTORS = [
  { name: "Retail", count: 12 },
  { name: "Healthcare", count: 7 },
  { name: "Food and beverage", count: 7 },
  { name: "Logistics", count: 3 },
];

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="min-w-0 rounded-panel bg-glass-strong p-5" aria-label={title}>
      <h3 className="mb-4 text-[12.5px] font-bold text-muted">{title}</h3>
      <div className="flex flex-col gap-5">{children}</div>
    </section>
  );
}

export default function FieldDemos() {
  const [description, setDescription] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [deadline, setDeadline] = useState("");
  const [priority, setPriority] = useState<"high" | "medium" | "low" | null>(null);
  const [touch, setTouch] = useState<string | null>(null);
  const [people, setPeople] = useState<string[]>(["Maya Chen"]);
  const [informed, setInformed] = useState<Informed[]>([{ name: "Kevin Tan", note: "backup" }]);
  const [sector, setSector] = useState("");
  const [kind, setKind] = useState<string | null>("all");
  const [view, setView] = useState<string | null>("open");
  const [important, setImportant] = useState(false);
  const [switchOn, setSwitchOn] = useState(false);
  const [search, setSearch] = useState("");
  const [due, setDue] = useState<string | null>(null);
  const [dueOpen, setDueOpen] = useState(false);
  const dueRef = useRef<HTMLButtonElement>(null);

  const error = submitted && !description.trim() ? "Add a short description so the team knows what this is." : undefined;

  return (
    <div className="grid w-full grid-cols-1 gap-6 md:grid-cols-2">
      <Card title="A form, like the new-task sheet">
        <Field label="Description" error={error} focusOnError>
          {(c) => <TextArea {...c} big value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What needs doing?" />}
        </Field>
        <Field label="Deadline" optional>
          {(c) => (
            <>
              <DateInput {...c} value={deadline} onChange={setDeadline} />
              <QuickDates value={deadline} onPick={setDeadline} />
            </>
          )}
        </Field>
        <Segmented
          label="Priority"
          allowClear
          value={priority}
          onChange={setPriority}
          options={[
            { value: "high", label: "High" },
            { value: "medium", label: "Medium" },
            { value: "low", label: "Low" },
          ]}
        />
        <ChipGroup
          label="Touch point"
          value={touch}
          onChange={setTouch}
          options={[
            { value: "call", label: "Call", icon: "phone" },
            { value: "email", label: "Email", icon: "mail" },
            { value: "meeting", label: "Meeting", icon: "people" },
            { value: "message", label: "Message", icon: "chat" },
            { value: "visit", label: "Visit", icon: "pin" },
          ]}
        />
        <Field label="Responsible">
          {(c) => <PeoplePicker {...c} value={people} onChange={setPeople} suggestions={NAMES} placeholder="Add a name" />}
        </Field>
        <Field label="Informed" optional>
          {() => <InformedList value={informed} onChange={setInformed} suggestions={NAMES} />}
        </Field>
        <Button variant="main" onClick={() => setSubmitted(true)}>
          Add task
        </Button>
        {submitted && description.trim() && <p className="text-[13px] text-muted">Added: {description}</p>}
      </Card>

      <div className="flex min-w-0 flex-col gap-6">
        <Card title="Single controls">
          <Field label="Text">{(c) => <TextInput {...c} defaultValue="Pelita Foods" />}</Field>
          <Field label="Placeholder">{(c) => <TextInput {...c} placeholder="Their part, like “backup”" />}</Field>
          <Field label="Disabled">{(c) => <TextInput {...c} disabled defaultValue="Read only for now" />}</Field>
          <Field label="Required, missing" error="Add a short description so the team knows what this is.">
            {(c) => <TextInput {...c} />}
          </Field>
          <Field label="Hint" hint="Leave it empty if there is none.">{(c) => <TextInput {...c} />}</Field>
          <Field label="Select">
            {(c) => (
              <SelectInput {...c} defaultValue="active">
                <option value="lead">To approach</option>
                <option value="active">Active</option>
                <option value="done">Deal done</option>
              </SelectInput>
            )}
          </Field>
          <Field label="Number">{(c) => <NumberInput {...c} defaultValue={1450} />}</Field>
          <label className="flex items-center gap-3 text-[14px] font-semibold text-ink-2">
            <Switch on={switchOn} onChange={setSwitchOn} label="Show finished tasks" />
            Show finished tasks
            <span className="ml-4 flex items-center gap-3">
              <Switch on label="On" onChange={() => undefined} />
              <Switch on={false} label="Off" onChange={() => undefined} disabled />
            </span>
          </label>
          <div>
            <Chip pressed={important} icon="star" onClick={() => setImportant((v) => !v)}>
              Mark as important
            </Chip>
          </div>
          <SearchField label="Search tasks" value={search} onChange={setSearch} placeholder="Search tasks" className="!w-full" />
          <div className="rounded-m p-2">
            <InPlaceField aria-label="Flow title" defaultValue="Onboarding a new client" className="text-[22px] font-extrabold" />
            <InPlaceField multiline aria-label="Remarks" defaultValue="Written like a document, with no box until you hover or click." />
          </div>
        </Card>

        <Card title="Segmented controls and filter buttons">
          <Segmented
            label="Kind of work"
            value={kind}
            onChange={setKind}
            options={[
              { value: "all", label: "All", count: 128 },
              { value: "pro", label: "Prospects", count: 40 },
              { value: "cli", label: "Clients", count: 31 },
              { value: "int", label: "Internal", count: 57 },
            ]}
          />
          <Segmented
            label="Open or done"
            full
            value={view}
            onChange={setView}
            options={[
              { value: "open", label: "Open", count: 128 },
              { value: "done", label: "Done", count: 1579 },
            ]}
          />
          <div className="flex flex-wrap items-center gap-3">
            <FilterButton ref={dueRef} icon="clock" label="Due" value={due} expanded={dueOpen} onClick={() => setDueOpen(true)} onClear={() => setDue(null)} />
            <FilterButton icon="filter" label="Group" onClick={() => undefined} />
            <FilterButton icon="building" label="Company" value="Pelita Foods" onClick={() => undefined} onClear={() => undefined} />
          </div>
          <Menu open={dueOpen} anchorRef={dueRef} onClose={() => setDueOpen(false)} label="Due">
            {["Overdue", "Within 3 days", "Later"].map((v) => (
              <MenuChoice key={v} checked={due === v} onSelect={() => setDue(v)}>
                {v}
              </MenuChoice>
            ))}
          </Menu>
        </Card>

        <Card title="Sector picker">
          <Field label="Sector">{(c) => <SectorPicker {...c} value={sector} onChange={setSector} sectors={SECTORS} />}</Field>
        </Card>
      </div>
    </div>
  );
}
