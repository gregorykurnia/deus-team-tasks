"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { over, without } from "@/desk/areas";
import { signInEnabled } from "@/lib/flags";
import { safeSignInNext } from "@/lib/signInClient";
import { useSignInSession } from "@/lib/useSignedIn";
import Avatar from "@/ui/Avatar";
import Icon from "@/ui/Icon";
import styles from "./Account.module.css";
import { dismissSignInNotice } from "./signInNotice";

export default function AccountEntry({ more = false, onClick }: { more?: boolean; onClick?: () => void }) {
  if (!signInEnabled()) return null;
  return <Suspense><Entry more={more} onClick={onClick} /></Suspense>;
}

function Entry({ more, onClick }: { more: boolean; onClick?: () => void }) {
  const { person, ready } = useSignInSession();
  const pathname = usePathname();
  const search = useSearchParams();
  useEffect(() => { if (more) dismissSignInNotice(); }, [more]);
  if (!ready) return null;
  const next = safeSignInNext(without(pathname, search, ["more", "account", "install"]));
  const href = person ? over(pathname, search, "account=1", ["more", "install"]) : `/sign-in?next=${encodeURIComponent(next)}`;
  return <Link href={href} replace={more} onClick={onClick} className={`${styles.entry} ${more ? styles.more : styles.side}`}>
    {person ? <Avatar name={person.name} /> : <Icon name="people" size={more ? 20 : 16} />}
    <span className={styles.identity}><b>{person ? person.name : "Sign in"}</b>{(person || more) && <small>{person ? person.email : "Get notifications about your tasks"}</small>}</span>
    {more && <Icon name="right" size={16} />}
  </Link>;
}
