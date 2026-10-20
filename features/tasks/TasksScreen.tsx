"use client";

// All tasks and one task group (guide 6.2). The view (kind, open or done, filters, sort) lives in the address, so a link
// from Today lands on the right list and a reload keeps it. Every source loads on its own; a task just marked done stays
// in its list while it leaves. Select (?select=1) chooses several tasks to mark done, move or delete at once (guide 4.7).
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { groupHref, over } from "@/desk/areas";
import { useCompanies, useCompaniesById, useTaskGroups, useTasks } from "@/desk/DeskData";
import PageHeader from "@/desk/PageHeader";
import { newTaskFromDraft, emptyDraft } from "@/features/task-sheet/draft";
import QuickCapture from "@/features/today/QuickCapture";
import { assertOnline, failureMessage, useConnection } from "@/lib/connection";
import { plural } from "@/lib/dates";
import { groupNavItems, navCounts } from "@/lib/deskNav";
import { kindOf as kindOfTask, type Kind } from "@/lib/kinds";
import { deleteTaskGroup, setGroupStarred } from "@/lib/taskGroups";
import { filtersOn, effectiveSort, PAGE_SIZE, parseTaskView, listTasks, sortedByHead, switchedView, clearedFilters, viewParams, emptyCase, type EmptyCase, type TaskViewState } from "@/lib/taskView";
import type { TaskSortKey } from "@/lib/taskQueries";
import { chosenIds, headState, movedMessage, NO_SELECTION, selectAll, selectAllOffer, selectedLine, toggleChosen, toggleHead, viewChanged, type Selection } from "@/lib/taskSelection";
import { addTask, deleteTasks, moveTasksToGroup, PartlyChanged, setTasksDone, type Undo } from "@/lib/taskWrites";
import type { Task } from "@/lib/types";
import Button, { buttonClass } from "@/ui/Button";
import { Confirm } from "@/ui/Dialog";
import EmptyState from "@/ui/EmptyState";
import GroupBadge, { type GroupLook } from "@/ui/GroupBadge";
import { SearchField } from "@/ui/Inputs";
import Notice from "@/ui/Notice";
import Segmented from "@/ui/Segmented";
import { LoadingLine, SkeletonRow } from "@/ui/Skeleton";
import { useToast } from "@/ui/Toaster";
import { useMediaQuery } from "@/ui/useMediaQuery";
import { hasAnyLayer } from "@/ui/overlayStack";
import { useToday } from "@/ui/useToday";
import { useOverParam } from "@/desk/useOverParam";
import GroupChips from "./GroupChips";
import GroupDialog from "./GroupDialog";
import GroupTools from "./GroupTools";
import SelectionBar, { type BulkAction } from "./SelectionBar";
import TaskFilters from "./TaskFilters";
import TaskList from "./TaskList";
import { useDetailsShown } from "./useDetailsShown";
import styles from "./Tasks.module.css";

const TABLET_AND_SMALLER = "(max-width: 900px)";
const LEAVE_MS = 900; // the row's leaving animation: .35s of waiting, then .5s sliding and fading
const SEARCH_DELAY_MS = 180;
const num = (n: number) => n.toLocaleString("en-GB");

const KIND_NOUN: Record<Kind, string> = { prospect: "prospect", client: "client", internal: "internal" };
const KIND_WHY: Record<Kind, string> = {
  prospect: "Tasks tied to a company whose deal isn't done yet show up here.",
  client: "Tasks tied to a company whose deal is done show up here.",
  internal: "Tasks that aren't about a company show up here.",
};

