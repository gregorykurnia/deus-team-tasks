"use client";

// Opens task details over any screen from the address: ?task=new or ?task=<id> (plan §2), so a reload keeps it and the
// phone's back gesture closes it. It waits for the server to confirm the tasks, and says so when the task isn't there;
// with no connection, a task that isn't on the device waits for the connection.
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useCompanies, useTaskGroups, useTasks } from "@/desk/DeskData";
import { without } from "@/desk/areas";
import { useConnection } from "@/lib/connection";
import type { Task } from "@/lib/types";
import Sheet from "@/ui/Sheet";
import EmptyState from "@/ui/EmptyState";
import { LoadingLine, Skeleton } from "@/ui/Skeleton";
import { useToast } from "@/ui/Toaster";
import TaskSheet from "./TaskSheet";
import styles from "./TaskSheet.module.css";

const GROUP_PAGE = /^\/tasks\/groups\/([^/]+)$/;

export default function TaskSheetHost() {
  const search = useSearchParams();
  const param = search.get("task");
  const pathname = usePathname();
  const router = useRouter();
  const tasks = useTasks();
  const groups = useTaskGroups();
  const companies = useCompanies();
  const { status } = useConnection();
  const toast = useToast();

  // Opened from inside the app (the param appeared after the first paint), closing steps back, so back doesn't
  // open it again. Opened by a reload or a shared link, closing takes the param off instead.
  const pushed = useRef(false);
  const seen = useRef<string | null | undefined>(undefined);
  const live = useRef<string | null>(param);
  useEffect(() => {
    if (seen.current !== undefined && param && !seen.current) pushed.current = true;
    if (!param) pushed.current = false;
    seen.current = param;
    live.current = param;
  }, [param]);

  const close = useCallback(() => {
    // A save that finishes after the sheet was closed some other way mustn't step back a second time.
    if (!live.current) return;
    live.current = null;
    const back = pushed.current;
    pushed.current = false;
    if (back) router.back();
    else router.replace(without(pathname, search, ["task"]), { scroll: false });
  }, [router, pathname, search]);

  // The task as last seen while open, so one deleted by a colleague mid-edit stays on screen with a note.
  const found = param && param !== "new" ? tasks.rows.find((t) => t.id === param) : undefined;
  const [held, setHeld] = useState<Task | null>(null);
  if (found && found !== held) setHeld(found);
  const shown = found ?? (held && held.id === param ? held : undefined);

  // The device's copy may be older than the link (a task added since the last visit): only the server's word, or a
  // failed load, says it isn't there. With no connection it keeps waiting, and opens once the connection is back.
  const looking = !!param && param !== "new" && !shown;
  const confirmed = !tasks.loading && (!tasks.fromCache || !!tasks.error);
  const missing = looking && confirmed;
  const waitingOffline = looking && !confirmed && status === "offline";
  const told = useRef<string | null>(null);
  useEffect(() => {
    if (!missing || told.current === param) return;
    told.current = param;
    const message = tasks.error ? "Tasks couldn't be loaded, so this task can't open. Try again in a moment." : "This task isn't there any more. Someone may have deleted it.";
    toast(message, { error: true });
    close();
  }, [missing, param, tasks.error, toast, close]);

  if (!param || missing) return null;

  if (param === "new") {
    const groupId = pathname.match(GROUP_PAGE)?.[1];
    const group = groupId ? groups.rows.find((g) => g.id === decodeURIComponent(groupId))?.name : undefined;
    // Keyed once: groups arriving late must not start the sheet again over what was typed.
    return <TaskSheet key="new" initialGroup={group} onClose={close} />;
  }

  // A company task opened before the companies arrive would read as internal work: wait for both.
  if (waitingOffline) {
    return (
      <Sheet open onClose={close} title="Task">
        <EmptyState size="small" icon="wifi" title="No connection">
          This task isn&rsquo;t on this device yet. It will open once you are back online.
        </EmptyState>
      </Sheet>
    );
  }
  if (!shown || companies.loading) {
    return (
      <Sheet open onClose={close} title="Task">
        <div className={styles.loading}>
          <LoadingLine>Loading the task</LoadingLine>
          <Skeleton height={72} />
          <Skeleton height={40} />
          <Skeleton height={46} />
        </div>
      </Sheet>
    );
  }
  return <TaskSheet key={shown.id} task={shown} gone={!found} onClose={close} />;
}
