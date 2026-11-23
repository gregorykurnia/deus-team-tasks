"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { over, without } from "@/desk/areas";
import { LeaveApiError } from "@/lib/leaveClient";
import { safeSignInNext } from "@/lib/signInClient";
import { retrySignInSession, signOutDevice, useSignInSession } from "@/lib/useSignedIn";
import Button from "@/ui/Button";
import buttonStyles from "@/ui/Button.module.css";
import Icon from "@/ui/Icon";
import Notice from "@/ui/Notice";
import Segmented from "@/ui/Segmented";
import { LoadingLine, Skeleton } from "@/ui/Skeleton";
import { useToast } from "@/ui/Toaster";
import { dismissSignInNotice } from "@/features/sign-in/signInNotice";
import AskLeaveSheet from "./AskLeaveSheet";
import { useLeaveData } from "./LeaveData";
import { LeaveBalance, LeaveHistory, LeaveRequests, leaveRecordViews, type LeaveRecordView } from "./LeaveRecords";
import RequestSheet from "./RequestSheet";
import TeamLeaveScreen from "./TeamLeaveScreen";
import styles from "./Leave.module.css";

const leavePath = "/leave";
const audiences = [{ value: "mine", label: "Mine" }, { value: "team", label: "Team" }] as const;

export function LeaveLoading() {
  return (
    <div className={styles.stack}>
      <div className={styles.balance}>
        <div className={styles.balanceTop}>
          <div>
            <LoadingLine>Loading leave</LoadingLine>
            <Skeleton width="9rem" height="2.75rem" />
          </div>
          <Skeleton width="8rem" height="2.75rem" />
        </div>
        <div className={styles.totals} aria-hidden="true">
          <Skeleton width="100%" height="3.625rem" />
          <Skeleton width="100%" height="3.625rem" />
          <Skeleton width="100%" height="3.625rem" />
        </div>
      </div>
      <div className={styles.skeletonRows} aria-hidden="true">
        <Skeleton width="100%" height="3.5rem" />
        <Skeleton width="100%" height="3.5rem" />
      </div>
    </div>
  );
}

