"use client";

// Flows (guide 6.8, M1 to M4, D-018): the flows A to Z on the left and one flow on the right; on phones the list, then one
// flow full screen with "All flows". /flows/<id> is the flow open, ?edit=1 edits it, and New flow is ?newFlow=1. The
// screen sits in the flows layout, so moving between flows keeps what's typed in the search.
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useFlows, useTasks } from "@/desk/DeskData";
import { over } from "@/desk/areas";
import { ConnectionBanner } from "@/desk/ConnectionBanner";
import PageHeader from "@/desk/PageHeader";
import { useOverParam } from "@/desk/useOverParam";
import { failureMessage, useConnection } from "@/lib/connection";
import { plural } from "@/lib/dates";
import { flowName, newFlowData, rolesIn, searchFlows, sortFlows } from "@/lib/flows";
import { addFlow, deleteFlow } from "@/lib/flowWrites";
import { openCountsByName } from "@/lib/people";
import type { Flow } from "@/lib/types";
import Button from "@/ui/Button";
import { Confirm } from "@/ui/Dialog";
import EmptyState from "@/ui/EmptyState";
import Notice from "@/ui/Notice";
import { LoadingLine, Skeleton, SkeletonRow } from "@/ui/Skeleton";
import { useToast } from "@/ui/Toaster";
import { useMediaQuery } from "@/ui/useMediaQuery";
import { useToday } from "@/ui/useToday";
import { roleLabelsInUse } from "./FlowEditor";
import FlowDocument from "./FlowDocument";
import FlowsList from "./FlowsList";
import NewFlowDialog from "./NewFlowDialog";
import styles from "./Flows.module.css";

const TABLET_AND_SMALLER = "(max-width: 900px)";
const GONE = "This flow isn’t there any more. Someone may have deleted it.";

