"use client";

// More on phones (guide 3): a bottom sheet with Plan, Qualification notes, Past
// clients and Flows, installing, and the live status. It opens with ?more=1, so
// the phone's back gesture closes it. Task 2.5's Sheet takes over the frame.
import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Icon from "@/ui/Icon";
import { areaOf, MORE_AREAS, over } from "./areas";
import LiveDot from "./LiveDot";
import { useInstalled } from "./useInstalled";
import styles from "./MoreSheet.module.css";

// Set when the tab bar pushed ?more=1, so closing can step back instead of
// leaving an entry that opens More again.
let openedHere = false;
export function markMoreOpenedHere() {
  openedHere = true;
}

export default function MoreSheet() {
  const open = useSearchParams().get("more") === "1";
  return open ? <MoreSheetOpen /> : null;
}

function MoreSheetOpen() {
  const pathname = usePathname();
  const router = useRouter();
  const installed = useInstalled();
  const sheet = useRef<HTMLElement>(null);
  const area = areaOf(pathname);

  function close() {
    const back = openedHere;
    openedHere = false;
    if (back) router.back();
    else router.replace(pathname, { scroll: false });
  }
  // A link replaces the ?more=1 entry, so back skips the sheet.
  const forget = () => {
    openedHere = false;
  };
  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  });

  // Focus moves in and stays in; Esc closes; focus goes back to More afterwards.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const el = sheet.current!;
    el.querySelector<HTMLElement>("a")?.focus(); // the first area, as in the prototype
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        closeRef.current();
      } else if (e.key === "Tab") {
        const items = [...el.querySelectorAll<HTMLElement>("a, button")];
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      const lost = !document.activeElement || document.activeElement === document.body || el.contains(document.activeElement);
      if (lost && opener?.isConnected) opener.focus();
    };
  }, []);

  return (
    <>
      <div className={styles.scrim} onClick={close} aria-hidden="true" />
      <section ref={sheet} className={styles.sheet} role="dialog" aria-modal="true" aria-labelledby="more-title">
        <span className={styles.grab} aria-hidden="true" />
        <div className={styles.head}>
          <h2 id="more-title">More</h2>
          <button className={styles.close} type="button" onClick={close} aria-label="Close">
            <Icon name="x" />
          </button>
        </div>
        <div className={styles.body}>
          <ul className={styles.list}>
            {MORE_AREAS.map((a) => (
              <li key={a.id}>
                <Link className={styles.link} href={a.href} replace onClick={forget} aria-current={area === a.id ? "page" : undefined}>
                  <Icon name={a.icon} size={20} />
                  <span>
                    {a.label}
                    <small>{a.blurb}</small>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {!installed && (
            <Link className={styles.install} href={over(pathname, "install=1")} replace onClick={forget}>
              <Icon name="install" size={20} />
              <span>
                Install on this phone
                <small>Opens from your home screen, even with no connection</small>
              </span>
              <Icon name="right" />
            </Link>
          )}
          <div className={styles.live}>
            <LiveDot />
          </div>
        </div>
      </section>
    </>
  );
}
