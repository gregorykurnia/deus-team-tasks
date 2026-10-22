"use client";

// Today (guide 6.1): see what needs attention today and act on it. The hero says the day in a sentence, then Needs
// attention (with quick capture) sits beside Calendar today and Who's carrying what. Every source loads on its own:
// tasks can show while the team calendar is still loading, and the reverse.
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useCompanies, useCompaniesById, useTasks } from "@/desk/DeskData";
import PageHeader from "@/desk/PageHeader";
import { failureMessage, useConnection } from "@/lib/connection";
import { longDayLabel } from "@/lib/dates";
import { newTaskFromDraft, emptyDraft } from "@/features/task-sheet/draft";
import { isOpen } from "@/lib/taskQueries";
import { addTask, setTasksDone } from "@/lib/taskWrites";
import { attentionOf, carriersOf, heroOf, twoWeeksOf, CHART_DAYS } from "@/lib/today";
import { useCalendarEvents } from "@/lib/useCalendarEvents";
import Notice from "@/ui/Notice";
import { SearchField } from "@/ui/Inputs";
import { useToday } from "@/ui/useToday";
import { useToast } from "@/ui/Toaster";
import CalendarToday from "./CalendarToday";
import Hero from "./Hero";
import NeedsAttention, { type KindChoice } from "./NeedsAttention";
import WhoCarries from "./WhoCarries";
import styles from "./Today.module.css";

const LEAVE_MS = 900; // the row's leaving animation: .35s of waiting, then .5s sliding and fading

export default function TodayScreen() {
  const today = useToday();
  const router = useRouter();
  const toast = useToast();
  const { status } = useConnection();
  const tasks = useTasks();
  const companies = useCompanies();
  const byId = useCompaniesById();
  const events = useCalendarEvents(today, CHART_DAYS);

  const [kind, setKind] = useState<KindChoice>("all");
  const [search, setSearch] = useState("");
  const [leaving, setLeaving] = useState<ReadonlySet<string>>(new Set());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const live = timers.current;
    return () => live.forEach(clearTimeout);
  }, []);

  // Nothing has come from the server and nothing is on the device either: still loading, not empty.
  const waiting = (s: { loading: boolean; fromCache: boolean; rows: unknown[] }) =>
    s.loading || (s.fromCache && s.rows.length === 0 && status !== "live");
  const tasksFailed = !!tasks.error && tasks.rows.length === 0;
  // Opened with no connection and nothing on the device: no longer loading, but empty until the connection is back.
  const offlineEmpty = status === "offline" && tasks.fromCache && tasks.rows.length === 0 && !tasks.error;
  const pending = !today || (waiting(tasks) && !offlineEmpty) || companies.loading;
  const ready = !pending && !tasksFailed && !offlineEmpty && today !== null;

  // Open tasks (parked ones aren't), plus any just marked done that are still on their way out of the list.
  const listed = useMemo(() => tasks.rows.filter((t) => isOpen(t, today ?? undefined) || leaving.has(t.id)), [tasks.rows, leaving, today]);
  const open = useMemo(() => tasks.rows.filter((t) => isOpen(t, today ?? undefined)), [tasks.rows, today]);
  const eventList = events.status === "ok" ? events.events : null;

  const model = useMemo(() => {
    if (!ready) return null;
    return {
      hero: heroOf(open, tasks.rows, byId, today),
      weeks: twoWeeksOf(open, eventList, byId, today),
      attention: attentionOf(listed, kind, byId, today),
      people: carriersOf(open, eventList, today),
    };
  }, [ready, open, listed, tasks.rows, byId, eventList, kind, today]);

  function stopLeaving(id: string) {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setLeaving((set) => {
      const next = new Set(set);
      next.delete(id);
      return next;
    });
  }

  async function markDone(id: string) {
    const task = tasks.rows.find((t) => t.id === id);
    if (!task || task.completed) return;
    setLeaving((set) => new Set(set).add(id));
    try {
      const undo = await setTasksDone([task], true);
      timers.current.set(id, setTimeout(() => stopLeaving(id), LEAVE_MS));
      toast("Marked done", {
        action: "Undo",
        onAction: () => {
          stopLeaving(id);
          undo().catch((err) => toast(failureMessage(err, "The change couldn't be undone."), { error: true }));
        },
      });
    } catch (err) {
      stopLeaving(id);
      toast(failureMessage(err, "The task couldn't be marked done. Check your connection and try again."), { error: true });
    }
  }

  // A sentence is a task: internal work with no dates or people yet. "Add details" opens it over this screen.
  async function capture(text: string): Promise<boolean> {
    try {
      const id = await addTask(newTaskFromDraft({ ...emptyDraft(), task: text }));
      toast("Task added", { action: "Add details", onAction: () => router.push(`/?task=${id}`, { scroll: false }) });
      return true;
    } catch (err) {
      toast(failureMessage(err, "The task couldn't be added. Check your connection and try again."), { error: true });
      return false;
    }
  }

  // Companies and notes have no results designed yet (N3, provisional): the search goes to All tasks with the words, which
  // says how many companies and notes mention them too, with a link to each.
  const searchBox = (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        const q = search.trim();
        if (q) router.push(`/tasks?q=${encodeURIComponent(q)}`);
      }}
    >
      <SearchField label="Search" value={search} onChange={setSearch} placeholder="Search tasks, companies, notes" />
    </form>
  );

  return (
    <>
      <PageHeader
        title="Today"
        subtitle={today ? longDayLabel(today) : undefined}
        search={searchBox}
        phoneSearchHref="/tasks?focus=search"
        action={{ label: "New task", href: "/?task=new", newTask: true }}
      />
      {companies.error && (
        <div className={styles.screenNote}>
          <Notice tone="warning" title="Couldn't load companies.">
            Tasks for a company may show as internal work until they are back.
          </Notice>
        </div>
      )}
      <Hero hero={model?.hero ?? null} weeks={model?.weeks ?? null} events={events} error={tasksFailed} offline={offlineEmpty} onAdd={capture} />
      <div className={styles.board}>
        <NeedsAttention
          pending={!ready && !tasksFailed && !offlineEmpty}
          error={tasksFailed}
          offline={offlineEmpty}
          attention={model?.attention ?? null}
          kind={kind}
          onKind={setKind}
          openCount={open.length}
          companies={byId}
          today={today ?? ""}
          leaving={leaving}
          onDone={markDone}
          onAdd={capture}
        />
        <div className={styles.rail}>
          <CalendarToday events={events} today={today} offline={status === "offline"} />
          <WhoCarries people={model?.people ?? null} error={tasksFailed} offline={offlineEmpty} />
        </div>
      </div>
    </>
  );
}
