"use client";

// The company record (guide 6.5, 4.11, B1, B10 to B13): a 620px sheet, a bottom sheet on phones. The badge, the name, the
// group and the contact; then Follow-up task, Last action: today, the qualification notes and Move. A notice for anything
// urgent, every field the group has in sections, each opening its quick editor in place, and the company's tasks with the
// kept-in-step note. There is no Save: each change saves itself, as the foot says. Edit fields opens the group's Fields
// sheet over it. An Active company can be parked from here (N20); a parked one says until when, with Bring back.
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useId, useMemo, useRef, useState } from "react";
import { useCompaniesById, useNotes, useTasks } from "@/desk/DeskData";
import { over } from "@/desk/areas";
import type { PipelineEntry } from "@/lib/clientTypes";
import { fieldText, hasField, isKeptInStep, keptInStepNote, recordAlerts, recordSections } from "@/lib/companyEdit";
import { COMPANY_GROUP_LABELS, companyGroup, isCompanyParked } from "@/lib/companies";
import type { CompanyField, CompanySettings } from "@/lib/companySettings";
import { cellOf, type Cell } from "@/lib/companyView";
import { initials } from "@/lib/people";
import { ago, isoOf, plural, weekdayDate } from "@/lib/dates";
import type { Task } from "@/lib/types";
import Button, { buttonClass } from "@/ui/Button";
import Icon from "@/ui/Icon";
import Menu, { MenuFoot, MenuItem, MenuSeparator } from "@/ui/Menu";
import Notice from "@/ui/Notice";
import Sheet from "@/ui/Sheet";
import { GroupTag } from "@/ui/Tag";
import { TaskRecordRow } from "@/ui/TaskRow";
import ParkMenu from "@/features/tasks/ParkMenu";
import { CellValue } from "./CompanyList";
import { COMPANY_PARK_MENU, notesLink, type CompanyActions } from "./useCompanyActions";
import styles from "./Companies.module.css";

interface CompanyRecordProps {
  company: PipelineEntry;
  settings: CompanySettings;
  today: string;
  online: boolean;
  actions: CompanyActions;
  onClose: () => void;
  onEdit: (anchor: HTMLElement, company: PipelineEntry, field: CompanyField) => void;
  onRename: (anchor: HTMLElement, company: PipelineEntry) => void;
  onMove: (company: PipelineEntry) => void;
  onDelete: (company: PipelineEntry) => void;
  deleteBlocked: string | null; // why Delete company can't run yet
}

// Open tasks by deadline, the undated last; finished ones most recent first.
const byDeadline = (a: Task, b: Task) => (a.endDate || "9999").localeCompare(b.endDate || "9999");
const byFinished = (a: Task, b: Task) => (b.completedAt ?? 0) - (a.completedAt ?? 0);

// A value's button name keeps the words it shows (WCAG 2.5.3): "Add" when empty, and the shown words when they differ
// from the stored value (a date pill reads "Missed 17 Oct", the value is "17 Oct 2026").
function valueName(label: string, text: string, cell: Cell) {
  if (cell.kind === "empty") return `${label}: empty. Add`;
  const said = text || "empty";
  return `${label}: ${said}${said.includes(cell.label) ? "" : `, ${cell.label}`}. Change`;
}

