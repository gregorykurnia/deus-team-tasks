import { collection, getDocsFromServer, query, where } from "firebase/firestore";
import { requestCalendarSync } from "./calendarRequests";
import { db } from "./firebase";

// Renames change event descriptions without changing the dependent tasks. Keep both the lookup and the sync off
// the save's critical path; a failed lookup leaves the existing stale status and Try again available.
export async function requestCalendarContextSync(field: "parentId" | "linkedClientId", value: string | number): Promise<void> {
  try {
    const snapshot = await getDocsFromServer(query(collection(db, "tasks"), where(field, "==", value)));
    requestCalendarSync(snapshot.docs.filter((task) => task.data().calendar).map((task) => task.id));
  } catch {
    // Calendar work must never fail a saved rename or its Undo/rollback.
  }
}