export default function TasksScreen({ groupId }: { groupId?: string }) {
  const inGroup = groupId !== undefined;
  const pathname = usePathname();
  const search = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const today = useToday();
  const { status } = useConnection();
  const tasks = useTasks();
  const groups = useTaskGroups();
  const companies = useCompanies();
  const byId = useCompaniesById();
  const phone = useMediaQuery(TABLET_AND_SMALLER); // the tab bar layout: group chips and a search under the title
  const [columns, setColumns] = useDetailsShown();
  const newGroup = useOverParam("newGroup");

  const state = useMemo(() => parseTaskView(search, inGroup), [search, inGroup]);
  const group = inGroup ? groups.rows.find((g) => g.id === decodeURIComponent(groupId)) : undefined;

  // The view is written to the address in place, so Back leaves the screen rather than stepping through filters.
  // It's read fresh from the address, so a change that lands while another is still settling isn't lost.
  function update(change: (now: TaskViewState) => TaskViewState) {
    const current = new URLSearchParams(window.location.search);
    const next = change(parseTaskView(current, inGroup));
    const query = viewParams(next, inGroup, current).toString();
    window.history.replaceState(null, "", query ? `${pathname}?${query}` : pathname);
  }

  // Selecting several is in the address too (?select=1), so a reload keeps it; what's ticked is not.
  const selecting = search.has("select");
  const [selection, setSelection] = useState<Selection>(NO_SELECTION);
  const [bulkBusy, setBulkBusy] = useState<BulkAction | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [groupForMove, setGroupForMove] = useState(false);
  const selectButton = useRef<HTMLButtonElement>(null);
  function setSelecting(on: boolean) {
    const current = new URLSearchParams(window.location.search);
    if (on) current.set("select", "1");
    else current.delete("select");
    const query = current.toString();
    window.history.replaceState(null, "", query ? `${pathname}?${query}` : pathname);
    setSelection(NO_SELECTION);
    if (!on) selectButton.current?.focus();
  }

  // Search is typed as you go, and the address follows 180ms later. What's typed is never replaced by an older address.
  const [typed, setTyped] = useState(state.q);
  const committed = useRef(state.q);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    if (state.q !== committed.current) {
      committed.current = state.q;
      setTyped(state.q);
    }
  }, [state.q]);
  useEffect(() => () => clearTimeout(timer.current), []);
  function onSearch(value: string) {
    setTyped(value);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      committed.current = value;
      update((now) => ({ ...now, q: value }));
    }, SEARCH_DELAY_MS);
  }

  // Today's round search button and the header's link land here with ?focus=search.
  const searchBox = useRef<HTMLInputElement>(null);
  const focusAsked = search.get("focus") === "search";
  useEffect(() => {
    if (!focusAsked || !searchBox.current) return;
    searchBox.current.focus();
    const current = new URLSearchParams(window.location.search);
    current.delete("focus");
    const query = current.toString();
    window.history.replaceState(null, "", query ? `${pathname}?${query}` : pathname);
  }, [focusAsked, pathname, phone]);

  // The 100 shown grow with "Show 100 more" and start over whenever the view changes.
  const viewKey = viewParams(state, inGroup).toString();
  const [extra, setExtra] = useState({ key: viewKey, rows: 0 });
  const limit = PAGE_SIZE + (extra.key === viewKey ? extra.rows : 0);
  // "Select all" covers the tasks it was used on: another filter, kind or search keeps only those (12 overdue never
  // become 1,579). Sorting changes no tasks, so it keeps "Select all".
  const tasksKey = `${groupId ?? ""}?${viewParams({ ...state, sort: null, dir: null }, inGroup)}`;
  const [selectedIn, setSelectedIn] = useState(tasksKey);
  if (selectedIn !== tasksKey) {
    setSelectedIn(tasksKey);
    setSelection(viewChanged);
  }

  // A task just marked done (or not done) stays where it was, for as long as it takes to leave.
  const [leaving, setLeaving] = useState<ReadonlyMap<string, Task>>(new Map());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const live = timers.current;
    return () => live.forEach(clearTimeout);
  }, []);

  const waiting = (s: { loading: boolean; fromCache: boolean; rows: unknown[] }) => s.loading || (s.fromCache && s.rows.length === 0 && status === "connecting");
  const tasksFailed = !!tasks.error && tasks.rows.length === 0;
  const offlineEmpty = status === "offline" && tasks.fromCache && tasks.rows.length === 0 && !tasks.error;
  const groupWaiting = inGroup && (groups.loading || (groups.fromCache && groups.rows.length === 0 && status === "connecting"));
  const pending = !today || waiting(tasks) || companies.loading || groupWaiting;
  const groupMissing = inGroup && !pending && !groups.error && !group;
  const ready = !pending && !tasksFailed && !offlineEmpty && !groupMissing && !(inGroup && groups.error) && today !== null;

  const live = useMemo(() => new Map(tasks.rows.map((t) => [t.id, t])), [tasks.rows]);
  const source = useMemo(() => tasks.rows.map((t) => leaving.get(t.id) ?? t), [tasks.rows, leaving]);
  const listing = useMemo(
    () => (ready && today ? listTasks(source, state, inGroup ? group!.name : null, byId, today) : null),
    [ready, today, source, state, inGroup, group, byId]
  );
  const sort = effectiveSort(state, inGroup);
  const shownTasks = useMemo(() => (listing ? listing.sorted.slice(0, limit).map((t) => live.get(t.id) ?? t) : []), [listing, limit, live]);
  const hidden = listing ? listing.sorted.length - shownTasks.length : 0;
  const listIds = useMemo(() => (listing ? listing.sorted.map((t) => t.id) : []), [listing]);
  const shownIds = useMemo(() => shownTasks.map((t) => t.id), [shownTasks]);
  const chosen = useMemo(() => chosenIds(selection, listIds), [selection, listIds]);
  const chosenSet = useMemo(() => new Set(chosen), [chosen]);

  const groupItems = useMemo(() => groupNavItems(groups.rows, tasks.rows, byId), [groups.rows, tasks.rows, byId]);
  const groupLooks = useMemo(() => new Map<string, GroupLook>(groupItems.map((g) => [g.name, { badge: g.badge, hue: g.hue }])), [groupItems]);
  const groupItem = group ? groupItems.find((g) => g.id === group.id) : undefined;
  const openCount = useMemo(() => (inGroup ? groupItem?.open : navCounts(tasks.rows).tasks), [inGroup, groupItem, tasks.rows]);
  const countable = !tasks.loading && !tasks.error && !companies.loading;

  function stopLeaving(id: string) {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setLeaving((map) => {
      const next = new Map(map);
      next.delete(id);
      return next;
    });
  }

  async function toggleDone(task: Task, done: boolean) {
    setLeaving((map) => new Map(map).set(task.id, task));
    try {
      const undo = await setTasksDone([task], done);
      timers.current.set(task.id, setTimeout(() => stopLeaving(task.id), LEAVE_MS));
      toast(done ? "Marked done" : "Moved back to open tasks", {
        action: "Undo",
        onAction: () => {
          stopLeaving(task.id);
          undo().catch((err) => toast(failureMessage(err, "The change couldn't be undone."), { error: true }));
        },
      });
    } catch (err) {
      stopLeaving(task.id);
      toast(failureMessage(err, `The task couldn't be marked ${done ? "done" : "not done"}. Check your connection and try again.`), { error: true });
    }
  }

  // Esc stops selecting, once every menu, sheet and dialog over the screen is closed.
  const stopRef = useRef(() => setSelecting(false));
  useEffect(() => {
    stopRef.current = () => setSelecting(false);
  });
  useEffect(() => {
    if (!selecting) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape" || e.defaultPrevented || e.isComposing || hasAnyLayer() || bulkBusy) return;
      stopRef.current();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [selecting, bulkBusy]);

  // The chosen tasks as they are now. Writes go in batches of 450 (lib/batches), so "Select all" can reach thousands;
  // each batch leaves out tasks deleted since (stillThere), and one that fails part way says how far it got.
  const chosenTasks = () => chosen.map((id) => live.get(id)).filter((t): t is Task => !!t);
  const liveNow = useRef(live);
  useEffect(() => {
    liveNow.current = live;
  });
  const stillThere = (id: string) => liveNow.current.has(id);
  const undoAction = (undo: Undo | null) =>
    undo ? { action: "Undo", onAction: () => undo().catch((err) => toast(undoFailed(err), { error: true })) } : {};
  const internalChosen = useMemo(() => {
    const isInternal = (id: string) => {
      const t = live.get(id);
      return !!t && kindOfTask(t, byId) === "internal";
    };
    return chosen.filter(isInternal).length;
  }, [chosen, live, byId]);

  async function bulk(action: BulkAction, run: () => Promise<void>) {
    setBulkBusy(action);
    try {
      await run();
    } finally {
      setBulkBusy(null);
    }
  }

  function bulkDone() {
    const picked = chosenTasks();
    const done = !finished;
    void bulk(done ? "done" : "reopen", async () => {
      try {
        const undo = await setTasksDone(picked, done, stillThere);
        setSelecting(false);
        toast(done ? `${plural(picked.length, "task")} marked done` : `${plural(picked.length, "task")} moved back to open tasks`, undoAction(undo));
      } catch (err) {
        // Stopped part way: what's still chosen is what's left to do, so the same action tries again.
        if (err instanceof PartlyChanged) {
          const saved = `${num(picked.length - err.left)} of ${plural(picked.length, "task")}`;
          const message = done
            ? `${saved} marked done. Couldn't mark the other ${num(err.left)} done. Check your connection and try again.`
            : `${saved} moved back to open tasks. Couldn't move the other ${num(err.left)} back. Check your connection and try again.`;
          toast(message, { error: true, ...undoAction(err.undo) });
        } else toast(failureMessage(err, `The tasks couldn't be marked ${done ? "done" : "not done"}. Check your connection and try again.`), { error: true });
      }
    });
  }

  async function moveChosen(groupName: string | null, made?: boolean) {
    const picked = chosenTasks();
    try {
      const { skipped, undo } = await moveTasksToGroup(picked, groupName, byId, stillThere);
      setSelecting(false);
      const count = picked.length - skipped;
      const message = made ? `Group “${groupName}” created, and ${plural(count, "task")} moved into it` : movedMessage(count, groupName, skipped);
      toast(message, undoAction(undo));
    } catch (err) {
      if (!(err instanceof PartlyChanged)) throw err;
      const where = groupName ? `to ${groupName}` : "out of their groups";
      const lead = made ? `Group “${groupName}” created. ` : "";
      toast(`${lead}Moved ${num(err.changed)} of ${plural(err.changed + err.left, "task")} ${where}. Couldn't move the other ${num(err.left)}. Check your connection and try again.`, {
        error: true,
        ...undoAction(err.undo),
      });
    }
  }

  function bulkMove(groupName: string | null) {
    void bulk("move", async () => {
      try {
        await moveChosen(groupName);
      } catch (err) {
        toast(failureMessage(err, "The tasks couldn't be moved. Check your connection and try again."), { error: true });
      }
    });
  }

  // With no connection the refusal comes first, rather than after a confirmation that can't be carried out.
  function askToDelete() {
    try {
      assertOnline(`No connection. The ${chosen.length === 1 ? "task wasn't" : "tasks weren't"} deleted.`);
      setConfirmingDelete(true);
    } catch (err) {
      toast(failureMessage(err, "The tasks couldn't be deleted."), { error: true });
    }
  }

  function bulkDelete() {
    const picked = chosenTasks();
    void bulk("delete", async () => {
      try {
        await deleteTasks(picked.map((t) => t.id), stillThere);
        setConfirmingDelete(false);
        setSelecting(false);
        toast(`${plural(picked.length, "task")} deleted`);
      } catch (err) {
        setConfirmingDelete(false);
        if (err instanceof PartlyChanged)
          toast(`${num(picked.length - err.left)} of ${plural(picked.length, "task")} deleted. Couldn't delete the other ${num(err.left)}. Check your connection and try again.`, { error: true });
        else toast(failureMessage(err, "The tasks couldn't be deleted. Check your connection and try again."), { error: true });
      }
    });
  }

  // A sentence is a task: internal work, in this group when there is one. "Add details" opens it over this screen.
  async function capture(text: string): Promise<boolean> {
    try {
      const id = await addTask(newTaskFromDraft({ ...emptyDraft(group?.name ?? ""), task: text }));
      toast("Task added", { action: "Add details", onAction: () => router.push(over(pathname, window.location.search, `task=${id}`), { scroll: false }) });
      return true;
    } catch (err) {
      toast(failureMessage(err, "The task couldn't be added. Check your connection and try again."), { error: true });
      return false;
    }
  }

  const [dialog, setDialog] = useState<"rename" | "delete" | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [goneGroup, setGoneGroup] = useState(false);

  async function toggleStar() {
    if (!group) return;
    try {
      await setGroupStarred(group.id, !group.starred);
      toast(group.starred ? "No longer marked as important" : "Marked as important");
    } catch (err) {
      toast(failureMessage(err, "The group couldn't be changed. Check your connection and try again."), { error: true });
    }
  }

  async function removeGroup() {
    if (!group) return;
    setDeleting(true);
    try {
      await deleteTaskGroup(group, tasks.rows);
      setGoneGroup(true);
      setDialog(null);
      router.replace("/tasks?kind=internal");
      toast(`Group “${group.name}” deleted. Its tasks are now ungrouped.`);
    } catch (err) {
      setDialog(null);
      toast(failureMessage(err, "The group couldn't be deleted. Check your connection and try again."), { error: true });
    } finally {
      setDeleting(false);
    }
  }

  const searchField = (
    <SearchField label={inGroup ? "Search this group" : "Search tasks"} value={typed} onChange={onSearch} placeholder={inGroup ? "Search this group" : "Search tasks"} inputRef={searchBox} />
  );
  const kindOf = (k: Kind | "all") => (listing ? listing.counts[k] : undefined);
  const memberCount = group ? tasks.rows.filter((t) => t.taskGroup === group.name).length : 0;
  const newGroupHref = over(pathname, search, "newGroup=1");
  const finished = state.view === "done";
  const noun = finished ? "finished task" : "open task";

  const header = inGroup ? (
    <PageHeader
      title={group?.name ?? "Task group"}
      subtitle={countable && openCount !== undefined ? plural(openCount, "open task") : undefined}
      lead={groupItem && <GroupBadge badge={groupItem.badge} hue={groupItem.hue} size="large" />}
      search={phone ? undefined : searchField}
      tools={group && <GroupTools name={group.name} starred={group.starred} onStar={toggleStar} onRename={() => setDialog("rename")} onDelete={() => setDialog("delete")} />}
      action={{ label: "New task", href: over(pathname, search, "task=new"), newTask: true }}
    />
  ) : (
    <PageHeader
      title="Tasks"
      subtitle={countable && openCount !== undefined ? plural(openCount, "open task") : undefined}
      search={phone ? undefined : searchField}
      action={{ label: "New task", href: over(pathname, search, "task=new"), newTask: true }}
    />
  );

  let body;
  if (tasksFailed) {
    body = (
      <div className={styles.panelNote}>
        <Notice tone="error" title="Couldn't load tasks.">
          Check your connection and reload the page.
        </Notice>
      </div>
    );
  } else if (offlineEmpty) {
    body = (
      <EmptyState icon="wifi" title="No connection">
        Tasks will appear once you are back online.
      </EmptyState>
    );
  } else if (inGroup && groups.error) {
    body = (
      <div className={styles.panelNote}>
        <Notice tone="error" title="Couldn't load task groups.">
          Check your connection and reload the page.
        </Notice>
      </div>
    );
  } else if (groupMissing) {
    body = goneGroup ? null : (
      <EmptyState
        icon="folder"
        title="This task group isn't there any more"
        actions={
          <Link href="/tasks" className={buttonClass("secondary")}>
            All tasks
          </Link>
        }
      >
        Someone may have deleted it. Its tasks are under Internal.
      </EmptyState>
    );
  } else if (!listing || !today) {
    body = (
      <>
        <LoadingLine>Loading tasks</LoadingLine>
        <div className={styles.skeletons}>
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <SkeletonRow key={n} />
          ))}
        </div>
      </>
    );
  } else if (listing.sorted.length === 0) {
    const empty = emptyCase(state, inGroup, listing.scoped.length, listing.scoped.length > 0, tasks.rows.length > 0);
    body = <Empty empty={empty} state={state} groupName={group?.name} onChange={update} />;
  } else {
    body = (
      <>
        <p className={styles.result} role="status">
          {filtersOn(state) ? (
            <>
              <b>{num(listing.sorted.length)}</b> of {plural(listing.total, noun)}
              <button type="button" className={styles.linkButton} onClick={() => update(clearedFilters)}>
                Clear filters
              </button>
            </>
          ) : finished ? (
            <>
              <b>{plural(listing.sorted.length, "task")}</b> finished {{ week: "in the last 7 days", month: "in the last 30 days", all: "in all" }[state.range]}
            </>
          ) : (
            <b>{plural(listing.sorted.length, noun)}</b>
          )}
        </p>
        <TaskList
          tasks={shownTasks}
          hidden={hidden}
          pageSize={PAGE_SIZE}
          columns={columns}
          finished={finished}
          sort={sort}
          inGroup={inGroup}
          companies={byId}
          groupLooks={groupLooks}
          today={today}
          leaving={new Set(leaving.keys())}
          hrefFor={(id) => over(pathname, search, `task=${id}`)}
          onSort={(key: TaskSortKey) => update((now) => sortedByHead(now, inGroup, key))}
          onToggleDone={toggleDone}
          onMore={() => setExtra({ key: viewKey, rows: (extra.key === viewKey ? extra.rows : 0) + PAGE_SIZE })}
          selecting={
            selecting
              ? {
                  head: headState(selection, shownIds, listIds),
                  chosen: chosenSet,
                  onHead: () => setSelection((now) => toggleHead(now, shownIds, listIds)),
                  onToggle: (id) => setSelection((now) => toggleChosen(now, id, listIds)),
                }
              : undefined
          }
        />
      </>
    );
  }

  return (
    <>
      {header}
      {companies.error && (
        <div className={styles.screenNote}>
          <Notice tone="warning" title="Couldn't load companies.">
            Tasks for a company may show as internal work until they are back.
          </Notice>
        </div>
      )}
      {phone && <GroupChips groups={groupItems} currentId={group?.id ?? null} newGroupHref={newGroupHref} />}
      {phone && <div className={styles.phoneSearch}>{searchField}</div>}
      <div className={styles.tbar}>
        {!inGroup && (
          <Segmented<Kind | "all">
            label="Kind of work"
            full={phone}
            value={state.kind}
            onChange={(kind) => kind && update((now) => ({ ...now, kind, idle: kind === "internal" ? null : now.idle }))}
            options={[
              { value: "all", label: "All", count: kindOf("all") },
              { value: "prospect", label: "Prospects", count: kindOf("prospect") },
              { value: "client", label: "Clients", count: kindOf("client") },
              { value: "internal", label: "Internal", count: kindOf("internal") },
            ]}
          />
        )}
        <span className={styles.spacer} />
        <Segmented<"open" | "done">
          label="Open or done"
          full={phone}
          value={state.view}
          onChange={(view) => view && update((now) => switchedView(now, view))}
          options={[
            { value: "open", label: "Open" },
            { value: "done", label: "Done" },
          ]}
        />
      </div>
      <section className={styles.panel} aria-label={group?.name ?? "Tasks"}>
        {ready && (
          <TaskFilters
            state={state}
            inGroup={inGroup}
            sort={sort}
            shown={columns}
            onState={(next) => update(() => next)}
            onShown={setColumns}
            selecting={selecting}
            onSelecting={() => setSelecting(!selecting)}
            selectRef={selectButton}
          />
        )}
        {ready && !finished && !selecting && (
          <QuickCapture id="capture" label="New task" placeholder={group ? `Add a task to ${group.name}` : undefined} onAdd={capture} />
        )}
        {body}
      </section>
      {selecting && listing && (
        <>
          <div className={styles.barRoom} aria-hidden="true" />
          <SelectionBar
            line={selectedLine(chosen.length, selection.all)}
            offer={selectAllOffer(chosen.length, selection.all, listIds.length)}
            chosen={chosen.length}
            finished={finished}
            busy={bulkBusy}
            groups={groupItems}
            internal={internalChosen}
            onSelectAll={() => setSelection(selectAll(listIds))}
            onDone={bulkDone}
            onMove={bulkMove}
            onNewGroup={() => setGroupForMove(true)}
            onDelete={askToDelete}
            onStop={() => setSelecting(false)}
          />
        </>
      )}
      <Confirm
        open={confirmingDelete && chosen.length > 0}
        onClose={() => setConfirmingDelete(false)}
        onConfirm={bulkDelete}
        title={`Delete ${plural(chosen.length, "task")}?`}
        quote={chosen.length === 1 ? live.get(chosen[0])?.task : undefined}
        confirmLabel={`Delete ${plural(chosen.length, "task")}`}
        busy={bulkBusy === "delete"}
        busyLabel="Deleting…"
      >
        {chosen.length === 1 ? "It" : "They"} will be removed for everyone on the team.
      </Confirm>
      {groupForMove && (
        <GroupDialog
          groups={groups.rows}
          tasks={tasks.rows}
          onClose={() => setGroupForMove(false)}
          onCreated={(_id, name) => {
            setGroupForMove(false);
            void bulk("move", async () => {
              try {
                await moveChosen(name, true);
              } catch (err) {
                toast(failureMessage(err, `Group “${name}” was created, but the tasks couldn't be moved. Check your connection and try again.`), { error: true });
              }
            });
          }}
        />
      )}

      {newGroup.open && (
        <GroupDialog
          groups={groups.rows}
          tasks={tasks.rows}
          onClose={newGroup.close}
          onCreated={(id, name) => {
            router.replace(groupHref(id));
            toast(`Group “${name}” created`);
          }}
        />
      )}
      {dialog === "rename" && group && (
        <GroupDialog
          group={group}
          groups={groups.rows}
          tasks={tasks.rows}
          onClose={() => setDialog(null)}
          onRenamed={() => {
            setDialog(null);
            toast("Group renamed");
          }}
        />
      )}
      <Confirm
        open={dialog === "delete" && !!group}
        onClose={() => setDialog(null)}
        onConfirm={removeGroup}
        title={`Delete “${group?.name ?? ""}”?`}
        confirmLabel="Delete group"
        busy={deleting}
        busyLabel="Deleting…"
      >
        {memberCount > 0
          ? `Its ${plural(memberCount, "task")} stay and become ungrouped. You'll find them under Internal.`
          : "The group is empty, so no tasks are affected."}
      </Confirm>
    </>
  );
}