export default function CompanyRecord({ company: c, settings, today, online, actions, onClose, onEdit, onRename, onMove, onDelete, deleteBlocked }: CompanyRecordProps) {
  const tasks = useTasks();
  const notes = useNotes();
  const byId = useCompaniesById();
  const pathname = usePathname();
  const search = useSearchParams();
  const [showDone, setShowDone] = useState(false);
  const [menu, setMenu] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const [parking, setParking] = useState(false);
  const parkButton = useRef<HTMLButtonElement>(null);
  const deleteReasonId = useId();

  const group = companyGroup(c);
  const fields = settings.fields[group];
  const own = useMemo(() => tasks.rows.filter((t) => t.linkedClientId === c.id), [tasks.rows, c.id]);
  const open = useMemo(() => own.filter((t) => !t.completed).sort(byDeadline), [own]);
  const done = useMemo(() => own.filter((t) => t.completed).sort(byFinished), [own]);
  const alerts = recordAlerts(c, fields, today);
  const parked = isCompanyParked(c, today);
  const syncNote = keptInStepNote(fields, open.length);
  const notesTo = notesLink(c, notes.rows);
  const contact = String(c.pic ?? "").trim(); // the contact person, in every group
  const taskHref = (id: string) => over(pathname, search, `task=${id}`);

  const prop = (f: CompanyField) => {
    const cell = cellOf(c, f, group, settings, today);
    const text = fieldText(c, f);
    return (
      <div key={f.key} className={f.type === "long" ? `${styles.prop} ${styles.propLong}` : styles.prop}>
        <span className={styles.pl}>
          {f.label}
          {isKeptInStep(f.key) && open.length > 0 && (
            <span className={styles.psync} title="Linked tasks follow this date">
              <Icon name="sync" size={13} label="Linked tasks follow this date" />
            </span>
          )}
        </span>
        <button type="button" className={styles.pv} aria-label={valueName(f.label, text, cell)} onClick={(e) => onEdit(e.currentTarget, c, f)}>
          {cell.kind === "empty" ? (
            <span className={styles.ph}>Add</span>
          ) : cell.kind === "text" ? (
            <span className={styles.pvText}>{cell.label}</span>
          ) : (
            <CellValue cell={cell} query="" searched={false} coldIcon />
          )}
        </button>
      </div>
    );
  };

  const taskRow = (t: Task) => (
    <TaskRecordRow key={t.id} task={t} companies={byId} today={today} href={taskHref(t.id)} onToggleDone={(d) => void actions.setTaskDone(t, d)} />
  );

  return (
    <>
      <Sheet
        open
        onClose={onClose}
        title={c.company}
        size="wide"
        initialFocus='[aria-label="Close"]'
        lead={
          <span className={`${styles.mono} ${styles.monoLarge} ${styles[group]}`} aria-hidden="true">
            {initials(c.company)}
          </span>
        }
        meta={
          <>
            <GroupTag group={group}>{COMPANY_GROUP_LABELS[group]}</GroupTag>
            {contact && <span className={styles.rc}>{contact}</span>}
          </>
        }
        tools={
          <Button ref={menuButton} variant="icon" aria-label={`More for ${c.company}`} aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(true)}>
            <Icon name="more" />
          </Button>
        }
        bar={
          <>
            <Button small onClick={() => void actions.followUp(c, today)}>
              <Icon name="plus" size={16} />
              Follow-up task
            </Button>
            {hasField(fields, "date") && (
              <Button small onClick={() => void actions.logToday(c, today)}>
                <Icon name="clock" size={16} />
                Last action: today
              </Button>
            )}
            <Link className={buttonClass("secondary", true)} href={notesTo.href}>
              <Icon name="note" size={16} />
              {notesTo.label}
            </Link>
            <Button small onClick={() => onMove(c)}>
              <Icon name="swap" size={16} />
              Move
            </Button>
            {group === "active" &&
              (parked ? (
                <Button small onClick={() => void actions.bringBack(c)}>
                  <Icon name="undo" size={16} />
                  Bring back
                </Button>
              ) : (
                <Button small ref={parkButton} aria-haspopup="menu" aria-expanded={parking} onClick={() => setParking(true)}>
                  <Icon name="pause" size={16} />
                  Park
                </Button>
              ))}
          </>
        }
        footer={
          <span className={online ? styles.saved : `${styles.saved} ${styles.savedOff}`}>
            <Icon name={online ? "done" : "wifi"} size={15} />
            {online ? "Changes save as you make them, for everyone." : "Offline. Changes can’t be saved."}
          </span>
        }
      >
        {(!online || alerts.length > 0 || parked) && (
          <div className={styles.recordNotices}>
            {!online && (
              <Notice tone="warning" title="No connection.">
                You can read this record, but changes can’t be saved until you’re back online.
              </Notice>
            )}
            {parked && (
              <Notice tone="info" title={c.parkedUntil ? `Parked until ${weekdayDate(c.parkedUntil)}` : "Parked until someone brings it back"}>
                {c.parkedAt ? `Parked ${ago(isoOf(new Date(c.parkedAt)), today)}. ` : ""}It&rsquo;s out of Where to act and never shows as gone cold or late
                {c.parkedUntil ? ", and comes back by itself on that day" : ""}. Bring it back to work on it now.
              </Notice>
            )}
            {alerts.map((a) => (
              <Notice key={a.title} tone={a.tone} title={a.title} icon={a.icon}>
                {a.text}
              </Notice>
            ))}
          </div>
        )}
        {recordSections(fields).map((s) => (
          <section key={s.title} className={styles.rsect} aria-label={s.title}>
            <h3>
              {s.title}
              {s.own && (
                <Link className={`${buttonClass("link")} ${styles.rlink}`} href={over(pathname, search, `fields=${group}`)} scroll={false}>
                  Edit fields
                </Link>
              )}
            </h3>
            {s.fields.length ? s.fields.map(prop) : <p className={styles.rnone}>No fields of your own yet in this group.</p>}
          </section>
        ))}
        <section className={`${styles.rsect} ${styles.rtasks}`} aria-label="Tasks">
          <h3>
            Tasks
            {open.length > 0 && <span className={styles.rcount}>{open.length.toLocaleString("en-GB")} open</span>}
            <Button variant="link" className={styles.rlink} onClick={() => void actions.followUp(c, today)}>
              <Icon name="plus" size={14} />
              Follow-up task
            </Button>
          </h3>
          {open.length > 0 ? (
            <>
              {syncNote && (
                <p className={styles.syncNote}>
                  <Icon name="sync" size={16} />
                  <span>{syncNote}</span>
                </p>
              )}
              <div className={styles.rtaskList}>{open.map(taskRow)}</div>
            </>
          ) : (
            <p className={styles.rnone}>No open tasks. A follow-up task keeps the next step on everyone’s list.</p>
          )}
          {done.length > 0 && (
            <>
              <Button variant="link" className={styles.rdone} aria-expanded={showDone} onClick={() => setShowDone((s) => !s)}>
                {showDone ? "Hide" : "Show"} {plural(done.length, "finished task")}
              </Button>
              {showDone && <div className={styles.rtaskList}>{done.map(taskRow)}</div>}
            </>
          )}
        </section>
      </Sheet>
      <ParkMenu
        open={parking}
        anchorRef={parkButton}
        onClose={() => setParking(false)}
        count={1}
        today={today}
        onPark={(until) => void actions.park(c, until)}
        {...COMPANY_PARK_MENU}
      />
      <Menu open={menu} anchorRef={menuButton} onClose={() => setMenu(false)} label={`More for ${c.company}`} alignRight>
        <MenuItem icon="edit" onSelect={() => menuButton.current && onRename(menuButton.current, c)}>
          Rename
        </MenuItem>
        <MenuItem icon="swap" onSelect={() => onMove(c)}>
          Move to another group
        </MenuItem>
        <MenuSeparator />
        <MenuItem icon="trash" danger onSelect={() => onDelete(c)} disabled={!!deleteBlocked} describedBy={deleteBlocked ? deleteReasonId : undefined}>
          Delete company
        </MenuItem>
        {deleteBlocked && <MenuFoot id={deleteReasonId}>{deleteBlocked}</MenuFoot>}
      </Menu>
    </>
  );
}
