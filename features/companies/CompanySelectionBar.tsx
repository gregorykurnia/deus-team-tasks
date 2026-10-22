"use client";

// The selection bar on Active (N20), the tasks' one (guide 4.7) with the company actions: how many are chosen,
// "Select all 42", then Park (Bring back among parked companies) and a close ×. While it shows, the body carries
// data-selecting, so the tab bar steps aside and toasts sit above it.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ParkMenu from "@/features/tasks/ParkMenu";
import { plural } from "@/lib/dates";
import Button from "@/ui/Button";
import Icon from "@/ui/Icon";
import Spinner from "@/ui/Spinner";
import { useIsClient } from "@/ui/useIsClient";
import { COMPANY_PARK_MENU } from "./useCompanyActions";
import styles from "@/features/tasks/SelectionBar.module.css";

interface CompanySelectionBarProps {
  line: string; // "3 selected"
  offer: number | null; // "Select all 42"
  chosen: number;
  parked: boolean; // among parked companies the action is Bring back
  today: string;
  busy: boolean;
  onSelectAll: () => void;
  onPark: (until: string | null) => void;
  onBringBack: () => void;
  onStop: () => void;
}

export default function CompanySelectionBar(props: CompanySelectionBarProps) {
  const client = useIsClient();
  useEffect(() => {
    document.body.dataset.selecting = "";
    return () => {
      delete document.body.dataset.selecting;
    };
  }, []);
  if (!client) return null;
  return createPortal(<Bar {...props} />, document.body);
}

function Bar({ line, offer, chosen, parked, today, busy, onSelectAll, onPark, onBringBack, onStop }: CompanySelectionBarProps) {
  const [parking, setParking] = useState(false);
  const parkRef = useRef<HTMLButtonElement>(null);
  return (
    <div className={styles.bar} role="region" aria-label="Selected companies">
      <div className={styles.count}>
        <b role="status">{line}</b>
        {offer !== null && (
          <button type="button" className={styles.all} onClick={onSelectAll} disabled={busy}>
            Select all {offer.toLocaleString("en-GB")}
          </button>
        )}
      </div>
      <div className={styles.actions}>
        <button
          ref={parkRef}
          type="button"
          className={styles.action}
          disabled={chosen === 0}
          aria-disabled={(busy && chosen > 0) || undefined}
          aria-busy={busy || undefined}
          aria-haspopup={parked ? undefined : "menu"}
          aria-expanded={parked ? undefined : parking}
          onClick={() => !busy && (parked ? onBringBack() : setParking(true))}
        >
          {busy ? <Spinner /> : <Icon name={parked ? "undo" : "pause"} size={17} />}
          <span>{parked ? "Bring back" : "Park"}</span>
        </button>
      </div>
      <Button variant="icon" aria-label="Stop selecting" title="Stop selecting (Esc)" onClick={onStop} disabled={busy}>
        <Icon name="x" size={18} />
      </Button>
      <ParkMenu
        open={parking}
        anchorRef={parkRef}
        onClose={() => setParking(false)}
        count={chosen}
        today={today}
        onPark={onPark}
        alignRight
        heading={chosen === 1 ? COMPANY_PARK_MENU.heading : `Park ${plural(chosen, "company", "companies")}`}
        foot={COMPANY_PARK_MENU.foot}
      />
    </div>
  );
}
