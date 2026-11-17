"use client";

import { useEffect, useRef, useState } from "react";
import { useOverParam } from "@/desk/useOverParam";
import { signInEnabled } from "@/lib/flags";
import { signOutDevice, useSignedIn } from "@/lib/useSignedIn";
import type { SignedInPerson } from "@/lib/signInClient";
import Avatar from "@/ui/Avatar";
import Button from "@/ui/Button";
import Icon from "@/ui/Icon";
import Notice from "@/ui/Notice";
import Sheet from "@/ui/Sheet";
import { useToast } from "@/ui/Toaster";
import styles from "./Account.module.css";
import { dismissSignInNotice } from "./signInNotice";

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
      {/* A5 inserts the notification card here, and adds device removal before sign-out. */}
      <div className={styles.perks}>
        <div><Icon name="plus" size={20} /><span><b>New task for you</b><small>Right away, when someone makes you Responsible.</small></span></div>
        <div><Icon name="sun" size={20} /><span><b>Morning summary</b><small>09:00, Monday to Friday. Skipped when nothing is late or due.</small></span></div>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      <Button onClick={() => void leave()} busy={busy} busyLabel="Signing out…">Sign out</Button>
    </div>
  </Sheet>;
}
