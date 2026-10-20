"use client";

// More on phones (guide 3): a short bottom sheet with Plan, Qualification notes, Past clients and Flows, installing,
// and the live status. It opens with ?more=1, so the phone's back gesture closes it.
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Icon from "@/ui/Icon";
import Sheet from "@/ui/Sheet";
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
  const pathname = usePathname();
  const router = useRouter();
  const installed = useInstalled();
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

  return (
    <Sheet open={open} onClose={close} title="More" short phoneOnly initialFocus="a">
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
    </Sheet>
  );
}
