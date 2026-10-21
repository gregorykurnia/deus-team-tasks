"use client";

// Under a search in All tasks: the companies and qualification notes that mention the same words (N3, provisional). Today's
// search covers all three, but only tasks have results designed, so the other two are one link away.
import Link from "next/link";
import { useMemo } from "react";
import { useCompanies, useNotes } from "@/desk/DeskData";
import { alsoFound, companiesFound, notesFound } from "@/lib/alsoFound";
import styles from "./Tasks.module.css";

export default function AlsoFound({ query }: { query: string }) {
  const companies = useCompanies();
  const notes = useNotes();
  const found = useMemo(() => alsoFound(query, companies.rows, notes.rows), [query, companies.rows, notes.rows]);
  if (!found) return null;
  const q = encodeURIComponent(query.trim());
  return (
    <p className={styles.alsoFound} role="status">
      Also mentioned in
      {found.companies > 0 && (
        <Link href={found.companiesHref} className={styles.linkButton}>
          {companiesFound(found.companies)}
        </Link>
      )}
      {found.companies > 0 && found.notes > 0 && " and"}
      {found.notes > 0 && (
        <Link href={`/notes?q=${q}`} className={styles.linkButton}>
          {notesFound(found.notes)}
        </Link>
      )}
    </p>
  );
}