// An Undo of many tasks that stopped part way says how far it got.
function undoFailed(err: unknown): string {
  if (err instanceof PartlyChanged)
    return `The change was undone for ${num(err.changed)} of ${plural(err.changed + err.left, "task")}. Couldn't undo it for the other ${num(err.left)}.`;
  return failureMessage(err, "The change couldn't be undone.");
}

// What a list with nothing in it says (guide 4.15, 6.2): why it's empty, and the way out.
function Empty({ empty, state, groupName, onChange }: { empty: EmptyCase; state: TaskViewState; groupName?: string; onChange: (change: (now: TaskViewState) => TaskViewState) => void }) {
  const clear = (label: string, change: (now: TaskViewState) => TaskViewState) => <Button onClick={() => onChange(change)}>{label}</Button>;
  switch (empty.case) {
    case "idle":
      return (
        <EmptyState icon="done" title={`Nothing has gone ${empty.days} days without action`} actions={clear("Clear filter", clearedFilters)}>
          Every open company task has had some action in the last {empty.days} days.
        </EmptyState>
      );
    case "no-match": {
      const onlySearch = !state.type && !state.due && !state.idle;
      const others = !onlySearch ? " with these filters" : "";
      return (
        <EmptyState
          icon="search"
          title="No tasks match"
          actions={onlySearch ? clear("Clear search", (now) => ({ ...now, q: "" })) : clear("Clear filters", clearedFilters)}
        >
          {state.q.trim()
            ? `Nothing ${state.view === "done" ? "finished " : "open "}matches “${state.q.trim()}”${others}. Try a different search or clear the filters.`
            : "Nothing matches these filters. Try a different one or clear the filters."}
        </EmptyState>
      );
    }
    case "none-in-range":
      return (
        <EmptyState
          icon="done"
          title={`Nothing finished in the ${empty.range === "week" ? "last 7 days" : "last 30 days"}`}
          actions={clear("Show any time", (now) => ({ ...now, range: "all" }))}
        >
          Finished tasks from earlier are still here.
        </EmptyState>
      );
    case "no-finished":
      return empty.kind === "all" ? (
        <EmptyState icon="done" title="No finished tasks yet">
          When you mark a task done it moves here, out of the open work.
        </EmptyState>
      ) : (
        <EmptyState icon="done" title={`No finished ${KIND_NOUN[empty.kind]} work`}>
          {KIND_WHY[empty.kind]}
        </EmptyState>
      );
    case "empty-group":
      return (
        <EmptyState icon="folder" title={`Nothing in ${groupName ?? "this group"} yet`}>
          Add a task here, or move an internal task into this group from its details.
        </EmptyState>
      );
    case "nothing-yet":
      return (
        <EmptyState icon="list" title="Nothing on the list yet">
          Add the first thing that needs doing. A sentence is enough, and dates and people can come later.
        </EmptyState>
      );
    case "all-done":
      return (
        <EmptyState icon="done" title="Nothing open right now" actions={clear("Show finished tasks", (now) => switchedView(now, "done"))}>
          Every task is finished.
        </EmptyState>
      );
    case "no-kind":
      return (
        <EmptyState icon="done" title={`No open ${KIND_NOUN[empty.kind]} work`}>
          {KIND_WHY[empty.kind]}
        </EmptyState>
      );
  }
}
