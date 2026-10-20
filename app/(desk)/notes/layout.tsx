import { Suspense, type ReactNode } from "react";
import PageHeader from "@/desk/PageHeader";
import NotesScreen from "@/features/notes/NotesScreen";

// The list and the open prospect are one screen, kept across /notes and /notes/<id>, so choosing a prospect doesn't
// start the screen over. It reads its view from the address, which only the browser knows: the server renders the title.
export default function NotesLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Suspense fallback={<PageHeader title="Qualification notes" />}>
        <NotesScreen />
      </Suspense>
      {children}
    </>
  );
}
