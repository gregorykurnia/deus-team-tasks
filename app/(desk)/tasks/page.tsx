import { Suspense } from "react";
import PageHeader from "@/desk/PageHeader";
import TasksScreen from "@/features/tasks/TasksScreen";

// The screen reads its view from the address, which only the browser knows: the server renders the title.
export default function Page() {
  return (
    <Suspense fallback={<PageHeader title="Tasks" />}>
      <TasksScreen />
    </Suspense>
  );
}
