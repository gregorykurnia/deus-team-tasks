"use client";

// Task details (guide 6.3): a short sheet to add a task quickly, opening out to every detail; the same full sheet to
// change a task, mark it done or not done, park it or bring it back (N19), or delete it. Saving checks the description, and with no connection it's
// refused with the sheet left open and nothing lost (5.8). A company task's dates stay in step with the company (B12).
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import ParkMenu from "@/features/tasks/ParkMenu";
import { useCompanies, useCompaniesById, useFlows, useTaskGroups, useTasks } from "@/desk/DeskData";
import { addTaskKeptInStep, saveTaskKeptInStep } from "@/lib/companyWrites";
import { failureMessage } from "@/lib/connection";
import { ago, isoOf, todayIso, weekdayDate } from "@/lib/dates";
import { isDealDone, kindOf, type Kind } from "@/lib/kinds";
import { isParked } from "@/lib/parking";
import { initials, openCountsByName } from "@/lib/people";
import { sortGroups } from "@/lib/taskGroups";
import { deleteTask, putBackDone, putBackParked, setTasksDone, setTasksParked } from "@/lib/taskWrites";
import { TASK_PRIORITIES, TASK_TYPES, type FlowRole, type Task, type TaskPriority, type TaskType } from "@/lib/types";
import Button from "@/ui/Button";
import { ChipGroup } from "@/ui/ChipGroup";
import { Confirm } from "@/ui/Dialog";
import Field from "@/ui/Field";
import Icon, { type IconName } from "@/ui/Icon";
import { DateInput, SelectInput, TextArea } from "@/ui/Inputs";
import { kindStyle } from "@/ui/kindStyle";
import Notice from "@/ui/Notice";
import PeoplePicker, { InformedList } from "@/ui/PeoplePicker";
import Segmented from "@/ui/Segmented";
import Sheet, { SheetSpacer } from "@/ui/Sheet";
import { KindTag } from "@/ui/Tag";
import { useToast } from "@/ui/Toaster";
import { draftFromTask, emptyDraft, hasDescription, newTaskFromDraft, patchFromDraft, TOUCH_POINTS, type About, type TaskDraft } from "./draft";
import styles from "./TaskSheet.module.css";

const TOUCH_ICONS: Record<string, IconName> = { Call: "phone", Email: "mail", Meeting: "people", Message: "chat", Visit: "pin" };
const DESCRIPTION_MISSING = "Add a short description so the team knows what this is.";
const COMPANY_MISSING = "Choose the company this task is about, or switch to Internal work.";

interface TaskSheetProps {
  task?: Task; // none for a new task
  gone?: boolean; // deleted by someone else while open
  initialGroup?: string; // a new task opened on a task group's page starts in that group
  onClose: () => void;
}

type Busy = null | "save" | "done" | "park" | "delete";