export default function LeaveScreen() {
  const search = useSearchParams();
  const router = useRouter();
  const { person, ready, error: sessionError } = useSignInSession();
  const { online, data, error, refresh } = useLeaveData();
  const toast = useToast();
  const openedHere = useRef<string | null>(null);
  const openedAskHere = useRef(false);
  const sentToast = useRef<number | null>(null);
  const warned = useRef<string | null>(null);
  const wantsTeam = search.get("view") === "team";
  const showTeam = !!data?.isAdmin && wantsTeam;
  const asking = !wantsTeam && search.get("ask") === "1";
  const requestId = search.get("request");
  const selected = !wantsTeam ? data?.requests.find(({ id }) => id === requestId) : undefined;
  const view = search.get("view") === "history" ? "history" : "requests";

  useEffect(() => {
    if (requestId === null) {
      openedHere.current = null;
      warned.current = null;
    } else if (!asking && data?.profile && !selected && warned.current !== requestId && !wantsTeam) {
      warned.current = requestId;
      toast("This leave request couldn't be found.");
      router.replace(without(leavePath, search, ["request"]), { scroll: false });
    }
  }, [asking, data, requestId, router, search, selected, toast, wantsTeam]);

  useEffect(() => {
    if (data && !data.isAdmin && wantsTeam) {
      router.replace(without(leavePath, search, ["view", "request", "person", "ask", "holidays"]), { scroll: false });
    }
  }, [data, router, search, wantsTeam]);

  useEffect(() => {
    if (!asking) openedAskHere.current = false;
    if (asking) dismissSignInNotice();
    if ((asking || requestId) && sentToast.current !== null) {
      toast.dismiss(sentToast.current);
      sentToast.current = null;
    }
  }, [asking, requestId, toast]);

  function closeRequest() {
    if (openedHere.current === requestId) router.back();
    else router.replace(without(leavePath, search, ["request"]), { scroll: false });
  }

  function closeAsk(sent = false) {
    if (openedAskHere.current && !(sent && view === "history")) router.back();
    else router.replace(without(leavePath, search, sent ? ["ask", "request", "view"] : ["ask"]), { scroll: false });
  }

  const managingTeam = showTeam && (!!search.get("person")?.trim() || search.get("holidays") === "1");
  if (!online && !managingTeam && !(asking && data?.summary)) return <Notice tone="warning" icon="wifi" title="Leave needs a connection.">Connect to the internet to see your leave.</Notice>;
  if (!ready) return <LeaveLoading />;
  if (sessionError) return <Notice tone="error" title="Couldn’t read this device’s sign-in." action={<Button small onClick={retrySignInSession}>Try again</Button>} />;
  if (!person || (error instanceof LeaveApiError && error.status === 401)) {
    const current = safeSignInNext(over(leavePath, search, ""));
    return <SignInNotice href={`/sign-in?next=${encodeURIComponent(current)}`} again={!!person} />;
  }
  if (error) {
    const title = error instanceof LeaveApiError && error.status === 403 ? "Leave access is unavailable." : "Couldn’t load leave.";
    return <Notice tone="error" title={title} action={<Button small onClick={() => void refresh()}>Try again</Button>} />;
  }
  if (!data) return <LeaveLoading />;
  const switcher = data.isAdmin && (
    <div className={styles.audience}>
      <Segmented label="Whose leave" options={[...audiences]} value={showTeam ? "team" : "mine"} onChange={(value) => {
        if ((value === "team") === showTeam) return;
        const overlays = ["request", "person", "ask", "holidays"];
        const href = value === "team" ? over(leavePath, search, "view=team", overlays) : without(leavePath, search, ["view", ...overlays]);
        router.replace(href, { scroll: false });
      }} />
    </div>
  );
  if (showTeam || !data.summary) {
    return <div className={styles.stack}>
      {switcher}
      {showTeam ? <TeamLeaveScreen key={person.email} email={person.email} /> : (
        <Notice title="Your leave isn’t set up yet.">Ask {data.setupContact ?? "a Leave admin"}.</Notice>
      )}
    </div>;
  }

  return (
    <div className={styles.stack}>
      {switcher}
      <LeaveBalance summary={data.summary} today={data.today} action={
        <Link className={`${buttonStyles.button} ${buttonStyles.main}`} href={over(leavePath, search, "ask=1", ["request"])}
          scroll={false} onNavigate={() => { openedAskHere.current = true; }}>
          <Icon name="plus" size={16} />Ask for leave
        </Link>
      } />
      <section className={styles.records} aria-label={view === "history" ? "History" : "Requests"}>
        <Segmented<LeaveRecordView> label="Leave records" options={[...leaveRecordViews]} value={view} onChange={(value) => {
          const href = value === "history" ? over(leavePath, search, "view=history") : without(leavePath, search, ["view"]);
          router.replace(href, { scroll: false });
        }} />
        {view === "history" ? <LeaveHistory data={data} /> : (
          <LeaveRequests data={data} empty="Requests you make will appear here." navigation={{
            href: (id) => over(leavePath, search, new URLSearchParams({ request: id }).toString()),
            onNavigate: (id) => { openedHere.current = id; },
          }} />
        )}
      </section>
      {asking ? (
        <AskLeaveSheet key={person.email} data={data} email={person.email} onClose={() => closeAsk()} onSent={(message) => {
          sentToast.current = toast(message);
          closeAsk(true);
        }} />
      ) : selected && <RequestSheet key={`${person.email}:${selected.id}`} data={data} request={selected} email={person.email} onClose={closeRequest} />}
    </div>
  );
}

function SignInNotice({ href, again }: { href: string; again: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function signInAgain() {
    setBusy(true);
    setError(false);
    try {
      await signOutDevice();
      window.location.assign(href);
    } catch {
      setError(true);
      setBusy(false);
    }
  }

  return (
    <Notice title="Sign in to see your leave" action={again ? (
      <Button variant="main" small busy={busy} onClick={() => void signInAgain()}>Sign in</Button>
    ) : (
      <Link className={`${buttonStyles.button} ${buttonStyles.main} ${buttonStyles.small}`} href={href}>Sign in</Link>
    )}>
      {error && " Couldn’t reset this device’s sign-in. Try again."}
    </Notice>
  );
}
