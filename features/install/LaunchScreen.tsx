"use client";

// The launch screen of the installed app (A2, guide 6.9): the backdrop, the icon and the name, for the moment the
// app opens, then Today. It is in the page the server sends, so it is the first thing painted, and it exists only in
// an installed app (the style hides it everywhere else). The android launch screen before it comes from the
// manifest; this one covers iPhone, which has none of its own.
import Image from "next/image";
import { useEffect, useState } from "react";
import styles from "./LaunchScreen.module.css";

export default function LaunchScreen() {
  const [phase, setPhase] = useState<"showing" | "leaving" | "gone">("showing");

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const leave = requestAnimationFrame(() => setPhase(reduce ? "gone" : "leaving"));
    const gone = setTimeout(() => setPhase("gone"), reduce ? 0 : 260);
    return () => {
      cancelAnimationFrame(leave);
      clearTimeout(gone);
    };
  }, []);

  if (phase === "gone") return null;
  return (
    <div className={`${styles.launch} ${phase === "leaving" ? styles.leaving : ""}`} aria-hidden="true" data-testid="launch-screen">
      <Image className={styles.icon} src="/icon-192x192.png" alt="" width={84} height={84} priority unoptimized />
      <b className={styles.name}>DEUS Team Space</b>
    </div>
  );
}