function idFromPath(pathname: string): string | null {
  const m = pathname.match(/^\/flows\/([^/]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

const flowHref = (id: string | null, edit = false) => `${id ? `/flows/${encodeURIComponent(id)}` : "/flows"}${edit ? "?edit=1" : ""}`;

export default function FlowsScreen() {
  const pathname = usePathname();
  const router = useRouter();
  const search = useSearchParams();
  const today = useToday();
  const { status, online } = useConnection();
  const flows = useFlows();
  const tasks = useTasks();
  const toast = useToast();
  const phone = useMediaQuery(TABLET_AND_SMALLER);

  const flowId = idFromPath(pathname);
  const editing = search.has("edit");
  const [query, setQuery] = useState("");

  // The device's copy can be older than the server's: a flow is only missing once the server has answered, or once
  // there's no connection and the copy is all there is.
  const settled = !flows.loading && (!flows.fromCache || status === "offline");
  const sorted = useMemo(() => sortFlows(flows.rows), [flows.rows]);
  const shown = useMemo(() => searchFlows(sorted, query), [sorted, query]);
  const flow = flowId ? flows.rows.find((f) => f.id === flowId) : undefined;

  // Names and role labels in use, on tasks and every flow (W4).
  const roles = useMemo(() => rolesIn(flows.rows), [flows.rows]);
  const names = useMemo(() => openCountsByName(tasks.rows, [], roles), [tasks.rows, roles]);
  const labels = useMemo(() => roleLabelsInUse(roles.map((r) => r.label)), [roles]);

  // A flow that's gone (gap N12): opened from a link after it was deleted, or deleted by a colleague while open.
  const deletedHere = useRef<string | null>(null);
  const told = useRef<string | null>(null);
  const missing = !!flowId && settled && !flow;
  useEffect(() => {
    if (!missing || told.current === flowId) return;
    told.current = flowId;
    if (deletedHere.current !== flowId) {
      toast(flows.error ? "Flows couldn't be loaded, so this flow can't open. Try again in a moment." : online ? GONE : "No connection. This flow opens once the connection is back.", { error: true });
    }
    router.replace(flowHref(null), { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missing, flowId]);
  useEffect(() => {
    if (!missing) told.current = null;
  }, [missing]);

  // On large screens a flow is always open: the first in the list, when none is chosen.
  const first = shown[0]?.id;
  useEffect(() => {
    if (phone || flowId || !first) return;
    router.replace(`${flowHref(first)}${window.location.search}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phone, flowId, first]);

  // "All flows" steps back to the list when that's where the flow was opened from.
  const fromList = useRef(false);
  function back() {
    if (fromList.current) {
      fromList.current = false;
      router.back();
    } else router.push(flowHref(null), { scroll: false });
  }

  /* ---------- New, delete ---------- */

  const newFlow = useOverParam("newFlow");
  const [justMade, setJustMade] = useState<string | null>(null);
  async function create(name: string) {
    const id = await addFlow(newFlowData(name, flows.rows));
    setJustMade(id);
    setQuery("");
    router.replace(flowHref(id, true), { scroll: false });
    toast(`Flow “${name.trim()}” created. Add its steps; everything saves as you go.`);
  }

  const [deleting, setDeleting] = useState<Flow | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  async function confirmDelete() {
    if (!deleting || deleteBusy) return;
    const name = flowName(deleting);
    setDeleteBusy(true);
    deletedHere.current = deleting.id;
    try {
      await deleteFlow(deleting.id);
      setDeleting(null);
      router.replace(flowHref(null), { scroll: false });
      toast(`Flow “${name}” deleted`);
    } catch (err) {
      deletedHere.current = null;
      setDeleting(null);
      toast(failureMessage(err, "The flow wasn’t deleted. Check your connection and try again."), { error: true });
    } finally {
      setDeleteBusy(false);
    }
  }

  /* ---------- What shows ---------- */

  const failed = !!flows.error && flows.rows.length === 0;
  const offlineEmpty = status === "offline" && flows.fromCache && flows.rows.length === 0 && !flows.error;
  const waiting = !today || (flows.loading && flows.rows.length === 0) || (flows.fromCache && flows.rows.length === 0 && status === "connecting");
  const nothingYet = !waiting && !failed && !offlineEmpty && flows.rows.length === 0;
  const hideHeader = phone && !!flowId;
  const newHref = over(pathname, search, "newFlow=1");

  let content;
  if (failed) {
    content = (
      <div className={styles.screenNote}>
        <Notice tone="error" title="Couldn't load flows.">
          Check your connection and reload the page.
        </Notice>
      </div>
    );
  } else if (offlineEmpty) {
    content = (
      <div className={styles.screenNote}>
        <EmptyState icon="wifi" title="No connection">
          Flows will appear once you are back online.
        </EmptyState>
      </div>
    );
  } else if (waiting) {
    content = (
      <div className={styles.wrap}>
        <section className={styles.panel} aria-label="Flows">
          <div className={styles.find}>
            <LoadingLine>Loading flows</LoadingLine>
          </div>
          <div className={styles.skeletons}>
            {[1, 2, 3, 4].map((n) => (
              <SkeletonRow key={n} />
            ))}
          </div>
        </section>
        {!phone && <DocSkeleton />}
      </div>
    );
  } else if (nothingYet) {
    content = (
      <div className={styles.screenNote}>
        <EmptyState
          icon="flow"
          title="No flows yet"
          actions={
            <Button variant="main" onClick={() => router.push(newHref, { scroll: false })}>
              New flow
            </Button>
          }
        >
          A flow writes down a process that involves several people: the steps in order, who is responsible, consulted or informed in each, and what happens at a decision.
        </EmptyState>
      </div>
    );
  } else if (today) {
    let doc;
    if (flow) {
      doc = (
        <FlowDocument
          key={flow.id}
          flow={flow}
          editing={editing}
          online={online}
          today={today}
          labels={labels}
          names={names}
          focusFirst={justMade === flow.id}
          onBack={back}
          onEdit={() => router.replace(flowHref(flow.id, true), { scroll: false })}
          onDone={(saved) => {
            setJustMade(null);
            router.replace(flowHref(flow.id), { scroll: false });
            if (saved) toast("Flow saved for everyone");
          }}
          onDelete={() => setDeleting(flow)}
        />
      );
    } else if (flowId) {
      doc = <DocSkeleton />;
    } else {
      doc = (
        <article className={`${styles.doc} ${styles.docNone}`}>
          <EmptyState icon="flow" title="Choose a flow">
            Each flow lists its steps in order, who does what in each, and any decision along the way.
          </EmptyState>
        </article>
      );
    }
    content = (
      <div className={flowId ? `${styles.wrap} ${styles.open}` : styles.wrap}>
        <FlowsList
          all={flows.rows.length}
          shown={shown}
          query={query}
          current={flowId}
          today={today}
          replace={!phone}
          hrefFor={(id) => flowHref(id)}
          onQuery={setQuery}
          onPick={() => {
            if (phone) fromList.current = true;
          }}
        />
        {doc}
      </div>
    );
  }

  return (
    <>
      {/* A flow open full screen on a phone has no header, but the no-connection banner stays. */}
      {hideHeader ? (
        <ConnectionBanner />
      ) : (
        <PageHeader
          title="Flows"
          subtitle={settled || flows.rows.length ? plural(flows.rows.length, "flow") : undefined}
          action={{ label: "New flow", href: newHref }}
        />
      )}
      {content}

      {newFlow.open && <NewFlowDialog onClose={newFlow.close} onCreate={create} />}
      <Confirm
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => void confirmDelete()}
        title={deleting ? `Delete “${flowName(deleting)}”?` : "Delete this flow?"}
        confirmLabel="Delete flow"
        busyLabel="Deleting…"
        busy={deleteBusy}
      >
        {deleting && deleteBody(deleting)}
      </Confirm>
    </>
  );
}

// "Its 5 steps and the decision go, for everyone on the team."
function deleteBody(f: Flow): string {
  const n = f.steps.length;
  const what = n && f.decision ? `Its ${plural(n, "step")} and the decision go` : n ? `Its ${plural(n, "step")} ${n === 1 ? "goes" : "go"}` : f.decision ? "Its decision goes" : "It goes";
  return `${what}, for everyone on the team.`;
}

function DocSkeleton() {
  return (
    <article className={styles.doc} aria-hidden="true">
      <Skeleton height={30} width="50%" />
      <div style={{ marginTop: 16 }}>
        <Skeleton height={16} width="70%" />
      </div>
      {[1, 2, 3].map((n) => (
        <div key={n} style={{ marginTop: 22 }}>
          <Skeleton height={90} />
        </div>
      ))}
    </article>
  );
}
