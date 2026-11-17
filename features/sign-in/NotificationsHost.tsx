"use client";

import { useEffect, useRef } from "react";
import { useInstalled } from "@/desk/useInstalled";
import { useOverParam } from "@/desk/useOverParam";
import { signInEnabled } from "@/lib/flags";
import { notifications, useNotifications } from "@/lib/useNotifications";
import { useSignedIn } from "@/lib/useSignedIn";
import Button from "@/ui/Button";
import Icon from "@/ui/Icon";
import Notice from "@/ui/Notice";
import Sheet from "@/ui/Sheet";
import { useScopedToast } from "@/ui/Toaster";
import HomeScreenSteps from "./HomeScreenSteps";
import { dismissSignInNotice } from "./signInNotice";
import styles from "./Account.module.css";
import signInStyles from "./SignIn.module.css";

export default function NotificationsHost() {
  return signInEnabled() ? <Host /> : null;
}

function Host() {
  const person = useSignedIn();
  const installed = useInstalled();
  const { open, close } = useOverParam("notifications");
  useEffect(() => {
    notifications.activate(person?.email ?? null);
    void notifications.refresh();
    const refresh = () => { if (document.visibilityState !== "hidden") void notifications.refresh(); };
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh); window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [person?.email, installed]);
  useEffect(() => {
    if (open) { dismissSignInNotice(); void notifications.refresh(); }
  }, [open]);
  return person && open ? <NotificationsSheet close={close} /> : null;
}

export function NotificationPerks({ setup = false }: { setup?: boolean }) {
  return <div className={styles.perks}>
    <div><Icon name="plus" size={20} /><span><b>New task for you</b><small>Right away, when someone makes you Responsible{setup ? " for a task" : ""}.</small></span></div>
    <div><Icon name="sun" size={20} /><span><b>Morning summary</b><small>{setup ? "09:00, Monday to Friday: what’s late, due today and due tomorrow." : "09:00, Monday to Friday. Skipped when nothing is late or due."}</small></span></div>
  </div>;
}

export function NotificationTestButton({ disabled = false }: { disabled?: boolean }) {
  const state = useNotifications(), toast = useScopedToast();
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  async function send() {
    if (await notifications.sendTest() && mounted.current) toast("Test sent. It should arrive in a few seconds.");
  }
  return <Button disabled={disabled || !!state.busy && state.busy !== "test"} busy={state.busy === "test"} busyLabel="Sending…" onClick={() => void send()}>Send a test</Button>;
}

function NotificationsSheet({ close }: { close: () => void }) {
  const state = useNotifications();
  const { kind, apple } = state;
  return <Sheet open onClose={close} title="Turn on notifications" size="narrow" short>
    <div className={styles.account}>
      {kind === "checking" && <Notice>Checking notifications…</Notice>}
      {kind === "old" && <>
        <Notice title={apple ? "Older iPhone or iPad?" : "This browser can’t receive notifications."}>
          {apple ? "Notifications need iOS 16.4 or later. Update in Settings › General › Software Update." : "Open DEUS Space in a current version of Chrome, Edge, Firefox or Safari."}
        </Notice>
        <Button onClick={close}>Done</Button>
      </>}
      {kind === "install" && <>
        <Notice icon="phone" title="Add DEUS Space to your Home Screen first.">On iPhone, notifications only work in the app on your Home Screen.</Notice>
        <HomeScreenSteps />
        <p className={styles.hint}>The Home Screen app keeps its own sign-in, so you’ll get one more code there.</p>
        <Button onClick={close}>Done</Button>
      </>}
      {kind === "blocked" && <>
        <Notice tone="warning" icon="bell" title="Notifications are blocked for DEUS Space.">{apple ? "iPhone only asks once." : "Allow them in your browser’s site settings."}</Notice>
        {apple ? <ol className={signInStyles.steps}>
          <li><span>Open iPhone <b>Settings</b>.</span></li>
          <li><span>Tap <b>Notifications</b>, then <b>DEUS Space</b>.</span></li>
          <li><span>Turn on <b>Allow Notifications</b>, then come back here.</span></li>
        </ol> : <p className={styles.hint}>Open the controls beside the address bar, allow notifications for this site, then come back here.</p>}
        <Button busy={state.busy === "check"} busyLabel="Checking…" onClick={() => void notifications.refresh()}>Check again</Button>
      </>}
      {kind === "on" && <>
        <Notice tone="success" title={`Notifications are on for this ${apple ? "iPhone" : "device"}.`}>Send a test to check one arrives.</Notice>
        <NotificationTestButton />
        <Button variant="main" onClick={close}>Done</Button>
      </>}
      {kind === "off" && <>
        <span className={styles.badge}><Icon name="bell" size={28} /></span>
        <NotificationPerks setup />
        <Button variant="main" busy={state.busy === "turnOn"} busyLabel="Turning on…" disabled={!!state.busy && state.busy !== "turnOn"} onClick={() => void notifications.turnOn()}>Turn on notifications</Button>
        <Button variant="quiet" onClick={close}>Not now</Button>
      </>}
      {state.error && <Notice tone="error">{state.error}</Notice>}
    </div>
  </Sheet>;
}
