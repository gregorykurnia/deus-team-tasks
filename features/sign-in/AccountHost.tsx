"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { over } from "@/desk/areas";
import { useOverParam } from "@/desk/useOverParam";
import { signInEnabled } from "@/lib/flags";
import { signOutDevice, useSignedIn } from "@/lib/useSignedIn";
import type { SignedInPerson } from "@/lib/signInClient";
import Avatar from "@/ui/Avatar";
import Button from "@/ui/Button";
import { useNotifications } from "@/lib/useNotifications";
import Notice from "@/ui/Notice";
import Sheet from "@/ui/Sheet";
import { useToast } from "@/ui/Toaster";
import styles from "./Account.module.css";
import { dismissSignInNotice } from "./signInNotice";
import { NotificationPerks, NotificationTestButton } from "./NotificationsHost";
import { buttonClass } from "@/ui/Button";

export default function AccountHost() {
  const { open, close } = useOverParam("account");
  const person = useSignedIn();
  useEffect(() => { if (open) dismissSignInNotice(); }, [open]);
  return signInEnabled() && open ? <AccountSheet person={person} close={close} /> : null;
}

function AccountSheet({ person, close }: { person: SignedInPerson | null; close: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const mounted = useRef(true);
  const toast = useToast();
  const state = useNotifications();
  const pathname = usePathname(), search = useSearchParams();
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  async function leave() {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError("");
    try {
      await signOutDevice();
      if (mounted.current) { toast("Signed out"); close(); }
    } catch {
      if (mounted.current) setError("Couldn’t sign out. Try again.");
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  if (!person) return null;
  return <Sheet open onClose={close} title={person.name} lead={<Avatar name={person.name} size="plan" />} meta={<span className={styles.email}>{person.email}</span>} short size="narrow">
    <div className={styles.account}>
      <div className={styles.card}>
        <span className={styles.label}>Notifications on this {state.apple ? "iPhone" : "device"}</span>
        <div className={styles.cardRow}>
          <b className={state.kind === "on" ? styles.on : styles.off}><i />{state.kind === "on" ? "On" : state.kind === "checking" ? "Checking…" : state.kind === "blocked" ? "Blocked" : "Off"}</b>
          {state.kind === "on" ? <NotificationTestButton disabled={busy} /> : <Link aria-disabled={busy || undefined} onClick={(event) => { if (busy) event.preventDefault(); }} className={buttonClass()} href={over(pathname, search, "notifications=1", ["account", "more", "install"])}>Turn on notifications</Link>}
        </div>
      </div>
      {state.error && <Notice tone="error">{state.error}</Notice>}
      <NotificationPerks />
      {error && <Notice tone="error">{error}</Notice>}
      <Button onClick={() => void leave()} busy={busy} busyLabel="Signing out…">Sign out</Button>
      <p className={styles.signOutHint}>Signing out stops notifications on this {state.apple ? "iPhone" : "device"}.</p>
    </div>
  </Sheet>;
}
