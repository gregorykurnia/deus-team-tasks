"use client";

// The company record (guide 6.5, 4.11, B1, B10 to B13): a 620px sheet, a bottom sheet on phones. The badge, the name, the
// group and the contact; then Follow-up task, Last action: today, the qualification notes and Move. A notice for anything
// urgent, every field the group has in sections, each opening its quick editor in place, and the company's tasks with the
// kept-in-step note. There is no Save: each change saves itself, as the foot says.
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { useCompaniesById, useNotes, useTasks } from "@/desk/DeskData";
import { over } from "@/desk/areas";
import type { PipelineEntry } from "@/lib/clientTypes";
import { fieldText, hasField, isKeptInStep, keptInStepNote, recordAlerts, recordSections } from "@/lib/companyEdit";
import { COMPANY_GROUP_LABELS, companyGroup } from "@/lib/companies";
import type { CompanyField, CompanySettings } from "@/lib/companySettings";
import { cellOf } from "@/lib/companyView";
import { initials } from "@/lib/people";
import { plural } from "@/lib/dates";
import type { Task } from "@/lib/types";
import Button, { buttonClass } from "@/ui/Button";
import Icon from "@/ui/Icon";
import Menu, { MenuItem, MenuSeparator } from "@/ui/Menu";
import Notice from "@/ui/Notice";
import Sheet from "@/ui/Sheet";
import { GroupTag } from "@/ui/Tag";
import { TaskRecordRow } from "@/ui/TaskRow";
import { CellValue } from "./CompanyList";
import { notesLink, type CompanyActions } from "./useCompanyActions";
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
}

// Open tasks by deadline, the undated last; finished ones most recent first.
const byDeadline = (a: Task, b: Task) => (a.endDate || "9999").localeCompare(b.endDate || "9999");
const byFinished = (a: Task, b: Task) => (b.completedAt ?? 0) - (a.completedAt ?? 0);

export default function CompanyRecord({ company: c, settings, today, online, actions, onClose, onEdit, onRename, onMove, onDelete }: CompanyRecordProps) {
  const tasks = useTasks();
  const notes = useNotes();
  const byId = useCompaniesById();
  const pathname = usePathname();
  const search = useSearchParams();
  const [showDone, setShowDone] = useState(false);
  const [menu, setMenu] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);

  const group = companyGroup(c);
  const fields = settings.fields[group];
  const own = useMemo(() => tasks.rows.filter((t) => t.linkedClientId === c.id), [tasks.rows, c.id]);
  const open = useMemo(() => own.filter((t) => !t.completed).sort(byDeadline), [own]);
  const done = useMemo(() => own.filter((t) => t.completed).sort(byFinished), [own]);
  const alerts = recordAlerts(c, fields, today);
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
        <button type="button" className={styles.pv} aria-label={`${f.label}: ${text || "empty"}. Change`} onClick={(e) => onEdit(e.currentTarget, c, f)}>
          {cell.kind === "empty" ? (
            <span className={styles.ph}>Add</span>
          ) : cell.kind === "text" ? (
            <span className={styles.pvText}>{cell.label}</span>
          ) : (
            <CellValue cell={cell} query="" searched={false} />
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
          </>
        }
        footer={
          <span className={online ? styles.saved : `${styles.saved} ${styles.savedOff}`}>
            <Icon name={online ? "done" : "wifi"} size={15} />
            {online ? "Changes save as you make them, for everyone." : "Offline. Changes can’t be saved."}
          </span>
        }
      >
        {(!online || alerts.length > 0) && (
          <div className={styles.recordNotices}>
            {!online && (
              <Notice tone="warning" title="No connection.">
                You can read this record, but changes can’t be saved until you’re back online.
              </Notice>
            )}
            {alerts.map((a) => (
              <Notice key={a.title} tone={a.tone} title={a.title}>
                {a.text}
              </Notice>
            ))}
          </div>
        )}
        {recordSections(fields).map((s) => (
          <section key={s.title} className={styles.rsect} aria-label={s.title}>
            <h3>{s.title}</h3>
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
      <Menu open={menu} anchorRef={menuButton} onClose={() => setMenu(false)} label={`More for ${c.company}`} alignRight>
        <MenuItem icon="edit" onSelect={() => menuButton.current && onRename(menuButton.current, c)}>
          Rename
        </MenuItem>
        <MenuItem icon="swap" onSelect={() => onMove(c)}>
          Move to another group
        </MenuItem>
        <MenuSeparator />
        <MenuItem icon="trash" danger onSelect={() => onDelete(c)}>
          Delete company
        </MenuItem>
      </Menu>
    </>
  );
}