export default function TaskSheet({ task, gone: deleted = false, initialGroup, onClose }: TaskSheetProps) {
  const tasks = useTasks();
  const groups = useTaskGroups();
  const companies = useCompanies();
  const byId = useCompaniesById();
  const flows = useFlows();
  const toast = useToast();

  const [opened] = useState<TaskDraft>(() => (task ? draftFromTask(task, byId) : emptyDraft(initialGroup)));
  const [draft, setDraft] = useState<TaskDraft>(opened);
  const [full, setFull] = useState(!!task);
  const [tries, setTries] = useState(0); // moves focus back to a missing description on each try
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const [confirming, setConfirming] = useState(false);
  const set = (patch: Partial<TaskDraft>) => setDraft((d) => ({ ...d, ...patch }));
  // Our own delete takes the task off the list before the server confirms it: that isn't someone else deleting it.
  const gone = deleted && busy !== "delete";

  const company = draft.about === "company" && draft.companyId != null ? byId.get(draft.companyId) : undefined;
  const kind: Kind = draft.about === "internal" ? "internal" : company ? kindOf({ linkedClientId: company.id }, byId) : "prospect";
  const finished = !!task?.completed;
  const today = todayIso();
  const parked = !!task && isParked(task, today);
  const [parking, setParking] = useState(false);
  const parkButton = useRef<HTMLButtonElement>(null);
  // "A company" with none chosen would save as internal work while the head says Prospect: it needs one first.
  const companyMissing = draft.about === "company" && !company;
  const error = missing && !hasDescription(draft) ? DESCRIPTION_MISSING : undefined;
  const companyError = missing && companyMissing ? COMPANY_MISSING : undefined;
  const incomplete = !hasDescription(draft) || companyMissing;

  // "Add details" opens the rest and moves on to the first new field.
  const body = useRef<HTMLDivElement>(null);
  const opening = useRef(false);
  useEffect(() => {
    if (!full || !opening.current) return;
    opening.current = false;
    body.current?.querySelector<HTMLElement>("[data-first-detail]")?.focus();
  }, [full]);

  const names = useMemo(() => {
    const roles: FlowRole[] = flows.rows.flatMap((f) => [...f.steps.flatMap((s) => s.roles), ...(f.decision?.branches.flatMap((b) => b.roles) ?? [])]);
    return openCountsByName(tasks.rows, [], roles);
  }, [tasks.rows, flows.rows]);
  const companyList = useMemo(() => [...companies.rows].sort((a, b) => a.company.localeCompare(b.company)), [companies.rows]);
  const groupList = useMemo(() => {
    const list = sortGroups(groups.rows).map((g) => ({ name: g.name, starred: !!g.starred }));
    if (draft.group && !list.some((g) => g.name === draft.group)) list.push({ name: draft.group, starred: false });
    return list;
  }, [groups.rows, draft.group]);
  const touchOptions = useMemo(() => {
    const own = draft.touchPoint && !(TOUCH_POINTS as readonly string[]).includes(draft.touchPoint) ? [draft.touchPoint] : [];
    return [...TOUCH_POINTS, ...own].map((t) => ({ value: t, label: t, icon: TOUCH_ICONS[t] ?? "chat" }));
  }, [draft.touchPoint]);

  function keptInStepMessage(lead: string, companyChanged: boolean) {
    return companyChanged && company ? `${lead}. ${company.company} now matches.` : lead;
  }

  async function save() {
    if (busy || gone) return;
    setTries((n) => n + 1);
    if (incomplete) {
      setMissing(true);
      return;
    }
    if (task) {
      const patch = patchFromDraft(opened, draft);
      if (Object.keys(patch).length === 0) {
        onClose();
        return;
      }
      setBusy("save");
      try {
        const { companyChanged } = await saveTaskKeptInStep(task, patch, byId);
        onClose();
        toast(keptInStepMessage("Changes saved", companyChanged));
      } catch (err) {
        setBusy(null);
        toast(failureMessage(err, "Your changes couldn't be saved. Check your connection and try again."), { error: true });
      }
      return;
    }
    setBusy("save");
    try {
      const { companyChanged } = await addTaskKeptInStep(newTaskFromDraft(draft), byId);
      onClose();
      toast(keptInStepMessage("Task added", companyChanged));
    } catch (err) {
      setBusy(null);
      toast(failureMessage(err, "The task couldn't be added. Check your connection and try again."), { error: true });
    }
  }

  // Marking done or not done keeps anything changed in the sheet too, so nothing typed is lost.
  async function setDone(done: boolean) {
    if (!task || busy || gone) return;
    const patch = patchFromDraft(opened, draft);
    const changed = Object.keys(patch).length > 0;
    if (changed && incomplete) {
      setTries((n) => n + 1);
      setMissing(true);
      return;
    }
    setBusy("done");
    try {
      // The changes are saved as Save changes saves them, with no Undo; the toast's Undo is for done or not done only.
      if (changed) {
        const { companyChanged } = await saveTaskKeptInStep(task, { ...patch, completed: done }, byId);
        toast(keptInStepMessage("Changes saved", companyChanged));
      } else await setTasksDone([task], done);
      onClose();
      toast(done ? "Marked done" : "Moved back to open tasks", {
        action: "Undo",
        onAction: () => void putBackDone([task]).catch((err) => toast(failureMessage(err, "The change couldn't be undone."), { error: true })),
      });
    } catch (err) {
      setBusy(null);
      const what = done ? "marked done" : "marked not done";
      toast(failureMessage(err, `The task couldn't be ${what}. Check your connection and try again.`), { error: true });
    }
  }

  // Parking or bringing back keeps anything changed in the sheet too, as marking done does.
  async function setParked(park: boolean, until: string | null = null) {
    if (!task || busy || gone) return;
    const patch = patchFromDraft(opened, draft);
    const changed = Object.keys(patch).length > 0;
    if (changed && incomplete) {
      setTries((n) => n + 1);
      setMissing(true);
      return;
    }
    setBusy("park");
    try {
      if (changed) {
        const parking = park ? { parkedAt: Date.now(), parkedUntil: until ?? undefined } : { parkedAt: undefined, parkedUntil: undefined };
        const { companyChanged } = await saveTaskKeptInStep(task, { ...patch, ...parking }, byId);
        toast(keptInStepMessage("Changes saved", companyChanged));
      } else await setTasksParked([task], park, until);
      onClose();
      toast(park ? (until ? `Parked until ${weekdayDate(until)}` : "Parked") : "Brought back to open tasks", {
        action: "Undo",
        onAction: () => void putBackParked([task]).catch((err) => toast(failureMessage(err, "The change couldn't be undone."), { error: true })),
      });
    } catch (err) {
      setBusy(null);
      toast(failureMessage(err, `The task couldn't be ${park ? "parked" : "brought back"}. Check your connection and try again.`), { error: true });
    }
  }

  async function remove() {
    if (!task || busy) return;
    setBusy("delete");
    try {
      await deleteTask(task.id);
      setConfirming(false);
      onClose();
      toast("Task deleted");
    } catch (err) {
      setBusy(null);
      setConfirming(false);
      toast(failureMessage(err, "The task couldn't be deleted. Check your connection and try again."), { error: true });
    }
  }

  const title = task ? (finished ? "Finished task" : parked ? "Parked task" : "Task") : "New task";
  const footer = gone ? (
    <>
      <SheetSpacer />
      <Button onClick={onClose}>Close</Button>
    </>
  ) : task ? (
    <>
      <Button variant="quietRed" onClick={() => setConfirming(true)} disabled={!!busy}>
        <Icon name="trash" />
        Delete
      </Button>
      <SheetSpacer />
      {parked ? (
        <Button onClick={() => void setParked(false)} busy={busy === "park"} busyLabel="Saving…" disabled={!!busy && busy !== "park"}>
          <Icon name="undo" />
          Bring back
        </Button>
      ) : (
        !finished && (
          <Button ref={parkButton} onClick={() => setParking(true)} busy={busy === "park"} busyLabel="Saving…" disabled={!!busy && busy !== "park"} aria-haspopup="menu" aria-expanded={parking}>
            <Icon name="pause" />
            Park
          </Button>
        )
      )}
      <Button onClick={() => void setDone(!finished)} busy={busy === "done"} busyLabel="Saving…" disabled={!!busy && busy !== "done"}>
        <Icon name={finished ? "undo" : "check"} />
        {finished ? "Mark not done" : "Mark done"}
      </Button>
      <Button variant="main" onClick={() => void save()} busy={busy === "save"} busyLabel="Saving…" disabled={!!busy && busy !== "save"}>
        Save changes
      </Button>
    </>
  ) : (
    <>
      <SheetSpacer />
      <Button onClick={onClose}>Cancel</Button>
      <Button variant="main" onClick={() => void save()} busy={busy === "save"} busyLabel="Adding…">
        Add task
      </Button>
    </>
  );

  return (
    <>
      <Sheet
        open
        onClose={onClose}
        title={title}
        tag={<KindTag kind={kind} />}
        short={!full}
        footer={footer}
        initialFocus={task && !gone ? 'button[aria-label="Close"]' : "[data-description]"}
      >
        <div ref={body} className={styles.form}>
          {gone && (
            <Notice tone="warning" title="This task was deleted.">
              Someone removed it while you had it open, so changes to it can&rsquo;t be saved.
            </Notice>
          )}
          {parked && task && !gone && (
            <Notice tone="info" title={task.parkedUntil ? `Parked until ${weekdayDate(task.parkedUntil)}` : "Parked until someone brings it back"}>
              {task.parkedAt ? `Parked ${ago(isoOf(new Date(task.parkedAt)), today)}. ` : ""}It&rsquo;s out of Today, Plan and the open list
              {task.parkedUntil ? ", and comes back by itself on that day" : ""}. Bring it back to work on it now.
            </Notice>
          )}
          <Field label="Description" hideLabel error={error} focusKey={tries}>
            {(control) => (
              <TextArea
                {...control}
                big
                rows={2}
                data-description
                placeholder="What needs doing?"
                value={draft.task}
                onChange={(e) => set({ task: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    void save();
                  }
                }}
              />
            )}
          </Field>

          {/* Switching keeps the company chosen, so switching back finds it again; only the side shown is saved. The group
              goes with either side. */}
          <Field label="About" group error={companyError} focusKey={error ? undefined : tries}>
            {(control) => (
              <div>
                <Segmented<About>
                  label="About"
                  full
                  large
                  options={[
                    { value: "company", label: "A company", icon: "building" },
                    { value: "internal", label: "Internal work", icon: "team" },
                  ]}
                  value={draft.about}
                  onChange={(about) => about && set({ about })}
                />
                <div className={styles.aboutBox}>
                  {draft.about === "internal" ? null : company ? (
                    <div className={styles.company} style={kindStyle(kind)}>
                      <span className={styles.mono} aria-hidden="true">
                        {initials(company.company)}
                      </span>
                      <span className={styles.companyText}>
                        <span className={styles.companyName}>{company.company}</span>
                        <small>{isDealDone(company) ? "Client, deal done" : "Prospect"}</small>
                      </span>
                      {/* A saved task's company opens (B13); one just chosen can be changed. */}
                      {task && task.linkedClientId === company.id ? (
                        <Link className={styles.open} href={`/companies?company=${company.id}`}>
                          Open company
                        </Link>
                      ) : (
                        <Button variant="quiet" small onClick={() => set({ companyId: null })} aria-label={`Change company: ${company.company}`}>
                          Change
                        </Button>
                      )}
                    </div>
                  ) : (
                    <SelectInput
                      {...control}
                      aria-label="Company"
                      value=""
                      onChange={(e) => e.target.value && set({ companyId: Number(e.target.value) })}
                    >
                      <option value="">{companies.loading ? "Loading companies…" : "Choose a company"}</option>
                      {companyList.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.company}
                        </option>
                      ))}
                    </SelectInput>
                  )}
                  <div className={draft.about === "company" ? styles.groupPick : undefined}>
                    <SelectInput aria-label="Task group" value={draft.group} onChange={(e) => set({ group: e.target.value })}>
                      <option value="">No group</option>
                      {groupList.map((g) => (
                        <option key={g.name} value={g.name}>
                          {g.starred ? `${g.name} ★` : g.name}
                        </option>
                      ))}
                    </SelectInput>
                  </div>
                </div>
              </div>
            )}
          </Field>

          {!full ? (
            <button
              type="button"
              className={styles.moreDetails}
              onClick={() => {
                opening.current = true;
                setFull(true);
              }}
            >
              <Icon name="plus" size={16} />
              <span>Add details</span>
              <SheetSpacer />
              <small>Dates, people, type, priority</small>
            </button>
          ) : (
            <>
              <div className={styles.row2}>
                <Field label="Task type" optional>
                  {(control) => (
                    <SelectInput {...control} data-first-detail value={draft.taskType} onChange={(e) => set({ taskType: e.target.value as TaskType | "" })}>
                      <option value="">None</option>
                      {TASK_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </SelectInput>
                  )}
                </Field>
                <Field label="Priority" optional group>
                  {() => (
                    <Segmented<TaskPriority>
                      label="Priority"
                      full
                      allowClear
                      options={TASK_PRIORITIES.map((p) => ({ value: p, label: p }))}
                      value={draft.priority}
                      onChange={(priority) => set({ priority })}
                    />
                  )}
                </Field>
              </div>

              <Field label="Touch point" optional group>
                {() => <ChipGroup label="Touch point" options={touchOptions} value={draft.touchPoint || null} onChange={(t) => set({ touchPoint: t ?? "" })} />}
              </Field>

              <div className={styles.row3}>
                <Field label="Start" optional>
                  {(control) => <DateInput {...control} value={draft.startDate} onChange={(startDate) => set({ startDate })} />}
                </Field>
                <Field label="Deadline" optional>
                  {(control) => <DateInput {...control} value={draft.endDate} onChange={(endDate) => set({ endDate })} />}
                </Field>
                <Field label="Last action" optional>
                  {(control) => <DateInput {...control} value={draft.lastActionDate} onChange={(lastActionDate) => set({ lastActionDate })} />}
                </Field>
              </div>
              {company && !finished && (
                <p className={styles.keptInStep}>
                  <Icon name="sync" size={16} />
                  <span>
                    The deadline and last action stay in step with {company.company}. Changing them here updates the company too.
                  </span>
                </p>
              )}

              <Field label="Responsible" optional="one or more">
                {(control) => (
                  <PeoplePicker {...control} value={draft.responsible} onChange={(responsible) => set({ responsible })} suggestions={names} placeholder="Type a name" />
                )}
              </Field>
              <Field label="Informed" optional="optional, with a note on their part">
                {(control) => <InformedList {...control} value={draft.informed} onChange={(informed) => set({ informed })} suggestions={names} />}
              </Field>
              <Field label="Key points" optional>
                {(control) => (
                  <TextArea
                    {...control}
                    rows={4}
                    placeholder="What someone picking this up should know"
                    value={draft.keyPoints}
                    onChange={(e) => set({ keyPoints: e.target.value })}
                  />
                )}
              </Field>
              {finished && task?.completedAt && <p className={styles.meta}>Finished {ago(isoOf(new Date(task.completedAt)))}.</p>}
            </>
          )}
        </div>
      </Sheet>
      <Confirm
        open={confirming && !!task && !gone}
        onClose={() => setConfirming(false)}
        onConfirm={() => void remove()}
        title="Delete this task?"
        quote={task?.task}
        confirmLabel="Delete task"
        busyLabel="Deleting…"
        busy={busy === "delete"}
      >
        It will be removed for everyone on the team.
      </Confirm>
      <ParkMenu open={parking} anchorRef={parkButton} onClose={() => setParking(false)} count={1} today={today} onPark={(until) => void setParked(true, until)} />
    </>
  );
}
